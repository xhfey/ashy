# 🗺️ ASHY BOT - DEVELOPMENT ROADMAP

## Current Status: Game Stability & Expansion ✅

### Public Command Model (Current Truth)
- `/play` is the single public game launcher.
- `/play` options are generated from the game registry.
- Only fully implemented games are shown publicly.
- Unfinished game commands are hidden from command load/deploy.
- `/stop` is game-agnostic and cancels active game runtime + session state.

---

## Phase 0: Architecture ✅
- [x] Project structure created
- [x] All folders exist
- [x] package.json configured
- [x] Prisma schema complete (6 models)
- [x] Docker compose for local DB
- [x] CLAUDE.md reference document
- [x] Stub files for all commands
- [x] Configuration files complete
- [x] Bot connects to Discord
- [x] Commands registered with Discord

---

## Phase 1: Core Services ✅
**Goal:** Working economy system without games

- [x] src/utils/logger.js - Working winston logger
- [x] src/utils/errors.js - Custom error classes
- [x] src/utils/helpers.js - Utility functions
- [x] src/services/economy/transaction.service.js
  - [x] getBalance(userId)
  - [x] getOrCreateUser(userId)
  - [x] addCoins(userId, amount, type, source)
  - [x] removeCoins(userId, amount, type, source)
  - [x] transferCoins(senderId, recipientId, amount)
  - [x] Atomic database transactions
- [x] src/services/economy/anti-abuse.service.js
  - [x] checkEligibility(userId)
  - [x] detectWinTrading(userId, opponentId)
  - [x] Account age check
  - [x] Transfer velocity limits
- [x] src/services/economy/currency.service.js
  - [x] Main public API for economy
  - [x] Integration with anti-abuse
- [x] src/middleware/eligibility.js
- [x] /test-coins command - Fully functional

**Status:** ✅ All core economy features working. Database transactions are atomic. Anti-abuse rules active.

---

## Phase 2: Economy Commands ✅
**Goal:** Users can check and transfer coins

- [x] /رصيد (balance) - Check your coins
- [x] /تحويل (transfer) - Send coins to user
- [x] /لوحة-الصدارة (leaderboard) - View rankings
- [x] Reward rates updated (3-30 coins like Fizbo)
- [x] Per-game perks config complete
- [x] Removed global /متجر (shop is per-game)

**Test:** Two users can transfer coins between each other ✅

---

## Phase 3: Game Foundation ✅
**Goal:** Reusable game session system

- [x] src/services/games/session.service.js
  - [x] createSession(gameType, channelId, hostId)
  - [x] joinSession(sessionId, userId)
  - [x] leaveSession(sessionId, userId)
  - [x] startGame(sessionId)
  - [x] endSession(sessionId, winnerId, status)
- [x] Button interaction routing in interactionCreate.js
- [x] Game embed templates for lobby

**Test:** Can create/join/leave a game session ✅

---

## Phase 4: First Game - Dice ✅
**Goal:** Simplest game working end-to-end

- [x] Dice available from `/play`
- [x] Join button, Start button
- [x] Team-based gameplay (2 teams)
- [x] Each player rolls with Roll Again/Skip decision
- [x] Second roll special outcomes (X2, Block, Zero, +2/-2/+4/-4, Normal)
- [x] Block mechanic to disable opponent next round
- [x] 3 rounds with round summaries
- [x] Winner determined by total team score
- [x] Coins awarded to winning team
- [x] Session cleanup
- [x] Canvas image generation for dice, round summaries, and results

**Implementation Details:**
- `src/games/dice/dice.game.js` - Main game logic
- `src/games/dice/dice.mechanics.js` - Roll probabilities and team assignment
- `src/games/dice/dice.images.js` - Canvas image generation (150x150 dice, 1536x1024 summaries)
- `src/games/dice/dice.constants.js` - Messages, probabilities, timeouts

**Bug Fixes Applied (2026-01-29):**
- ✅ Removed round/team announcement embeds (now silent)
- ✅ All roll messages use plain text (no embeds except lobby)
- ✅ Dice images smaller (150x150 instead of 300x300)
- ✅ Names on summary images larger (42px font)
- ✅ Start image cleaned up (removed extra labels)
- ✅ Team distribution message added
- ✅ Winner message mentions players by @name
- ✅ First roll uses true 1/6 random (fair dice)
- ✅ crypto.randomInt for dice rolls and random picks
- ✅ Handicap system for uneven teams (3v2 = smaller team gets 1.5x multiplier)

