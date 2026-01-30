/**
 * Game Runner Service
 * Dispatches to the correct game implementation by type
 */

import { startDiceGame, registerDiceHandler } from '../../games/dice/dice.game.js';
import { startRouletteGame, registerRouletteHandler } from '../../games/roulette/roulette.game.js';
import logger from '../../utils/logger.js';

// Track if handlers have been registered
let handlersRegistered = false;

/**
 * Register all game handlers with ButtonRouter
 * Should be called once during bot startup
 */
export function registerGameHandlers() {
  if (handlersRegistered) return;

  registerDiceHandler();
  registerRouletteHandler();
  // Add more game registrations here as they are implemented

  handlersRegistered = true;
  logger.info('[GameRunner] All game handlers registered');
}

/**
 * Start the correct game for a session
 * @param {Object} session
 * @param {import('discord.js').TextChannel} channel
 * @returns {Promise<boolean>} true if started, false if not implemented
 */
export async function startGameForSession(session, channel) {
  if (!session || !channel) return false;

  switch (session.gameType) {
    case 'DICE':
      await startDiceGame(session, channel);
      return true;
    case 'ROULETTE':
      await startRouletteGame(session, channel);
      return true;
    default:
      logger.info(`Game type not implemented yet: ${session.gameType}`);
      return false;
  }
}
