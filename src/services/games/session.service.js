/**
 * Game Session Service - In-memory runtime storage
 *
 * Design:
 * - Live sessions are kept in process memory for low-latency gameplay.
 * - Sessions do NOT survive bot restarts (intentional).
 * - Ended sessions are archived briefly for payout/idempotency reads.
 */

import { randomInt } from 'crypto';
import { GAMES } from '../../config/games.config.js';
import { generateId } from '../../utils/helpers.js';
import logger from '../../utils/logger.js';
import { auditGameEvent } from './audit.service.js';

const LOCK_TTL_MS = 2 * 1000;
const LOCK_RETRY_DELAY_MS = 150;
const SESSION_ARCHIVE_TTL_MS = 300 * 1000;
const MAX_ARCHIVED_SESSIONS = 500;

const liveSessions = new Map(); // sessionId -> session
const archivedSessions = new Map(); // sessionId -> { session, expiresAt, timeout }

const channelIndex = new Map(); // channelId -> sessionId
const playerIndex = new Map(); // userId -> sessionId
const messageIndex = new Map(); // messageId -> sessionId
const waitingIndex = new Set(); // sessionId
const activeIndex = new Set(); // sessionId

const sessionLocks = new Map(); // lockKey -> expiresAt(ms)

const ALLOWED_TRANSITIONS = {
  WAITING: new Set(['ACTIVE', 'CANCELLED']),
  ACTIVE: new Set(['COMPLETED', 'CANCELLED']),
  COMPLETED: new Set(),
  CANCELLED: new Set(),
};

