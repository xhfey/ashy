/**
 * /اكس-او - Tic-Tac-Toe tournament
 * TODO: Implement in Phase 7
 */

import { SlashCommandBuilder } from 'discord.js';
import logger from '../../../utils/logger.js';
import strings from '../../../localization/ar.json' assert { type: 'json' };
import { GAMES } from '../../../config/games.config.js';

const game = GAMES.XO;

export default {
  data: new SlashCommandBuilder()
    .setName(game.command)
    .setDescription(game.description),

  async execute(interaction) {
    try {
      // TODO: Implement in Phase 7

      await interaction.reply({
        content: strings.common.not_implemented,
        ephemeral: true
      });
    } catch (error) {
      logger.error('XO command error:', error);

      const reply = { content: strings.common.error, ephemeral: true };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  }
};
