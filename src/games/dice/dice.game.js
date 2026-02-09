/**
 * Lucky Dice Game - Main Game Logic
 *
 * Uses v1 button format via game framework
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} from 'discord.js';
import { randomInt } from 'crypto';
import * as SessionService from '../../services/games/session.service.js';
import { buttonRouter, codec } from '../../framework/index.js';
import { awardGameWinners } from '../../services/economy/rewards.service.js';
import { recordGameResult } from '../../services/economy/transaction.service.js';
import {
  rollDie,
  performSecondRoll,
  assignTeams,
  initializePlayerState,
  calculateTeamScore,
  calculateTeamRoundScore,
  calculateHandicapMultipliers,
} from './dice.mechanics.js';
import {
  generateDiceImage,
  generateRoundSummary,
  generateGameResult,
  generateTeamAnnouncement,
} from './dice.images.js';
import {
  MESSAGES,
  TOTAL_ROUNDS,
  TURN_TIMEOUT_MS,
  BLOCK_TIMEOUT_MS,
} from './dice.constants.js';
import { DICE_TIMERS } from '../../config/timers.config.js';
import GameTimer from '../../utils/GameTimer.js';
import logger from '../../utils/logger.js';

// Store active games (sessionId -> game state)
const activeGames = new Map();
const DECISION_FEEDBACK_DELAY_MS = 1200;

/**
 * Atomic phase transition — auto-clears turn and block timers.
 */
function changePhase(gameState, newPhase) {
  gameState.turnTimer.clear();
  gameState.blockTimer.clear();
  gameState.phase = newPhase;
}

function formatMultiplierLine(multiplier, finalScore) {
  if (!Number.isFinite(multiplier) || multiplier === 1) return '';
  return `\n⚖️ ×${multiplier.toFixed(1)} = **${finalScore}**`;
}

async function bumpUiVersion(ctx, gameState) {
  if (!ctx?.commit) return;
  try {
    await ctx.commit();
    gameState.uiVersion = ctx.session?.uiVersion || 0;
  } catch (error) {
    logger.error('[Dice] Failed to sync uiVersion:', error);
  }
}

/**
 * Register dice handler with ButtonRouter
 */
export function registerDiceHandler() {
  buttonRouter.register('DICE', {
    onAction: handleDiceAction
  });
  logger.info('[Dice] Handler registered with ButtonRouter');
}

/**
 * Handle button actions from framework
 * @param {Object} ctx - Context from ButtonRouter
 */
async function handleDiceAction(ctx) {
  const { session, player, action, details, interaction } = ctx;
  const gameState = activeGames.get(session.id);

  if (!gameState) {
    return; // Game not active
  }

  switch (action) {
    case 'roll':
      await handleRollAgainFromCtx(ctx, gameState);
      break;
    case 'skip':
      await handleSkipFromCtx(ctx, gameState);
      break;
    case 'block':
      await handleBlockTargetFromCtx(ctx, gameState, details);
      break;
    default:
      logger.debug(`[Dice] Unknown action: ${action}`);
  }
}

/**
 * Handle roll action from ButtonRouter context
 */
async function handleRollAgainFromCtx(ctx, gameState) {
  const { player, interaction } = ctx;

  // Verify it's the correct player
  if (gameState.turnState?.playerId !== player.id) {
    await interaction.followUp({ content: '❌ ليس دورك!', ephemeral: true });
    return;
  }

  if (gameState.turnState?.waiting !== 'DECISION') {
    await interaction.followUp({ content: '❌ لا يمكنك الضغط الآن', ephemeral: true });
    return;
  }

  // Clear timeout
  gameState.turnTimer.clear();

  const currentPlayer = getCurrentPlayer(gameState);
  const firstRoll = gameState.turnState.firstRoll;

  // Perform second roll
  const secondRoll = performSecondRoll(firstRoll, currentPlayer.hasBetterLuck);
  gameState.turnState.secondRoll = secondRoll;
  gameState.turnState.waiting = null;

  // Increment uiVersion for stale-click detection
  await bumpUiVersion(ctx, gameState);

  // Show immediate feedback
  try {
    await interaction.message.edit({
      components: [buildDecisionButtons(gameState, 'ROLL', true)]
    });
  } catch (error) {
    logger.warn('[Dice] Failed to update UI after roll:', error.message);
  }

  await delay(DECISION_FEEDBACK_DELAY_MS);
  if (isGameCancelled(gameState)) return;

  // Generate second roll image
  let imageName;
  if (secondRoll.type === 'NORMAL') {
    imageName = secondRoll.value;
  } else if (secondRoll.type === 'MODIFIER') {
    imageName = secondRoll.display;
  } else {
    imageName = secondRoll.type;
  }
  const diceImage = await generateDiceImage(imageName);
  const attachment = new AttachmentBuilder(diceImage, { name: 'dice2.png' });

  // Handle different outcomes
  switch (secondRoll.type) {
    case 'X2':
      await handleX2(interaction, gameState, currentPlayer, firstRoll, attachment);
      break;
    case 'BLOCK':
      await handleBlock(interaction, gameState, currentPlayer, firstRoll, attachment);
      break;
    case 'ZERO':
      await handleZero(interaction, gameState, currentPlayer, attachment);
      break;
    case 'MODIFIER':
      await handleModifier(interaction, gameState, currentPlayer, firstRoll, secondRoll, attachment);
      break;
    case 'NORMAL':
    default:
      await handleNormalSecond(interaction, gameState, currentPlayer, secondRoll, attachment);
      break;
  }
}

