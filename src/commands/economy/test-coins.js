/**
 * ⚠️ TEMPORARY TEST COMMAND - Remove before production!
 *
 * This command lets you test the currency system.
 * Command: /test-coins
 */

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import * as CurrencyService from '../../services/economy/currency.service.js';
import { successEmbed, errorEmbed, infoEmbed } from '../../utils/embeds.js';
import { formatCoins } from '../../utils/helpers.js';
import logger from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('test-coins')
    .setDescription('🧪 Test currency system (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('balance')
        .setDescription('Check balance')
        .addUserOption(opt =>
          opt.setName('user').setDescription('User to check')
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Add coins to user')
        .addUserOption(opt =>
          opt.setName('user').setDescription('User').setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove coins from user')
        .addUserOption(opt =>
          opt.setName('user').setDescription('User').setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('transfer')
        .setDescription('Test transfer')
        .addUserOption(opt =>
          opt.setName('to').setDescription('Recipient').setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('eligibility')
        .setDescription('Check eligibility')
        .addUserOption(opt =>
          opt.setName('user').setDescription('User to check')
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'balance': {
          const user = interaction.options.getUser('user') || interaction.user;
          const balance = await CurrencyService.getBalance(user.id);

          await interaction.reply({
            embeds: [infoEmbed(
              'الرصيد',
              `${user.toString()}: ${formatCoins(balance)}`
            )],
            ephemeral: true
          });
          break;
        }

        case 'add': {
          const user = interaction.options.getUser('user');
          const amount = interaction.options.getInteger('amount');

          const result = await CurrencyService.adminAddCoins(user.id, amount, 'Test command');

          await interaction.reply({
            embeds: [successEmbed(
              'تمت الإضافة',
              `تم إضافة ${formatCoins(amount)} إلى ${user.toString()}\nالرصيد الجديد: ${formatCoins(result.newBalance)}`
            )],
            ephemeral: true
          });
          break;
        }

        case 'remove': {
          const user = interaction.options.getUser('user');
          const amount = interaction.options.getInteger('amount');

          const result = await CurrencyService.adminRemoveCoins(user.id, amount, 'Test command');

          await interaction.reply({
            embeds: [successEmbed(
              'تم الخصم',
              `تم خصم ${formatCoins(amount)} من ${user.toString()}\nالرصيد الجديد: ${formatCoins(result.newBalance)}`
            )],
            ephemeral: true
          });
          break;
        }

        case 'transfer': {
          const recipient = interaction.options.getUser('to');
          const amount = interaction.options.getInteger('amount');

          const result = await CurrencyService.transfer(
            interaction.user.id,
            recipient.id,
            amount
          );

          await interaction.reply({
            embeds: [successEmbed(
              'تم التحويل',
              `تم تحويل ${formatCoins(amount)} إلى ${recipient.toString()}\n\nرصيدك: ${formatCoins(result.senderBalance)}\nرصيد المستلم: ${formatCoins(result.recipientBalance)}`
            )],
            ephemeral: true
          });
          break;
        }

        case 'eligibility': {
          const user = interaction.options.getUser('user') || interaction.user;
          const result = await CurrencyService.checkEligibility(user.id);

          if (result.eligible) {
            await interaction.reply({
              embeds: [successEmbed('مؤهل ✅', `${user.toString()} مؤهل للمعاملات`)],
              ephemeral: true
            });
          } else {
            await interaction.reply({
              embeds: [errorEmbed(
                'غير مؤهل ❌',
                `${user.toString()}\n\nالسبب: ${result.reason}\n${result.details?.message || ''}`
              )],
              ephemeral: true
            });
          }
          break;
        }
      }
    } catch (error) {
      logger.error('Test command error:', error);

      await interaction.reply({
        embeds: [errorEmbed('خطأ', error.message)],
        ephemeral: true
      });
    }
  }
};
