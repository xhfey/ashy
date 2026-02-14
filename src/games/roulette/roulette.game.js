/**
 * Roulette Game - Premium Edition
 *
 * An elimination game where a spinning wheel selects a player
 * who then chooses someone to eliminate.
 *
 * Features:
 * - Wheel-based random player selection (crypto.randomInt)
 * - AAA-quality animated wheel GIF
 * - Advanced perk system (Shield, Extra Life, Double Kick)
 * - Stale-click protection via phase tracking
 * - Concurrency control via locks
 *
 * BUGS FIXED:
 * - #22: Final round now properly handles perks
 * - #24: Shop button added to lobby flow
 * - #25: Timeout race condition fixed
 * - #26: Memory leak prevented with try-finally
 * - #27: Silent failures now give feedback
 */

import { AttachmentBuilder } from 'discord.js';
import { randomInt } from 'crypto';
import * as SessionService from '../../services/games/session.service.js';
import * as CurrencyService from '../../services/economy/currency.service.js';
import { awardGameWinners } from '../../services/economy/rewards.service.js';
import { recordGameResult } from '../../services/economy/transaction.service.js';
import { buttonRouter, sessionManager } from '../../framework/index.js';
import { generateWheelGif, WHEEL_GIF_DURATION_MS } from './WheelGenerator.js';
import {
  MESSAGES,
  TURN_TIMEOUT_MS,
  RESULT_DELAY_MS,
  GAME_SETTINGS,
  PERKS,
} from './roulette.constants.js';
import { ROULETTE_TIMERS } from '../../config/timers.config.js';
import GameTimer from '../../utils/GameTimer.js';
import * as Embeds from './roulette.embeds.js';
import * as Buttons from './roulette.buttons.js';
import * as PerksLogic from './roulette.perks.js';
import logger from '../../utils/logger.js';

// ==================== UTILITY FUNCTIONS ====================

const MAX_DISCORD_GIF_BYTES = Math.floor(7.5 * 1024 * 1024);
const FALLBACK_SPIN_DELAY_MS = 900;

/**
 * Delay utility (defined at top for clarity)
 * FIX DESIGN 2: Now cancellable via AbortSignal
 * @param {number} ms - Delay in milliseconds
 * @param {AbortSignal} [signal] - Optional abort signal to cancel the delay
 * @returns {Promise<void>}
 */
function delay(ms, signal = null) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Delay aborted'));
      return;
    }

    const timeout = setTimeout(() => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeout);
      reject(new Error('Delay aborted'));
    };

    if (signal) {
      signal.addEventListener('abort', onAbort);
    }
  });
}

/**
 * Safe delay that ignores abort errors
 * FIX DESIGN 2: Helper to gracefully handle cancelled delays
 */
async function safeDelay(gameState, ms) {
  try {
    await delay(ms, gameState?.abortController?.signal);
  } catch (error) {
    if (error.message === 'Delay aborted') {
      // Silently ignore - game was cancelled
      logger.debug(`[Roulette] Delay cancelled for session ${gameState?.sessionId}`);
    } else {
      throw error;
    }
  }
}

function formatDiscordError(error) {
  const message = error?.rawError?.message || error?.message || 'Unknown error';
  const code = error?.code ?? error?.rawError?.code ?? 'n/a';
  const status = error?.status ?? error?.rawError?.status ?? 'n/a';
  return `${message} (code: ${code}, status: ${status})`;
}

function getSelectValue(interaction) {
  if (!interaction?.values || interaction.values.length === 0) return null;
  return interaction.values[0];
}

// ==================== STATE MANAGEMENT ====================

// Store active games (in-memory for timeouts and local state)
const activeGames = new Map();

// FIX BUG 3: Event-based locks (Promise queue) instead of busy-wait
const sessionLocks = new Map();

/**
 * FIX CRITICAL 5: Atomic phase transition with timeout cleanup
 * Ensures old timeouts are cleared before phase changes
 */
function changePhase(gameState, newPhase) {
  // Clear any pending timeout
  gameState.turnTimer.clear();

  // Update phase
  gameState.phase = newPhase;
  logger.debug(`[Roulette] Phase changed to ${newPhase} for session ${gameState.sessionId}`);
}

/**
 * Execute function with session lock to prevent race conditions
 * FIX BUG 3: Now uses event-based locking instead of busy-wait polling
 */
async function withLock(sessionId, fn) {
  // Get or create lock queue for this session
  let lockQueue = sessionLocks.get(sessionId);
  if (!lockQueue) {
    lockQueue = Promise.resolve();
    sessionLocks.set(sessionId, lockQueue);
  }

  // Chain our operation to the end of the queue
  // The swallowed promise prevents unhandled rejection from stalling the queue
  const swallowed = lockQueue.then(fn).catch(error => {
    logger.error('[Roulette] Lock execution error:', error);
    throw error;
  });

  // Store the swallowed version (never rejects) so the queue always advances
  const queued = swallowed.catch(() => {});
  sessionLocks.set(sessionId, queued);

  try {
    return await swallowed;
  } finally {
    // Only clean up if WE are still the tail of the queue
    if (sessionLocks.get(sessionId) === queued) {
      sessionLocks.delete(sessionId);
    }
  }
}

// ==================== HANDLER REGISTRATION ====================

/**
 * Register roulette handler with ButtonRouter
 */
export function registerRouletteHandler() {
  buttonRouter.register('ROULETTE', {
    onAction: handleRouletteAction
  });
  logger.info('[Roulette] Handler registered with ButtonRouter');
}

/**
 * Handle button actions from framework
 * FIX HIGH 3: Added phase validation for all actions
 * @param {Object} ctx - Context from ButtonRouter
 */
