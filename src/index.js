import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import logger from './utils/logger.js';
import { getHttpAgent } from './utils/http.js';
import * as RedisService from './services/redis.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const httpAgent = getHttpAgent();
const restTimeoutMs = Number(process.env.DISCORD_REST_TIMEOUT_MS) || 30_000;
const restRetries = Number(process.env.DISCORD_REST_RETRIES) || 3;

// Create client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel],
  rest: {
    agent: httpAgent,
    timeout: restTimeoutMs,
    retries: restRetries
  }
});

// Collections for commands
client.commands = new Collection();

/**
 * Recursively load commands from directory
 */
async function loadCommands(dir) {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Recurse into subdirectory
      await loadCommands(fullPath);
    } else if (entry === 'index.js' || (entry.endsWith('.js') && !entry.startsWith('_'))) {
      try {
        const command = await import(`file://${fullPath}`);

        if (command.default?.data?.name && command.default?.execute) {
          client.commands.set(command.default.data.name, command.default);
          logger.debug(`Loaded command: ${command.default.data.name}`);
        }
      } catch (error) {
        logger.error(`Failed to load command ${fullPath}:`, error);
      }
    }
  }
}

/**
 * Load event handlers
 */
async function loadEvents() {
  const eventsPath = join(__dirname, 'events');
  const eventFiles = readdirSync(eventsPath).filter(f => f.endsWith('.js'));

  for (const file of eventFiles) {
    try {
      const event = await import(`file://${join(eventsPath, file)}`);

      if (event.default?.once) {
        client.once(event.default.name, (...args) => event.default.execute(...args));
      } else if (event.default?.name) {
        client.on(event.default.name, (...args) => event.default.execute(...args));
      }

      logger.debug(`Loaded event: ${event.default?.name || file}`);
    } catch (error) {
      logger.error(`Failed to load event ${file}:`, error);
    }
  }
}

/**
 * Start the bot
 */
async function start() {
  try {
    logger.info('Starting Ashy Bot...');

    // Test Redis connection
    const latency = await RedisService.testConnection();
    if (latency < 0) {
      logger.warn('Redis connection failed! Game sessions will not persist across restarts.');
    }

    // Load commands
    const commandsPath = join(__dirname, 'commands');
    await loadCommands(commandsPath);
    logger.info(`Loaded ${client.commands.size} commands`);

    // Load events
    await loadEvents();

    // Login
    await client.login(process.env.DISCORD_TOKEN);

  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

// Handle process errors
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

// Start
start();
