import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import * as RedisService from '../../services/redis.service.js';
import * as SessionService from '../../services/games/session.service.js';
import * as CountdownService from '../../services/games/countdown.service.js';
import { getFeatureFlagsSnapshot } from '../../config/feature-flags.config.js';
import { getWeeklyResetStatus } from '../../services/economy/weekly-reset.service.js';
import logger from '../../utils/logger.js';

function formatMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('diagnostics')
    .setDescription('عرض حالة النظام الحالية')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const [
        redisLatency,
        waitingSessions,
        activeSessions,
      ] = await Promise.all([
        RedisService.testConnection(),
        SessionService.getAllWaitingSessions(),
        SessionService.getAllActiveSessions(),
      ]);

      let runtime = [];
      let runtimeUnavailable = false;
      try {
        const { getGameRuntimeSnapshot } = await import('../../services/games/game-runner.service.js');
        runtime = getGameRuntimeSnapshot();
      } catch (error) {
        runtimeUnavailable = true;
        logger.warn('[Diagnostics] Runtime snapshot unavailable:', error?.message || error);
      }
      const countdownIds = CountdownService.getActiveCountdownIds();
      const mem = process.memoryUsage();
      const weekly = getWeeklyResetStatus();
      const flags = getFeatureFlagsSnapshot();

      const runtimeText = runtime.length
        ? runtime.map(r => `${r.gameId}: ${r.activeCount}`).join(' | ')
        : runtimeUnavailable ? 'Unavailable' : 'None';

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🩺 Diagnostics')
        .addFields(
          { name: 'Redis Latency', value: `${redisLatency}ms`, inline: true },
          { name: 'Countdown Timers', value: String(countdownIds.length), inline: true },
          { name: 'Uptime', value: `${Math.floor(process.uptime())}s`, inline: true },
          { name: 'Waiting Sessions', value: String(waitingSessions.length), inline: true },
          { name: 'Active Sessions', value: String(activeSessions.length), inline: true },
          { name: 'Runtime Games', value: runtimeText, inline: false },
          {
            name: 'Memory',
            value: `rss ${formatMb(mem.rss)} | heapUsed ${formatMb(mem.heapUsed)} | heapTotal ${formatMb(mem.heapTotal)}`,
            inline: false
          },
          {
            name: 'Weekly Reset',
            value: `scheduled=${weekly.scheduled} cron=${weekly.cron} tz=${weekly.timezone}\nlastRun=${weekly.lastRunAt || 'never'} period=${weekly.lastPeriodKey || 'n/a'} payouts=${weekly.lastPayoutCount} rows=${weekly.lastResetCount}`,
            inline: false
          },
          {
            name: 'Feature Flags',
            value: `disabledGames=${flags.disabledGames.join(',') || 'none'}`,
            inline: false
          }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('[Diagnostics] Command failed:', error);
      await interaction.editReply({ content: '❌ فشل جلب التشخيص' });
    }
  }
};