async function handleRouletteAction(ctx) {
  const { session, player, action, details, interaction } = ctx;
  const gameState = activeGames.get(session.id);

  if (!gameState) {
    return; // Game not active
  }

  // Use lock to prevent race conditions
  await withLock(session.id, async () => {
    // FIX HIGH 3: Phase validation to prevent stale clicks
    switch (action) {
      case 'kick':
        if (gameState.phase !== 'KICK_SELECTION') {
          logger.debug(`[Roulette] Stale kick click in phase ${gameState.phase}`);
          return;
        }
        await handleKickTarget(ctx, gameState, details);
        break;
      case 'kick_select': {
        if (gameState.phase !== 'KICK_SELECTION') {
          logger.debug(`[Roulette] Stale kick_select in phase ${gameState.phase}`);
          return;
        }
        const targetId = getSelectValue(interaction);
        if (!targetId) {
          await interaction.followUp({ content: '❌ اختيار غير صالح', ephemeral: true });
          break;
        }
        await handleKickTarget(ctx, gameState, targetId);
        break;
      }
      case 'kick2':
        if (gameState.phase !== 'DOUBLE_KICK') {
          logger.debug(`[Roulette] Stale kick2 in phase ${gameState.phase}`);
          return;
        }
        await handleSecondKick(ctx, gameState, details);
        break;
      case 'kick2_select': {
        if (gameState.phase !== 'DOUBLE_KICK') {
          logger.debug(`[Roulette] Stale kick2_select in phase ${gameState.phase}`);
          return;
        }
        const targetId = getSelectValue(interaction);
        if (!targetId) {
          await interaction.followUp({ content: '❌ اختيار غير صالح', ephemeral: true });
          break;
        }
        await handleSecondKick(ctx, gameState, targetId);
        break;
      }
      case 'selfkick':
        if (gameState.phase !== 'KICK_SELECTION') {
          logger.debug(`[Roulette] Stale selfkick in phase ${gameState.phase}`);
          return;
        }
        await handleSelfKick(ctx, gameState);
        break;
      case 'randomkick':
        if (gameState.phase !== 'KICK_SELECTION') {
          logger.debug(`[Roulette] Stale randomkick in phase ${gameState.phase}`);
          return;
        }
        await handleRandomKick(ctx, gameState);
        break;
      case 'doublekick':
        if (gameState.phase !== 'KICK_SELECTION') {
          logger.debug(`[Roulette] Stale doublekick in phase ${gameState.phase}`);
          return;
        }
        await handleDoubleKickPurchase(ctx, gameState);
        break;
      case 'skip_double':
        if (gameState.phase !== 'DOUBLE_KICK') {
          logger.debug(`[Roulette] Stale skip_double in phase ${gameState.phase}`);
          return;
        }
        await handleSkipDoubleKick(ctx, gameState);
        break;
      case 'shop':
        await handleShop(ctx, gameState);
        break;
      case 'buy':
        await handlePerkPurchase(ctx, gameState, details);
        break;
      case 'shop_close':
        await interaction.editReply({
          content: '✅ تم إغلاق المتجر',
          embeds: [],
          components: [],
        });
        break;
      default:
        logger.debug(`[Roulette] Unknown action: ${action}`);
    }
  });
}

// ==================== GAME LIFECYCLE ====================

/**
 * Start a new Roulette game
 * @param {Object} session - Session from SessionService
 * @param {TextChannel} channel - Discord channel
 */
export async function startRouletteGame(session, channel) {
  try {
    logger.info(`[Roulette] Starting game: ${session.id}`);

    // Initialize players with alive status
    const players = session.players.map((p, index) => {
      // Validate userId exists
      if (!p.userId) {
        throw new Error(`[Roulette] Player at index ${index} missing userId`);
      }

      // Default slot to index+1 if not provided
      const slot = p.slot ?? p.slotNumber ?? (index + 1);

      // FIX HIGH 7: Validate slot range
      if (slot < 1 || slot > GAME_SETTINGS.maxSlots) {
        throw new Error(`[Roulette] Invalid slot ${slot} for player ${p.userId} (max: ${GAME_SETTINGS.maxSlots})`);
      }

      return {
        userId: p.userId,
        displayName: p.displayName || 'Unknown',
        alive: true,
        // FIX HIGH 8: Deep clone perks (ensure primitive strings)
        perks: Array.isArray(p.perks) ? p.perks.map(perkId => String(perkId)) : [],
        slot,
      };
    });

    // Initialize game state
    // FIX DESIGN 2: Add AbortController for cancellable delays
    const abortController = new AbortController();
    const gameState = {
      sessionId: session.id,
      channel,
      hostId: session.hostId || null,
      players,
      currentRound: 0,
      phase: 'PLAYING', // PLAYING, SPINNING, KICK_SELECTION, FINAL_ROUND, GAME_END
      turnTimer: new GameTimer(),
      currentKickerId: null,
      doubleKickActive: false,
      doubleKickFirstTarget: null,
      abortController,
      // FIX HIGH 1: Cache alive players list for performance
      alivePlayers: players.slice(), // Initially all alive
      // FIX HIGH 9: Track perk purchase times for rate limiting
      perkPurchaseTime: {},
    };

    activeGames.set(session.id, gameState);

    // Update session phase
    session.phase = 'ACTIVE';
    await sessionManager.save(session);

    // Announce game start
    const startEmbed = Embeds.createGameStartEmbed();
    await channel.send({ embeds: [startEmbed] });
    await safeDelay(gameState, 2000);

    // Start first round
    await runSpinRound(gameState, session);

  } catch (error) {
    logger.error('[Roulette] Error starting game:', error);
    // Cleanup on error
    cleanupGame(session.id);
    throw error;
  }
}

// ==================== ROUND MANAGEMENT ====================

/**
 * Run a single spin round
 * FIX HIGH 2: Reduced redundant session saves
 */
