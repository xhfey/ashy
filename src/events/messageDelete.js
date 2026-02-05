/**
 * Handle message deletion - cleanup associated sessions
 */

import * as SessionService from '../services/games/session.service.js';
import { cancelSessionEverywhere } from '../services/games/cancellation.service.js';
import logger from '../utils/logger.js';

export default {
  name: 'messageDelete',

  async execute(message) {
    if (!message.id) return;

    try {
      const session = await SessionService.getSessionByMessage(message.id);

      if (session) {
        await cancelSessionEverywhere(session, 'MESSAGE_DELETED', { hardCleanup: true });
        logger.info(`Game ended due to game-message deletion (session ${session.id})`);
        await message.channel.send({ content: '🚫 | تم إلغاء اللعبة — تم حذف الرسالة' }).catch(() => {});
        return;
      }
    } catch (e) {
      logger.error('Message delete handler error:', e);
    }
  }
};
