/**
 * Roulette Game - Elimination wheel game
 *
 * Uses the game framework for:
 * - v1 button format with stale-click detection
 * - Session management
 *
 * Game flow:
 * 1. Players join via slots (lobby handles this)
 * 2. Game starts with all players in a "wheel"
 * 3. Each turn, current player picks someone to eliminate
 * 4. Wheel spins and shows result
 * 5. Last player standing wins
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} from 'discord.js';
import { randomInt } from 'crypto';
import * as SessionService from '../../services/games/session.service.js';
import * as CurrencyService from '../../services/economy/currency.service.js';
import { buttonRouter, codec, sessionManager } from '../../framework/index.js';
import { GAMES } from '../../config/games.config.js';
import { generateWheelImage } from './roulette.images.js';
import {
  MESSAGES,
  TURN_TIMEOUT_MS,
  SPIN_ANIMATION_MS,
  RESULT_DELAY_MS,
} from './roulette.constants.js';
import logger from '../../utils/logger.js';

// Store active games
const activeGames = new Map();

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

  switch (action) {
    case 'kick':
      await handleKickTarget(ctx, gameState, details);
      break;
    case 'double':
      await handleDoubleKick(ctx, gameState);
      break;
    default:
      logger.debug(`[Roulette] Unknown action: ${action}`);
  }
}

/**
 * Start a new Roulette game
 * @param {Object} session - Session from SessionService
 * @param {TextChannel} channel - Discord channel
 */
export async function startRouletteGame(session, channel) {
  try {
    logger.info(`[Roulette] Starting game: ${session.id}`);

    // Initialize players with alive status
    const players = session.players.map(p => ({
      userId: p.userId,
      displayName: p.displayName,
      alive: true,
      perks: p.perks || [],
      slot: p.slot
    }));

    // Randomize turn order
    shuffleArray(players);

    // Initialize game state
    const gameState = {
      sessionId: session.id,
      channel,
      players,
      currentTurnIndex: 0,
      phase: 'PLAYING', // PLAYING, SPINNING, GAME_END
      turnTimeout: null,
      messageId: null,
      pendingDoubleKick: false,
    };

    activeGames.set(session.id, gameState);

    // Update session phase
    session.phase = 'ACTIVE';
    await sessionManager.save(session);

    // Announce game start
    await channel.send({ content: MESSAGES.GAME_STARTING });
    await delay(1500);

    // Start first turn
    await startTurn(gameState, session);

  } catch (error) {
    logger.error('[Roulette] Error starting game:', error);
    throw error;
  }
}

/**
 * Start a player's turn
 */
async function startTurn(gameState, session) {
  if (gameState.phase === 'GAME_END') return;

  // Get current player (skip eliminated)
  const alivePlayers = gameState.players.filter(p => p.alive);

  // Check for winner
  if (alivePlayers.length === 1) {
    await endGame(gameState, session, alivePlayers[0]);
    return;
  }

  // Find next alive player
  let currentPlayer = null;
  for (let i = 0; i < gameState.players.length; i++) {
    const idx = (gameState.currentTurnIndex + i) % gameState.players.length;
    if (gameState.players[idx].alive) {
      gameState.currentTurnIndex = idx;
      currentPlayer = gameState.players[idx];
      break;
    }
  }

  if (!currentPlayer) {
    logger.error('[Roulette] No alive players found');
    return;
  }

  // Build target buttons (all alive players except current)
  const targets = alivePlayers.filter(p => p.userId !== currentPlayer.userId);
  const rows = buildTargetButtons(session, targets, currentPlayer);

  // Check if player has Double Kick perk
  const hasDoubleKick = currentPlayer.perks.includes('DOUBLE_KICK');

  // Generate wheel image with current players
  const wheelImage = await generateWheelImage(alivePlayers, currentPlayer.userId);
  const attachment = new AttachmentBuilder(wheelImage, { name: 'wheel.png' });

  // Send turn message
  const message = await gameState.channel.send({
    content: MESSAGES.YOUR_TURN(`<@${currentPlayer.userId}>`),
    files: [attachment],
    components: rows,
  });

  gameState.messageId = message.id;
  gameState.currentMessage = message;
  gameState.pendingDoubleKick = false;

  // Set timeout
  gameState.turnTimeout = setTimeout(async () => {
    await handleTurnTimeout(gameState, session, currentPlayer, targets);
  }, TURN_TIMEOUT_MS);
}

