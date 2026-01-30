/**
 * Game Session Service - FIXED VERSION
 *
 * Fixes applied:
 * - Lock logic properly re-acquires after wait
 * - Destructured param reassignment fixed
 * - Lock release is fire-and-forget
 * - Uses SADD/SMEMBERS instead of KEYS for session index
 */

import * as RedisService from '../redis.service.js';
import { generateId } from '../../utils/helpers.js';
import { GAMES } from '../../config/games.config.js';
import logger from '../../utils/logger.js';
import { randomInt } from 'crypto';

const KEYS = {
  SESSION: 'session:',
  CHANNEL: 'channel:',
  PLAYER: 'player:',
  MESSAGE: 'message:',
  LOCK: 'lock:',
  WAITING_INDEX: 'waiting_sessions',
};

const SESSION_TTL = 2 * 60 * 60;
const LOCK_TTL = 2;

function getDisplayName(user, member = null) {
  return member?.displayName || user.globalName || user.username;
}

/**
 * Create session - OPTIMIZED
 */
export async function createSession({ gameType, guildId, channelId, user, member = null }) {
  // Check existing
  const existingSessionId = await RedisService.get(KEYS.CHANNEL + channelId);
  if (existingSessionId) {
    const existing = await RedisService.get(KEYS.SESSION + existingSessionId);
    if (existing && ['WAITING', 'ACTIVE'].includes(existing.status)) {
      return { error: 'CHANNEL_HAS_GAME', existingSession: existing };
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
      countdownSeconds
    }
  };

  // Batch: save session + channel mapping + add to waiting index
  const pipeline = RedisService.redis.pipeline();
  pipeline.setex(KEYS.SESSION + sessionId, SESSION_TTL, JSON.stringify(session));
  pipeline.setex(KEYS.CHANNEL + channelId, SESSION_TTL, sessionId);
  pipeline.sadd(KEYS.WAITING_INDEX, sessionId);
  await pipeline.exec();

  logger.info(`Session created: ${sessionId} (${gameType})`);

  return session;
}

/**
 * Get session by ID
 */
export async function getSession(sessionId) {
  return RedisService.get(KEYS.SESSION + sessionId);
}

/**
 * Get session by channel
 */
export async function getSessionByChannel(channelId) {
  const sessionId = await RedisService.get(KEYS.CHANNEL + channelId);
  if (!sessionId) return null;
  return RedisService.get(KEYS.SESSION + sessionId);
}

/**
 * Get session by message
 */
export async function getSessionByMessage(messageId) {
  const sessionId = await RedisService.get(KEYS.MESSAGE + messageId);
  if (!sessionId) return null;
  return RedisService.get(KEYS.SESSION + sessionId);
}

/**
 * Set message ID
 */
export async function setMessageId(sessionId, messageId) {
  const session = await getSession(sessionId);
  if (!session) return null;

  session.messageId = messageId;

  await RedisService.setMany([
    { key: KEYS.SESSION + sessionId, value: session },
    { key: KEYS.MESSAGE + messageId, value: sessionId }
  ], SESSION_TTL);

  return session;
}

/**
 * Join session - FIXED VERSION
 *
 * Fixes:
 * - Properly handles lock acquisition retry
 * - Uses let for session variable (not destructured reassignment)
 * - Fire-and-forget lock release
 */
