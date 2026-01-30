/**
 * /روليت - Roulette Game Command
 * Phase 6 Implementation
 *
 * An elimination game where a spinning wheel selects a player
 * who then chooses someone to eliminate.
 */

import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { randomInt } from 'crypto';
import { wrapCommand, Errors } from '../../../utils/commandWrapper.js';
import * as SessionService from '../../../services/games/session.service.js';
import * as CurrencyService from '../../../services/economy/currency.service.js';
import logger from '../../../utils/logger.js';
import { GAMES } from '../../../config/games.config.js';
import { GAME_SETTINGS, PERKS } from './constants.js';
import { generateWheelGif } from './WheelGenerator.js';
import * as Embeds from './embeds.js';
import * as Buttons from './buttons.js';
import * as PerksLogic from './perks.js';

const game = GAMES.ROULETTE;

// In-memory store for game-specific state (complements Redis session)
// Used for: kick selection timeouts, double kick state
// In-memory store for game-specific state (complements Redis session)
// Used for: kick selection timeouts, double kick state
const gameStates = new Map();

/**
 * Helper to update message safely (handles deferred state)
 */
async function safeUpdate(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.update(payload);
    }
  } catch (error) {
    logger.debug(`Failed to update message: ${error.message}`);
  }
}

/**
 * Get or create local game state
 */
function getGameState(sessionId) {
  if (!gameStates.has(sessionId)) {
    gameStates.set(sessionId, {
      currentKickerId: null,
      doubleKickActive: false,
      doubleKickFirstTarget: null,
      kickTimeout: null,
      currentRound: 0,
    });
  }
  return gameStates.get(sessionId);
}

/**
 * Clean up local game state
 */
function cleanupGameState(sessionId) {
  const state = gameStates.get(sessionId);
  if (state?.kickTimeout) {
    clearTimeout(state.kickTimeout);
  }
  gameStates.delete(sessionId);
}

/**
 * Helper to get display name from Discord user/member
 */
function getDisplayName(user, member = null) {
  return member?.displayName || user.globalName || user.username;
}

/**
 * Convert session players array to Map for easier manipulation
 */
function playersToMap(playersArray) {
  const map = new Map();
  for (const p of playersArray || []) {
    map.set(p.userId, p);
  }
  return map;
}

/**
 * Convert players Map back to array for session storage
 */
function playersToArray(playersMap) {
  return Array.from(playersMap.values());
}

/**
 * Get alive players from session
 */
function getAlivePlayers(session) {
  const players = session.gameState?.players || [];
  return players.filter(p => p.isAlive);
}

/**
 * Update the Redis session with current game state
 */
/**
 * Update the Redis session with current game state
 */
async function saveSessionState(session) {
  await SessionService.saveSession(session);
}

/**
 * Update lobby message with current state
 */
async function updateLobbyMessage(interaction, session) {
  const players = playersToMap(session.gameState?.players || []);
  const usedSlots = new Set([...players.values()].map(p => p.slotNumber));
  const remainingSeconds = SessionService.getRemainingCountdown(session);

  const embed = Embeds.createLobbyEmbed(session, remainingSeconds);
  const buttons = Buttons.createLobbyButtons(session.id, usedSlots);

  try {
    await safeUpdate(interaction, {
      embeds: [embed],
      components: buttons,
    });
  } catch (error) {
    // Interaction may have expired
    logger.debug('Failed to update lobby:', error.message);
  }
}

/**
 * Helper to cancel game and cleanup
 */
async function cancelGame(channel, session, reason) {
  const embed = Embeds.createCancelledEmbed(reason);
  await channel.send({ embeds: [embed] });
  await SessionService.cleanupSession(session.id);
  cleanupGameState(session.id);
}

/**
 * Start the game after lobby countdown
 */
async function startGame(channel, session) {
  const alivePlayers = getAlivePlayers(session);

  if (alivePlayers.length < GAME_SETTINGS.minPlayers) {
    // Not enough players - cancel
    await cancelGame(channel, session, 'not_enough_players');
    return;
  }

  // Start the game
  const result = await SessionService.startGame(session);
  if (result.error) {
    logger.error('Failed to start roulette game:', result.error);
    const embed = Embeds.createCancelledEmbed('error');
    await channel.send({ embeds: [embed] });
    await SessionService.cleanupSession(session.id);
    cleanupGameState(session.id);
    return;
  }

  session = result.session;

  // Send game starting message
  const startEmbed = Embeds.createGameStartEmbed();
  await channel.send({ embeds: [startEmbed] });

  // Wait 3 seconds then start first round
  await sleep(3000);

  await runSpinRound(channel, session);
}

