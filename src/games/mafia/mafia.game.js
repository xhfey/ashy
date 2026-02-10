/**
 * Mafia Game - Social Deduction
 *
 * 5-15 players, roles: Mafia/Doctor/Detective/Citizen
 * Night phases (private ephemeral actions) + Day voting (public)
 * Team-based win conditions
 *
 * Follows Roulette's standalone pattern:
 * - activeGames Map for runtime state
 * - ButtonRouter for button routing
 * - Promise-queue withLock for concurrency
 * - TimeoutManager for phase timeouts
 */

import { randomInt } from 'crypto';
import * as SessionService from '../../services/games/session.service.js';
import * as CurrencyService from '../../services/economy/currency.service.js';
import { calculateReward } from '../../services/economy/rewards.service.js';
import { recordGameResult } from '../../services/economy/transaction.service.js';
import { buttonRouter, sessionManager } from '../../framework/index.js';
import { TimeoutManager } from '../../framework/TimeoutManager.js';
import * as Buttons from './mafia.buttons.js';
import * as Embeds from './mafia.embeds.js';
import {
  ROLES, ROLE_NAMES, ROLE_EMOJIS, ROLE_DISTRIBUTIONS,
  PHASES, NIGHT_PHASES, ACTIONS, TIMERS, MESSAGES,
  TEAMS, getTeam,
  HINT_COST, MAX_HINTS_PER_ROUND, DEAD_WINNER_RATIO,
  VOTE_EDIT_THROTTLE_MS,
} from './mafia.constants.js';
import logger from '../../utils/logger.js';

// ==================== STATE ====================

const activeGames = new Map();  // sessionId -> gameState
const sessionLocks = new Map(); // sessionId -> Promise (lock queue)

// ==================== LOCK (Roulette pattern) ====================

async function withLock(sessionId, fn) {
  let lockQueue = sessionLocks.get(sessionId);
  if (!lockQueue) {
    lockQueue = Promise.resolve();
    sessionLocks.set(sessionId, lockQueue);
  }

  const swallowed = lockQueue.then(fn).catch(error => {
    logger.error('[Mafia] Lock execution error:', error);
    throw error;
  });

  const queued = swallowed.catch(() => {});
  sessionLocks.set(sessionId, queued);

  try {
    return await swallowed;
  } finally {
    if (sessionLocks.get(sessionId) === queued) {
      sessionLocks.delete(sessionId);
    }
  }
}

// ==================== HANDLER REGISTRATION ====================

export function registerMafiaHandler() {
  buttonRouter.register('MAFIA', {
    onAction: handleMafiaAction,
  });
  logger.info('[Mafia] Handler registered with ButtonRouter');
}

async function handleMafiaAction(ctx) {
  const { session, action, details, interaction } = ctx;
  const gs = activeGames.get(session.id);

  if (!gs) return;

  await withLock(session.id, async () => {
    // Re-check game still active after acquiring lock
    if (!activeGames.has(session.id)) return;
    if (gs.state === 'ENDED') return;

    switch (action) {
      case ACTIONS.ROLE:
        return handleRoleReveal(ctx, gs);
      case ACTIONS.NIGHT_OPEN:
        return handleNightOpen(ctx, gs);
      case ACTIONS.MAFIA_VOTE:
        return handleMafiaVote(ctx, gs, details);
      case ACTIONS.DOCTOR_PROTECT:
        return handleDoctorProtect(ctx, gs, details);
      case ACTIONS.DETECTIVE_CHECK:
        return handleDetectiveCheck(ctx, gs, details);
      case ACTIONS.VOTE:
        return handleDayVote(ctx, gs, details);
      case ACTIONS.VOTE_SKIP:
        return handleDayVoteSkip(ctx, gs);
      case ACTIONS.HINT:
        return handleHintPurchase(ctx, gs);
      default:
        logger.debug(`[Mafia] Unknown action: ${action}`);
    }
  });
}

// ==================== GAME LIFECYCLE ====================

