/**
 * Interaction handler - FIXED
 *
 * Uses | delimiter for customIds
 * Passes session to avoid double fetch
 * Uses interaction.update() for speed
 *
 * Also supports command-specific handleButton methods via colon delimiter:
 * - format: commandName:sessionId:action[:param]
 */

import * as SessionService from '../services/games/session.service.js';
import * as CurrencyService from '../services/economy/currency.service.js';
import { buildLobbyEmbed, buildLobbyComponents, buildShopEmbed, buildShopButtons } from '../utils/game-embeds.js';
import { getPerk } from '../config/perks.config.js';
import logger from '../utils/logger.js';
import { buttonRouter } from '../framework/index.js';

// Command name to slash command mapping for legacy button routing
// (New games use v1 format via ButtonRouter)
const COMMAND_MAP = {
  // 'roulette' removed - now uses v1 format via ButtonRouter
};

export default {
  name: 'interactionCreate',

  async execute(interaction) {
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        logger.error('Command error:', error);
        const reply = { content: '❌ حدث خطأ!', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply).catch(() => {});
        } else {
          await interaction.reply(reply).catch(() => {});
        }
      }
    }

    if (interaction.isButton()) {
      await handleButton(interaction).catch(err => {
        logger.error('Button error:', err);
      });
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith('v1:')) {
        const handled = await buttonRouter.handleInteraction(interaction);
        if (handled) return;
      }

      if (interaction.customId === 'leaderboard_select') {
        const cmd = interaction.client.commands.get('لوحة-الصدارة');
        if (cmd?.handleSelectMenu) await cmd.handleSelectMenu(interaction);
      }
    }
  }
};

/**
 * Parse customId - supports both | and _ delimiters
 */
function parseCustomId(customId) {
  const delimiter = customId.includes('|') ? '|' : '_';
  const parts = customId.split(delimiter);
  return {
    category: parts[0],
    action: parts[1],
    sessionId: parts[2],
    extra: parts.slice(3).join(delimiter)
  };
}

async function safeReply(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(payload);
  }
  return interaction.reply(payload);
}

async function safeUpdate(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.update(payload);
}

async function handleButton(interaction) {
  const customId = interaction.customId;

  // Try v1 format buttons (framework) first
  if (customId.startsWith('v1:')) {
    const handled = await buttonRouter.handleInteraction(interaction);
    if (handled) return;
    // If not handled (no registered handler), fall through to legacy
  }

  // Check for command-specific button format (commandName:sessionId:action[:param])
  if (customId.includes(':')) {
    const colonParts = customId.split(':');
    const commandKey = colonParts[0];
    const sessionId = colonParts[1];
    const action = colonParts.slice(2).join(':'); // Rest is the action + any params

    // Map to actual command name
    const commandName = COMMAND_MAP[commandKey];
    if (commandName) {
      const command = interaction.client.commands.get(commandName);
      if (command?.handleButton) {
        try {
          await command.handleButton(interaction, sessionId, action);
        } catch (error) {
          logger.error(`Button handler error for ${commandKey}:`, error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ حدث خطأ!', ephemeral: true }).catch(() => {});
          }
        }
        return;
      }
    }
  }

  // Legacy format parsing (| or _ delimiter)
  const { category, action, sessionId, extra } = parseCustomId(customId);

  // Decorative buttons
  if (category === 'brand' || category === 'winner' || action === 'taken') {
    return interaction.deferUpdate().catch(() => {});
  }

  // Defer FIRST before any async checks to prevent timeout
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }

  // Get session ONCE
  let session = null;
  if (sessionId) {
    session = await SessionService.getSession(sessionId);
    if (!session) {
      return safeReply(interaction, { content: '❌ اللعبة انتهت', ephemeral: true });
    }
  }

  // Slot join
  if (category === 'slot' && action === 'join') {
    return handleJoin(interaction, session, parseInt(extra, 10));
  }

  // Game buttons
  if (category === 'game') {
    switch (action) {
      case 'join': return handleJoin(interaction, session);
      case 'leave': return handleLeave(interaction, session);
      case 'shop': return handleShop(interaction, session);
    }
  }

  // Perk purchase
  if (category === 'perk' && action === 'buy') {
    return handlePerkBuy(interaction, session, extra);
  }

  // Legacy dice buttons removed - now handled via v1 format + ButtonRouter
}

