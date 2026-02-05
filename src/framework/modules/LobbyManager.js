/**
 * LobbyManager - Handles game lobby phase
 *
 * Features:
 * - Timestamp-based countdown (survives bot restart!)
 * - Periodic UI updates (every 5s to avoid rate limits)
 * - Join/leave with locks
 * - Auto-start when countdown ends
 * - Resume lobbies on bot restart
 */

import * as RedisService from '../../services/redis.service.js';
import { codec } from '../interaction/CustomIdCodec.js';
import logger from '../../utils/logger.js';

class LobbyManager {
  constructor(sessionManager) {
    this.sessions = sessionManager;
    this.activeLobbies = new Map(); // sessionId -> { intervalId, config }
    this.updateIntervalMs = 5000; // 5 seconds between UI updates
  }

  /**
   * Start a lobby for a session
   * @param {Object} session - Game session
   * @param {Object} config - Lobby configuration
   * @param {number} config.minPlayers - Minimum players to start
   * @param {number} config.maxPlayers - Maximum players allowed
   * @param {number} config.lobbyTimeout - Seconds until auto-start
   * @param {Function} config.buildEmbed - Function to build lobby embed
   * @param {Function} config.buildButtons - Function to build lobby buttons
   * @param {Function} config.onGameStart - Called when game starts
   * @param {Function} config.onGameCancelled - Called when game is cancelled
   * @param {Object} config.message - Discord message to update
   */
  async start(session, config) {
    const { minPlayers, maxPlayers, lobbyTimeout, message } = config;

    // Set end time (timestamp-based, survives restart!)
    session.lobbyEndsAt = Date.now() + (lobbyTimeout * 1000);
    session.phase = 'WAITING';
    session.minPlayers = minPlayers;
    session.maxPlayers = maxPlayers;

    await this.sessions.save(session);

    // Start UI update loop
    const intervalId = setInterval(async () => {
      await this._tick(session.id, config);
    }, this.updateIntervalMs);

    this.activeLobbies.set(session.id, { intervalId, config, message });

    // Initial UI update
    await this._updateUI(session, config);

    logger.info(`[LobbyManager] Started lobby for ${session.id}, ends at ${new Date(session.lobbyEndsAt).toISOString()}`);
  }

  /**
   * Periodic tick - check countdown and update UI
   */
  async _tick(sessionId, config) {
    try {
      const session = await this.sessions.load(sessionId);

      if (!session) {
        this._cleanup(sessionId);
        return;
      }

      // Skip if not in WAITING phase
      if (session.phase !== 'WAITING') {
        this._cleanup(sessionId);
        return;
      }

      const now = Date.now();
      const timeLeft = Math.max(0, Math.floor((session.lobbyEndsAt - now) / 1000));

      // Check if lobby should end
      if (timeLeft <= 0 || session.players.length >= config.maxPlayers) {
        if (session.players.length >= config.minPlayers) {
          await this._startGame(session, config);
        } else {
          await this._cancelGame(session, config, 'NOT_ENOUGH_PLAYERS');
        }
        return;
      }

      // Update UI with current countdown
      await this._updateUI(session, config, timeLeft);

    } catch (error) {
      logger.error(`[LobbyManager] Tick error for ${sessionId}:`, error);
    }
  }

  /**
   * Update the lobby UI
   */
  async _updateUI(session, config, timeLeft = null) {
    if (timeLeft === null) {
      const now = Date.now();
      timeLeft = Math.max(0, Math.floor((session.lobbyEndsAt - now) / 1000));
    }

    const lobbyData = this.activeLobbies.get(session.id);
    if (!lobbyData?.message) return;

    try {
      const embed = config.buildEmbed(session, timeLeft);
      const buttons = config.buildButtons(session);

      await lobbyData.message.edit({
        embeds: [embed],
        components: buttons
      });
    } catch (error) {
      if (error.code === 10008) {
        // Message deleted - cleanup
        logger.info(`[LobbyManager] Lobby message deleted for ${session.id}`);
        this._cleanup(session.id);
        await this.sessions.delete(session.id);
      } else {
        logger.debug(`[LobbyManager] Failed to update UI for ${session.id}: ${error.message}`);
      }
    }
  }

