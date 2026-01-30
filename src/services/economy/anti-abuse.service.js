/**
 * Anti-abuse and fraud detection service
 */

import prisma from '../../db/prisma.js';
import logger from '../../utils/logger.js';
import { getTransactionsInPeriod } from './transaction.service.js';

/**
 * Eligibility check result
 * @typedef {Object} EligibilityResult
 * @property {boolean} eligible
 * @property {string} [reason]
 * @property {Object} [details]
 */

/**
 * Configuration for anti-abuse rules
 */
const RULES = {
  // Account age requirement (in days)
  MIN_ACCOUNT_AGE_DAYS: 3,

  // Maximum transfers in 24 hours
  MAX_TRANSFERS_24H: 20,

  // Maximum games with same opponent in 24 hours (win trading detection)
  MAX_SAME_OPPONENT_24H: 10,

  // Minimum balance allowed (prevent exploitation)
  MIN_BALANCE: 0
};

const DISCORD_EPOCH_MS = 1420070400000n;

function getDiscordAccountCreatedAt(userId) {
  try {
    const timestamp = Number((BigInt(userId) >> 22n) + DISCORD_EPOCH_MS);
    if (!Number.isFinite(timestamp)) return null;
    return new Date(timestamp);
  } catch {
    return null;
  }
}

/**
 * Check if user is eligible for currency transactions
 * @param {string} userId
 * @returns {Promise<EligibilityResult>}
 */
export async function checkEligibility(userId) {
  try {
    let user = await prisma.user.findUnique({
      where: { id: userId }
    });

    const discordCreatedAt = getDiscordAccountCreatedAt(userId);

    // New user - create account with Discord creation time if possible
    if (!user) {
      user = await prisma.user.create({
        data: { id: userId, createdAt: discordCreatedAt || new Date() }
      });
    }

    // Rule 1: Manual flag check
    if (!user.isEligible) {
      return {
        eligible: false,
        reason: 'MANUALLY_FLAGGED',
        details: {
          message: 'حسابك موقوف مؤقتاً. تواصل مع الإدارة.'
        }
      };
    }

    // Rule 2: Account age check
    const effectiveCreatedAt = discordCreatedAt && user.createdAt > discordCreatedAt
      ? discordCreatedAt
      : user.createdAt;
    const accountAgeMs = Date.now() - effectiveCreatedAt.getTime();
    const accountAgeDays = accountAgeMs / (24 * 60 * 60 * 1000);

    if (accountAgeDays < RULES.MIN_ACCOUNT_AGE_DAYS) {
      const remainingDays = Math.ceil(RULES.MIN_ACCOUNT_AGE_DAYS - accountAgeDays);
      return {
        eligible: false,
        reason: 'ACCOUNT_TOO_NEW',
        details: {
          message: `حسابك جديد. انتظر ${remainingDays} يوم قبل التحويل.`,
          remainingDays
        }
      };
    }

    // Rule 3: Transfer velocity check
    const recentTransactions = await getTransactionsInPeriod(userId, 24);
    const transferCount = recentTransactions.filter(t =>
      t.type === 'TRANSFER_SEND'
    ).length;

    if (transferCount >= RULES.MAX_TRANSFERS_24H) {
      logger.warn(`User ${userId} hit transfer limit: ${transferCount}`);
      return {
        eligible: false,
        reason: 'TRANSFER_LIMIT',
        details: {
          message: 'وصلت للحد الأقصى من التحويلات اليومية. حاول غداً.',
          transferCount,
          limit: RULES.MAX_TRANSFERS_24H
        }
      };
    }

    // Rule 4: Negative balance check
    if (user.ashyCoins < RULES.MIN_BALANCE) {
      return {
        eligible: false,
        reason: 'NEGATIVE_BALANCE',
        details: {
          message: 'رصيدك سالب. تواصل مع الإدارة.',
          balance: user.ashyCoins
        }
      };
    }

    // All checks passed
    return { eligible: true };

  } catch (error) {
    logger.error('Eligibility check failed:', error);
    // Fail closed for database errors (but log it)
    return {
      eligible: false,
      reason: 'خطأ في النظام',
      details: 'Database temporarily unavailable. Please try again.'
    };
  }
}

/**
 * Detect potential win trading between two users
 * @param {string} userId1
 * @param {string} userId2
 * @returns {Promise<{suspicious: boolean, reason?: string, matchCount?: number}>}
 */
export async function detectWinTrading(userId1, userId2) {
  try {
    // Get recent game transactions between these two users
    const recentGames = await prisma.transaction.findMany({
      where: {
        type: 'GAME_WIN',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        OR: [
          { userId: userId1, metadata: { path: ['opponentId'], equals: userId2 } },
          { userId: userId2, metadata: { path: ['opponentId'], equals: userId1 } }
        ]
      }
    });

    if (recentGames.length >= RULES.MAX_SAME_OPPONENT_24H) {
      logger.warn(`Potential win trading: ${userId1} <-> ${userId2}: ${recentGames.length} games`);
      return {
        suspicious: true,
        reason: 'TOO_MANY_GAMES_SAME_OPPONENT',
        matchCount: recentGames.length
      };
    }

    // Check win ratio between them (should be roughly 50/50 if fair)
    const user1Wins = recentGames.filter(t => t.userId === userId1).length;
    const user2Wins = recentGames.filter(t => t.userId === userId2).length;

    // If 5+ games and one player wins >80%, suspicious
    if (recentGames.length >= 5) {
      const winRatio = Math.max(user1Wins, user2Wins) / recentGames.length;
      if (winRatio > 0.8) {
        logger.warn(`Suspicious win ratio: ${userId1} vs ${userId2}: ${winRatio}`);
        return {
          suspicious: true,
          reason: 'UNBALANCED_WIN_RATIO',
          matchCount: recentGames.length
        };
      }
    }

    return { suspicious: false };

  } catch (error) {
    logger.error('Win trading detection failed:', error);
    return { suspicious: false };
  }
}

/**
 * Flag user as ineligible (admin action)
 * @param {string} userId
 * @param {string} reason
 */
export async function flagUser(userId, reason) {
  await prisma.user.update({
    where: { id: userId },
    data: { isEligible: false }
  });

  logger.warn(`User ${userId} flagged: ${reason}`);
}

/**
 * Unflag user (admin action)
 * @param {string} userId
 */
export async function unflagUser(userId) {
  await prisma.user.update({
    where: { id: userId },
    data: { isEligible: true }
  });

  logger.info(`User ${userId} unflagged`);
}

export { RULES };