/**
 * Handle skip action from ButtonRouter context
 */
async function handleSkipFromCtx(ctx, gameState) {
  const { player, interaction } = ctx;

  if (gameState.turnState?.playerId !== player.id) {
    await interaction.followUp({ content: '❌ ليس دورك!', ephemeral: true });
    return;
  }

  if (gameState.turnState?.waiting !== 'DECISION') {
    await interaction.followUp({ content: '❌ لا يمكنك الضغط الآن', ephemeral: true });
    return;
  }

  // Clear timeout to avoid double-processing on edge timing
  gameState.turnTimer.clear();

  // Increment uiVersion for stale-click detection
  await bumpUiVersion(ctx, gameState);

  try {
    await interaction.message.edit({
      components: [buildDecisionButtons(gameState, 'SKIP', true)]
    });
  } catch (error) {
    logger.warn('[Dice] Failed to update UI after skip:', error.message);
  }

  await delay(DECISION_FEEDBACK_DELAY_MS);
  if (isGameCancelled(gameState)) return;

  const currentPlayer = getCurrentPlayer(gameState);
  await handleSkip(gameState, currentPlayer, interaction.message, false);
}

/**
 * Handle block target selection from ButtonRouter context
 */
async function handleBlockTargetFromCtx(ctx, gameState, targetId) {
  const { player, interaction } = ctx;

  if (gameState.turnState?.playerId !== player.id) {
    await interaction.followUp({ content: '❌ ليس دورك!', ephemeral: true });
    return;
  }

  if (gameState.turnState?.waiting !== 'BLOCK_TARGET') {
    await interaction.followUp({ content: '❌ لا يمكنك الضغط الآن', ephemeral: true });
    return;
  }

  gameState.blockTimer.clear();

  const currentPlayer = getCurrentPlayer(gameState);
  const oppositeTeam = gameState.phase === 'TEAM_A' ? gameState.teamB : gameState.teamA;
  const teamLetter = gameState.phase === 'TEAM_A' ? 'B' : 'A';
  const target = oppositeTeam.find(p => p.userId === targetId);

  if (!target) {
    await interaction.followUp({ content: '❌ لاعب غير موجود', ephemeral: true });
    return;
  }

  const firstRoll = gameState.turnState.firstRoll;
  const turnScore = applyMultiplier(firstRoll, currentPlayer.scoreMultiplier);
  const multiplierLine = formatMultiplierLine(currentPlayer.scoreMultiplier, turnScore);

  // Increment uiVersion
  await bumpUiVersion(ctx, gameState);

  // Update message
  try {
    await interaction.message.edit({
      content: `✅ ${MESSAGES.BLOCKED_PLAYER(`<@${target.userId}>`)}${multiplierLine}\n${MESSAGES.CURRENT_SCORE(currentPlayer.totalScore + turnScore)}`,
      components: [],
    });
  } catch (error) {
    logger.warn('[Dice] Failed to update UI after block:', error.message);
  }

  await applyBlock(gameState, currentPlayer, target, teamLetter, false, false);
}

async function handleGameError(gameState, error, context) {
  logger.error(`Dice game error (${context}):`, error);
  if (!gameState) return;
  cancelDiceGame(gameState.sessionId, 'ERROR');
  // Clean up session to unblock channel/players
  try {
    await SessionService.endSession(gameState.sessionId, null, 'ERROR');
  } catch (e) {
    logger.warn('[Dice] Failed to end session after error:', e.message);
  }
}

function buildDecisionButtons(gameState, selected = null, lock = false) {
  const isRollSelected = selected === 'ROLL';
  const isSkipSelected = selected === 'SKIP';
  const disabled = lock || isRollSelected || isSkipSelected;

  // Build session-like object for codec
  const sessionRef = {
    id: gameState.sessionId,
    phase: 'ACTIVE',
    uiVersion: gameState.uiVersion || 0
  };

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(codec.forSession(sessionRef, 'roll'))
      .setLabel(MESSAGES.BTN_ROLL_AGAIN)
      .setEmoji('🔄')
      .setStyle(isRollSelected ? ButtonStyle.Primary : ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(codec.forSession(sessionRef, 'skip'))
      .setLabel(MESSAGES.BTN_SKIP)
      .setEmoji('⏭️')
      .setStyle(isSkipSelected ? ButtonStyle.Danger : ButtonStyle.Secondary)
      .setDisabled(disabled)
  );
}

