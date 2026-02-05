# Game Implementation Patterns

## Standard Game Structure

Every game follows this folder structure:

```
src/commands/games/[game-name]/
├── index.js          # Slash command & button handler
├── GameSession.js    # Game state class
├── embeds.js         # Discord embed builders
└── utils.js          # Game-specific helpers (optional)
```

## GameSession Pattern

```javascript
export class GameSession {
  // Class-level storage for all active sessions
  static activeSessions = new Map();
  
  constructor(channelId, hostId, options = {}) {
    this.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.channelId = channelId;
    this.hostId = hostId;
    this.players = new Map(); // discordId -> playerData
    this.state = 'lobby'; // lobby | playing | ended
    this.createdAt = Date.now();
    this.timeout = null;
    
    // Game-specific options
    this.minPlayers = options.minPlayers || 2;
    this.maxPlayers = options.maxPlayers || 10;
    
    // Register this session
    GameSession.activeSessions.set(channelId, this);
  }
  
  // Check if channel already has a game
  static hasActiveGame(channelId) {
    return GameSession.activeSessions.has(channelId);
  }
  
  // Get session by channel
  static getByChannel(channelId) {
    return GameSession.activeSessions.get(channelId);
  }
  
  // Add player to lobby
  addPlayer(discordId, displayName) {
    if (this.state !== 'lobby') {
      throw new Error('اللعبة بدأت بالفعل');
    }
    if (this.players.size >= this.maxPlayers) {
      throw new Error('اللعبة ممتلئة');
    }
    if (this.players.has(discordId)) {
      throw new Error('أنت موجود بالفعل');
    }
    
    this.players.set(discordId, {
      id: discordId,
      name: displayName,
      joinedAt: Date.now()
    });
    
    return true;
  }
  
  // Remove player
  removePlayer(discordId) {
    return this.players.delete(discordId);
  }
  
  // Start the game
  start() {
    if (this.players.size < this.minPlayers) {
      throw new Error(`يجب أن يكون هناك ${this.minPlayers} لاعبين على الأقل`);
    }
    
    this.state = 'playing';
    this.startedAt = Date.now();
    
    // Set game timeout (e.g., 10 minutes max)
    this.timeout = setTimeout(() => {
      this.handleTimeout();
    }, 10 * 60 * 1000);
  }
  
  // Handle game timeout
  handleTimeout() {
    this.state = 'ended';
    this.endReason = 'timeout';
    // Cleanup will be called separately
  }
  
  // End the game
  end(winnerId = null) {
    this.state = 'ended';
    this.winnerId = winnerId;
    this.endedAt = Date.now();
  }
  
  // Cleanup - ALWAYS call this when game ends
  destroy() {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    GameSession.activeSessions.delete(this.channelId);
  }
}
```

## Command Handler Pattern