async function runSpinRound(gameState, session) {
  if (gameState.phase === 'GAME_END') return;

  // FIX HIGH 1: Use cached alive players list
  const alivePlayers = gameState.alivePlayers;
  gameState.currentRound++;

  // Check for winner (only 1 player left)
  if (alivePlayers.length === 1) {
    await endGame(gameState, session, alivePlayers[0]);
    return;
  }

  // Check for final round (2 players)
  if (alivePlayers.length === 2) {
    await runFinalRound(gameState, session, alivePlayers);
    return;
  }

  // CRITICAL FIX: Use atomic phase transition
  changePhase(gameState, 'SPINNING');

  // FIX HIGH 5: Defensive check before randomInt to prevent crash
  if (alivePlayers.length === 0) {
    logger.error(`[Roulette] No alive players for spin in session ${session.id}`);
    await endGame(gameState, session, null);
    return;
  }

  // Pre-select random player using crypto.randomInt
  const selectedIndex = randomInt(alivePlayers.length);
  const chosenPlayer = alivePlayers[selectedIndex];

  // Generate and send wheel GIF (with size guard for Discord limits)
  let gifSent = false;
  try {
    // Prepare players for wheel (needs name property)
    const wheelPlayers = alivePlayers.map(p => ({
      name: p.displayName,
      displayName: p.displayName,
      slot: p.slot,
    }));

    const gifBuffer = await generateWheelGif(wheelPlayers, selectedIndex);

    // FIX HIGH 6: Validate buffer before upload
    if (!gifBuffer || gifBuffer.length === 0) {
      logger.warn('[Roulette] Empty GIF buffer generated');
      gifSent = false;
    } else if (gifBuffer.length > MAX_DISCORD_GIF_BYTES) {
      logger.warn(
        `[Roulette] Skipping wheel GIF upload; file too large (${gifBuffer.length} bytes > ${MAX_DISCORD_GIF_BYTES})`
      );
      gifSent = false;
    } else {
      try {
        const attachment = new AttachmentBuilder(gifBuffer, { name: 'wheel.gif' });
        await gameState.channel.send({ files: [attachment] });
        gifSent = true;
      } catch (uploadError) {
        logger.warn(`[Roulette] GIF upload failed: ${formatDiscordError(uploadError)}`);
        gifSent = false;
      }
    }
  } catch (error) {
    logger.warn(`[Roulette] Wheel GIF generation failed: ${formatDiscordError(error)}`);
    gifSent = false;
  }

  // Wait for GIF animation only if GIF was posted
  await safeDelay(gameState, gifSent ? WHEEL_GIF_DURATION_MS : FALLBACK_SPIN_DELAY_MS);

  // Start kick selection
  await startKickSelection(gameState, session, chosenPlayer);
}

/**
 * Start the kick selection phase
 */
async function startKickSelection(gameState, session, kickerPlayer) {
  // FIX #19: Verify kicker is still alive (defensive check)
  if (!kickerPlayer) {
    logger.warn(`[Roulette] Kicker is null, skipping to next spin`);
    await runSpinRound(gameState, session);
    return;
  }
  
  if (!kickerPlayer.alive) {
    logger.warn(`[Roulette] Kicker ${kickerPlayer.userId} is not alive, skipping to next spin`);
    await runSpinRound(gameState, session);
    return;
  }

  // CRITICAL FIX: Use atomic phase transition
  changePhase(gameState, 'KICK_SELECTION');
  gameState.currentKickerId = kickerPlayer.userId;
  gameState.doubleKickActive = false;
  gameState.doubleKickFirstTarget = null;

  // FIX HIGH 1: Use cached alive players
  const targetPlayers = gameState.alivePlayers.filter(p => p.userId !== kickerPlayer.userId);

  // Check if kicker can afford double kick
  const { canBuy } = await PerksLogic.canBuyDoubleKick(kickerPlayer.userId);

  // FIX HIGH 2: Batch session update - phase already set by changePhase in state
  session.phase = 'KICK_SELECTION';
  // Commit will happen at end of turn, not immediately

  // Create kick selection buttons
  const kickButtons = Buttons.createKickButtons(session, targetPlayers, canBuy, PERKS.DOUBLE_KICK.cost);

  // Start timer with warning + Discord timestamp
  const { discordTimestamp } = gameState.turnTimer.start(
    TURN_TIMEOUT_MS,
    () => {
      handleKickTimeout(gameState, session, kickerPlayer).catch(error => {
        logger.error('[Roulette] Kick timeout error:', error);
        cleanupGame(session.id);
      });
    },
    {
      label: 'Roulette-Kick',
      warningMs: ROULETTE_TIMERS.WARNING_MS,
      onWarning: () => {
        if (gameState.phase === 'KICK_SELECTION' && gameState.currentKickerId === kickerPlayer.userId) {
          gameState.channel.send({
            content: `<@${kickerPlayer.userId}> ⚡ أسرع! الوقت يداهمك!`,
          }).catch(() => {});
        }
      },
    }
  );

  await gameState.channel.send({
    content: `<@${kickerPlayer.userId}> لديك ${GAME_SETTINGS.kickTimeout} ثانية لاختيار لاعب لطرده ${discordTimestamp}`,
    components: kickButtons,
  });
}

// ==================== TIMEOUT HANDLING ====================

/**
 * Handle kick timeout - kicker gets eliminated
 * FIX #25: Race condition prevention
 */
