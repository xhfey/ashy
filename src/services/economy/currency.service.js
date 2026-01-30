/**
 * Main currency service - public API for economy operations
 * This is the service that commands should use
 */

import * as TransactionService from './transaction.service.js';
import * as AntiAbuseService from './anti-abuse.service.js';
import { InsufficientBalanceError, UserNotEligibleError, InvalidAmountError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

/**
 * Get user's coin balance
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function getBalance(userId) {
  return TransactionService.getBalance(userId);
}

/**
 * Award coins for game win
 * @param {string} userId
 * @param {number} amount
 * @param {string} gameType
 * @param {object} gameData - Additional game info
 * @returns {Promise<{success: boolean, newBalance: number, reward: number}>}
 */
export async function awardGameWin(userId, amount, gameType, gameData = {}) {
  // Check eligibility
  const eligibility = await AntiAbuseService.checkEligibility(userId);
  if (!eligibility.eligible) {
    throw new UserNotEligibleError(eligibility.reason, eligibility.details);
  }

  const result = await TransactionService.addCoins(
    userId,
    amount,
    TransactionService.TransactionType.GAME_WIN,
    gameType,
    gameData
  );

  return {
    success: true,
    newBalance: result.newBalance,
    reward: amount
  };
}

/**
 * Spend coins (for perks, entry fees, etc.)
 * @param {string} userId
 * @param {number} amount
 * @param {string} type - What they're spending on
 * @param {string} source - Specific item/game
 * @param {object} metadata
 * @returns {Promise<{success: boolean, newBalance: number}>}
 */
export async function spendCoins(userId, amount, type, source, metadata = {}) {
  if (amount <= 0) {
    throw new InvalidAmountError(amount);
  }

  // Check eligibility (flagged users can't spend)
  const eligibility = await AntiAbuseService.checkEligibility(userId);
  if (!eligibility.eligible) {
    throw new UserNotEligibleError(eligibility.reason, eligibility.details);
  }

  const balance = await getBalance(userId);
  if (balance < amount) {
    throw new InsufficientBalanceError(amount, balance);
  }

  return TransactionService.removeCoins(userId, amount, type, source, metadata);
}

/**
 * Transfer coins between users
 * @param {string} senderId
 * @param {string} recipientId
 * @param {number} amount
 * @returns {Promise<{success: boolean, senderBalance: number, recipientBalance: number}>}
 */
export async function transfer(senderId, recipientId, amount) {
  // Validate amount
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new InvalidAmountError(amount);
  }

  // Check sender eligibility
  const eligibility = await AntiAbuseService.checkEligibility(senderId);
  if (!eligibility.eligible) {
    throw new UserNotEligibleError(eligibility.reason, eligibility.details);
  }

  // Check balance
  const balance = await getBalance(senderId);
  if (balance < amount) {
    throw new InsufficientBalanceError(amount, balance);
  }

  // Perform transfer
  return TransactionService.transferCoins(senderId, recipientId, amount);
}

/**
 * Add coins (admin/system use)
 * @param {string} userId
 * @param {number} amount
 * @param {string} reason
 * @returns {Promise<{success: boolean, newBalance: number}>}
 */
export async function adminAddCoins(userId, amount, reason) {
  return TransactionService.addCoins(
    userId,
    amount,
    TransactionService.TransactionType.ADMIN_ADD,
    'ADMIN',
    { reason }
  );
}

/**
 * Remove coins (admin/system use)
 * @param {string} userId
 * @param {number} amount
 * @param {string} reason
 * @returns {Promise<{success: boolean, newBalance: number}>}
 */
export async function adminRemoveCoins(userId, amount, reason) {
  return TransactionService.removeCoins(
    userId,
    amount,
    TransactionService.TransactionType.ADMIN_REMOVE,
    'ADMIN',
    { reason }
  );
}

/**
 * Check if user is eligible for transactions
 * @param {string} userId
 * @returns {Promise<{eligible: boolean, reason?: string, details?: object}>}
 */
export async function checkEligibility(userId) {
  return AntiAbuseService.checkEligibility(userId);
}

/**
 * Get user's transaction history
 * @param {string} userId
 * @param {number} limit
 * @returns {Promise<Transaction[]>}
 */
export async function getHistory(userId, limit = 10) {
  return TransactionService.getRecentTransactions(userId, limit);
}

// Re-export for convenience
export { TransactionService, AntiAbuseService };
