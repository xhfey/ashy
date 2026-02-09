/**
 * Roulette Embed Builders
 * All Discord embeds for the roulette game
 *
 * BUGS FIXED:
 * - #29: Removed unused userId parameter from createShopEmbed
 */

import { EmbedBuilder } from 'discord.js';
import { EMBED_COLORS, PERKS, GAME_SETTINGS, getNumberEmoji } from './roulette.constants.js';

/**
 * Create lobby embed showing available slots and current players
 */
export function createLobbyEmbed(session, remainingSeconds, countdownEndsAt = null) {
  const players = session.players || [];

  // Build player list with slot numbers
  let playerList = '';
  // Sort with proper handling of undefined slots
  const sortedPlayers = [...players].sort((a, b) => {
    const slotA = a.slot ?? Infinity;
    const slotB = b.slot ?? Infinity;
    return slotA - slotB;
  });

  if (sortedPlayers.length === 0) {
    playerList = '> لا يوجد لاعبين بعد';
  } else {
    playerList = sortedPlayers
      .map(p => `> ${getNumberEmoji(p.slot)} <@${p.userId}>`)
      .join('\n');
  }

  // Available slots indicator
  const slotsStatus = `${players.length}/${GAME_SETTINGS.maxPlayers} لاعب`;

  // Live countdown via Discord timestamp or fallback
  let countdownText;
  if (countdownEndsAt) {
    const epochSeconds = Math.floor(countdownEndsAt / 1000);
    countdownText = `⏱️ ستبدأ اللعبة <t:${epochSeconds}:R>`;
  } else {
    countdownText = `⏱️ تبقى **${remainingSeconds}** ثانية للانضمام`;
  }

  const embed = new EmbedBuilder()
    .setTitle('🎡 روليت')
    .setDescription(
      `**عجلة الحظ!** اختر رقمك وانتظر بدء اللعبة.\n\n` +
      `اضغط على رقم للانضمام، أو "عشوائي" لاختيار رقم عشوائي.\n\n` +
      countdownText
    )
    .addFields(
      {
        name: `👥 اللاعبون (${slotsStatus})`,
        value: playerList,
        inline: false,
      },
      {
        name: '📋 القواعد',
        value:
          '• العجلة تختار لاعب عشوائي\n' +
          '• اللاعب المختار يطرد لاعباً آخر\n' +
          '• آخر لاعبين يتنافسان على الفوز\n' +
          '• الفائز يحصل على المكافأة',
        inline: false,
      }
    )
    .setColor(EMBED_COLORS.lobby)
    .setFooter({ text: `الحد الأدنى: ${GAME_SETTINGS.minPlayers} لاعبين` });

  return embed;
}

/**
 * Create shop embed showing available perks
 * FIX #29: Removed unused userId parameter
 */
export function createShopEmbed(ownedPerks = [], balance = 0) {
  const perksList = Object.values(PERKS)
    .filter(p => p.phase === 'lobby')
    .map(perk => {
      const owned = ownedPerks.includes(perk.id);
      const status = owned ? '✅ مملوك' : `💰 ${perk.cost} عملة`;
      return `${perk.emoji} **${perk.name}** - ${status}\n> ${perk.description}`;
    })
    .join('\n\n');

  return new EmbedBuilder()
    .setTitle('🛒 متجر البيركات')
    .setDescription(
      `💰 **رصيدك:** ${balance} عملة\n\n` +
      'اشترِ بيركات لمساعدتك في اللعبة!\n\n' +
      perksList
    )
    .setColor(EMBED_COLORS.shop)
    .setFooter({ text: 'البيركات تُستخدم تلقائياً عند الحاجة' });
}

/**
 * Create game starting embed
 */
export function createGameStartEmbed() {
  return new EmbedBuilder()
    .setTitle('🎡 روليت')
    .setDescription(
      '**بدأت اللعبة!**\n\n' +
      '⏳ ستبدأ الجولة الأولى في بضع ثواني...'
    )
    .setColor(EMBED_COLORS.playing);
}

/**
 * Create round embed before spinning
 */
export function createRoundEmbed(roundNumber, alivePlayers) {
  const playerList = alivePlayers
    .map(p => `${getNumberEmoji(p.slot)} ${p.displayName}`)
    .join(' • ');

  return new EmbedBuilder()
    .setTitle(`🎡 الجولة ${roundNumber}`)
    .setDescription(
      `**اللاعبون المتبقون:** ${alivePlayers.length}\n\n` +
      `${playerList}\n\n` +
      '🎰 جاري تدوير العجلة...'
    )
    .setColor(EMBED_COLORS.playing);
}

/**
 * Create "chosen" embed after wheel lands on a player
 */
export function createChosenEmbed(player, roundNumber, discordTimestamp = null) {
  const timeText = discordTimestamp
    ? `لديك ${discordTimestamp} لاختيار لاعب لطرده.`
    : `لديك **${GAME_SETTINGS.kickTimeout} ثانية** لاختيار لاعب لطرده.`;

  return new EmbedBuilder()
    .setTitle(`🎡 الجولة ${roundNumber}`)
    .setDescription(
      `${getNumberEmoji(player.slot)} **تم اختيارك!**\n\n` +
      `<@${player.userId}> ${timeText}`
    )
    .setColor(EMBED_COLORS.kick);
}

/**
 * Create kick selection embed
 */