/**
 * Run a single spin round
 */
async function runSpinRound(channel, session) {
  // Re-fetch session to get latest state
  session = await SessionService.getSession(session.id);
  if (!session || session.status !== 'ACTIVE') {
    cleanupGameState(session?.id);
    return;
  }

  const alivePlayers = getAlivePlayers(session);
  const localState = getGameState(session.id);
  localState.currentRound++;

  // Check if we're at final round (2 players)
  if (alivePlayers.length === 2) {
    await runFinalRound(channel, session, alivePlayers);
    return;
  }

  // Send round embed
  const roundEmbed = Embeds.createRoundEmbed(localState.currentRound, alivePlayers);
  await channel.send({ embeds: [roundEmbed] });

  // Pre-select random winner
  const winnerIndex = randomInt(alivePlayers.length);
  const chosenPlayer = alivePlayers[winnerIndex];

  // Generate and send wheel GIF
  try {
    const gifBuffer = await generateWheelGif(alivePlayers, winnerIndex);
    const attachment = new AttachmentBuilder(gifBuffer, { name: 'wheel.gif' });

    await channel.send({ files: [attachment] });
  } catch (error) {
    logger.error('Failed to generate wheel GIF:', error);
    // Continue without GIF - send a text fallback
    await channel.send({ content: '🎡 *جاري تدوير العجلة...*' });
  }

  // Wait for GIF animation (approx 3 seconds)
  await sleep(3500);

  // Announce chosen player
  const chosenEmbed = Embeds.createChosenEmbed(chosenPlayer, localState.currentRound);
  await channel.send({ embeds: [chosenEmbed] });

  // Start kick selection
  await startKickSelection(channel, session, chosenPlayer);
}

/**
 * Start the kick selection phase
 */
async function startKickSelection(channel, session, kickerPlayer) {
  const localState = getGameState(session.id);
  localState.currentKickerId = kickerPlayer.userId;
  localState.doubleKickActive = false;
  localState.doubleKickFirstTarget = null;
  localState.kickDeadline = Date.now() + 30000;

  // Get potential targets (everyone except kicker)
  const alivePlayers = getAlivePlayers(session);
  const targetPlayers = alivePlayers.filter(p => p.userId !== kickerPlayer.userId);

  // Check if kicker can afford double kick
  const { canBuy } = await PerksLogic.canBuyDoubleKick(kickerPlayer.userId);

  // Create kick selection embed and buttons
  const kickEmbed = Embeds.createKickSelectionEmbed(kickerPlayer, targetPlayers);
  const kickButtons = Buttons.createKickButtons(session.id, targetPlayers, canBuy, PERKS.DOUBLE_KICK.cost, localState.currentRound);

  await channel.send({
    content: `<@${kickerPlayer.userId}>`,
    embeds: [kickEmbed],
    components: kickButtons,
  });

  // Set timeout for kick selection (30 seconds)
  localState.kickTimeout = setTimeout(async () => {
    await handleKickTimeout(channel, session, kickerPlayer);
  }, 30000);

  // Allow re-hydration of timeout on restart
  await saveSessionState(session);
}

/**
 * Handle kick timeout - kicker gets eliminated
 */
async function handleKickTimeout(channel, session, kickerPlayer) {
  const localState = getGameState(session.id);
  localState.kickTimeout = null;

  // Refresh session
  session = await SessionService.getSession(session.id);
  if (!session || session.status !== 'ACTIVE') return;

  // Check if kick was already handled
  if (localState.currentKickerId !== kickerPlayer.userId) return;

  // Eliminate the kicker
  await eliminatePlayer(channel, session, kickerPlayer.userId, 'timeout');
}

/**
 * Eliminate a player and continue the game
 */
