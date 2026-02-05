/**
 * Game Helpers - Common validation and utility functions for games
 *
 * Provides reusable validation and game mechanics to reduce duplication
 */

/**
 * Custom error class for game-specific errors
 */
export class GameError extends Error {
  constructor(code, message, userMessage = null) {
    super(message);
    this.name = 'GameError';
    this.code = code;
    this.userMessage = userMessage || message;
  }
}

/**
 * Validation: Require player to be the active turn player
 *
 * @param {string} playerId - Player attempting action
 * @param {string} currentPlayerId - Current turn player ID
 * @param {string} [errorMessage] - Custom error message (Arabic)
 * @throws {GameError} - If not player's turn
 */
export function requireActiveTurn(playerId, currentPlayerId, errorMessage = '❌ ليس دورك!') {
  if (playerId !== currentPlayerId) {
    throw new GameError('NOT_YOUR_TURN', `Player ${playerId} attempted action on ${currentPlayerId}'s turn`, errorMessage);
  }
}

/**
 * Validation: Require minimum alive players
 *
 * @param {Array} players - Array of player objects
 * @param {number} minCount - Minimum required alive players
 * @param {string} [errorMessage] - Custom error message (Arabic)
 * @throws {GameError} - If not enough alive players
 */
export function requireAlivePlayers(players, minCount = 2, errorMessage = '❌ لا يوجد لاعبين كافيين!') {
  const aliveCount = players.filter(p => p.alive !== false).length;

  if (aliveCount < minCount) {
    throw new GameError(
      'NOT_ENOUGH_ALIVE_PLAYERS',
      `Only ${aliveCount} alive players, need ${minCount}`,
      errorMessage
    );
  }
}

/**
 * Validation: Require specific game phase
 *
 * @param {string} currentPhase - Current game phase
 * @param {string|string[]} expectedPhase - Expected phase(s)
 * @param {string} [errorMessage] - Custom error message (Arabic)
 * @throws {GameError} - If wrong phase
 */
export function requireGamePhase(currentPhase, expectedPhase, errorMessage = '❌ الإجراء غير متاح في هذه المرحلة!') {
  const expected = Array.isArray(expectedPhase) ? expectedPhase : [expectedPhase];

  if (!expected.includes(currentPhase)) {
    throw new GameError(
      'WRONG_PHASE',
      `Expected phase ${expected.join('|')}, got ${currentPhase}`,
      errorMessage
    );
  }
}

/**
 * Validation: Require player to be in game
 *
 * @param {string} playerId - Player ID to check
 * @param {Array} players - Array of player objects
 * @param {string} [errorMessage] - Custom error message (Arabic)
 * @throws {GameError} - If player not in game
 * @returns {Object} - Player object
 */
export function requirePlayerInGame(playerId, players, errorMessage = '❌ أنت لست في اللعبة!') {
  const player = players.find(p => p.userId === playerId);

  if (!player) {
    throw new GameError('PLAYER_NOT_IN_GAME', `Player ${playerId} not found in game`, errorMessage);
  }

  return player;
}

/**
 * Validation: Require player to be alive
 *
 * @param {Object} player - Player object
 * @param {string} [errorMessage] - Custom error message (Arabic)
 * @throws {GameError} - If player is eliminated
 */
export function requirePlayerAlive(player, errorMessage = '❌ أنت خارج اللعبة!') {
  if (player.alive === false) {
    throw new GameError('PLAYER_ELIMINATED', `Player ${player.userId} is eliminated`, errorMessage);
  }
}

/**
 * Get alive players from array
 *
 * @param {Array} players - Array of player objects
 * @returns {Array} - Alive players
 */
export function getAlivePlayers(players) {
  return players.filter(p => p.alive !== false);
}

/**
 * Get eliminated players from array
 *
 * @param {Array} players - Array of player objects
 * @returns {Array} - Eliminated players
 */
export function getEliminatedPlayers(players) {
  return players.filter(p => p.alive === false);
}

/**
 * Find player by user ID
 *
 * @param {Array} players - Array of player objects
 * @param {string} userId - Discord user ID
 * @returns {Object|null} - Player object or null
 */
