/**
 * Roulette Game Constants
 */

export const MESSAGES = {
  // Game phases
  GAME_STARTING: 'بدأت اللعبة! جهز نفسك...',
  YOUR_TURN: (mention) => `🎡 دورك ${mention}! اختر لاعباً لإقصائه`,
  SPINNING: 'جاري تدوير العجلة...',

  // Outcomes
  ELIMINATED: (mention) => `☠️ ${mention} تم إقصاؤه!`,
  SURVIVED_EXTRA_LIFE: (mention) => `💖 ${mention} نجا باستخدام حياة إضافية!`,
  SHIELD_REFLECTED: (attacker, target) => `🛡️ ${target} عكس الإقصاء على ${attacker}!`,
  DOUBLE_KICK: (mention1, mention2) => `🔥 تم إقصاء ${mention1} و ${mention2}!`,

  // Winner
  WINNER: (mention) => `🏆 ${mention} فاز باللعبة!`,

  // Errors
  NOT_YOUR_TURN: 'ليس دورك!',
  ALREADY_ELIMINATED: 'تم إقصاء هذا اللاعب!',
  CANNOT_SELECT_SELF: 'لا يمكنك اختيار نفسك!',
  GAME_EXPIRED: 'انتهت اللعبة',

  // Timeouts
  TURN_TIMEOUT: 'انتهى الوقت! سيتم اختيار لاعب عشوائي...',

  // Perks
  USE_DOUBLE_KICK: '🔥 استخدم طرد مرتين',
};

export const TURN_TIMEOUT_MS = 30000; // 30 seconds per turn
export const SPIN_ANIMATION_MS = 3000; // 3 seconds for wheel animation
export const RESULT_DELAY_MS = 2000; // 2 seconds before next turn

// Wheel colors for segments
export const WHEEL_COLORS = [
  '#C98350', // Brass/Bronze
  '#8B2942', // Deep Crimson
  '#D86075', // Hot Pink
  '#413A86', // Royal Violet
  '#2D4A3E', // Dark Forest
  '#D48D56', // Ember Orange
];
