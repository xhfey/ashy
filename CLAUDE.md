# 🤖 ASHY BOT - AI DEVELOPER REFERENCE

> **ALWAYS READ THIS FIRST** before making any changes.

## Quick Start

```bash
# Install dependencies
npm install

# Start database (Docker required)
docker-compose up -d

# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Deploy commands to Discord
npm run deploy

# Start bot
npm run dev
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

See [.env.example](file:///c:/Users/Prese/Desktop/Ash%20bot/.env.example) for all required variables.


## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start bot with auto-reload |
| `npm start` | Production start |
| `npm run deploy` | Deploy slash commands to Discord |
| `npm test` | Run Jest tests |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema to database |
| `npm run db:migrate` | Run migrations |
| `npm run db:studio` | Open Prisma Studio GUI |
| `npm run db:reset` | Reset database (⚠️ destructive) |

## Project Overview

**Ashy Bot** is an Arabic Discord gaming bot with:
- `/play` as the public game hub entry point
- Fully implemented games: Dice + Roulette
- Hidden/unimplemented games kept off public launcher until ready
- Virtual currency (عملات آشي / Ashy Coins)
- Weekly leaderboards with prizes
- Anti-abuse/fraud detection

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 18+ (ES Modules) |
| Framework | Discord.js v14 |
| Database | PostgreSQL + Prisma |
| Images | node-canvas + sharp |
| Logging | winston |

## 🚨 CRITICAL RULES

### 1. Language Requirements
```javascript
// ✅ CORRECT - Arabic user-facing text
.setName('رصيد')
.setDescription('تحقق من رصيدك من عملات آشي')
await interaction.reply('✅ تم بنجاح!')

// ❌ WRONG - English user-facing text
.setName('balance')
.setDescription('Check your balance')
```

### 2. Currency Operations - ALWAYS Use Transactions
```javascript
// ✅ CORRECT - Atomic transaction
await prisma.$transaction([
  prisma.user.update({
    where: { id: senderId },
    data: { ashyCoins: { decrement: amount } }
  }),
  prisma.user.update({
    where: { id: recipientId },
    data: { ashyCoins: { increment: amount } }
  }),
  prisma.transaction.create({ data: { ... } })
]);

// ❌ WRONG - Separate operations (can cause inconsistency)
await prisma.user.update({ ... });
await prisma.user.update({ ... });
```

### 3. Error Handling - Keep It Local and Explicit

Use command-local validation with clear user replies and logger-backed diagnostics:

```javascript
import logger from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder(),

  async execute(interaction) {
    try {
      // ... command logic
    } catch (error) {
      logger.error('[MyCommand] Execute failed:', error);
      await interaction.reply({
        content: '❌ حدث خطأ غير متوقع',
        ephemeral: true
      });
    }
  }
};
```

### 4. Game Sessions
- Use **Map** for active games (speed > persistence)
- **One game per channel** at a time
- **Always cleanup** when game ends or times out

### 5. Discord Localization (Optional)
For bilingual support, use `localizeCommand()`:

```javascript
import { localizeCommand } from '../../utils/localization.js';

data: localizeCommand(
  new SlashCommandBuilder(),
  { ar: 'رصيد', en: 'balance' },
  { ar: 'تحقق من رصيدك', en: 'Check your balance' }
)
```

## File Organization

| Path | Purpose |
|------|---------|
| `src/commands/` | Slash command handlers |
| `src/services/` | Business logic (no Discord API) |
| `src/events/` | Discord.js event handlers |
| `src/middleware/` | Reusable checks (cooldown, permissions) |
| `src/utils/` | Pure utility functions |
| `src/config/` | Configuration constants |
| `src/localization/` | Arabic text strings |
| `docs/patterns/` | **Implementation patterns** (read `game-template.md` before building games!) |
| `docs/decisions/` | Architecture Decision Records (ADRs) |

## Command Structure

```javascript
// src/commands/games/example/index.js
import { SlashCommandBuilder } from 'discord.js';
import { localizeCommand } from '../../../utils/localization.js';
import strings from '../../../localization/ar.json' with { type: 'json' };

export default {
  data: localizeCommand(
    new SlashCommandBuilder(),
    { ar: 'اسم-الأمر', en: 'command-name' },
    { ar: 'وصف الأمر بالعربي', en: 'English description' }
  ),

  async execute(interaction) {
    try {
      await interaction.reply('...');
    } catch (error) {
      await interaction.reply({ content: strings.common.error, ephemeral: true });
    }
  },

  // Optional: Handle button clicks
  async handleButton(interaction, sessionId, action) {
    // Handle button action for this command/module
  }
};
```

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/unit/currency.test.js

# Run with coverage
npm test -- --coverage
```

**Test files location:**
- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/`

**Testing slash commands:**
1. Set `DISCORD_GUILD_ID` in `.env` to a test server
2. Commands deploy instantly to that server
3. Production deploys globally (takes ~1 hour)

## Anti-Abuse System

Located in `src/services/economy/` and `src/middleware/`:

| Protection | Location | Description |
|------------|----------|-------------|
| Cooldowns | `middleware/cooldown.js` | Rate limits per command per user |
| Eligibility | `middleware/eligibility.js` | Account age/verification checks |
| Transaction audit | `services/economy/` | All coin movements logged |
| Session limits | `services/games/` | One game per user/channel |

## Database Models

| Model | Purpose |
|-------|---------|
| User | Player profile, coin balance, eligibility |
| Transaction | Audit trail for all coin movements |
| GameStat | Per-game statistics per player |
| GameSession | Active game state |
| Tournament | Tournament metadata |
| TournamentEntry | Player tournament registrations |
| PerkPurchase | In-game power-up purchases |

## Games List & Status

| Game Type | Public via `/play` | Players | Status |
|-----------|---------------------|---------|--------|
| DICE | ✅ | 2-10 | ✅ Complete |
| ROULETTE | ✅ | 4-20 | ✅ Complete |
| RPS | ❌ | 2-20 | ⬜ Not Started |
| XO | ❌ | 2-6 | ⬜ Not Started |
| CHAIRS | ❌ | 4-20 | ⬜ Not Started |
| MAFIA | ❌ | 5-20 | ⬜ Not Started |
| HIDESEEK | ❌ | 4-20 | ⬜ Not Started |
| REPLICA | ❌ | 4-10 | ⬜ Not Started |
| GUESS_COUNTRY | ❌ | 2-8 | ⬜ Not Started |
| HOT_XO | ❌ | 2-6 | ⬜ Not Started |
| DEATH_WHEEL | ❌ | 3-4 | ⬜ Not Started |

## Perks System

| Perk | Arabic | Price | Effect |
|------|--------|-------|--------|
| Extra Life | حياة إضافية | 130 | Survive one elimination |
| Shield | درع | 200 | Reflect kick to attacker |
| Double Kick | طرد مرتين | 150 | Eliminate 2 players (buy during kick turn) |

## Weekly Leaderboard Rewards

| Place | Reward |
|-------|--------|
| 🥇 1st | 1,500 coins |
| 🥈 2nd | 700 coins |
| 🥉 3rd | 300 coins |

## Adding a New Feature

1. Check ROADMAP.md for current phase
2. Only work on current phase tasks
3. Follow patterns in existing code
4. Use Arabic for all user text
5. Keep command errors explicit with logger + user-friendly replies
6. Update ROADMAP.md when done
7. Update this status table if adding games