  /**
   * Handle player join
   * @param {string} sessionId
   * @param {Object} user - Discord user
   * @param {Object} member - Guild member (optional)
   * @returns {Promise<Object>} Result with session or error
   */
  async handleJoin(sessionId, user, member = null) {
    const lockKey = `game:lock:${sessionId}`;
    const gotLock = await RedisService.acquireLock(lockKey, 2);

    if (!gotLock) {
      return { error: 'BUSY_TRY_AGAIN' };
    }

    try {
      const session = await this.sessions.load(sessionId);

      if (!session) return { error: 'SESSION_NOT_FOUND' };
      if (session.phase !== 'WAITING') return { error: 'GAME_ALREADY_STARTED' };
      if (session.players.length >= session.maxPlayers) return { error: 'GAME_FULL' };
      if (session.players.find(p => p.userId === user.id)) return { error: 'ALREADY_IN_GAME' };

      // Add player
      const result = await this.sessions.joinPlayer({
        session,
        user,
        member
      });

      if (result.error) {
        return { error: result.error };
      }

      // Update UI immediately
      const lobbyData = this.activeLobbies.get(sessionId);
      if (lobbyData) {
        await this._updateUI(result.session, lobbyData.config);
      }

      return { success: true, session: result.session };

    } finally {
      RedisService.releaseLock(lockKey);
    }
  }

  /**
   * Handle player leave
   * @param {string} sessionId
   * @param {string} userId
   * @returns {Promise<Object>} Result
   */
  async handleLeave(sessionId, userId) {
    const lockKey = `game:lock:${sessionId}`;
    const gotLock = await RedisService.acquireLock(lockKey, 2);

    if (!gotLock) {
      return { error: 'BUSY_TRY_AGAIN' };
    }

    try {
      const session = await this.sessions.load(sessionId);

      if (!session) return { error: 'SESSION_NOT_FOUND' };
      if (session.phase !== 'WAITING') return { error: 'GAME_ALREADY_STARTED' };
      if (!session.players.find(p => p.userId === userId)) return { error: 'NOT_IN_GAME' };

      // Remove player
      const result = await this.sessions.removePlayer({
        session,
        userId
      });

      if (result.error) {
        return { error: result.error };
      }

      // Cancel if empty
      if (result.session.players.length === 0) {
        const lobbyData = this.activeLobbies.get(sessionId);
        if (lobbyData) {
          await this._cancelGame(result.session, lobbyData.config, 'ALL_PLAYERS_LEFT');
        }
        return { success: true, cancelled: true };
      }

      // Update UI immediately
      const lobbyData = this.activeLobbies.get(sessionId);
      if (lobbyData) {
        await this._updateUI(result.session, lobbyData.config);
      }

      return { success: true, session: result.session };

    } finally {
      RedisService.releaseLock(lockKey);
    }
  }

  /**
   * Start the game (transition from lobby to active)
   */
  async _startGame(session, config) {
    this._cleanup(session.id);

    // Start the game via SessionService
    const result = await this.sessions.startGame(session);

    if (result.error) {
      logger.error(`[LobbyManager] Failed to start game ${session.id}: ${result.error}`);
      await this._cancelGame(session, config, result.error);
      return;
    }

    const startedSession = result.session;
    startedSession.phase = 'ACTIVE';
    await this.sessions.save(startedSession);

    logger.info(`[LobbyManager] Game started: ${session.id} with ${startedSession.players.length} players`);

    // Update message to show game started
    const lobbyData = this.activeLobbies.get(session.id);
    if (lobbyData?.message) {
      try {
        await lobbyData.message.edit({
          content: `🎮 **بدأت اللعبة!** (${startedSession.players.length} لاعبين)`,
          embeds: [],
          components: []
        });
      } catch (e) {
        logger.warn(`[LobbyManager] Failed to edit start message for ${session.id}:`, e?.message || e);
      }
    }

    // Signal to game engine
    if (config.onGameStart) {
      await config.onGameStart(startedSession, lobbyData?.message?.channel);
    }
  }

