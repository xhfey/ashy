/**
 * Game Runner Service
 * Dispatches to game implementations through the central registry.
 */

import logger from '../../utils/logger.js';
import {
  getAllGameModules,
  getGameModule,
  getRuntimeSnapshot,
  prewarmAssetsForImplementedGames
} from '../../games/registry.js';
import { auditGameEvent } from './audit.service.js';

let handlersRegistered = false;

/**
 * Register all implemented game handlers with ButtonRouter.
 */
export function registerGameHandlers() {
  if (handlersRegistered) return;

  for (const mod of getAllGameModules()) {
    if (!mod.implemented || typeof mod.registerHandlers !== 'function') continue;

    try {
      mod.registerHandlers();
    } catch (error) {
      logger.error(`[GameRunner] Failed to register handler for ${mod.id}:`, error);
    }
  }

  handlersRegistered = true;
  logger.info('[GameRunner] Game handlers registered via registry');
}

/**
 * Start game runtime from session.
 * Returns false if module is unavailable/unimplemented.
 */
export async function startGameForSession(session, channel) {
  if (!session || !channel) return false;

  const mod = getGameModule(session.gameType);
  if (!mod || !mod.implemented || typeof mod.start !== 'function') {
    logger.info(`[GameRunner] Game type not implemented: ${session.gameType}`);
    return false;
  }

  try {
    await mod.start(session, channel);
    return true;
  } catch (error) {
    logger.error(`[GameRunner] Failed to start ${session.gameType}:`, error);
    return false;
  }
}

/**
 * Cancel in-memory runtime for a session (if any).
 * Does not mutate Redis session state.
 */
export async function cancelGameRuntime(session, reason = 'CANCELLED') {
  const sessionId = session?.id;
  const gameType = session?.gameType;
  if (!sessionId || !gameType) return false;

  const mod = getGameModule(gameType);
  if (!mod || typeof mod.stop !== 'function') return false;

  const cancelled = await mod.stop(sessionId, reason);
  if (cancelled) {
    auditGameEvent('runtime_cancelled', session, { reason });
  }
  return cancelled;
}

/**
 * Cancel runtime by channel (fallback path when Redis session is missing).
 */
export async function cancelGameRuntimeByChannel(channelId, reason = 'CANCELLED') {
  for (const mod of getAllGameModules()) {
    if (!mod.implemented || typeof mod.stopByChannel !== 'function') continue;

    try {
      const cancelled = await mod.stopByChannel(channelId, reason);
      if (cancelled) return true;
    } catch (error) {
      logger.warn(`[GameRunner] stopByChannel failed for ${mod.id}: ${error.message}`);
    }
  }
  return false;
}

/**
 * Inspect in-memory runtime state for a channel.
 * Useful when Redis session is missing but runtime still exists.
 */
export function findRuntimeGameByChannel(channelId) {
  for (const mod of getAllGameModules()) {
    if (!mod.implemented || typeof mod.findByChannel !== 'function') continue;

    try {
      const state = mod.findByChannel(channelId);
      if (!state) continue;

      return {
        gameType: mod.id,
        sessionId: state.sessionId ?? null,
        hostId: state.hostId ?? null,
      };
    } catch (error) {
      logger.warn(`[GameRunner] findByChannel failed for ${mod.id}: ${error.message}`);
    }
  }

  return null;
}

/**
 * Snapshot of active game runtimes for diagnostics.
 */
export function getGameRuntimeSnapshot() {
  return getRuntimeSnapshot();
}

/**
 * Prewarm heavy game assets on startup.
 */
export async function prewarmGameAssets() {
  await prewarmAssetsForImplementedGames();
}
