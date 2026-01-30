# 🎮 Ashy Bot - آشي بوت

Arabic Discord gaming bot with 11 multiplayer games and virtual economy.

## ✨ Features

- 🎮 11 multiplayer games
- 💰 Virtual currency (Ashy Coins)
- 🏆 Weekly leaderboards
- 🛡️ Anti-abuse system
- 🎯 Tournament mode
- 🎡 Premium Roulette: AAA-quality GIF generator with 2x supersampling, physics-based easing, motion blur, and 20-slot lobby.
- 🎲 Dice rolls use crypto RNG with fair 1/6 distribution and team-based gameplay.
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
   - **Cause**: Bot restart left a session in memory/Redis.
   - **Fix**: Wait 2-3 minutes for the session TTL to expire, or use admin command (if implemented).

2. **Perks not saving**
   - **Cause**: Redis serialization issue (Fixed in v1.1).
   - **Fix**: Ensure your branch includes the "Perk Data Structure" fix.

3. **Wheel GIF fails to load**
   - **Cause**: Network timeout or high CPU load.
   - **Fallback**: The bot will send a text-based "Spinning..." message automatically.

## 🎮 Commands

| Command | Description |
|---------|-------------|
| /رصيد | Check your coin balance |
| /تحويل | Transfer coins to another user |
| /لوحة-الصدارة | View leaderboards |
| /نرد | Play Dice game |
| /روليت | Play Roulette game (Elimination) |
| /حجر-ورقة-مقص | Play Rock Paper Scissors |
| ... | And 8 more games! |

## 📈 Development Status

See `ROADMAP.md` for current progress.

Current Phase: **Phase 6.5 (Performance Optimization) - Completed** ✅
- All core economy services active
- Dice & Roulette games fully playable
- Anti-abuse system enabled
- **Performance optimizations applied:**
  - Event loop yielding in GIF/image generation (2-4s → <1s blocking)
  - Smart caching with auto-cleanup (prevents memory leaks)
  - Performance monitoring with thresholds
  - Game state cleanup with TTL and max size limits

## 🤖 For AI Developers

**Read `CLAUDE.md` before making any changes.**

## 📄 License

MIT