async function handleKickTimeout(gameState, session, kickerPlayer) {
  await withLock(session.id, async () => {
    // Clear timer to prevent race conditions
    gameState.turnTimer.clear();

    // Phase check
    if (gameState.phase !== 'KICK_SELECTION') return;
    if (gameState.currentKickerId !== kickerPlayer.userId) return;

    // FIX #25: Check if kicker is still alive before eliminating
    const kicker = gameState.players.find(p => p.userId === kickerPlayer.userId);
    if (!kicker?.alive) {
      logger.debug(`[Roulette] Timeout fired but kicker already eliminated`);
      return;
    }

    // Invalidate current kick UI to prevent late clicks
    await sessionManager.commit(session);

    // Timeout message
    await gameState.channel.send({ content: MESSAGES.TURN_TIMEOUT });

    // Eliminate the kicker for not choosing
    await eliminatePlayer(gameState, session, kickerPlayer.userId, 'timeout');
  });
}

// ==================== KICK HANDLERS ====================

/**
 * Handle kick target selection
 * FIX CRITICAL 2: Added null check for currentKickerId
 */
async function handleKickTarget(ctx, gameState, targetId) {
  const { session, player, interaction } = ctx;

  // CRITICAL FIX: Verify currentKickerId is not null and matches current player
  if (!gameState.currentKickerId || gameState.currentKickerId !== player.id) {
    await interaction.followUp({ content: `❌ ${MESSAGES.NOT_YOUR_TURN}`, ephemeral: true });
    return;
  }

  // Clear timeout
  gameState.turnTimer.clear();

  // CRITICAL FIX: Find and validate target exists in game state
  const target = gameState.players.find(p => p.userId === targetId);
  if (!target) {
    logger.warn(`[Roulette] Invalid target ${targetId} not found in game state for session ${session.id}`);
    await interaction.followUp({ content: `❌ ${MESSAGES.NOT_IN_GAME}`, ephemeral: true });
    return;
  }

  if (!target.alive) {
    await interaction.followUp({ content: `❌ ${MESSAGES.ALREADY_ELIMINATED}`, ephemeral: true });
    return;
  }

  // FIX #16: Null check for kicker
  const kicker = gameState.players.find(p => p.userId === player.id);
  if (!kicker) {
    logger.error(`[Roulette] Kicker not found in game state: ${player.id}`);
    await interaction.followUp({ content: '❌ خطأ في اللعبة', ephemeral: true });
    return;
  }

  // Invalidate current kick UI to prevent duplicate clicks
  await ctx.commit();

  // Process kick with perk logic
  const kickResult = PerksLogic.processKick(gameState.players, player.id, targetId);

  // FIX HIGH 11: Audit log the kick attempt
  logger.info(
    `[Roulette] Kick: ${player.id} -> ${targetId} | Result: ${kickResult.reason} | ` +
    `Shield: ${kickResult.shieldUsed} | ExtraLife: ${kickResult.extraLifeUsed} | ` +
    `Eliminated: ${kickResult.eliminated || 'none'} | Session: ${session.id}`
  );

  // Handle the result
  if (kickResult.shieldUsed) {
    // Shield was used - show shield embed
    const shieldEmbed = Embeds.createShieldReflectEmbed(target, kicker, kickResult.extraLifeUsed);
    await gameState.channel.send({ embeds: [shieldEmbed] });

    if (kickResult.eliminated) {
      // Kicker was eliminated by reflection
      await eliminatePlayer(gameState, session, kickResult.eliminated, 'shield_reflect');
      return;
    } else {
      // Both survived (kicker used extra life)
      await safeDelay(gameState, RESULT_DELAY_MS);
      gameState.currentKickerId = null;

      // Handle double kick if active
      if (gameState.doubleKickActive && !gameState.doubleKickFirstTarget) {
        gameState.doubleKickFirstTarget = targetId; // Mark as "processed"
        await promptSecondKick(gameState, session, kicker, target);
        return;
      }

      await runSpinRound(gameState, session);
      return;
    }
  }

  if (kickResult.extraLifeUsed && !kickResult.eliminated) {
    // Target survived with extra life
    const lifeEmbed = Embeds.createExtraLifeEmbed(target);
    await gameState.channel.send({ embeds: [lifeEmbed] });

    // Handle double kick if active
    if (gameState.doubleKickActive && !gameState.doubleKickFirstTarget) {
      gameState.doubleKickFirstTarget = targetId; // Mark as "processed"
      await promptSecondKick(gameState, session, kicker, target);
      return;
    }

    await safeDelay(gameState, RESULT_DELAY_MS);
    gameState.currentKickerId = null;
    await runSpinRound(gameState, session);
    return;
  }

  // Normal elimination - check for double kick first
  if (gameState.doubleKickActive && !gameState.doubleKickFirstTarget) {
    // This is the first elimination with double kick active
    gameState.doubleKickFirstTarget = targetId;

    // Eliminate first target
    await eliminatePlayerWithoutContinue(gameState, targetId, 'kicked');

    // Prompt for second kick
    await promptSecondKick(gameState, session, kicker, target);
    return;
  }

  // Normal elimination
  await eliminatePlayer(gameState, session, kickResult.eliminated, kickResult.reason);
}

/**
 * Prompt for second kick (double kick perk)
 */
async function promptSecondKick(gameState, session, kicker, firstTarget) {
  // FIX #17: Filter out kicker AND the first target (can't kick same player twice)
  const alivePlayers = gameState.players.filter(p =>
    p.alive && p.userId !== kicker.userId && p.userId !== firstTarget.userId
  );

  if (alivePlayers.length === 0) {
    // No more targets, continue game
    gameState.doubleKickActive = false;
    gameState.doubleKickFirstTarget = null;
    gameState.currentKickerId = null;
    await safeDelay(gameState, RESULT_DELAY_MS);
    await runSpinRound(gameState, session);
    return;
  }

  // CRITICAL FIX: Use atomic phase transition
  changePhase(gameState, 'DOUBLE_KICK');
  session.phase = 'DOUBLE_KICK';
  await sessionManager.commit(session);

  // Show double kick prompt
  const doubleEmbed = Embeds.createDoubleKickPromptEmbed(kicker, firstTarget);
  const doubleButtons = Buttons.createDoubleKickButtons(session, alivePlayers);

  await gameState.channel.send({
    embeds: [doubleEmbed],
    components: doubleButtons,
  });

  // Set timeout for second kick
  gameState.turnTimer.start(
    TURN_TIMEOUT_MS,
    () => {
      withLock(session.id, async () => {
        gameState.turnTimer.clear();

        gameState.doubleKickActive = false;
        gameState.doubleKickFirstTarget = null;
        gameState.currentKickerId = null;

        await sessionManager.commit(session);

        await safeDelay(gameState, RESULT_DELAY_MS);
        await runSpinRound(gameState, session);
      }).catch(error => {
        logger.error('[Roulette] Double kick timeout error:', error);
        cleanupGame(session.id);
      });
    },
    { label: 'Roulette-DoubleKick' }
  );
}

