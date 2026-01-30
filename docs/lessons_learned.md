# Lessons Learned - Ashy Bot Development

This document captures key insights and patterns discovered during development that should inform future work.

---

## Core Reliability & Data Integrity

### 1. Data Integrity & Persistence
**Bug:** Players lost purchased perks immediately after joining.  
**Cause:** Data structure mismatch between Game Logic (Object) and Session Service (Array). Redis serialization silently dropped Object properties on Arrays.  
**Fix:** Standardized `perks` as `Array<string>` across the entire stack.  
**Prevention:**
- **Rule #1:** Define shared data structures (Entities) in a central location.
- **Rule #2:** Use consistent types for collections (Array vs Map vs Object) across boundaries.
- **Rule #3:** Verify serialization compatibility for Redis-stored objects.

### 2. Naming Conventions (Identifiers)
**Bug:** Player lookups failed in some game logic flows.  
**Cause:** Inconsistent naming: `odiscordId` used in Roulette game vs `userId` in Session Service.  
**Fix:** Refactored entire codebase to standardize on `userId`.  
**Prevention:**
- **Rule #4:** Establish project-wide standard for IDs (e.g., always `userId`, never `discordId` or `uid`).
- **Rule #5:** Use TypeScript interfaces or JSDoc typedefs to enforce property names.

### 3. State Synchronization
**Bug:** Game state changes (eliminations, purchases) reverted or were lost.  
**Cause:** In-memory session object was modified but not written back to Redis.  
**Fix:** Implemented `saveSessionState()` and called it after every critical state mutation.  
**Prevention:**
- **Rule #6:** **"Write-Through" Pattern**: Any function modifying game state MUST ensure persistence or return the state to a handler that does.
- **Rule #7:** Never assume in-memory objects are synchronized with the database/cache.

### 4. Code Duplication & Consistency
**Bug:** Host initialization had different default values than joined players.  
**Cause:** Manual inline object creation in two different places (`startGame` vs `joinSession`).  
**Fix:** Unified initialization logic to ensure consistent schema (e.g. `perks: []`).  
**Prevention:**
- **Rule #8:** **Factory Pattern**: Use a single factory function (e.g., `createPlayer()`) for entity creation instead of inline object literals.

---

## Performance Optimization (Phase 6.5)

### 1. Event Loop Blocking in Canvas/GIF Generation

**Problem:** GIF generation with 85+ frames blocked the Node.js event loop for 2-4 seconds, causing:
- Discord "Interaction Failed" errors
- All other interactions delayed
- Perceived bot unresponsiveness

**Root Cause:** Synchronous canvas operations (`drawImage`, `fillRect`, gradient creation) inside tight loops without yielding.

**Solution:**
```javascript
// BAD: Yields every 5 frames with setTimeout
if (i % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0));

// GOOD: Yields every 2 frames with setImmediate
if (i % 2 === 0) await new Promise(resolve => setImmediate(resolve));
```

**Why setImmediate over setTimeout:**
- `setImmediate` executes after the current event loop iteration (designed for this)
- `setTimeout(fn, 0)` actually has a minimum delay (~4ms in browsers, ~1ms in Node)
- `setImmediate` is ~10x faster for yielding

**Lesson:** Any loop doing >10 canvas operations should yield every 2-3 iterations.

---

### 2. Memory Leaks from Unbounded Maps

**Problem:** Multiple `Map` objects grew indefinitely:
- `imageCache` in WheelGenerator.js and dice.images.js
- `gameStates` in roulette/index.js
- `activeCountdowns` in countdown.service.js

**Root Cause:** Data added to Maps but never removed, even after games ended.

**Solution Pattern:**
```javascript
// 1. Add TTL to entries
gameStates.set(sessionId, {
  ...data,
  createdAt: Date.now(),
});

// 2. Add max size limit
const MAX_SIZE = 100;

// 3. Cleanup on access (lazy)
if (map.size >= MAX_SIZE) {
  const now = Date.now();
  for (const [id, entry] of map) {
    if (now - entry.createdAt > TTL) {
      map.delete(id);
    }
  }
}

// 4. Periodic cleanup for caches
setInterval(() => {
  imageCache.clear();
}, 6 * 60 * 60 * 1000); // 6 hours
```

**Lesson:** Every `Map` or cache should have:
- Maximum size limit
- TTL for entries
- Cleanup mechanism (lazy, periodic, or both)

---

### 3. Performance Monitoring is Essential

**Problem:** Performance issues only discovered when users complained about timeouts.

**Solution:** Built `src/utils/performance.js` with:
- Threshold-based alerting
- Scoped tracking per interaction
- Aggregated statistics
- Slow operation logging

**Usage Pattern:**
```javascript
import Perf from '../utils/performance.js';

// Create scope for this interaction
const perf = Perf.createScope(interaction.id);

perf.start('defer', 'Button defer');
await interaction.deferUpdate();
perf.end('defer');

perf.start('gifGen', 'Wheel GIF');
const gif = await generateGif();
perf.end('gifGen');
```

**Lesson:** Add monitoring BEFORE problems occur. Define thresholds based on Discord's limits:
- Interaction response: 3 seconds
- Deferred interaction: 15 minutes
- Rate limits: 5 req/sec per endpoint

---

### 4. Redis Stale Data Cleanup

**Problem:** Player → Session mappings persisted after sessions ended, causing "Player in another game" errors.

**Solution:** Clean up stale mappings when detected:
```javascript
const existingSessionId = await redis.get(KEYS.PLAYER + user.id);
if (existingSessionId) {
  const session = await redis.get(KEYS.SESSION + existingSessionId);
  if (!session) {
    // Session gone, clean up stale mapping
    redis.del(KEYS.PLAYER + user.id).catch(() => {});
  }
}
```

