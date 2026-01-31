/**
 * Roulette Game Constants
 * All game settings, perks, embeds, and visual constants
 */

// ==================== GAME SETTINGS ====================

export const GAME_SETTINGS = {
  minPlayers: 4,
  maxPlayers: 20,
  maxSlots: 20,
  lobbyTimeout: 30,    // 30 seconds countdown
  kickTimeout: 15,     // 15 seconds to pick target
  baseReward: 12,      // coins for winner
};

// ==================== PERKS ====================

export const PERKS = {
  EXTRA_LIFE: {
    id: 'EXTRA_LIFE',
    name: 'حياة إضافية',
    nameEn: 'Extra Life',
    emoji: '❤️',
    cost: 130,
    description: 'نجاة من الطرد مرة واحدة',
    descriptionEn: 'Survive one elimination',
    phase: 'lobby', // Can only buy in lobby
  },
  SHIELD: {
    id: 'SHIELD',
    name: 'درع',
    nameEn: 'Shield',
    emoji: '🛡️',
    cost: 200,
    description: 'يعكس الطرد على المهاجم',
    descriptionEn: 'Reflects kick back to attacker',
    phase: 'lobby',
  },
  DOUBLE_KICK: {
    id: 'DOUBLE_KICK',
    name: 'طرد مرتين',
    nameEn: 'Double Kick',
    emoji: '🔥',
    cost: 150,
    description: 'طرد لاعبين في دور واحد',
    descriptionEn: 'Eliminate 2 players in one turn',
    phase: 'game', // Can buy during kick turn
  },
};

// ==================== EMBED COLORS ====================

export const EMBED_COLORS = {
  lobby: 0x5865F2,      // Discord blurple
  playing: 0x57F287,    // Green
  kick: 0xED4245,       // Red
  eliminated: 0x99AAB5, // Gray
  winner: 0xFEE75C,     // Gold
  shop: 0xEB459E,       // Pink
  error: 0xED4245,      // Red
  info: 0x5865F2,       // Blurple
};

// ==================== NUMBER EMOJIS ====================

export const NUMBER_EMOJIS = {
  1: '1️⃣',
  2: '2️⃣',
  3: '3️⃣',
  4: '4️⃣',
  5: '5️⃣',
  6: '6️⃣',
  7: '7️⃣',
  8: '8️⃣',
  9: '9️⃣',
  10: '🔟',
  11: '1️⃣1️⃣',
  12: '1️⃣2️⃣',
  13: '1️⃣3️⃣',
  14: '1️⃣4️⃣',
  15: '1️⃣5️⃣',
  16: '1️⃣6️⃣',
  17: '1️⃣7️⃣',
  18: '1️⃣8️⃣',
  19: '1️⃣9️⃣',
  20: '2️⃣0️⃣',
};

// ==================== MESSAGES ====================

export const MESSAGES = {
  // Game phases
  GAME_STARTING: '🎡 بدأت اللعبة! جهز نفسك...',
  YOUR_TURN: (mention) => `🎡 دورك ${mention}! اختر لاعباً لإقصائه`,
  SPINNING: '🎡 جاري تدوير العجلة...',
  WHEEL_SELECTED: (mention) => `🎯 العجلة اختارت ${mention}!`,

  // Outcomes
  ELIMINATED: (mention) => `☠️ ${mention} تم إقصاؤه!`,
  SURVIVED_EXTRA_LIFE: (mention) => `💖 ${mention} نجا باستخدام حياة إضافية!`,
  SHIELD_REFLECTED: (attacker, target) => `🛡️ ${target} عكس الإقصاء على ${attacker}!`,
  SHIELD_REFLECTED_SURVIVED: (attacker, target) => `🛡️ ${target} عكس الإقصاء!\n💖 ${attacker} نجا باستخدام حياة إضافية!`,
  DOUBLE_KICK: (mention1, mention2) => `🔥 تم إقصاء ${mention1} و ${mention2}!`,

  // Winner
  WINNER: (mention) => `🏆 ${mention} فاز باللعبة!`,
  FINAL_ROUND: '⚔️ الجولة النهائية!',

  // Errors
  NOT_YOUR_TURN: 'ليس دورك!',
  ALREADY_ELIMINATED: 'تم إقصاء هذا اللاعب!',
  CANNOT_SELECT_SELF: 'لا يمكنك اختيار نفسك!',
  GAME_EXPIRED: 'انتهت اللعبة',
  NOT_IN_GAME: 'أنت لست في هذه اللعبة',
  ALREADY_IN_GAME: 'أنت موجود بالفعل في اللعبة',
  GAME_FULL: 'اللعبة ممتلئة',
  SLOT_TAKEN: 'هذا الرقم محجوز',
  NO_SLOTS_AVAILABLE: 'لا توجد أرقام متاحة',
  GAME_STARTED: 'اللعبة بدأت بالفعل',
  CANNOT_LEAVE: 'لا يمكنك المغادرة بعد بدء اللعبة',

  // Timeouts
  TURN_TIMEOUT: '⏰ انتهى الوقت! سيتم إقصاء اللاعب تلقائياً...',

  // Shop
  SHOP_TITLE: '🛒 متجر البيركات',
  SHOP_LOBBY_ONLY: 'المتجر متاح فقط قبل بدء اللعبة',
  ALREADY_OWNED: 'لديك هذا البيرك بالفعل',
  PURCHASE_SUCCESS: (perkName, balance) => `✅ اشتريت ${perkName}!\n💰 الرصيد: ${balance} عملة`,
  INSUFFICIENT_BALANCE: (needed, have) => `❌ رصيدك غير كافي!\nتحتاج: ${needed} | لديك: ${have}`,

  // Perks
  USE_DOUBLE_KICK: '🔥 شراء طرد مرتين',
  DOUBLE_KICK_ACTIVATED: '🔥 تم تفعيل طرد مرتين! اختر اللاعب الأول...',
  DOUBLE_KICK_SECOND: '🔥 اختر اللاعب الثاني للطرد...',
  SKIP_DOUBLE_KICK: 'تخطي الطرد الثاني',

  // Lobby
  GAME_CANCELLED: '❌ تم إلغاء اللعبة',
  NOT_ENOUGH_PLAYERS: 'عدد اللاعبين غير كافي',
  JOIN_TO_PLAY: 'انضم للعبة أولاً',
};

// ==================== TIMING ====================

export const TURN_TIMEOUT_MS = 15000;    // 15 seconds per turn
export const SPIN_ANIMATION_MS = 3500;   // 3.5 seconds for wheel animation
export const RESULT_DELAY_MS = 2000;     // 2 seconds before next turn
export const CELEBRATION_DELAY_MS = 1500; // 1.5 seconds for celebration

// ==================== WHEEL COLORS ====================

export const WHEEL_COLORS = [
  '#C98350', // Brass/Bronze
  '#8B2942', // Deep Crimson
  '#D86075', // Hot Pink
  '#413A86', // Royal Violet
  '#BC495C', // Rose
  '#2D4A3E', // Dark Forest
  '#D48D56', // Ember Orange
  '#4A3B6B', // Deep Purple
  '#8B4513', // Saddle Brown
  '#6B3A5B', // Plum
  '#3D5C5C', // Teal
  '#7B3F3F', // Burgundy
];