export function findPlayer(players, userId) {
  return players.find(p => p.userId === userId) || null;
}

/**
 * Check if player has specific perk
 *
 * @param {Object} player - Player object
 * @param {string} perkId - Perk identifier
 * @returns {boolean}
 */
export function hasActivePerk(player, perkId) {
  return Array.isArray(player.perks) && player.perks.includes(perkId);
}

/**
 * Remove perk from player (consumes it)
 *
 * @param {Object} player - Player object
 * @param {string} perkId - Perk identifier
 * @returns {boolean} - Whether perk was removed
 */
export function consumePerk(player, perkId) {
  if (!Array.isArray(player.perks)) return false;

  const index = player.perks.indexOf(perkId);
  if (index === -1) return false;

  player.perks.splice(index, 1);
  return true;
}

/**
 * Delay utility (promisified setTimeout)
 *
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get random integer (inclusive min, exclusive max)
 *
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (exclusive)
 * @returns {number}
 */
export function randomInt(min, max) {
  if (max === undefined) {
    max = min;
    min = 0;
  }
  return Math.floor(Math.random() * (max - min)) + min;
}

/**
 * Shuffle array (Fisher-Yates algorithm)
 *
 * @param {Array} array - Array to shuffle (modifies in place)
 * @returns {Array} - Shuffled array
 */
export function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Pick random element from array
 *
 * @param {Array} array - Array to pick from
 * @returns {*} - Random element
 */
export function randomPick(array) {
  return array[randomInt(array.length)];
}

/**
 * Get next player in circular turn order
 *
 * @param {Array} players - Array of players
 * @param {number} currentIndex - Current turn index
 * @param {boolean} [aliveOnly=true] - Only count alive players
 * @returns {number} - Next player index
 */
export function getNextPlayerIndex(players, currentIndex, aliveOnly = true) {
  const candidates = aliveOnly ? players.filter(p => p.alive !== false) : players;

  if (candidates.length === 0) return -1;

  let nextIndex = (currentIndex + 1) % players.length;
  let attempts = 0;

  while (attempts < players.length) {
    const player = players[nextIndex];

    if (!aliveOnly || player.alive !== false) {
      return nextIndex;
    }

    nextIndex = (nextIndex + 1) % players.length;
    attempts++;
  }

  return -1;
}

/**
 * Format player mention for Discord
 *
 * @param {string} userId - Discord user ID
 * @returns {string} - Discord mention string
 */
export function mention(userId) {
  return `<@${userId}>`;
}

/**
 * Format coin amount with emoji
 *
 * @param {number} amount - Coin amount
 * @returns {string} - Formatted string
 */
export function formatCoins(amount) {
  return `**${amount}** 💰`;
}

/**
 * Check if game is cancelled/ended
 *
 * @param {Object} gameState - Game state object
 * @returns {boolean}
 */
export function isGameEnded(gameState) {
  return gameState.phase === 'GAME_END' || gameState.phase === 'CANCELLED';
}

/**
 * Clamp value between min and max
 *
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} - Clamped value
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Parse select menu value (safely)
 *
 * @param {Object} interaction - Discord interaction
 * @returns {string|null} - Selected value or null
 */
export function getSelectValue(interaction) {
  if (!interaction?.values || interaction.values.length === 0) return null;
  return interaction.values[0];
}

/**
 * Create teams from players (for team-based games)
 *
 * @param {Array} players - Array of players
 * @param {number} teamCount - Number of teams
 * @returns {Array<Array>} - Array of teams
 */
export function createTeams(players, teamCount = 2) {
  const teams = Array.from({ length: teamCount }, () => []);

  players.forEach((player, index) => {
    const teamIndex = index % teamCount;
    teams[teamIndex].push(player);
  });

  return teams;
}

/**
 * Get team letter (A, B, C, etc.)
 *
 * @param {number} teamIndex - Team index (0-based)
 * @returns {string} - Team letter
 */
export function getTeamLetter(teamIndex) {
  return String.fromCharCode(65 + teamIndex); // A=65
}

/**
 * Calculate percentage
 *
 * @param {number} value - Value
 * @param {number} total - Total
 * @returns {number} - Percentage (0-100)
 */
export function percentage(value, total) {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}