/**
 * Start a new Dice game
 * @param {Object} session - Session from SessionService
 * @param {TextChannel} channel - Discord channel
 */
export async function startDiceGame(session, channel) {
  const sessionId = session?.id;
  try {
    logger.info(`Starting Dice game: ${session.id}`);

    // Ensure session has phase/uiVersion for v1 buttons
    if (!session.phase) session.phase = 'ACTIVE';
    if (!Number.isFinite(session.uiVersion)) session.uiVersion = 0;
    await SessionService.saveSession(session);

    // Assign teams
    const { teamA, teamB } = assignTeams(session.players);

    // Calculate handicap multipliers for uneven teams (e.g., 3v2 gives smaller team 1.5x)
    const { teamAMultiplier, teamBMultiplier } = calculateHandicapMultipliers(
      teamA.length,
      teamB.length
    );

    // Initialize game state with handicap multipliers
    const gameState = {
      sessionId: session.id,
      channel,
      hostId: session.hostId,
      round: 1,
      phase: 'TEAM_A', // TEAM_A, TEAM_B, ROUND_END, GAME_END
      currentPlayerIndex: 0,
      teamA: teamA.map(p => initializePlayerState(p, teamAMultiplier)),
      teamB: teamB.map(p => initializePlayerState(p, teamBMultiplier)),
      teamAMultiplier,
      teamBMultiplier,
      turnState: null,
      blockedNextRound: { A: [], B: [] },
      messageId: null, // Current game message
      turnTimer: new GameTimer(),
      blockTimer: new GameTimer(),
      cancelled: false,
      uiVersion: session.uiVersion || 0, // For v1 button stale-click detection
    };

    activeGames.set(session.id, gameState);

    // Send team announcement (includes handicap info if uneven)
    await announceTeams(gameState);

    // Small delay then start first turn
    await delay(2000);

    // Start round 1
    await startRound(gameState);
  } catch (error) {
    const gameState = sessionId ? activeGames.get(sessionId) : null;
    handleGameError(gameState, error, 'startDiceGame');
    throw error;
  }
}

/**
 * Announce team assignments
 */
async function announceTeams(gameState) {
  // Generate team announcement image
  const announcementImage = await generateTeamAnnouncement({
    teamA: gameState.teamA,
    teamB: gameState.teamB,
    teamAMultiplier: gameState.teamAMultiplier,
    teamBMultiplier: gameState.teamBMultiplier,
  });

  const attachment = new AttachmentBuilder(announcementImage, { name: 'teams.png' });

  // Build message with handicap info if teams are uneven
  let message = 'تم توزيع الأرقام على كل لاعب. ستبدأ الجولة الأولى في بضع ثواني...';

  // Add handicap notice if teams are uneven
  if (gameState.teamAMultiplier !== 1.0 || gameState.teamBMultiplier !== 1.0) {
    const smallerTeam = gameState.teamAMultiplier > 1.0 ? 'A' : 'B';
    const multiplier = Math.max(gameState.teamAMultiplier, gameState.teamBMultiplier);
    message += `\n⚖️ الفريق ${smallerTeam} لديه عدد أقل من اللاعبين، لذا نقاطهم مضاعفة ×${multiplier.toFixed(1)}`;
  }

  // PLAIN TEXT message with distribution info
  await gameState.channel.send({
    content: message,
    files: [attachment]
  });
}

/**
 * Start a round
 */
async function startRound(gameState) {
  if (isGameCancelled(gameState)) return;
  // Apply blocks from previous round
  applyBlocks(gameState);

  // Start Team A silently (no round announcement)
  changePhase(gameState, 'TEAM_A');
  gameState.currentPlayerIndex = 0;
  await processNextTurn(gameState);
}

/**
 * Apply blocks from previous round
 */
function applyBlocks(gameState) {
  // Reset all blocks
  gameState.teamA.forEach(p => {
    p.blocked = false;
    p.wasBlockedThisRound = false;
  });
  gameState.teamB.forEach(p => {
    p.blocked = false;
    p.wasBlockedThisRound = false;
  });

  // Apply pending blocks
  for (const userId of gameState.blockedNextRound.A) {
    const player = gameState.teamA.find(p => p.userId === userId);
    if (player) {
      player.blocked = true;
      player.wasBlockedThisRound = true;
    }
  }
  for (const userId of gameState.blockedNextRound.B) {
    const player = gameState.teamB.find(p => p.userId === userId);
    if (player) {
      player.blocked = true;
      player.wasBlockedThisRound = true;
    }
  }

  // Clear pending blocks
  gameState.blockedNextRound = { A: [], B: [] };
}