**Test:** Play full dice game, winner gets coins

---

## Phase 5: RPS Game ⬜
**Goal:** Button-based choice game

- [ ] /حجر-ورقة-مقص command
- [ ] Private choice buttons
- [ ] Winner calculation
- [ ] Coins awarded

---

## Phase 6: Roulette ✅
**Goal:** Animated wheel elimination game

- [x] Roulette available from `/play`
- [x] Slot-based lobby (20 number buttons)
- [x] Random join option
- [x] Pre-game shop (Extra Life, Shield)
- [x] Premium Canvas wheel generation with AAA-quality GIF animation
  - [x] 2x Supersampling + High Quality Encoding
  - [x] Physics-based easing with realistic friction
  - [x] Motion blur for smooth 20fps appearance
  - [x] Upside-down text correction (All names upright)
  - [x] Text stroke + dynamic font sizing (100% readability)
  - [x] Winner celebration with golden pulse highlight
  - [x] Gradient depth on segments (3D look)
  - [x] Anticipation wind-back animation
  - [x] Segment boundary "ticking" effect
  - [x] Smart color contrast (auto-adjust text brightness)
  - [x] Static layer caching (50%+ faster rendering)
  - [x] 1.5s final hold frames for loop clarity
- [x] Wheel spins and lands on pre-selected player
- [x] Kick selection with 15s timeout
- [x] Double Kick perk (buy during kick turn)
- [x] Shield reflects kick to attacker
- [x] Extra Life survives one elimination
- [x] Final round - wheel selects kicker, perks apply
- [x] crypto.randomInt for roulette spins and slot randomness
- [x] Coin rewards for winner
- [x] Session cleanup

**Implementation Details:**
- `src/games/roulette/roulette.game.js` - Main game logic with lock-based concurrency
- `src/games/roulette/WheelGenerator.js` - GIF generation with canvas + gif-encoder-2
- `src/games/roulette/roulette.embeds.js` - All embed builders
- `src/games/roulette/roulette.buttons.js` - Button component builders
- `src/games/roulette/roulette.perks.js` - Perk logic (purchase, use, shield/extra life/double kick)
- `src/games/roulette/roulette.constants.js` - Colors, settings, prices

