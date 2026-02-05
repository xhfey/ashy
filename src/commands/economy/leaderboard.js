/**
 * /لوحة-الصدارة - View leaderboards
 */

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import prisma from '../../db/prisma.js';
import { formatNumber } from '../../utils/helpers.js';
import { GAMES, WEEKLY_REWARDS } from '../../config/games.config.js';
import config from '../../config/bot.config.js';
import logger from '../../utils/logger.js';

const ENABLE_CONSISTENCY_CHECK = process.env.LEADERBOARD_CONSISTENCY_CHECK === 'true';

export default {
  data: new SlashCommandBuilder()
    .setName('لوحة-الصدارة')
    .setDescription('عرض لوحة الصدارة')
    .addStringOption(option =>
      option
        .setName('النوع')
        .setDescription('نوع لوحة الصدارة')
        .setRequired(false)
        .addChoices(
          { name: '🌍 الأغنياء (عالمي)', value: 'global' },
          { name: '🎮 حجر ورقة مقص', value: 'RPS' },
          { name: '🎲 نرد', value: 'DICE' },
          { name: '🎡 روليت', value: 'ROULETTE' },
          { name: '⭕ إكس أو', value: 'XO' },
          { name: '💺 كراسي', value: 'CHAIRS' },
          { name: '🔫 مافيا', value: 'MAFIA' },
          { name: '👀 الغميضة', value: 'HIDESEEK' },
          { name: '📋 نسخة', value: 'REPLICA' },
          { name: '🌍 خمن الدولة', value: 'GUESS_COUNTRY' },
          { name: '🔥 إكس أو ساخن', value: 'HOT_XO' },
          { name: '☠️ عجلة الموت', value: 'DEATH_WHEEL' }
        )
    ),

  async execute(interaction) {
    try {
      const type = interaction.options.getString('النوع') || 'global';

      await interaction.deferReply();

      let embed;

      if (type === 'global') {
        embed = await buildGlobalLeaderboard(interaction.client);
      } else {
        embed = await buildGameLeaderboard(type, interaction.client);
      }

      // Add select menu for switching leaderboards
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('leaderboard_select')
        .setPlaceholder('اختر لوحة صدارة أخرى')
        .addOptions([
          { label: '🌍 الأغنياء (عالمي)', value: 'global', default: type === 'global' },
          { label: '🎮 حجر ورقة مقص', value: 'RPS', default: type === 'RPS' },
          { label: '🎲 نرد', value: 'DICE', default: type === 'DICE' },
          { label: '🎡 روليت', value: 'ROULETTE', default: type === 'ROULETTE' },
          { label: '⭕ إكس أو', value: 'XO', default: type === 'XO' },
          { label: '💺 كراسي', value: 'CHAIRS', default: type === 'CHAIRS' },
          { label: '🔫 مافيا', value: 'MAFIA', default: type === 'MAFIA' }
        ]);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      await interaction.editReply({ embeds: [embed], components: [row] });

    } catch (error) {
      logger.error('Leaderboard command error:', error);

      if (interaction.deferred) {
        await interaction.editReply({ content: '❌ حدث خطأ! حاول مرة أخرى.' });
      } else {
        await interaction.reply({ content: '❌ حدث خطأ! حاول مرة أخرى.', ephemeral: true });
      }
    }
  },

  /**
   * Handle select menu interaction
   */
  async handleSelectMenu(interaction) {
    try {
      const type = interaction.values[0];

      await interaction.deferUpdate();

      let embed;

      if (type === 'global') {
        embed = await buildGlobalLeaderboard(interaction.client);
      } else {
        embed = await buildGameLeaderboard(type, interaction.client);
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.error('Leaderboard select error:', error);
    }
  }
};

/**
 * Build global richest players leaderboard
 */
async function buildGlobalLeaderboard(client) {
  const users = await prisma.user.findMany({
    orderBy: { ashyCoins: 'desc' },
    take: 10
  });

  const medals = ['🥇', '🥈', '🥉'];
  let description = '';

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const medal = medals[i] || `\`${i + 1}.\``;

    // Try to get username from Discord
    let username = 'Unknown';
    try {
      const discordUser = await client.users.fetch(user.id);
      username = discordUser.displayName || discordUser.username;
    } catch (e) {
      username = `User ${user.id.slice(-4)}`;
    }

    description += `${medal} **${username}** — ${formatNumber(user.ashyCoins)} ${config.emojis.coin}\n`;
  }

  if (!description) {
    description = 'لا توجد بيانات بعد';
  }

  return new EmbedBuilder()
    .setColor(config.colors.gold)
    .setTitle('🌍 لوحة الصدارة — الأغنياء')
    .setDescription(description)
    .setFooter({ text: 'يتم التحديث كل ساعة' })
    .setTimestamp();
}

