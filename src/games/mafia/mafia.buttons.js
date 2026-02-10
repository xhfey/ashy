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
import { GAMES } from '../../config/games.config.js';
import { ACTIONS, HINT_COST, NIGHT_PHASES } from './mafia.constants.js';

const MAX_BUTTONS_PER_ROW = 5;
const MAX_COMPONENT_ROWS = 5;
const DAY_ACTION_ROWS = 1;
const GAME_MAX_PLAYERS = GAMES.MAFIA?.maxPlayers ?? 15;
const MAX_DAY_VOTE_TARGETS = Math.min(
  GAME_MAX_PLAYERS,
  (MAX_COMPONENT_ROWS - DAY_ACTION_ROWS) * MAX_BUTTONS_PER_ROW
);

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

  if (rows.length > MAX_COMPONENT_ROWS) {
    throw new Error(`[Mafia] Too many night target rows (${rows.length}); Discord max is ${MAX_COMPONENT_ROWS}`);
  }

  return rows;
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
  if (alivePlayers.length > MAX_DAY_VOTE_TARGETS) {
    throw new Error(
      `[Mafia] Too many day vote targets (${alivePlayers.length}); max supported is ${MAX_DAY_VOTE_TARGETS}`
    );
  }

  const rows = [];

  // Player vote buttons
  for (let i = 0; i < alivePlayers.length; i += MAX_BUTTONS_PER_ROW) {
    const row = new ActionRowBuilder();
    const chunk = alivePlayers.slice(i, i + MAX_BUTTONS_PER_ROW);

    for (const player of chunk) {
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
      .setLabel(`تلميح (${HINT_COST})`)
      .setEmoji('🕵️')
      .setStyle(ButtonStyle.Success)
  );

  rows.push(actionRow);

  if (rows.length > MAX_COMPONENT_ROWS) {
    throw new Error(`[Mafia] Too many day vote rows (${rows.length}); Discord max is ${MAX_COMPONENT_ROWS}`);
  }

  return rows;
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
