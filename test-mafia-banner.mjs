/**
 * Quick test: generate Mafia teams banner and save to disk
 * Run: node test-mafia-banner.mjs
 */

import { generateTeamsBanner, prewarmMafiaAssets } from './src/games/mafia/mafia.images.js';
import { ROLE_DISTRIBUTIONS } from './src/games/mafia/mafia.constants.js';
import fs from 'fs';

const playerCounts = [5, 7, 8, 15];

async function main() {
  console.log('Prewarming assets...');
  await prewarmMafiaAssets();

  for (const count of playerCounts) {
    const dist = ROLE_DISTRIBUTIONS[count];
    const detectiveEnabled = dist.DETECTIVE > 0;

    console.log(`\nGenerating banner for ${count} players:`, dist);
    console.log(`  Detective enabled: ${detectiveEnabled}`);

    const startTime = Date.now();
    const buffer = await generateTeamsBanner(dist, detectiveEnabled);
    const elapsed = Date.now() - startTime;

    if (buffer) {
      const filename = `test-banner-${count}p.png`;
      fs.writeFileSync(filename, buffer);
      console.log(`  Saved: ${filename} (${(buffer.length / 1024).toFixed(1)} KB, ${elapsed}ms)`);
    } else {
      console.log(`  FAILED - returned null (${elapsed}ms)`);
    }
  }

  console.log('\nDone! Check the PNG files in the project root.');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
