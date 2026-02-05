/**
 * Roulette Button Builders
 * All Discord button components for the roulette game
 * Uses v1 button format for ButtonRouter integration
 *
 * BUGS FIXED:
 * - #23: Button overflow now handled with StringSelectMenu for many players
 */

import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  StringSelectMenuBuilder 
} from 'discord.js';
import { PERKS, GAME_SETTINGS } from './roulette.constants.js';
import { codec } from '../../framework/index.js';

// Maximum buttons per row
const MAX_BUTTONS_PER_ROW = 4;
// Maximum rows for player buttons (reserve 1 for actions)
const MAX_PLAYER_ROWS = 4;
// Threshold to switch to select menu
const SELECT_MENU_THRESHOLD = 12; // If more than 12 players, use select menu

/**
 * Create kick target buttons for selecting who to eliminate
 * FIX #23: Handles many players with select menu fallback
 * @param {Object} session - Game session
 * @param {Array} targetPlayers - Array of players that can be kicked
 * @param {boolean} canDoubleKick - Whether double kick is available
 * @param {number} doubleKickCost - Cost of double kick perk
 * @returns {ActionRowBuilder[]} - Array of action rows
 */
export function createKickButtons(session, targetPlayers, canDoubleKick = false, doubleKickCost = 150) {
  const rows = [];

  // FIX #23: Use select menu for many players to prevent button overflow
  if (targetPlayers.length > SELECT_MENU_THRESHOLD) {
    // Create select menu for player selection
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(codec.forSession(session, 'kick_select', ''))
      .setPlaceholder('🎯 اختر لاعباً لطرده...')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        targetPlayers.map(player => ({
          label: `${player.slot}. ${truncateName(player.displayName, 20)}`,
          value: player.userId,
          emoji: '🎯',
        }))
      );

    rows.push(new ActionRowBuilder().addComponents(selectMenu));
  } else {
    // Use buttons for smaller player counts
    // Calculate how many rows we can use (max 4 for players + 1 for actions)
    const maxPlayerButtons = MAX_PLAYER_ROWS * MAX_BUTTONS_PER_ROW;
    const playersToShow = targetPlayers.slice(0, maxPlayerButtons);

    for (let i = 0; i < playersToShow.length; i += MAX_BUTTONS_PER_ROW) {
      const row = new ActionRowBuilder();
      const chunk = playersToShow.slice(i, i + MAX_BUTTONS_PER_ROW);

      chunk.forEach(player => {
        // Truncate name if too long for button
        const displayName = truncateName(player.displayName, 12);

        row.addComponents(
          new ButtonBuilder()
            .setCustomId(codec.forSession(session, 'kick', player.userId))
            .setLabel(`${player.slot}. ${displayName}`)
            .setEmoji('🎯')
            .setStyle(ButtonStyle.Primary)
        );
      });

      rows.push(row);
    }
  }

  // Action buttons row
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(codec.forSession(session, 'selfkick', ''))
      .setLabel('🏳️ انسحب')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(codec.forSession(session, 'randomkick', ''))
      .setLabel('🎲 عشوائي')
      .setStyle(ButtonStyle.Secondary)
  );

  // Add double kick button if available
  if (canDoubleKick) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(codec.forSession(session, 'doublekick', ''))
        .setLabel(`🔥 طرد مرتين (${doubleKickCost})`)
        .setStyle(ButtonStyle.Success)
    );
  }

  rows.push(actionRow);

  // Safety: Limit to 5 rows (Discord max)
  return rows.slice(0, 5);
}

/**
 * Create double kick target buttons (after first target selected)
 * FIX #23: Also handles many players with select menu
 * @param {Object} session - Game session
 * @param {Array} remainingPlayers - Array of players that can still be kicked
 * @returns {ActionRowBuilder[]} - Array of action rows
 */