export async function joinSession({ session: initialSession, user, member = null, preferredSlot = null }) {
  // Use let so we can reassign after lock
  let session = initialSession;

  // Quick validations (no Redis needed)
  if (!session) return { error: 'SESSION_NOT_FOUND' };
  if (session.status !== 'WAITING') return { error: 'GAME_ALREADY_STARTED' };
  if (session.players.length >= session.settings.maxPlayers) return { error: 'GAME_FULL' };
  if (session.players.some(p => p.userId === user.id)) return { error: 'ALREADY_IN_GAME' };

  const lockKey = KEYS.LOCK + session.id;

  // Try to acquire lock
  let gotLock = await RedisService.acquireLock(lockKey, LOCK_TTL);

  if (!gotLock) {
    // Wait and retry ONCE
    await new Promise(r => setTimeout(r, 150));
    gotLock = await RedisService.acquireLock(lockKey, LOCK_TTL);

    if (!gotLock) {
      // Still can't get lock, tell user to retry
      return { error: 'BUSY_TRY_AGAIN' };
    }
  }

  // We have the lock! Re-fetch session to get fresh state
  session = await getSession(session.id);

  // Re-validate after getting fresh state
  if (!session) {
    RedisService.releaseLock(lockKey);
    return { error: 'SESSION_NOT_FOUND' };
  }
  if (session.status !== 'WAITING') {
    RedisService.releaseLock(lockKey);
    return { error: 'GAME_ALREADY_STARTED' };
  }
  if (session.players.length >= session.settings.maxPlayers) {
    RedisService.releaseLock(lockKey);
    return { error: 'GAME_FULL' };
  }
  if (session.players.some(p => p.userId === user.id)) {
    RedisService.releaseLock(lockKey);
    return { error: 'ALREADY_IN_GAME' };
  }

  // Check if player is in another game (parallelized query)
  const existingSessionId = await RedisService.get(KEYS.PLAYER + user.id);
  if (existingSessionId && existingSessionId !== session.id) {
    // Only fetch existing session if there's a potential conflict
    const existingSession = await RedisService.get(KEYS.SESSION + existingSessionId);
    if (existingSession && ['WAITING', 'ACTIVE'].includes(existingSession.status)) {
      RedisService.releaseLock(lockKey);
      return { error: 'PLAYER_IN_OTHER_GAME' };
    }
    // If session doesn't exist or is completed, clean up stale player mapping
    if (!existingSession) {
      RedisService.redis.del(KEYS.PLAYER + user.id).catch(() => {});
    }
  }

  // Determine slot number
  const usedSlots = new Set(session.players.map(p => p.slotNumber));
  let slotNumber;

  if (session.settings.lobbyType === 'SLOTS') {
    if (preferredSlot && !usedSlots.has(preferredSlot) && preferredSlot >= 1 && preferredSlot <= session.settings.maxPlayers) {
      slotNumber = preferredSlot;
    } else {
      // True random from empty slots
      const emptySlots = [];
      for (let i = 1; i <= session.settings.maxPlayers; i++) {
        if (!usedSlots.has(i)) emptySlots.push(i);
      }
      slotNumber = emptySlots[randomInt(emptySlots.length)];
    }
  } else {
    // SIMPLE: sequential
    slotNumber = session.players.length + 1;
  }

  // Add player
  session.players.push({
    userId: user.id,
    username: user.username,
    displayName: getDisplayName(user, member),
    avatarURL: user.displayAvatarURL({ dynamic: true, size: 128 }),
    slotNumber,
    status: 'waiting',
    perks: [],
    joinedAt: Date.now()
  });

  session.players.sort((a, b) => a.slotNumber - b.slotNumber);

  // Batch write: session + player mapping
  await RedisService.setMany([
    { key: KEYS.SESSION + session.id, value: session },
    { key: KEYS.PLAYER + user.id, value: session.id }
  ], SESSION_TTL);

  // Release lock (fire and forget - no await!)
  RedisService.releaseLock(lockKey);

  logger.debug(`${user.username} joined ${session.id} (slot ${slotNumber})`);

  return { session, slotNumber };
}

/**
 * Leave session - FIXED
 */
export async function leaveSession({ session: initialSession, userId }) {
  let session = initialSession;

  if (!session) return { error: 'SESSION_NOT_FOUND' };

  const playerIndex = session.players.findIndex(p => p.userId === userId);
  if (playerIndex === -1) return { error: 'NOT_IN_GAME' };

  session.players.splice(playerIndex, 1);

  // Batch: update session + remove player mapping
  const pipeline = RedisService.redis.pipeline();
  pipeline.setex(KEYS.SESSION + session.id, SESSION_TTL, JSON.stringify(session));
  pipeline.del(KEYS.PLAYER + userId);
  await pipeline.exec();

  logger.debug(`${userId} left ${session.id}`);

  return { session };
}

/**
 * Start game
 */
export async function startGame(session) {
  if (!session) return { error: 'SESSION_NOT_FOUND' };

  if (session.players.length < session.settings.minPlayers) {
    await cleanupSession(session.id);
    return {
      error: 'NOT_ENOUGH_PLAYERS',
      required: session.settings.minPlayers,
      current: session.players.length
    };
  }

  session.status = 'ACTIVE';
  session.startedAt = Date.now();
  session.countdownEndsAt = null;
  session.players.forEach(p => { p.status = 'playing'; });

  // Update session + remove from waiting index
  const pipeline = RedisService.redis.pipeline();
  pipeline.setex(KEYS.SESSION + session.id, SESSION_TTL, JSON.stringify(session));
  pipeline.srem(KEYS.WAITING_INDEX, session.id);
  await pipeline.exec();

  logger.info(`Game started: ${session.id} with ${session.players.length} players`);

  return { session };
}