/**
 * Build target selection buttons
 */
function buildTargetButtons(session, targets, currentPlayer) {
  const rows = [];
  let currentRow = new ActionRowBuilder();

  for (const target of targets) {
    if (currentRow.components.length >= 4) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }

    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(codec.forSession(session, 'kick', target.userId))
        .setLabel(target.displayName.slice(0, 20))
        .setEmoji('🎯')
        .setStyle(ButtonStyle.Danger)
    );
  }

  if (currentRow.components.length > 0) {
    rows.push(currentRow);
  }

  // Add Double Kick button if player has the perk
  if (currentPlayer.perks.includes('DOUBLE_KICK')) {
    const perkRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(codec.forSession(session, 'double', ''))
        .setLabel(MESSAGES.USE_DOUBLE_KICK)
        .setEmoji('🔥')
        .setStyle(ButtonStyle.Primary)
    );
    rows.push(perkRow);
  }

  return rows.slice(0, 5); // Discord max 5 rows
}

/**
 * Handle kick target selection
 */
async function handleKickTarget(ctx, gameState, targetId) {
  const { session, player, interaction } = ctx;

  // Verify it's the current player's turn
  const currentPlayer = gameState.players[gameState.currentTurnIndex];
  if (currentPlayer.userId !== player.id) {
    await interaction.followUp({ content: `❌ ${MESSAGES.NOT_YOUR_TURN}`, ephemeral: true });
    return;
  }

  // Clear timeout
  clearTimeout(gameState.turnTimeout);

  // Find target
  const target = gameState.players.find(p => p.userId === targetId);
  if (!target || !target.alive) {
    await interaction.followUp({ content: `❌ ${MESSAGES.ALREADY_ELIMINATED}`, ephemeral: true });
    return;
  }

  // Process elimination
  await processElimination(gameState, session, currentPlayer, target);
}

/**
 * Handle double kick perk usage
 */
async function handleDoubleKick(ctx, gameState) {
  const { session, player, interaction } = ctx;

  const currentPlayer = gameState.players[gameState.currentTurnIndex];
  if (currentPlayer.userId !== player.id) {
    await interaction.followUp({ content: `❌ ${MESSAGES.NOT_YOUR_TURN}`, ephemeral: true });
    return;
  }

  if (!currentPlayer.perks.includes('DOUBLE_KICK')) {
    await interaction.followUp({ content: '❌ ليس لديك هذه الميزة!', ephemeral: true });
    return;
  }

  // Mark double kick as pending
  gameState.pendingDoubleKick = true;

  // Remove perk after use
  currentPlayer.perks = currentPlayer.perks.filter(p => p !== 'DOUBLE_KICK');

  await interaction.followUp({
    content: '🔥 تم تفعيل طرد مرتين! اختر اللاعب الأول...',
    ephemeral: true
  });
}

/**
 * Process elimination with perk handling
 */
