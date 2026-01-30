/**
 * Atomic database transaction service
 * ALL currency operations must go through this service
 */

import prisma from '../../db/prisma.js';
import logger from '../../utils/logger.js';

/**
 * Transaction types enum
 */
export const TransactionType = {
  GAME_WIN: 'GAME_WIN',
  GAME_LOSS: 'GAME_LOSS',
  TRANSFER_SEND: 'TRANSFER_SEND',
  TRANSFER_RECEIVE: 'TRANSFER_RECEIVE',
  WEEKLY_REWARD: 'WEEKLY_REWARD',
  PERK_PURCHASE: 'PERK_PURCHASE',
  TOURNAMENT_ENTRY: 'TOURNAMENT_ENTRY',
  TOURNAMENT_WIN: 'TOURNAMENT_WIN',
  ADMIN_ADD: 'ADMIN_ADD',
  ADMIN_REMOVE: 'ADMIN_REMOVE'
};

/**
 * Get or create user
 * @param {string} userId - Discord user ID
 * @returns {Promise<User>}
 */
export async function getOrCreateUser(userId) {
  try {
    let user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      user = await prisma.user.create({
        data: { id: userId }
      });
      logger.info(`Created new user: ${userId}`);
    }

    return user;
  } catch (error) {
    logger.error('Failed to get/create user:', error);
    throw error;
  }
}

/**
 * Get user balance
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function getBalance(userId) {
  const user = await getOrCreateUser(userId);
  return user.ashyCoins;
}

/**
 * Add coins to user (atomic)
 * @param {string} userId
 * @param {number} amount - Must be positive
 * @param {string} type - Transaction type
 * @param {string} source - Source description
 * @param {object} metadata - Additional data
 * @returns {Promise<{success: boolean, newBalance: number}>}
 */
export async function addCoins(userId, amount, type, source, metadata = null) {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Update user balance
      const user = await tx.user.upsert({
        where: { id: userId },
        update: {
          ashyCoins: { increment: amount },
          lastActive: new Date()
        },
        create: {
          id: userId,
          ashyCoins: amount
        }
      });

      // Create transaction record
      await tx.transaction.create({
        data: {
          userId,
          amount,
          type,
          source,
          metadata
        }
      });

      return user;
    });

    logger.debug(`Added ${amount} coins to ${userId}. New balance: ${result.ashyCoins}`);

    return {
      success: true,
      newBalance: result.ashyCoins
    };
  } catch (error) {
    logger.error('Failed to add coins:', error);
    throw error;
  }
}

/**
 * Remove coins from user (atomic)
 * @param {string} userId
 * @param {number} amount - Must be positive
 * @param {string} type - Transaction type
 * @param {string} source - Source description
 * @param {object} metadata - Additional data
 * @returns {Promise<{success: boolean, newBalance: number}>}
 */
export async function removeCoins(userId, amount, type, source, metadata = null) {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Get current balance
      const user = await tx.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error('User not found');
      }

      if (user.ashyCoins < amount) {
        throw new Error(`Insufficient balance: need ${amount}, have ${user.ashyCoins}`);
      }

      // Update balance
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          ashyCoins: { decrement: amount },
          lastActive: new Date()
        }
      });

      // Create transaction record (negative amount)
      await tx.transaction.create({
        data: {
          userId,
          amount: -amount,
          type,
          source,
          metadata
        }
      });

      return updated;
    });

    logger.debug(`Removed ${amount} coins from ${userId}. New balance: ${result.ashyCoins}`);

    return {
      success: true,
      newBalance: result.ashyCoins
    };
  } catch (error) {
    logger.error('Failed to remove coins:', error);
    throw error;
  }
}

/**
 * Transfer coins between users (atomic)
 * @param {string} senderId
 * @param {string} recipientId
 * @param {number} amount
 * @returns {Promise<{success: boolean, senderBalance: number, recipientBalance: number}>}
 */
export async function transferCoins(senderId, recipientId, amount) {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }

  if (senderId === recipientId) {
    throw new Error('Cannot transfer to yourself');
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Get sender
      const sender = await tx.user.findUnique({
        where: { id: senderId }
      });

      if (!sender) {
        throw new Error('Sender not found');
      }

      if (sender.ashyCoins < amount) {
        throw new Error(`Insufficient balance: need ${amount}, have ${sender.ashyCoins}`);
      }

      // Ensure recipient exists
      await tx.user.upsert({
        where: { id: recipientId },
        update: {},
        create: { id: recipientId }
      });

      // Deduct from sender
      const updatedSender = await tx.user.update({
        where: { id: senderId },
        data: {
          ashyCoins: { decrement: amount },
          lastActive: new Date()
        }
      });

      // Add to recipient
      const updatedRecipient = await tx.user.update({
        where: { id: recipientId },
        data: {
          ashyCoins: { increment: amount },
          lastActive: new Date()
        }
      });

      // Create transaction records
      await tx.transaction.createMany({
        data: [
          {
            userId: senderId,
            amount: -amount,
            type: TransactionType.TRANSFER_SEND,
            source: 'TRANSFER',
            recipientId,
            metadata: { recipientId }
          },
          {
            userId: recipientId,
            amount: amount,
            type: TransactionType.TRANSFER_RECEIVE,
            source: 'TRANSFER',
            recipientId: senderId,
            metadata: { senderId }
          }
        ]
      });

      return {
        sender: updatedSender,
        recipient: updatedRecipient
      };
    });

    logger.info(`Transfer: ${senderId} -> ${recipientId}: ${amount} coins`);

    return {
      success: true,
      senderBalance: result.sender.ashyCoins,
      recipientBalance: result.recipient.ashyCoins
    };
  } catch (error) {
    logger.error('Transfer failed:', error);
    throw error;
  }
}

/**
 * Get user's recent transactions
 * @param {string} userId
 * @param {number} limit
 * @returns {Promise<Transaction[]>}
 */
export async function getRecentTransactions(userId, limit = 10) {
  return prisma.transaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit
  });
}

/**
 * Get transactions in last X hours
 * @param {string} userId
 * @param {number} hours
 * @returns {Promise<Transaction[]>}
 */
export async function getTransactionsInPeriod(userId, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  return prisma.transaction.findMany({
    where: {
      userId,
      createdAt: { gte: since }
    },
    orderBy: { createdAt: 'desc' }
  });
}

export { prisma };