/**
 * Process next turn or advance phase
 */
async function processNextTurn(gameState) {
  if (isGameCancelled(gameState)) return;
  const currentTeam = gameState.phase === 'TEAM_A' ? gameState.teamA : gameState.teamB;

  // Check if team finished
  if (gameState.currentPlayerIndex >= currentTeam.length) {
    if (gameState.phase === 'TEAM_A') {
      // Switch to Team B silently (no announcement)
      changePhase(gameState, 'TEAM_B');
      gameState.currentPlayerIndex = 0;
      await processNextTurn(gameState);
    } else {
      // Round finished
      await endRound(gameState);
    }
    return;
  }

  const player = currentTeam[gameState.currentPlayerIndex];

  // Check if player is blocked
  if (player.blocked) {
    await gameState.channel.send({
      content: MESSAGES.PLAYER_BLOCKED(`<@${player.userId}>`),
    });

    await delay(1500);
    gameState.currentPlayerIndex++;
    await processNextTurn(gameState);
    return;
  }

  // Start player's turn
  await startPlayerTurn(gameState, player);
}

/**
 * Start a player's turn - roll first die
 */
async function startPlayerTurn(gameState, player) {
  if (isGameCancelled(gameState)) return;
  // Clear any previous timers
  gameState.turnTimer.clear();

  // Roll first die
  const firstRoll = rollDie(player.hasBetterLuck);
  const turnScore = applyMultiplier(firstRoll, player.scoreMultiplier);
  const multiplierLine = formatMultiplierLine(player.scoreMultiplier, turnScore);

  // Store turn state
  gameState.turnState = {
    playerId: player.userId,
    firstRoll,
    secondRoll: null,
    finalScore: null,
    waiting: 'DECISION', // DECISION, BLOCK_TARGET, or null
  };

  // Generate dice image
  const diceImage = await generateDiceImage(firstRoll);
  const attachment = new AttachmentBuilder(diceImage, { name: 'dice.png' });

  // Build message with buttons
  const row = buildDecisionButtons(gameState);

  // Start timer with warning + Discord timestamp
  const { discordTimestamp } = gameState.turnTimer.start(
    TURN_TIMEOUT_MS,
    () => {
      if (gameState.turnState?.waiting === 'DECISION') {
        void handleSkip(gameState, player, null, true).catch(error => {
          handleGameError(gameState, error, 'turnTimeout');
        });
      }
    },
    {
      label: 'Dice-Turn',
      warningMs: DICE_TIMERS.WARNING_MS,
      onWarning: () => {
        if (gameState.turnState?.waiting === 'DECISION') {
          gameState.channel.send({
            content: `<@${player.userId}> ⚡ أسرع! الوقت يداهمك!`,
          }).catch(() => {});
        }
      },
    }
  );

  // PLAIN TEXT - NO EMBED (includes live Discord countdown)
  const message = await gameState.channel.send({
    content: `<@${player.userId}>\n🎲 ${MESSAGES.ROLLED(firstRoll)}${multiplierLine}\n${MESSAGES.CURRENT_SCORE(player.totalScore + turnScore)}\n⏱️ ${discordTimestamp}`,
    files: [attachment],
    components: [row],
  });

  gameState.messageId = message.id;
  gameState.currentMessage = message;
}

/**
 * Handle Skip button
 */
export async function handleSkip(gameState, player, message, wasTimeout = false) {
  try {
    if (isGameCancelled(gameState)) return;
    // Clear timeout
    gameState.turnTimer.clear();

    const firstRoll = gameState.turnState.firstRoll;
    const turnScore = applyMultiplier(firstRoll, player.scoreMultiplier);
    const multiplierLine = formatMultiplierLine(player.scoreMultiplier, turnScore);

    // Update player score (defensive: ensure roundScores is a number)
    const idx = gameState.round - 1;
    player.roundScores[idx] = (player.roundScores[idx] || 0) + turnScore;
    player.totalScore += turnScore;

    player.roundMeta[idx] = {
      firstRoll, // CORRECT: actual dice face, not turnScore
      outcomeType: 'SKIP',
      outcomeDisplay: null,
      turnScore,
    };

    gameState.turnState.finalScore = turnScore;
    gameState.turnState.waiting = null;

    // Update message (remove buttons) - PLAIN TEXT
    try {
      await message.edit({
        content: `<@${player.userId}>\n🎲 ${MESSAGES.ROLLED(firstRoll)}${multiplierLine}\n${MESSAGES.CURRENT_SCORE(player.totalScore)}`,
        components: [],
      });
    } catch (e) {
      logger.warn('[Dice] Failed to edit skip message:', e.message);
    }

    if (wasTimeout) {
      await gameState.channel.send({ content: MESSAGES.TIMEOUT_SKIPPED });
    }

    // Next turn
    await delay(1500);
    gameState.currentPlayerIndex++;
    await processNextTurn(gameState);
  } catch (error) {
    handleGameError(gameState, error, 'handleSkip');
    throw error;
  }
}