function deepClone(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canTransition(fromStatus, toStatus) {
  const allowed = ALLOWED_TRANSITIONS[fromStatus];
  if (!allowed) return false;
  return allowed.has(toStatus);
}

function getTerminalStatusFromReason(reason) {
  const cancelledReasons = new Set([
    'CANCELLED',
    'MESSAGE_DELETED',
    'NOT_ENOUGH_PLAYERS',
    'HOST_LEFT',
    'ALL_PLAYERS_LEFT',
    'STOP_COMMAND',
    'NOT_IMPLEMENTED',
    'RECOVERY_CANCELLED',
    'ERROR',
    'NO_WINNER',
  ]);
  return cancelledReasons.has(reason) ? 'CANCELLED' : 'COMPLETED';
}

function getDisplayName(user, member = null) {
  return member?.displayName || user.globalName || user.username;
}

function getLiveSessionUnsafe(sessionId) {
  return liveSessions.get(sessionId) || null;
}

function getArchivedSessionUnsafe(sessionId) {
  const archived = archivedSessions.get(sessionId);
  if (!archived) return null;

  if (Date.now() >= archived.expiresAt) {
    if (archived.timeout) clearTimeout(archived.timeout);
    archivedSessions.delete(sessionId);
    return null;
  }

  return archived.session;
}

function readSessionUnsafe(sessionId) {
  return getLiveSessionUnsafe(sessionId) || getArchivedSessionUnsafe(sessionId);
}

function releaseLock(lockKey) {
  sessionLocks.delete(lockKey);
}

function tryAcquireLock(lockKey, ttlMs = LOCK_TTL_MS) {
  const now = Date.now();
  const expiresAt = sessionLocks.get(lockKey);

  if (Number.isFinite(expiresAt) && expiresAt > now) {
    return false;
  }

  sessionLocks.set(lockKey, now + ttlMs);
  return true;
}

function clearArchivedSession(sessionId) {
  const archived = archivedSessions.get(sessionId);
  if (!archived) return;

  if (archived.timeout) clearTimeout(archived.timeout);
  archivedSessions.delete(sessionId);
}

function archiveSession(session) {
  if (!session?.id) return;

  clearArchivedSession(session.id);

  const archivedCopy = deepClone(session);
  const timeout = setTimeout(() => {
    archivedSessions.delete(session.id);
  }, SESSION_ARCHIVE_TTL_MS);

  if (typeof timeout.unref === 'function') {
    timeout.unref();
  }

  archivedSessions.set(session.id, {
    session: archivedCopy,
    expiresAt: Date.now() + SESSION_ARCHIVE_TTL_MS,
    timeout,
  });
}

function deleteMapEntriesBySessionId(index, sessionId, keepKey = null) {
  for (const [key, value] of index.entries()) {
    if (value !== sessionId) continue;
    if (keepKey !== null && key === keepKey) continue;
    index.delete(key);
  }
}

function syncIndexesForLiveSession(session) {
  const { id: sessionId, channelId, messageId } = session;

  deleteMapEntriesBySessionId(channelIndex, sessionId, channelId ?? null);
  if (channelId) {
    channelIndex.set(channelId, sessionId);
  }

  deleteMapEntriesBySessionId(messageIndex, sessionId, messageId ?? null);
  if (messageId) {
    messageIndex.set(messageId, sessionId);
  }

  deleteMapEntriesBySessionId(playerIndex, sessionId, null);
  for (const player of session.players || []) {
    if (player?.userId) {
      playerIndex.set(player.userId, sessionId);
    }
  }

  waitingIndex.delete(sessionId);
  activeIndex.delete(sessionId);

  if (session.status === 'WAITING') {
    waitingIndex.add(sessionId);
  } else if (session.status === 'ACTIVE') {
    activeIndex.add(sessionId);
  }
}

function removeIndexesForSession(session) {
  if (!session?.id) return;

  waitingIndex.delete(session.id);
  activeIndex.delete(session.id);

  if (session.channelId) {
    const mapped = channelIndex.get(session.channelId);
    if (mapped === session.id) {
      channelIndex.delete(session.channelId);
    }
  }

  if (session.messageId) {
    const mapped = messageIndex.get(session.messageId);
    if (mapped === session.id) {
      messageIndex.delete(session.messageId);
    }
  }

  for (const player of session.players || []) {
    if (!player?.userId) continue;
    const mapped = playerIndex.get(player.userId);
    if (mapped === session.id) {
      playerIndex.delete(player.userId);
    }
  }
}

function cleanupStaleIndexReferences(sessionId) {
  waitingIndex.delete(sessionId);
  activeIndex.delete(sessionId);

  deleteMapEntriesBySessionId(channelIndex, sessionId, null);
  deleteMapEntriesBySessionId(messageIndex, sessionId, null);
  deleteMapEntriesBySessionId(playerIndex, sessionId, null);
}

function persistLiveSessionUnsafe(session) {
  const copy = deepClone(session);
  liveSessions.set(copy.id, copy);
  syncIndexesForLiveSession(copy);
  return copy;
}

const maintenanceSweepInterval = setInterval(() => {
  const now = Date.now();

  // Sweep expired archived sessions
  for (const [sessionId, archived] of archivedSessions.entries()) {
    if (archived.expiresAt <= now) {
      if (archived.timeout) clearTimeout(archived.timeout);
      archivedSessions.delete(sessionId);
    }
  }

  // Cap archived sessions (evict oldest when over limit)
  if (archivedSessions.size > MAX_ARCHIVED_SESSIONS) {
    const excess = archivedSessions.size - MAX_ARCHIVED_SESSIONS;
    let removed = 0;
    for (const [sessionId, archived] of archivedSessions.entries()) {
      if (removed >= excess) break;
      if (archived.timeout) clearTimeout(archived.timeout);
      archivedSessions.delete(sessionId);
      removed++;
    }
    logger.warn(`[Session] Evicted ${removed} archived sessions (cap: ${MAX_ARCHIVED_SESSIONS})`);
  }

  // Sweep expired locks (prevents unbounded growth)
  for (const [lockKey, expiresAt] of sessionLocks.entries()) {
    if (expiresAt <= now) {
      sessionLocks.delete(lockKey);
    }
  }
}, 30_000);

if (typeof maintenanceSweepInterval.unref === 'function') {
  maintenanceSweepInterval.unref();
}

/**
 * Create session
 */
export async function createSession({ gameType, guildId, channelId, user, member = null }) {
  const existingSessionId = channelIndex.get(channelId);
  if (existingSessionId) {
    const existing = readSessionUnsafe(existingSessionId);
    if (existing && ['WAITING', 'ACTIVE'].includes(existing.status)) {
      return { error: 'CHANNEL_HAS_GAME', existingSession: deepClone(existing) };
    }
    await cleanupSession(existingSessionId);
  }

  const gameConfig = GAMES[gameType];
  if (!gameConfig) return { error: 'INVALID_GAME_TYPE' };

  const sessionId = generateId(12);
  const countdownSeconds = gameConfig.countdownSeconds || 30;

  const session = {
    id: sessionId,
    gameType,
    guildId,
    channelId,
    messageId: null,
    hostId: user.id,
    players: [],
    status: 'WAITING',
    phase: 'WAITING',
    uiVersion: 0,
    payoutDone: false,
    gameState: {},
    winnerId: null,
    createdAt: Date.now(),
    countdownEndsAt: Date.now() + (countdownSeconds * 1000),
    startedAt: null,
    completedAt: null,
    settings: {
      minPlayers: gameConfig.minPlayers,
      maxPlayers: gameConfig.maxPlayers,
      lobbyType: gameConfig.lobbyType,
      countdownSeconds,
    },
  };

  persistLiveSessionUnsafe(session);

  logger.info(`Session created: ${sessionId} (${gameType})`);

  return deepClone(session);
}

/**
 * Get session by ID (live or archived)
 */
export async function getSession(sessionId) {
  return deepClone(readSessionUnsafe(sessionId));
}

/**
 * Get session by channel
 */
export async function getSessionByChannel(channelId) {
  const sessionId = channelIndex.get(channelId);
  if (!sessionId) return null;
  const session = readSessionUnsafe(sessionId);
  if (!session) {
    channelIndex.delete(channelId);
    return null;
  }
  return deepClone(session);
}

/**
 * Get session by message
 */
export async function getSessionByMessage(messageId) {
  const sessionId = messageIndex.get(messageId);
  if (!sessionId) return null;
  const session = readSessionUnsafe(sessionId);
  if (!session) {
    messageIndex.delete(messageId);
    return null;
  }
  return deepClone(session);
}

/**
 * Set message ID
 */
export async function setMessageId(sessionId, messageId) {
  const session = getLiveSessionUnsafe(sessionId);
  if (!session) return null;

  session.messageId = messageId;
  const persisted = persistLiveSessionUnsafe(session);

  return deepClone(persisted);
}

/**
 * Save session
 */
export async function saveSession(session) {
  if (!session?.id) return null;

  if (session.status === 'WAITING' || session.status === 'ACTIVE') {
    const persisted = persistLiveSessionUnsafe(session);
    return deepClone(persisted);
  }

  // Terminal state: keep only in short-lived archive.
  liveSessions.delete(session.id);
  cleanupStaleIndexReferences(session.id);
  archiveSession(session);
  return deepClone(session);
}

/**
 * Join session
 */
export async function joinSession({ session: initialSession, user, member = null, preferredSlot = null }) {
  let session = initialSession;

  if (!session) return { error: 'SESSION_NOT_FOUND' };
  if (session.status !== 'WAITING') return { error: 'GAME_ALREADY_STARTED' };
  if (session.players.length >= session.settings.maxPlayers) return { error: 'GAME_FULL' };
  if (session.players.some((p) => p.userId === user.id)) return { error: 'ALREADY_IN_GAME' };

  const lockKey = `lock:${session.id}`;
  const retryDelays = [50, 150, 300];

  let gotLock = tryAcquireLock(lockKey, LOCK_TTL_MS);
  if (!gotLock) {
    for (const delayMs of retryDelays) {
      await sleep(delayMs);
      gotLock = tryAcquireLock(lockKey, LOCK_TTL_MS);
      if (gotLock) break;
    }
    if (!gotLock) {
      return { error: 'BUSY_TRY_AGAIN' };
    }
  }

  try {
    session = getLiveSessionUnsafe(session.id);

    if (!session) return { error: 'SESSION_NOT_FOUND' };
    if (session.status !== 'WAITING') return { error: 'GAME_ALREADY_STARTED' };
    if (session.players.length >= session.settings.maxPlayers) return { error: 'GAME_FULL' };
    if (session.players.some((p) => p.userId === user.id)) return { error: 'ALREADY_IN_GAME' };

    const existingSessionId = playerIndex.get(user.id);
    if (existingSessionId && existingSessionId !== session.id) {
      const existingSession = readSessionUnsafe(existingSessionId);
      if (existingSession && ['WAITING', 'ACTIVE'].includes(existingSession.status)) {
        return { error: 'PLAYER_IN_OTHER_GAME' };
      }
      if (!existingSession || ['COMPLETED', 'CANCELLED'].includes(existingSession.status)) {
        playerIndex.delete(user.id);
      }
    }

    const usedSlots = new Set(session.players.map((p) => p.slotNumber));
    let slotNumber;

    if (session.settings.lobbyType === 'SLOTS') {
      if (
        preferredSlot &&
        !usedSlots.has(preferredSlot) &&
        preferredSlot >= 1 &&
        preferredSlot <= session.settings.maxPlayers
      ) {
        slotNumber = preferredSlot;
      } else {
        const emptySlots = [];
        for (let i = 1; i <= session.settings.maxPlayers; i += 1) {
          if (!usedSlots.has(i)) emptySlots.push(i);
        }
        slotNumber = emptySlots[randomInt(emptySlots.length)];
      }
    } else {
      slotNumber = session.players.length + 1;
    }

    session.players.push({
      userId: user.id,
      username: user.username,
      displayName: getDisplayName(user, member),
      avatarURL: user.displayAvatarURL({ dynamic: true, size: 128 }),
      slotNumber,
      status: 'waiting',
      perks: [],
      joinedAt: Date.now(),
    });

    session.players.sort((a, b) => a.slotNumber - b.slotNumber);
    persistLiveSessionUnsafe(session);

    logger.debug(`${user.username} joined ${session.id} (slot ${slotNumber})`);

    return { session: deepClone(session), slotNumber };
  } finally {
    releaseLock(lockKey);
  }
}

/**
 * Leave session
 */
export async function leaveSession({ session: initialSession, userId }) {
  let session = initialSession;
  if (!session) return { error: 'SESSION_NOT_FOUND' };

  const lockKey = `lock:${session.id}`;
  const gotLock = tryAcquireLock(lockKey, LOCK_TTL_MS);
  if (!gotLock) {
    return { error: 'BUSY_TRY_AGAIN' };
  }

  try {
    session = getLiveSessionUnsafe(session.id);
    if (!session) return { error: 'SESSION_NOT_FOUND' };

    const playerIndexInSession = session.players.findIndex((p) => p.userId === userId);
    if (playerIndexInSession === -1) return { error: 'NOT_IN_GAME' };

    session.players.splice(playerIndexInSession, 1);
    persistLiveSessionUnsafe(session);

    logger.debug(`${userId} left ${session.id}`);

    return { session: deepClone(session) };
  } finally {
    releaseLock(lockKey);
  }
}

/**
 * Start game
 */
export async function startGame(session) {
  if (!session?.id) return { error: 'SESSION_NOT_FOUND' };

  const liveSession = getLiveSessionUnsafe(session.id);
  if (!liveSession) return { error: 'SESSION_NOT_FOUND' };

  if (liveSession.status !== 'WAITING') {
    return {
      error: 'INVALID_TRANSITION',
      from: liveSession.status,
      to: 'ACTIVE',
    };
  }

  if (liveSession.players.length < liveSession.settings.minPlayers) {
    await cleanupSession(liveSession.id);
    return {
      error: 'NOT_ENOUGH_PLAYERS',
      required: liveSession.settings.minPlayers,
      current: liveSession.players.length,
    };
  }

  liveSession.status = 'ACTIVE';
  liveSession.phase = 'ACTIVE';
  if (!Number.isFinite(liveSession.uiVersion)) {
    liveSession.uiVersion = 0;
  }
  liveSession.startedAt = Date.now();
  liveSession.countdownEndsAt = null;
  liveSession.players.forEach((player) => {
    player.status = 'playing';
  });

  persistLiveSessionUnsafe(liveSession);

  logger.info(`Game started: ${liveSession.id} with ${liveSession.players.length} players`);
  auditGameEvent('session_started', liveSession, {
    minPlayers: liveSession.settings?.minPlayers,
    maxPlayers: liveSession.settings?.maxPlayers,
  });

  return { session: deepClone(liveSession) };
}

/**
 * End session
 */
export async function endSession(sessionId, winnerId = null, reason = 'COMPLETED') {
  const session = readSessionUnsafe(sessionId);
  if (!session) return { error: 'SESSION_NOT_FOUND' };

  const nextStatus = getTerminalStatusFromReason(reason);
  if (!canTransition(session.status, nextStatus) && session.status !== nextStatus) {
    return {
      error: 'INVALID_TRANSITION',
      from: session.status,
      to: nextStatus,
      session: deepClone(session),
    };
  }

  session.status = nextStatus;
  session.phase = nextStatus;
  session.completedAt = Date.now();
  session.winnerId = winnerId;
  session.gameState = session.gameState || {};
  session.gameState.endReason = reason;

  if (winnerId) {
    const winner = session.players.find((p) => p.userId === winnerId);
    if (winner) winner.status = 'winner';
  }

  const liveSession = getLiveSessionUnsafe(sessionId);
  if (liveSession) {
    removeIndexesForSession(liveSession);
  }

  liveSessions.delete(sessionId);
  cleanupStaleIndexReferences(sessionId);
  archiveSession(session);

  logger.info(`Game ended: ${sessionId} - Status: ${nextStatus} - Reason: ${reason}`);
  auditGameEvent('session_ended', session, { reason, winnerId });

  return { session: deepClone(session) };
}

/**
 * Cleanup session
 */
export async function cleanupSession(sessionId) {
  const liveSession = getLiveSessionUnsafe(sessionId);
  const archivedSession = getArchivedSessionUnsafe(sessionId);
  const session = liveSession || archivedSession;

  if (liveSession) {
    removeIndexesForSession(liveSession);
  }

  liveSessions.delete(sessionId);
  clearArchivedSession(sessionId);
  cleanupStaleIndexReferences(sessionId);

  logger.info(`Session cleaned: ${sessionId}`);
  auditGameEvent('session_cleaned', session || { id: sessionId }, {});
  return true;
}

/**
 * Force clear channel
 */
export async function forceClearChannel(channelId) {
  const sessionId = channelIndex.get(channelId);
  if (sessionId) {
    await cleanupSession(sessionId);
    return true;
  }
  return false;
}

/**
 * Add perk to player
 */
export async function addPlayerPerk(session, userId, perkId) {
  if (!session?.id) return null;

  const liveSession = getLiveSessionUnsafe(session.id);
  if (!liveSession) return null;

  const player = liveSession.players.find((p) => p.userId === userId);
  if (!player) return null;

  if (!player.perks.includes(perkId)) {
    player.perks.push(perkId);
  }

  persistLiveSessionUnsafe(liveSession);
  return deepClone(liveSession);
}

/**
 * Get remaining countdown seconds
 */
export function getRemainingCountdown(session) {
  if (!session?.countdownEndsAt) return 0;
  const remaining = Math.ceil((session.countdownEndsAt - Date.now()) / 1000);
  return Math.max(0, remaining);
}

/**
 * Check if countdown expired
 */
export function isCountdownExpired(session) {
  if (!session?.countdownEndsAt) return true;
  return Date.now() >= session.countdownEndsAt;
}

/**
 * Get all waiting sessions
 */
export async function getAllWaitingSessions() {
  const validSessions = [];
  const staleIds = [];

  for (const sessionId of waitingIndex) {
    const session = getLiveSessionUnsafe(sessionId);
    if (session && session.status === 'WAITING') {
      validSessions.push(deepClone(session));
    } else {
      staleIds.push(sessionId);
    }
  }

  for (const staleId of staleIds) {
    waitingIndex.delete(staleId);
  }

  return validSessions;
}

/**
 * Get all active sessions
 */
export async function getAllActiveSessions() {
  const validSessions = [];
  const staleIds = [];

  for (const sessionId of activeIndex) {
    const session = getLiveSessionUnsafe(sessionId);
    if (session && session.status === 'ACTIVE') {
      validSessions.push(deepClone(session));
    } else {
      staleIds.push(sessionId);
    }
  }

  for (const staleId of staleIds) {
    activeIndex.delete(staleId);
  }

  return validSessions;
}
