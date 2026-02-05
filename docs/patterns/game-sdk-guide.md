# Game Development SDK Guide

> **Complete guide to building games with the Ashy Bot framework**

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [Framework Classes](#framework-classes)
4. [Building Your First Game](#building-your-first-game)
5. [Best Practices](#best-practices)
6. [Common Patterns](#common-patterns)
7. [Testing & Debugging](#testing--debugging)

---

## Quick Start

### Minimal Game Template

```javascript
// src/games/mygame/mygame.game.js

import { BaseGame } from '../../framework/BaseGame.js';
import { buttonRouter } from '../../framework/index.js';
import * as Embeds from './mygame.embeds.js';
import * as Buttons from './mygame.buttons.js';
import logger from '../../utils/logger.js';

// Store active games
const activeGames = new Map();

// 1. Register handler with ButtonRouter
export function registerMyGameHandler() {
  buttonRouter.register('MY_GAME', {
    onAction: handleAction
  });
  logger.info('[MyGame] Handler registered');
}

// 2. Main game class (extends BaseGame)
class MyGame extends BaseGame {
  async start() {
    await this.updatePhase('ACTIVE');
    await this.startRound();
  }

  async handleAction(ctx) {
    const { action, details } = ctx;

    switch (action) {
      case 'move':
        await this.handleMove(ctx, details);
        break;
    }
  }

  async startRound() {
    this.currentRound++;

    // Send round embed
    await this.sendMessage({
      embeds: [Embeds.createRoundEmbed(this.currentRound)]
    });

    // Set timeout for player action
    this.timeouts.set('turn', 30000, async () => {
      await this.handleTimeout();
    });
  }

  async handleMove(ctx, moveId) {
    const { player, interaction } = ctx;

    // Clear timeout
    this.timeouts.clear('turn');

    // Make move logic here...

    // Bump UI version to invalidate old buttons
    await ctx.commit();

    // Check for winner
    if (this.shouldEndGame()) {
      const winner = this.getWinner();
      const reward = await this.endGame(winner.userId);

      await this.sendMessage({
        content: `🏆 <@${winner.userId}> فاز بـ ${reward.reward} عملة!`
      });
    } else {
      await this.startRound();
    }
  }

  async handleTimeout() {
    // Handle player timeout...
    await this.sendError('انتهى الوقت!');
  }
}

// 3. Start game function (called by countdown service)
export async function startMyGame(session, channel) {
  const game = new MyGame('MY_GAME', session, channel);
  activeGames.set(session.id, game);

  try {
    await game.start();
  } catch (error) {
    logger.error('[MyGame] Start error:', error);
    game.cleanup();
    activeGames.delete(session.id);
    throw error;
  }
}

// 4. Button action handler
async function handleAction(ctx) {
  const game = activeGames.get(ctx.session.id);
  if (!game) return;

  try {
    await game.handleAction(ctx);
  } catch (error) {
    logger.error('[MyGame] Action error:', error);
    await ctx.interaction.followUp({
      content: '❌ حدث خطأ',
      ephemeral: true
    });
  }
}

// 5. Cancel function (for messageDelete.js)
export function cancelMyGame(sessionId) {
  const game = activeGames.get(sessionId);
  if (game) {
    game.cancelGame('MESSAGE_DELETED');
    activeGames.delete(sessionId);
  }
}
```

---

## Architecture Overview

### Framework Components

```
┌─────────────────────────────────────────┐
│           Your Game Class               │
│        (extends BaseGame)               │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────┐   ┌────────────────┐  │
│  │ TimeoutMgr  │   │  PlayerManager │  │
│  │             │   │                │  │
│  │ - set()     │   │ - get()        │  │
│  │ - clear()   │   │ - alive()      │  │
│  │ - clearAll()│   │ - eliminate()  │  │
│  └─────────────┘   └────────────────┘  │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │      BaseGame Methods           │   │
│  │                                 │   │
│  │ - endGame()                     │   │
│  │ - cancelGame()                  │   │
│  │ - cleanup()                     │   │
│  │ - sendMessage()                 │   │
│  │ - updatePhase()                 │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
           ↓ uses
┌─────────────────────────────────────────┐
│         Framework Services              │
│                                         │
│  • SessionManager  (Redis persistence)  │
│  • ButtonRouter    (Button handling)    │
│  • RewardsService  (Payouts)            │
└─────────────────────────────────────────┘
```

### Data Flow

1. **Game Start**: CountdownService → `startMyGame()` → `new MyGame()` → `game.start()`
2. **Button Click**: Discord → ButtonRouter → `handleAction(ctx)` → `game.handleAction(ctx)`
3. **Game End**: `game.endGame()` → RewardsService → SessionService
4. **Cleanup**: `game.cleanup()` → TimeoutManager.clearAll()

---

## Framework Classes

### 1. BaseGame

**Purpose**: Abstract base class for all games

**Key Methods**:

| Method | Description |
|--------|-------------|
| `start()` | **Abstract** - Implement to start your game |
| `handleAction(ctx)` | **Abstract** - Implement to handle button clicks |
| `endGame(winnerIds)` | Award winners and cleanup |
| `cancelGame(reason)` | Cancel without winners |
| `cleanup()` | Clear timeouts and resources |
| `sendMessage(options)` | Send message to game channel |
| `updatePhase(phase)` | Update session phase |
| `bumpUiVersion()` | Invalidate old buttons |

**Properties**:

| Property | Type | Description |
|----------|------|-------------|
| `gameType` | string | Game identifier ('DICE', 'ROULETTE') |
| `sessionId` | string | Redis session ID |
| `channel` | Channel | Discord channel object |
| `timeouts` | TimeoutManager | Timeout manager instance |
| `players` | PlayerManager | Player manager instance |
| `phase` | string | Current game phase |
| `currentRound` | number | Current round number |
| `customState` | object | Your custom game state |

### 2. TimeoutManager

**Purpose**: Safe timeout handling with automatic error wrapping

**Methods**:

```javascript
// Set a timeout
timeouts.set('turn', 30000, async () => {
  await handleTurnTimeout();
});

// Clear specific timeout
timeouts.clear('turn');

// Clear all timeouts
timeouts.clearAll();

// Check if timeout exists
if (timeouts.has('turn')) { ... }

// Get active count
const count = timeouts.count();
```

**Error Handling**: All callbacks are automatically wrapped with try-catch and logged.

### 3. PlayerManager

**Purpose**: Safe player state management

**Methods**:

```javascript
// Get player (throws if not found)
const player = players.get(userId);

// Find player (returns null if not found)
const player = players.find(userId);

// Check if player exists
if (players.has(userId)) { ... }

// Get by index
const player = players.byIndex(0);

// Get alive/dead players
const alive = players.alive();
const dead = players.dead();

// Get counts
const total = players.count();
const aliveCount = players.aliveCount();

// Eliminate/revive
players.eliminate(userId);
players.revive(userId);

// Perk management
players.addPerk(userId, 'SHIELD');
players.removePerk(userId, 'SHIELD');
if (players.hasPerk(userId, 'SHIELD')) { ... }

// Utility
const names = players.displayNames();
const ids = players.userIds();
```

### 4. Game Helpers (`utils/gameHelpers.js`)

**Validation Functions**:

```javascript
import {
  requireActiveTurn,
  requireAlivePlayers,
  requireGamePhase,
  requirePlayerInGame,
  requirePlayerAlive
} from '../../utils/gameHelpers.js';

// Throws GameError if validation fails
requireActiveTurn(player.id, gameState.currentPlayerId);
requireAlivePlayers(players, 2);
requireGamePhase(gameState.phase, 'PLAYING');
```

**Utility Functions**:

```javascript
import {
  delay,
  randomInt,
  randomPick,
  shuffle,
  getAlivePlayers,
  findPlayer,
  hasActivePerk,
  consumePerk
} from '../../utils/gameHelpers.js';

await delay(1000);
const roll = randomInt(1, 7); // 1-6
const winner = randomPick(players);
shuffle(deck);
```

### 5. Embed Helpers (`utils/embedHelpers.js`)

**Standard Embeds**:

```javascript
import {
  createGameEmbed,
  createWinnerEmbed,
  createEliminationEmbed,
  createRoundEmbed,
  createErrorEmbed,
  COLORS
} from '../../utils/embedHelpers.js';

// Base game embed
const embed = createGameEmbed('عنوان', 'وصف', COLORS.GAME);

// Winner announcement
const embed = createWinnerEmbed(winner, 50, 1000);

// Elimination
const embed = createEliminationEmbed(player, 'kicked');

// Round announcement
const embed = createRoundEmbed(3, 5);

// Error
const embed = createErrorEmbed('حدث خطأ!');
```

---

## Building Your First Game

### Step 1: Plan Your Game

Answer these questions:

1. **Game Rules**: What are the core mechanics?
2. **Player Count**: Min/max players?
3. **Phases**: What are the game phases? (e.g., WAITING, PLAYING, VOTING, FINAL_ROUND)
4. **Win Condition**: How does a player win?
5. **Timeout Behavior**: What happens if players don't respond?

### Step 2: Create File Structure

```
src/games/mygame/
├── mygame.game.js          # Main logic (BaseGame subclass)
├── mygame.embeds.js        # Embed builders
├── mygame.buttons.js       # Button builders
├── mygame.constants.js     # Config, messages, timeouts
└── README.md               # Game-specific docs
```

### Step 3: Define Constants

```javascript
// mygame.constants.js

export const MESSAGES = {
  GAME_START: '🎮 بدأت اللعبة!',
  YOUR_TURN: '▶️ دورك!',
  TIMEOUT: '⏱️ انتهى الوقت!',
  WINNER: (name) => `🏆 ${name} فاز!`
};

export const TURN_TIMEOUT_MS = 30000;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
```

### Step 4: Create Game Class

```javascript
// mygame.game.js

class MyGame extends BaseGame {
  constructor(session, channel) {
    super('MY_GAME', session, channel);

    // Initialize custom state
    this.customState = {
      deck: [],
      currentTurn: 0
    };
  }

  async start() {
    // 1. Update phase
    await this.updatePhase('PLAYING');

    // 2. Initialize game-specific state
    this.customState.deck = this.createDeck();

    // 3. Start first round
    await this.startRound();
  }

  async handleAction(ctx) {
    const { action, details, player, interaction } = ctx;

    // Validate it's player's turn
    requireActiveTurn(player.id, this.getCurrentPlayerId());

    // Handle action
    switch (action) {
      case 'draw':
        await this.handleDraw(ctx);
        break;
      case 'pass':
        await this.handlePass(ctx);
        break;
    }
  }

  async startRound() {
    // Implementation...
  }

  async handleDraw(ctx) {
    // Clear turn timeout
    this.timeouts.clear('turn');

    // Draw logic...

    // Bump UI version
    await ctx.commit();

    // Check end condition
    if (this.shouldEndGame()) {
      const winner = this.getWinner();
      await this.endGame(winner.userId);
      await this.sendWinnerMessage(winner);
    } else {
      await this.nextTurn();
    }
  }

  getCurrentPlayerId() {
    const alive = this.getAlivePlayers();
    return alive[this.customState.currentTurn % alive.length].userId;
  }
}
```

### Step 5: Create Embeds

```javascript
// mygame.embeds.js

import { createGameEmbed, COLORS } from '../../utils/embedHelpers.js';

export function createRoundEmbed(roundNumber) {
  return createGameEmbed(
    '🎮 جولة جديدة',
    `**الجولة ${roundNumber}**`,
    COLORS.GAME
  );
}

export function createTurnEmbed(player, timeRemaining) {
  return createGameEmbed(
    '▶️ دورك!',
    `<@${player.userId}>\n⏱️ ${timeRemaining} ثانية`,
    COLORS.PRIMARY
  );
}
```

### Step 6: Create Buttons

```javascript
// mygame.buttons.js

import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { codec } from '../../framework/index.js';

export function createGameButtons(session, options) {
  const sessionRef = {
    id: session.id,
    phase: session.phase,
    uiVersion: session.uiVersion
  };

  const drawBtn = new ButtonBuilder()
    .setCustomId(codec.forSession(sessionRef, 'draw'))
    .setLabel('اسحب بطاقة')
    .setStyle(ButtonStyle.Primary);

  const passBtn = new ButtonBuilder()
    .setCustomId(codec.forSession(sessionRef, 'pass'))
    .setLabel('تخطى')
    .setStyle(ButtonStyle.Secondary);

  return [new ActionRowBuilder().addComponents(drawBtn, passBtn)];
}
```

### Step 7: Register Handler

```javascript
// In game-runner.service.js

import { registerMyGameHandler } from '../games/mygame/mygame.game.js';

export function registerGameHandlers() {
  registerDiceHandler();
  registerRouletteHandler();
  registerMyGameHandler(); // Add your game
}
```

### Step 8: Add to messageDelete.js

```javascript
// In messageDelete.js

import { cancelMyGame } from '../games/mygame/mygame.game.js';

if (result.session?.gameType === 'MY_GAME') {
  cancelMyGame(result.session.id, 'MESSAGE_DELETED');
}
```

### Step 9: Add to GAMES config

```javascript
// src/config/games.js

export const GAMES = {
  // ...existing games
  MY_GAME: {
    type: 'MY_GAME',
    nameAr: 'لعبتي',
    nameEn: 'MyGame',
    minPlayers: 2,
    maxPlayers: 10,
    emoji: '🎮'
  }
};
```

---

## Best Practices

### ✅ DO

1. **Always extend BaseGame** for new games
2. **Use TimeoutManager** for all timeouts (automatic error handling)
3. **Use PlayerManager** for player lookups (prevents null errors)
4. **Clear timeouts before setting new ones**
5. **Call `ctx.commit()` after state changes** to invalidate old buttons
6. **Use validation helpers** (`requireActiveTurn`, etc.)
7. **Log important events** (start, end, errors)
8. **Clean up on errors** (use try-finally)
9. **Test timeout scenarios**
10. **Use Arabic for all user-facing text**

### ❌ DON'T

1. **Don't use raw setTimeout** - use TimeoutManager
2. **Don't access players array directly** - use PlayerManager
3. **Don't forget to clear timeouts**
4. **Don't skip `ctx.commit()` after changes**
5. **Don't use empty catch blocks** - always log
6. **Don't hardcode player lookups** - use helpers
7. **Don't skip error handling in timeout callbacks**
8. **Don't forget to add to messageDelete.js**
9. **Don't use English in user messages**
10. **Don't create games without cleanup functions**

---

## Common Patterns

### Pattern 1: Turn-Based Games

```javascript
class TurnBasedGame extends BaseGame {
  async startTurn() {
    const currentPlayer = this.getCurrentPlayer();

    // Send turn embed
    await this.sendMessage({
      embeds: [Embeds.createTurnEmbed(currentPlayer)],
      components: Buttons.createTurnButtons(this.session)
    });

    // Set timeout
    this.timeouts.set('turn', TURN_TIMEOUT_MS, async () => {
      await this.handleTurnTimeout(currentPlayer);
    });
  }

  async handleTurnAction(ctx) {
    // Clear timeout first
    this.timeouts.clear('turn');

    // Process action...

    // Next turn
    await this.nextTurn();
  }

  async nextTurn() {
    this.customState.currentTurn++;
    await this.startTurn();
  }
}
```

### Pattern 2: Elimination Games

```javascript
class EliminationGame extends BaseGame {
  async eliminatePlayer(userId, reason) {
    this.players.eliminate(userId);

    const player = this.players.get(userId);
    await this.sendMessage({
      embeds: [createEliminationEmbed(player, reason)]
    });

    // Check if game should end
    if (this.shouldEndGame()) {
      const winner = this.getWinner();
      await this.endGame(winner.userId);
    }
  }
}
```

### Pattern 3: Voting/Selection

```javascript
async handleVote(ctx, targetId) {
  const { player } = ctx;

  // Record vote
  this.customState.votes.set(player.id, targetId);

  // Check if all voted
  const alive = this.getAlivePlayers();
  if (this.customState.votes.size === alive.length) {
    await this.processVotes();
  }
}
```

---

## Testing & Debugging

### Manual Testing Checklist

- [ ] Game starts with minimum players
- [ ] Game starts with maximum players
- [ ] Timeout behavior works correctly
- [ ] Player elimination works
- [ ] Winner is declared correctly
- [ ] Rewards are awarded
- [ ] Message deletion cancels game
- [ ] No memory leaks (check activeGames Map)
- [ ] All buttons work
- [ ] Late button clicks are handled
- [ ] Arabic text displays correctly

### Debugging Tools

```javascript
// Monitor active games count
export function getActiveGamesCount() {
  return activeGames.size;
}

// Get timeout count
console.log('Active timeouts:', game.timeouts.count());
console.log('Timeout keys:', game.timeouts.keys());

// Check player state
console.log('Alive:', game.players.aliveCount());
console.log('Dead:', game.players.deadCount());
```

### Common Issues

**Issue**: Timeouts don't fire
- **Fix**: Make sure you're not clearing the wrong timeout

**Issue**: "Player not found" errors
- **Fix**: Use `players.find()` instead of `players.get()` if player might not exist

**Issue**: Memory leak (activeGames grows)
- **Fix**: Always call `cleanup()` in endGame/cancelGame

**Issue**: Duplicate payouts
- **Fix**: `endGame()` has built-in idempotency via rewardLedger

---

## Checklist for New Games

When creating a new game, ensure you:

- [ ] Extend `BaseGame` class
- [ ] Register handler in `game-runner.service.js`
- [ ] Add cancel handler to `messageDelete.js`
- [ ] Use `TimeoutManager` for all timeouts
- [ ] Call `awardGameWinners()` on completion (via `endGame()`)
- [ ] Add game type to `src/config/games.js`
- [ ] Test with 2 players
- [ ] Test with max players
- [ ] Test timeout scenarios
- [ ] Test message deletion during game
- [ ] Verify no memory leaks
- [ ] All user-facing text is in Arabic
- [ ] Add JSDoc comments
- [ ] Create game-specific README

---

## Need Help?

- Check existing games (Dice, Roulette) for reference implementations
- Review CLAUDE.md for project-wide patterns
- All classes have JSDoc comments with usage examples
- Test incrementally - don't build everything at once

**Happy game building! 🎮**
