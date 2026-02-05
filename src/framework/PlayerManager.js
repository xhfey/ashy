/**
 * PlayerManager - Safe player state management for games
 *
 * Features:
 * - Fast player lookups via Map
 * - Safe get() with validation errors
 * - Helper methods (alive, dead, current, etc.)
 * - Prevents null reference errors
 *
 * Usage:
 * ```javascript
 * const players = new PlayerManager(session.players);
 *
 * // Safe get (throws descriptive error if not found)
 * const player = players.get(userId);
 *
 * // Get all alive players
 * const alive = players.alive();
 *
 * // Get player by turn index
 * const current = players.byIndex(gameState.currentTurn);
 *
 * // Check if player exists
 * if (players.has(userId)) { ... }
 * ```
 */

export class PlayerManager {
  /**
   * @param {Array} playerArray - Array of player objects from session
   */
  constructor(playerArray) {
    // Convert array to Map for O(1) lookups
    this.playersMap = new Map();
    this.playersList = [];

    if (Array.isArray(playerArray)) {
      playerArray.forEach((player, index) => {
        if (!player.userId) {
          throw new Error(`PlayerManager: Player at index ${index} missing userId`);
        }

        this.playersMap.set(player.userId, player);
        this.playersList.push(player);
      });
    }
  }

  /**
   * Get player by userId (throws if not found)
   *
   * @param {string} userId - Discord user ID
   * @returns {Object} - Player object
   * @throws {Error} - If player not found
   */
  get(userId) {
    const player = this.playersMap.get(userId);

    if (!player) {
      throw new Error(`PlayerManager: Player not found: ${userId}`);
    }

    return player;
  }

  /**
   * Safely get player (returns null if not found)
   *
   * @param {string} userId - Discord user ID
   * @returns {Object|null} - Player object or null
   */
  find(userId) {
    return this.playersMap.get(userId) || null;
  }

  /**
   * Check if player exists
   *
   * @param {string} userId - Discord user ID
   * @returns {boolean}
   */
  has(userId) {
    return this.playersMap.has(userId);
  }

  /**
   * Get player by array index
   *
   * @param {number} index - Index in playersList
   * @returns {Object|null} - Player object or null
   */
  byIndex(index) {
    return this.playersList[index] || null;
  }

  /**
   * Get all alive players
   *
   * @returns {Object[]} - Array of alive players
   */
  alive() {
    return this.playersList.filter(p => p.alive !== false);
  }

  /**
   * Get all eliminated players
   *
   * @returns {Object[]} - Array of dead players
   */
  dead() {
    return this.playersList.filter(p => p.alive === false);
  }

  /**
   * Get all players (as array)
   *
   * @returns {Object[]} - Array of all players
   */
  all() {
    return [...this.playersList];
  }

  /**
   * Get total player count
   *
   * @returns {number}
   */
  count() {
    return this.playersList.length;
  }

  /**
   * Get alive player count
   *
   * @returns {number}
   */
  aliveCount() {
    return this.alive().length;
  }

  /**
   * Get dead player count
   *
   * @returns {number}
   */
  deadCount() {
    return this.dead().length;
  }

  /**
   * Check if player is alive
   *
   * @param {string} userId - Discord user ID
   * @returns {boolean}
   */
  isAlive(userId) {
    const player = this.find(userId);
    return player ? player.alive !== false : false;
  }

  /**
   * Eliminate a player
   *
   * @param {string} userId - Discord user ID
   * @returns {boolean} - Whether player was eliminated
   */
  eliminate(userId) {
    const player = this.find(userId);

    if (player) {
      player.alive = false;
      return true;
    }

    return false;
  }

  /**
   * Revive a player (for perks like extra life)
   *
   * @param {string} userId - Discord user ID
   * @returns {boolean} - Whether player was revived
   */
  revive(userId) {
    const player = this.find(userId);

    if (player) {
      player.alive = true;
      return true;
    }

    return false;
  }

  /**
   * Get player's perks
   *
   * @param {string} userId - Discord user ID
   * @returns {string[]} - Array of perk IDs
   */
  getPerks(userId) {
    const player = this.find(userId);
    return player?.perks || [];
  }

  /**
   * Check if player has a specific perk
   *
   * @param {string} userId - Discord user ID
   * @param {string} perkId - Perk identifier
   * @returns {boolean}
   */
  hasPerk(userId, perkId) {
    const perks = this.getPerks(userId);
    return perks.includes(perkId);
  }

  /**
   * Add perk to player
   *
   * @param {string} userId - Discord user ID
   * @param {string} perkId - Perk identifier
   * @returns {boolean} - Whether perk was added
   */
  addPerk(userId, perkId) {
    const player = this.find(userId);

    if (player) {
      if (!Array.isArray(player.perks)) {
        player.perks = [];
      }

      if (!player.perks.includes(perkId)) {
        player.perks.push(perkId);
        return true;
      }
    }

    return false;
  }

  /**
   * Remove perk from player
   *
   * @param {string} userId - Discord user ID
   * @param {string} perkId - Perk identifier
   * @returns {boolean} - Whether perk was removed
   */
  removePerk(userId, perkId) {
    const player = this.find(userId);

    if (player && Array.isArray(player.perks)) {
      const index = player.perks.indexOf(perkId);

      if (index !== -1) {
        player.perks.splice(index, 1);
        return true;
      }
    }

    return false;
  }

  /**
   * Get display names of all players
   *
   * @returns {string[]}
   */
  displayNames() {
    return this.playersList.map(p => p.displayName || 'Unknown');
  }

  /**
   * Get user IDs of all players
   *
   * @returns {string[]}
   */
  userIds() {
    return this.playersList.map(p => p.userId);
  }

  /**
   * Filter players by condition
   *
   * @param {Function} predicate - Filter function
   * @returns {Object[]} - Filtered players
   */
  filter(predicate) {
    return this.playersList.filter(predicate);
  }

  /**
   * Find first player matching condition
   *
   * @param {Function} predicate - Filter function
   * @returns {Object|null} - First matching player or null
   */
  findWhere(predicate) {
    return this.playersList.find(predicate) || null;
  }

  /**
   * Map over all players
   *
   * @param {Function} mapper - Map function
   * @returns {Array} - Mapped array
   */
  map(mapper) {
    return this.playersList.map(mapper);
  }
}
