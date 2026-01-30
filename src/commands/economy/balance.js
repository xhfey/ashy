/**
 * /رصيد - Check your Ashy Coins balance
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import * as CurrencyService from '../../services/economy/currency.service.js';
import { formatNumber } from '../../utils/helpers.js';
import config from '../../config/bot.config.js';
import logger from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('رصيد')
    .setDescription('تحقق من رصيدك من عملات آشي')
    .addUserOption(option =>
      option
        .setName('مستخدم')
        .setDescription('المستخدم الذي تريد معرفة رصيده')
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      const targetUser = interaction.options.getUser('مستخدم') || interaction.user;
      const isOwnBalance = targetUser.id === interaction.user.id;

      // Get balance
      const balance = await CurrencyService.getBalance(targetUser.id);

      // Build embed
      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setAuthor({
          name: targetUser.displayName || targetUser.username,
          iconURL: targetUser.displayAvatarURL({ dynamic: true })
        })
        .setDescription(
          `${config.emojis.coin} **الرصيد:** ${formatNumber(balance)} عملة آشي`
        )
        .setTimestamp();

      // Add thumbnail for own balance
      if (isOwnBalance) {
        embed.setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 128 }));
      }

      await interaction.reply({
        embeds: [embed],
        ephemeral: !isOwnBalance // Show others' balance privately
      });

    } catch (error) {
      logger.error('Balance command error:', error);
      await interaction.reply({
        content: '❌ حدث خطأ! حاول مرة أخرى.',
        ephemeral: true
      });
    }
  }
};