  /**
   * Cancel the game
   */
  async _cancelGame(session, config, reason) {
    this._cleanup(session.id);

    logger.info(`[LobbyManager] Game cancelled: ${session.id}, reason: ${reason}`);

    // Update message
    const lobbyData = this.activeLobbies.get(session.id);
    if (lobbyData?.message) {
      try {
        const reasonText = {
          'NOT_ENOUGH_PLAYERS': `🚫 | تم إلغاء اللعبة لعدم وجود ${session.minPlayers} لاعبين على الأقل`,
          'ALL_PLAYERS_LEFT': '🚫 | تم إلغاء اللعبة - غادر جميع اللاعبين',
          'HOST_LEFT': '🚫 | تم إلغاء اللعبة - غادر المضيف',
          'ERROR': '🚫 | تم إلغاء اللعبة بسبب خطأ'
        };

        await lobbyData.message.edit({
          content: reasonText[reason] || reasonText.ERROR,
          embeds: [],
          components: []
        });
      } catch (e) {
        logger.warn(`[LobbyManager] Failed to edit cancel message for ${session.id}:`, e?.message || e);
      }
    }

    // Callback
    if (config.onGameCancelled) {
      await config.onGameCancelled(session, reason);
    }

    // Delete session
    await this.sessions.delete(session.id);
  }

  /**
   * Cleanup interval and remove from active lobbies
   */
  _cleanup(sessionId) {
    const lobbyData = this.activeLobbies.get(sessionId);
    if (lobbyData?.intervalId) {
      clearInterval(lobbyData.intervalId);
    }
    this.activeLobbies.delete(sessionId);
  }

  /**
   * Stop a lobby manually
   */
  stop(sessionId) {
    this._cleanup(sessionId);
  }

  /**
   * Resume all active lobbies on bot restart
   * Call this in the ready event
   * @param {Object} client - Discord client
   * @param {Function} getConfig - Function that returns config for a game type
   */
  async resumeAll(client, getConfig) {
    try {
      const waitingSessions = await this.sessions.getAllWaiting();

      for (const session of waitingSessions) {
        if (session.phase !== 'WAITING' || !session.lobbyEndsAt) {
          continue;
        }

        const now = Date.now();
        const timeLeft = Math.max(0, Math.floor((session.lobbyEndsAt - now) / 1000));

        // Skip if already expired (will be handled by next tick)
        if (timeLeft <= 0) {
          // Check if we should start or cancel
          if (session.players.length >= session.minPlayers) {
            // Could auto-start, but safer to let it expire naturally
            logger.info(`[LobbyManager] Expired lobby ${session.id} will be processed`);
          }
          continue;
        }

        // Try to get the original channel and message
        try {
          const channel = await client.channels.fetch(session.channelId);
          if (!channel) continue;

          const message = session.messageId
            ? await channel.messages.fetch(session.messageId).catch(() => null)
            : null;

          if (!message) {
            // Message deleted - cleanup
            await this.sessions.delete(session.id);
            continue;
          }

          // Get config for this game type
          const config = getConfig(session.gameType);
          if (!config) {
            logger.warn(`[LobbyManager] No config for game type ${session.gameType}`);
            continue;
          }

          // Resume the lobby
          const intervalId = setInterval(async () => {
            await this._tick(session.id, config);
          }, this.updateIntervalMs);

          this.activeLobbies.set(session.id, { intervalId, config, message });

          logger.info(`[LobbyManager] Resumed lobby ${session.id} with ${timeLeft}s remaining`);

        } catch (error) {
          logger.error(`[LobbyManager] Failed to resume lobby ${session.id}:`, error);
        }
      }

    } catch (error) {
      logger.error('[LobbyManager] resumeAll failed:', error);
    }
  }

  /**
   * Get active lobby count
   */
  getActiveLobbyCount() {
    return this.activeLobbies.size;
  }
}

export default LobbyManager;
