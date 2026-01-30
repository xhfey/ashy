import logger from '../utils/logger.js';

export default {
  name: 'guildCreate',

  execute(guild) {
    logger.info(`Joined new server: ${guild.name} (${guild.id}) - ${guild.memberCount} members`);

    // TODO: Could send welcome message to server owner
    // TODO: Could log to admin channel
  }
};
