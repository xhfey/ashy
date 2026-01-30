export default {
  // Discord credentials (from .env)
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,

  // Embed colors
  colors: {
    primary: 0x5865F2,   // Discord blurple
    success: 0x57F287,   // Green
    error: 0xED4245,     // Red
    warning: 0xFEE75C,   // Yellow
    info: 0x00B4D8,      // Cyan
    gold: 0xFFD700       // Gold (for winners)
  },

  // Common emojis
  emojis: {
    coin: '🪙',
    trophy: '🏆',
    crown: '👑',
    fire: '🔥',
    star: '⭐',
    check: '✅',
    cross: '❌',
    loading: '⏳',
    warning: '⚠️',
    dice: '🎲',
    target: '🎯'
  },

  // Timing
  timeouts: {
    gameJoin: 60000,      // 60s to join game
    playerTurn: 30000,    // 30s per turn
    buttonClick: 15000    // 15s to click button
  }
};
