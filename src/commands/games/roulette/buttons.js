/**
 * Roulette Button Builders
 * All Discord button components for the roulette game
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { PERKS, GAME_SETTINGS } from './constants.js';

/**
 * Create lobby slot buttons (numbers 1-20)
 * @param {string} sessionId - The game session ID
 * @param {Set} usedSlots - Set of already taken slot numbers
 * @returns {ActionRowBuilder[]} - Array of action rows with buttons
 */
export function createSlotButtons(sessionId, usedSlots = new Set(), round = 0) {
  const rows = [];
  // Create buttons in rows of 5
  for (let rowStart = 1; rowStart <= GAME_SETTINGS.maxSlots; rowStart += 5) {
    const row = new ActionRowBuilder();

    for (let i = rowStart; i < rowStart + 5 && i <= GAME_SETTINGS.maxSlots; i++) {
      const isUsed = usedSlots.has(i);
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`roulette:${sessionId}:slot:${i}:${round}`) // Added round
          .setLabel(`${i}`)
          .setStyle(isUsed ? ButtonStyle.Secondary : ButtonStyle.Primary) // Keep original style logic
          .setDisabled(isUsed)
      );
    }

    rows.push(row);
  }
  return rows;
}

/**
 * Create lobby action buttons (Random, Leave, Shop)
 * @param {string} sessionId - The game session ID
 * @returns {ActionRowBuilder} - Action row with buttons
 */
export function createLobbyActionButtons(sessionId, round = 0) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`roulette:${sessionId}:random:${round}`)
      .setLabel('🎲 عشوائي')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`roulette:${sessionId}:leave:${round}`)
      .setLabel('🚪 غادر')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`roulette:${sessionId}:shop:${round}`)
      .setLabel('🛒 متجر')
      .setStyle(ButtonStyle.Secondary)
  );
}

/**
 * Create all lobby buttons combined
 */
export function createLobbyButtons(sessionId, usedSlots = new Set(), round = 0) {
  const slotRows = createSlotButtons(sessionId, usedSlots, round);
  const actionRow = createLobbyActionButtons(sessionId, round);

  return [...slotRows, actionRow];
}

/**
 * Create shop buttons for perk purchases
 * @param {string} sessionId - The game session ID
 * @param {string[]} ownedPerks - Array of perk IDs the player already owns
 * @returns {ActionRowBuilder[]} - Array of action rows
 */
export function createShopButtons(sessionId, ownedPerks = [], round = 0) {
  const row = new ActionRowBuilder();

  // Add perk purchase buttons
  Object.values(PERKS)
    .filter(p => p.phase === 'lobby')
    .forEach(perk => {
      const owned = ownedPerks.includes(perk.id);
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`roulette:${sessionId}:buy:${perk.id}:${round}`)
          .setLabel(`${perk.emoji} ${perk.name} (${perk.cost})`)
          .setStyle(owned ? ButtonStyle.Secondary : ButtonStyle.Success)
          .setDisabled(owned)
      );
    });

  // Add close button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`roulette:${sessionId}:shop_close:${round}`)
      .setLabel('❌ إغلاق')
      .setStyle(ButtonStyle.Danger)
  );

  return [row];
}

/**
 * Create kick target buttons for selecting who to eliminate
 * @param {string} sessionId - The game session ID
 * @param {Array} targetPlayers - Array of players that can be kicked
 * @param {boolean} canDoubleKick - Whether double kick is available
 * @param {number} doubleKickCost - Cost of double kick perk
 * @returns {ActionRowBuilder[]} - Array of action rows
 */
export function createKickButtons(sessionId, targetPlayers, canDoubleKick = false, doubleKickCost = 150, round = 0) {
  const rows = [];

  // Create player target buttons (max 5 per row)
  const playerRows = [];
  for (let i = 0; i < targetPlayers.length; i += 5) {
    const row = new ActionRowBuilder();
    const chunk = targetPlayers.slice(i, i + 5);

    chunk.forEach(player => {
      // Truncate name if too long for button
      const displayName = player.displayName.length > 15
        ? player.displayName.substring(0, 14) + '..'
        : player.displayName;

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`roulette:${sessionId}:kick:${player.userId}:${round}`)
          .setLabel(`${player.slotNumber}. ${displayName}`)
          .setStyle(ButtonStyle.Primary)
      );
    });

    playerRows.push(row);
  }

  rows.push(...playerRows);

  // Action buttons row
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`roulette:${sessionId}:selfkick:${round}`)
      .setLabel('🏳️ انسحب')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`roulette:${sessionId}:randomkick:${round}`)
      .setLabel('🎲 عشوائي')
      .setStyle(ButtonStyle.Secondary)
  );

  // Add double kick button if available
  if (canDoubleKick) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`roulette:${sessionId}:doublekick:${round}`)
        .setLabel(`🔥 طرد مرتين (${doubleKickCost})`)
        .setStyle(ButtonStyle.Success)
    );
  }

  rows.push(actionRow);

  return rows;
}

/**
 * Create double kick target buttons (after first target selected)
 * @param {string} sessionId - The game session ID
 * @param {Array} remainingPlayers - Array of players that can still be kicked
 * @returns {ActionRowBuilder[]} - Array of action rows
 */
export function createDoubleKickButtons(sessionId, remainingPlayers, round = 0) {
  const rows = [];

  // Create player target buttons
  for (let i = 0; i < remainingPlayers.length; i += 5) {
    const row = new ActionRowBuilder();
    const chunk = remainingPlayers.slice(i, i + 5);

    chunk.forEach(player => {
      const displayName = player.displayName.length > 15
        ? player.displayName.substring(0, 14) + '..'
        : player.displayName;

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`roulette:${sessionId}:kick2:${player.userId}:${round}`)
          .setLabel(`${player.slotNumber}. ${displayName}`)
          .setStyle(ButtonStyle.Danger)
      );
    });

    rows.push(row);
  }

  // Skip second kick option
  const skipRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`roulette:${sessionId}:skip_double:${round}`)
      .setLabel('⏭️ تخطي الطرد الثاني')
      .setStyle(ButtonStyle.Secondary)
  );

  rows.push(skipRow);

  return rows;
}

/**
 * Create winner reward button
 * @param {string} sessionId - The game session ID
 * @param {number} newBalance - Winner's new balance
 * @param {number} reward - Amount won
 * @returns {ActionRowBuilder[]} - Array of action rows
 */
export function createWinnerButtons(sessionId, newBalance, reward) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`roulette:${sessionId}:claim`)
        .setLabel(`💰 ${newBalance} [+${reward}]`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(true) // Decorative button showing the reward
    )
  ];
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

export default {
  createSlotButtons,
  createLobbyActionButtons,
  createLobbyButtons,
  createShopButtons,
  createKickButtons,
  createDoubleKickButtons,
  createWinnerButtons,
  createDisabledButtons,
};