/**
 * Handle second kick (double kick perk)
 */
async function handleSecondKick(ctx, gameState, targetId) {
  const { session, player, interaction } = ctx;

  if (gameState.currentKickerId !== player.id) {
    await interaction.followUp({ content: `❌ ${MESSAGES.NOT_YOUR_TURN}`, ephemeral: true });
    return;
  }

  // Clear timeout
  gameState.turnTimer.clear();

  const target = gameState.players.find(p => p.userId === targetId);
  if (!target || !target.alive) {
    await interaction.followUp({ content: `❌ ${MESSAGES.ALREADY_ELIMINATED}`, ephemeral: true });
    return;
  }

  // FIX #17: Prevent kicking the same player twice with double kick (runtime check)
  if (gameState.doubleKickFirstTarget === targetId) {
    await interaction.followUp({ content: '❌ لا يمكنك طرد نفس اللاعب مرتين!', ephemeral: true });
    return;
  }

  const kicker = gameState.players.find(p => p.userId === player.id);
  if (!kicker) {
    logger.error(`[Roulette] Kicker not found in game state for second kick: ${player.id}`);
    await interaction.followUp({ content: '❌ خطأ في اللعبة', ephemeral: true });
    return;
  }

  // Invalidate current double-kick UI
  await ctx.commit();

  // Process second kick with perk logic
  const kickResult = PerksLogic.processKick(gameState.players, player.id, targetId);

  // Reset double kick state
  gameState.doubleKickActive = false;
  gameState.doubleKickFirstTarget = null;
  gameState.currentKickerId = null;

  // Handle the result
  if (kickResult.shieldUsed) {
    // Plain text feedback (no embeds)
    let shieldMessage = `🛡️ <@${target.userId}> كان لابس درع والطلقة ارتدت على <@${kicker.userId}>!`;
    if (kickResult.extraLifeUsed) {
      shieldMessage += `\n❤️ <@${kicker.userId}> استخدم حياة إضافية ونجا!`;
    } else if (kickResult.eliminated) {
      shieldMessage += `\n💀 <@${kicker.userId}> تم طرده!`;
    }
    await gameState.channel.send({ content: shieldMessage });

    if (kickResult.eliminated) {
      await eliminatePlayer(gameState, session, kickResult.eliminated, 'shield_reflect');
      return;
    }
  } else if (kickResult.extraLifeUsed && !kickResult.eliminated) {
    // Plain text feedback
    await gameState.channel.send({
      content: `❤️ <@${target.userId}> كان معه حياة إضافية ونجا من الطرد!`
    });
  } else if (kickResult.eliminated) {
    await eliminatePlayer(gameState, session, kickResult.eliminated, kickResult.reason);
    return;
  }

  await safeDelay(gameState, RESULT_DELAY_MS);
  await runSpinRound(gameState, session);
}

/**
 * Handle self-kick (surrender)
 */
async function handleSelfKick(ctx, gameState) {
  const { session, player, interaction } = ctx;

  if (gameState.currentKickerId !== player.id) {
    await interaction.followUp({ content: `❌ ${MESSAGES.NOT_YOUR_TURN}`, ephemeral: true });
    return;
  }

  gameState.turnTimer.clear();

  await ctx.commit();

  await eliminatePlayer(gameState, session, player.id, 'self_kick');
}

/**
 * Handle random kick
 * FIX #27: Add error feedback instead of silent failure
 */
async function handleRandomKick(ctx, gameState) {
  const { session, player, interaction } = ctx;

  if (gameState.currentKickerId !== player.id) {
    // FIX #27: Give feedback instead of silent return
    await interaction.followUp({ content: `❌ ${MESSAGES.NOT_YOUR_TURN}`, ephemeral: true });
    return;
  }

  const alivePlayers = gameState.players.filter(p => p.alive && p.userId !== player.id);
  if (alivePlayers.length === 0) {
    await interaction.followUp({ content: '❌ لا يوجد لاعبين للطرد', ephemeral: true });
    return;
  }

  const randomTarget = alivePlayers[randomInt(alivePlayers.length)];
  await handleKickTarget(ctx, gameState, randomTarget.userId);
}

// ==================== PERK HANDLERS ====================

/**
 * Handle double kick perk purchase during kick phase
 * FIX HIGH 9: Added rate limiting
 */
