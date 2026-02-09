/**
 * GameTimer - Shared timer utility for all games
 *
 * Wraps setTimeout with:
 * - Discord relative timestamp generation (<t:EPOCH:R>)
 * - Optional warning callback before expiry
 * - Idempotent clear()
 * - Auto .unref() to not block graceful shutdown
 */

import logger from './logger.js';

/** Maximum allowed timer duration (10 minutes). Guards against ms/s typos. */
const MAX_TIMER_MS = 10 * 60 * 1000;

export default class GameTimer {
  #mainTimeout = null;
  #warningTimeout = null;
  #startedAt = null;
  #deadlineEpochSeconds = 0;
  #firedOrCleared = false;

  /**
   * Create a Discord relative timestamp string from a deadline.
   * @param {number} deadlineMs - Deadline as Date.now()-style milliseconds
   * @returns {string} e.g. "<t:1707307200:R>"
   */
  static discordTimestamp(deadlineMs) {
    const epochSeconds = Math.floor(deadlineMs / 1000);
    return `<t:${epochSeconds}:R>`;
  }

  /**
   * Start the timer.
   * @param {number} durationMs - Duration in milliseconds
   * @param {Function} onExpire - Called when time runs out
   * @param {Object} [options]
   * @param {Function} [options.onWarning] - Called at warningMs before expiry
   * @param {number} [options.warningMs=5000] - When to fire warning (ms before deadline)
   * @param {string} [options.label='GameTimer'] - For logging
   * @returns {{ deadlineMs: number, discordTimestamp: string }}
   */
  start(durationMs, onExpire, options = {}) {
    const { onWarning, warningMs = 5000, label = 'GameTimer' } = options;

    if (durationMs > MAX_TIMER_MS) {
      throw new RangeError(
        `[${label}] Duration ${durationMs}ms exceeds max ${MAX_TIMER_MS}ms. Did you pass seconds instead of milliseconds?`
      );
    }

    // Clear any existing timer
    this.clear();

    this.#startedAt = Date.now();
    this.#firedOrCleared = false;

    const deadlineMs = this.#startedAt + durationMs;
    this.#deadlineEpochSeconds = Math.floor(deadlineMs / 1000);

    // Main timeout
    this.#mainTimeout = setTimeout(() => {
      this.#firedOrCleared = true;
      this.#mainTimeout = null;
      this.#warningTimeout = null;
      try {
        onExpire();
      } catch (err) {
        logger.error(`[${label}] Timer expire callback error:`, err);
      }
    }, durationMs);

    if (typeof this.#mainTimeout.unref === 'function') {
      this.#mainTimeout.unref();
    }

    // Warning timeout (only if duration > warningMs and callback provided)
    if (onWarning && durationMs > warningMs) {
      const warningDelay = durationMs - warningMs;
      this.#warningTimeout = setTimeout(() => {
        this.#warningTimeout = null;
        if (!this.#firedOrCleared) {
          try {
            onWarning(warningMs);
          } catch (err) {
            logger.error(`[${label}] Timer warning callback error:`, err);
          }
        }
      }, warningDelay);

      if (typeof this.#warningTimeout.unref === 'function') {
        this.#warningTimeout.unref();
      }
    }

    return {
      deadlineMs,
      discordTimestamp: GameTimer.discordTimestamp(deadlineMs),
    };
  }

  /** Idempotent cleanup — safe to call multiple times. */
  clear() {
    this.#firedOrCleared = true;
    if (this.#mainTimeout) {
      clearTimeout(this.#mainTimeout);
      this.#mainTimeout = null;
    }
    if (this.#warningTimeout) {
      clearTimeout(this.#warningTimeout);
      this.#warningTimeout = null;
    }
  }

  /** Milliseconds elapsed since start, or 0 if not started. */
  get elapsed() {
    if (!this.#startedAt) return 0;
    return Date.now() - this.#startedAt;
  }

  /** Whether the timer is currently running. */
  get isRunning() {
    return this.#mainTimeout !== null && !this.#firedOrCleared;
  }

  /** The deadline as a Discord timestamp string, or null if not started. */
  get timestampString() {
    if (!this.#deadlineEpochSeconds) return null;
    return `<t:${this.#deadlineEpochSeconds}:R>`;
  }
}
