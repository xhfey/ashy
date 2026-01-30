/**
 * Roulette Perks Logic
 * Handles perk purchases and usage during the game
 */

import * as CurrencyService from '../../../services/economy/currency.service.js';
import { TransactionType } from '../../../services/economy/transaction.service.js';
import logger from '../../../utils/logger.js';
import { PERKS } from './constants.js';

/**
 * Purchase a perk for a player
 * @param {string} userId - Discord user ID
 * @param {string} perkId - ID of the perk to purchase
 * @param {string} sessionId - Game session ID
 * @returns {Promise<{success: boolean, perk: object, newBalance: number, error?: string}>}
 */
export async function purchasePerk(userId, perkId, sessionId) {
  const perk = PERKS[perkId];

  if (!perk) {
    return { success: false, error: 'INVALID_PERK' };
  }

  try {
    // Check balance and deduct coins
    const result = await CurrencyService.spendCoins(
      userId,
      perk.cost,
      TransactionType.PERK_PURCHASE,
      'ROULETTE',
      {
        perkId,
        perkName: perk.name,
        sessionId,
      }
    );

    logger.info(`Perk purchased: ${userId} bought ${perkId} for ${perk.cost} coins`);

    return {
      success: true,
      perk,
      newBalance: result.newBalance,
    };
  } catch (error) {
    if (error.name === 'InsufficientBalanceError') {
      return { success: false, error: 'INSUFFICIENT_BALANCE' };
    }
    logger.error('Perk purchase error:', error);
    throw error;
  }
}

/**
 * Check if player has a specific perk
 * @param {Map} players - Players map from game state
 * @param {string} userId - Player's Discord ID
 * @param {string} perkId - Perk ID to check
 * @returns {boolean}
 */
export function hasActivePerk(players, userId, perkId) {
  const player = players.get(userId);
  if (!player) return false;
  return Array.isArray(player.perks) && player.perks.includes(perkId);
}

/**
 * Use a perk (mark it as consumed)
 * @param {Map} players - Players map from game state
 * @param {string} userId - Player's Discord ID
 * @param {string} perkId - Perk ID to use
 * @returns {boolean} - Whether perk was available and consumed
 */
export function usePerk(players, userId, perkId) {
  const player = players.get(userId);
  if (!player || !Array.isArray(player.perks) || !player.perks.includes(perkId)) {
    return false;
  }

  player.perks = player.perks.filter(p => p !== perkId);
  logger.debug(`Perk used: ${userId} consumed ${perkId}`);
  return true;
}

/**
 * Add perk to player's inventory
 * @param {Map} players - Players map from game state
 * @param {string} userId - Player's Discord ID
 * @param {string} perkId - Perk ID to add
 * @returns {boolean} - Whether perk was added successfully
 */
export function addPerk(players, userId, perkId) {
  const player = players.get(userId);
  if (!player) return false;

  if (!Array.isArray(player.perks)) {
    player.perks = [];
  }

  if (!player.perks.includes(perkId)) {
    player.perks.push(perkId);
  }
  return true;
}

/**
 * Get list of perks owned by a player
 * @param {Map} players - Players map from game state
 * @param {string} userId - Player's Discord ID
 * @returns {string[]} - Array of perk IDs
 */
export function getOwnedPerks(players, userId) {
  const player = players.get(userId);
  if (!player || !Array.isArray(player.perks)) return [];

  return player.perks;
}

/**
 * Process kick attempt - handles shield and extra life logic
 * @param {Map} players - Players map from game state
 * @param {string} kickerId - ID of player doing the kick
 * @param {string} targetId - ID of player being kicked
 * @returns {{
 *   eliminated: string | null,  // ID of player who actually gets eliminated
 *   reason: 'kicked' | 'shield_reflect' | 'extra_life_saved' | null,
 *   extraLifeUsed: boolean,
 *   shieldUsed: boolean,
 * }}
 */
export function processKick(players, kickerId, targetId) {
  const result = {
    eliminated: null,
    reason: null,
    extraLifeUsed: false,
    shieldUsed: false,
  };

  // Check if target has shield
  if (hasActivePerk(players, targetId, 'SHIELD')) {
    usePerk(players, targetId, 'SHIELD');
    result.shieldUsed = true;

    // Shield reflects the kick back to the attacker
    // But attacker might have extra life!
    if (hasActivePerk(players, kickerId, 'EXTRA_LIFE')) {
      usePerk(players, kickerId, 'EXTRA_LIFE');
      result.extraLifeUsed = true;
      // Kicker survives with extra life, no one eliminated
      result.reason = 'extra_life_saved';
    } else {
      // Kicker gets eliminated by reflected kick
      result.eliminated = kickerId;
      result.reason = 'shield_reflect';
    }

    return result;
  }

  // No shield - check if target has extra life
  if (hasActivePerk(players, targetId, 'EXTRA_LIFE')) {
    usePerk(players, targetId, 'EXTRA_LIFE');
    result.extraLifeUsed = true;
    result.reason = 'extra_life_saved';
    // Target survives, no one eliminated
    return result;
  }

  // No perks - target is eliminated
  result.eliminated = targetId;
  result.reason = 'kicked';
  return result;
}

/**
 * Check if double kick perk can be purchased during kick phase
 * @param {string} userId - Discord user ID
 * @returns {Promise<{canBuy: boolean, balance: number}>}
 */
export async function canBuyDoubleKick(userId) {
  try {
    const balance = await CurrencyService.getBalance(userId);
    const canBuy = balance >= PERKS.DOUBLE_KICK.cost;
    return { canBuy, balance };
  } catch (error) {
    logger.error('Error checking double kick eligibility:', error);
    return { canBuy: false, balance: 0 };
  }
}

/**
 * Purchase double kick perk during kick phase
 * @param {string} userId - Discord user ID
 * @param {string} sessionId - Game session ID
 * @returns {Promise<{success: boolean, newBalance: number, error?: string}>}
 */
export async function purchaseDoubleKick(userId, sessionId) {
  return purchasePerk(userId, 'DOUBLE_KICK', sessionId);
}

export default {
  purchasePerk,
  hasActivePerk,
  usePerk,
  addPerk,
  getOwnedPerks,
  processKick,
  canBuyDoubleKick,
  purchaseDoubleKick,
};