async function eliminatePlayer(channel, session, userId, reason = 'kicked') {
  const localState = getGameState(session.id);

  // Clear any pending timeout
  if (localState.kickTimeout) {
    clearTimeout(localState.kickTimeout);
    localState.kickTimeout = null;
  }

  // Reset kicker state
  localState.currentKickerId = null;

  // Refresh session
  session = await SessionService.getSession(session.id);
  if (!session) return;

  // Find and mark player as eliminated
  const players = session.gameState?.players || [];
  const playerIndex = players.findIndex(p => p.userId === userId);

  if (playerIndex === -1) return;

  const eliminatedPlayer = players[playerIndex];
  players[playerIndex].isAlive = false;

  // Update session in Redis
  session.gameState.players = players;
  await saveSessionState(session);

  // Send elimination message
  const elimEmbed = Embeds.createEliminationEmbed(eliminatedPlayer, reason);
  await channel.send({ embeds: [elimEmbed] });

  // Wait before next round
  await sleep(3000);

  // Check alive count
  const alivePlayers = players.filter(p => p.isAlive);

  if (alivePlayers.length <= 1) {
    // Game over - announce winner
    if (alivePlayers.length === 1) {
      await announceWinner(channel, session, alivePlayers[0]);
    } else {
      // No winners (shouldn't happen)
      await SessionService.endSession(session.id, null, 'NO_WINNER');
      cleanupGameState(session.id);
    }
  } else if (alivePlayers.length === 2) {
    // Final round
    await runFinalRound(channel, session, alivePlayers);
  } else {
    // Continue with next round
    await runSpinRound(channel, session);
  }
}

/**
 * Run the final round (2 players left)
 */
async function runFinalRound(channel, session, finalPlayers) {
  // Send final round announcement
  const finalEmbed = Embeds.createFinalRoundEmbed(finalPlayers[0], finalPlayers[1]);
  await channel.send({ embeds: [finalEmbed] });

  await sleep(2000);

  // Generate wheel with 2 players - winner is whoever it lands on
  const winnerIndex = randomInt(2);
  const winner = finalPlayers[winnerIndex];

  // Generate and send final wheel GIF
  try {
    const gifBuffer = await generateWheelGif(finalPlayers, winnerIndex);
    const attachment = new AttachmentBuilder(gifBuffer, { name: 'final-wheel.gif' });
    await channel.send({ files: [attachment] });
  } catch (error) {
    logger.error('Failed to generate final wheel GIF:', error);
    await channel.send({ content: '🎡 *جاري تدوير العجلة النهائية...*' });
  }

  await sleep(3500);

  // Announce winner
  await announceWinner(channel, session, winner);
}

/**
 * Announce winner and distribute rewards
 */
