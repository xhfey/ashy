/**
 * Reward calculation service
 * Global reward rules for multiplayer games
 */

import { randomInt } from 'crypto';
import logger from '../../utils/logger.js';
import * as CurrencyService from './currency.service.js';
import { sessionManager } from '../../framework/index.js';

const BASE_REWARD_DEFAULT = 4;
const BASE_REWARD_4P = 13;
const MAX_REWARD = 50;

function getBaseReward(playerCount) {
  return playerCount >= 4 ? BASE_REWARD_4P : BASE_REWARD_DEFAULT;
}

function clampReward(value, base) {
  const rounded = Math.round(value);
  return Math.max(base, Math.min(MAX_REWARD, rounded));
}

function randomFloat() {
  return randomInt(1_000_000) / 1_000_000;
}

/**
 * Calculate reward for game win
 *
 * Rules:
 * - Base reward is 4 coins, or 13 coins when playerCount >= 4
 * - Max reward is 50 coins
 * - More players => higher chance to roll bigger rewards
 *
 * @param {Object} gameData
 * @param {number} gameData.playerCount - Number of players in game
 * @returns {Object} - { base: number, bonus: number, total: number }
 */
export function calculateReward(gameData = {}) {
  const { playerCount = 2 } = gameData;
  const safeCount = Math.max(1, Number(playerCount) || 0);
  const base = getBaseReward(safeCount);
  const max = MAX_REWARD;

  const bias = Math.min(Math.max((safeCount - 2) / 8, 0), 1);
  const exponent = 1 + bias * 2;
  const u = randomFloat();
  const scaled = 1 - Math.pow(u, exponent);
  const reward = base + Math.floor(scaled * (max - base + 1));
  const finalReward = clampReward(reward, base);

  logger.debug(`Reward calculated: count:${safeCount} base:${base} total:${finalReward}`);

  return {
    base,
    bonus: finalReward - base,
    total: finalReward
  };
}

/**
 * Award rewards to winners (no split, each winner gets full reward)
 *
 * @param {Object} payload
 * @param {string} payload.gameType
 * @param {string|null} payload.sessionId
 * @param {string[]} payload.winnerIds
 * @param {number} payload.playerCount
 * @param {number} payload.roundsPlayed
 * @param {number|null} payload.rewardOverride
 * @returns {Promise<{reward: number, results: Array, alreadyPaid?: boolean}>}
 */
export async function awardGameWinners(payload = {}) {
  const {
    gameType,
    sessionId = null,
    winnerIds = [],
    playerCount = 2,
    roundsPlayed = 1,
    rewardOverride = null
  } = payload;

  const ids = Array.isArray(winnerIds) ? winnerIds.filter(Boolean) : [];
  if (ids.length === 0) {
    return { reward: 0, results: [] };
  }

  const safeCount = Math.max(1, Number(playerCount) || 0);
  const base = getBaseReward(safeCount);
  const safeGameType = gameType || 'UNKNOWN';

  let session = null;
  let ledger = null;
  if (sessionId) {
    session = await sessionManager.load(sessionId);
    ledger = session?.gameState?.rewardLedger || null;
  }

  let reward = Number.isFinite(ledger?.reward) ? ledger.reward : null;
  if (!Number.isFinite(reward)) {
    const overrideReward = Number.isFinite(rewardOverride) ? rewardOverride : null;
    const computedReward = overrideReward ?? calculateReward({ playerCount: safeCount }).total;
    reward = clampReward(computedReward, base);
  }

  const paidSet = new Set(Array.isArray(ledger?.paidIds) ? ledger.paidIds : []);
  const failedSet = new Set(Array.isArray(ledger?.failedIds) ? ledger.failedIds : []);
  const pendingIds = ids.filter(id => !paidSet.has(id));

  if (session?.payoutDone) {
    // Verify ledger exists and is valid
    if (!ledger || !Array.isArray(ledger?.paidIds)) {
      logger.error(`[Rewards] Corrupted ledger for completed payout: ${sessionId}`);
      return { reward: 0, results: [], error: 'CORRUPTED_LEDGER', alreadyPaid: true };
    }
    if (pendingIds.length === 0) {
      return { reward: ledger.reward, results: [], alreadyPaid: true };
    }
    // If payoutDone but pendingIds exist, this indicates a retry after partial failure
    logger.info(`[Rewards] Retrying payout for ${pendingIds.length} failed players: ${sessionId}`);
  }

  if (session && !session.payoutDone) {
    session.gameState = session.gameState || {};
    session.gameState.rewardLedger = {
      reward,
      paidIds: Array.from(paidSet),
      failedIds: pendingIds
    };
    // Keep payout open until all winners are paid successfully.
    session.payoutDone = false;
    try {
      await sessionManager.save(session);
    } catch (error) {
      logger.error('[Rewards] Failed to persist payout lock:', error);
    }
  }

  if (pendingIds.length === 0) {
    return { reward, results: [], alreadyPaid: true };
  }

  const results = [];
  for (const userId of pendingIds) {
    try {
      const result = await CurrencyService.awardGameWin(
        userId,
        reward,
        safeGameType,
        { sessionId, playerCount: safeCount, roundsPlayed, reward }
      );
      results.push({
        userId,
        reward,
        newBalance: result?.newBalance ?? null,
        success: true
      });
      paidSet.add(userId);
      failedSet.delete(userId);
    } catch (error) {
      logger.error(`[Rewards] Failed to award ${userId} in ${safeGameType}:`, error);
      results.push({
        userId,
        reward,
        newBalance: null,
        success: false
      });
      failedSet.add(userId);
    }
  }

  if (session) {
    session.gameState = session.gameState || {};
    session.gameState.rewardLedger = {
      reward,
      paidIds: Array.from(paidSet),
      failedIds: Array.from(failedSet)
    };
    session.payoutDone = failedSet.size === 0;
    await sessionManager.save(session);
  }

  return { reward, results, partial: failedSet.size > 0 };
}

/**
 * Calculate tournament prize
 * Winner takes the prize pool
 *
 * @param {number} entryFee - Fee per player
 * @param {number} playerCount - Number of players
 * @param {number} housePercent - House cut (default 10%)
 * @returns {number} - Prize amount
 */
export function calculateTournamentPrize(entryFee, playerCount, housePercent = 10) {
  const totalPool = entryFee * playerCount;
  const houseCut = Math.floor(totalPool * (housePercent / 100));
  return totalPool - houseCut;
}
