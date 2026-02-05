/**
 * Embed Helpers - Standardized embed builders for games
 *
 * Provides consistent styling and formatting across all games
 */

import { EmbedBuilder } from 'discord.js';

/**
 * Brand colors for embeds
 */
export const COLORS = {
  PRIMARY: '#5865F2',      // Discord Blurple
  SUCCESS: '#57F287',      // Green
  ERROR: '#ED4245',        // Red
  WARNING: '#FEE75C',      // Yellow
  INFO: '#5865F2',         // Blue
  GAME: '#EB459E',         // Pink
  WINNER: '#FFD700',       // Gold
};

/**
 * Create base game embed with consistent styling
 *
 * @param {string} title - Embed title (Arabic)
 * @param {string} [description] - Embed description (Arabic)
 * @param {string} [color] - Hex color (default: PRIMARY)
 * @returns {EmbedBuilder}
 */
export function createGameEmbed(title, description = null, color = COLORS.PRIMARY) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setTimestamp();

  if (description) {
    embed.setDescription(description);
  }

  return embed;
}

/**
 * Create error embed
 *
 * @param {string} message - Error message (Arabic)
 * @returns {EmbedBuilder}
 */
export function createErrorEmbed(message) {
  return new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setDescription(`❌ ${message}`)
    .setTimestamp();
}

/**
 * Create success embed
 *
 * @param {string} message - Success message (Arabic)
 * @returns {EmbedBuilder}
 */
export function createSuccessEmbed(message) {
  return new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setDescription(`✅ ${message}`)
    .setTimestamp();
}

/**
 * Create warning embed
 *
 * @param {string} message - Warning message (Arabic)
 * @returns {EmbedBuilder}
 */
export function createWarningEmbed(message) {
  return new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setDescription(`⚠️ ${message}`)
    .setTimestamp();
}

/**
 * Create info embed
 *
 * @param {string} title - Title (Arabic)
 * @param {string} description - Description (Arabic)
 * @returns {EmbedBuilder}
 */
export function createInfoEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

/**
 * Create winner announcement embed
 *
 * @param {Object} winner - Winner player object
 * @param {number} reward - Reward amount
 * @param {number} [newBalance] - New balance after reward
 * @returns {EmbedBuilder}
 */
export function createWinnerEmbed(winner, reward, newBalance = null) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.WINNER)
    .setTitle('🏆 انتهت اللعبة!')
    .setDescription(`**الفائز:** <@${winner.userId}>\n💰 **المكافأة:** ${reward} عملة`)
    .setTimestamp();

  if (newBalance !== null) {
    embed.addFields({
      name: '💳 الرصيد الجديد',
      value: `${newBalance} عملة`,
      inline: true
    });
  }

  return embed;
}

/**
 * Create elimination embed
 *
 * @param {Object} player - Eliminated player object
 * @param {string} [reason] - Reason for elimination ('kicked', 'timeout', etc.)
 * @returns {EmbedBuilder}
 */
export function createEliminationEmbed(player, reason = 'kicked') {
  const reasonText = {
    'kicked': 'تم طرده من اللعبة!',
    'timeout': 'لم يرد في الوقت المحدد!',
    'self_kick': 'انسحب من اللعبة!',
    'shield_reflect': 'ارتد الدرع عليه!'
  }[reason] || 'خرج من اللعبة!';

  return new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setTitle('👋 لاعب خارج اللعبة')
    .setDescription(`**${player.displayName}** ${reasonText}`)
    .setTimestamp();
}

/**
 * Create round announcement embed
 *
 * @param {number} roundNumber - Current round number
 * @param {number} [totalRounds] - Total rounds (optional)
 * @param {string} [additionalInfo] - Extra info (Arabic)
 * @returns {EmbedBuilder}
 */
export function createRoundEmbed(roundNumber, totalRounds = null, additionalInfo = null) {
  let description = `**الجولة ${roundNumber}**`;

  if (totalRounds) {
    description = `**الجولة ${roundNumber} من ${totalRounds}**`;
  }

  if (additionalInfo) {
    description += `\n\n${additionalInfo}`;
  }

  return new EmbedBuilder()
    .setColor(COLORS.GAME)
    .setTitle('🎮 جولة جديدة')
    .setDescription(description)
    .setTimestamp();
}

