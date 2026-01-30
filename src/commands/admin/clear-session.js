/**
 * /clear-session - Force clear stuck game sessions
 */

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import * as SessionService from '../../services/games/session.service.js';
import logger from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('clear-session')
    .setDescription('مسح جلسة اللعبة المعلقة في هذه القناة')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      const cleared = await SessionService.forceClearChannel(interaction.channelId);

      if (cleared) {
        await interaction.reply({
          content: '✅ تم مسح اللعبة المعلقة من هذه القناة',
          ephemeral: true
        });
        logger.info(`Session cleared by admin in ${interaction.channelId}`);
      } else {
        await interaction.reply({
          content: 'ℹ️ لا توجد لعبة معلقة في هذه القناة',
          ephemeral: true
        });
      }
    } catch (error) {
      logger.error('Clear session error:', error);
      await interaction.reply({
        content: '❌ خطأ: ' + error.message,
        ephemeral: true
      });
    }
  }
};
