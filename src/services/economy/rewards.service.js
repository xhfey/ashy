/**
 * Reward calculation service
 * Matches Fizbo's actual reward rates (3-30 coins per win)
 */

import logger from '../../utils/logger.js';

/**
 * Base rewards per game type (before multipliers)
 * These are calibrated to produce 3-30 coin rewards
 */
const BASE_REWARDS = {
  RPS: 8,
  DICE: 8,
  ROULETTE: 12,
  XO: 10,
  CHAIRS: 10,
  MAFIA: 15,
  HIDESEEK: 12,
  REPLICA: 10,
  GUESS_COUNTRY: 8,
  HOT_XO: 10,
  DEATH_WHEEL: 12
};

/**
 * Calculate reward for game win
 * Produces rewards in the 3-30 range like Fizbo
 *
 * @param {Object} gameData
 * @param {string} gameData.gameType - Game type (RPS, DICE, etc.)
 * @param {number} gameData.playerCount - Number of players in game
 * @param {number} gameData.roundsPlayed - Number of rounds (optional)
 * @param {number} gameData.survivalRounds - Rounds survived in elimination games (optional)
 * @returns {Object} - { base: number, bonus: number, total: number }
 */
export function calculateReward(gameData) {
  const { gameType, playerCount = 2, roundsPlayed = 1, survivalRounds = 0 } = gameData;

  // Get base reward for game type
  let base = BASE_REWARDS[gameType] || 8;

  // Player count bonus: +1 per additional player (capped)
  // 2 players = +0, 5 players = +3, 10 players = +8, 20 players = +10 (capped)
  const playerBonus = Math.min(Math.floor((playerCount - 2) * 0.8), 10);
  base += playerBonus;

  // Duration/rounds bonus for longer games
  // +1 per 2 rounds, capped at +5
  const roundBonus = Math.min(Math.floor(roundsPlayed / 2), 5);
  base += roundBonus;

  // Survival bonus for elimination games (roulette, chairs, etc.)
  // +1 per round survived, capped at +5
  const survivalBonus = Math.min(survivalRounds, 5);
  base += survivalBonus;

  // Random bonus (adds excitement, prevents farming patterns)
  // Range: 0 to 5
  const randomBonus = Math.floor(Math.random() * 6);

  // Calculate total
  const total = base + randomBonus;

  // Ensure within bounds (3-30)
  const finalTotal = Math.max(3, Math.min(30, total));

  logger.debug(`Reward calculated: ${gameType} - base:${base} + random:${randomBonus} = ${finalTotal}`);

  return {
    base: base,
    bonus: randomBonus,
    total: finalTotal
  };
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

/**
 * Weekly leaderboard rewards (top 3 per game)
 */
export const WEEKLY_REWARDS = {
  1: 1500,  // 1st place
  2: 700,   // 2nd place
  3: 300    // 3rd place
};

/**
 * Get weekly reward for placement
 * @param {number} placement - 1, 2, or 3
 * @returns {number} - Reward amount
 */
export function getWeeklyReward(placement) {
  return WEEKLY_REWARDS[placement] || 0;
}

export { BASE_REWARDS };
