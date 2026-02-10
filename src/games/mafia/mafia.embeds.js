/**
 * Mafia Embed Builders
 * Minimal - most Mafia UI is content-based, not embed-based
 */

import { EmbedBuilder } from 'discord.js';
import { COLORS, ROLE_NAMES, ROLE_EMOJIS } from './mafia.constants.js';

/**
 * Build team distribution text (no image for v1)
 * Shows role counts per team without revealing who has which role
 * @param {Object} dist - { MAFIA, DOCTOR, DETECTIVE, CITIZEN }
 * @param {boolean} detectiveEnabled
 * @returns {string}
 */
export function buildTeamsText(dist, detectiveEnabled) {
  const lines = [
    '🧩 **تم تقسيم الأدوار على الفريقين**',
    '',
    `🟢 **الفريق الأول** (المدنيون)`,
    `  ${ROLE_EMOJIS.CITIZEN} ${ROLE_NAMES.CITIZEN} ×${dist.CITIZEN}`,
    `  ${ROLE_EMOJIS.DOCTOR} ${ROLE_NAMES.DOCTOR} ×${dist.DOCTOR}`,
  ];

  if (detectiveEnabled) {
    lines.push(`  ${ROLE_EMOJIS.DETECTIVE} ${ROLE_NAMES.DETECTIVE} ×${dist.DETECTIVE}`);
  }

  lines.push(
    '',
    `🔴 **الفريق الثاني** (المافيا)`,
    `  ${ROLE_EMOJIS.MAFIA} ${ROLE_NAMES.MAFIA} ×${dist.MAFIA}`,
    '',
    `🟢 الهدف: كشف المافيا قبل ما يقتلون`,
    `🔴 الهدف: اغتيال جميع اعضاء الشعب`,
  );

  return lines.join('\n');
}

/**
 * Build win announcement text
 * @param {number} winningTeam - 1 or 2
 * @param {string[]} winnerMentions - Array of winner mentions
 * @param {number} roundsPlayed
 * @returns {string}
 */
export function buildWinText(winningTeam, winnerMentions, roundsPlayed) {
  const title = winningTeam === 1
    ? '🏆 **فاز الفريق الاول**'
    : '🏆 **فاز الفريق الثاني**';

  return [
    title,
    `عدد الجولات: ${roundsPlayed}`,
    '',
    `${winnerMentions.join(' ')} - 👑 فازوا باللعبة!`,
  ].join('\n');
}
