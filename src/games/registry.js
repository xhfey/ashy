/**
 * Central game registry.
 *
 * Single source of truth for:
 * - Public visibility
 * - Runtime handlers (register/start/stop)
 * - /play command choices
 */

import { GAMES } from '../config/games.config.js';
import { isGameEnabledForGuild } from '../config/feature-flags.config.js';
import { getPublicGameIds } from './public-games.js';
import {
  registerDiceHandler,
  startDiceGame,
  cancelDiceGame,
  cancelDiceGameByChannel,
  getActiveGamesCount as getDiceActiveCount,
  getActiveGameByChannel as getDiceActiveByChannel
} from './dice/dice.game.js';
import { prewarmDiceAssets } from './dice/dice.images.js';
import {
  registerRouletteHandler,
  startRouletteGame,
  cancelRouletteGame,
  cancelRouletteGameByChannel,
  getActiveGamesCount as getRouletteActiveCount,
  getActiveGameByChannel as getRouletteActiveByChannel
} from './roulette/roulette.game.js';
import { prewarmWheelAssets } from './roulette/WheelGenerator.js';
import {
  registerMafiaHandler,
  startMafiaGame,
  cancelMafiaGame,
  cancelMafiaGameByChannel,
  getActiveGamesCount as getMafiaActiveCount,
  getActiveGameByChannel as getMafiaActiveByChannel
} from './mafia/mafia.game.js';
import { prewarmMafiaAssets } from './mafia/mafia.images.js';

function createNotImplementedModule(gameId) {
  const cfg = GAMES[gameId];
  return {
    id: gameId,
    publicEnabled: false,
    implemented: false,
    minPlayers: cfg?.minPlayers ?? 2,
    maxPlayers: cfg?.maxPlayers ?? 20,
    lobbyType: cfg?.lobbyType ?? 'SIMPLE',
    commandName: cfg?.command ?? gameId.toLowerCase(),
    label: `${cfg?.emoji || '🎮'} ${cfg?.name || gameId}`,
    registerHandlers() {},
    async start() { return false; },
    async stop() { return false; },
    async stopByChannel() { return false; },
    findByChannel() { return null; },
    getActiveCount() { return 0; },
    async prewarm() {},
  };
}

const publicGameSet = new Set(getPublicGameIds());

const modules = [
  {
    id: 'DICE',
    publicEnabled: publicGameSet.has('DICE'),
    implemented: true,
    minPlayers: GAMES.DICE.minPlayers,
    maxPlayers: GAMES.DICE.maxPlayers,
    lobbyType: GAMES.DICE.lobbyType,
    commandName: GAMES.DICE.command,
    label: `${GAMES.DICE.emoji} ${GAMES.DICE.name}`,
    registerHandlers: registerDiceHandler,
    start: startDiceGame,
    stop: cancelDiceGame,
    stopByChannel: cancelDiceGameByChannel,
    findByChannel: getDiceActiveByChannel,
    getActiveCount: getDiceActiveCount,
    prewarm: prewarmDiceAssets,
  },
  {
    id: 'ROULETTE',
    publicEnabled: publicGameSet.has('ROULETTE'),
    implemented: true,
    minPlayers: GAMES.ROULETTE.minPlayers,
    maxPlayers: GAMES.ROULETTE.maxPlayers,
    lobbyType: GAMES.ROULETTE.lobbyType,
    commandName: GAMES.ROULETTE.command,
    label: `${GAMES.ROULETTE.emoji} ${GAMES.ROULETTE.name}`,
    registerHandlers: registerRouletteHandler,
    start: startRouletteGame,
    stop: cancelRouletteGame,
    stopByChannel: cancelRouletteGameByChannel,
    findByChannel: getRouletteActiveByChannel,
    getActiveCount: getRouletteActiveCount,
    prewarm: prewarmWheelAssets,
  },

  // Hidden/unimplemented games stay registry-listed but publicDisabled
  createNotImplementedModule('RPS'),
  createNotImplementedModule('XO'),
  createNotImplementedModule('CHAIRS'),
  {
    id: 'MAFIA',
    publicEnabled: publicGameSet.has('MAFIA'),
    implemented: true,
    minPlayers: GAMES.MAFIA.minPlayers,
    maxPlayers: GAMES.MAFIA.maxPlayers,
    lobbyType: GAMES.MAFIA.lobbyType,
    commandName: GAMES.MAFIA.command,
    label: `${GAMES.MAFIA.emoji} ${GAMES.MAFIA.name}`,
    registerHandlers: registerMafiaHandler,
    start: startMafiaGame,
    stop: cancelMafiaGame,
    stopByChannel: cancelMafiaGameByChannel,
    findByChannel: getMafiaActiveByChannel,
    getActiveCount: getMafiaActiveCount,
    prewarm: prewarmMafiaAssets,
  },
  createNotImplementedModule('HIDESEEK'),
  createNotImplementedModule('REPLICA'),
  createNotImplementedModule('GUESS_COUNTRY'),
  createNotImplementedModule('HOT_XO'),
  createNotImplementedModule('DEATH_WHEEL'),
];

const moduleById = new Map(modules.map(m => [m.id, m]));

export function getGameModule(gameId) {
  return moduleById.get(gameId) || null;
}

export function getAllGameModules() {
  return [...modules];
}

export function getPublicPlayableGameModules() {
  return modules.filter(m => m.publicEnabled && m.implemented);
}

export function getPublicPlayChoices() {
  return getPublicPlayableGameModules().map(m => ({
    name: m.label,
    value: m.id,
  }));
}

export function isPlayableInGuild(gameId, guildId) {
  const mod = getGameModule(gameId);
  if (!mod || !mod.implemented || !mod.publicEnabled) {
    return { ok: false, reason: 'UNAVAILABLE' };
  }

  const enabled = isGameEnabledForGuild(gameId, guildId, true);
  if (!enabled) {
    return { ok: false, reason: 'ROLLOUT_DISABLED' };
  }

  return { ok: true, reason: null };
}

export function getRuntimeSnapshot() {
  return modules
    .filter(m => m.implemented)
    .map(m => ({
      gameId: m.id,
      activeCount: Number(m.getActiveCount?.() || 0),
      publicEnabled: !!m.publicEnabled,
    }));
}

export async function prewarmAssetsForImplementedGames() {
  const tasks = modules
    .filter(m => m.implemented && typeof m.prewarm === 'function')
    .map(m => m.prewarm());
  await Promise.allSettled(tasks);
}

export default {
  getGameModule,
  getAllGameModules,
  getPublicPlayableGameModules,
  getPublicPlayChoices,
  isPlayableInGuild,
  getRuntimeSnapshot,
  prewarmAssetsForImplementedGames,
};
