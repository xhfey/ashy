/**
 * /test-session - Test game session system v2
 */

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import * as SessionService from '../../services/games/session.service.js';
import { buildLobbyEmbed, buildLobbyComponents } from '../../utils/game-embeds.js';
import logger from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('test-session')
    .setDescription('اختبار نظام جلسات الألعاب')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option
        .setName('game')
        .setDescription('نوع اللعبة')
        .setRequired(true)
        .addChoices(
          { name: '🎲 نرد (SIMPLE)', value: 'DICE' },
          { name: '✊ حجر ورقة مقص (SIMPLE)', value: 'RPS' },
          { name: '🎡 روليت (SLOTS)', value: 'ROULETTE' },
          { name: '💺 كراسي (SLOTS)', value: 'CHAIRS' }
        )
    ),

  async execute(interaction) {
    const gameType = interaction.options.getString('game');

    try {
      const result = await SessionService.createSession({
        gameType,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        user: interaction.user,
        member: interaction.member
      });

      if (result.error) {
        const errorMessages = {
          'CHANNEL_HAS_GAME': '❌ يوجد لعبة في هذه القناة! استخدم /clear-session',
          'PLAYER_IN_GAME': '❌ أنت في لعبة أخرى!'
        };
        return interaction.reply({ content: errorMessages[result.error] || '❌ خطأ', ephemeral: true });
      }

      const session = result;

      const embed = buildLobbyEmbed(session);
      const components = buildLobbyComponents(session);

      const message = await interaction.reply({
        embeds: [embed],
        components,
        fetchReply: true
      });

      await SessionService.setMessageId(session.id, message.id);

      logger.info(`Session created: ${session.id} (${gameType})`);

    } catch (error) {
      logger.error('Test session error:', error);
      await interaction.reply({ content: '❌ خطأ: ' + error.message, ephemeral: true });
    }
  }
};