/**
 * End session
 */
export async function endSession(sessionId, winnerId = null, reason = 'COMPLETED') {
  const session = await getSession(sessionId);
  if (!session) return { error: 'SESSION_NOT_FOUND' };

  session.status = 'COMPLETED';
  session.completedAt = Date.now();
  session.winnerId = winnerId;
  session.gameState.endReason = reason;

  if (winnerId) {
    const winner = session.players.find(p => p.userId === winnerId);
    if (winner) winner.status = 'winner';
  }

  // Collect keys to delete
  const keysToDelete = [
    KEYS.CHANNEL + session.channelId,
    ...(session.messageId ? [KEYS.MESSAGE + session.messageId] : []),
    ...session.players.map(p => KEYS.PLAYER + p.userId)
  ];

  // Batch: keep session briefly + delete mappings + remove from index
  const pipeline = RedisService.redis.pipeline();
  pipeline.setex(KEYS.SESSION + sessionId, 300, JSON.stringify(session));
  keysToDelete.forEach(k => pipeline.del(k));
  pipeline.srem(KEYS.WAITING_INDEX, sessionId);
  await pipeline.exec();

  logger.info(`Game ended: ${sessionId} - Reason: ${reason}`);

  return { session };
}

/**
 * Cleanup session - OPTIMIZED batch delete
 */
export async function cleanupSession(sessionId) {
  const session = await getSession(sessionId);

  const keysToDelete = [KEYS.SESSION + sessionId];

  if (session) {
    keysToDelete.push(KEYS.CHANNEL + session.channelId);
    if (session.messageId) keysToDelete.push(KEYS.MESSAGE + session.messageId);
    session.players.forEach(p => keysToDelete.push(KEYS.PLAYER + p.userId));
  }

  // Batch delete + remove from index
  const pipeline = RedisService.redis.pipeline();
  keysToDelete.forEach(k => pipeline.del(k));
  pipeline.srem(KEYS.WAITING_INDEX, sessionId);
  await pipeline.exec();

  logger.info(`Session cleaned: ${sessionId}`);
  return true;
}

/**
 * Handle message deleted
 */
export async function handleMessageDeleted(messageId) {
  const session = await getSessionByMessage(messageId);

  // Clean up regardless of status (WAITING or ACTIVE)
  if (session) {
    await cleanupSession(session.id);
    return { sessionEnded: true, session };
  }

  return { sessionEnded: false };
}

/**
 * Force clear channel
 */
export async function forceClearChannel(channelId) {
  const sessionId = await RedisService.get(KEYS.CHANNEL + channelId);
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
  if (!session) return null;

  const player = session.players.find(p => p.userId === userId);
  if (!player) return null;

  if (!player.perks.includes(perkId)) {
    player.perks.push(perkId);
  }

  await RedisService.set(KEYS.SESSION + session.id, session, SESSION_TTL);
  return session;
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
 * Get all waiting sessions - uses SMEMBERS instead of KEYS
 * Much faster and safer at scale!
 */
export async function getAllWaitingSessions() {
  const sessionIds = await RedisService.smembers(KEYS.WAITING_INDEX);
  if (sessionIds.length === 0) return [];

  const sessionKeys = sessionIds.map(id => KEYS.SESSION + id);
  const sessions = await RedisService.getMany(sessionKeys);

  // Filter out nulls and non-waiting sessions (cleanup stale index entries)
  const validSessions = [];
  const staleIds = [];

  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    if (session && session.status === 'WAITING') {
      validSessions.push(session);
    } else if (!session) {
      staleIds.push(sessionIds[i]);
    }
  }

  // Clean up stale index entries (fire and forget)
  if (staleIds.length > 0) {
    const pipeline = RedisService.redis.pipeline();
    staleIds.forEach(id => pipeline.srem(KEYS.WAITING_INDEX, id));
    pipeline.exec().catch(() => {});
  }

  return validSessions;
}
