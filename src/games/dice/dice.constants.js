/**
 * Dice Game Constants
 */

// Second roll outcomes
export const SECOND_ROLL_OUTCOMES = {
  X2: 'X2',           // Double first roll
  BLOCK: 'BLOCK',     // Block opponent next round
  ZERO: 'ZERO',       // Zero points
  PLUS_2: 'PLUS_2',   // +2
  PLUS_4: 'PLUS_4',   // +4
  MINUS_2: 'MINUS_2', // -2
  MINUS_4: 'MINUS_4', // -4
  NORMAL: 'NORMAL',   // Normal 1-6 (replaces first roll)
};

// Second roll odds
export const SECOND_ROLL_NORMAL_CHANCE = 70; // % chance to roll normal 1-6
export const SECOND_ROLL_SPECIAL_OUTCOMES = [
  SECOND_ROLL_OUTCOMES.X2,
  SECOND_ROLL_OUTCOMES.BLOCK,
  SECOND_ROLL_OUTCOMES.ZERO,
  SECOND_ROLL_OUTCOMES.PLUS_2,
  SECOND_ROLL_OUTCOMES.PLUS_4,
  SECOND_ROLL_OUTCOMES.MINUS_2,
  SECOND_ROLL_OUTCOMES.MINUS_4,
];

// Normal roll weights (no perk)
export const NORMAL_ROLL_WEIGHTS = {
  1: 16.67,
  2: 16.67,
  3: 16.67,
  4: 16.67,
  5: 16.67,
  6: 16.65,
};

// Better Luck perk weights (biased toward higher)
export const BETTER_LUCK_WEIGHTS = {
  1: 10,
  2: 12,
  3: 15,
  4: 18,
  5: 22,
  6: 23,
};

// Timeouts
export const TURN_TIMEOUT_MS = 20000; // 20 seconds for roll/skip decision
export const BLOCK_TIMEOUT_MS = 15000; // 15 seconds to choose block target

// Game settings
export const TOTAL_ROUNDS = 3;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;

// Arabic messages
export const MESSAGES = {
  // Turn messages
  YOUR_TURN: (name) => `🎲 دورك يا ${name}!`,
  ROLLED: (value) => `رميت **${value}** نقطة`,
  ROLLED_WITH_MODIFIER: (first, modifier) => {
    if (modifier > 0) return `لقد حصلت على ${first} نقطة مع زائد ${modifier} نقاط`;
    return `لقد حصلت على ${first} نقطة مع ناقص ${Math.abs(modifier)} نقاط`;
  },
  CURRENT_SCORE: (score) => `● مجموع نقاطك الحالي: **${score}**`,

  // Second roll outcomes
  GOT_X2: 'لقد حصلت على مضاعفة نقاطك! 🎉',
  GOT_ZERO: 'لقد حصلت على صفر نقاط هذا الدور 😢',
  GOT_BLOCK: 'لقد حصلت على منع شخص من الفريق الثاني من المشاركة في الجولة القادمة',
  CHOOSE_BLOCK_TARGET: 'اختر الشخص الذي تريد منعه من المشاركة في الجولة القادمة',
  BLOCKED_PLAYER: (name) => `❌ تم منع ${name} من المشاركة في الجولة القادمة`,
  BLOCK_LAST_ROUND: (name) => `${name} لقد حصلت على منع شخص من الفريق الثاني من المشاركة في الجولة القادمة ،\nلكن لأنها الجولة الأخيرة ، فقد تم سحبها`,

  // Blocked player
  PLAYER_BLOCKED: (name) => `${name} غير مسموح له بالمشاركة في هذه الجولة سيتم تخطي دوره ...`,

  // Timeouts
  TIMEOUT_SKIPPED: 'انتهى الوقت! تم تخطي دورك',
  TIMEOUT_AUTO_BLOCK: 'انتهى الوقت! تم اختيار لاعب عشوائي',

  // Buttons
  BTN_ROLL_AGAIN: 'العب مرة أخرى',
  BTN_SKIP: 'تخطي',

  // Round/Game
  ROUND_START: (round) => `🎲 **الجولة ${round} من ${TOTAL_ROUNDS}**`,
  TEAM_A_TURN: '**دور الفريق A**',
  TEAM_B_TURN: '**دور الفريق B**',
  ROUND_SUMMARY: (round) => `📊 **نتائج الجولة ${round}**`,
  GAME_END: '🏆 **انتهت اللعبة!**',
  TEAM_WINS: (team, score) => `فاز الفريق ${team} بـ ${score} نقطة! 🎉`,
  GAME_TIE: 'تعادل! 🤝',
};

// Image paths
export const DICE_IMAGES = {
  1: 'assets/images/dice/dice-1.png',
  2: 'assets/images/dice/dice-2.png',
  3: 'assets/images/dice/dice-3.png',
  4: 'assets/images/dice/dice-4.png',
  5: 'assets/images/dice/dice-5.png',
  6: 'assets/images/dice/dice-6.png',
  X2: 'assets/images/dice/dice-x2.png',
  BLOCK: 'assets/images/dice/dice-block.png',
  ZERO: 'assets/images/dice/dice-zero.png',
  '+2': 'assets/images/dice/dice-plus2.png',
  '+4': 'assets/images/dice/dice-plus4.png',
  '-2': 'assets/images/dice/dice-minus2.png',
  '-4': 'assets/images/dice/dice-minus4.png',
  ROUND_BG: 'assets/images/dice/round-bg.png',
};
