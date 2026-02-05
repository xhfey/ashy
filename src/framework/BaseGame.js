/**
 * BaseGame - Abstract base class for all games
 *
 * Provides:
 * - Automatic timeout management
 * - Player state management
 * - Session lifecycle integration
 * - Reward distribution
 * - Error handling
 * - Cleanup guarantees
 *
 * Usage:
 * ```javascript
 * class MyGame extends BaseGame {
 *   async start() {
 *     // Initialize game-specific state
 *     await this.startFirstRound();
 *   }
 *
 *   async handleAction(ctx) {
 *     const { action, details } = ctx;
 *     switch (action) {
 *       case 'move':
 *         await this.handleMove(ctx, details);
 *         break;
 *     }
 *   }
 * }
 * ```
 */

import { TimeoutManager } from './TimeoutManager.js';
import { PlayerManager } from './PlayerManager.js';
import { sessionManager } from './index.js';
import * as SessionService from '../services/games/session.service.js';
import { awardGameWinners } from '../services/economy/rewards.service.js';
import logger from '../utils/logger.js';

export class BaseGame {
  /**
   * @param {string} gameType - Game type (e.g., 'DICE', 'ROULETTE')
   * @param {Object} session - Session from SessionService
   * @param {Object} channel - Discord channel object
   * @param {Object} [options] - Additional options
   */
  constructor(gameType, session, channel, options = {}) {
    // Core identifiers
    this.gameType = gameType;
    this.sessionId = session.id;
    this.channel = channel;

    // Framework managers
    this.timeouts = new TimeoutManager(logger, gameType);
    this.players = new PlayerManager(session.players);

    // Game state
    this.phase = 'INITIALIZING';
    this.currentRound = 0;
    this.customState = {}; // For game-specific state

    // Session reference (for framework)
    this._session = session;

    // Options
    this.options = options;

    logger.info(`[${this.gameType}] BaseGame initialized: ${this.sessionId}`);
  }

  /**
   * Abstract: Start the game
   * Override this in your game class
   */
  async start() {
    throw new Error('BaseGame.start() must be implemented by subclass');
  }

  /**
   * Abstract: Handle button action
   * Override this in your game class
   *
   * @param {Object} ctx - Context from ButtonRouter
   * @param {Object} ctx.session - Fresh session from DB
   * @param {Object} ctx.player - Player who clicked
   * @param {string} ctx.action - Action identifier
   * @param {string} ctx.details - Action details/params
   * @param {Object} ctx.interaction - Discord interaction
   * @param {Function} ctx.commit - Helper to increment uiVersion + save
   */
  async handleAction(ctx) {
    throw new Error('BaseGame.handleAction() must be implemented by subclass');
  }

  /**
   * End game and award winners
   *
   * @param {string|string[]} winnerIds - Winner user ID(s)
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} - Reward result
   */
  async endGame(winnerIds, options = {}) {
    this.phase = 'GAME_END';

    // Clear all timeouts
    this.timeouts.clearAll();

    // Normalize winners to array
    const winners = Array.isArray(winnerIds) ? winnerIds : [winnerIds];
    const primaryWinner = winners[0] || null;
    let endReason = 'COMPLETED';

    try {
      // Award rewards
      const rewardResult = await awardGameWinners({
        gameType: this.gameType,
        sessionId: this.sessionId,
        winnerIds: winners,
        playerCount: this.players.count(),
        roundsPlayed: this.currentRound || 1,
        ...options
      });

      logger.info(`[${this.gameType}] Game ended: ${this.sessionId} - Winners: ${winners.join(', ')}`);

      return rewardResult;

    } catch (error) {
      endReason = 'ERROR';
      logger.error(`[${this.gameType}] Error ending game:`, error);
      throw error;
    } finally {
      try {
        await SessionService.endSession(
          this.sessionId,
          primaryWinner, // Primary winner for stats
          endReason
        );
      } catch (endError) {
        logger.error(`[${this.gameType}] Failed to end session:`, endError);
      }
      // ALWAYS cleanup, even on error
      this.cleanup();
    }
  }

