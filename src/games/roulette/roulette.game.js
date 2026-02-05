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
import { buttonRouter, sessionManager } from '../../framework/index.js';
import { generateWheelGif, WHEEL_GIF_DURATION_MS } from './WheelGenerator.js';
import {
  MESSAGES,
  TURN_TIMEOUT_MS,
  RESULT_DELAY_MS,
  GAME_SETTINGS,
  PERKS,
} from './roulette.constants.js';
import * as Embeds from './roulette.embeds.js';
import * as Buttons from './roulette.buttons.js';
import * as PerksLogic from './roulette.perks.js';
import logger from '../../utils/logger.js';

// ==================== UTILITY FUNCTIONS ====================

/**
 * Delay utility (defined at top for clarity)
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getSelectValue(interaction) {
  if (!interaction?.values || interaction.values.length === 0) return null;
  return interaction.values[0];
}

// ==================== STATE MANAGEMENT ====================

// Store active games (in-memory for timeouts and local state)
const activeGames = new Map();

// Simple concurrency locks per session (Enhancement #3)
const sessionLocks = new Map();

/**
 * Execute function with session lock to prevent race conditions
 */
async function withLock(sessionId, fn) {
  // Wait for any existing lock
  while (sessionLocks.get(sessionId)) {
    await delay(10);
  }
  
  sessionLocks.set(sessionId, true);
  try {
    return await fn();
  } finally {
    sessionLocks.delete(sessionId);
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
    switch (action) {
      case 'kick':
        await handleKickTarget(ctx, gameState, details);
        break;
      case 'kick_select': {
        const targetId = getSelectValue(interaction);
        if (!targetId) {
          await interaction.followUp({ content: '❌ اختيار غير صالح', ephemeral: true });
          break;
        }
        await handleKickTarget(ctx, gameState, targetId);
        break;
      }
      case 'kick2':
        await handleSecondKick(ctx, gameState, details);
        break;
      case 'kick2_select': {
        const targetId = getSelectValue(interaction);
        if (!targetId) {
          await interaction.followUp({ content: '❌ اختيار غير صالح', ephemeral: true });
          break;
        }
        await handleSecondKick(ctx, gameState, targetId);
        break;
      }
      case 'selfkick':
        await handleSelfKick(ctx, gameState);
        break;
      case 'randomkick':
        await handleRandomKick(ctx, gameState);
        break;
      case 'doublekick':
        await handleDoubleKickPurchase(ctx, gameState);
        break;
      case 'skip_double':
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
      
      return {
        userId: p.userId,
        displayName: p.displayName || 'Unknown',
        alive: true,
        perks: Array.isArray(p.perks) ? [...p.perks] : [],
        slot,
      };
    });

    // Initialize game state
    const gameState = {
      sessionId: session.id,
      channel,
      players,
      currentRound: 0,
      phase: 'PLAYING', // PLAYING, SPINNING, KICK_SELECTION, FINAL_ROUND, GAME_END
      turnTimeout: null,
      currentKickerId: null,
      doubleKickActive: false,
      doubleKickFirstTarget: null,
    };

    activeGames.set(session.id, gameState);

    // Update session phase
    session.phase = 'ACTIVE';
    await sessionManager.save(session);

    // Announce game start
    const startEmbed = Embeds.createGameStartEmbed();
    await channel.send({ embeds: [startEmbed] });
    await delay(2000);

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
 */
async function runSpinRound(gameState, session) {
  if (gameState.phase === 'GAME_END') return;

  session.phase = 'SPINNING';
  await sessionManager.save(session);

  // Get alive players
  const alivePlayers = gameState.players.filter(p => p.alive);
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

  gameState.phase = 'SPINNING';

  // Send round embed
  const roundEmbed = Embeds.createRoundEmbed(gameState.currentRound, alivePlayers);
  await gameState.channel.send({ embeds: [roundEmbed] });

  // Pre-select random player using crypto.randomInt
  const selectedIndex = randomInt(alivePlayers.length);
  const chosenPlayer = alivePlayers[selectedIndex];

  // Generate and send wheel GIF
  try {
    // Prepare players for wheel (needs name property)
    const wheelPlayers = alivePlayers.map(p => ({
      name: p.displayName,
      displayName: p.displayName,
      slot: p.slot,
    }));

    const gifBuffer = await generateWheelGif(wheelPlayers, selectedIndex);
    const attachment = new AttachmentBuilder(gifBuffer, { name: 'wheel.gif' });

    await gameState.channel.send({ files: [attachment] });
  } catch (error) {
    logger.error('[Roulette] Failed to generate wheel GIF:', error);
    // Fallback text animation
    await gameState.channel.send({ content: '🎡 *جاري تدوير العجلة...*' });
  }

  // Wait for GIF animation
  await delay(WHEEL_GIF_DURATION_MS);

  // Announce chosen player
  const chosenEmbed = Embeds.createChosenEmbed(chosenPlayer, gameState.currentRound);
  await gameState.channel.send({
    content: `<@${chosenPlayer.userId}>`,
    embeds: [chosenEmbed],
  });

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

  gameState.phase = 'KICK_SELECTION';
  gameState.currentKickerId = kickerPlayer.userId;
  gameState.doubleKickActive = false;
  gameState.doubleKickFirstTarget = null;

  // Get potential targets (everyone alive except kicker)
  const alivePlayers = gameState.players.filter(p => p.alive);
  const targetPlayers = alivePlayers.filter(p => p.userId !== kickerPlayer.userId);

  // Check if kicker can afford double kick
  const { canBuy } = await PerksLogic.canBuyDoubleKick(kickerPlayer.userId);

  // Update session for ButtonRouter phase tracking (use string, not number!)
  session.phase = 'KICK_SELECTION';
  await sessionManager.commit(session);

  // Create kick selection embed and buttons
  const kickEmbed = Embeds.createKickSelectionEmbed(kickerPlayer, targetPlayers);
  const kickButtons = Buttons.createKickButtons(session, targetPlayers, canBuy, PERKS.DOUBLE_KICK.cost);

  await gameState.channel.send({
    embeds: [kickEmbed],
    components: kickButtons,
  });

  // Set timeout for kick selection
  gameState.turnTimeout = setTimeout(async () => {
    await handleKickTimeout(gameState, session, kickerPlayer);
  }, TURN_TIMEOUT_MS);
}

// ==================== TIMEOUT HANDLING ====================

/**
 * Handle kick timeout - kicker gets eliminated
 * FIX #25: Race condition prevention
 */
async function handleKickTimeout(gameState, session, kickerPlayer) {
  await withLock(session.id, async () => {
    // FIX #25: Clear timeout FIRST to prevent any race conditions
    if (gameState.turnTimeout) {
      clearTimeout(gameState.turnTimeout);
      gameState.turnTimeout = null;
    }
    
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
 */
async function handleKickTarget(ctx, gameState, targetId) {
  const { session, player, interaction } = ctx;

  // Verify it's the current player's turn
  if (gameState.currentKickerId !== player.id) {
    await interaction.followUp({ content: `❌ ${MESSAGES.NOT_YOUR_TURN}`, ephemeral: true });
    return;
  }

  // Clear timeout
  if (gameState.turnTimeout) {
    clearTimeout(gameState.turnTimeout);
    gameState.turnTimeout = null;
  }

  // Find target
  const target = gameState.players.find(p => p.userId === targetId);
  if (!target || !target.alive) {
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
      await delay(RESULT_DELAY_MS);
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

    await delay(RESULT_DELAY_MS);
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
    await delay(RESULT_DELAY_MS);
    await runSpinRound(gameState, session);
    return;
  }

  gameState.phase = 'DOUBLE_KICK';
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
  gameState.turnTimeout = setTimeout(async () => {
    await withLock(session.id, async () => {
      // Skip second kick on timeout
      if (gameState.turnTimeout) {
        clearTimeout(gameState.turnTimeout);
        gameState.turnTimeout = null;
      }
      
      gameState.doubleKickActive = false;
      gameState.doubleKickFirstTarget = null;
      gameState.currentKickerId = null;

      await sessionManager.commit(session);

      await delay(RESULT_DELAY_MS);
      await runSpinRound(gameState, session);
    });
  }, TURN_TIMEOUT_MS);
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
  if (gameState.turnTimeout) {
    clearTimeout(gameState.turnTimeout);
    gameState.turnTimeout = null;
  }

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
    const shieldEmbed = Embeds.createShieldReflectEmbed(target, kicker, kickResult.extraLifeUsed);
    await gameState.channel.send({ embeds: [shieldEmbed] });

    if (kickResult.eliminated) {
      await eliminatePlayer(gameState, session, kickResult.eliminated, 'shield_reflect');
      return;
    }
  } else if (kickResult.extraLifeUsed && !kickResult.eliminated) {
    const lifeEmbed = Embeds.createExtraLifeEmbed(target);
    await gameState.channel.send({ embeds: [lifeEmbed] });
  } else if (kickResult.eliminated) {
    await eliminatePlayer(gameState, session, kickResult.eliminated, kickResult.reason);
    return;
  }

  await delay(RESULT_DELAY_MS);
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

  if (gameState.turnTimeout) {
    clearTimeout(gameState.turnTimeout);
    gameState.turnTimeout = null;
  }

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
 */
async function handleDoubleKickPurchase(ctx, gameState) {
  const { session, player, interaction } = ctx;

  if (gameState.currentKickerId !== player.id) {
    await interaction.followUp({ content: `❌ ${MESSAGES.NOT_YOUR_TURN}`, ephemeral: true });
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

  if (gameState.turnTimeout) {
    clearTimeout(gameState.turnTimeout);
    gameState.turnTimeout = null;
  }

  await ctx.commit();

  gameState.doubleKickActive = false;
  gameState.doubleKickFirstTarget = null;
  gameState.currentKickerId = null;

  await delay(RESULT_DELAY_MS);
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
 */
async function handlePerkPurchase(ctx, gameState, perkId) {
  const { session, player, interaction } = ctx;

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
    await delay(RESULT_DELAY_MS);
    await runSpinRound(gameState, session);
  }
}

/**
 * Eliminate a player without continuing to next round
 * @returns {boolean} - Whether elimination was successful
 */
async function eliminatePlayerWithoutContinue(gameState, userId, reason = 'kicked') {
  const player = gameState.players.find(p => p.userId === userId);
  if (!player) {
    logger.warn(`[Roulette] Attempted to eliminate non-existent player: ${userId}`);
    return false;
  }

  player.alive = false;

  // Send elimination message
  const elimEmbed = Embeds.createEliminationEmbed(player, reason);
  await gameState.channel.send({ embeds: [elimEmbed] });
  
  return true;
}

// ==================== FINAL ROUND ====================

/**
 * Run the final round (2 players left)
 * FIX #22: Final round now properly handles perks
 */
async function runFinalRound(gameState, session, finalPlayers) {
  gameState.phase = 'FINAL_ROUND';

  // Send final round announcement
  const finalEmbed = Embeds.createFinalRoundEmbed(finalPlayers[0], finalPlayers[1]);
  await gameState.channel.send({ embeds: [finalEmbed] });

  await delay(2000);

  // Spin to select who gets to KICK (not who wins)
  const kickerIndex = randomInt(2);
  const kicker = finalPlayers[kickerIndex];
  const target = finalPlayers[1 - kickerIndex]; // The other player

  // Generate and send final wheel GIF
  try {
    const wheelPlayers = finalPlayers.map(p => ({
      name: p.displayName,
      displayName: p.displayName,
      slot: p.slot,
    }));

    const gifBuffer = await generateWheelGif(wheelPlayers, kickerIndex);
    const attachment = new AttachmentBuilder(gifBuffer, { name: 'final-wheel.gif' });
    await gameState.channel.send({ files: [attachment] });
  } catch (error) {
    logger.error('[Roulette] Failed to generate final wheel GIF:', error);
    await gameState.channel.send({ content: '🎡 *جاري تدوير العجلة النهائية...*' });
  }

  await delay(WHEEL_GIF_DURATION_MS);

  // FIX #22: Process the kick with perks (Shield, Extra Life)
  // The kicker "kicks" the target, perks apply!
  const kickResult = PerksLogic.processKick(gameState.players, kicker.userId, target.userId);

  if (kickResult.shieldUsed) {
    // Target had shield - reflects to kicker
    const shieldEmbed = Embeds.createShieldReflectEmbed(target, kicker, kickResult.extraLifeUsed);
    await gameState.channel.send({ embeds: [shieldEmbed] });

    if (kickResult.eliminated === kicker.userId) {
      // Kicker eliminated by reflection - target wins!
      kicker.alive = false;
      await endGame(gameState, session, target);
      return;
    } else {
      // Kicker survived with extra life - both still alive, spin again!
      await gameState.channel.send({ content: '🔄 لم يُقصى أحد! إعادة التدوير...' });
      await delay(2000);
      await runFinalRound(gameState, session, gameState.players.filter(p => p.alive));
      return;
    }
  }

  if (kickResult.extraLifeUsed && !kickResult.eliminated) {
    // Target survived with extra life - spin again!
    const lifeEmbed = Embeds.createExtraLifeEmbed(target);
    await gameState.channel.send({ embeds: [lifeEmbed] });
    await gameState.channel.send({ content: '🔄 لم يُقصى أحد! إعادة التدوير...' });
    await delay(2000);
    await runFinalRound(gameState, session, gameState.players.filter(p => p.alive));
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
  gameState.phase = 'GAME_END';

  // Clear any pending timeout first
  if (gameState.turnTimeout) {
    clearTimeout(gameState.turnTimeout);
    gameState.turnTimeout = null;
  }

  try {
    // Distribute rewards
    const rewardResult = await awardGameWinners({
      gameType: 'ROULETTE',
      sessionId: gameState.sessionId,
      winnerIds: [winner.userId],
      playerCount: gameState.players.length,
      roundsPlayed: gameState.currentRound || 1
    });

    const reward = rewardResult.reward;
    const newBalance = rewardResult.results[0]?.newBalance
      ?? await CurrencyService.getBalance(winner.userId);

    // Send winner embed
    const winEmbed = Embeds.createWinnerEmbed(winner, reward, newBalance);
    const winButtons = Buttons.createWinnerButtons(newBalance, reward);

    await gameState.channel.send({
      content: `<@${winner.userId}>`,
      embeds: [winEmbed],
      components: winButtons,
    });

    // End session in DB
    await SessionService.endSession(gameState.sessionId, winner.userId, 'COMPLETED');

    logger.info(`[Roulette] Game ended: ${gameState.sessionId} - Winner: ${winner.displayName}`);
    
  } finally {
    // FIX #26: ALWAYS cleanup, even if something above throws
    cleanupGame(gameState.sessionId);
  }
}

// ==================== CLEANUP ====================

/**
 * Cancel roulette game
 */
export function cancelRouletteGame(sessionId, reason = 'CANCELLED') {
  const gameState = activeGames.get(sessionId);
  if (!gameState) return false;

  cleanupGame(sessionId);
  logger.info(`[Roulette] Game cancelled: ${sessionId} - Reason: ${reason}`);
  return true;
}

/**
 * Cleanup game resources
 */
function cleanupGame(sessionId) {
  const gameState = activeGames.get(sessionId);
  if (gameState?.turnTimeout) {
    clearTimeout(gameState.turnTimeout);
  }
  activeGames.delete(sessionId);
  sessionLocks.delete(sessionId); // Also clean up any locks
}

/**
 * Check if session has active game
 */
export function hasActiveGame(sessionId) {
  return activeGames.has(sessionId);
}

/**
 * Get active games count (for monitoring)
 */
export function getActiveGamesCount() {
  return activeGames.size;
}
