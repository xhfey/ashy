/**
 * Per-game perks configuration
 * Each game has its own set of purchasable perks
 * Prices based on Fizbo.gg documentation
 */

export const PERKS = {
  // ==========================================
  // ROULETTE - روليت
  // ==========================================
  ROULETTE: {
    EXTRA_LIFE: {
      id: 'EXTRA_LIFE',
      name: 'حياة إضافية',
      emoji: '💖',
      price: 130,
      description: 'انجو من إقصاء واحد'
    },
    SHIELD: {
      id: 'SHIELD',
      name: 'درع',
      emoji: '🛡️',
      price: 200,
      description: 'اعكس الإقصاء على المهاجم'
    },
    DOUBLE_KICK: {
      id: 'DOUBLE_KICK',
      name: 'طرد مرتين',
      emoji: '🔥',
      price: 150,
      description: 'أقصِ لاعبين بدلاً من واحد',
      showInShop: false
    }
  },

  // ==========================================
  // XO - إكس أو
  // ==========================================
  XO: {
    EXTRA_LIFE: {
      id: 'EXTRA_LIFE',
      name: 'حياة إضافية',
      emoji: '💖',
      price: 100,
      description: 'انجو من إقصاء واحد'
    }
  },

  // ==========================================
  // MAFIA - مافيا
  // ==========================================
  MAFIA: {
    HINT: {
      id: 'HINT',
      name: 'تلميح',
      emoji: '🕵️',
      price: 100,
      description: 'احصل على تلميح لمعرفة المافيا',
      showInShop: false
    }
  },

  // ==========================================
  // CHAIRS - كراسي
  // ==========================================
  CHAIRS: {
    EXTRA_LIFE: {
      id: 'EXTRA_LIFE',
      name: 'حياة إضافية',
      emoji: '💖',
      price: 75,
      description: 'انجو من إقصاء واحد'
    }
  },

  // ==========================================
  // RPS - حجر ورقة مقص
  // ==========================================
  RPS: {
    EXTRA_LIFE: {
      id: 'EXTRA_LIFE',
      name: 'حياة إضافية',
      emoji: '💖',
      price: 130,
      description: 'انجو من إقصاء واحد'
    }
  },

  // ==========================================
  // DICE - نرد
  // ==========================================
  DICE: {
    BETTER_LUCK: {
      id: 'BETTER_LUCK',
      name: 'حظ أفضل',
      emoji: '🍀',
      price: 150,
      description: 'يزيد من فرص الحصول على أرقام أعلى',
      canBuyDuringGame: false
    }
  },

  // ==========================================
  // HIDESEEK - الغميضة
  // ==========================================
  HIDESEEK: {
    EXTRA_LIFE: {
      id: 'EXTRA_LIFE',
      name: 'حياة إضافية',
      emoji: '💖',
      price: 100,
      description: 'انجو من إقصاء واحد'
    }
  },

  // ==========================================
  // REPLICA - نسخة
  // ==========================================
  REPLICA: {
    EXTRA_LIFE: {
      id: 'EXTRA_LIFE',
      name: 'حياة إضافية',
      emoji: '💖',
      price: 100,
      description: 'فرصة ثانية إذا أخطأت'
    }
  },

  // ==========================================
  // GUESS_COUNTRY - خمن الدولة
  // ==========================================
  GUESS_COUNTRY: {
    BOOST: {
      id: 'BOOST',
      name: 'تعزيز',
      emoji: '🚀',
      price: 200,
      description: 'ضاعف نقاطك طوال اللعبة'
    },
    HINT: {
      id: 'HINT',
      name: 'تلميح',
      emoji: '💡',
      price: 50,
      description: 'احصل على تلميح للجولة الحالية'
    }
  },

  // ==========================================
  // HOT_XO - إكس أو ساخن
  // ==========================================
  HOT_XO: {
    EXTRA_LIFE: {
      id: 'EXTRA_LIFE',
      name: 'حياة إضافية',
      emoji: '💖',
      price: 150,
      description: 'انجو من إقصاء واحد'
    }
  },

  // ==========================================
  // DEATH_WHEEL - عجلة الموت
  // ==========================================
  DEATH_WHEEL: {
    EXTRA_LIFE: {
      id: 'EXTRA_LIFE',
      name: 'حياة إضافية',
      emoji: '💖',
      price: 150,
      description: 'انجو من إقصاء واحد'
    }
  }
};

/**
 * Get perks for a specific game
 * @param {string} gameType
 * @returns {Object}
 */
export function getGamePerks(gameType) {
  return PERKS[gameType] || {};
}

/**
 * Get a specific perk
 * @param {string} gameType
 * @param {string} perkId
 * @returns {Object|null}
 */
export function getPerk(gameType, perkId) {
  return PERKS[gameType]?.[perkId] || null;
}

/**
 * Get perks as array for a game (useful for building shop UI)
 * @param {string} gameType
 * @returns {Array}
 */
export function getGamePerksArray(gameType) {
  const perks = PERKS[gameType];
  if (!perks) return [];

  return Object.entries(perks).map(([id, perk]) => ({
    ...perk,
    id
  }));
}
