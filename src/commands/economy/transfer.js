/**
 * /تحويل - Transfer Ashy Coins to another user
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import * as CurrencyService from '../../services/economy/currency.service.js';
import { requireEligibility } from '../../middleware/eligibility.js';
import { formatNumber } from '../../utils/helpers.js';
import config from '../../config/bot.config.js';
import logger from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('تحويل')
    .setDescription('حوّل عملات آشي إلى مستخدم آخر')
    .addUserOption(option =>
      option
        .setName('المستلم')
        .setDescription('المستخدم الذي تريد التحويل إليه')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('المبلغ')
        .setDescription('عدد العملات المراد تحويلها')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1000000)
    ),

  async execute(interaction) {
    try {
      const recipient = interaction.options.getUser('المستلم');
      const amount = interaction.options.getInteger('المبلغ');

      // Validation: Can't transfer to self
      if (recipient.id === interaction.user.id) {
        return await interaction.reply({
          content: '❌ لا يمكنك التحويل لنفسك!',
          ephemeral: true
        });
      }

      // Validation: Can't transfer to bots
      if (recipient.bot) {
        return await interaction.reply({
          content: '❌ لا يمكنك التحويل للبوتات!',
          ephemeral: true
        });
      }

      // Check eligibility (account age, transfer limits, etc.)
      const eligible = await requireEligibility(interaction);
      if (!eligible) return;

      // Check balance first
      const senderBalance = await CurrencyService.getBalance(interaction.user.id);
      if (senderBalance < amount) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('❌ رصيد غير كافٍ')
          .setDescription(
            `تحتاج **${formatNumber(amount)}** عملة\n` +
            `رصيدك الحالي: **${formatNumber(senderBalance)}** عملة`
          );

        return await interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Defer reply
      await interaction.deferReply();

      // Perform transfer
      const result = await CurrencyService.transfer(
        interaction.user.id,
        recipient.id,
        amount
      );

      // Success embed
      const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ تم التحويل بنجاح!')
        .setDescription(
          `تم تحويل **${formatNumber(amount)}** عملة آشي إلى ${recipient.toString()}`
        )
        .addFields(
          {
            name: '💳 رصيدك الجديد',
            value: `${formatNumber(result.senderBalance)} عملة`,
            inline: true
          },
          {
            name: `💰 رصيد ${recipient.displayName || recipient.username}`,
            value: `${formatNumber(result.recipientBalance)} عملة`,
            inline: true
          }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Try to DM the recipient
      try {
        // FIX MEDIUM: Fetch fresh balance for DM to avoid stale data
        const freshRecipientBalance = await CurrencyService.getBalance(recipient.id);

        const dmEmbed = new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle('📥 استلمت تحويلاً!')
          .setDescription(
            `استلمت **${formatNumber(amount)}** عملة آشي من ${interaction.user.toString()}\n\n` +
            `💰 رصيدك الحالي: **${formatNumber(freshRecipientBalance)}** عملة`
          )
          .setTimestamp();

        await recipient.send({ embeds: [dmEmbed] });
      } catch (dmError) {
        // DMs disabled, ignore
      }

    } catch (error) {
      logger.error('Transfer command error:', error);

      const errorMessage = error.message?.includes('Insufficient')
        ? '❌ رصيدك غير كافٍ!'
        : '❌ حدث خطأ في التحويل! حاول مرة أخرى.';

      if (interaction.deferred) {
        await interaction.editReply({ content: errorMessage });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }
};