async function processElimination(gameState, session, attacker, target) {
  gameState.phase = 'SPINNING';

  // Show spinning animation
  await gameState.currentMessage.edit({
    content: MESSAGES.SPINNING,
    components: [],
  });

  await delay(SPIN_ANIMATION_MS);

  // Check for Shield perk
  if (target.perks.includes('SHIELD')) {
    // Remove shield perk
    target.perks = target.perks.filter(p => p !== 'SHIELD');

    // Check if attacker has Extra Life
    if (attacker.perks.includes('EXTRA_LIFE')) {
      attacker.perks = attacker.perks.filter(p => p !== 'EXTRA_LIFE');
      await gameState.channel.send({
        content: `🛡️ ${target.displayName} عكس الإقصاء!\n💖 ${attacker.displayName} استخدم حياة إضافية ونجا!`,
      });
    } else {
      // Attacker eliminated
      attacker.alive = false;
      await gameState.channel.send({
        content: MESSAGES.SHIELD_REFLECTED(`<@${attacker.userId}>`, `<@${target.userId}>`),
      });
    }
  }
  // Check for Extra Life perk
  else if (target.perks.includes('EXTRA_LIFE')) {
    target.perks = target.perks.filter(p => p !== 'EXTRA_LIFE');
    await gameState.channel.send({
      content: MESSAGES.SURVIVED_EXTRA_LIFE(`<@${target.userId}>`),
    });
  }
  // Normal elimination
  else {
    target.alive = false;

    // Generate elimination wheel image
    const alivePlayers = gameState.players.filter(p => p.alive);
    const wheelImage = await generateWheelImage(alivePlayers, null, target.userId);
    const attachment = new AttachmentBuilder(wheelImage, { name: 'eliminated.png' });

    await gameState.channel.send({
      content: MESSAGES.ELIMINATED(`<@${target.userId}>`),
      files: [attachment],
    });
  }

  // Handle pending double kick
  if (gameState.pendingDoubleKick) {
    gameState.pendingDoubleKick = false;

    // Get remaining targets
    const alivePlayers = gameState.players.filter(p => p.alive && p.userId !== attacker.userId);

    if (alivePlayers.length > 0) {
      await delay(1500);
      await gameState.channel.send({
        content: '🔥 اختر اللاعب الثاني للطرد...',
      });

      // Rebuild buttons for second target
      const rows = buildTargetButtons(session, alivePlayers, attacker);

      const message = await gameState.channel.send({
        content: MESSAGES.YOUR_TURN(`<@${attacker.userId}>`),
        components: rows,
      });

      gameState.messageId = message.id;
      gameState.currentMessage = message;
      gameState.phase = 'PLAYING';

      // Set timeout for second selection
      gameState.turnTimeout = setTimeout(async () => {
        const randomTarget = alivePlayers[randomInt(alivePlayers.length)];
        await processElimination(gameState, session, attacker, randomTarget);
      }, TURN_TIMEOUT_MS);

      return;
    }
  }

  // Continue to next turn
  await delay(RESULT_DELAY_MS);
  gameState.phase = 'PLAYING';
  gameState.currentTurnIndex = (gameState.currentTurnIndex + 1) % gameState.players.length;
  await startTurn(gameState, session);
}

/**
 * Handle turn timeout - auto select random target
 */
async function handleTurnTimeout(gameState, session, currentPlayer, targets) {
  if (gameState.phase !== 'PLAYING') return;

  await gameState.channel.send({ content: MESSAGES.TURN_TIMEOUT });

  const randomTarget = targets[randomInt(targets.length)];
  await processElimination(gameState, session, currentPlayer, randomTarget);
}

/**
 * End game and declare winner
 */
async function endGame(gameState, session, winner) {
  gameState.phase = 'GAME_END';
  clearTimeout(gameState.turnTimeout);

  // Generate winner wheel image
  const wheelImage = await generateWheelImage([winner], winner.userId);
  const attachment = new AttachmentBuilder(wheelImage, { name: 'winner.png' });

  await gameState.channel.send({
    content: MESSAGES.WINNER(`<@${winner.userId}>`),
    files: [attachment],
  });

  // Distribute rewards
  const reward = GAMES.ROULETTE?.baseReward ?? 12;
  try {
    await CurrencyService.addCoins(
      winner.userId,
      reward,
      'GAME_WIN',
      'ROULETTE',
      { sessionId: gameState.sessionId }
    );
  } catch (e) {
    logger.error(`[Roulette] Failed to give reward to ${winner.userId}:`, e);
  }

  // Cleanup
  activeGames.delete(gameState.sessionId);
  await SessionService.endSession(gameState.sessionId, winner.userId, 'COMPLETED');

  logger.info(`[Roulette] Game ended: ${gameState.sessionId} - Winner: ${winner.displayName}`);
}

/**
 * Cancel roulette game
 */
export function cancelRouletteGame(sessionId, reason = 'CANCELLED') {
  const gameState = activeGames.get(sessionId);
  if (!gameState) return false;

  clearTimeout(gameState.turnTimeout);
  activeGames.delete(sessionId);

  logger.info(`[Roulette] Game cancelled: ${sessionId} - Reason: ${reason}`);
  return true;
}

/**
 * Check if session has active game
 */
export function hasActiveGame(sessionId) {
  return activeGames.has(sessionId);
}

/**
 * Utility functions
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
