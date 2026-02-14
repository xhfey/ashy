# 🎮 Ashy Bot - آشي بوت

Arabic Discord gaming bot with a `/play` game hub and production-focused reliability tooling.

## ✨ Features

- 🎮 `/play` hub (public games are loaded dynamically from registry)
- 🎲 Fully implemented: Dice, Roulette, Mafia
- 🧪 Unfinished games remain hidden until fully playable
- 💰 Virtual currency (Ashy Coins)
- 🏆 Weekly leaderboards
- 🛡️ Anti-abuse system
- 🩺 Admin diagnostics command for runtime health
- 🚩 Guild-based feature flags for staged game rollout
- 🎡 Premium Roulette: AAA-quality GIF generator with 2x supersampling, physics-based easing, motion blur, and 20-slot lobby.
- 🎲 Dice rolls use crypto RNG with fair 1/6 distribution and team-based gameplay.
- 🔫 Mafia: Social deduction with night/day phases, 4 roles (Mafia, Doctor, Detective, Citizen), canvas role cards, and hint shop.
- ⚡ Instant-feedback buttons for faster-feeling gameplay (dice decisions + lobby actions).

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Docker (for local database)
- Discord bot token

### Installation

1. **Clone and install:**
   ```bash
   git clone <your-repo>
   cd ashy-bot
   npm install
   ```

2. **Start database:**
   ```bash
   docker-compose up -d
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your Discord token
   ```

4. **Setup database:**
   ```bash
   npm run db:generate
   npm run db:push
   ```

5. **Deploy commands:**
   ```bash
   npm run deploy
   ```

6. **Start bot:**
   ```bash
   npm run dev
   ```

## 📁 Project Structure

See `CLAUDE.md` for complete documentation and `docs/lessons_learned.md` for development learnings.

## 🔧 Troubleshooting

### Common Issues
1. **"Game already in progress"**
   - **Cause**: Bot restart left a stale session in memory.
   - **Fix**: Restart the bot — in-memory sessions are cleared automatically. Players can just start a new game.

2. **Perks not saving**
   - **Cause**: Redis serialization issue (Fixed in v1.1).
   - **Fix**: Ensure your branch includes the "Perk Data Structure" fix.

3. **Wheel GIF fails to load**
   - **Cause**: Network timeout or high CPU load.
   - **Fallback**: The bot will send a text-based "Spinning..." message automatically.

4. **`canvas.node is not a valid Win32 application`**
   - **Cause**: `node_modules` was installed in a different OS/runtime (e.g., WSL install, then running from PowerShell).
   - **Fix**: Reinstall dependencies in the same shell/runtime you use to run the bot (`rm -rf node_modules package-lock.json && npm install`).

## 🎮 Commands

| Command | Description |
|---------|-------------|
| /play | Start a game from the hub |
| /stop | Stop the current game (host only) |
| /رصيد | Check your coin balance |
| /تحويل | Transfer coins to another user |
| /لوحة-الصدارة | View leaderboards |
| /diagnostics | Admin health snapshot (sessions, latency, memory, timers) |

## 📈 Development Status

See `ROADMAP.md` for current progress.

Current focus: **Game Stability & Expansion** ✅
- `/play` is the only public start path
- Three games live: Dice, Roulette, Mafia
- In-memory session management with proper cleanup on errors and cancellations
- Unified cancellation path used by `/stop`, countdown, and error recovery
- Atomic game reward + `GameStat` updates with idempotency guards
- Full win/loss/tie stats tracking for all players
- Weekly leaderboard reset + payout job enabled
- 28/28 integration tests passing

## 🛠️ Latest Stability Updates (2026-02-14)

- **Dice**: Winner `WIN` stats now recorded correctly, interaction handlers are fail-safe (`try/catch`), stale phase clicks no longer crash current-player lookup, and round arrays use `TOTAL_ROUNDS`.
- **Roulette**: Fixed double-kick + shield reflection turn ownership, blocked eliminated players from shop/purchases, made delay flow cancellation-safe (no post-cancel sends), added second-kick timeout phase guard, and hardened final GIF null checks.
- **Mafia**: Replaced post-defer `interaction.update()` calls with `editReply()`, added `guildMemberRemove` runtime handling so leave events can complete phases early, added compact `v2` custom IDs to stay under Discord's 100-char limit, and added day-vote fallback when vote message send fails.

## 🤖 For AI Developers

**Read `CLAUDE.md` before making any changes.**

### Core Guidelines
1. **Restart Policy**: Active games (Mafia, Roulette) are **CANCELLED** on bot restart. State is NOT saved to database (by design, to avoid zombie states).
2. **Timestamps**: Always use Discord `<t:EPOCH:R>` for countdowns. **NEVER** edit messages in a loop to update a timer.

## 📄 License

MIT
