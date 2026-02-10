/**
 * Mafia Full Image Test — Complete rebuild verification
 *
 * Tests:
 * 1. Teams banner at 5, 8, 12, 15 players (verifies adaptive spacing + duplicate icons)
 * 2. Win banner — Team 1 (Civilians) wins (8 players)
 * 3. Win banner — Team 2 (Mafia) wins (8 players)
 * 4. Game simulation with 8 players
 *
 * Run: node test-mafia-full.mjs
 */

import { generateTeamsBanner, generateWinBanner, prewarmMafiaAssets } from './src/games/mafia/mafia.images.js';
import { ROLE_DISTRIBUTIONS, ROLES, ROLE_NAMES, TEAMS, getTeam } from './src/games/mafia/mafia.constants.js';
import { randomInt } from 'crypto';
import fs from 'fs';

// ==================== HELPERS ====================

function save(filename, buffer) {
  if (!buffer) {
    console.log(`   ❌ ${filename} — returned null`);
    return;
  }
  fs.writeFileSync(filename, buffer);
  console.log(`   ✅ ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

function assignRoles(playerNames) {
  const count = playerNames.length;
  const dist = ROLE_DISTRIBUTIONS[count];
  const roles = [];
  for (let i = 0; i < dist.MAFIA; i++) roles.push(ROLES.MAFIA);
  for (let i = 0; i < dist.DOCTOR; i++) roles.push(ROLES.DOCTOR);
  for (let i = 0; i < dist.DETECTIVE; i++) roles.push(ROLES.DETECTIVE);
  for (let i = 0; i < dist.CITIZEN; i++) roles.push(ROLES.CITIZEN);

  for (let i = roles.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }

  return playerNames.map((name, idx) => ({
    userId: `${100 + idx}`,
    displayName: name,
    avatarURL: null, // No real avatars in test — uses fallback circles
    role: roles[idx],
    alive: true,
  }));
}

function checkWin(players) {
  const alive = players.filter(p => p.alive);
  const aliveMafia = alive.filter(p => p.role === ROLES.MAFIA).length;
  if (aliveMafia === 0) return TEAMS.TEAM_1;
  if (aliveMafia >= alive.length - aliveMafia) return TEAMS.TEAM_2;
  return null;
}

// ==================== MAIN ====================

async function main() {
  console.log('🎨 Prewarming assets...\n');
  await prewarmMafiaAssets();

  // ========== TEAMS BANNERS ==========
  console.log('═══════════════════════════════════════');
  console.log('  TEAMS BANNERS — Duplicate Icons Test');
  console.log('═══════════════════════════════════════\n');

  for (const count of [5, 8, 12, 15]) {
    const dist = ROLE_DISTRIBUTIONS[count];
    const det = dist.DETECTIVE > 0;
    console.log(`  ${count} players: M=${dist.MAFIA} D=${dist.DOCTOR} Det=${dist.DETECTIVE} C=${dist.CITIZEN}`);

    const t = Date.now();
    const buf = await generateTeamsBanner(dist, det);
    console.log(`   Generated in ${Date.now() - t}ms`);
    save(`test-teams-${count}p.png`, buf);
    console.log('');
  }

  // ========== WIN BANNERS ==========
  console.log('═══════════════════════════════════════');
  console.log('  WIN BANNERS — Horizontal Avatar Rows');
  console.log('═══════════════════════════════════════\n');

  // Civilians win (Team 1) — 8 players, 4 rounds
  const civPlayers = [
    { userId: '100', displayName: 'أحمد', avatarURL: null, role: ROLES.CITIZEN, alive: true },
    { userId: '101', displayName: 'سارة', avatarURL: null, role: ROLES.DOCTOR, alive: true },
    { userId: '102', displayName: 'خالد', avatarURL: null, role: ROLES.DETECTIVE, alive: false },
    { userId: '103', displayName: 'نورة', avatarURL: null, role: ROLES.CITIZEN, alive: true },
    { userId: '104', displayName: 'محمد', avatarURL: null, role: ROLES.MAFIA, alive: false },
    { userId: '105', displayName: 'لمى', avatarURL: null, role: ROLES.MAFIA, alive: false },
    { userId: '106', displayName: 'فهد', avatarURL: null, role: ROLES.MAFIA, alive: false },
    { userId: '107', displayName: 'ريم', avatarURL: null, role: ROLES.CITIZEN, alive: false },
  ];

  console.log('  Civilians Win (Team 1):');
  let t = Date.now();
  let buf = await generateWinBanner(TEAMS.TEAM_1, civPlayers, 4);
  console.log(`   Generated in ${Date.now() - t}ms`);
  save('test-win-civilians.png', buf);

  // Mafia win (Team 2) — 8 players, 3 rounds
  const mafPlayers = [
    { userId: '100', displayName: 'أحمد', avatarURL: null, role: ROLES.CITIZEN, alive: false },
    { userId: '101', displayName: 'سارة', avatarURL: null, role: ROLES.DOCTOR, alive: false },
    { userId: '102', displayName: 'خالد', avatarURL: null, role: ROLES.DETECTIVE, alive: false },
    { userId: '103', displayName: 'نورة', avatarURL: null, role: ROLES.CITIZEN, alive: false },
    { userId: '104', displayName: 'محمد', avatarURL: null, role: ROLES.MAFIA, alive: true },
    { userId: '105', displayName: 'لمى', avatarURL: null, role: ROLES.MAFIA, alive: true },
    { userId: '106', displayName: 'فهد', avatarURL: null, role: ROLES.MAFIA, alive: false },
    { userId: '107', displayName: 'ريم', avatarURL: null, role: ROLES.CITIZEN, alive: false },
  ];

  console.log('\n  Mafia Win (Team 2):');
  t = Date.now();
  buf = await generateWinBanner(TEAMS.TEAM_2, mafPlayers, 3);
  console.log(`   Generated in ${Date.now() - t}ms`);
  save('test-win-mafia.png', buf);

  // ========== SIMULATION ==========
  console.log('\n═══════════════════════════════════════');
  console.log('  GAME SIMULATION — 8 Players');
  console.log('═══════════════════════════════════════\n');

  const names = ['أحمد', 'سارة', 'خالد', 'نورة', 'محمد', 'لمى', 'فهد', 'ريم'];
  const gamePlayers = assignRoles(names);

  console.log('  Roles:');
  for (const p of gamePlayers) {
    const team = getTeam(p.role) === TEAMS.TEAM_1 ? '🟢' : '🔴';
    console.log(`   ${team} ${p.displayName} → ${ROLE_NAMES[p.role]}`);
  }

  let round = 0;
  while (true) {
    round++;
    const alive = gamePlayers.filter(p => p.alive);
    const nonMafia = alive.filter(p => p.role !== ROLES.MAFIA);
    if (nonMafia.length === 0) break;

    // Night kill
    const target = nonMafia[randomInt(nonMafia.length)];
    target.alive = false;
    console.log(`\n  Round ${round} Night: ${target.displayName} killed (${ROLE_NAMES[target.role]})`);

    let win = checkWin(gamePlayers);
    if (win) {
      console.log(`  >>> ${win === TEAMS.TEAM_1 ? 'CIVILIANS' : 'MAFIA'} WIN after night!`);
      t = Date.now();
      buf = await generateWinBanner(win, gamePlayers, round);
      console.log(`   Generated in ${Date.now() - t}ms`);
      save('test-win-sim.png', buf);
      break;
    }

    // Day vote (random)
    const aliveVote = gamePlayers.filter(p => p.alive);
    if (Math.random() > 0.3) {
      const expelled = aliveVote[randomInt(aliveVote.length)];
      expelled.alive = false;
      console.log(`  Round ${round} Day: ${expelled.displayName} expelled (${ROLE_NAMES[expelled.role]})`);
    } else {
      console.log(`  Round ${round} Day: Vote skipped`);
    }

    win = checkWin(gamePlayers);
    if (win) {
      console.log(`  >>> ${win === TEAMS.TEAM_1 ? 'CIVILIANS' : 'MAFIA'} WIN after vote!`);
      t = Date.now();
      buf = await generateWinBanner(win, gamePlayers, round);
      console.log(`   Generated in ${Date.now() - t}ms`);
      save('test-win-sim.png', buf);
      break;
    }

    if (round >= 15) {
      console.log('  Safety cap reached');
      break;
    }
  }

  console.log('\n✅ Done! Check PNG files in project root.');
}

main().catch(err => {
  console.error('💥 Error:', err);
  process.exit(1);
});