/**
 * Handle X2 outcome
 */
async function handleX2(interaction, gameState, player, firstRoll, attachment) {
  if (isGameCancelled(gameState)) return;
  const baseScore = firstRoll * 2;
  const turnScore = applyMultiplier(baseScore, player.scoreMultiplier);
  const multiplierLine = formatMultiplierLine(player.scoreMultiplier, turnScore);

  // Defensive: ensure roundScores is a number
  const idx = gameState.round - 1;
  player.roundScores[idx] = (player.roundScores[idx] || 0) + turnScore;
  player.totalScore += turnScore;

  player.roundMeta[idx] = {
    firstRoll: gameState.turnState.firstRoll,
    outcomeType: 'X2',
    outcomeDisplay: '×2',
    turnScore,
  };

  // PLAIN TEXT - NO EMBED
  const channel = interaction.channel || gameState.channel;
  await channel.send({
    content: `<@${player.userId}>\n🎲 ${MESSAGES.GOT_X2}\n${firstRoll} × 2 = **${baseScore}**${multiplierLine}\n${MESSAGES.CURRENT_SCORE(player.totalScore)}`,
    files: [attachment],
  });

  await advanceToNextTurn(gameState);
}

/**
 * Handle Block outcome
 */
async function handleBlock(interaction, gameState, player, firstRoll, attachment) {
  if (isGameCancelled(gameState)) return;
  // Check if last round
  if (gameState.round === TOTAL_ROUNDS) {
    // Can't use block on last round
    const turnScore = applyMultiplier(firstRoll, player.scoreMultiplier);
    const idx = gameState.round - 1;
    player.roundScores[idx] = (player.roundScores[idx] || 0) + turnScore;
    player.totalScore += turnScore;

    player.roundMeta[idx] = {
      firstRoll: gameState.turnState.firstRoll,
      outcomeType: 'BLOCK_CANCELLED',
      outcomeDisplay: null,
      turnScore,
    };

    // PLAIN TEXT - NO EMBED
    const channel = interaction.channel || gameState.channel;
    await channel.send({
      content: `${MESSAGES.BLOCK_LAST_ROUND(`<@${player.userId}>`)}\n${MESSAGES.CURRENT_SCORE(player.totalScore)}`,
      files: [attachment],
    });

    await advanceToNextTurn(gameState);
    return;
  }

  // Get opposite team for blocking
  const oppositeTeam = gameState.phase === 'TEAM_A' ? gameState.teamB : gameState.teamA;
  const teamLetter = gameState.phase === 'TEAM_A' ? 'B' : 'A';
  const blockedSet = new Set(gameState.blockedNextRound[teamLetter] || []);
  const availableTargets = oppositeTeam.filter(p => !blockedSet.has(p.userId));

  // All opponents already blocked — block is wasted, just keep first roll score
  if (availableTargets.length === 0) {
    const turnScore = applyMultiplier(firstRoll, player.scoreMultiplier);
    const idx = gameState.round - 1;
    player.roundScores[idx] = (player.roundScores[idx] || 0) + turnScore;
    player.totalScore += turnScore;

    player.roundMeta[idx] = {
      firstRoll: gameState.turnState.firstRoll,
      outcomeType: 'BLOCK_WASTED',
      outcomeDisplay: null,
      turnScore,
    };

    const channel = interaction.channel || gameState.channel;
    await channel.send({
      content: `<@${player.userId}>\n🎲 ${MESSAGES.GOT_BLOCK}\n⚠️ جميع لاعبي الفريق الآخر ممنوعون بالفعل!\n${MESSAGES.CURRENT_SCORE(player.totalScore)}`,
      files: [attachment],
    });

    await advanceToNextTurn(gameState);
    return;
  }

  // Build session-like object for codec
  const sessionRef = {
    id: gameState.sessionId,
    phase: 'ACTIVE',
    uiVersion: gameState.uiVersion || 0
  };

  // Build selection buttons
  const rows = [];
  let currentRow = new ActionRowBuilder();

  for (const opponent of availableTargets) {
    if (currentRow.components.length >= 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }

    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(codec.forSession(sessionRef, 'block', opponent.userId))
        .setLabel(opponent.displayName.slice(0, 20))
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    );
  }

  if (currentRow.components.length > 0) {
    rows.push(currentRow);
  }

  gameState.turnState.waiting = 'BLOCK_TARGET';
  gameState.turnState.firstRoll = firstRoll; // Keep first roll as score

  // Start block timer with warning + Discord timestamp
  const { discordTimestamp: blockTs } = gameState.blockTimer.start(
    BLOCK_TIMEOUT_MS,
    () => {
      if (gameState.turnState?.waiting === 'BLOCK_TARGET') {
        if (isGameCancelled(gameState)) return;
        void (async () => {
          const targetPool = availableTargets.length > 0 ? availableTargets : oppositeTeam;
          const randomTarget = targetPool[randomInt(targetPool.length)];
          try {
            await gameState.currentMessage.edit({
              content: `⏱️ ${MESSAGES.TIMEOUT_AUTO_BLOCK}\n✅ ${MESSAGES.BLOCKED_PLAYER(`<@${randomTarget.userId}>`)}`,
              components: [],
            });
          } catch (error) {
            logger.warn('[Dice] Failed to update message on auto-block:', error.message);
          }

          await applyBlock(gameState, player, randomTarget, teamLetter, true, false);
        })().catch(error => {
          handleGameError(gameState, error, 'blockTimeout');
        });
      }
    },
    {
      label: 'Dice-Block',
      warningMs: DICE_TIMERS.WARNING_MS,
      onWarning: () => {
        if (gameState.turnState?.waiting === 'BLOCK_TARGET') {
          gameState.channel.send({
            content: `<@${player.userId}> ⚡ أسرع! اختر لاعب!`,
          }).catch(() => {});
        }
      },
    }
  );

  // PLAIN TEXT - NO EMBED (includes live Discord countdown)
  const channel = interaction.channel || gameState.channel;
  const blockMessage = await channel.send({
    content: `<@${player.userId}>\n${MESSAGES.GOT_BLOCK}\n${MESSAGES.CHOOSE_BLOCK_TARGET}\n⏱️ ${blockTs}`,
    files: [attachment],
    components: rows.slice(0, 5),
  });

  gameState.messageId = blockMessage.id;
  gameState.currentMessage = blockMessage;
}

