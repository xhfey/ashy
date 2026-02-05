/**
 * TimeoutManager - Safe timeout handling for games
 *
 * Features:
 * - Automatic error wrapping for async callbacks
 * - Named timeout tracking
 * - Automatic cleanup
 * - Prevents timeout leaks
 *
 * Usage:
 * ```javascript
 * const timeouts = new TimeoutManager(logger, 'MyGame');
 *
 * // Set a timeout with automatic error handling
 * timeouts.set('turn', 30000, async () => {
 *   await handleTurnTimeout();
 * });
 *
 * // Clear specific timeout
 * timeouts.clear('turn');
 *
 * // Clear all timeouts (call on game end)
 * timeouts.clearAll();
 * ```
 */

export class TimeoutManager {
  /**
   * @param {Object} logger - Logger instance (winston)
   * @param {string} context - Context for logging (e.g., 'Dice', 'Roulette')
   */
  constructor(logger, context = 'Game') {
    this.timeouts = new Map();
    this.logger = logger;
    this.context = context;
  }

  /**
   * Set a named timeout with automatic error handling
   *
   * @param {string} key - Timeout identifier (e.g., 'turn', 'spin', 'block')
   * @param {number} ms - Delay in milliseconds
   * @param {Function} callback - Async or sync callback
   * @param {Function} [onError] - Optional custom error handler
   */
  set(key, ms, callback, onError = null) {
    // Clear existing timeout with same key
    this.clear(key);

    // Wrap callback with error handling
    const safeCallback = async () => {
      try {
        await callback();
      } catch (error) {
        this.logger.error(`[${this.context}] Timeout error (${key}):`, error);

        if (onError) {
          try {
            await onError(error);
          } catch (handlerError) {
            this.logger.error(`[${this.context}] Error handler failed (${key}):`, handlerError);
          }
        }
      }
    };

    // Create timeout
    const timeoutId = setTimeout(() => {
      // Remove from map when it fires
      this.timeouts.delete(key);
      // Execute safe callback (returns void, errors are caught)
      void safeCallback();
    }, ms);

    // Store timeout
    this.timeouts.set(key, timeoutId);

    this.logger.debug(`[${this.context}] Timeout set: ${key} (${ms}ms)`);
  }

  /**
   * Clear a specific timeout
   *
   * @param {string} key - Timeout identifier
   * @returns {boolean} - Whether timeout was cleared
   */
  clear(key) {
    const timeoutId = this.timeouts.get(key);

    if (timeoutId) {
      clearTimeout(timeoutId);
      this.timeouts.delete(key);
      this.logger.debug(`[${this.context}] Timeout cleared: ${key}`);
      return true;
    }

    return false;
  }

  /**
   * Check if a timeout exists
   *
   * @param {string} key - Timeout identifier
   * @returns {boolean}
   */
  has(key) {
    return this.timeouts.has(key);
  }

  /**
   * Clear all timeouts
   * Call this on game cleanup/end
   *
   * @returns {number} - Number of timeouts cleared
   */
  clearAll() {
    const count = this.timeouts.size;

    for (const [key, timeoutId] of this.timeouts.entries()) {
      clearTimeout(timeoutId);
      this.logger.debug(`[${this.context}] Timeout cleared: ${key}`);
    }

    this.timeouts.clear();

    if (count > 0) {
      this.logger.info(`[${this.context}] Cleared ${count} timeout(s)`);
    }

    return count;
  }

  /**
   * Get count of active timeouts
   * Useful for debugging/monitoring
   *
   * @returns {number}
   */
  count() {
    return this.timeouts.size;
  }

  /**
   * Get all active timeout keys
   * Useful for debugging
   *
   * @returns {string[]}
   */
  keys() {
    return Array.from(this.timeouts.keys());
  }
}
