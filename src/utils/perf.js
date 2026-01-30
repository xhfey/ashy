import logger from './logger.js';

export class Metrics {
  static timers = new Map();

  static start(id) {
    this.timers.set(id, Date.now());
  }

  static end(id, label = 'Operation') {
    if (!this.timers.has(id)) return 0;
    const duration = Date.now() - this.timers.get(id);

    logger.debug(`[⏱️ ${label}] ${duration}ms`);

    // Alert if >threshold (2s)
    if (duration > 2000) {
      logger.warn(`🚨 SLOW: ${label} took ${duration}ms`);
    }

    this.timers.delete(id);
    return duration;
  }
}

// Backward compatibility wrappers
export function startTimer(label) {
  const id = label + '_' + Math.random().toString(36).substr(2, 9);
  const now = Date.now();
  Metrics.start(id);
  // Keep 'start' for compatibility if existing code reads it manually
  return { id, label, start: now };
}

export function endTimer(timer) {
  if (!timer) return 0;

  if (timer.id) {
    return Metrics.end(timer.id, timer.label);
  } else if (timer.start) {
    // Fallback for legacy objects (shouldn't happen with new startTimer)
    const duration = Date.now() - timer.start;
    logger.debug(`[perf] ${timer.label || 'Unknown'}: ${duration}ms`);
    return duration;
  }
  return 0;
}
