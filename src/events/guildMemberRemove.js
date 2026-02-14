import { handleMafiaGuildMemberRemove } from '../games/mafia/mafia.game.js';
import logger from '../utils/logger.js';

export default {
  name: 'guildMemberRemove',

  async execute(member) {
    try {
      await handleMafiaGuildMemberRemove(member);
    } catch (error) {
      logger.error('[guildMemberRemove] Failed to process member leave:', error);
    }
  }
};
