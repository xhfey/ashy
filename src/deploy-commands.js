import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadCommandsRecursively(dir) {
  const commands = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      commands.push(...await loadCommandsRecursively(fullPath));
    } else if (entry === 'index.js' || (entry.endsWith('.js') && !entry.startsWith('_'))) {
      try {
        const command = await import(`file://${fullPath}`);
        if (command.default?.data) {
          commands.push(command.default.data.toJSON());
          console.log(`📦 ${command.default.data.name}`);
        }
      } catch (error) {
        console.error(`❌ Failed: ${fullPath}`, error.message);
      }
    }
  }

  return commands;
}

async function deploy() {
  console.log('\n🔄 Loading commands...\n');

  const commandsPath = join(__dirname, 'commands');
  const commands = await loadCommandsRecursively(commandsPath);

  console.log(`\n📊 Total: ${commands.length} commands\n`);

  const rest = new REST().setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('🚀 Deploying to Discord...\n');

    // Use guild commands for faster updates during development
    const route = process.env.GUILD_ID
      ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
      : Routes.applicationCommands(process.env.CLIENT_ID);

    const data = await rest.put(route, { body: commands });

    console.log(`✅ Successfully deployed ${data.length} commands!`);

    if (process.env.GUILD_ID) {
      console.log(`📍 Deployed to guild: ${process.env.GUILD_ID}`);
    } else {
      console.log('🌍 Deployed globally (may take up to 1 hour to propagate)');
    }

  } catch (error) {
    console.error('❌ Deploy failed:', error);
    process.exit(1);
  }
}

deploy();
