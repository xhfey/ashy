/**
 * /stop - Cancel current game (host only)
 */

import { SlashCommandBuilder } from 'discord.js';
import * as SessionService from '../../services/games/session.service.js';
import logger from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('إلغاء اللعبة الحالية (المنشئ فقط)'),

  async execute(interaction) {
    const [{ cancelChannelEverywhere, cancelSessionEverywhere }, gameRunner] = await Promise.all([
      import('../../services/games/cancellation.service.js'),
      import('../../services/games/game-runner.service.js').catch((error) => {
        logger.warn('[Stop] Runtime inspector unavailable:', error?.message || error);
        return null;
      }),
    ]);
    const findRuntimeGameByChannel = gameRunner?.findRuntimeGameByChannel;

    const session = await SessionService.getSessionByChannel(interaction.channelId);

    if (!session) {
      const runtime = typeof findRuntimeGameByChannel === 'function'
        ? findRuntimeGameByChannel(interaction.channelId)
        : null;
      if (!runtime) {
        return interaction.reply({ content: '❌ لا توجد لعبة في هذه القناة', ephemeral: true });
      }

      if (runtime.hostId && runtime.hostId !== interaction.user.id) {
        return interaction.reply({ content: '❌ فقط منشئ اللعبة يمكنه إلغاؤها', ephemeral: true });
      }

      const result = await cancelChannelEverywhere(interaction.channelId, 'STOP_COMMAND', {
        hardCleanup: true
      });
      if (!result.cancelled) {
        return interaction.reply({ content: '❌ تعذر إلغاء اللعبة', ephemeral: true });
      }

      await interaction.channel.send({ content: '🚫 | تم إلغاء اللعبة' });
      await interaction.reply({ content: '✅ تم إلغاء اللعبة', ephemeral: true });
      logger.info(`Runtime game stopped by host ${interaction.user.username} in channel ${interaction.channelId}`);
      return;
    }

    // Only host can stop
    if (session.hostId !== interaction.user.id) {
      return interaction.reply({ content: '❌ فقط منشئ اللعبة يمكنه إلغاؤها', ephemeral: true });
    }

    await cancelSessionEverywhere(session, 'STOP_COMMAND', { hardCleanup: true });

    // Try to edit the message
    if (session.messageId) {
      try {
        const channel = await interaction.client.channels.fetch(session.channelId);
        const message = await channel.messages.fetch(session.messageId);
        await message.edit({ content: '🚫 | تم إلغاء اللعبة', embeds: [], components: [] });
      } catch (e) {
        logger.warn(`[Stop] Failed to edit game message for ${session.id}:`, e?.message || e);
      }
    }

    await interaction.reply({ content: '✅ تم إلغاء اللعبة', ephemeral: true });

    logger.info(`Game ${session.id} stopped by host ${interaction.user.username}`);
  }
};