export async function startMafiaGame(session, channel) {
  try {
    logger.info(`[Mafia] Starting game: ${session.id} with ${session.players.length} players`);

    // Assign roles
    const { playerMap, detectiveEnabled, distribution } = assignRoles(session.players);

    // Create TimeoutManager
    const timeouts = new TimeoutManager(logger, 'Mafia');

    // Initialize game state
    const abortController = new AbortController();
    const gs = {
      sessionId: session.id,
      channel,
      hostId: session.hostId || null,
      state: 'PLAYING',
      phase: PHASES.ROLE_REVEAL,
      roundNumber: 0,

      // Players
      players: playerMap,
      detectiveEnabled,

      // Night votes (reset each round)
      mafiaVotes: new Map(),
      doctorProtectUserId: null,
      detectiveInvestigateUserId: null,

      // Night resolved
      resolvedMafiaTarget: null,
      resolvedDoctorProtect: null,

      // Day votes (reset each round)
      dayVotes: new Map(),
      hintPurchasesThisRound: new Set(),

      // Doctor restriction (persists across rounds)
      lastDoctorProtectedUserId: null,

      // Throttle
      lastVoteMessageEditTime: 0,
      pendingVoteUpdate: null,

      // Message refs
      controlPanelMessageId: null,
      voteMessageId: null,

      // Utils
      timeouts,
      abortController,

      // Phase resolution
      currentPhaseResolve: null,
    };

    activeGames.set(session.id, gs);

    // Update session phase
    session.phase = PHASES.ROLE_REVEAL;
    await sessionManager.save(session);

    // 1. Announce role distribution
    await channel.send({ content: MESSAGES.ROLES_DISTRIBUTED });

    // 2. Post team distribution text
    await channel.send({ content: Embeds.buildTeamsText(distribution, detectiveEnabled) });

    // 3. Post control panel (this becomes the session anchor)
    const controlPanelMsg = await channel.send({
      content: MESSAGES.CONTROL_PANEL_INTRO,
      components: Buttons.buildControlPanelButtons(session, PHASES.ROLE_REVEAL),
    });

    gs.controlPanelMessageId = controlPanelMsg.id;
    await SessionService.setMessageId(session.id, controlPanelMsg.id);

    // Brief pause before starting first round
    await delay(TIMERS.ROLE_REVEAL_MS, abortController.signal);

    // Start the round loop
    await runRound(gs, session);

  } catch (error) {
    if (error.message === 'Delay aborted') return;
    logger.error('[Mafia] Error starting game:', error);
    cleanupGame(session.id);
    throw error;
  }
}

// ==================== ROUND LOOP ====================

async function runRound(gs, session) {
  while (gs.state !== 'ENDED') {
    gs.roundNumber++;
    resetRoundState(gs);

    // Announce round
    await gs.channel.send({ content: MESSAGES.ROUND_START(gs.roundNumber) });

    // Night phases
    await runNightMafia(gs, session);
    if (gs.state === 'ENDED') break;

    await runNightDoctor(gs, session);
    if (gs.state === 'ENDED') break;

    // Detective only if enabled AND alive
    const detectiveId = findPlayerByRole(gs, ROLES.DETECTIVE);
    if (gs.detectiveEnabled && detectiveId && gs.players[detectiveId].alive) {
      await runNightDetective(gs, session);
      if (gs.state === 'ENDED') break;
    }

    // Resolve night
    await resolveNight(gs, session);
    if (gs.state === 'ENDED') break;

    // Day phases
    await runDayDiscuss(gs, session);
    if (gs.state === 'ENDED') break;

    await runDayVote(gs, session);
    if (gs.state === 'ENDED') break;

    await resolveVote(gs, session);
    // Loop continues if state is not ENDED
  }
}

function resetRoundState(gs) {
  gs.mafiaVotes.clear();
  gs.doctorProtectUserId = null;
  gs.detectiveInvestigateUserId = null;
  gs.resolvedMafiaTarget = null;
  gs.resolvedDoctorProtect = null;
  gs.dayVotes.clear();
  gs.hintPurchasesThisRound.clear();
  gs.voteMessageId = null;

  if (gs.pendingVoteUpdate) {
    clearTimeout(gs.pendingVoteUpdate);
    gs.pendingVoteUpdate = null;
  }
}

// ==================== NIGHT PHASES ====================

async function runNightMafia(gs, session) {
  return runTimedPhase(gs, session, PHASES.NIGHT_MAFIA, TIMERS.NIGHT_MAFIA_MS, () => {
    // Edit control panel
    return updateControlPanel(gs, session, MESSAGES.NIGHT_MAFIA_STATUS);
  });
}

async function runNightDoctor(gs, session) {
  // Skip if doctor is dead
  const doctorId = findPlayerByRole(gs, ROLES.DOCTOR);
  if (!doctorId || !gs.players[doctorId].alive) {
    gs.resolvedDoctorProtect = null;
    // Brief status message
    await updateControlPanel(gs, session, MESSAGES.NIGHT_DOCTOR_STATUS);
    await delay(TIMERS.RESOLVE_DELAY_MS, gs.abortController.signal);
    await updateControlPanel(gs, session, MESSAGES.DOCTOR_CHOSE);
    return;
  }

  return runTimedPhase(gs, session, PHASES.NIGHT_DOCTOR, TIMERS.NIGHT_DOCTOR_MS, () => {
    return updateControlPanel(gs, session, MESSAGES.NIGHT_DOCTOR_STATUS);
  });
}

