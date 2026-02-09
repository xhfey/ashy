/**
 * Game embed builders v3
 *
 * - Countdown in footer (Fizbo style)
 * - Emoji numbers for player slots
 * - Only Roulette has SLOTS UI
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { GAMES, getLobbyType } from '../config/games.config.js';
import { getGamePerksArray } from '../config/perks.config.js';
import config from '../config/bot.config.js';

// Number emojis for player display
const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟',
                       '1️⃣1️⃣', '1️⃣2️⃣', '1️⃣3️⃣', '1️⃣4️⃣', '1️⃣5️⃣', '1️⃣6️⃣', '1️⃣7️⃣', '1️⃣8️⃣', '1️⃣9️⃣', '2️⃣0️⃣'];

function getNumberEmoji(num) {
  if (num >= 1 && num <= 10) return NUMBER_EMOJIS[num - 1];
  if (num > 10 && num <= 20) return NUMBER_EMOJIS[num - 1];
  return `${num}`;
}

/**
 * Build lobby embed with countdown
 * @param {Object} session
 * @param {number|null} remainingSeconds - Fallback countdown (used if countdownEndsAt not provided)
 * @param {number|null} countdownEndsAt - Deadline as Date.now()-style ms (enables Discord live timestamp)
 */
export function buildLobbyEmbed(session, remainingSeconds = null, countdownEndsAt = null) {
  const game = GAMES[session.gameType];

  // Title
  const title = game.name;

  // Description - game rules/instructions
  const gameDetails = game.details ?? game.description;
  let description = gameDetails + '\n\n';

  // Player list with emoji numbers and mentions
  description += `**اللاعبين المشاركين:** (${session.players.length}/${session.settings.maxPlayers})\n`;

  if (session.players.length === 0) {
    description += '_لا يوجد لاعبين بعد_';
  } else {
    for (const player of session.players) {
      const emoji = getNumberEmoji(player.slotNumber);
      description += `${emoji} <@${player.userId}>\n`;
    }
  }

  // Live countdown via Discord timestamp (renders client-side, zero API calls)
  if (countdownEndsAt) {
    const epochSeconds = Math.floor(countdownEndsAt / 1000);
    description += `\n⏱️ ستبدأ اللعبة <t:${epochSeconds}:R>`;
  } else if (remainingSeconds !== null && remainingSeconds > 0) {
    description += `\n⏱️ ستبدأ اللعبة بعد ${remainingSeconds} ثانية`;
  } else if (remainingSeconds === 0) {
    description += '\n⏳ جاري البدء...';
  }

  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(title)
    .setDescription(description);

  return embed;
}

/**
 * Build lobby components based on game type
 */
export function buildLobbyComponents(session) {
  const lobbyType = session.settings.lobbyType || getLobbyType(session.gameType);

  if (lobbyType === 'SLOTS') {
    return buildSlotsComponents(session);
  }
  return buildSimpleComponents(session);
}

/**
 * SIMPLE lobby - just action buttons
 * Used by: Dice, RPS, XO, Chairs, Mafia, HideSeek, Replica, Guess Country, Hot XO, Death Wheel
 */
function buildSimpleComponents(session) {
  const row = new ActionRowBuilder();

  // Join button (green)
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`game|join|${session.id}`)
      .setLabel('دخول إلى اللعبة')
      .setStyle(ButtonStyle.Success)
      .setDisabled(session.status !== 'WAITING' || session.players.length >= session.settings.maxPlayers)
  );

  // Leave button (red)
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`game|leave|${session.id}`)
      .setLabel('اخرج من اللعبة')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(session.status !== 'WAITING')
  );

  // Shop button (gray with emoji)
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`game|shop|${session.id}`)
      .setLabel('متجر اللعبة')
      .setEmoji('⚡')
      .setStyle(ButtonStyle.Secondary)
  );

  // Brand button (disabled, like Fizbo)
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`brand|display|${session.id}`)
      .setEmoji('🎮')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  return [row];
}

/**
 * SLOTS lobby - numbered grid + action buttons
 * Used by: Roulette ONLY
 */
