/**
 * Countdown Service
 *
 * Manages game countdown timers.
 * Uses Discord relative timestamps (<t:EPOCH:R>) for live countdown display —
 * the message is sent once and Discord renders the countdown client-side.
 * Only a single setTimeout fires when the countdown expires to start the game.
 */

import * as SessionService from './session.service.js';
import { buildCancelledMessage } from '../../utils/game-embeds.js';
import { cancelSessionEverywhere } from './cancellation.service.js';
import logger from '../../utils/logger.js';

// Track active countdowns (stores setTimeout IDs, not intervals)
const activeCountdowns = new Map();
const MAX_ACTIVE_COUNTDOWNS = 50;

// Periodic monitoring for potential leaks
const countdownMonitor = setInterval(() => {
  if (activeCountdowns.size > 20) {
    logger.warn(`[Countdown] High active countdown count: ${activeCountdowns.size}`);
  }
  if (activeCountdowns.size > MAX_ACTIVE_COUNTDOWNS) {
    logger.error(`[Countdown] Exceeded max countdowns (${activeCountdowns.size}), forcing cleanup`);
    for (const [id, timeoutId] of activeCountdowns) {
      clearTimeout(timeoutId);
    }
    activeCountdowns.clear();
  }
}, 60000);

if (typeof countdownMonitor.unref === 'function') {
  countdownMonitor.unref();
}

let gameRunnerPromise = null;
async function getGameRunnerService() {
  if (!gameRunnerPromise) {
    gameRunnerPromise = import('./game-runner.service.js');
    // Clear cache on failure so next call retries the import
    gameRunnerPromise.catch(() => { gameRunnerPromise = null; });
  }
  return gameRunnerPromise;
}

/**
 * Start countdown for a session.
 * No more interval-based message edits — Discord timestamps handle the visual countdown.
 * A single setTimeout fires when the countdown expires to start (or cancel) the game.
 */
export function startCountdown(client, sessionId, message) {
  // Clear existing countdown for this session
  stopCountdown(sessionId);

  // Calculate remaining time from session's stored deadline
  (async () => {
    try {
      const session = await SessionService.getSession(sessionId);
      if (!session || session.status !== 'WAITING') return;

      const remaining = SessionService.getRemainingCountdown(session);
      if (remaining <= 0) return;

      const delayMs = remaining * 1000;

      const timeout = setTimeout(async () => {
        activeCountdowns.delete(sessionId);

        try {
          const freshSession = await SessionService.getSession(sessionId);
          if (!freshSession || freshSession.status !== 'WAITING') return;

          // Try to start game
          const startResult = await SessionService.startGame(freshSession);

          if (startResult.error === 'NOT_ENOUGH_PLAYERS') {
            try {
              await message.edit({
                content: buildCancelledMessage('NOT_ENOUGH_PLAYERS', startResult.required),
                embeds: [],
                components: []
              });
            } catch (e) {
              logger.warn('[Countdown] Failed to edit cancellation message:', e?.message || e);
            }
            return;
          }

          if (startResult.session) {
            let started = false;
            try {
              const { startGameForSession } = await getGameRunnerService();
              started = await startGameForSession(startResult.session, message.channel);
            } catch (e) {
              logger.warn('[Countdown] Failed to start game runtime:', e?.message || e);
            }

            if (!started) {
              await cancelSessionEverywhere(startResult.session, 'NOT_IMPLEMENTED', { hardCleanup: true });
              try {
                await message.edit({
                  content: '🚫 | تم إلغاء اللعبة — هذا النمط غير متاح حالياً',
                  embeds: [],
                  components: []
                });
              } catch (e) {
                logger.warn('[Countdown] Failed to edit not-implemented message:', e?.message || e);
              }
              return;
            }

            try {
              await message.edit({
                content: `🎮 **بدأت اللعبة!** (${startResult.session.players.length} لاعبين)`,
                embeds: [],
                components: []
              });
            } catch (e) {
              logger.warn('[Countdown] Failed to edit started message:', e?.message || e);
            }
          }
        } catch (error) {
          logger.error('[Countdown] Countdown expire error:', error);
        }
      }, delayMs);

      if (typeof timeout.unref === 'function') {
        timeout.unref();
      }

      activeCountdowns.set(sessionId, timeout);

      // Failsafe: clear after countdown + buffer
      const failsafeMs = Math.max((remaining + 10) * 1000, 15000);
      const failsafe = setTimeout(() => {
        stopCountdown(sessionId);
      }, failsafeMs);
      if (typeof failsafe.unref === 'function') {
        failsafe.unref();
      }

    } catch (error) {
      logger.error('[Countdown] Countdown start error:', error);
    }
  })();
}

/**
 * Stop countdown for a session
 */
export function stopCountdown(sessionId) {
  if (activeCountdowns.has(sessionId)) {
    clearTimeout(activeCountdowns.get(sessionId));
    activeCountdowns.delete(sessionId);
  }
}

/**
 * Check if countdown is active
 */
export function isCountdownActive(sessionId) {
  return activeCountdowns.has(sessionId);
}

/**
 * Get all active countdown session IDs
 */
export function getActiveCountdownIds() {
  return Array.from(activeCountdowns.keys());
}