export function createDoubleKickButtons(session, remainingPlayers) {
  const rows = [];

  // FIX #23: Use select menu for many players
  if (remainingPlayers.length > SELECT_MENU_THRESHOLD) {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(codec.forSession(session, 'kick2_select', ''))
      .setPlaceholder('🔥 اختر اللاعب الثاني...')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        remainingPlayers.map(player => ({
          label: `${player.slot}. ${truncateName(player.displayName, 20)}`,
          value: player.userId,
          emoji: '🔥',
        }))
      );

    rows.push(new ActionRowBuilder().addComponents(selectMenu));
  } else {
    // Use buttons
    const maxPlayerButtons = MAX_PLAYER_ROWS * MAX_BUTTONS_PER_ROW;
    const playersToShow = remainingPlayers.slice(0, maxPlayerButtons);

    for (let i = 0; i < playersToShow.length; i += MAX_BUTTONS_PER_ROW) {
      const row = new ActionRowBuilder();
      const chunk = playersToShow.slice(i, i + MAX_BUTTONS_PER_ROW);

      chunk.forEach(player => {
        const displayName = truncateName(player.displayName, 12);

        row.addComponents(
          new ButtonBuilder()
            .setCustomId(codec.forSession(session, 'kick2', player.userId))
            .setLabel(`${player.slot}. ${displayName}`)
            .setEmoji('🔥')
            .setStyle(ButtonStyle.Danger)
        );
      });

      rows.push(row);
    }
  }

  // Skip second kick option
  const skipRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(codec.forSession(session, 'skip_double', ''))
      .setLabel('⏭️ تخطي الطرد الثاني')
      .setStyle(ButtonStyle.Secondary)
  );

  rows.push(skipRow);

  return rows.slice(0, 5);
}

/**
 * Create winner display button (decorative)
 * @param {number} newBalance - Winner's new balance
 * @param {number} reward - Amount won
 * @returns {ActionRowBuilder[]} - Array of action rows
 */
export function createWinnerButtons(newBalance, reward) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('roulette:winner:display')
        .setLabel(`💰 ${newBalance} [+${reward}]`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(true)
    )
  ];
}

/**
 * Create shop buttons for perk purchases
 * @param {Object} session - Game session
 * @param {string[]} ownedPerks - Array of perk IDs the player already owns
 * @returns {ActionRowBuilder[]} - Array of action rows
 */
export function createShopButtons(session, ownedPerks = []) {
  const row = new ActionRowBuilder();

  // Add perk purchase buttons
  Object.values(PERKS)
    .filter(p => p.phase === 'lobby')
    .forEach(perk => {
      const owned = ownedPerks.includes(perk.id);
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(codec.forSession(session, 'buy', perk.id))
          .setLabel(`${perk.emoji} ${perk.name} (${perk.cost})`)
          .setStyle(owned ? ButtonStyle.Secondary : ButtonStyle.Success)
          .setDisabled(owned)
      );
    });

  // Add close button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(codec.forSession(session, 'shop_close', ''))
      .setLabel('❌ إغلاق')
      .setStyle(ButtonStyle.Danger)
  );

  return [row];
}

/**
 * Create disabled/ended game buttons
 */
export function createDisabledButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('roulette:ended')
        .setLabel('🏁 انتهت اللعبة')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    )
  ];
}

/**
 * Create lobby buttons with shop access
 * FIX #24: Add shop button to lobby
 * @param {Object} session - Game session
 * @returns {ActionRowBuilder[]} - Array of action rows
 */
export function createLobbyButtons(session) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(codec.forSession(session, 'join', ''))
      .setLabel('🎰 انضم')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(codec.forSession(session, 'leave', ''))
      .setLabel('🚪 غادر')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(codec.forSession(session, 'shop', ''))
      .setLabel('🛒 المتجر')
      .setStyle(ButtonStyle.Primary)
  );

  return [row];
}

/**
 * Truncate a name to max length with ellipsis
 * @param {string} name - The name to truncate
 * @param {number} maxLen - Maximum length
 * @returns {string} - Truncated name
 */
function truncateName(name, maxLen = 12) {
  if (!name) return 'Unknown';
  if (name.length <= maxLen) return name;
  return name.substring(0, maxLen - 2) + '..';
}

export default {
  createKickButtons,
  createDoubleKickButtons,
  createWinnerButtons,
  createShopButtons,
  createDisabledButtons,
  createLobbyButtons,
};
