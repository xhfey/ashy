/**
 * Countdown Service
 *
 * Manages game countdown timers
 * Extracted from play.js to allow proper imports
 */

import * as SessionService from './session.service.js';
import { buildLobbyEmbed, buildLobbyComponents, buildCancelledMessage } from '../../utils/game-embeds.js';
import { startGameForSession } from './game-runner.service.js';
import logger from '../../utils/logger.js';

// Track active countdowns
const activeCountdowns = new Map();
const MAX_ACTIVE_COUNTDOWNS = 50;

// Periodic monitoring for potential leaks
setInterval(() => {
  if (activeCountdowns.size > 20) {
    logger.warn(`[Countdown] High active countdown count: ${activeCountdowns.size}`);
  }
  // Force cleanup if way too many (shouldn't happen with 60s failsafe)
  if (activeCountdowns.size > MAX_ACTIVE_COUNTDOWNS) {
    logger.error(`[Countdown] Exceeded max countdowns (${activeCountdowns.size}), forcing cleanup`);
    for (const [id, interval] of activeCountdowns) {
      clearInterval(interval);
    }
    activeCountdowns.clear();
  }
}, 60000);

/**
 * Start countdown for a session
 */
export function startCountdown(client, sessionId, message) {
  // Clear existing countdown for this session
  if (activeCountdowns.has(sessionId)) {
    clearInterval(activeCountdowns.get(sessionId));
    activeCountdowns.delete(sessionId);
  }

  const interval = setInterval(async () => {
    try {
      // Fetch fresh session
      const session = await SessionService.getSession(sessionId);

      // Session gone or no longer waiting
      if (!session || session.status !== 'WAITING') {
        stopCountdown(sessionId);
        return;
      }

      // Calculate remaining from stored timestamp (not local counter!)
      const remaining = SessionService.getRemainingCountdown(session);

      if (remaining <= 0) {
        // Time's up!
        stopCountdown(sessionId);

        // Try to start game
        const startResult = await SessionService.startGame(session);

        if (startResult.error === 'NOT_ENOUGH_PLAYERS') {
          try {
            await message.edit({
              content: buildCancelledMessage('NOT_ENOUGH_PLAYERS', startResult.required),
              embeds: [],
              components: []
            });
          } catch (e) {}
          return;
        }

        if (startResult.session) {
          try {
            const started = await startGameForSession(startResult.session, message.channel);
            await message.edit({
              content: started
                ? `🎮 **بدأت اللعبة!** (${startResult.session.players.length} لاعبين)`
                : `🎮 **بدأت اللعبة!** (${startResult.session.players.length} لاعبين)\n\n_منطق اللعبة قيد التطوير_`,
              embeds: [],
              components: []
            });
          } catch (e) {}
        }
        return;
      }

      // Update countdown display
      try {
        await message.edit({
          embeds: [buildLobbyEmbed(session, remaining)],
          components: buildLobbyComponents(session)
        });
      } catch (e) {
        // Message deleted - cleanup
        stopCountdown(sessionId);
        await SessionService.cleanupSession(sessionId);
      }

    } catch (error) {
      logger.error('Countdown error:', error);
      stopCountdown(sessionId);
    }
  }, 3000);

  activeCountdowns.set(sessionId, interval);

  // Failsafe: clear after countdown ends (+ small buffer)
  // Prevents leaks while avoiding early stop if countdown is near 60s.
  (async () => {
    try {
      const session = await SessionService.getSession(sessionId);
      const remaining = session ? SessionService.getRemainingCountdown(session) : 60;
      const failsafeMs = Math.max((remaining + 5) * 1000, 15000);
      setTimeout(() => {
        stopCountdown(sessionId);
      }, failsafeMs);
    } catch (error) {
      logger.error('Countdown failsafe error:', error);
      setTimeout(() => stopCountdown(sessionId), 60000);
    }
  })();
}

/**
 * Stop countdown for a session
 */
export function stopCountdown(sessionId) {
  if (activeCountdowns.has(sessionId)) {
    clearInterval(activeCountdowns.get(sessionId));
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