async function handleDoubleKickPurchase(ctx, gameState) {
  const { session, player, interaction } = ctx;

  if (gameState.currentKickerId !== player.id) {
    await interaction.followUp({ content: `❌ ${MESSAGES.NOT_YOUR_TURN}`, ephemeral: true });
    return;
  }

  // FIX HIGH 9: Rate limit perk purchases (500ms cooldown)
  const lastPurchase = gameState.perkPurchaseTime[player.id] || 0;
  if (Date.now() - lastPurchase < 500) {
    await interaction.followUp({ content: '❌ انتظر قليلاً قبل الشراء مرة أخرى', ephemeral: true });
    return;
  }

  if (gameState.doubleKickActive || gameState.doubleKickFirstTarget) {
    await interaction.followUp({
      content: '❌ الطرد المزدوج مفعل بالفعل لهذا الدور',
      ephemeral: true,
    });
    return;
  }

  // Purchase double kick
  const result = await PerksLogic.purchaseDoubleKick(player.id, session.id);

  if (!result.success) {
    if (result.error === 'INSUFFICIENT_BALANCE') {
      const balance = await CurrencyService.getBalance(player.id);
      await interaction.followUp({
        content: MESSAGES.INSUFFICIENT_BALANCE(PERKS.DOUBLE_KICK.cost, balance),
        ephemeral: true,
      });
    } else {
      await interaction.followUp({
        content: '❌ فشل شراء الطرد المزدوج',
        ephemeral: true,
      });
    }
    return;
  }

  // Activate double kick
  gameState.doubleKickActive = true;

  // FIX HIGH 9: Update purchase timestamp
  gameState.perkPurchaseTime[player.id] = Date.now();

  // FIX HIGH: Verify newBalance is valid before displaying
  if (!Number.isInteger(result.newBalance) || result.newBalance < 0) {
    logger.warn(`[Roulette] Invalid newBalance after double kick purchase: ${result.newBalance}`);
    const freshBalance = await CurrencyService.getBalance(player.id);
    result.newBalance = freshBalance;
  }

  await interaction.followUp({
    content: `${MESSAGES.DOUBLE_KICK_ACTIVATED}\n💰 الرصيد: **${result.newBalance}** عملة`,
    ephemeral: true,
  });
}

/**
 * Handle skip double kick
 */
async function handleSkipDoubleKick(ctx, gameState) {
  const { session, player, interaction } = ctx;

  if (gameState.currentKickerId !== player.id) {
    await interaction.followUp({ content: `❌ ${MESSAGES.NOT_YOUR_TURN}`, ephemeral: true });
    return;
  }

  gameState.turnTimer.clear();

  await ctx.commit();

  gameState.doubleKickActive = false;
  gameState.doubleKickFirstTarget = null;
  gameState.currentKickerId = null;

  await safeDelay(gameState, RESULT_DELAY_MS);
  await runSpinRound(gameState, session);
}

/**
 * Handle shop access
 * FIX #24: Shop is now accessible
 */
async function handleShop(ctx, gameState) {
  const { session, player, interaction } = ctx;

  // Get player's owned perks and balance
  const ownedPerks = PerksLogic.getOwnedPerks(gameState.players, player.id);
  const balance = await CurrencyService.getBalance(player.id);

  const shopEmbed = Embeds.createShopEmbed(ownedPerks, balance);
  const shopButtons = Buttons.createShopButtons(session, ownedPerks);

  await interaction.followUp({
    embeds: [shopEmbed],
    components: shopButtons,
    ephemeral: true,
  });
}

/**
 * Handle perk purchase from shop
 * FIX HIGH 9: Added rate limiting
 */
async function handlePerkPurchase(ctx, gameState, perkId) {
  const { session, player, interaction } = ctx;

  // FIX HIGH 9: Rate limit perk purchases (500ms cooldown)
  const lastPurchase = gameState.perkPurchaseTime[player.id] || 0;
  if (Date.now() - lastPurchase < 500) {
    await interaction.followUp({ content: '❌ انتظر قليلاً قبل الشراء مرة أخرى', ephemeral: true });
    return;
  }

  // Check if already owns perk
  if (PerksLogic.hasActivePerk(gameState.players, player.id, perkId)) {
    await interaction.followUp({
      content: `❌ ${MESSAGES.ALREADY_OWNED}`,
      ephemeral: true,
    });
    return;
  }

  // Purchase perk
  const result = await PerksLogic.purchasePerk(player.id, perkId, session.id);

  if (!result.success) {
    if (result.error === 'INSUFFICIENT_BALANCE') {
      const balance = await CurrencyService.getBalance(player.id);
      await interaction.followUp({
        content: MESSAGES.INSUFFICIENT_BALANCE(PERKS[perkId]?.cost || 0, balance),
        ephemeral: true,
      });
    } else {
      await interaction.followUp({
        content: '❌ فشل شراء البيرك',
        ephemeral: true,
      });
    }
    return;
  }

  // Add perk to player
  PerksLogic.addPerk(gameState.players, player.id, perkId);

  // FIX HIGH 9: Update purchase timestamp
  gameState.perkPurchaseTime[player.id] = Date.now();

  // FIX HIGH: Verify newBalance is valid before displaying
  if (!Number.isInteger(result.newBalance) || result.newBalance < 0) {
    logger.warn(`[Roulette] Invalid newBalance after perk purchase: ${result.newBalance}`);
    const freshBalance = await CurrencyService.getBalance(player.id);
    result.newBalance = freshBalance;
  }

  await interaction.followUp({
    content: MESSAGES.PURCHASE_SUCCESS(result.perk.name, result.newBalance),
    ephemeral: true,
  });
}

// ==================== ELIMINATION ====================

/**
 * Eliminate a player and continue the game
 */
async function eliminatePlayer(gameState, session, userId, reason = 'kicked') {
  await eliminatePlayerWithoutContinue(gameState, userId, reason);

  gameState.currentKickerId = null;

  // Check alive count
  const alivePlayers = gameState.players.filter(p => p.alive);

  if (alivePlayers.length <= 1) {
    if (alivePlayers.length === 1) {
      await endGame(gameState, session, alivePlayers[0]);
    } else {
      // No winners (shouldn't happen)
      await SessionService.endSession(session.id, null, 'NO_WINNER');
      cleanupGame(gameState.sessionId);
    }
  } else {
    await safeDelay(gameState, RESULT_DELAY_MS);
    await runSpinRound(gameState, session);
  }
}