async function runNightDetective(gs, session) {
  return runTimedPhase(gs, session, PHASES.NIGHT_DETECTIVE, TIMERS.NIGHT_DETECTIVE_MS, () => {
    return updateControlPanel(gs, session, MESSAGES.NIGHT_DETECTIVE_STATUS);
  });
}

/**
 * Generic timed phase runner
 * Posts UI, sets timer, resolves when phase ends (by action or timeout)
 */
async function runTimedPhase(gs, session, phase, durationMs, setupFn) {
  let resolve;
  const promise = new Promise(r => { resolve = r; });

  gs.currentPhaseResolve = resolve;
  gs.phaseStartedAt = Date.now();
  await changePhase(gs, session, phase);

  try {
    await setupFn();
  } catch (error) {
    logger.error(`[Mafia] Error setting up phase ${phase}:`, error);
  }

  gs.timeouts.set('phase', durationMs, async () => {
    await withLock(session.id, async () => {
      if (gs.phase !== phase) return; // Already moved on
      await onPhaseTimeout(gs, session, phase);
      resolve();
    });
  });

  return promise;
}

async function onPhaseTimeout(gs, session, phase) {
  switch (phase) {
    case PHASES.NIGHT_MAFIA: {
      resolveMafiaVotes(gs);
      await updateControlPanel(gs, session, MESSAGES.MAFIA_CHOSE);
      break;
    }
    case PHASES.NIGHT_DOCTOR: {
      // No pick => no protection
      gs.resolvedDoctorProtect = gs.doctorProtectUserId || null;
      await updateControlPanel(gs, session, MESSAGES.DOCTOR_CHOSE);
      break;
    }
    case PHASES.NIGHT_DETECTIVE: {
      // No pick => no investigation (nothing to do)
      break;
    }
    case PHASES.DAY_VOTE: {
      // Votes are whatever they are at timeout
      break;
    }
  }
}

// ==================== RESOLVE NIGHT ====================

async function resolveNight(gs, session) {
  await changePhase(gs, session, PHASES.RESOLVE_NIGHT);
  await updateControlPanel(gs, session, MESSAGES.RESOLVING_NIGHT);

  // Finalize resolved values from live state
  if (gs.resolvedMafiaTarget === null) {
    resolveMafiaVotes(gs);
  }
  if (gs.resolvedDoctorProtect === null) {
    gs.resolvedDoctorProtect = gs.doctorProtectUserId || null;
  }

  await delay(TIMERS.RESOLVE_DELAY_MS, gs.abortController.signal);

  const targetId = gs.resolvedMafiaTarget;
  const protectedId = gs.resolvedDoctorProtect;

  if (targetId && targetId === protectedId) {
    // Doctor saved the target
    const mention = `<@${targetId}>`;
    await gs.channel.send({ content: MESSAGES.KILL_SAVED(mention) });
  } else if (targetId) {
    // Kill succeeds
    const target = gs.players[targetId];
    target.alive = false;
    const mention = `<@${targetId}>`;
    const roleName = ROLE_NAMES[target.role];
    await gs.channel.send({ content: MESSAGES.KILL_SUCCESS(mention, roleName) });
  }

  // Update doctor restriction
  if (gs.resolvedDoctorProtect) {
    gs.lastDoctorProtectedUserId = gs.resolvedDoctorProtect;
  }

  // Win check
  const winResult = checkWinCondition(gs);
  if (winResult) {
    await endMafiaGame(gs, session, winResult);
  }
}

// ==================== DAY PHASES ====================

async function runDayDiscuss(gs, session) {
  await changePhase(gs, session, PHASES.DAY_DISCUSS);

  const epoch = getPhaseEndEpoch(TIMERS.DAY_DISCUSS_MS);
  const content = `${MESSAGES.DAY_DISCUSS}\n${MESSAGES.TIMER(epoch)}`;
  await updateControlPanel(gs, session, content);

  await delay(TIMERS.DAY_DISCUSS_MS, gs.abortController.signal);
}

async function runDayVote(gs, session) {
  let resolve;
  const promise = new Promise(r => { resolve = r; });

  gs.currentPhaseResolve = resolve;
  gs.phaseStartedAt = Date.now();
  await changePhase(gs, session, PHASES.DAY_VOTE);

  const epoch = getPhaseEndEpoch(TIMERS.DAY_VOTE_MS);
  const content = `${MESSAGES.DAY_VOTE_TITLE}\n${MESSAGES.DAY_VOTE_PROMPT}\n${MESSAGES.TIMER(epoch)}`;

  // Update control panel
  await updateControlPanel(gs, session, `🗳️ جاري التصويت...\n${MESSAGES.TIMER(epoch)}`);

  // Post vote message
  const alivePlayers = getAlivePlayers(gs);
  const voteCounts = computeVoteCounts(gs);

  try {
    const voteMsg = await gs.channel.send({
      content,
      components: Buttons.buildDayVoteButtons(session, alivePlayers, voteCounts),
    });
    gs.voteMessageId = voteMsg.id;
  } catch (error) {
    logger.error('[Mafia] Failed to send vote message:', error);
  }

  gs.timeouts.set('phase', TIMERS.DAY_VOTE_MS, async () => {
    await withLock(session.id, async () => {
      if (gs.phase !== PHASES.DAY_VOTE) return;
      resolve();
    });
  });

  return promise;
}

