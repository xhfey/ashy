/**
 * Games configuration - CORRECTED v3
 * Only Roulette has SLOTS lobby type
 */

export const GAMES = {
  RPS: {
    id: 'RPS',
    command: 'حجر-ورقة-مقص',
    name: 'حجر ورقة مقص',
    nameEn: 'Rock Paper Scissors',
    emoji: '✊',
    description: 'لعبة حجر ورقة مقص الكلاسيكية',
    minPlayers: 2,
    maxPlayers: 20,
    lobbyType: 'SIMPLE',
    baseReward: 8,
    countdownSeconds: 30
  },
  DICE: {
    id: 'DICE',
    command: 'نرد',
    name: 'نرد',
    nameEn: 'Dice',
    emoji: '🎲',
    description: 'ارمِ النرد واحصل على أعلى رقم!',
    details: `**طريقة اللعب:**
1- شارك في اللعبة بالضغط على الزر ادناه
2- سيتم توزيع اللاعبين في فريقين
3- في كل جولة سيلعب الفريق شخصًا تلو الآخر
4- الارقام التي ستظهر بالنرد سيتم اضافتها للنقاط الشخصية و للفريق كامل
5- يمكنك رمي النرد مرتين
6- من الممكن ان تتضاعف نقاطك او تقل
7- عند الانتهاء من الثلاث جولات سيفوز الفريق الذي يمتلك نقاط اكثر`,
    minPlayers: 2,
    maxPlayers: 10,
    lobbyType: 'SIMPLE',
    baseReward: 8,
    countdownSeconds: 30
  },
  ROULETTE: {
    id: 'ROULETTE',
    command: 'روليت',
    name: 'روليت',
    nameEn: 'Roulette',
    emoji: '🎡',
    description: 'عجلة الحظ! اختر لاعباً لإقصائه',
    minPlayers: 4,
    maxPlayers: 20,
    lobbyType: 'SLOTS', // ONLY Roulette has slots!
    baseReward: 12,
    countdownSeconds: 60  // Longer lobby time for slots selection
  },
  XO: {
    id: 'XO',
    command: 'اكس-او',
    name: 'إكس أو',
    nameEn: 'Tic-Tac-Toe',
    emoji: '⭕',
    description: 'لعبة إكس أو الجماعية',
    minPlayers: 2,
    maxPlayers: 6,
    lobbyType: 'SIMPLE',
    baseReward: 10,
    countdownSeconds: 30
  },
  CHAIRS: {
    id: 'CHAIRS',
    command: 'كراسي',
    name: 'كراسي',
    nameEn: 'Musical Chairs',
    emoji: '💺',
    description: 'لعبة الكراسي الموسيقية',
    minPlayers: 3,
    maxPlayers: 20,
    lobbyType: 'SIMPLE',
    baseReward: 10,
    countdownSeconds: 30
  },
  MAFIA: {
    id: 'MAFIA',
    command: 'مافيا',
    name: 'مافيا',
    nameEn: 'Mafia',
    emoji: '🔫',
    description: 'لعبة المافيا الاجتماعية',
    details: `**طريقة اللعب:**
1- شارك في اللعبة بالضغط على الزر أدناه
2- سيتم توزيع اللاعبين على مافيا، مواطنين وأيضاً طبيب واحد بشكل عشوائي
3- في كل جولة، ستصوت المافيا لطرد شخص واحد من اللعبة. ثم سيصوت الطبيب لحماية شخص واحد من المافيا. وفي النهاية الجولة، سيحاول جميع اللاعبين التصويت وطرد إحدى أعضاء المافيا.
4- إذا تم طرد جميع المافيا، سيفوز المواطنين، وإذا كانت المافيا تساوي عدد المواطنين، فستفوز المافيا.`,
    minPlayers: 5,
    maxPlayers: 15,
    lobbyType: 'SIMPLE',
    baseReward: 15,
    countdownSeconds: 30
  },
  HIDESEEK: {
    id: 'HIDESEEK',
    command: 'الغميضة',
    name: 'الغميضة',
    nameEn: 'Hide and Seek',
    emoji: '👀',
    description: 'اختبئ وابحث عن الآخرين',
    minPlayers: 3,
    maxPlayers: 20,
    lobbyType: 'SIMPLE',
    baseReward: 12,
    countdownSeconds: 30
  },
  REPLICA: {
    id: 'REPLICA',
    command: 'نسخة',
    name: 'نسخة',
    nameEn: 'Replica',
    emoji: '📋',
    description: 'انسخ النمط بدقة',
    minPlayers: 2,
    maxPlayers: 10,
    lobbyType: 'SIMPLE',
    baseReward: 10,
    countdownSeconds: 30
  },
  GUESS_COUNTRY: {
    id: 'GUESS_COUNTRY',
    command: 'خمن-الدولة',
    name: 'خمن الدولة',
    nameEn: 'Guess the Country',
    emoji: '🌍',
    description: 'خمن الدولة من العلم أو الصورة',
    minPlayers: 2,
    maxPlayers: 8,
    lobbyType: 'SIMPLE',
    baseReward: 8,
    countdownSeconds: 30
  },
  HOT_XO: {
    id: 'HOT_XO',
    command: 'اكس-او-ساخن',
    name: 'إكس أو ساخن',
    nameEn: 'Hot Tic-Tac-Toe',
    emoji: '🔥',
    description: 'إكس أو مع ضغط الوقت',
    minPlayers: 2,
    maxPlayers: 6,
    lobbyType: 'SIMPLE',
    baseReward: 10,
    countdownSeconds: 30
  },
  DEATH_WHEEL: {
    id: 'DEATH_WHEEL',
    command: 'عجلة-الموت',
    name: 'عجلة الموت',
    nameEn: 'Death Wheel',
    emoji: '☠️',
    description: 'العجلة تقرر مصيرك',
    minPlayers: 3,
    maxPlayers: 4,
    lobbyType: 'SIMPLE',
    baseReward: 12,
    countdownSeconds: 30
  }
};

/**
 * Get lobby type for a game
 * @param {string} gameType
 * @returns {'SIMPLE' | 'SLOTS'}
 */
export function getLobbyType(gameType) {
  return GAMES[gameType]?.lobbyType || 'SIMPLE';
}

/**
 * Get game by command name
 * @param {string} commandName
 * @returns {Object|undefined}
 */
export function getGameByCommand(commandName) {
  return Object.values(GAMES).find(g => g.command === commandName);
}

// Weekly leaderboard rewards
export const WEEKLY_REWARDS = {
  1: 1500,
  2: 700,
  3: 300
};

export default GAMES;
