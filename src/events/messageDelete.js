/**
 * Handle message deletion - cleanup associated sessions
 */

import * as SessionService from '../services/games/session.service.js';
import { cancelDiceGame } from '../games/dice/dice.game.js';
import { cancelRouletteGame } from '../games/roulette/roulette.game.js';
import logger from '../utils/logger.js';

export default {
  name: 'messageDelete',

  async execute(message) {
    if (!message.id) return;

    try {
      const result = await SessionService.handleMessageDeleted(message.id);

      if (result.sessionEnded) {
        if (result.session?.gameType === 'DICE') {
          cancelDiceGame(result.session.id, 'MESSAGE_DELETED');
        } else if (result.session?.gameType === 'ROULETTE') {
          cancelRouletteGame(result.session.id, 'MESSAGE_DELETED');
        }

        logger.info(`Game ended due to message deletion`);

        try {
          await message.channel.send({ content: '🚫 | تم إلغاء اللعبة — تم حذف الرسالة' });
        } catch (error) {
          logger.warn('[MessageDelete] Failed to send cancellation message:', error.message);
        }
      }
    } catch (e) {
      logger.error('Message delete handler error:', e);
    }
  }
};