export function createKickSelectionEmbed(kickerPlayer, targetPlayers, discordTimestamp = null) {
  const targetsList = targetPlayers
    .map(p => `${getNumberEmoji(p.slot)} ${p.displayName}`)
    .join('\n');

  // Discord timestamps don't render in footer, so put countdown in description
  const timeText = discordTimestamp
    ? `\n\n⏱️ ${discordTimestamp} للاختيار أو ستُطرد أنت!`
    : `\n\n⏱️ ${GAME_SETTINGS.kickTimeout} ثانية للاختيار أو ستُطرد أنت!`;

  const description = `<@${kickerPlayer.userId}> اختر لاعباً لطرده:\n\n${targetsList}${timeText}`;

  return new EmbedBuilder()
    .setTitle('⚔️ اختر ضحيتك')
    .setDescription(description)
    .setColor(EMBED_COLORS.kick);
}

/**
 * Create elimination embed
 */
export function createEliminationEmbed(eliminatedPlayer, reason = 'kicked') {
  const messages = {
    kicked: `💣 تم طرد <@${eliminatedPlayer.userId}> من اللعبة!`,
    timeout: `⏰ انتهى الوقت! تم طرد <@${eliminatedPlayer.userId}> لعدم الاختيار!`,
    self_kick: `🤡 <@${eliminatedPlayer.userId}> انسحب من اللعبة!`,
    shield_reflect: `🛡️ **ارتد الهجوم!** تم طرد <@${eliminatedPlayer.userId}> بسبب الدرع!`,
  };

  return new EmbedBuilder()
    .setTitle('💀 طرد!')
    .setDescription(
      `${messages[reason] || messages.kicked}\n\n` +
      '⏳ سيتم بدء الجولة القادمة في بضع ثواني...'
    )
    .setColor(EMBED_COLORS.eliminated);
}

/**
 * Create extra life used embed
 */
export function createExtraLifeEmbed(player) {
  return new EmbedBuilder()
    .setTitle('❤️ حياة إضافية!')
    .setDescription(
      `<@${player.userId}> استخدم **حياة إضافية** ونجا من الطرد!\n\n` +
      '⏳ سيتم بدء الجولة القادمة في بضع ثواني...'
    )
    .setColor(EMBED_COLORS.shop);
}

/**
 * Create shield reflect embed
 */
export function createShieldReflectEmbed(target, attacker, attackerSurvived = false) {
  let description = `🛡️ <@${target.userId}> استخدم **الدرع** وعكس الهجوم!`;

  if (attackerSurvived) {
    description += `\n\n❤️ <@${attacker.userId}> استخدم **حياة إضافية** ونجا!`;
  } else {
    description += `\n\n💀 <@${attacker.userId}> تم طرده!`;
  }

  return new EmbedBuilder()
    .setTitle('🛡️ انعكاس!')
    .setDescription(description)
    .setColor(EMBED_COLORS.kick);
}

/**
 * Create final round embed
 */
export function createFinalRoundEmbed(player1, player2) {
  return new EmbedBuilder()
    .setTitle('👑 الجولة الأخيرة!')
    .setDescription(
      '**هذه الجولة الأخيرة!**\n\n' +
      `${getNumberEmoji(player1.slot)} <@${player1.userId}>\n` +
      `⚔️ ضد\n` +
      `${getNumberEmoji(player2.slot)} <@${player2.userId}>\n\n` +
      '🎰 من سيفوز؟'
    )
    .setColor(EMBED_COLORS.winner);
}

/**
 * Create winner embed
 */
export function createWinnerEmbed(winner, reward, newBalance) {
  return new EmbedBuilder()
    .setTitle('🎉👑 لدينا فائز!')
    .setDescription(
      `**مبروك!** <@${winner.userId}> فاز باللعبة!\n\n` +
      `🏆 الجائزة: **+${reward}** عملة آشي\n` +
      `💰 الرصيد الجديد: **${newBalance}** عملة`
    )
    .setColor(EMBED_COLORS.winner)
    .setTimestamp();
}

/**
 * Create game cancelled embed
 */
export function createCancelledEmbed(reason = 'not_enough_players') {
  const messages = {
    not_enough_players: '❌ تم إلغاء اللعبة - لا يوجد لاعبين كافيين',
    timeout: '❌ تم إلغاء اللعبة - انتهى الوقت',
    host_left: '❌ تم إلغاء اللعبة - غادر المضيف',
    error: '❌ تم إلغاء اللعبة بسبب خطأ',
  };

  return new EmbedBuilder()
    .setTitle('🚫 تم الإلغاء')
    .setDescription(messages[reason] || messages.error)
    .setColor(EMBED_COLORS.eliminated);
}

/**
 * Create double kick prompt embed
 */
export function createDoubleKickPromptEmbed(kickerPlayer, firstTarget) {
  return new EmbedBuilder()
    .setTitle('🔥 طرد مرتين!')
    .setDescription(
      `<@${kickerPlayer.userId}> طرد <@${firstTarget.userId}>!\n\n` +
      '🔥 **لديك طرد إضافي!** اختر اللاعب الثاني.'
    )
    .setColor(EMBED_COLORS.kick);
}

export default {
  createLobbyEmbed,
  createShopEmbed,
  createGameStartEmbed,
  createRoundEmbed,
  createChosenEmbed,
  createKickSelectionEmbed,
  createEliminationEmbed,
  createExtraLifeEmbed,
  createShieldReflectEmbed,
  createFinalRoundEmbed,
  createWinnerEmbed,
  createCancelledEmbed,
  createDoubleKickPromptEmbed,
};