// ==================== RESOLVE VOTE ====================

async function resolveVote(gs, session) {
  await changePhase(gs, session, PHASES.RESOLVE_VOTE);
  await updateControlPanel(gs, session, MESSAGES.RESOLVING_VOTE);

  // Disable vote buttons
  await disableVoteMessage(gs);

  await delay(TIMERS.RESOLVE_DELAY_MS, gs.abortController.signal);

  const result = resolveDayVotes(gs);

  switch (result.outcome) {
    case 'SKIP':
      await gs.channel.send({ content: MESSAGES.VOTE_SKIP });
      break;
    case 'TIE':
      await gs.channel.send({ content: MESSAGES.VOTE_TIE });
      break;
    case 'EXPEL': {
      const expelled = gs.players[result.expelledId];
      expelled.alive = false;
      const mention = `<@${result.expelledId}>`;
      const roleName = ROLE_NAMES[expelled.role];
      await gs.channel.send({ content: MESSAGES.VOTE_EXPEL(mention, roleName) });
      break;
    }
  }

  // Win check
  const winResult = checkWinCondition(gs);
  if (winResult) {
    await endMafiaGame(gs, session, winResult);
  }
}

// ==================== WIN CHECK ====================

function checkWinCondition(gs) {
  const alive = Object.values(gs.players).filter(p => p.alive);
  const aliveMafia = alive.filter(p => p.role === ROLES.MAFIA).length;
  const aliveNonMafia = alive.length - aliveMafia;

  if (aliveMafia === 0) {
    return { winningTeam: TEAMS.TEAM_1 };
  }
  if (aliveMafia >= aliveNonMafia) {
    return { winningTeam: TEAMS.TEAM_2 };
  }
  return null;
}

// ==================== END GAME ====================

async function endMafiaGame(gs, session, winResult) {
  gs.state = 'ENDED';
  gs.phase = PHASES.ENDED;
  gs.timeouts.clearAll();

  const { winningTeam } = winResult;
  const allPlayers = Object.values(gs.players);
  const winners = allPlayers.filter(p => getTeam(p.role) === winningTeam);
  const losers = allPlayers.filter(p => getTeam(p.role) !== winningTeam);

  // Calculate rewards
  const { total: aliveReward } = calculateReward({ playerCount: allPlayers.length });
  const deadReward = Math.floor(aliveReward * DEAD_WINNER_RATIO);

  // Pay winners individually
  for (const winner of winners) {
    const amount = winner.alive ? aliveReward : deadReward;
    try {
      await CurrencyService.awardGameWin(winner.userId, amount, 'MAFIA', {
        sessionId: gs.sessionId,
        playerCount: allPlayers.length,
        roundsPlayed: gs.roundNumber,
        winnerAlive: winner.alive,
        reward: amount,
      });
    } catch (error) {
      logger.error(`[Mafia] Failed to pay winner ${winner.userId}:`, error);
    }
  }

  // Record losses
  await Promise.allSettled(
    losers.map(p => recordGameResult(p.userId, 'MAFIA', 'LOSS', {
      sessionId: gs.sessionId,
      playerCount: allPlayers.length,
      roundsPlayed: gs.roundNumber,
    }))
  );

  // Post win announcement
  const winnerMentions = winners.map(w => `<@${w.userId}>`);
  await gs.channel.send({
    content: Embeds.buildWinText(winningTeam, winnerMentions, gs.roundNumber),
  });

  // Edit control panel to ended state
  try {
    const cpMsg = await gs.channel.messages.fetch(gs.controlPanelMessageId);
    await cpMsg.edit({
      content: MESSAGES.GAME_ENDED,
      components: Buttons.buildDisabledControlPanel(),
    });
  } catch (error) {
    logger.warn('[Mafia] Failed to edit control panel on game end:', error.message);
  }

  // End session
  try {
    await SessionService.endSession(gs.sessionId, null, 'COMPLETED');
  } catch (error) {
    logger.error('[Mafia] Failed to end session:', error);
  }

  cleanupGame(gs.sessionId);
}

// ==================== BUTTON HANDLERS ====================