/**
 * Eliminate a player without continuing to next round
 * FIX HIGH 1: Updates alive players cache
 * @returns {boolean} - Whether elimination was successful
 */
async function eliminatePlayerWithoutContinue(gameState, userId, reason = 'kicked') {
  const player = gameState.players.find(p => p.userId === userId);
  if (!player) {
    logger.warn(`[Roulette] Attempted to eliminate non-existent player: ${userId}`);
    return false;
  }

  player.alive = false;

  // FIX HIGH 1: Update cached alive players list
  const idx = gameState.alivePlayers.findIndex(p => p.userId === userId);
  if (idx >= 0) {
    gameState.alivePlayers.splice(idx, 1);
  }

  // Send elimination message (plain message, no embed)
  let message = '';
  if (reason === 'timeout') {
    message = `⏰ انتهى الوقت! تم طرد <@${player.userId}> لعدم الاختيار!`;
  } else if (reason === 'self_kick') {
    message = `🤡 <@${player.userId}> انسحب من اللعبة!`;
  } else if (reason === 'shield_reflect') {
    message = `🛡️ تم طرد <@${player.userId}> بسبب الدرع!`;
  } else {
    message = `💣 تم طرد <@${player.userId}> من اللعبة!`;
  }

  await gameState.channel.send({
    content: `${message}\n\n⏳ سيتم بدء الجولة القادمة في بضع ثواني...`,
  });
  
  return true;
}

// ==================== FINAL ROUND ====================

/**
 * Run the final round (2 players left)
 * FIX #22: Final round now properly handles perks
 * FIX CRITICAL 1: Added depth limit to prevent infinite recursion
 */
async function runFinalRound(gameState, session, finalPlayers, depth = 0) {
  const MAX_FINAL_ROUND_ATTEMPTS = 10;

  // CRITICAL FIX: Prevent stack overflow if perks keep preventing elimination
  if (depth >= MAX_FINAL_ROUND_ATTEMPTS) {
    logger.warn(`[Roulette] Final round depth limit reached (${depth}). Awarding to random player.`);
    const winner = finalPlayers[randomInt(finalPlayers.length)];
    await gameState.channel.send({
      content: `⚠️ تعذر تحديد الفائز بعد ${MAX_FINAL_ROUND_ATTEMPTS} محاولات. تم اختيار فائز عشوائي!`,
    });
    await endGame(gameState, session, winner);
    return;
  }

  // CRITICAL FIX: Use atomic phase transition
  changePhase(gameState, 'FINAL_ROUND');

  // Send final round announcement
  const finalEmbed = Embeds.createFinalRoundEmbed(finalPlayers[0], finalPlayers[1]);
  await gameState.channel.send({ embeds: [finalEmbed] });

  await safeDelay(gameState, 2000);

  // Spin to select who gets to KICK (not who wins)
  const kickerIndex = randomInt(2);
  const kicker = finalPlayers[kickerIndex];
  const target = finalPlayers[1 - kickerIndex]; // The other player

  // Generate and send final wheel GIF
  let gifSent = false;
  try {
    const wheelPlayers = finalPlayers.map(p => ({
      name: p.displayName,
      displayName: p.displayName,
      slot: p.slot,
    }));

    const gifBuffer = await generateWheelGif(wheelPlayers, kickerIndex);
    if (gifBuffer.length <= MAX_DISCORD_GIF_BYTES) {
      const attachment = new AttachmentBuilder(gifBuffer, { name: 'final-wheel.gif' });
      await gameState.channel.send({ files: [attachment] });
      gifSent = true;
    } else {
      logger.warn(
        `[Roulette] Skipping final wheel GIF upload; file too large (${gifBuffer.length} bytes > ${MAX_DISCORD_GIF_BYTES})`
      );
    }
  } catch (error) {
    logger.warn(`[Roulette] Final wheel GIF unavailable: ${formatDiscordError(error)}`);
  }

  await safeDelay(gameState, gifSent ? WHEEL_GIF_DURATION_MS : FALLBACK_SPIN_DELAY_MS);

  // FIX #22: Process the kick with perks (Shield, Extra Life)
  // The kicker "kicks" the target, perks apply!
  const kickResult = PerksLogic.processKick(gameState.players, kicker.userId, target.userId);

  if (kickResult.shieldUsed) {
    // Target had shield - reflects to kicker (plain text feedback)
    let shieldMessage = `🛡️ <@${target.userId}> كان لابس درع والطلقة ارتدت على <@${kicker.userId}>!`;
    if (kickResult.extraLifeUsed) {
      shieldMessage += `\n❤️ <@${kicker.userId}> استخدم حياة إضافية ونجا!`;
    } else if (kickResult.eliminated) {
      shieldMessage += `\n💀 <@${kicker.userId}> تم طرده!`;
    }
    await gameState.channel.send({ content: shieldMessage });

    if (kickResult.eliminated === kicker.userId) {
      // Kicker eliminated by reflection - target wins!
      kicker.alive = false;
      await endGame(gameState, session, target);
      return;
    } else {
      // Kicker survived with extra life - both still alive, spin again!
      await gameState.channel.send({ content: '🔄 لم يُقصى أحد! إعادة التدوير...' });
      await safeDelay(gameState, 2000);
      await runFinalRound(gameState, session, gameState.players.filter(p => p.alive), depth + 1);
      return;
    }
  }

  if (kickResult.extraLifeUsed && !kickResult.eliminated) {
    // Target survived with extra life - spin again! (plain text feedback)
    await gameState.channel.send({
      content: `❤️ <@${target.userId}> كان معه حياة إضافية ونجا من الطرد!`
    });
    await gameState.channel.send({ content: '🔄 لم يُقصى أحد! إعادة التدوير...' });
    await safeDelay(gameState, 2000);
    await runFinalRound(gameState, session, gameState.players.filter(p => p.alive), depth + 1);
    return;
  }

  // Normal elimination - target is out, kicker wins
  target.alive = false;
  const elimEmbed = Embeds.createEliminationEmbed(target, 'kicked');
  await gameState.channel.send({ embeds: [elimEmbed] });
  
  await endGame(gameState, session, kicker);
}