/**
 * Build weekly game leaderboard
 */
async function buildGameLeaderboard(gameType, client) {
  const game = GAMES[gameType];

  const stats = await prisma.gameStat.findMany({
    where: { gameType },
    orderBy: [
      { weeklyWins: 'desc' },
      { weeklyGames: 'desc' },
      { lastPlayed: 'asc' },
    ],
    take: 10
  });

  if (ENABLE_CONSISTENCY_CHECK) {
    await checkLeaderboardConsistency(gameType, stats);
  }

  const medals = ['🥇', '🥈', '🥉'];
  let description = '';

  for (let i = 0; i < stats.length; i++) {
    const stat = stats[i];
    const medal = medals[i] || `\`${i + 1}.\``;

    // Try to get username
    let username = 'Unknown';
    try {
      const discordUser = await client.users.fetch(stat.userId);
      username = discordUser.displayName || discordUser.username;
    } catch (e) {
      username = `User ${stat.userId.slice(-4)}`;
    }

    description += `${medal} **${username}** — ${stat.weeklyWins} فوز (${stat.weeklyGames} لعبة)\n`;
  }

  if (!description) {
    description = 'لا توجد بيانات بعد\nالعب لتظهر هنا!';
  }

  // Weekly rewards info (centralized from config)
  const rewardsInfo = `**جوائز نهاية الأسبوع:**\n🥇 ${formatNumber(WEEKLY_REWARDS[1] || 0)} | 🥈 ${formatNumber(WEEKLY_REWARDS[2] || 0)} | 🥉 ${formatNumber(WEEKLY_REWARDS[3] || 0)}`;

  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`${game?.emoji || '🎮'} لوحة الصدارة الأسبوعية — ${game?.name || gameType}`)
    .setDescription(description + '\n\n' + rewardsInfo)
    .setFooter({ text: 'يتم إعادة التعيين كل يوم جمعة' })
    .setTimestamp();
}

async function checkLeaderboardConsistency(gameType, stats) {
  if (!Array.isArray(stats) || stats.length === 0) return;

  const logicalIssues = stats.filter(
    s => s.weeklyWins > s.weeklyGames || s.totalWins > s.totalGames
  );
  if (logicalIssues.length > 0) {
    logger.warn(`[Leaderboard] Logical stat mismatch for ${gameType}`, {
      count: logicalIssues.length,
      users: logicalIssues.map(s => s.userId),
    });
  }

  // Check top rows against transaction history (sampled to limit cost).
  const sample = stats.slice(0, 3);
  const txCounts = await Promise.all(sample.map((stat) => prisma.transaction.count({
    where: {
      userId: stat.userId,
      type: 'GAME_WIN',
      source: gameType,
    },
  })));

  for (let i = 0; i < sample.length; i++) {
    const stat = sample[i];
    const txCount = txCounts[i];
    if (txCount < stat.totalWins) {
      logger.warn(`[Leaderboard] Transaction/stat drift detected for ${gameType}`, {
        userId: stat.userId,
        totalWins: stat.totalWins,
        txCount,
      });
    }
  }
}