async function handleRoleReveal(ctx, gs) {
  const { interaction } = ctx;
  const userId = interaction.user.id;
  const player = gs.players[userId];

  if (!player) {
    return interaction.followUp({ content: MESSAGES.NOT_IN_GAME, ephemeral: true });
  }
  if (gs.state === 'ENDED') {
    return interaction.followUp({ content: MESSAGES.GAME_EXPIRED, ephemeral: true });
  }
  if (!player.alive) {
    return interaction.followUp({ content: MESSAGES.DEAD_BLOCKED, ephemeral: true });
  }

  let content;
  switch (player.role) {
    case ROLES.CITIZEN:
      content = MESSAGES.ROLE_CITIZEN;
      break;
    case ROLES.DOCTOR:
      content = MESSAGES.ROLE_DOCTOR;
      break;
    case ROLES.DETECTIVE:
      content = MESSAGES.ROLE_DETECTIVE;
      break;
    case ROLES.MAFIA: {
      const teammates = Object.values(gs.players)
        .filter(p => p.role === ROLES.MAFIA)
        .map(p => `<@${p.userId}>`)
        .join('، ');
      content = MESSAGES.ROLE_MAFIA(teammates);
      break;
    }
  }

  return interaction.followUp({ content, ephemeral: true });
}

async function handleNightOpen(ctx, gs) {
  const { interaction, session } = ctx;
  const userId = interaction.user.id;
  const player = gs.players[userId];

  if (!player) {
    return interaction.followUp({ content: MESSAGES.NOT_IN_GAME, ephemeral: true });
  }
  if (!player.alive) {
    return interaction.followUp({ content: MESSAGES.DEAD_BLOCKED, ephemeral: true });
  }
  if (!NIGHT_PHASES.has(gs.phase)) {
    return interaction.followUp({ content: MESSAGES.WRONG_PHASE, ephemeral: true });
  }

  // Determine if this player should act in the current phase
  if (gs.phase === PHASES.NIGHT_MAFIA && player.role === ROLES.MAFIA) {
    const targets = getAliveNonMafia(gs);
    const currentPick = gs.mafiaVotes.get(userId) || null;
    const pickMention = currentPick ? `<@${currentPick}>` : null;

    return interaction.followUp({
      content: `${MESSAGES.MAFIA_ACTION_TITLE}\n${MESSAGES.MAFIA_ACTION_PROMPT(getRunningPhaseEpoch(gs))}\n${MESSAGES.CURRENT_PICK(pickMention)}`,
      components: Buttons.buildNightTargetButtons(session, targets, currentPick, ACTIONS.MAFIA_VOTE),
      ephemeral: true,
    });
  }

  if (gs.phase === PHASES.NIGHT_DOCTOR && player.role === ROLES.DOCTOR) {
    // Exclude last protected player
    const targets = getAlivePlayers(gs).filter(p => p.userId !== gs.lastDoctorProtectedUserId);
    const currentPick = gs.doctorProtectUserId || null;
    const pickMention = currentPick ? `<@${currentPick}>` : null;

    return interaction.followUp({
      content: `${MESSAGES.DOCTOR_ACTION_TITLE}\n${MESSAGES.DOCTOR_ACTION_PROMPT(getRunningPhaseEpoch(gs))}\n${MESSAGES.CURRENT_PICK(pickMention)}`,
      components: Buttons.buildNightTargetButtons(session, targets, currentPick, ACTIONS.DOCTOR_PROTECT),
      ephemeral: true,
    });
  }

  if (gs.phase === PHASES.NIGHT_DETECTIVE && player.role === ROLES.DETECTIVE) {
    // Exclude self
    const targets = getAlivePlayers(gs).filter(p => p.userId !== userId);
    const currentPick = gs.detectiveInvestigateUserId || null;
    const pickMention = currentPick ? `<@${currentPick}>` : null;

    return interaction.followUp({
      content: `${MESSAGES.DETECTIVE_ACTION_TITLE}\n${MESSAGES.DETECTIVE_ACTION_PROMPT(getRunningPhaseEpoch(gs))}\n${MESSAGES.CURRENT_PICK(pickMention)}`,
      components: Buttons.buildNightTargetButtons(session, targets, currentPick, ACTIONS.DETECTIVE_CHECK),
      ephemeral: true,
    });
  }

  // Not their turn
  return interaction.followUp({ content: MESSAGES.NOT_YOUR_TURN, ephemeral: true });
}

async function handleMafiaVote(ctx, gs, targetId) {
  const { interaction } = ctx;
  const userId = interaction.user.id;
  const player = gs.players[userId];

  if (!player || !player.alive || player.role !== ROLES.MAFIA) return;
  if (gs.phase !== PHASES.NIGHT_MAFIA) return;

  // Validate target is alive and non-mafia
  const target = gs.players[targetId];
  if (!target || !target.alive || target.role === ROLES.MAFIA) return;

  gs.mafiaVotes.set(userId, targetId);

  return interaction.followUp({
    content: MESSAGES.VOTE_CONFIRMED(`<@${targetId}>`),
    ephemeral: true,
  });
}

