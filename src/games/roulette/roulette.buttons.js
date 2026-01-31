/**
 * Roulette Button Builders
 * All Discord button components for the roulette game
 * Uses v1 button format for ButtonRouter integration
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { PERKS, GAME_SETTINGS } from './roulette.constants.js';
import { codec } from '../../framework/index.js';

/**
 * Create kick target buttons for selecting who to eliminate
 * @param {Object} session - Game session
 * @param {Array} targetPlayers - Array of players that can be kicked
 * @param {boolean} canDoubleKick - Whether double kick is available
 * @param {number} doubleKickCost - Cost of double kick perk
 * @returns {ActionRowBuilder[]} - Array of action rows
 */
export function createKickButtons(session, targetPlayers, canDoubleKick = false, doubleKickCost = 150) {
  const rows = [];

  // Create player target buttons (max 4 per row)
  for (let i = 0; i < targetPlayers.length; i += 4) {
    const row = new ActionRowBuilder();
    const chunk = targetPlayers.slice(i, i + 4);

    chunk.forEach(player => {
      // Truncate name if too long for button
      const displayName = player.displayName.length > 12
        ? player.displayName.substring(0, 11) + '..'
        : player.displayName;

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

  // Limit to 5 rows (Discord max)
  return rows.slice(0, 5);
}

/**
 * Create double kick target buttons (after first target selected)
 * @param {Object} session - Game session
 * @param {Array} remainingPlayers - Array of players that can still be kicked
 * @returns {ActionRowBuilder[]} - Array of action rows
 */
export function createDoubleKickButtons(session, remainingPlayers) {
  const rows = [];

  // Create player target buttons
  for (let i = 0; i < remainingPlayers.length; i += 4) {
    const row = new ActionRowBuilder();
    const chunk = remainingPlayers.slice(i, i + 4);

    chunk.forEach(player => {
      const displayName = player.displayName.length > 12
        ? player.displayName.substring(0, 11) + '..'
        : player.displayName;

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

export default {
  createKickButtons,
  createDoubleKickButtons,
  createWinnerButtons,
  createShopButtons,
  createDisabledButtons,
};