/**
 * Apply block to target
 */
async function applyBlock(gameState, player, target, teamLetter, wasTimeout, sendMessage = true) {
  if (isGameCancelled(gameState)) return;
  const firstRoll = gameState.turnState.firstRoll;
  const turnScore = applyMultiplier(firstRoll, player.scoreMultiplier);

  // Add to blocked list
  const blockedList = gameState.blockedNextRound[teamLetter];
  if (!blockedList.includes(target.userId)) {
    blockedList.push(target.userId);
  }

  // Update player score (defensive: ensure roundScores is a number)
  const idx = gameState.round - 1;
  player.roundScores[idx] = (player.roundScores[idx] || 0) + turnScore;
  player.totalScore += turnScore;

  player.roundMeta[idx] = {
    firstRoll,
    outcomeType: 'BLOCK',
    outcomeDisplay: 'BLOCK',
    turnScore,
    blockedTarget: target.displayName,
  };

  gameState.turnState.waiting = null;

  // Send confirmation
  if (sendMessage) {
    let message = MESSAGES.BLOCKED_PLAYER(`<@${target.userId}>`);
    if (wasTimeout) {
      message = MESSAGES.TIMEOUT_AUTO_BLOCK + '\n' + message;
    }
    await gameState.channel.send({ content: message });
  }

  await advanceToNextTurn(gameState);
}

/**
 * Handle Zero outcome
 */
async function handleZero(interaction, gameState, player, attachment) {
  if (isGameCancelled(gameState)) return;
  // Zero points this turn
  const idx = gameState.round - 1;
  player.roundScores[idx] = (player.roundScores[idx] || 0) + 0;
  // totalScore unchanged

  player.roundMeta[idx] = {
    firstRoll: gameState.turnState.firstRoll,
    outcomeType: 'ZERO',
    outcomeDisplay: 'Ø',
    turnScore: 0,
  };

  // PLAIN TEXT - NO EMBED
  const channel = interaction.channel || gameState.channel;
  await channel.send({
    content: `<@${player.userId}>\n🎲 ${MESSAGES.GOT_ZERO}\n${MESSAGES.CURRENT_SCORE(player.totalScore)}`,
    files: [attachment],
  });

  await advanceToNextTurn(gameState);
}

/**
 * Handle Modifier outcome (+2, +4, -2, -4)
 */
async function handleModifier(interaction, gameState, player, firstRoll, secondRoll, attachment) {
  if (isGameCancelled(gameState)) return;
  const turnScore = applyMultiplier(secondRoll.value, player.scoreMultiplier); // (firstRoll + modifier) * multiplier
  const multiplierLine = formatMultiplierLine(player.scoreMultiplier, turnScore);

  // Defensive: ensure roundScores is a number
  const idx = gameState.round - 1;
  player.roundScores[idx] = (player.roundScores[idx] || 0) + turnScore;
  player.totalScore += turnScore;

  player.roundMeta[idx] = {
    firstRoll: gameState.turnState.firstRoll,
    outcomeType: 'MODIFIER',
    outcomeDisplay: secondRoll.display, // '+2', '-4', etc. - maps to DICE_IMAGES['+2']
    turnScore,
  };

  // PLAIN TEXT - NO EMBED
  const channel = interaction.channel || gameState.channel;
  await channel.send({
    content: `<@${player.userId}>\n🎲 ${MESSAGES.ROLLED_WITH_MODIFIER(firstRoll, secondRoll.modifier)}${multiplierLine}\n${MESSAGES.CURRENT_SCORE(player.totalScore)}`,
    files: [attachment],
  });

  await advanceToNextTurn(gameState);
}

