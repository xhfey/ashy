import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { isCommandPathAllowed, shouldDescendIntoCommandDir } from './config/command-policy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadCommandsRecursively(dir, rootDir = dir) {
  const commands = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const relPath = relative(rootDir, fullPath).replace(/\\/g, '/');
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (!shouldDescendIntoCommandDir(relPath)) {
        console.log(`⏭️  Skip dir: ${relPath}`);
        continue;
      }
      commands.push(...await loadCommandsRecursively(fullPath, rootDir));
    } else if (entry === 'index.js' || (entry.endsWith('.js') && !entry.startsWith('_'))) {
      if (!isCommandPathAllowed(relPath)) {
        console.log(`⏭️  Skip command: ${relPath}`);
        continue;
      }
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

    // Force exit to avoid open handles from imported modules/HTTP keepalive.
    process.exit(0);

  } catch (error) {
    console.error('❌ Deploy failed:', error);
    process.exit(1);
  }
}

deploy();