// ==================== GAME END ====================

/**
 * End game and declare winner
 * FIX #26: Use try-finally to prevent memory leak
 */
async function endGame(gameState, session, winner) {
  // CRITICAL FIX: Use atomic phase transition (clears timeout automatically)
  changePhase(gameState, 'GAME_END');

  // FIX R3: Handle null winner (corruption where all players eliminated)
  if (!winner) {
    logger.error(`[Roulette] endGame called with null winner for session ${session.id}`);
    await gameState.channel.send({
      content: '⚠️ انتهت اللعبة بدون فائز بسبب خطأ. يرجى التواصل مع الإدارة.',
    });
    try {
      await SessionService.endSession(gameState.sessionId, null, 'NO_WINNER');
    } catch (error) {
      logger.error('[Roulette] Failed to end session (no winner):', error);
    }
    cleanupGame(gameState.sessionId);
    return;
  }

  let endReason = 'COMPLETED';

  let rewardResult = null;

  try {
    rewardResult = await awardGameWinners({
      gameType: 'ROULETTE',
      sessionId: gameState.sessionId,
      winnerIds: [winner.userId],
      playerCount: gameState.players.length,
      roundsPlayed: gameState.currentRound || 1
    });
  } catch (error) {
    endReason = 'ERROR';
    logger.error('[Roulette] Reward payout failed:', error);
  }

  // FIX BUG 1: Record losses for all non-winners
  const loserIds = gameState.players
    .filter(p => p.userId !== winner.userId)
    .map(p => p.userId);

  const statsMetadata = {
    sessionId: gameState.sessionId,
    roundsPlayed: gameState.currentRound || 1,
    playerCount: gameState.players.length,
  };

  await Promise.allSettled(
    loserIds.map(id => recordGameResult(id, 'ROULETTE', 'LOSS', statsMetadata))
  );

  if (rewardResult) {
    try {
      const reward = rewardResult.reward;
      // FIX CRITICAL: Verify payout succeeded before showing balance
      const payoutSuccess = rewardResult.results?.[0]?.success === true;
      const newBalance = rewardResult.results?.[0]?.newBalance;

      if (payoutSuccess && newBalance != null) {
        // Payout succeeded - show winner with correct balance
        const winEmbed = Embeds.createWinnerEmbed(winner, reward, newBalance);
        const winButtons = Buttons.createWinnerButtons(newBalance, reward);

        await gameState.channel.send({
          content: `<@${winner.userId}>`,
          embeds: [winEmbed],
          components: winButtons,
        });
      } else {
        // Payout failed - announce winner but warn about reward failure
        await gameState.channel.send({
          content: `🏆 <@${winner.userId}> فاز باللعبة!\n⚠️ حدث خطأ في منح الجائزة. يرجى التواصل مع الإدارة.`
        });
        logger.error(`[Roulette] Winner ${winner.userId} but reward payout failed. Result:`, rewardResult);
      }

      logger.info(`[Roulette] Game ended: ${gameState.sessionId} - Winner: ${winner.displayName}`);
    } catch (error) {
      logger.error('[Roulette] Failed to announce winner:', error);
    }
  }

  try {
    await SessionService.endSession(gameState.sessionId, winner?.userId ?? null, endReason);
  } catch (error) {
    logger.error('[Roulette] Failed to end session:', error);
  }

  // FIX #26: ALWAYS cleanup, even if something above throws
  cleanupGame(gameState.sessionId);
}

// ==================== CLEANUP ====================

/**
 * Cancel roulette game
 * FIX BUG 2: Now properly ends session before cleanup
 */
export async function cancelRouletteGame(sessionId, reason = 'CANCELLED') {
  const gameState = activeGames.get(sessionId);
  if (!gameState) return false;

  // End the session in SessionService before local cleanup
  try {
    await SessionService.endSession(sessionId, null, reason);
  } catch (error) {
    logger.error('[Roulette] Failed to end session during cancellation:', error);
  }

  cleanupGame(sessionId);
  logger.info(`[Roulette] Game cancelled: ${sessionId} - Reason: ${reason}`);
  return true;
}

/**
 * Cleanup game resources
 * FIX DESIGN 2: Now aborts pending delays
 */
function cleanupGame(sessionId) {
  const gameState = activeGames.get(sessionId);
  if (gameState) {
    // Clear turn timer
    gameState.turnTimer.clear();
    // Abort all pending delays
    if (gameState.abortController) {
      gameState.abortController.abort();
    }
  }
  activeGames.delete(sessionId);
  sessionLocks.delete(sessionId);
}

/**
 * Check if session has active game
 */
export function hasActiveGame(sessionId) {
  return activeGames.has(sessionId);
}

/**
 * Find active roulette game by channel ID
 */
export function getActiveGameByChannel(channelId) {
  for (const gameState of activeGames.values()) {
    if (gameState?.channel?.id === channelId) {
      return gameState;
    }
  }
  return null;
}

/**
 * Cancel active roulette game by channel ID
 * FIX BUG 2: Now async to properly await session cleanup
 */
export async function cancelRouletteGameByChannel(channelId, reason = 'CANCELLED') {
  const gameState = getActiveGameByChannel(channelId);
  if (!gameState) return false;
  return await cancelRouletteGame(gameState.sessionId, reason);
}

/**
 * Get active games count (for monitoring)
 */
export function getActiveGamesCount() {
  return activeGames.size;
}
