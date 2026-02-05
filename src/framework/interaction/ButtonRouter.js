/**
 * ButtonRouter - Centralized button interaction handler
 *
 * Handles:
 * - Always defer first (prevents "interaction failed")
 * - Acquire lock (prevents race conditions)
 * - Re-fetch session after lock (gets fresh state)
 * - Stale click detection (via token/uiVersion)
 * - Route to game handler
 * - Release lock (fire-and-forget)
 */

import { codec } from './CustomIdCodec.js';
import * as RedisService from '../../services/redis.service.js';
import logger from '../../utils/logger.js';

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

      // 3. Acquire lock
      const lockKey = `game:lock:${sessionId}`;
      const gotLock = await RedisService.acquireLock(lockKey, 2);

      if (!gotLock) {
        logger.debug(`[ButtonRouter] Lock contention on ${sessionId}`);
        return true; // Someone else processing, handled
      }

      try {
        // 4. Re-fetch session AFTER acquiring lock
        const session = await this.sessions.load(sessionId);

        if (!session) {
          logger.debug(`[ButtonRouter] Session ${sessionId} expired`);
          // Optional: send ephemeral "game expired" message
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

        // 5. Stale click detection
        const currentPhase = session.phase || 'WAITING';
        const currentToken = session.uiVersion || 0;

        if (phase !== currentPhase || token !== currentToken) {
          logger.debug(
            `[ButtonRouter] Stale click: expected ${currentPhase}:${currentToken}, got ${phase}:${token}`
          );
          return true; // Silent ignore - old button
        }

        // 6. Touch TTL (keep session alive)
        await this.sessions.touch(sessionId);

        // 7. Route to game handler
        const gameHandler = this.games.get(session.gameType);
        if (!gameHandler) {
          logger.error(`[ButtonRouter] Game ${session.gameType} not registered`);
          return true;
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

          /**
           * Helper to save session and increment UI version
           * Call this after making changes to session state
           */
          commit: async () => {
            session.uiVersion = (session.uiVersion || 0) + 1;
            await this.sessions.save(session);
          }
        };

        // Call the handler
        await gameHandler.onAction(ctx);

      } finally {
        // 8. Always release lock (fire-and-forget)
        RedisService.releaseLock(lockKey);
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
    this.games.set(gameType, handler);
    logger.info(`[ButtonRouter] Registered handler for ${gameType}`);
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
