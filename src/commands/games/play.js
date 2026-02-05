/**
 * /play - Start a game
 * Countdown logic moved to countdown.service.js
 */

import { SlashCommandBuilder } from 'discord.js';
import * as SessionService from '../../services/games/session.service.js';
import { buildLobbyEmbed, buildLobbyComponents } from '../../utils/game-embeds.js';
import logger from '../../utils/logger.js';
import { getPublicPlayChoices, isPublicGameAvailableInGuild } from '../../games/public-games.js';

const PLAY_CHOICES = getPublicPlayChoices();

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('ابدأ لعبة جديدة')
    .addStringOption(option =>
      option
        .setName('game')
        .setDescription('اختر اللعبة')
        .setRequired(true)
        .addChoices(...PLAY_CHOICES)
    ),

  async execute(interaction) {
    const gameType = interaction.options.getString('game');
    const availability = isPublicGameAvailableInGuild(gameType, interaction.guildId);
    if (!availability.ok) {
      return interaction.reply({
        content: '❌ هذه اللعبة غير متاحة حالياً في هذا السيرفر',
        ephemeral: true
      });
    }

    const result = await SessionService.createSession({
      gameType,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      user: interaction.user,
      member: interaction.member
    });

    if (result.error) {
      if (result.error === 'CHANNEL_HAS_GAME') {
        return interaction.reply({ content: '❌ يوجد لعبة في هذه القناة!', ephemeral: true });
      }
      return interaction.reply({ content: '❌ خطأ في إنشاء اللعبة', ephemeral: true });
    }

    const session = result;
    const remaining = SessionService.getRemainingCountdown(session);

    const message = await interaction.reply({
      embeds: [buildLobbyEmbed(session, remaining)],
      components: buildLobbyComponents(session),
      fetchReply: true
    });

    await SessionService.setMessageId(session.id, message.id);

    // Start countdown (in separate service)
    const CountdownService = await import('../../services/games/countdown.service.js');
    CountdownService.startCountdown(interaction.client, session.id, message);

    logger.info(`Game lobby created: ${session.id} (${gameType})`);
  }
};