function buildSlotsComponents(session) {
  const rows = [];
  const playersMap = new Map(session.players.map(p => [p.slotNumber, p]));
  const maxSlots = Math.min(session.settings.maxPlayers, 20);
  const disabled = session.status !== 'WAITING';

  // Slot buttons (4 rows of 5 = 20 slots max)
  const numSlotRows = Math.ceil(maxSlots / 5);

  for (let rowIdx = 0; rowIdx < Math.min(numSlotRows, 4); rowIdx++) {
    const row = new ActionRowBuilder();

    for (let colIdx = 0; colIdx < 5; colIdx++) {
      const slotNum = rowIdx * 5 + colIdx + 1;
      if (slotNum > maxSlots) break;

      const player = playersMap.get(slotNum);

      if (player) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`slot|taken|${session.id}|${slotNum}`)
            .setLabel(`${slotNum} ${player.displayName.slice(0, 5)}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        );
      } else {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`slot|join|${session.id}|${slotNum}`)
            .setLabel(`${slotNum}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled)
        );
      }
    }

    rows.push(row);
  }

  // Action row
  const actionRow = new ActionRowBuilder();

  // Random join
  actionRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`game|join|${session.id}`)
      .setLabel('دخول عشوائي')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled || session.players.length >= session.settings.maxPlayers)
  );

  // Leave
  actionRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`game|leave|${session.id}`)
      .setLabel('اخرج من اللعبة')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );

  // Shop
  actionRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`game|shop|${session.id}`)
      .setLabel('متجر اللعبة')
      .setEmoji('⚡')
      .setStyle(ButtonStyle.Secondary)
  );

  // Brand
  actionRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`brand|display|${session.id}`)
      .setEmoji('🎮')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  rows.push(actionRow);

  return rows.slice(0, 5); // Discord max 5 rows
}

/**
 * Build shop embed
 */
export function buildShopEmbed(session, userBalance, ownedPerks = []) {
  const game = GAMES[session.gameType];
  const perks = getGamePerksArray(session.gameType)
    .filter(perk => perk.showInShop !== false);

  let description = `🪙 **${userBalance}**\n\n`;

  if (perks.length === 0) {
    description += '_لا توجد مزايا لهذه اللعبة_';
  } else {
    description += '**مزايا اللعبة:**\n\n';

    for (const perk of perks) {
      const owned = ownedPerks.includes(perk.id);
      const status = owned ? '✅' : `🪙 ${perk.price}`;
      description += `${perk.emoji} **${perk.name}** — ${status}\n`;
      description += `└ ${perk.description}\n\n`;
    }

    const canBuyDuringGame = perks.every(perk => perk.canBuyDuringGame !== false);
    description += canBuyDuringGame
      ? '_مزايا اللعبة (يمكنك شراؤها خلال اللعب)_' 
      : '_مزايا اللعبة (الشراء متاح فقط قبل بدء اللعبة)_';
  }

  return new EmbedBuilder()
    .setColor(config.colors.info)
    .setTitle(`مزايا اللعبة`)
    .setDescription(description);
}

/**
 * Build shop buttons
 */
export function buildShopButtons(session, userBalance, ownedPerks = []) {
  const perks = getGamePerksArray(session.gameType)
    .filter(perk => perk.showInShop !== false);
  if (perks.length === 0) return [];

  const rows = [];

  for (let i = 0; i < perks.length; i += 5) {
    const chunk = perks.slice(i, i + 5);
    const row = new ActionRowBuilder();

    for (const perk of chunk) {
      const owned = ownedPerks.includes(perk.id);
      const canAfford = userBalance >= perk.price;
      const gameStarted = session.status !== 'WAITING';
      const cantBuyNow = perk.canBuyDuringGame === false && gameStarted;

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`perk|buy|${session.id}|${perk.id}`)
          .setLabel(`${perk.emoji} ${perk.name}`)
          .setStyle(owned ? ButtonStyle.Success : (canAfford && !cantBuyNow ? ButtonStyle.Primary : ButtonStyle.Secondary))
          .setDisabled(owned || !canAfford || cantBuyNow)
      );
    }

    rows.push(row);
    if (rows.length >= 5) break;
  }

  return rows;
}

/**
 * Build winner message (Fizbo style)
 */
export function buildWinnerMessage(winner, newBalance, bonus) {
  return {
    content: `👑 — <@${winner.userId}> فاز باللعبة`,
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('winner_bal')
          .setLabel(`${newBalance} [+${bonus}]`)
          .setEmoji('🪙')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('winner_brand')
          .setEmoji('🎮')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )
    ]
  };
}

/**
 * Build cancelled game message
 */
export function buildCancelledMessage(reason, minPlayers = 0) {
  return `🚫 | تم إلغاء اللعبة لعدم وجود ${minPlayers} لاعبين على الأقل`;
}
