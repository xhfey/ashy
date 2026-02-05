/**
 * Dice Game Mechanics
 * Handles all roll logic and probabilities
 */

import { randomInt } from 'crypto';

import {
  SECOND_ROLL_OUTCOMES,
  SECOND_ROLL_NORMAL_CHANCE,
  SECOND_ROLL_SPECIAL_OUTCOMES,
  BETTER_LUCK_WEIGHTS,
} from './dice.constants.js';

/**
 * Roll a die (1-6) with optional Better Luck perk
 * @param {boolean} hasBetterLuck - Whether player has the perk
 * @returns {number} 1-6
 */
export function rollDie(hasBetterLuck = false) {
  if (hasBetterLuck) {
    // Better Luck perk: biased toward higher numbers
    return weightedRandom(BETTER_LUCK_WEIGHTS);
  }
  // Fair dice: true 1/6 chance for each face (like real dice)
  return randomInt(6) + 1;
}

/**
 * Perform second roll - returns outcome type and value
 * @param {number} firstRoll - The first roll value
 * @param {boolean} hasBetterLuck - Whether player has the perk
 * @returns {{ type: string, value: number|null, modifier: number|null, display: string }}
 */
export function performSecondRoll(firstRoll, hasBetterLuck = false) {
  const outcomeType = getSecondRollOutcome();

  switch (outcomeType) {
    case SECOND_ROLL_OUTCOMES.X2:
      return {
        type: 'X2',
        value: firstRoll * 2,
        modifier: null,
        display: 'X2',
      };

    case SECOND_ROLL_OUTCOMES.BLOCK:
      return {
        type: 'BLOCK',
        value: firstRoll, // Keep first roll as score
        modifier: null,
        display: 'BLOCK',
      };

    case SECOND_ROLL_OUTCOMES.ZERO:
      return {
        type: 'ZERO',
        value: 0,
        modifier: null,
        display: 'Ø',
      };

    case SECOND_ROLL_OUTCOMES.PLUS_2:
      return {
        type: 'MODIFIER',
        value: firstRoll + 2,
        modifier: 2,
        display: '+2',
      };

    case SECOND_ROLL_OUTCOMES.PLUS_4:
      return {
        type: 'MODIFIER',
        value: firstRoll + 4,
        modifier: 4,
        display: '+4',
      };

    case SECOND_ROLL_OUTCOMES.MINUS_2:
      return {
        type: 'MODIFIER',
        value: Math.max(0, firstRoll - 2),
        modifier: -2,
        display: '-2',
      };

    case SECOND_ROLL_OUTCOMES.MINUS_4:
      return {
        type: 'MODIFIER',
        value: Math.max(0, firstRoll - 4),
        modifier: -4,
        display: '-4',
      };

    case SECOND_ROLL_OUTCOMES.NORMAL:
    default:
      // Roll a new 1-6 (affected by Better Luck)
      const newRoll = rollDie(hasBetterLuck);
      return {
        type: 'NORMAL',
        value: newRoll,
        modifier: null,
        display: newRoll.toString(),
      };
  }
}

/**
 * Get second roll outcome type based on probabilities
 * @returns {string} Outcome type
 */
function getSecondRollOutcome() {
  const rand = randomInt(100);
  if (rand < SECOND_ROLL_NORMAL_CHANCE) {
    return SECOND_ROLL_OUTCOMES.NORMAL;
  }

  // Special pool is uniform (1/7 each)
  const idx = randomInt(SECOND_ROLL_SPECIAL_OUTCOMES.length);
  return SECOND_ROLL_SPECIAL_OUTCOMES[idx];
}

/**
 * Weighted random selection
 * @param {Object} weights - Object with values as weights
 * @returns {number|string} Selected key
 */
function weightedRandom(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const rand = randomFloat() * total;

  let cumulative = 0;
  for (const [value, weight] of entries) {
    cumulative += weight;
    if (rand < cumulative) {
      return parseInt(value, 10);
    }
  }

  return parseInt(entries[entries.length - 1][0], 10);
}

/**
 * Assign players to teams (balanced)
 * @param {Array} players - Array of player objects
 * @returns {{ teamA: Array, teamB: Array }}
 */
export function assignTeams(players) {
  const shuffled = shuffleArray(players);

  const teamA = [];
  const teamB = [];

  // Distribute evenly (or A gets extra if odd)
  shuffled.forEach((player, index) => {
    if (index % 2 === 0) {
      teamA.push(player);
    } else {
      teamB.push(player);
    }
  });

  return { teamA, teamB };
}

/**
 * Fisher-Yates shuffle (unbiased)
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function randomFloat() {
  return randomInt(1_000_000) / 1_000_000;
}

/**
 * Initialize player game state
 * @param {Object} player - Player from session
 * @param {number} scoreMultiplier - Handicap multiplier for uneven teams (default 1.0)
 * @returns {Object} Player with game state
 */
export function initializePlayerState(player, scoreMultiplier = 1.0) {
  return {
    userId: player.userId,
    displayName: player.displayName,
    username: player.username,
    avatarURL: player.avatarURL,
    totalScore: 0,
    roundScores: [0, 0, 0], // Scores for each round
    roundMeta: [null, null, null], // Store turn details for each round
    hasBetterLuck: player.perks?.includes('BETTER_LUCK') || false,
    blocked: false, // Blocked for current round
    wasBlockedThisRound: false, // Track if player was blocked (for summary display)
    scoreMultiplier, // Handicap multiplier for uneven teams
  };
}

/**
 * Calculate team total score
 * @param {Array} team - Array of player states
 * @returns {number}
 */
export function calculateTeamScore(team) {
  return team.reduce((sum, player) => sum + player.totalScore, 0);
}

/**
 * Calculate team score for a specific round
 * @param {Array} team - Array of player states
 * @param {number} round - Round number (0-indexed)
 * @returns {number}
 */
export function calculateTeamRoundScore(team, round) {
  return team.reduce((sum, player) => sum + (player.roundScores[round] || 0), 0);
}

/**
 * Calculate handicap multiplier for uneven teams
 * Smaller team gets a bonus multiplier to balance the game
 * @param {number} teamASize - Size of team A
 * @param {number} teamBSize - Size of team B
 * @returns {{ teamAMultiplier: number, teamBMultiplier: number }}
 */
export function calculateHandicapMultipliers(teamASize, teamBSize) {
  if (teamASize === teamBSize) {
    // Even teams - no handicap
    return { teamAMultiplier: 1.0, teamBMultiplier: 1.0 };
  }

  const larger = Math.max(teamASize, teamBSize);
  const smaller = Math.min(teamASize, teamBSize);
  const handicap = larger / smaller;

  if (teamASize < teamBSize) {
    // Team A is smaller, gets handicap
    return { teamAMultiplier: handicap, teamBMultiplier: 1.0 };
  } else {
    // Team B is smaller, gets handicap
    return { teamAMultiplier: 1.0, teamBMultiplier: handicap };
  }
}
