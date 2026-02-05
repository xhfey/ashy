import * as SessionService from './session.service.js';
import { auditGameEvent } from './audit.service.js';
import logger from '../../utils/logger.js';

let gameRunnerPromise = null;
async function getGameRunnerService() {
  if (!gameRunnerPromise) {
    gameRunnerPromise = import('./game-runner.service.js');
  }
  return gameRunnerPromise;
}

/**
 * Cancel both runtime state and Redis session state for a known session.
 */
export async function cancelSessionEverywhere(session, reason = 'CANCELLED', options = {}) {
  const hardCleanup = options.hardCleanup === true;
  const sessionId = session?.id;

  if (!sessionId) {
    return {
      cancelled: false,
      runtimeCancelled: false,
      redisCleaned: false,
      transition: 'MISSING_SESSION',
    };
  }

  let runtimeCancelled = false;
  let redisCleaned = false;
  let transition = 'UNKNOWN';

  try {
    const { cancelGameRuntime } = await getGameRunnerService();
    runtimeCancelled = await cancelGameRuntime(session, reason);
  } catch (error) {
    logger.warn(`[Cancel] Runtime cancel failed for ${sessionId}: ${error.message}`);
  }

  try {
    const endResult = await SessionService.endSession(sessionId, null, reason);
    if (endResult?.session) {
      redisCleaned = true;
      transition = 'ENDED';
    } else if (endResult?.error === 'SESSION_NOT_FOUND') {
      redisCleaned = true;
      transition = 'SESSION_NOT_FOUND';
    } else {
      transition = endResult?.error || 'END_FAILED';
    }
  } catch (error) {
    transition = 'END_EXCEPTION';
    logger.warn(`[Cancel] endSession failed for ${sessionId}: ${error.message}`);
  }

  // Hard cleanup guarantees no leftover Redis session key/indexes.
  if (hardCleanup || !redisCleaned) {
    try {
      await SessionService.cleanupSession(sessionId);
      redisCleaned = true;
      transition = hardCleanup ? 'HARD_CLEANED' : 'CLEANED_FALLBACK';
    } catch (error) {
      logger.error(`[Cancel] cleanupSession failed for ${sessionId}:`, error);
    }
  }

  auditGameEvent('session_cancelled_unified', session, {
    reason,
    hardCleanup,
    runtimeCancelled,
    redisCleaned,
    transition,
  });

  return {
    cancelled: runtimeCancelled || redisCleaned,
    runtimeCancelled,
    redisCleaned,
    transition,
  };
}

/**
 * Cancel game state by channel, even if Redis session mapping is stale/missing.
 */
export async function cancelChannelEverywhere(channelId, reason = 'CANCELLED', options = {}) {
  const session = await SessionService.getSessionByChannel(channelId);
  if (session) {
    const result = await cancelSessionEverywhere(session, reason, options);
    return {
      ...result,
      via: 'SESSION',
      sessionId: session.id,
      gameType: session.gameType,
      hostId: session.hostId || null,
    };
  }

  let runtimeCancelled = false;
  try {
    const { cancelGameRuntimeByChannel } = await getGameRunnerService();
    runtimeCancelled = await cancelGameRuntimeByChannel(channelId, reason);
  } catch (error) {
    logger.warn(`[Cancel] Runtime channel cancel failed for ${channelId}: ${error.message}`);
  }
  return {
    cancelled: runtimeCancelled,
    runtimeCancelled,
    redisCleaned: false,
    transition: runtimeCancelled ? 'RUNTIME_ONLY' : 'NONE',
    via: runtimeCancelled ? 'RUNTIME' : 'NONE',
    sessionId: null,
    gameType: null,
    hostId: null,
  };
}

export default {
  cancelSessionEverywhere,
  cancelChannelEverywhere,
};