/**
 * Handle Normal second roll (1-6 replaces first)
 */
async function handleNormalSecond(interaction, gameState, player, secondRoll, attachment) {
  if (isGameCancelled(gameState)) return;
  const turnScore = applyMultiplier(secondRoll.value, player.scoreMultiplier);
  const multiplierLine = formatMultiplierLine(player.scoreMultiplier, turnScore);

  // Defensive: ensure roundScores is a number
  const idx = gameState.round - 1;
  player.roundScores[idx] = (player.roundScores[idx] || 0) + turnScore;
  player.totalScore += turnScore;

  player.roundMeta[idx] = {
    firstRoll: gameState.turnState.firstRoll,
    outcomeType: 'NORMAL',
    outcomeDisplay: null,
    secondRollValue: secondRoll.value, // The replacement roll
    turnScore,
  };

  // PLAIN TEXT - NO EMBED
  const channel = interaction.channel || gameState.channel;
  await channel.send({
    content: `<@${player.userId}>\n🎲 ${MESSAGES.ROLLED(secondRoll.value)}${multiplierLine}\n${MESSAGES.CURRENT_SCORE(player.totalScore)}`,
    files: [attachment],
  });

  await advanceToNextTurn(gameState);
}

/**
 * Advance to next turn
 */
async function advanceToNextTurn(gameState) {
  if (isGameCancelled(gameState)) return;
  await delay(2000);
  if (isGameCancelled(gameState)) return;
  gameState.currentPlayerIndex++;
  await processNextTurn(gameState);
}

/**
 * End current round
 */
async function endRound(gameState) {
  if (isGameCancelled(gameState)) return;
  changePhase(gameState, 'ROUND_END');

  const teamAScore = calculateTeamRoundScore(gameState.teamA, gameState.round - 1);
  const teamBScore = calculateTeamRoundScore(gameState.teamB, gameState.round - 1);

  // Generate round summary image
  const summaryImage = await generateRoundSummary({
    round: gameState.round,
    teamA: gameState.teamA,
    teamB: gameState.teamB,
    teamAScore,
    teamBScore,
  });

  const attachment = new AttachmentBuilder(summaryImage, { name: 'round.png' });

  // PLAIN TEXT - NO EMBED
  await gameState.channel.send({
    content: MESSAGES.ROUND_SUMMARY(gameState.round),
    files: [attachment],
  });

  await delay(3000);

  // Check if game over
  if (gameState.round >= TOTAL_ROUNDS) {
    await endGame(gameState);
  } else {
    // Start next round
    gameState.round++;
    await startRound(gameState);
  }
}

/**
 * End game
 */