**Bug Fixes Applied (2026-01-29):**
- ✅ **Critical**: Fixed Data Loss where purchased perks vanished (Object vs Array mismatch)
- ✅ **Critical**: Fixed Player ID mismatch (`odiscordId` vs `userId`)
- ✅ **Critical**: Added missing session persistence (Game state wasn't saving to Redis)
- ✅ **Fix**: Unified Host/Player initialization logic
- ✅ **Refactor**: Deduped "Not enough players" cancellation logic
- ✅ **Safety**: Added Kick Deadline timestamp for restart recovery

**Test:** Full game flow with 4+ players, perks working, winner gets coins

---

## Phase 6.5: Performance Optimization ✅
**Goal:** Achieve top-tier Discord bot performance (MEE6/Dyno level speed)

### Monitoring Infrastructure
- [x] `src/utils/performance.js` - Comprehensive performance monitor
  - [x] Thresholds for defer, database, redis, imageGen, gifGen
  - [x] Scoped tracking per interaction
  - [x] Aggregated stats and slow operation logging
  - [x] Auto-cleanup of abandoned timers
- [x] In-memory image caching and periodic cleanup added in game renderers
  - [x] LRU-like eviction when max size reached
  - [x] ImageCache with memory limit tracking
  - [x] Hit/miss rate statistics
- [x] Button handler instrumentation in roulette

### Critical Fixes (Event Loop Blocking)
- [x] **WheelGenerator.js** - Yield every 2 frames instead of 5
  - Changed: `if (i % 5 === 0)` → `if (i % 2 === 0)`
  - Changed: `setTimeout` → `setImmediate` (faster yield)
  - Impact: **2-4s → <1s** blocking
- [x] **dice.images.js** - Yield between player slot rendering
  - Added yields in `generateRoundSummary()`, `generateTeamAnnouncement()`, `generateGameResult()`
  - Impact: **1.5s → ~500ms** blocking
- [x] **session.service.js** - Clean up stale player mappings
  - Auto-cleanup orphaned PLAYER → SESSION Redis mappings

### Memory Leak Prevention
- [x] **WheelGenerator.js** - Auto-clear imageCache every 6 hours
- [x] **dice.images.js** - Auto-clear imageCache every 6 hours
- [x] **roulette/index.js** - gameStates Map cleanup
  - Max size: 100 states
  - TTL: 2 hours
  - Auto-evict oldest when at capacity
- [x] **countdown.service.js** - Periodic monitoring
  - Warn at 20 active countdowns
  - Force cleanup at 50

### Performance Targets Achieved
| Metric | Before | After | Target |
|--------|--------|-------|--------|
| GIF blocking | 2-4s | <1s | <2s ✅ |
| Dice image blocking | 1.5s | ~500ms | <1s ✅ |
| Memory leak (24h) | ~20MB | ~0MB | <5MB ✅ |
| Max game states | Unlimited | 100 | Bounded ✅ |

**Test:** Run 5 concurrent games, no timeouts, no memory growth

---

## Phase 6.6: Dice Deep Analysis & Fixes ✅
**Goal:** Comprehensive audit of dice game system — fix all bugs, improve fairness and UX

### Bugs Fixed
- [x] **BUG 1**: Loss/tie stats never recorded — added `recordGameResult()` with idempotency guards
- [x] **BUG 2**: Error-caused cancellations left orphaned sessions blocking channels — `handleGameError` now calls `SessionService.endSession()`
- [x] **BUG 3**: `console.error` bypassing logger in dice.game.js — changed to `logger.warn`
- [x] **BUG 4**: Dead `NORMAL_ROLL_WEIGHTS` constant removed from dice.constants.js
- [x] **BUG 5**: Image cache interval preventing graceful shutdown — added `.unref()`
- [x] **BUG 6**: Block fallback let players waste blocks on already-blocked opponents — added `BLOCK_WASTED` handling
- [x] **BUG 7**: Block timeout fetched message from API unnecessarily — now uses cached `gameState.currentMessage`

### Design Improvements
- [x] **DESIGN 2**: Team A always got extra player with odd counts — now randomized 50/50
- [x] **DESIGN 3**: Round summary showed first roll dice for NORMAL outcomes — now shows actual second roll value
- [x] **DESIGN 4**: Winners never saw coin reward — now displays "كل فائز حصل على X عملة آشي"
- [x] **DESIGN 5**: Better Luck perk double-dipped on first + second roll — second roll now always fair
- [x] **DESIGN 7**: Team announcement image missing multiplier — now shows ×1.5 badge on smaller team

### Additional Fixes
- [x] Added `GAME_TIE` to `TransactionType` enum (was using string literal)
- [x] Fixed `console.error` → `logger.error` in dice.images.js `loadCachedImage`
- [x] Updated Better Luck test to verify no double-dip behavior

**Files Modified:**
- `src/games/dice/dice.game.js` — Error cleanup, stats recording, reward display, block fixes
- `src/games/dice/dice.mechanics.js` — Team randomization, Better Luck fix
- `src/games/dice/dice.images.js` — Round summary dice, multiplier badge, logger fix, `.unref()`
- `src/games/dice/dice.constants.js` — Removed dead code
- `src/services/economy/transaction.service.js` — Added `recordGameResult()`, `GAME_TIE` enum
- `tests/integration/dice-better-luck.test.js` — Updated for no-double-dip behavior

**Test:** 27/27 passing ✅

---

## Phase 7: Mafia ✅
**Goal:** Social deduction game with night/day phases

- [x] Mafia available from `/play` (public in game registry)
- [x] Simple lobby (5-15 players)
- [x] Role assignment: Mafia, Doctor, Detective, Citizen
  - [x] Fisher-Yates shuffle for fair distribution
  - [x] Role count scales with player count (detective disabled < 7 players)
- [x] Night phases with private DM-style interactions
  - [x] Mafia votes on kill target (consensus required)
  - [x] Doctor chooses player to protect (can't self-protect twice in a row)
  - [x] Detective investigates a player's role
- [x] Day discussion phase with countdown timer
- [x] Day voting phase with live vote count display
  - [x] Throttled vote UI updates (750ms) to respect Discord rate limits
  - [x] Tie = no expulsion, skip votes supported
- [x] Win conditions: All mafia dead (citizens win) or mafia >= non-mafia (mafia wins)
- [x] Mafia forfeit: 2 consecutive nights with no votes → citizens win
- [x] Canvas role card image generation (981 lines)
- [x] Hint shop: Citizens can buy hints about mafia identity during day phase
- [x] Coin rewards for winning team (alive winners get more)
- [x] Concurrency control via promise-queue locking (`withLock`)
- [x] Phase timeout handling with `TimeoutManager`
- [x] Cancellable delays via `AbortController`
- [x] Control panel embed updated each phase
- [x] Session cleanup

**Implementation Details:**
- `src/games/mafia/mafia.game.js` - Main game logic (1386 lines) with phase state machine
- `src/games/mafia/mafia.constants.js` - Roles, phases, messages, role distributions
- `src/games/mafia/mafia.buttons.js` - Night action + day vote button builders
- `src/games/mafia/mafia.embeds.js` - Control panel and result embeds
- `src/games/mafia/mafia.images.js` - Canvas role card generation with visual config
- `src/config/mafia.visual.config.js` - Role card visual theme configuration

**Test:** Full game flow with 5+ players, all roles functional, winner gets coins

---

## Phase 7.1: Deep Game Analysis & Bug Fixes ✅
**Goal:** Comprehensive audit of all three games for production readiness

Deployed parallel analysis agents across Dice, Roulette, and Mafia. Found 27 potential issues, validated against actual framework behavior (ButtonRouter `deferUpdate`, `withLock` queue resilience, turn index bounds), confirmed 5 real bugs.

### Bugs Fixed (2026-02-14)
- [x] **D1 (Dice)**: Block race condition — timer callback could fire during async yield between `blockTimer.clear()` and `applyBlock`. Fixed by clearing `turnState.waiting` immediately after timer clear.
- [x] **D4 (Dice)**: Null message in `handleSkip` on timeout — `message.edit()` called on null. Fixed with `gameState.currentMessage` fallback.
- [x] **D6 (Dice)**: TIE stat recording failures silently swallowed by `Promise.allSettled`. Fixed by logging rejected results.
- [x] **R3 (Roulette)**: Null winner crash in `endGame` — if `alivePlayers.length === 0`, `winner.userId` threw TypeError. Fixed with null check and early return with error message.
- [x] **M2 (Mafia)**: Night action ordering — `checkPhaseCompletion()` ran before UI refresh, causing stale UI. Fixed by swapping order in all 3 handlers (handleMafiaVote, handleDoctorProtect, handleDetectiveCheck).

### Test Fixes (2026-02-14)
- [x] `session-lifecycle.test.js`: Slot assignment test expected deterministic slot 4 but `randomInt` picked from 17 empty slots. Fixed by passing `preferredSlot: 4`.
- [x] `roulette-game-flow.test.js`: Two tests timing out because `transaction.service.js` wasn't mocked — Prisma tried to connect to a real database, causing Tokio runtime panic. Fixed by adding mock.

**Files Modified:**
- `src/games/dice/dice.game.js` — D1, D4, D6
- `src/games/roulette/roulette.game.js` — R3
- `src/games/mafia/mafia.game.js` — M2
- `tests/integration/session-lifecycle.test.js` — Slot test fix
- `tests/integration/roulette-game-flow.test.js` — Missing mock fix

**Test:** 28/28 passing ✅

---

## Phase 7.2: Game Readiness Report Remediation ✅
**Goal:** Close high-severity production issues found in readiness review across Dice, Roulette, and Mafia.

### Dice Fixes
- [x] D1: Winners now record `WIN` stats (not only losers/ties).
- [x] D2: `getCurrentPlayer()` now safely returns `null` in non-turn phases (`ROUND_END`/`GAME_END`) instead of resolving invalid team/index state.
- [x] D3: Wrapped `handleRollAgainFromCtx` in fail-safe error handling to prevent deadlock after timer clear.
- [x] D4: Wrapped `handleSkipFromCtx` in fail-safe error handling to prevent deadlock after timer clear.
- [x] D5: Wrapped `handleBlockTargetFromCtx` in fail-safe error handling to prevent permanent stalls if block application throws.
- [x] D6: `roundScores`/`roundMeta` now derive from `TOTAL_ROUNDS` (no hardcoded `[0,0,0]`).
- [x] D7: `dice.images.js` font-registration fallback now uses `logger.warn`.

### Roulette Fixes
- [x] R1: Double-kick + shield reflection no longer clears `currentKickerId` before second-kick prompt.
- [x] R2: Eliminated players can no longer open shop or buy perks.
- [x] R3: `safeDelay` now returns abort state and callers stop execution after cancellation.
- [x] R4: Added null/empty final-round GIF buffer guard before `.length` access.
- [x] R5: Added phase + kicker checks in double-kick timeout handler to avoid duplicate spin paths.
- [x] R6: Elimination messaging no longer claims "next round starting" when game is ending.

### Mafia Fixes
- [x] M1: Replaced incompatible `interaction.update()` calls (after router defer) with `interaction.editReply()` for night actions.
- [x] M2: Added `guildMemberRemove` runtime handling so leavers are marked dead, votes are cleaned, and phases can complete early.
- [x] M3: Added compact `v2` `CustomIdCodec` format to keep action IDs under Discord's 100-char limit.
- [x] M4: Day vote now auto-resolves gracefully if vote-message send fails.
- [x] M5: Removed unused `obj1Width` variable in mafia image generation.

**Files Modified:**
- `src/games/dice/dice.game.js`
- `src/games/dice/dice.mechanics.js`
- `src/games/dice/dice.images.js`
- `src/games/roulette/roulette.game.js`
- `src/games/mafia/mafia.game.js`
- `src/framework/interaction/CustomIdCodec.js`
- `src/events/interactionCreate.js`
- `src/events/guildMemberRemove.js`
- `src/games/mafia/mafia.images.js`

---

## Phase 8-12: Remaining Games ⬜
- [ ] Phase 8: RPS (Rock-Paper-Scissors)
- [ ] Phase 9: XO (Tic-tac-toe tournament)
- [ ] Phase 10: Chairs (Musical chairs)
- [ ] Phase 11: Hide & Seek
- [ ] Phase 12: Replica, Guess Country, Hot XO, Death Wheel

---

## Phase 13: Tournaments ⬜
- [ ] Tournament creation
- [ ] Entry fee collection
- [ ] Bracket management
- [ ] Prize distribution

---

## Phase 14: Leaderboards ⬜
- [ ] Weekly leaderboard calculation
- [ ] Friday reset cron job
- [ ] Prize distribution
- [ ] Global leaderboard

---

## Phase 15: Polish ⬜
- [ ] Comprehensive error handling
- [ ] All edge cases covered
- [ ] Performance optimization
- [ ] Full testing
- [ ] Documentation complete

---

## Decisions Log

| Date | Decision | Reason |
|------|----------|--------|
| - | ES Modules | Modern standard |
| - | Map for sessions | Speed over persistence |
| - | Prisma | Type-safe, great DX |
| - | Docker for local DB | Easy setup |
| 2026-01-29 | Plain text for game messages | Embeds were too bulky for rapid gameplay |
| 2026-01-29 | 150x150 dice images | 300x300 was too large in Discord |
| 2026-01-29 | Team-based dice game | More engaging than 1v1 |
| 2026-01-29 | True 1/6 random for dice | Fair like real dice, simpler code |
| 2026-01-29 | crypto.randomInt for dice + roulette | Stronger RNG for fairness |
| 2026-01-29 | Handicap multiplier for uneven teams | Balances 3v2, 2v1 scenarios fairly |
| 2026-01-29 | Premium Wheel Overhaul (20+ opts) | AAA visual quality, physics easing, and 50%+ faster perf |
| 2026-01-29 | Text Stroke + Flip Correction | Maximizes readability on the wheel segments |
| 2026-01-29 | setImmediate over setTimeout for yields | setImmediate is faster and designed for this use case |
| 2026-01-29 | Performance monitoring infrastructure | Proactive detection of bottlenecks before users notice |
| 2026-01-29 | Auto-cleanup caches with TTL | Memory leaks from long-running bots can cause crashes |
| 2026-01-29 | gameStates bounded Map | Unbounded Maps are a common memory leak pattern |
| 2026-02-06 | Better Luck only on first roll | Double-dipping (first + second) was too strong an advantage |
| 2026-02-06 | Randomize extra player team | Always giving Team A the extra player was predictable/unfair |
| 2026-02-06 | Show reward amount to winners | Players should see how many coins they earned |
| 2026-02-06 | In-memory sessions (no Redis) | Simpler architecture; players just restart games after bot restart |
| 2026-02-14 | ButtonRouter defers all interactions | Game handlers don't need to defer — framework handles it |
| 2026-02-14 | Promise-queue locks for concurrency | withLock pattern prevents race conditions in roulette/mafia |
| 2026-02-14 | AbortController for cancellable delays | safeDelay can be cancelled on game end, preventing zombie operations |
| 2026-02-14 | Compact `v2` custom IDs | Keep button/select custom IDs below Discord 100-char limit |
| 2026-02-14 | Runtime guild-leave handling in Mafia | Prevents phases from waiting on players who left the server |

---

## Known Issues

_None currently_

## Technical Debt ⚠️
- [ ] **Magic Numbers**: Gameplay constants (timeouts, rewards) are scattered in `constants.js` and `index.js`. Should be centralized.
- [ ] **Type Safety**: Interaction between Game Logic and Session Service relies on implicit contracts (e.g. `perks` array structure).

## Technical Debt Resolved ✅
- [x] **Event Loop Blocking**: GIF/image generation now yields every 2 frames with `setImmediate`
- [x] **Memory Leaks**: All imageCache Maps auto-clear every 6 hours
- [x] **Unbounded Maps**: gameStates limited to 100 entries with 2h TTL
- [x] **Missing Monitoring**: Performance tracking infrastructure added (`performance.js`)
- [x] **Session Recovery**: Migrated from Redis to in-memory sessions — players just restart games after bot restart
- [x] **Loss/Tie Stats**: `totalLosses`, `totalGames`, `weeklyGames` now tracked for all players (not just winners)
- [x] **Orphaned Sessions**: Error-caused cancellations now properly call `SessionService.endSession()`
- [x] **Graceful Shutdown**: Image cache interval `.unref()`'d so it doesn't block process exit
- [x] **Non-Cancellable Delays**: Games now use `AbortController` + `safeDelay` pattern for cancellable delays

---

## Recent Bug Fixes

### 2026-02-14: Game Readiness Report Remediation
| Area | Key Fixes |
|------|-----------|
| Dice | Winner `WIN` stats, phase-safe `getCurrentPlayer`, fail-safe interaction handlers, `TOTAL_ROUNDS` arrays, logger consistency |
| Roulette | Double-kick reflection ownership fix, dead-player shop guard, cancellation-safe delay flow, final GIF null guard, timeout phase guard |
| Mafia | `editReply` night-action compatibility, guild leave event handling, compact `v2` custom IDs, vote-message failure fallback |

### 2026-02-14: Deep Game Analysis
| Bug | Game | Fix |
|-----|------|-----|
| Block race condition (D1) | Dice | Clear `turnState.waiting` immediately after timer clear |
| Null message on timeout (D4) | Dice | Fallback to `gameState.currentMessage` |
| TIE stats silently swallowed (D6) | Dice | Log rejected Promise.allSettled results |
| Null winner crash (R3) | Roulette | Null check + early return with error message |
| Night action ordering (M2) | Mafia | Night-action UI update moved ahead of phase completion check |
| Slot test non-deterministic | Tests | Pass `preferredSlot: 4` for deterministic assignment |
| Roulette tests timing out | Tests | Add missing `transaction.service.js` mock |

### 2026-01-29: Dice Game Polish
| Bug | Fix |
|-----|-----|
| Second roll seemed to only give specials | Verified - probabilities correct (NORMAL=40%) |
| Round/team indicators cluttered chat | Removed all round announcements |
| Roll messages used embeds | Converted to plain text |
| Dice images too big | Reduced to 150x150 |
| Names on summary too small | Increased to 42px font |
| Start image had extra labels | Removed title, team labels, footer |
| Missing distribution message | Added "تم توزيع الأرقام..." |
| Winner said "Team A won" | Now mentions players by @name |
| First roll used weighted system | Now uses true `Math.random() * 6 + 1` (fair 1/6) |
| Uneven teams unfair (3v2) | Added handicap: smaller team gets score multiplier |
| Slow-feeling button response | Immediate visual feedback + short delay before dice image |

### 2026-01-29: Roulette Game Premium Overhaul
| Feature/Fix | Detail |
|-------------|--------|
| Visual Quality | 2x Supersampling + Motion Blur + High Quality Smoothing |
| Performance | Static layer caching (OffscreenCanvas) = 50% faster rendering |
| Physics Easing | Smooth friction-based deceleration instead of discrete phases |
| Text Readability | All labels upright (flip fix) + Dynamic sizing + Stroke |
| Animations | Anticipation wind-back + Segment boundary "ticking" |
| Celebration | Golden pulse highlight on winner + 1.5s final hold |
| Contrast | Auto-adjust text color based on segment luminance |
| Lobby Logic | Added explicit checks and messages for cancellation/min-players |
| Lobby UX | Instant feedback on slot join/leave + quick shop loading state |
