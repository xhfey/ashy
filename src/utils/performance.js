/**
 * Performance Monitor - Advanced Edition
 * Tracks operation timings, identifies bottlenecks, and logs slow operations.
 *
 * Usage:
 *   import Perf from './performance.js';
 *
 *   const perfId = Perf.start('gifGen', 'Wheel GIF generation');
 *   // ... do work ...
 *   Perf.end(perfId);
 */

import logger from './logger.js';

class PerformanceMonitor {
  constructor() {
    this.timers = new Map();
    this.slowOps = [];
    this.stats = new Map(); // Aggregated stats per operation type

    // Thresholds in milliseconds - operations exceeding these are flagged
    this.thresholds = {
      defer: 100,           // Button defer should be <100ms
      database: 300,        // DB queries <300ms
      redis: 150,           // Redis operations <150ms
      imageGen: 500,        // Static image generation <500ms
      gifGen: 2000,         // GIF generation <2s (roulette wheel)
      canvasRender: 300,    // Canvas rendering <300ms
      totalInteraction: 2500, // Total interaction handling <2.5s
      buttonHandler: 1000,  // Button handler total <1s
      sessionFetch: 200,    // Session fetch <200ms
      lobbyUpdate: 500,     // Lobby message update <500ms
    };

    // Max slow ops to keep in memory
    this.maxSlowOps = 100;

    // Auto-cleanup interval (clear old timers every 5 minutes)
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Start timing an operation
   * @param {string} type - Operation type (must match a threshold key)
   * @param {string} label - Human-readable label for logging
   * @param {object} meta - Optional metadata
   * @returns {string} - Timer ID to pass to end()
   */
  start(type, label = type, meta = {}) {
    const id = `${type}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    this.timers.set(id, {
      type,
      label,
      start: Date.now(),
      meta,
    });

    return id;
  }

  /**
   * End timing and log if slow
   * @param {string} id - Timer ID from start()
   * @returns {number} - Duration in milliseconds
   */
  end(id) {
    const timer = this.timers.get(id);
    if (!timer) {
      logger.warn(`[Perf] Unknown timer ID: ${id}`);
      return 0;
    }

    const duration = Date.now() - timer.start;
    const threshold = this.thresholds[timer.type] || 1000;

    // Update aggregated stats
    this.updateStats(timer.type, duration);

    // Log based on severity
    if (duration > threshold * 2) {
      // CRITICAL: More than 2x threshold
      logger.error(`🔴 CRITICAL SLOW [${timer.label}]: ${duration}ms (threshold: ${threshold}ms)`, {
        type: timer.type,
        duration,
        threshold,
        meta: timer.meta,
      });
      this.recordSlowOp(timer, duration, 'critical');
    } else if (duration > threshold) {
      // WARNING: Exceeds threshold
      logger.warn(`🟡 SLOW [${timer.label}]: ${duration}ms (threshold: ${threshold}ms)`, {
        type: timer.type,
        duration,
      });
      this.recordSlowOp(timer, duration, 'warning');
    } else if (process.env.NODE_ENV !== 'production') {
      // Debug: Normal operation (dev only)
      logger.debug(`✅ [${timer.label}]: ${duration}ms`);
    }

    this.timers.delete(id);
    return duration;
  }

  /**
   * Record a slow operation for later analysis
   */
  recordSlowOp(timer, duration, severity) {
    this.slowOps.push({
      type: timer.type,
      label: timer.label,
      duration,
      threshold: this.thresholds[timer.type] || 1000,
      severity,
      timestamp: new Date().toISOString(),
      meta: timer.meta,
    });

    // Trim if exceeds max
    if (this.slowOps.length > this.maxSlowOps) {
      this.slowOps = this.slowOps.slice(-this.maxSlowOps);
    }
  }

  /**
   * Update aggregated statistics for an operation type
   */
  updateStats(type, duration) {
    if (!this.stats.has(type)) {
      this.stats.set(type, {
        count: 0,
        totalMs: 0,
        minMs: Infinity,
        maxMs: 0,
        avgMs: 0,
        slowCount: 0,
      });
    }

    const stat = this.stats.get(type);
    stat.count++;
    stat.totalMs += duration;
    stat.minMs = Math.min(stat.minMs, duration);
    stat.maxMs = Math.max(stat.maxMs, duration);
    stat.avgMs = Math.round(stat.totalMs / stat.count);

    if (duration > (this.thresholds[type] || 1000)) {
      stat.slowCount++;
    }
  }

  /**
   * Get recent slow operations
   * @param {number} limit - Max number to return
   * @returns {Array} - Recent slow operations
   */
  getSlowOps(limit = 50) {
    return this.slowOps.slice(-limit);
  }

  /**
   * Get aggregated statistics
   * @returns {Object} - Stats by operation type
   */
  getStats() {
    const result = {};
    for (const [type, stat] of this.stats) {
      result[type] = {
        ...stat,
        slowRate: stat.count > 0 ? `${((stat.slowCount / stat.count) * 100).toFixed(1)}%` : '0%',
      };
    }
    return result;
  }

  /**
   * Get a summary report
   * @returns {string} - Formatted report
   */
  getReport() {
    const stats = this.getStats();
    const recentSlow = this.getSlowOps(10);

    let report = '=== PERFORMANCE REPORT ===\n\n';

    report += '📊 OPERATION STATS:\n';
    for (const [type, stat] of Object.entries(stats)) {
      const threshold = this.thresholds[type] || 1000;
      const status = stat.avgMs > threshold ? '🔴' : stat.avgMs > threshold * 0.7 ? '🟡' : '🟢';
      report += `${status} ${type}: avg=${stat.avgMs}ms, max=${stat.maxMs}ms, count=${stat.count}, slow=${stat.slowRate}\n`;
    }

    if (recentSlow.length > 0) {
      report += '\n🐌 RECENT SLOW OPERATIONS:\n';
      for (const op of recentSlow) {
        report += `  - [${op.severity}] ${op.label}: ${op.duration}ms (${op.timestamp})\n`;
      }
    }

    return report;
  }

  /**
   * Cleanup old/abandoned timers
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [id, timer] of this.timers) {
      if (now - timer.start > maxAge) {
        logger.warn(`[Perf] Abandoned timer cleaned up: ${timer.label} (started ${Math.round((now - timer.start) / 1000)}s ago)`);
        this.timers.delete(id);
      }
    }
  }

  /**
   * Reset all stats (useful for testing)
   */
  reset() {
    this.timers.clear();
    this.slowOps = [];
    this.stats.clear();
  }

  /**
   * Measure an async function
   * @param {string} type - Operation type
   * @param {string} label - Human-readable label
   * @param {Function} fn - Async function to measure
   * @returns {Promise<any>} - Result of fn()
   */
  async measure(type, label, fn) {
    const id = this.start(type, label);
    try {
      return await fn();
    } finally {
      this.end(id);
    }
  }

  /**
   * Create a scoped performance tracker for a specific interaction
   * @param {string} interactionId - Discord interaction ID
   * @returns {Object} - Scoped tracker with start/end methods
   */
  createScope(interactionId) {
    const prefix = interactionId.substring(0, 8);
    const timers = new Map();
    const self = this;

    return {
      start(type, label) {
        const id = self.start(type, `[${prefix}] ${label}`);
        timers.set(type, id);
        return id;
      },
      end(type) {
        const id = timers.get(type);
        if (id) {
          timers.delete(type);
          return self.end(id);
        }
        return 0;
      },
      endAll() {
        for (const [type, id] of timers) {
          self.end(id);
        }
        timers.clear();
      },
    };
  }
}

// Singleton instance
const Perf = new PerformanceMonitor();

export default Perf;

// Named exports for convenience
export const { start, end, measure, getStats, getReport, getSlowOps, createScope } = {
  start: Perf.start.bind(Perf),
  end: Perf.end.bind(Perf),
  measure: Perf.measure.bind(Perf),
  getStats: Perf.getStats.bind(Perf),
  getReport: Perf.getReport.bind(Perf),
  getSlowOps: Perf.getSlowOps.bind(Perf),
  createScope: Perf.createScope.bind(Perf),
};