  /**
   * Cancel game (no winners)
   *
   * @param {string} [reason='CANCELLED'] - Cancellation reason
   */
  async cancelGame(reason = 'CANCELLED') {
    this.phase = 'CANCELLED';

    logger.info(`[${this.gameType}] Game cancelled: ${this.sessionId} - Reason: ${reason}`);

    try {
      await SessionService.endSession(this.sessionId, null, reason);
    } catch (error) {
      logger.error(`[${this.gameType}] Error cancelling game:`, error);
    } finally {
      this.cleanup();
    }
  }

  /**
   * Cleanup game resources
   * Called automatically by endGame() and cancelGame()
   *
   * Override if you need additional cleanup, but ALWAYS call super.cleanup()
   */
  cleanup() {
    this.timeouts.clearAll();
    logger.debug(`[${this.gameType}] Cleanup completed: ${this.sessionId}`);
  }

  /**
   * Get alive players
   *
   * @returns {Object[]} - Array of alive player objects
   */
  getAlivePlayers() {
    return this.players.alive();
  }

  /**
   * Get eliminated players
   *
   * @returns {Object[]} - Array of eliminated player objects
   */
  getEliminatedPlayers() {
    return this.players.dead();
  }

  /**
   * Eliminate a player
   *
   * @param {string} userId - Player user ID
   * @returns {boolean} - Whether player was eliminated
   */
  eliminatePlayer(userId) {
    return this.players.eliminate(userId);
  }

  /**
   * Check if game should end (only 1 alive or none)
   *
   * @returns {boolean}
   */
  shouldEndGame() {
    const aliveCount = this.players.aliveCount();
    return aliveCount <= 1;
  }

  /**
   * Get winner (last alive player)
   *
   * @returns {Object|null} - Winner player object or null
   */
  getWinner() {
    const alive = this.getAlivePlayers();
    return alive.length === 1 ? alive[0] : null;
  }

  /**
   * Send message to game channel
   *
   * @param {Object} options - Discord message options
   * @returns {Promise<Message>}
   */
  async sendMessage(options) {
    try {
      return await this.channel.send(options);
    } catch (error) {
      logger.error(`[${this.gameType}] Failed to send message:`, error);
      throw error;
    }
  }

  /**
   * Update session phase and save
   *
   * @param {string} phase - New phase
   * @returns {Promise<void>}
   */
  async updatePhase(phase) {
    this.phase = phase;
    this._session.phase = phase;
    await sessionManager.save(this._session);
  }

  /**
   * Increment UI version to invalidate old buttons
   *
   * @returns {Promise<void>}
   */
  async bumpUiVersion() {
    await sessionManager.commit(this._session);
  }

  /**
   * Get current UI version
   *
   * @returns {number}
   */
  get uiVersion() {
    return this._session.uiVersion || 0;
  }

  /**
   * Get session object
   *
   * @returns {Object}
   */
  get session() {
    return this._session;
  }

  /**
   * Delay helper
   *
   * @param {number} ms - Milliseconds
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if game is ended/cancelled
   *
   * @returns {boolean}
   */
  isEnded() {
    return this.phase === 'GAME_END' || this.phase === 'CANCELLED';
  }

  /**
   * Helper: Send error message to channel
   *
   * @param {string} message - Error message (Arabic)
   */
  async sendError(message) {
    try {
      await this.channel.send({ content: `❌ ${message}` });
    } catch (error) {
      logger.warn(`[${this.gameType}] Failed to send error message:`, error);
    }
  }

  /**
   * Helper: Send success message to channel
   *
   * @param {string} message - Success message (Arabic)
   */
  async sendSuccess(message) {
    try {
      await this.channel.send({ content: `✅ ${message}` });
    } catch (error) {
      logger.warn(`[${this.gameType}] Failed to send success message:`, error);
    }
  }
}
