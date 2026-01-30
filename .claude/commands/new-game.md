---
description: Wizard for creating a new game from scratch
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
argument-hint: [game name in Arabic]
---

# New Game: $ARGUMENTS

## Phase 1: Design 🎨

1. **Check existing games for patterns**
   ```bash
   ls -la src/commands/games/
   cat src/commands/games/نرد/index.js
   ```

2. **Gather requirements** (ASK the user):
   - How many players? (min-max)
   - Turn-based or real-time?
   - Skill, luck, or social deduction?
   - How long should a game take?
   - What's the win condition?

3. **Design the game loop**
   ```markdown
   ## Game Flow
   1. Lobby: [how players join]
   2. Setup: [initial state]
   3. Each Round: [what happens]
   4. End: [win condition]
   ```

4. **Plan the economy**
   - Entry fee: [X] عملات
   - Winner reward: [X] عملات
   - Participation: [X] عملات

5. **Wait for user approval** before coding!

## Phase 2: Scaffold 🏗️

6. **Create folder structure**
   ```bash
   mkdir -p src/commands/games/[game-name]
   ```

7. **Create files**:

   **index.js** - Command handler
   ```javascript
   import { SlashCommandBuilder } from 'discord.js';
   import { GameSession } from './GameSession.js';
   import strings from '../../../localization/ar.json' assert { type: 'json' };
   import logger from '../../../utils/logger.js';

   export default {
     data: new SlashCommandBuilder()
       .setName('[arabic-name]')
       .setDescription('[arabic-description]'),

     async execute(interaction) {
       try {
         // Implementation
       } catch (error) {
         logger.error('[Game] Error:', error);
         await interaction.reply({
           content: strings.common.error,
           ephemeral: true
         });
       }
     },

     async handleButton(interaction, sessionId, action) {
       // Button handling
     }
   };
   ```

   **GameSession.js** - State management
   ```javascript
   export class GameSession {
     static activeSessions = new Map();

     constructor(channelId, hostId) {
       this.channelId = channelId;
       this.hostId = hostId;
       this.players = new Map();
       this.state = 'lobby';
       this.createdAt = Date.now();
     }

     // Methods...
   }
   ```

   **embeds.js** - Discord embeds
   ```javascript
   import { EmbedBuilder } from 'discord.js';
   import strings from '../../../localization/ar.json' assert { type: 'json' };

   export function createLobbyEmbed(session) {
     return new EmbedBuilder()
       .setTitle(strings.games.[name].title)
       .setColor('#5865F2');
   }
   ```

## Phase 3: Implement 🔨

8. **Build in order**:
   - [ ] Lobby system (join/leave/start)
   - [ ] Game loop (turns/actions)
   - [ ] Win detection
   - [ ] Coin rewards
   - [ ] Session cleanup

9. **Add Arabic strings to localization**
   ```json
   {
     "games": {
       "[game-name]": {
         "title": "",
         "description": "",
         "join_button": "انضم",
         "start_button": "ابدأ",
         "your_turn": "دورك!",
         "winner": "الفائز: {player}",
         "timeout": "انتهى الوقت!"
       }
     }
   }
   ```

10. **Write tests**
    - Lobby edge cases
    - Game logic
    - Win conditions
    - Timeout handling

## Phase 4: Polish ✨

11. **Run all checks**
    ```bash
    npm test
    npm run lint
    ```

12. **Update ROADMAP.md**
    - Mark game as complete

13. **Update README.md**
    - Add to commands table

14. **Deploy command**
    ```bash
    npm run deploy
    ```

## Game Patterns Reference

### Lobby Pattern
```javascript
// One game per channel
if (GameSession.activeSessions.has(channelId)) {
  return interaction.reply({
    content: 'يوجد لعبة نشطة بالفعل في هذه القناة',
    ephemeral: true
  });
}
```

### Timeout Pattern
```javascript
this.timeout = setTimeout(() => {
  this.handleTimeout();
}, 60000);
```

### Cleanup Pattern
```javascript
destroy() {
  clearTimeout(this.timeout);
  GameSession.activeSessions.delete(this.channelId);
}
```