/**
 * Create game start embed
 *
 * @param {string} gameName - Game name (Arabic)
 * @param {number} playerCount - Number of players
 * @param {string} [rules] - Game rules summary (Arabic)
 * @returns {EmbedBuilder}
 */
export function createGameStartEmbed(gameName, playerCount, rules = null) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.GAME)
    .setTitle(`🎮 ${gameName}`)
    .setDescription(`**بدأت اللعبة!**\n👥 **عدد اللاعبين:** ${playerCount}`)
    .setTimestamp();

  if (rules) {
    embed.addFields({
      name: '📋 القواعد',
      value: rules
    });
  }

  return embed;
}

/**
 * Create game cancelled embed
 *
 * @param {string} reason - Cancellation reason (Arabic)
 * @returns {EmbedBuilder}
 */
export function createCancelledEmbed(reason) {
  return new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle('🚫 تم إلغاء اللعبة')
    .setDescription(reason)
    .setTimestamp();
}

/**
 * Create player list embed field
 *
 * @param {Array} players - Array of player objects
 * @param {boolean} [showStatus=false] - Show alive/eliminated status
 * @returns {Object} - Discord embed field object
 */
export function createPlayerListField(players, showStatus = false) {
  const playerList = players.map((p, i) => {
    let line = `${i + 1}. **${p.displayName}**`;

    if (showStatus) {
      line += p.alive === false ? ' ❌' : ' ✅';
    }

    return line;
  }).join('\n');

  return {
    name: '👥 اللاعبون',
    value: playerList || 'لا يوجد لاعبون'
  };
}

/**
 * Create score/leaderboard field
 *
 * @param {Array} entries - Array of {name, score, emoji} objects
 * @param {string} [fieldName='🏆 النتائج'] - Field title
 * @returns {Object} - Discord embed field object
 */
export function createScoreField(entries, fieldName = '🏆 النتائج') {
  const scoreList = entries.map((entry, i) => {
    const medal = ['🥇', '🥈', '🥉'][i] || '🔹';
    const emoji = entry.emoji || '';
    return `${medal} **${entry.name}**: ${entry.score} ${emoji}`;
  }).join('\n');

  return {
    name: fieldName,
    value: scoreList || 'لا توجد نتائج'
  };
}

/**
 * Create turn indicator field
 *
 * @param {Object} currentPlayer - Current turn player object
 * @param {number} [timeoutSeconds] - Remaining seconds (optional)
 * @returns {Object} - Discord embed field object
 */
export function createTurnField(currentPlayer, timeoutSeconds = null) {
  let value = `<@${currentPlayer.userId}>`;

  if (timeoutSeconds) {
    value += `\n⏱️ ${timeoutSeconds} ثانية`;
  }

  return {
    name: '▶️ الدور الحالي',
    value
  };
}

/**
 * Add footer with branding
 *
 * @param {EmbedBuilder} embed - Embed to modify
 * @param {string} [text] - Optional footer text
 * @returns {EmbedBuilder} - Modified embed
 */
export function addBrandFooter(embed, text = null) {
  const footerText = text || 'Ashy Bot - ألعاب آشي';
  return embed.setFooter({ text: footerText });
}

/**
 * Create perk usage embed (for perks like shield, extra life)
 *
 * @param {Object} player - Player who used perk
 * @param {string} perkName - Perk name (Arabic)
 * @param {string} perkEmoji - Perk emoji
 * @param {string} effect - Effect description (Arabic)
 * @returns {EmbedBuilder}
 */
export function createPerkUsageEmbed(player, perkName, perkEmoji, effect) {
  return new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${perkEmoji} استخدام البيرك`)
    .setDescription(`**${player.displayName}** استخدم **${perkName}**!\n\n${effect}`)
    .setTimestamp();
}

/**
 * Create timeout warning embed
 *
 * @param {Object} player - Player who timed out
 * @param {string} action - Action that timed out (Arabic)
 * @returns {EmbedBuilder}
 */
export function createTimeoutEmbed(player, action) {
  return new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setDescription(`⏱️ انتهى وقت **${player.displayName}**!\n${action}`)
    .setTimestamp();
}

/**
 * Create balance display embed
 *
 * @param {string} userId - User ID
 * @param {number} balance - Current balance
 * @returns {EmbedBuilder}
 */
export function createBalanceEmbed(userId, balance) {
  return new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle('💰 رصيدك')
    .setDescription(`<@${userId}>\n**${balance}** عملة`)
    .setTimestamp();
}