```javascript
import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { GameSession } from './GameSession.js';
import { createLobbyEmbed, createGameEmbed, createEndEmbed } from './embeds.js';
import strings from '../../../localization/ar.json' with { type: 'json' };
import logger from '../../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('اسم-اللعبة')
    .setDescription('وصف اللعبة بالعربي'),

  async execute(interaction) {
    try {
      const channelId = interaction.channelId;
      
      // Check for existing game
      if (GameSession.hasActiveGame(channelId)) {
        return interaction.reply({
          content: '❌ يوجد لعبة نشطة بالفعل في هذه القناة',
          ephemeral: true
        });
      }
      
      // Create new session
      const session = new GameSession(channelId, interaction.user.id, {
        minPlayers: 2,
        maxPlayers: 10
      });
      
      // Add host as first player
      session.addPlayer(interaction.user.id, interaction.user.displayName);
      
      // Create lobby embed with buttons
      const embed = createLobbyEmbed(session);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`game:${session.id}:join`)
          .setLabel('🎮 انضم')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`game:${session.id}:start`)
          .setLabel('▶️ ابدأ')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`game:${session.id}:leave`)
          .setLabel('🚪 غادر')
          .setStyle(ButtonStyle.Secondary)
      );
      
      await interaction.reply({
        embeds: [embed],
        components: [row]
      });
      
    } catch (error) {
      logger.error('[GameName] Execute error:', error);
      await interaction.reply({
        content: strings.common.error,
        ephemeral: true
      });
    }
  },

  async handleButton(interaction, sessionId, action) {
    try {
      const session = GameSession.activeSessions.get(interaction.channelId);
      
      if (!session || session.id !== sessionId) {
        return interaction.reply({
          content: '❌ انتهت هذه اللعبة',
          ephemeral: true
        });
      }
      
      switch (action) {
        case 'join':
          session.addPlayer(interaction.user.id, interaction.user.displayName);
          await this.updateLobby(interaction, session);
          break;
          
        case 'leave':
          session.removePlayer(interaction.user.id);
          await this.updateLobby(interaction, session);
          break;
          
        case 'start':
          if (interaction.user.id !== session.hostId) {
            return interaction.reply({
              content: '❌ فقط المضيف يمكنه بدء اللعبة',
              ephemeral: true
            });
          }
          session.start();
          await this.startGame(interaction, session);
          break;
      }
      
    } catch (error) {
      logger.error('[GameName] Button error:', error);
      await interaction.reply({
        content: `❌ ${error.message}`,
        ephemeral: true
      });
    }
  },
  
  async updateLobby(interaction, session) {
    const embed = createLobbyEmbed(session);
    await interaction.update({ embeds: [embed] });
  },
  
  async startGame(interaction, session) {
    // Implement game start logic
  }
};
```

## Embed Patterns

```javascript
import { EmbedBuilder } from 'discord.js';
import strings from '../../../localization/ar.json' with { type: 'json' };

const s = strings.games.gameName;

export function createLobbyEmbed(session) {
  const playerList = Array.from(session.players.values())
    .map((p, i) => `${i + 1}. ${p.name}`)
    .join('\n') || 'لا يوجد لاعبين';
    
  return new EmbedBuilder()
    .setTitle(`🎮 ${s.title}`)
    .setDescription(s.description)
    .addFields(
      { 
        name: `👥 اللاعبون (${session.players.size}/${session.maxPlayers})`, 
        value: playerList 
      }
    )
    .setColor('#5865F2')
    .setFooter({ text: `الحد الأدنى: ${session.minPlayers} لاعبين` });
}

export function createGameEmbed(session, gameState) {
  return new EmbedBuilder()
    .setTitle(`🎮 ${s.title}`)
    .setDescription(gameState.description)
    .setColor('#00FF00');
}

export function createEndEmbed(session, winner) {
  return new EmbedBuilder()
    .setTitle(`🏆 ${s.game_over}`)
    .setDescription(`الفائز: ${winner.name}`)
    .setColor('#FFD700');
}
```

## Coin Reward Pattern

```javascript
import prisma from '../../../utils/prisma.js';

async function distributeRewards(session) {
  const winner = session.winnerId;
  const participants = Array.from(session.players.keys());
  
  await prisma.$transaction(async (tx) => {
    // Give winner the prize
    await tx.user.update({
      where: { discordId: winner },
      data: { ashyCoins: { increment: 50 } }
    });
    
    // Give participation rewards to others
    for (const playerId of participants) {
      if (playerId !== winner) {
        await tx.user.update({
          where: { discordId: playerId },
          data: { ashyCoins: { increment: 10 } }
        });
      }
    }
    
    // Record transactions
    await tx.transaction.createMany({
      data: participants.map(id => ({
        userId: id,
        type: 'GAME_REWARD',
        amount: id === winner ? 50 : 10,
        description: `لعبة: ${session.gameName}`
      }))
    });
    
    // Update game stats
    await tx.gameStat.upsert({
      where: {
        odiscordId_game: { discordId: winner, game: session.gameName }
      },
      update: { wins: { increment: 1 } },
      create: { discordId: winner, game: session.gameName, wins: 1 }
    });
  });
}
```