async function announceWinner(channel, session, winner) {
  const localState = getGameState(session.id);
  const reward = GAME_SETTINGS.baseReward;

  try {
    // Award coins to winner
    const result = await CurrencyService.awardGameWin(
      winner.userId,
      reward,
      'ROULETTE',
      { sessionId: session.id, round: localState?.currentRound }
    );

    // Send winner embed
    const winEmbed = Embeds.createWinnerEmbed(winner, reward, result.newBalance);
    const winButtons = Buttons.createWinnerButtons(session.id, result.newBalance, reward, localState?.currentRound || 0);

    await channel.send({
      content: `<@${winner.userId}>`,
      embeds: [winEmbed],
      components: winButtons,
    });
  } catch (error) {
    logger.error('Failed to award winner:', error);

    // Still show winner even if coin award fails
    const winEmbed = Embeds.createWinnerEmbed(winner, reward, 0);
    await channel.send({
      content: `<@${winner.userId}>`,
      embeds: [winEmbed],
    });
  }

  // End session
  await SessionService.endSession(session.id, winner.userId, 'COMPLETED');
  cleanupGameState(session.id);
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================
// COMMAND EXPORT
// ========================================

export default wrapCommand({
  data: new SlashCommandBuilder()
    .setName(game.command)
    .setDescription(game.description),

  async execute(interaction) {
    const channelId = interaction.channelId;
    const user = interaction.user;
    const member = interaction.member;

    // Create session using the session service
    const result = await SessionService.createSession({
      gameType: 'ROULETTE',
      guildId: interaction.guildId,
      channelId,
      user,
      member,
    });

    if (result.error) {
      if (result.error === 'CHANNEL_HAS_GAME') {
        throw new Errors.GameError('GAME_IN_PROGRESS');
      }
      throw new Errors.BotError(`Failed to create session: ${result.error}`);
    }

    const session = result;

    // Initialize game state with players array
    session.gameState = {
      players: [],
    };

    // Add host as first player with a random slot
    const hostSlot = randomInt(GAME_SETTINGS.maxSlots) + 1;
    session.gameState.players.push({
      userId: user.id,
      displayName: getDisplayName(user, member),
      slotNumber: hostSlot,
      isAlive: true,
      perks: [],
    });

    // Create lobby embed
    const usedSlots = new Set([hostSlot]);
    const remainingSeconds = SessionService.getRemainingCountdown(session);
    const embed = Embeds.createLobbyEmbed(session, remainingSeconds);
    const buttons = Buttons.createLobbyButtons(session.id, usedSlots);

    // Send lobby message
    const reply = await interaction.reply({
      embeds: [embed],
      components: buttons,
      fetchReply: true,
    });

    // Update session with message ID
    await SessionService.setMessageId(session.id, reply.id);

    // Set up lobby timeout
    const timeoutMs = GAME_SETTINGS.lobbyTimeout * 1000;
    setTimeout(async () => {
      try {
        // Re-fetch session to get latest state
        const currentSession = await SessionService.getSession(session.id);

        // If session is still waiting, try to start
        if (currentSession && currentSession.status === 'WAITING') {
          // Double check player count here before calling startGame to be safe
          const players = currentSession.gameState?.players || [];
          const alivePlayers = players.filter(p => p.isAlive);

          if (alivePlayers.length < GAME_SETTINGS.minPlayers) {
            await cancelGame(interaction.channel, session, 'not_enough_players');
          } else {
            await startGame(interaction.channel, currentSession);
          }
        }
      } catch (error) {
        logger.error('Error in lobby timeout:', error);
      }
    }, timeoutMs);

    // Update countdown display periodically
    const countdownInterval = setInterval(async () => {
      const currentSession = await SessionService.getSession(session.id);
      if (!currentSession || currentSession.status !== 'WAITING') {
        clearInterval(countdownInterval);
        return;
      }

      const remaining = SessionService.getRemainingCountdown(currentSession);
      if (remaining <= 0) {
        clearInterval(countdownInterval);
        return;
      }

      // Update embed with new countdown (every 10 seconds)
      try {
        const players = playersToMap(currentSession.gameState?.players || []);
        const usedSlots = new Set([...players.values()].map(p => p.slotNumber));
        const embed = Embeds.createLobbyEmbed(currentSession, remaining);
        const buttons = Buttons.createLobbyButtons(currentSession.id, usedSlots);

        await reply.edit({
          embeds: [embed],
          components: buttons,
        });
      } catch (err) {
        clearInterval(countdownInterval);
      }
    }, 10000);
  },

  async handleButton(interaction, sessionId, action) {
    // 1. IMMEDIATE DEFER (CRITICAL FIX)
    // Acknowledge the interaction instantly to prevent "Interaction Failed"
    // This gives us 15 minutes to process the logic
    await interaction.deferUpdate();

    const parts = action.split(':');
    const mainAction = parts[0];
    // Check if parts exist before accessing
    const roundStr = parts.length > 2 ? parts[parts.length - 1] : '0';
    const round = parseInt(roundStr) || 0;

    // 2. CONCURRENCY LOCK
    const lockKey = `lock:roulette:${sessionId}:${interaction.user.id}`;
    const acquired = await SessionService.RedisService.acquireLock(lockKey, 2);
    if (!acquired) {
      // User is spamming buttons
      // Since we deferred, we can't reply ephemeral. We just ignore or followUp.
      // Ignoring is better UX for spam clicks.
      return;
    }

    try {
      const session = await SessionService.getSession(sessionId);

      if (!session) {
        return interaction.followUp({
          content: '❌ انتهت هذه اللعبة',
          ephemeral: true,
        });
      }

      // 3. STALE CLICK GUARD
      const localState = getGameState(sessionId);
      const isLobby = session.status === 'WAITING';

      // If we are in game, validate round
      // If lobby, round is usually 0.
      if (!isLobby && localState && localState.currentRound !== round) {
        // Only strict check for game actions, not lobby actions
        // But some buttons might not have round yet if they were old. 
        // We will assume if round is passed, it must match.
        // For backwards compat with old buttons in chat, we skip check if round is 0/undefined in action
        if (round > 0 && round !== localState.currentRound) {
          return interaction.followUp({
            content: '❌ هذا الزر قديم (الجولة انتهت)',
            ephemeral: true
          });
        }
      }

      // Route to appropriate handler
      switch (mainAction) {
        case 'slot':
          await handleSlotSelection(interaction, session, parseInt(parts[1]));
          break;
        case 'random':
          await handleRandomJoin(interaction, session);
          break;
        case 'leave':
          await handleLeave(interaction, session);
          break;
        case 'shop':
          await handleShop(interaction, session);
          break;
        case 'buy':
          await handlePerkPurchase(interaction, session, parts[1]);
          break;
        case 'shop_close':
          await handleShopClose(interaction);
          break;
        case 'kick':
          await handleKick(interaction, session, parts[1]);
          break;
        case 'kick2':
          await handleSecondKick(interaction, session, parts[1]);
          break;
        case 'selfkick':
          await handleSelfKick(interaction, session);
          break;
        case 'randomkick':
          await handleRandomKick(interaction, session);
          break;
        case 'doublekick':
          await handleDoubleKickPurchase(interaction, session);
          break;
        case 'skip_double':
          await handleSkipDoubleKick(interaction, session);
          break;
        case 'claim':
          // Just a visual button, do nothing (or show balance)
          break;
        default:
          // Unknown action
          break;
      }
    } finally {
      // Release lock
      SessionService.RedisService.releaseLock(lockKey);
    }
  },
});

// ========================================
// BUTTON HANDLERS
// ========================================

async function handleSlotSelection(interaction, session, slotNumber) {
  if (session.status !== 'WAITING') {
    return interaction.followUp({ // Was reply
      content: '❌ اللعبة بدأت بالفعل',
      ephemeral: true,
    });
  }

  const userId = interaction.user.id;
  const players = playersToMap(session.gameState?.players || []);

  // Check if player is already in game
  if (players.has(userId)) {
    return interaction.followUp({ // Was reply
      content: '❌ أنت موجود بالفعل في اللعبة',
      ephemeral: true,
    });
  }

  // Check if slot is taken
  const usedSlots = new Set([...players.values()].map(p => p.slotNumber));
  if (usedSlots.has(slotNumber)) {
    return interaction.followUp({ // Was reply
      content: '❌ هذا الرقم محجوز',
      ephemeral: true,
    });
  }

  // Check if game is full
  if (players.size >= GAME_SETTINGS.maxPlayers) {
    return interaction.followUp({ // Was reply
      content: '❌ اللعبة ممتلئة',
      ephemeral: true,
    });
  }

  // Add player
  // Add player
  players.set(userId, {
    userId: userId,
    displayName: getDisplayName(interaction.user, interaction.member),
    slotNumber,
    isAlive: true,
    perks: [],
  });

  // Update session
  session.gameState.players = playersToArray(players);
  await saveSessionState(session);

  // Update lobby display
  await updateLobbyMessage(interaction, session);
}

async function handleRandomJoin(interaction, session) {
  if (session.status !== 'WAITING') {
    return interaction.followUp({ // Was reply
      content: '❌ اللعبة بدأت بالفعل',
      ephemeral: true,
    });
  }

  const userId = interaction.user.id;
  const players = playersToMap(session.gameState?.players || []);

  if (players.has(userId)) {
    return interaction.followUp({ // Was reply
      content: '❌ أنت موجود بالفعل في اللعبة',
      ephemeral: true,
    });
  }

  if (players.size >= GAME_SETTINGS.maxPlayers) {
    return interaction.followUp({ // Was reply
      content: '❌ اللعبة ممتلئة',
      ephemeral: true,
    });
  }

  // Find random available slot
  const usedSlots = new Set([...players.values()].map(p => p.slotNumber));
  const availableSlots = [];
  for (let i = 1; i <= GAME_SETTINGS.maxSlots; i++) {
    if (!usedSlots.has(i)) availableSlots.push(i);
  }

  if (availableSlots.length === 0) {
    return interaction.followUp({ // Was reply
      content: '❌ لا توجد أرقام متاحة',
      ephemeral: true,
    });
  }

  const randomSlot = availableSlots[randomInt(availableSlots.length)];

  // Add player
  // Add player
  players.set(userId, {
    userId: userId,
    displayName: getDisplayName(interaction.user, interaction.member),
    slotNumber: randomSlot,
    isAlive: true,
    perks: [],
  });

  session.gameState.players = playersToArray(players);
  await saveSessionState(session);
  await updateLobbyMessage(interaction, session);
}

async function handleLeave(interaction, session) {
  if (session.status !== 'WAITING') {
    return interaction.followUp({ // Was reply
      content: '❌ لا يمكنك المغادرة بعد بدء اللعبة',
      ephemeral: true,
    });
  }

  const userId = interaction.user.id;
  const players = playersToMap(session.gameState?.players || []);

  if (!players.has(userId)) {
    return interaction.followUp({ // Was reply
      content: '❌ أنت لست في هذه اللعبة',
      ephemeral: true,
    });
  }

  // Check if host is leaving
  const isHost = session.hostId === userId;

  // Remove player
  players.delete(userId);
  session.gameState.players = playersToArray(players);

  // If host leaves and no players remain, clean up
  if (players.size === 0) {
    await SessionService.cleanupSession(session.id);
    cleanupGameState(session.id);

    return interaction.editReply({ // Was update
      content: '🚪 تم إلغاء اللعبة - لا يوجد لاعبين',
      embeds: [],
      components: [],
    });
  }

  // If host leaves, transfer to first remaining player
  if (isHost && players.size > 0) {
    const newHostId = [...players.keys()][0];
    session.hostId = newHostId;
  }

  await updateLobbyMessage(interaction, session);
}

async function handleShop(interaction, session) {
  if (session.status !== 'WAITING') {
    return interaction.followUp({ // Was reply
      content: '❌ المتجر متاح فقط قبل بدء اللعبة',
      ephemeral: true,
    });
  }

  const userId = interaction.user.id;
  const players = playersToMap(session.gameState?.players || []);

  if (!players.has(userId)) {
    return interaction.followUp({ // Was reply
      content: '❌ انضم للعبة أولاً',
      ephemeral: true,
    });
  }

  const ownedPerks = PerksLogic.getOwnedPerks(players, userId);

  const shopEmbed = Embeds.createShopEmbed(userId, ownedPerks);
  const shopButtons = Buttons.createShopButtons(session.id, ownedPerks);

  await interaction.followUp({ // Was reply
    embeds: [shopEmbed],
    components: shopButtons,
    ephemeral: true,
  });
}

async function handlePerkPurchase(interaction, session, perkId) {
  const userId = interaction.user.id;

  // Refetch session
  session = await SessionService.getSession(session.id);
  if (!session) {
    return interaction.followUp({ // Was reply
      content: '❌ انتهت اللعبة',
      ephemeral: true,
    });
  }

  const players = playersToMap(session.gameState?.players || []);

  if (!players.has(userId)) {
    return interaction.followUp({ // Was reply
      content: '❌ أنت لست في هذه اللعبة',
      ephemeral: true,
    });
  }

  // Check if already owns perk
  if (PerksLogic.hasActivePerk(players, userId, perkId)) {
    return interaction.reply({
      content: '❌ لديك هذا البيرك بالفعل',
      ephemeral: true,
    });
  }

  // Purchase perk
  const result = await PerksLogic.purchasePerk(userId, perkId, session.id);

  if (!result.success) {
    if (result.error === 'INSUFFICIENT_BALANCE') {
      const balance = await CurrencyService.getBalance(userId);
      throw new Errors.InsufficientBalanceError(PERKS[perkId]?.cost || 0, balance);
    }
    return interaction.reply({
      content: '❌ فشل شراء البيرك',
      ephemeral: true,
    });
  }

  // Add perk to player
  PerksLogic.addPerk(players, userId, perkId);
  session.gameState.players = playersToArray(players);
  await saveSessionState(session);

  // Update the owned perks and refresh shop buttons
  const ownedPerks = PerksLogic.getOwnedPerks(players, userId);
  const shopEmbed = Embeds.createShopEmbed(userId, ownedPerks);
  const shopButtons = Buttons.createShopButtons(session.id, ownedPerks);

  await interaction.update({
    embeds: [shopEmbed],
    components: shopButtons,
  });
}

async function handleShopClose(interaction) {
  await interaction.update({
    content: '✅ تم إغلاق المتجر',
    embeds: [],
    components: [],
  });
}

async function handleKick(interaction, session, targetId) {
  const localState = getGameState(session.id);
  const userId = interaction.user.id;

  // Verify it's the kicker's turn
  if (localState.currentKickerId !== userId) {
    return interaction.reply({
      content: '❌ ليس دورك للاختيار',
      ephemeral: true,
    });
  }

  // Clear timeout
  if (localState.kickTimeout) {
    clearTimeout(localState.kickTimeout);
    localState.kickTimeout = null;
  }

  // Get fresh session
  session = await SessionService.getSession(session.id);
  const players = playersToMap(session.gameState?.players || []);

  // Verify target is valid
  if (!players.has(targetId) || !players.get(targetId).isAlive) {
    return interaction.reply({
      content: '❌ لاعب غير صالح',
      ephemeral: true,
    });
  }

  // If double kick is active and we have a first target, this is the second kick
  if (localState.doubleKickActive && localState.doubleKickFirstTarget) {
    // Process second kick
    const kickResult = PerksLogic.processKick(players, userId, targetId);

    session.gameState.players = playersToArray(players);

    await interaction.update({
      content: '✅ تم الاختيار',
      embeds: [],
      components: [],
    });

    if (kickResult.eliminated === userId) {
      // Reflected kick eliminated the kicker - end turn immediately
      localState.doubleKickActive = false;
      localState.doubleKickFirstTarget = null;
      localState.currentKickerId = null;
      await eliminatePlayer(interaction.channel, session, kickResult.eliminated, kickResult.reason);
      return;
    }

    if (kickResult.extraLifeUsed && !kickResult.eliminated) {
      // Target survived with extra life
      const extraLifeUserId = kickResult.shieldUsed ? userId : targetId;
      const targetPlayer = players.get(extraLifeUserId);
      const lifeEmbed = Embeds.createExtraLifeEmbed(targetPlayer);
      await interaction.channel.send({ embeds: [lifeEmbed] });
    } else if (kickResult.eliminated) {
      localState.doubleKickActive = false;
      localState.doubleKickFirstTarget = null;
      localState.currentKickerId = null;
      await eliminatePlayer(interaction.channel, session, kickResult.eliminated, kickResult.reason);
      return;
    }

    // Reset double kick state and continue
    localState.doubleKickActive = false;
    localState.doubleKickFirstTarget = null;
    localState.currentKickerId = null;

    await sleep(2000);
    await runSpinRound(interaction.channel, session);
    return;
  }

  // Process kick with perk logic
  const kickResult = PerksLogic.processKick(players, userId, targetId);

  session.gameState.players = playersToArray(players);

  await interaction.update({
    content: '✅ تم الاختيار',
    embeds: [],
    components: [],
  });

  if (kickResult.eliminated === userId) {
    // Reflected kick eliminated the kicker - end turn immediately
    localState.doubleKickActive = false;
    localState.doubleKickFirstTarget = null;
    localState.currentKickerId = null;
    await eliminatePlayer(interaction.channel, session, kickResult.eliminated, kickResult.reason);
    return;
  }

  if (kickResult.extraLifeUsed && !kickResult.eliminated) {
    // Target survived with extra life
    const extraLifeUserId = kickResult.shieldUsed ? userId : targetId;
    const targetPlayer = players.get(extraLifeUserId);
    const lifeEmbed = Embeds.createExtraLifeEmbed(targetPlayer);
    await interaction.channel.send({ embeds: [lifeEmbed] });

    // If double kick was just activated, prompt for second target
    if (localState.doubleKickActive && !localState.doubleKickFirstTarget) {
      localState.doubleKickFirstTarget = targetId;

      // Get remaining targets
      const alivePlayers = getAlivePlayers(session);
      const remainingTargets = alivePlayers.filter(
        p => p.userId !== userId && p.userId !== targetId
      );

      if (remainingTargets.length > 0) {
        const doubleEmbed = Embeds.createDoubleKickPromptEmbed(
          players.get(userId),
          players.get(targetId)
        );
        const doubleButtons = Buttons.createDoubleKickButtons(session.id, remainingTargets, localState.currentRound);

        await interaction.channel.send({
          embeds: [doubleEmbed],
          components: doubleButtons,
        });
        return;
      }
    }

    // Continue to next round
    localState.currentKickerId = null;
    await sleep(3000);
    await runSpinRound(interaction.channel, session);
  } else if (kickResult.eliminated) {
    // Check if double kick is active and this was the first target
    if (localState.doubleKickActive && !localState.doubleKickFirstTarget) {
      localState.doubleKickFirstTarget = kickResult.eliminated;

      // Eliminate first target
      const eliminatedPlayer = players.get(kickResult.eliminated);
      players.get(kickResult.eliminated).isAlive = false;
      session.gameState.players = playersToArray(players);

      const elimEmbed = Embeds.createEliminationEmbed(eliminatedPlayer, kickResult.reason);
      await interaction.channel.send({ embeds: [elimEmbed] });

      // Get remaining targets for second kick
      const alivePlayers = playersToArray(players).filter(p => p.isAlive);
      const remainingTargets = alivePlayers.filter(p => p.userId !== userId);

      if (remainingTargets.length > 0 && alivePlayers.length > 2) {
        // Prompt for second kick
        const doubleEmbed = Embeds.createDoubleKickPromptEmbed(
          players.get(userId),
          eliminatedPlayer
        );
        const doubleButtons = Buttons.createDoubleKickButtons(session.id, remainingTargets, localState.currentRound);

        await interaction.channel.send({
          embeds: [doubleEmbed],
          components: doubleButtons,
        });

        // Set timeout for second kick
        localState.kickTimeout = setTimeout(async () => {
          // Skip second kick on timeout
          localState.doubleKickActive = false;
          localState.doubleKickFirstTarget = null;
          localState.currentKickerId = null;
          localState.kickTimeout = null;

          await sleep(2000);
          const freshSession = await SessionService.getSession(session.id);
          if (freshSession && freshSession.status === 'ACTIVE') {
            await runSpinRound(interaction.channel, freshSession);
          }
        }, 30000);

        return;
      }
    }

    // Normal elimination
    await eliminatePlayer(interaction.channel, session, kickResult.eliminated, kickResult.reason);
  }
}

async function handleSecondKick(interaction, session, targetId) {
  // Same logic as handleKick for the second target
  await handleKick(interaction, session, targetId);
}

async function handleSelfKick(interaction, session) {
  const localState = getGameState(session.id);
  const userId = interaction.user.id;

  if (localState.currentKickerId !== userId) {
    return interaction.reply({
      content: '❌ ليس دورك للاختيار',
      ephemeral: true,
    });
  }

  // Clear timeout
  if (localState.kickTimeout) {
    clearTimeout(localState.kickTimeout);
    localState.kickTimeout = null;
  }

  await interaction.update({
    content: '🏳️ اخترت الانسحاب...',
    embeds: [],
    components: [],
  });

  // Eliminate self
  await eliminatePlayer(interaction.channel, session, userId, 'self_kick');
}

async function handleRandomKick(interaction, session) {
  const localState = getGameState(session.id);
  const userId = interaction.user.id;

  if (localState.currentKickerId !== userId) {
    return interaction.reply({
      content: '❌ ليس دورك للاختيار',
      ephemeral: true,
    });
  }

  // Get alive players except kicker
  session = await SessionService.getSession(session.id);
  const alivePlayers = getAlivePlayers(session).filter(p => p.userId !== userId);

  if (alivePlayers.length === 0) {
    return interaction.reply({
      content: '❌ لا يوجد لاعبين لطردهم',
      ephemeral: true,
    });
  }

  // Select random target
  const randomTarget = alivePlayers[randomInt(alivePlayers.length)];

  // Use normal kick handler
  await handleKick(interaction, session, randomTarget.userId);
}

async function handleDoubleKickPurchase(interaction, session) {
  const localState = getGameState(session.id);
  const userId = interaction.user.id;

  if (localState.currentKickerId !== userId) {
    return interaction.reply({
      content: '❌ ليس دورك للاختيار',
      ephemeral: true,
    });
  }

  // Purchase double kick
  const result = await PerksLogic.purchaseDoubleKick(userId, session.id);

  if (!result.success) {
    if (result.error === 'INSUFFICIENT_BALANCE') {
      const balance = await CurrencyService.getBalance(userId);
      throw new Errors.InsufficientBalanceError(PERKS.DOUBLE_KICK.cost, balance);
    }
    return interaction.reply({
      content: '❌ فشل شراء الطرد المزدوج',
      ephemeral: true,
    });
  }

  // Activate double kick
  localState.doubleKickActive = true;

  await interaction.reply({
    content: `🔥 اشتريت **طرد مرتين**! اختر اللاعب الأول للطرد.\n💰 الرصيد: **${result.newBalance}** عملة`,
    ephemeral: true,
  });
}

async function handleSkipDoubleKick(interaction, session) {
  const localState = getGameState(session.id);
  const userId = interaction.user.id;

  if (localState.currentKickerId !== userId) {
    return interaction.reply({
      content: '❌ ليس دورك للاختيار',
      ephemeral: true,
    });
  }

  // Clear timeout
  if (localState.kickTimeout) {
    clearTimeout(localState.kickTimeout);
    localState.kickTimeout = null;
  }

  // Reset double kick state
  localState.doubleKickActive = false;
  localState.doubleKickFirstTarget = null;
  localState.currentKickerId = null;

  await interaction.update({
    content: '⏭️ تم تخطي الطرد الثاني',
    embeds: [],
    components: [],
  });

  // Continue to next round
  await sleep(2000);
  session = await SessionService.getSession(session.id);
  if (session && session.status === 'ACTIVE') {
    await runSpinRound(interaction.channel, session);
  }
}