async function endGame(gameState) {
  if (isGameCancelled(gameState)) return;
  changePhase(gameState, 'GAME_END');

  const teamATotal = calculateTeamScore(gameState.teamA);
  const teamBTotal = calculateTeamScore(gameState.teamB);

  let winner;
  let winningTeam;
  if (teamATotal > teamBTotal) {
    winner = 'A';
    winningTeam = gameState.teamA;
  } else if (teamBTotal > teamATotal) {
    winner = 'B';
    winningTeam = gameState.teamB;
  } else {
    winner = 'TIE';
    winningTeam = null;
  }

  // Generate final result image
  const resultImage = await generateGameResult({
    teamA: gameState.teamA,
    teamB: gameState.teamB,
    teamATotal,
    teamBTotal,
    winner,
  });

  const attachment = new AttachmentBuilder(resultImage, { name: 'result.png' });

  // Build winner message with player mentions
  let winnerMessage;
  if (winner === 'TIE') {
    winnerMessage = '🤝 تعادل!';
  } else {
    // Mention all winning players
    const winnerMentions = winningTeam.map(p => `<@${p.userId}>`).join('، ');
    winnerMessage = `🏆 ${winnerMentions} فازوا باللعبة!`;
  }

  // PLAIN TEXT - NO EMBED
  await gameState.channel.send({
    content: winnerMessage,
    files: [attachment],
  });

  // Distribute rewards and record stats
  const totalPlayers = gameState.teamA.length + gameState.teamB.length;
  const statsMetadata = { sessionId: gameState.sessionId, playerCount: totalPlayers, roundsPlayed: TOTAL_ROUNDS };

  try {
    if (winner !== 'TIE') {
      const winnerIds = winner === 'A'
        ? gameState.teamA.map(p => p.userId)
        : gameState.teamB.map(p => p.userId);
      const loserIds = winner === 'A'
        ? gameState.teamB.map(p => p.userId)
        : gameState.teamA.map(p => p.userId);

      // Rewards: isolated so stats still record if this throws
      try {
        const rewardResult = await awardGameWinners({
          gameType: 'DICE',
          sessionId: gameState.sessionId,
          winnerIds,
          playerCount: totalPlayers,
          roundsPlayed: TOTAL_ROUNDS
        });

        // FIX CRITICAL: Verify payout succeeded before announcing reward
        if (rewardResult?.reward > 0) {
          const successfulPayouts = rewardResult.results?.filter(r => r.success === true)?.length || 0;
          const totalWinners = rewardResult.results?.length || 0;

          if (successfulPayouts > 0) {
            if (successfulPayouts === totalWinners) {
              await gameState.channel.send({
                content: `🪙 كل فائز حصل على **${rewardResult.reward}** عملة آشي!`,
              });
            } else {
              await gameState.channel.send({
                content: `⚠️ تم منح ${successfulPayouts} فائزين من أصل ${totalWinners}. يرجى التحقق من رصيدك.`
              });
              logger.error(`[Dice] Partial payout: ${successfulPayouts}/${totalWinners} succeeded`, rewardResult);
            }
          } else {
            await gameState.channel.send({
              content: `🏆 تم تتويج الفائزين!\n⚠️ حدث خطأ في منح الجائزة. يرجى التواصل مع الإدارة.`
            });
            logger.error(`[Dice] All winner payouts failed. Result:`, rewardResult);
          }
        }
      } catch (error) {
        logger.error('[Dice] Reward payout failed:', error);
        try {
          await gameState.channel.send({
            content: `🏆 تم تتويج الفائزين!\n⚠️ حدث خطأ في منح الجائزة. يرجى التواصل مع الإدارة.`
          });
        } catch (e) {
          logger.warn('[Dice] Failed to send reward error message:', e.message);
        }
      }

      // Record losses (allSettled = never throws)
      await Promise.allSettled(
        loserIds.map(id => recordGameResult(id, 'DICE', 'LOSS', statsMetadata))
      );
    } else {
      const allPlayerIds = [
        ...gameState.teamA.map(p => p.userId),
        ...gameState.teamB.map(p => p.userId),
      ];
      await Promise.allSettled(
        allPlayerIds.map(id => recordGameResult(id, 'DICE', 'TIE', statsMetadata))
      );
    }

    try {
      await SessionService.endSession(gameState.sessionId, null, 'COMPLETED');
    } catch (error) {
      logger.error('[Dice] Failed to end session:', error);
    }

    logger.info(`Dice game ended: ${gameState.sessionId} - Winner: Team ${winner}`);
  } finally {
    // ALWAYS cleanup timers + activeGames, even if rewards/session end throws
    gameState.turnTimer.clear();
    gameState.blockTimer.clear();
    activeGames.delete(gameState.sessionId);
  }
}

/**
 * Get current player
 */
function getCurrentPlayer(gameState) {
  const team = gameState.phase === 'TEAM_A' ? gameState.teamA : gameState.teamB;
  return team[gameState.currentPlayerIndex];
}

/**
 * Apply score with handicap multiplier
 * @param {number} rawScore - The raw score before multiplier
 * @param {number} multiplier - The player's handicap multiplier
 * @returns {number} Rounded score after multiplier
 */
function applyMultiplier(rawScore, multiplier) {
  return Math.round(rawScore * multiplier);
}

/**
 * Helper delay function
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get active game for a session
 */
export function getActiveGame(sessionId) {
  return activeGames.get(sessionId);
}

/**
 * Check if session has active game
 */
export function hasActiveGame(sessionId) {
  return activeGames.has(sessionId);
}

/**
 * Get active dice games count
 */
export function getActiveGamesCount() {
  return activeGames.size;
}

/**
 * Cancel active dice game
 */
export function cancelDiceGame(sessionId, reason = 'MESSAGE_DELETED') {
  const gameState = activeGames.get(sessionId);
  if (!gameState) return false;

  gameState.cancelled = true;
  gameState.turnTimer.clear();
  gameState.blockTimer.clear();
  activeGames.delete(sessionId);

  logger.info(`Dice game cancelled: ${sessionId} - Reason: ${reason}`);
  return true;
}

function isGameCancelled(gameState) {
  return !gameState || gameState.cancelled;
}

/**
 * Find active dice game by channel ID
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
 * Cancel active dice game by channel ID
 */
export function cancelDiceGameByChannel(channelId, reason = 'STOP_COMMAND') {
  const gameState = getActiveGameByChannel(channelId);
  if (!gameState) return false;
  return cancelDiceGame(gameState.sessionId, reason);
}