**Lesson:** Always handle the case where referenced data no longer exists.

---

## Game Development Patterns

### 5. Immediate Defer for Button Handlers

**Problem:** Complex button handlers exceeded Discord's 3-second response limit.

**Solution:** Always defer first, then process:
```javascript
async handleButton(interaction, sessionId, action) {
  // FIRST: Acknowledge immediately
  await interaction.deferUpdate();

  // THEN: Do expensive work (DB, canvas, etc.)
  const session = await getSession(sessionId);
  // ...
}
```

**Lesson:** `deferUpdate()` should be the first line in every button handler.

---

### 6. Instant UI Feedback (Perceived Performance)

**Problem:** Users felt the bot was slow even when the backend was fast.  
**Solution:** Acknowledge the click immediately and update the UI first (button color/state), then do the heavier work (image generation, DB write) after a short delay.  
**Pattern:**
- Step 1: Fast visual confirmation (disable button, change color, “loading” state)
- Step 2: Perform the real work in the background

**Lesson:** Perceived speed matters as much as actual speed. Always separate “instant feedback” from “heavy work.”

---

### 7. Stale Click Guards

**Problem:** Old buttons in chat (from previous rounds) could trigger invalid actions.

**Solution:** Encode round/state in button customId:
```javascript
// Button ID format: action:target:round
customId: `kick:${targetId}:${currentRound}`

// In handler:
const [action, target, roundStr] = customId.split(':');
const round = parseInt(roundStr);

if (round !== localState.currentRound) {
  return interaction.followUp({
    content: '❌ This button is from an old round',
    ephemeral: true
  });
}
```

**Lesson:** Buttons should be self-validating with embedded state.

---

### 8. Concurrency Locks for Button Spam

**Problem:** Rapid button clicks could cause race conditions (double joins, duplicate kicks).

**Solution:** Use Redis locks:
```javascript
const lockKey = `lock:roulette:${sessionId}:${userId}`;
const acquired = await redis.acquireLock(lockKey, 2); // 2 second TTL

if (!acquired) {
  return; // User is spamming, ignore
}

try {
  // Process the action
} finally {
  redis.releaseLock(lockKey);
}
```

**Lesson:** Any multi-step operation on shared state needs locking.

---

## Canvas/Image Generation

### 9. Supersampling for Quality

**Problem:** Text and edges looked jagged on Discord's compression.

**Solution:** Render at 2x size, downsample to final:
```javascript
const RENDER_SCALE = 2;
const renderCanvas = createCanvas(WIDTH * RENDER_SCALE, HEIGHT * RENDER_SCALE);
const ctx = renderCanvas.getContext('2d');
ctx.scale(RENDER_SCALE, RENDER_SCALE);

// Draw at logical size...

// Downsample
const finalCanvas = createCanvas(WIDTH, HEIGHT);
finalCanvas.getContext('2d').drawImage(renderCanvas, 0, 0, WIDTH, HEIGHT);
```

**Trade-off:** 4x more pixels to process, but much better visual quality.

---

### 10. Static Layer Caching

**Problem:** Redrawing static elements (background, frame) every frame was wasteful.

**Solution:** Pre-render static elements once:
```javascript
async function createStaticLayers() {
  const [bgImg, frameImg] = await Promise.all([
    loadAsset('background.png'),
    loadAsset('frame.png')
  ]);

  const staticCanvas = createCanvas(WIDTH, HEIGHT);
  const ctx = staticCanvas.getContext('2d');
  ctx.drawImage(bgImg, 0, 0);
  ctx.drawImage(frameImg, 0, 0);

  return staticCanvas; // Reuse for every frame
}
```

**Lesson:** Identify what's static vs dynamic, pre-render static parts.

---

## Architecture Decisions

### 11. Map for Active State, Redis for Persistence

**Pattern:**
- **Map (in-memory):** Active game state that changes frequently (currentKickerId, timeouts)
- **Redis:** Session data that survives restarts (players, scores, status)

**Why:**
- Map access: ~0.01ms
- Redis access: ~1-5ms
- 100x+ difference matters in hot paths

**Lesson:** Use the right storage for the access pattern.

---

### 12. Fire-and-Forget for Non-Critical Operations

**Pattern:** Some operations don't need to block:
```javascript
// Don't await lock release
RedisService.releaseLock(lockKey); // Fire and forget

// Don't await cleanup of stale data
redis.del(staleKey).catch(() => {});

// Don't await logging
logger.info('Game ended'); // Already async internally
```

**Lesson:** Only `await` operations that affect the response to the user.

---

## Testing & Debugging

### 13. Log Operation Timings in Development

**Pattern:**
```javascript
if (process.env.NODE_ENV !== 'production') {
  console.time('gifGeneration');
  const gif = await generateGif();
  console.timeEnd('gifGeneration'); // "gifGeneration: 1847.23ms"
}
```

**Better:** Use the performance monitor:
```javascript
const id = Perf.start('gifGen', 'Wheel GIF');
const gif = await generateGif();
Perf.end(id); // Logs with threshold comparison
```

---

## Summary of Key Numbers

| Metric | Threshold | Reason |
|--------|-----------|--------|
| Button defer | <100ms | User expects instant feedback |
| Database query | <300ms | Keeps total interaction <3s |
| Redis operation | <150ms | Should be fast, network latency |
| Image generation | <500ms | Part of larger interaction |
| GIF generation | <2000ms | Complex, but still needs to fit in 15min |
| Total interaction | <2500ms | Leave buffer before Discord's 3s |
| Max game states | 100 | Prevent memory leaks |
| Cache TTL | 6 hours | Balance memory vs re-load cost |
| Game state TTL | 2 hours | Games shouldn't last longer |

---

*Last updated: 2026-01-29*