async function handleDoctorProtect(ctx, gs, targetId) {
  const { interaction } = ctx;
  const userId = interaction.user.id;
  const player = gs.players[userId];

  if (!player || !player.alive || player.role !== ROLES.DOCTOR) return;
  if (gs.phase !== PHASES.NIGHT_DOCTOR) return;

  // Validate target is alive and not the same as last round
  const target = gs.players[targetId];
  if (!target || !target.alive) return;
  if (targetId === gs.lastDoctorProtectedUserId) return;

  gs.doctorProtectUserId = targetId;

  return interaction.followUp({
    content: MESSAGES.PROTECT_CONFIRMED(`<@${targetId}>`),
    ephemeral: true,
  });
}

async function handleDetectiveCheck(ctx, gs, targetId) {
  const { interaction } = ctx;
  const userId = interaction.user.id;
  const player = gs.players[userId];

  if (!player || !player.alive || player.role !== ROLES.DETECTIVE) return;
  if (gs.phase !== PHASES.NIGHT_DETECTIVE) return;

  gs.detectiveInvestigateUserId = targetId;

  // Show result immediately (ephemeral)
  const target = gs.players[targetId];
  const roleName = ROLE_NAMES[target.role];

  return interaction.followUp({
    content: `${MESSAGES.CHECK_CONFIRMED(`<@${targetId}>`)}\n${MESSAGES.CHECK_RESULT(`<@${targetId}>`, roleName)}`,
    ephemeral: true,
  });
}

async function handleDayVote(ctx, gs, targetId) {
  const { interaction, session } = ctx;
  const userId = interaction.user.id;
  const player = gs.players[userId];

  if (!player || !player.alive) return;
  if (gs.phase !== PHASES.DAY_VOTE) return;

  gs.dayVotes.set(userId, targetId);
  scheduleVoteMessageUpdate(gs, session);
}

async function handleDayVoteSkip(ctx, gs) {
  const { interaction, session } = ctx;
  const userId = interaction.user.id;
  const player = gs.players[userId];

  if (!player || !player.alive) return;
  if (gs.phase !== PHASES.DAY_VOTE) return;

  gs.dayVotes.set(userId, 'SKIP');
  scheduleVoteMessageUpdate(gs, session);
}

async function handleHintPurchase(ctx, gs) {
  const { interaction, session } = ctx;
  const userId = interaction.user.id;
  const player = gs.players[userId];

  if (!player) {
    return interaction.followUp({ content: MESSAGES.NOT_IN_GAME, ephemeral: true });
  }
  if (!player.alive) {
    return interaction.followUp({ content: MESSAGES.DEAD_BLOCKED, ephemeral: true });
  }
  if (gs.phase !== PHASES.DAY_VOTE) {
    return interaction.followUp({ content: MESSAGES.HINT_WRONG_PHASE, ephemeral: true });
  }
  if (gs.hintPurchasesThisRound.has(userId)) {
    return interaction.followUp({ content: MESSAGES.HINT_ALREADY_USED, ephemeral: true });
  }

  // Charge coins
  try {
    await CurrencyService.spendCoins(userId, HINT_COST, 'PERK_PURCHASE', 'MAFIA', {
      sessionId: session.id,
      perkId: 'HINT',
      roundNumber: gs.roundNumber,
    });
  } catch (error) {
    // Check if it's an insufficient balance error
    if (error.code === 'INSUFFICIENT_BALANCE' || error.name === 'InsufficientBalanceError') {
      let balance = 0;
      try { balance = await CurrencyService.getBalance(userId); } catch (e) { logger.warn('[Mafia] Failed to get balance:', e.message); }
      return interaction.followUp({
        content: MESSAGES.HINT_NO_BALANCE(HINT_COST, balance),
        ephemeral: true,
      });
    }
    logger.error('[Mafia] Hint purchase error:', error);
    return interaction.followUp({ content: '❌ حدث خطأ غير متوقع', ephemeral: true });
  }

  gs.hintPurchasesThisRound.add(userId);

  // Generate hint: 1 random alive mafia + 1 random alive non-mafia
  const aliveMafia = Object.values(gs.players).filter(p => p.alive && p.role === ROLES.MAFIA);
  const aliveNonMafia = Object.values(gs.players).filter(p => p.alive && p.role !== ROLES.MAFIA);

  if (aliveMafia.length === 0 || aliveNonMafia.length === 0) {
    return interaction.followUp({ content: MESSAGES.WRONG_PHASE, ephemeral: true });
  }

  const m = aliveMafia[randomInt(aliveMafia.length)];
  const c = aliveNonMafia[randomInt(aliveNonMafia.length)];

  // Randomize order so mafia isn't always listed first
  const [first, second] = randomInt(2) === 0
    ? [`<@${m.userId}>`, `<@${c.userId}>`]
    : [`<@${c.userId}>`, `<@${m.userId}>`];

  return interaction.followUp({
    content: MESSAGES.HINT_BOUGHT(first, second),
    ephemeral: true,
  });
}

