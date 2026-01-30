/**
 * Custom error classes for Ashy Bot
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const strings = require('../localization/ar.json');

function replaceAllSafe(text, token, value) {
  if (text == null) return text;
  return text.split(token).join(String(value));
}

export class AshyError extends Error {
  constructor(message, code, details = {}, userMessage = null) {
    super(message);
    Error.captureStackTrace?.(this, this.constructor);
    this.name = 'AshyError';
    this.code = code;
    this.details = details;
    this.userMessage = userMessage;
  }
}

export class BotError extends AshyError {
  constructor(message, userMessage = null, code = 'BOT_ERROR', details = {}) {
    const resolvedMessage = userMessage || strings.common.error;
    super(message, code, details, resolvedMessage);
    this.name = 'BotError';
  }
}

export class InsufficientBalanceError extends BotError {
  constructor(required, available) {
    super(
      `Insufficient balance: need ${required}, have ${available}`,
      replaceAllSafe(
        replaceAllSafe(strings.economy.insufficient_balance, '{needed}', required),
        '{have}',
        available
      ),
      'INSUFFICIENT_BALANCE',
      { required, available }
    );
    this.name = 'InsufficientBalanceError';
  }
}

export class CooldownError extends BotError {
  constructor(remainingSeconds) {
    super(
      `User on cooldown: ${remainingSeconds}s remaining`,
      replaceAllSafe(strings.common.cooldown, '{seconds}', remainingSeconds),
      'COOLDOWN',
      { remainingSeconds }
    );
    this.name = 'CooldownError';
  }
}

export class PermissionError extends BotError {
  constructor(permission = null) {
    super(
      `Missing permission: ${permission || 'unknown'}`,
      strings.common.no_permission,
      'NO_PERMISSION',
      { permission }
    );
    this.name = 'PermissionError';
  }
}

export class GameError extends BotError {
  constructor(type, details = {}) {
    super(`Game error: ${type}`, null, type, details);
    this.name = 'GameError';

    const messages = {
      'ALREADY_IN_GAME': strings.games.already_in_game,
      'GAME_IN_PROGRESS': strings.games.game_in_progress,
      'NOT_ENOUGH_PLAYERS': replaceAllSafe(strings.games.not_enough_players, '{min}', details.min || '?'),
      'GAME_FULL': replaceAllSafe(strings.games.game_full, '{max}', details.max || '?'),
      'NOT_IN_GAME': strings.games.not_in_game,
      'NOT_YOUR_TURN': strings.games.not_your_turn
    };

    this.userMessage = messages[type] || strings.common.error;
  }
}

export class ValidationError extends BotError {
  constructor(message, userMessage) {
    super(message, userMessage, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class UserNotEligibleError extends AshyError {
  constructor(reason, details = {}) {
    super(
      `User not eligible: ${reason}`,
      'NOT_ELIGIBLE',
      { reason, ...details }
    );
    this.name = 'UserNotEligibleError';
  }
}

export class InvalidAmountError extends AshyError {
  constructor(amount) {
    super(
      `Invalid amount: ${amount}`,
      'INVALID_AMOUNT',
      { amount }
    );
    this.name = 'InvalidAmountError';
  }
}

export class GameSessionError extends AshyError {
  constructor(message, code, details = {}) {
    super(message, code, details);
    this.name = 'GameSessionError';
  }
}

export class GameFullError extends AshyError {
  constructor(gameType, maxPlayers) {
    super(
      `Game ${gameType} is full (max: ${maxPlayers})`,
      'GAME_FULL',
      { gameType, maxPlayers }
    );
    this.name = 'GameFullError';
  }
}

export class NotEnoughPlayersError extends AshyError {
  constructor(gameType, minPlayers) {
    super(
      `Game ${gameType} needs at least ${minPlayers} players`,
      'NOT_ENOUGH_PLAYERS',
      { gameType, minPlayers }
    );
    this.name = 'NotEnoughPlayersError';
  }
}

export class GameInProgressError extends AshyError {
  constructor(channelId) {
    super(
      `A game is already in progress in channel ${channelId}`,
      'GAME_IN_PROGRESS',
      { channelId }
    );
    this.name = 'GameInProgressError';
  }
}
