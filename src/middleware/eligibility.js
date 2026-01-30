/**
 * Middleware to check user eligibility before transactions
 */

import { checkEligibility } from '../services/economy/currency.service.js';
import { errorEmbed } from '../utils/embeds.js';
import logger from '../utils/logger.js';

/**
 * Check if user is eligible for currency transactions
 * Use this in commands that involve currency
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<boolean>} - true if eligible, false if not (and replies with error)
 */
export async function requireEligibility(interaction) {
  const result = await checkEligibility(interaction.user.id);

  if (!result.eligible) {
    const embed = errorEmbed(
      'غير مؤهل',
      result.details?.message || 'لا يمكنك إجراء هذه العملية حالياً.'
    );

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });

    logger.debug(`User ${interaction.user.id} not eligible: ${result.reason}`);
    return false;
  }

  return true;
}

/**
 * Check eligibility without replying (for internal use)
 * @param {string} userId
 * @returns {Promise<{eligible: boolean, reason?: string}>}
 */
export async function isEligible(userId) {
  return checkEligibility(userId);
}
