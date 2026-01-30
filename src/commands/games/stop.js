/**
 * /stop - Cancel current game (host only)
 */

import { SlashCommandBuilder } from 'discord.js';
import * as SessionService from '../../services/games/session.service.js';
import { cancelDiceGame, getActiveGameByChannel } from '../../games/dice/dice.game.js';
import logger from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('إلغاء اللعبة الحالية (المنشئ فقط)'),

  async execute(interaction) {
    const session = await SessionService.getSessionByChannel(interaction.channelId);

    if (!session) {
      const activeDiceGame = getActiveGameByChannel(interaction.channelId);
      if (!activeDiceGame) {
        return interaction.reply({ content: '❌ لا توجد لعبة في هذه القناة', ephemeral: true });
      }

      if (activeDiceGame.hostId && activeDiceGame.hostId !== interaction.user.id) {
        return interaction.reply({ content: '❌ فقط منشئ اللعبة يمكنه إلغاؤها', ephemeral: true });
      }

      cancelDiceGame(activeDiceGame.sessionId, 'STOP_COMMAND');
      await interaction.channel.send({ content: '🚫 | تم إلغاء اللعبة' });
      await interaction.reply({ content: '✅ تم إلغاء اللعبة', ephemeral: true });
      logger.info(`Dice game ${activeDiceGame.sessionId} stopped by host ${interaction.user.username}`);
      return;
    }

    // Only host can stop
    if (session.hostId !== interaction.user.id) {
      return interaction.reply({ content: '❌ فقط منشئ اللعبة يمكنه إلغاؤها', ephemeral: true });
    }

    // Cleanup
    if (session.gameType === 'DICE') {
      cancelDiceGame(session.id, 'STOP_COMMAND');
    }
    await SessionService.cleanupSession(session.id);

    // Try to edit the message
    if (session.messageId) {
      try {
        const channel = await interaction.client.channels.fetch(session.channelId);
        const message = await channel.messages.fetch(session.messageId);
        await message.edit({ content: '🚫 | تم إلغاء اللعبة', embeds: [], components: [] });
      } catch (e) {}
    }

    await interaction.reply({ content: '✅ تم إلغاء اللعبة', ephemeral: true });

    logger.info(`Game ${session.id} stopped by host ${interaction.user.username}`);
  }
};
