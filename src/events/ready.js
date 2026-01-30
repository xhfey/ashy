/**
 * Ready event - with session recovery
 */

import * as SessionService from '../services/games/session.service.js';
import * as RedisService from '../services/redis.service.js';
import * as CountdownService from '../services/games/countdown.service.js';
import { startGameForSession, registerGameHandlers } from '../services/games/game-runner.service.js';
import { buildCancelledMessage } from '../utils/game-embeds.js';
import logger from '../utils/logger.js';

export default {
  name: 'ready',
  once: true,

  async execute(client) {
    logger.info(`✅ Bot online: ${client.user.tag}`);

    // Register game handlers with ButtonRouter
    registerGameHandlers();

    // Test Redis and log latency
    const latency = await RedisService.testConnection();
    if (latency > 100) {
      logger.warn(`⚠️ High Redis latency (${latency}ms) - consider closer region`);
    }

    // Recover waiting sessions
    await recoverSessions(client);
  }
};

async function recoverSessions(client) {
  try {
    const waitingSessions = await SessionService.getAllWaitingSessions();

    if (waitingSessions.length === 0) {
      logger.info('No sessions to recover');
      return;
    }

    logger.info(`Recovering ${waitingSessions.length} sessions...`);

    for (const session of waitingSessions) {
      try {
        // Check if countdown expired
        if (SessionService.isCountdownExpired(session)) {
          // Try to start or cancel
          const startResult = await SessionService.startGame(session);

          // Update message if possible
          if (startResult.session) {
            try {
              const channel = await client.channels.fetch(session.channelId);
              const started = await startGameForSession(startResult.session, channel);

              if (session.messageId) {
                const message = await channel.messages.fetch(session.messageId);
                await message.edit({
                  content: started
                    ? `🎮 **بدأت اللعبة!** (${startResult.session.players.length} لاعبين)`
                    : `🎮 **بدأت اللعبة!** (${startResult.session.players.length} لاعبين)\n\n_منطق اللعبة قيد التطوير_`,
                  embeds: [],
                  components: []
                });
              }
            } catch (e) {}
          } else if (session.messageId) {
            try {
              const channel = await client.channels.fetch(session.channelId);
              const message = await channel.messages.fetch(session.messageId);
              await message.edit({
                content: buildCancelledMessage('NOT_ENOUGH_PLAYERS', startResult.required || 2),
                embeds: [],
                components: []
              });
            } catch (e) {}
          }

          if (startResult.error) {
            await SessionService.cleanupSession(session.id);
          }

          continue;
        }

        // Countdown still active - resume it
        if (session.messageId) {
          try {
            const channel = await client.channels.fetch(session.channelId);
            const message = await channel.messages.fetch(session.messageId);

            CountdownService.startCountdown(client, session.id, message);

            const remaining = SessionService.getRemainingCountdown(session);
            logger.info(`Recovered session ${session.id} (${remaining}s left)`);

          } catch (e) {
            // Message/channel not found
            await SessionService.cleanupSession(session.id);
          }
        } else {
          // No message ID - can't recover
          await SessionService.cleanupSession(session.id);
        }

      } catch (error) {
        logger.error(`Failed to recover ${session.id}:`, error);
        await SessionService.cleanupSession(session.id);
      }
    }

    logger.info('Session recovery complete');

  } catch (error) {
    logger.error('Session recovery failed:', error);
  }
}
