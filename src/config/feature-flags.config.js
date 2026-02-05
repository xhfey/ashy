/**
 * Feature flags for staged game rollout.
 *
 * Env examples:
 * - DISABLED_GAMES=ROULETTE,MAFIA
 * - GAME_GUILD_ROLLOUT_JSON={"ROULETTE":{"allow":["1234567890"]},"DICE":{"deny":["9876543210"]}}
 */

import logger from '../utils/logger.js';

function parseJsonEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch (error) {
    logger.warn(`[FeatureFlags] Invalid JSON in ${name}: ${error.message}`);
    return fallback;
  }
}

const disabledGames = new Set(
  (process.env.DISABLED_GAMES || '')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
);

const gameRollout = parseJsonEnv('GAME_GUILD_ROLLOUT_JSON', {});

/**
 * Check whether a game is enabled in a guild.
 *
 * Rules:
 * 1) DISABLED_GAMES always disables.
 * 2) If rollout has deny list, denied guilds are blocked.
 * 3) If rollout has allow list, only allowed guilds are enabled.
 * 4) Otherwise defaultEnabled is used.
 */
export function isGameEnabledForGuild(gameId, guildId, defaultEnabled = true) {
  const gameKey = String(gameId || '').toUpperCase();
  if (!gameKey) return false;

  if (disabledGames.has(gameKey)) {
    return false;
  }

  const guildKey = String(guildId || '');
  const rollout = gameRollout[gameKey];
  if (!rollout) return defaultEnabled;

  const deny = new Set((rollout.deny || []).map(String));
  if (guildKey && deny.has(guildKey)) {
    return false;
  }

  const allow = Array.isArray(rollout.allow) ? rollout.allow.map(String) : null;
  if (allow && allow.length > 0) {
    return guildKey ? allow.includes(guildKey) : false;
  }

  return defaultEnabled;
}

export function getFeatureFlagsSnapshot() {
  return {
    disabledGames: Array.from(disabledGames),
    gameRollout,
  };
}

export default {
  isGameEnabledForGuild,
  getFeatureFlagsSnapshot,
};