// ==================== VOTE RESOLUTION ====================

function resolveMafiaVotes(gs) {
  const voteCounts = new Map();
  for (const targetId of gs.mafiaVotes.values()) {
    voteCounts.set(targetId, (voteCounts.get(targetId) || 0) + 1);
  }

  if (voteCounts.size === 0) {
    // No votes => random kill among alive non-mafia
    const targets = getAliveNonMafia(gs);
    if (targets.length > 0) {
      gs.resolvedMafiaTarget = targets[randomInt(targets.length)].userId;
    }
    return;
  }

  const maxCount = Math.max(...voteCounts.values());
  const tied = [...voteCounts.entries()].filter(([_, c]) => c === maxCount).map(([id]) => id);
  gs.resolvedMafiaTarget = tied.length === 1 ? tied[0] : tied[randomInt(tied.length)];
}

function resolveDayVotes(gs) {
  const counts = new Map();
  for (const target of gs.dayVotes.values()) {
    counts.set(target, (counts.get(target) || 0) + 1);
  }

  if (counts.size === 0) {
    return { outcome: 'SKIP', expelledId: null };
  }

  const maxCount = Math.max(...counts.values());
  const tied = [...counts.entries()].filter(([_, c]) => c === maxCount);

  if (tied.length > 1) {
    return { outcome: 'TIE', expelledId: null };
  }

  const [winner] = tied[0];
  if (winner === 'SKIP') {
    return { outcome: 'SKIP', expelledId: null };
  }

  return { outcome: 'EXPEL', expelledId: winner };
}

function computeVoteCounts(gs) {
  const counts = new Map();
  for (const target of gs.dayVotes.values()) {
    counts.set(target, (counts.get(target) || 0) + 1);
  }
  return counts;
}

// ==================== VOTE UI THROTTLE ====================

function scheduleVoteMessageUpdate(gs, session) {
  const now = Date.now();
  const elapsed = now - gs.lastVoteMessageEditTime;

  if (gs.pendingVoteUpdate) {
    clearTimeout(gs.pendingVoteUpdate);
    gs.pendingVoteUpdate = null;
  }

  if (elapsed >= VOTE_EDIT_THROTTLE_MS) {
    updateVoteMessage(gs, session);
    gs.lastVoteMessageEditTime = now;
  } else {
    const remaining = VOTE_EDIT_THROTTLE_MS - elapsed;
    gs.pendingVoteUpdate = setTimeout(() => {
      gs.pendingVoteUpdate = null;
      if (gs.phase === PHASES.DAY_VOTE && gs.state !== 'ENDED') {
        updateVoteMessage(gs, session);
        gs.lastVoteMessageEditTime = Date.now();
      }
    }, remaining);
  }
}

async function updateVoteMessage(gs, session) {
  if (!gs.voteMessageId) return;

  try {
    const msg = await gs.channel.messages.fetch(gs.voteMessageId);
    const alivePlayers = getAlivePlayers(gs);
    const voteCounts = computeVoteCounts(gs);

    await msg.edit({
      components: Buttons.buildDayVoteButtons(session, alivePlayers, voteCounts),
    });
  } catch (error) {
    logger.warn('[Mafia] Failed to update vote message:', error.message);
  }
}

async function disableVoteMessage(gs) {
  if (!gs.voteMessageId) return;

  try {
    const msg = await gs.channel.messages.fetch(gs.voteMessageId);
    await msg.edit({ components: [] });
  } catch (error) {
    logger.warn('[Mafia] Failed to disable vote message:', error.message);
  }
}

// ==================== ROLE ASSIGNMENT ====================

function assignRoles(sessionPlayers) {
  const count = sessionPlayers.length;
  const dist = ROLE_DISTRIBUTIONS[count];
  if (!dist) {
    throw new Error(`[Mafia] No role distribution for ${count} players`);
  }

  // Build role array
  const roles = [];
  for (let i = 0; i < dist.MAFIA; i++) roles.push(ROLES.MAFIA);
  for (let i = 0; i < dist.DOCTOR; i++) roles.push(ROLES.DOCTOR);
  for (let i = 0; i < dist.DETECTIVE; i++) roles.push(ROLES.DETECTIVE);
  for (let i = 0; i < dist.CITIZEN; i++) roles.push(ROLES.CITIZEN);

  // Fisher-Yates shuffle with crypto.randomInt
  for (let i = roles.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }

  // Assign to players
  const playerMap = {};
  sessionPlayers.forEach((p, idx) => {
    playerMap[p.userId] = {
      userId: p.userId,
      displayName: p.displayName || 'Unknown',
      role: roles[idx],
      alive: true,
    };
  });

  return {
    playerMap,
    detectiveEnabled: dist.DETECTIVE > 0,
    distribution: dist,
  };
}

