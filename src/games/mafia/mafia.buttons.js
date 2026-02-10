/**
 * Mafia Button Builders
 * All Discord button components for the Mafia game
 * Uses v1 button format for ButtonRouter integration
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { codec } from '../../framework/index.js';
import { ACTIONS, NIGHT_PHASES } from './mafia.constants.js';

const MAX_BUTTONS_PER_ROW = 5;

// ==================== CONTROL PANEL ====================

/**
 * Build the persistent control panel buttons (role reveal + night actions)
 * @param {Object} session - Game session
 * @param {string} phase - Current game phase
 * @returns {ActionRowBuilder[]}
 */
export function buildControlPanelButtons(session, phase) {
  const isNight = NIGHT_PHASES.has(phase);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(codec.forSession(session, ACTIONS.ROLE))
      .setLabel('🎭 رتبتك (خاص)')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(codec.forSession(session, ACTIONS.NIGHT_OPEN))
      .setLabel('🌙 إجراءات الليل')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!isNight)
  );

  return [row];
}

/**
 * Build disabled control panel (game ended)
 * @returns {ActionRowBuilder[]}
 */
export function buildDisabledControlPanel() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mafia:ended')
        .setLabel('🏁 انتهت اللعبة')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    ),
  ];
}

// ==================== NIGHT TARGET BUTTONS ====================

/**
 * Build target buttons for night actions (ephemeral)
 * @param {Object} session - Game session
 * @param {Array} targets - Array of { userId, displayName }
 * @param {string} selectedId - Currently selected target userId (or null)
 * @param {string} actionType - ACTIONS.MAFIA_VOTE | DOCTOR_PROTECT | DETECTIVE_CHECK
 * @returns {ActionRowBuilder[]}
 */
export function buildNightTargetButtons(session, targets, selectedId, actionType) {
  const rows = [];
  let slotNum = 0;

  for (let i = 0; i < targets.length; i += MAX_BUTTONS_PER_ROW) {
    const row = new ActionRowBuilder();
    const chunk = targets.slice(i, i + MAX_BUTTONS_PER_ROW);

    for (const target of chunk) {
      slotNum++;
      const isSelected = target.userId === selectedId;

      let style;
      if (isSelected) {
        if (actionType === ACTIONS.MAFIA_VOTE) style = ButtonStyle.Danger;
        else if (actionType === ACTIONS.DOCTOR_PROTECT) style = ButtonStyle.Success;
        else style = ButtonStyle.Primary;
      } else {
        style = ButtonStyle.Secondary;
      }

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(codec.forSession(session, actionType, target.userId))
          .setLabel(`${slotNum}. ${truncateName(target.displayName)}`)
          .setStyle(style)
      );
    }

    rows.push(row);
  }

  // Discord max 5 rows; night actions have no extra action row
  return rows.slice(0, 5);
}

// ==================== DAY VOTE BUTTONS ====================

/**
 * Build public day vote buttons
 * @param {Object} session - Game session
 * @param {Array} alivePlayers - Array of { userId, displayName }
 * @param {Map} voteCounts - Map<targetUserId|'SKIP', count>
 * @returns {ActionRowBuilder[]}
 */
export function buildDayVoteButtons(session, alivePlayers, voteCounts) {
  const rows = [];
  let slotNum = 0;

  // Player vote buttons (up to 3 rows of 5 = 15 players max)
  for (let i = 0; i < alivePlayers.length; i += MAX_BUTTONS_PER_ROW) {
    const row = new ActionRowBuilder();
    const chunk = alivePlayers.slice(i, i + MAX_BUTTONS_PER_ROW);

    for (const player of chunk) {
      slotNum++;
      const count = voteCounts.get(player.userId) || 0;

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(codec.forSession(session, ACTIONS.VOTE, player.userId))
          .setLabel(`${count} | ${truncateName(player.displayName)}`)
          .setStyle(ButtonStyle.Primary)
      );
    }

    rows.push(row);
  }

  // Action row: skip + hint
  const skipCount = voteCounts.get('SKIP') || 0;
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(codec.forSession(session, ACTIONS.VOTE_SKIP))
      .setLabel(`${skipCount} | تخطي`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(codec.forSession(session, ACTIONS.HINT))
      .setLabel('تلميح (100)')
      .setEmoji('🕵️')
      .setStyle(ButtonStyle.Success)
  );

  rows.push(actionRow);

  // Discord max 5 rows
  return rows.slice(0, 5);
}

// ==================== HELPERS ====================

/**
 * Truncate name for button labels
 * @param {string} name
 * @param {number} maxLen
 * @returns {string}
 */
function truncateName(name, maxLen = 12) {
  if (!name) return 'Unknown';
  if (name.length <= maxLen) return name;
  return name.substring(0, maxLen - 2) + '..';
}
