/**
 * Ready event - with session recovery
 */

import * as SessionService from '../services/games/session.service.js';
import * as RedisService from '../services/redis.service.js';
import * as CountdownService from '../services/games/countdown.service.js';
import { cancelSessionEverywhere } from '../services/games/cancellation.service.js';
import { startWeeklyResetJob } from '../services/economy/weekly-reset.service.js';
import { buildCancelledMessage } from '../utils/game-embeds.js';
import logger from '../utils/logger.js';

export default {
  name: 'ready',
  once: true,

  async execute(client) {
    logger.info(`✅ Bot online: ${client.user.tag}`);

    let gameRunner = null;
    try {
      gameRunner = await import('../services/games/game-runner.service.js');
      // Register game handlers with ButtonRouter
      gameRunner.registerGameHandlers();
    } catch (error) {
      logger.error('[Ready] Game runtime unavailable; game features will be limited:', error?.message || error);
    }

    // Test Redis and log latency
    const latency = await RedisService.testConnection();
    if (latency > 100) {
      logger.warn(`⚠️ High Redis latency (${latency}ms) - consider closer region`);
    }

    // Startup jobs
    if (gameRunner?.prewarmGameAssets) {
      await gameRunner.prewarmGameAssets().catch((error) => {
        logger.warn('[Ready] Asset prewarm failed:', error?.message || error);
      });
    }
    startWeeklyResetJob();

    // Recover/cancel stale sessions
    await recoverSessions(client, gameRunner);
  }
};

async function recoverSessions(client, gameRunner) {
  try {
    const waitingSessions = await SessionService.getAllWaitingSessions();
    const activeSessions = await SessionService.getAllActiveSessions();

    if (waitingSessions.length === 0 && activeSessions.length === 0) {
      logger.info('No sessions to recover');
      return;
    }

    logger.info(`Recovering ${waitingSessions.length} waiting sessions...`);

    for (const session of waitingSessions) {
      try {
        const channel = await client.channels.fetch(session.channelId).catch(() => null);
        if (!channel || !session.messageId) {
          await cancelSessionEverywhere(session, 'RECOVERY_CANCELLED', { hardCleanup: true });
          continue;
        }

        const message = await channel.messages.fetch(session.messageId).catch(() => null);
        if (!message) {
          await cancelSessionEverywhere(session, 'RECOVERY_CANCELLED', { hardCleanup: true });
          continue;
        }

        // Check if countdown expired
        if (SessionService.isCountdownExpired(session)) {
          // Try to start or cancel
          const startResult = await SessionService.startGame(session);

          if (startResult.error === 'NOT_ENOUGH_PLAYERS') {
            try {
              await message.edit({
                content: buildCancelledMessage('NOT_ENOUGH_PLAYERS', startResult.required || 2),
                embeds: [],
                components: []
              });
            } catch (error) {
              logger.warn(`[Ready] Failed to update cancellation message for session ${session.id}:`, error.message);
            }
            await cancelSessionEverywhere(session, 'NOT_ENOUGH_PLAYERS', { hardCleanup: true });
            continue;
          }

          if (!startResult.session) {
            await cancelSessionEverywhere(session, 'RECOVERY_CANCELLED', { hardCleanup: true });
            continue;
          }

          if (!gameRunner?.startGameForSession) {
            await cancelSessionEverywhere(startResult.session, 'NOT_IMPLEMENTED', { hardCleanup: true });
            await message.edit({
              content: '🚫 | تم إلغاء اللعبة — محرك الألعاب غير متاح حالياً',
              embeds: [],
              components: []
            }).catch(() => {});
            continue;
          }

          const started = await gameRunner.startGameForSession(startResult.session, channel).catch(() => false);
          if (!started) {
            await cancelSessionEverywhere(startResult.session, 'NOT_IMPLEMENTED', { hardCleanup: true });
            await message.edit({
              content: '🚫 | تم إلغاء اللعبة — هذا النمط غير متاح حالياً',
              embeds: [],
              components: []
            }).catch(() => {});
            continue;
          }

          await message.edit({
            content: `🎮 **بدأت اللعبة!** (${startResult.session.players.length} لاعبين)`,
            embeds: [],
            components: []
          }).catch(() => {});

          continue;
        }

        // Countdown still active - resume it
        CountdownService.startCountdown(client, session.id, message);

        const remaining = SessionService.getRemainingCountdown(session);
        logger.info(`Recovered session ${session.id} (${remaining}s left)`);

      } catch (error) {
        logger.error(`Failed to recover ${session.id}:`, error);
        await cancelSessionEverywhere(session, 'RECOVERY_CANCELLED', { hardCleanup: true });
      }
    }

    if (activeSessions.length > 0) {
      logger.warn(`Found ${activeSessions.length} stale ACTIVE sessions after restart - cancelling`);
    }

    for (const session of activeSessions) {
      try {
        await cancelSessionEverywhere(session, 'RECOVERY_CANCELLED', { hardCleanup: true });

        const channel = await client.channels.fetch(session.channelId).catch(() => null);
        if (channel) {
          await channel.send({
            content: '🚫 | تم إلغاء اللعبة السابقة بسبب إعادة تشغيل البوت'
          }).catch(() => {});
        }
      } catch (error) {
        logger.error(`Failed to cancel stale ACTIVE session ${session.id}:`, error);
      }
    }

    logger.info('Session recovery complete');

  } catch (error) {
    logger.error('Session recovery failed:', error);
  }
}