// ==================== HELPERS ====================

function getAlivePlayers(gs) {
  return Object.values(gs.players).filter(p => p.alive);
}

function getAliveNonMafia(gs) {
  return Object.values(gs.players).filter(p => p.alive && p.role !== ROLES.MAFIA);
}

function findPlayerByRole(gs, role) {
  const player = Object.values(gs.players).find(p => p.role === role);
  return player ? player.userId : null;
}

async function changePhase(gs, session, newPhase) {
  gs.timeouts.clear('phase');
  gs.phase = newPhase;
  session.phase = newPhase;
  session.uiVersion = (session.uiVersion || 0) + 1;
  try {
    await sessionManager.save(session);
  } catch (error) {
    logger.warn('[Mafia] Failed to persist phase change:', error.message);
  }
}

function getPhaseEndEpoch(durationMs) {
  return Math.floor((Date.now() + durationMs) / 1000);
}

function getRunningPhaseEpoch(gs) {
  if (!gs.phaseStartedAt) {
    return Math.floor((Date.now() + 15000) / 1000);
  }
  // Determine phase duration
  const durations = {
    [PHASES.NIGHT_MAFIA]: TIMERS.NIGHT_MAFIA_MS,
    [PHASES.NIGHT_DOCTOR]: TIMERS.NIGHT_DOCTOR_MS,
    [PHASES.NIGHT_DETECTIVE]: TIMERS.NIGHT_DETECTIVE_MS,
    [PHASES.DAY_VOTE]: TIMERS.DAY_VOTE_MS,
    [PHASES.DAY_DISCUSS]: TIMERS.DAY_DISCUSS_MS,
  };
  const duration = durations[gs.phase] || 20000;
  const elapsed = Date.now() - gs.phaseStartedAt;
  const remaining = Math.max(0, duration - elapsed);
  return Math.floor((Date.now() + remaining) / 1000);
}

async function updateControlPanel(gs, session, content) {
  if (!gs.controlPanelMessageId) return;

  try {
    const msg = await gs.channel.messages.fetch(gs.controlPanelMessageId);
    await msg.edit({
      content,
      components: Buttons.buildControlPanelButtons(session, gs.phase),
    });
  } catch (error) {
    logger.warn('[Mafia] Failed to update control panel:', error.message);
  }
}

function delay(ms, signal = null) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Delay aborted'));
      return;
    }

    const timer = setTimeout(resolve, ms);

    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error('Delay aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

// ==================== CLEANUP ====================

export async function cancelMafiaGame(sessionId, reason = 'CANCELLED') {
  const gs = activeGames.get(sessionId);
  if (!gs) return false;

  gs.state = 'ENDED';

  try {
    await SessionService.endSession(sessionId, null, reason);
  } catch (error) {
    logger.error('[Mafia] Failed to end session during cancellation:', error);
  }

  // Notify channel
  try {
    await gs.channel.send({ content: MESSAGES.GAME_CANCELLED });
  } catch (error) {
    logger.warn('[Mafia] Failed to send cancellation message:', error.message);
  }

  // Edit control panel
  try {
    if (gs.controlPanelMessageId) {
      const msg = await gs.channel.messages.fetch(gs.controlPanelMessageId);
      await msg.edit({
        content: MESSAGES.GAME_CANCELLED,
        components: Buttons.buildDisabledControlPanel(),
      });
    }
  } catch (error) {
    logger.warn('[Mafia] Failed to edit control panel on cancel:', error.message);
  }

  cleanupGame(sessionId);
  logger.info(`[Mafia] Game cancelled: ${sessionId} - Reason: ${reason}`);
  return true;
}

function cleanupGame(sessionId) {
  const gs = activeGames.get(sessionId);
  if (gs) {
    gs.timeouts.clearAll();
    if (gs.abortController) {
      gs.abortController.abort();
    }
    if (gs.pendingVoteUpdate) {
      clearTimeout(gs.pendingVoteUpdate);
    }
  }
  activeGames.delete(sessionId);
  sessionLocks.delete(sessionId);
}

export function hasActiveGame(sessionId) {
  return activeGames.has(sessionId);
}

export function getActiveGameByChannel(channelId) {
  for (const gs of activeGames.values()) {
    if (gs?.channel?.id === channelId) {
      return gs;
    }
  }
  return null;
}

export async function cancelMafiaGameByChannel(channelId, reason = 'CANCELLED') {
  const gs = getActiveGameByChannel(channelId);
  if (!gs) return false;
  return await cancelMafiaGame(gs.sessionId, reason);
}

export function getActiveGamesCount() {
  return activeGames.size;
}
