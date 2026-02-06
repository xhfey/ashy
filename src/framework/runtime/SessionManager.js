/**
 * SessionManager - Wrapper around SessionService with framework extensions
 *
 * Adds:
 * - uiVersion tracking for stale click detection
 * - TTL touch to keep sessions alive
 * - Idempotency guards for payouts
 * - Simplified API for games
 */

import * as SessionService from '../../services/games/session.service.js';
import logger from '../../utils/logger.js';
const DEFAULT_TTL = 3600; // 1 hour

class SessionManager {
  constructor() {
    this.defaultTTL = DEFAULT_TTL;
  }

  /**
   * Create a new game session
   * @param {Object} options
   * @returns {Promise<Object>} Session object
   */
  async create({ gameType, guildId, channelId, user, member = null, initialState = {} }) {
    const session = await SessionService.createSession({
      gameType,
      guildId,
      channelId,
      user,
      member
    });

    if (session.error) {
      return session; // Return error as-is
    }

    // Add framework fields
    session.uiVersion = 0;
    session.payoutDone = false;

    // Merge initial state
    Object.assign(session, initialState);

    await this.save(session);
    return session;
  }

  /**
   * Load a session by ID
   * @param {string} sessionId
   * @returns {Promise<Object|null>}
   */
  async load(sessionId) {
    return await SessionService.getSession(sessionId);
  }

  /**
   * Load a session by channel ID
   * @param {string} channelId
   * @returns {Promise<Object|null>}
   */
  async loadByChannel(channelId) {
    return await SessionService.getSessionByChannel(channelId);
  }

  /**
   * Save a session (and increment uiVersion if not already incremented)
   * @param {Object} session
   */
  async save(session) {
    await SessionService.saveSession(session);
  }

  /**
   * Save session and increment UI version (call after state changes)
   * @param {Object} session
   */
  async commit(session) {
    session.uiVersion = (session.uiVersion || 0) + 1;
    await this.save(session);
  }

  /**
   * Touch session to extend TTL (keeps it alive during active play)
   * @param {string} sessionId
   */
  async touch(sessionId) {
    // In-memory sessions do not use TTL extension.
    // Keep method for API compatibility with callers.
    if (!sessionId) {
      logger.debug('[SessionManager] touch called without sessionId');
    }
  }

  /**
   * Delete a session
   * @param {string} sessionId
   */
  async delete(sessionId) {
    await SessionService.cleanupSession(sessionId);
  }

  /**
   * Mark session as completed (idempotent - returns false if already completed)
   * @param {string} sessionId
   * @returns {Promise<boolean>} True if this was the first completion
   */
  async markCompleted(sessionId) {
    const session = await this.load(sessionId);
    if (!session) return false;

    if (session.completedAt) {
      logger.debug(`[SessionManager] Session ${sessionId} already completed`);
      return false; // Already processed
    }

    session.completedAt = Date.now();
    session.status = 'COMPLETED';
    await this.save(session);
    return true; // First completion
  }

  /**
   * Mark payout as done (idempotent - prevents double payouts)
   * @param {string} sessionId
   * @returns {Promise<boolean>} True if this was the first payout
   */
  async markPayoutDone(sessionId) {
    const session = await this.load(sessionId);
    if (!session || session.payoutDone) {
      logger.debug(`[SessionManager] Payout already done for ${sessionId}`);
      return false;
    }

    session.payoutDone = true;
    await this.save(session);
    return true;
  }

  /**
   * Join a player to a session (uses existing SessionService)
   */
  async joinPlayer({ session, user, member = null, preferredSlot = null }) {
    const result = await SessionService.joinSession({
      session,
      user,
      member,
      preferredSlot
    });

    if (result.session) {
      // Increment UI version after join
      result.session.uiVersion = (result.session.uiVersion || 0) + 1;
      await this.save(result.session);
    }

    return result;
  }

  /**
   * Remove a player from a session (uses existing SessionService)
   */
  async removePlayer({ session, userId }) {
    const result = await SessionService.leaveSession({
      session,
      userId
    });

    if (result.session) {
      // Increment UI version after leave
      result.session.uiVersion = (result.session.uiVersion || 0) + 1;
      await this.save(result.session);
    }

    return result;
  }

  /**
   * Start a game (transition from WAITING to ACTIVE)
   */
  async startGame(session) {
    const result = await SessionService.startGame(session);

    if (result.session) {
      result.session.uiVersion = (result.session.uiVersion || 0) + 1;
      await this.save(result.session);
    }

    return result;
  }

  /**
   * End a game session
   */
  async endGame(sessionId, winnerId = null, reason = 'COMPLETED') {
    return await SessionService.endSession(sessionId, winnerId, reason);
  }

  /**
   * Get remaining countdown seconds
   */
  getRemainingCountdown(session) {
    return SessionService.getRemainingCountdown(session);
  }

  /**
   * Check if countdown has expired
   */
  isCountdownExpired(session) {
    return SessionService.isCountdownExpired(session);
  }

  /**
   * Get all sessions in WAITING status
   */
  async getAllWaiting() {
    return await SessionService.getAllWaitingSessions();
  }

  /**
   * Set the message ID for a session
   */
  async setMessageId(sessionId, messageId) {
    await SessionService.setMessageId(sessionId, messageId);
  }

  /**
   * Add a perk to a player
   */
  async addPlayerPerk(session, userId, perkId) {
    return await SessionService.addPlayerPerk(session, userId, perkId);
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();
export default SessionManager;