async function handleJoin(interaction, session, preferredSlot = null) {
  // Defer FIRST before any async checks to prevent timeout
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }

  if (session.status !== 'WAITING') {
    return interaction.followUp({ content: '❌ اللعبة بدأت!', ephemeral: true });
  }

  const result = await SessionService.joinSession({
    session,
    user: interaction.user,
    member: interaction.member,
    preferredSlot
  });

  if (result.error) {
    const msgs = {
      'GAME_FULL': '❌ اللعبة ممتلئة!',
      'ALREADY_IN_GAME': '❌ أنت في اللعبة!',
      'PLAYER_IN_OTHER_GAME': '❌ أنت في لعبة أخرى!',
      'BUSY_TRY_AGAIN': '❌ جرب مرة أخرى',
      'GAME_ALREADY_STARTED': '❌ اللعبة بدأت!'
    };
    return interaction.followUp({ content: msgs[result.error] || '❌ خطأ', ephemeral: true });
  }

  const remaining = SessionService.getRemainingCountdown(result.session);
  return interaction.message.edit({
    embeds: [buildLobbyEmbed(result.session, remaining, result.session.countdownEndsAt)],
    components: buildLobbyComponents(result.session)
  });
}

async function handleLeave(interaction, session) {
  // Defer FIRST before any checks to prevent timeout
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }

  if (!session.players.some(p => p.userId === interaction.user.id)) {
    return interaction.followUp({ content: '❌ أنت لست في اللعبة!', ephemeral: true });
  }

  const result = await SessionService.leaveSession({
    session,
    userId: interaction.user.id
  });

  if (result.error) {
    return interaction.followUp({ content: '❌ خطأ', ephemeral: true });
  }

  const remaining = SessionService.getRemainingCountdown(result.session);
  return interaction.message.edit({
    embeds: [buildLobbyEmbed(result.session, remaining, result.session.countdownEndsAt)],
    components: buildLobbyComponents(result.session)
  });
}

async function handleShop(interaction, session) {
  const balance = await CurrencyService.getBalance(interaction.user.id);
  const player = session.players.find(p => p.userId === interaction.user.id);
  const ownedPerks = player?.perks || [];

  return safeReply(interaction, {
    embeds: [buildShopEmbed(session, balance, ownedPerks)],
    components: buildShopButtons(session, balance, ownedPerks),
    ephemeral: true
  });
}

async function handlePerkBuy(interaction, session, perkId) {
  const perk = getPerk(session.gameType, perkId);
  if (!perk) return safeReply(interaction, { content: '❌ ميزة غير متاحة', ephemeral: true });
  if (perk.showInShop === false) {
    return safeReply(interaction, {
      content: '❌ هذه الميزة لا يمكن شراؤها من المتجر',
      ephemeral: true
    });
  }

  if (perk.canBuyDuringGame === false && session.status !== 'WAITING') {
    return safeReply(interaction, {
      content: '❌ هذه الميزة يمكن شراؤها فقط قبل بدء اللعبة',
      ephemeral: true
    });
  }

  const player = session.players.find(p => p.userId === interaction.user.id);
  if (!player) return safeReply(interaction, { content: '❌ انضم أولاً!', ephemeral: true });
  if (player.perks.includes(perkId)) return safeReply(interaction, { content: '❌ لديك هذه الميزة!', ephemeral: true });

  const balance = await CurrencyService.getBalance(interaction.user.id);
  if (balance < perk.price) return safeReply(interaction, { content: '❌ رصيدك غير كافٍ', ephemeral: true });

  try {
    await CurrencyService.spendCoins(interaction.user.id, perk.price, 'PERK_PURCHASE', session.gameType, { sessionId: session.id, perkId });

    const updatedSession = await SessionService.addPlayerPerk(session, interaction.user.id, perkId);
    const newBal = await CurrencyService.getBalance(interaction.user.id);
    const updatedPlayer = updatedSession.players.find(p => p.userId === interaction.user.id);

    return safeUpdate(interaction, {
      embeds: [buildShopEmbed(updatedSession, newBal, updatedPlayer?.perks || [])],
      components: buildShopButtons(updatedSession, newBal, updatedPlayer?.perks || [])
    });
  } catch (e) {
    logger.error('Perk buy error:', e);
    return safeReply(interaction, { content: '❌ خطأ', ephemeral: true });
  }
}
