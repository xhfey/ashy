/**
 * ButtonRouter - Centralized button interaction handler
 *
 * Handles:
 * - Always defer first (prevents "interaction failed")
 * - Per-game concurrency strategy:
 *   - queue (for high-frequency games like Mafia voting)
 *   - short lock + drop (default, preserves legacy behavior)
 * - Re-fetch session when processing starts (gets fresh state)
 * - Stale click detection (via token/uiVersion)
 * - Route to game handler
 */

import { codec } from './CustomIdCodec.js';
import logger from '../../utils/logger.js';

const sessionQueues = new Map(); // sessionId -> Promise
const sessionLocks = new Map(); // sessionId -> expiresAt
const LOCK_TTL_MS = 2000;

function enqueueSessionTask(sessionId, task) {
  const previous = sessionQueues.get(sessionId) || Promise.resolve();
  const current = previous
    .catch(() => {})
    .then(task);

  sessionQueues.set(sessionId, current);
  current.finally(() => {
    if (sessionQueues.get(sessionId) === current) {
      sessionQueues.delete(sessionId);
    }
  });

  return current;
}

function tryAcquireSessionLock(sessionId, ttlMs = LOCK_TTL_MS) {
  const now = Date.now();
  const expiresAt = sessionLocks.get(sessionId);
  if (Number.isFinite(expiresAt) && expiresAt > now) {
    return false;
  }
  sessionLocks.set(sessionId, now + ttlMs);
  return true;
}

function releaseSessionLock(sessionId) {
  sessionLocks.delete(sessionId);
}

class ButtonRouter {
  constructor(sessionManager) {
    this.sessions = sessionManager;
    this.games = new Map(); // gameType -> handler
  }

  /**
   * Handle a button interaction
   * @param {import('discord.js').ButtonInteraction} interaction
   */
  async handleInteraction(interaction) {
    const customId = interaction.customId;

    // Only handle v1 format buttons
    if (!codec.isV1Format(customId)) {
      return false; // Not our button, let legacy handlers deal with it
    }

    try {
      // 1. Always defer FIRST (before any async work)
      await interaction.deferUpdate();

      // 2. Decode and validate format
      let parsed;
      try {
        parsed = codec.decode(customId);
      } catch (err) {
        logger.debug(`[ButtonRouter] Invalid customId: ${customId}`);
        return true; // Handled (silently failed)
      }

      const { sessionId, action, details, phase, token } = parsed;

      const initialSession = await this.sessions.load(sessionId);
      if (!initialSession) {
        logger.debug(`[ButtonRouter] Session ${sessionId} expired`);
        try {
          await interaction.followUp({
            content: '⏰ انتهت هذه اللعبة. ابدأ لعبة جديدة بـ `/play`',
            ephemeral: true
          });
        } catch (e) {
          // Ignore if followUp fails
        }
        return true;
      }

      const initialHandler = this.games.get(initialSession.gameType);
      if (!initialHandler) {
        logger.error(`[ButtonRouter] Game ${initialSession.gameType} not registered`);
        return true;
      }

      const useQueue = initialHandler.concurrency === 'queue';

      const processInteraction = async () => {
        // Re-fetch session when processing starts (fresh state)
        const session = await this.sessions.load(sessionId);

        if (!session) {
          logger.debug(`[ButtonRouter] Session ${sessionId} expired`);
          try {
            await interaction.followUp({
              content: '⏰ انتهت هذه اللعبة. ابدأ لعبة جديدة بـ `/play`',
              ephemeral: true
            });
          } catch (e) {
            // Ignore if followUp fails
          }
          return;
        }

        // Stale click detection
        const currentPhase = session.phase || 'WAITING';
        const currentToken = session.uiVersion || 0;

        if (phase !== currentPhase || token !== currentToken) {
          logger.debug(
            `[ButtonRouter] Stale click: expected ${currentPhase}:${currentToken}, got ${phase}:${token}`
          );
          return; // Silent ignore - old button
        }

        // Touch session for API compatibility
        await this.sessions.touch(sessionId);

        // Route to game handler
        const gameHandler = this.games.get(session.gameType);
        if (!gameHandler) {
          logger.error(`[ButtonRouter] Game ${session.gameType} not registered`);
          return;
        }

        // Build context for game
        const ctx = {
          session,
          player: interaction.user,
          member: interaction.member,
          action,
          details,
          values: interaction.values ?? null,
          interaction,
          channel: interaction.channel,

          // Helper to save session and increment UI version.
          commit: async () => {
            session.uiVersion = (session.uiVersion || 0) + 1;
            await this.sessions.save(session);
          }
        };

        // Call the handler
        await gameHandler.onAction(ctx);
      };

      if (useQueue) {
        await enqueueSessionTask(sessionId, processInteraction);
        return true;
      }

      // Default behavior for existing games: short lock, drop contending clicks.
      if (!tryAcquireSessionLock(sessionId)) {
        logger.debug(`[ButtonRouter] Lock busy for ${sessionId}, dropping interaction`);
        return true;
      }

      try {
        await processInteraction();
      } finally {
        releaseSessionLock(sessionId);
      }

      return true; // Handled

    } catch (err) {
      logger.error('[ButtonRouter] Error handling interaction:', err);
      return true; // Don't throw - interaction already deferred
    }
  }

  /**
   * Register a game handler
   * @param {string} gameType - Game type (DICE, ROULETTE, etc.)
   * @param {Object} handler - Handler with onAction method
   */
  register(gameType, handler) {
    if (!handler.onAction) {
      throw new Error(`Handler for ${gameType} must have onAction method`);
    }

    const concurrency = handler.concurrency === 'queue' ? 'queue' : 'drop';
    this.games.set(gameType, {
      ...handler,
      concurrency,
    });
    logger.info(`[ButtonRouter] Registered handler for ${gameType} (concurrency=${concurrency})`);
  }

  /**
   * Check if a game type is registered
   * @param {string} gameType
   * @returns {boolean}
   */
  hasHandler(gameType) {
    return this.games.has(gameType);
  }
}

export default ButtonRouter;
