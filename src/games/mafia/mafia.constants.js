/**
 * Mafia Game Constants
 * Roles, phases, distributions, strings, and timers
 */

import { MAFIA_TIMERS } from '../../config/timers.config.js';
import { GAMES } from '../../config/games.config.js';

// ==================== ROLES ====================

export const ROLES = {
  MAFIA: 'MAFIA',
  DOCTOR: 'DOCTOR',
  DETECTIVE: 'DETECTIVE',
  CITIZEN: 'CITIZEN',
};

export const ROLE_NAMES = {
  MAFIA: 'مافيا',
  DOCTOR: 'طبيب',
  DETECTIVE: 'محقق',
  CITIZEN: 'مواطن',
};

export const ROLE_EMOJIS = {
  MAFIA: '🗡',
  DOCTOR: '💊',
  DETECTIVE: '🔍',
  CITIZEN: '👤',
};

// ==================== TEAMS ====================

export const TEAMS = {
  TEAM_1: 1, // Citizens + Doctor + Detective
  TEAM_2: 2, // Mafia
};

export function getTeam(role) {
  return role === ROLES.MAFIA ? TEAMS.TEAM_2 : TEAMS.TEAM_1;
}

// ==================== PHASES ====================

export const PHASES = {
  ROLE_REVEAL: 'ROLE_REVEAL',
  NIGHT_MAFIA: 'NIGHT_MAFIA',
  NIGHT_DOCTOR: 'NIGHT_DOCTOR',
  NIGHT_DETECTIVE: 'NIGHT_DETECTIVE',
  RESOLVE_NIGHT: 'RESOLVE_NIGHT',
  DAY_DISCUSS: 'DAY_DISCUSS',
  DAY_VOTE: 'DAY_VOTE',
  RESOLVE_VOTE: 'RESOLVE_VOTE',
  ENDED: 'ENDED',
};

export const NIGHT_PHASES = new Set([
  PHASES.NIGHT_MAFIA,
  PHASES.NIGHT_DOCTOR,
  PHASES.NIGHT_DETECTIVE,
]);

// ==================== ROLE DISTRIBUTIONS ====================
// Key = player count, value = role counts

export const ROLE_DISTRIBUTIONS = {
  5: { MAFIA: 1, DOCTOR: 1, DETECTIVE: 0, CITIZEN: 3 },
  6: { MAFIA: 2, DOCTOR: 1, DETECTIVE: 0, CITIZEN: 3 },
  7: { MAFIA: 2, DOCTOR: 1, DETECTIVE: 1, CITIZEN: 3 },
  8: { MAFIA: 3, DOCTOR: 1, DETECTIVE: 1, CITIZEN: 3 },
  9: { MAFIA: 3, DOCTOR: 1, DETECTIVE: 1, CITIZEN: 4 },
  10: { MAFIA: 3, DOCTOR: 1, DETECTIVE: 1, CITIZEN: 5 },
  11: { MAFIA: 3, DOCTOR: 1, DETECTIVE: 1, CITIZEN: 6 },
  12: { MAFIA: 4, DOCTOR: 1, DETECTIVE: 1, CITIZEN: 6 },
  13: { MAFIA: 4, DOCTOR: 1, DETECTIVE: 1, CITIZEN: 7 },
  14: { MAFIA: 4, DOCTOR: 1, DETECTIVE: 1, CITIZEN: 8 },
  15: { MAFIA: 4, DOCTOR: 1, DETECTIVE: 1, CITIZEN: 9 },
};

function validateRoleDistributions() {
  const mafiaConfig = GAMES.MAFIA;
  if (!mafiaConfig) return;

  for (let count = mafiaConfig.minPlayers; count <= mafiaConfig.maxPlayers; count++) {
    const dist = ROLE_DISTRIBUTIONS[count];
    if (!dist) {
      throw new Error(`[Mafia] Missing role distribution for ${count} players`);
    }

    const total = dist.MAFIA + dist.DOCTOR + dist.DETECTIVE + dist.CITIZEN;
    if (total !== count) {
      throw new Error(`[Mafia] Invalid role distribution total for ${count} players (got ${total})`);
    }
  }
}

validateRoleDistributions();

// ==================== BUTTON ACTIONS ====================

export const ACTIONS = {
  ROLE: 'role',
  NIGHT_OPEN: 'night_open',
  MAFIA_VOTE: 'mafia_vote',
  DOCTOR_PROTECT: 'doctor_protect',
  DETECTIVE_CHECK: 'detective_check',
  VOTE: 'vote',
  VOTE_SKIP: 'vote_skip',
  HINT: 'hint',
};

// ==================== TIMERS ====================

export const TIMERS = { ...MAFIA_TIMERS };

// ==================== HINT ====================

export const HINT_COST = 100;
export const MAX_HINTS_PER_PLAYER_PER_ROUND = 1;

// ==================== DEAD WINNER PAYOUT ====================

export const DEAD_WINNER_RATIO = 0.30;

// ==================== THROTTLE ====================

export const VOTE_EDIT_THROTTLE_MS = 750;

const NIGHT_MAFIA_SECONDS = Math.floor(TIMERS.NIGHT_MAFIA_MS / 1000);
const NIGHT_DOCTOR_SECONDS = Math.floor(TIMERS.NIGHT_DOCTOR_MS / 1000);
const NIGHT_DETECTIVE_SECONDS = Math.floor(TIMERS.NIGHT_DETECTIVE_MS / 1000);
const DAY_DISCUSS_SECONDS = Math.floor(TIMERS.DAY_DISCUSS_MS / 1000);
const DAY_VOTE_SECONDS = Math.floor(TIMERS.DAY_VOTE_MS / 1000);

// ==================== INACTIVITY LIMITS ====================

export const MAFIA_MAX_MISSES = 2; // Mafia loses if they miss 2 consecutive nights

// ==================== SILENT PHASE ====================

export const SILENT_PHASE_DURATION = {
  MIN_MS: 10000,
  MAX_MS: 25000,
};

// ==================== MESSAGES ====================

export const MESSAGES = {
  // Game start
  ROLES_DISTRIBUTED: '✅ تم توزيع الرتب على اللاعبين، ستبدأ الجولة الأولى في بضع ثواني...',
  TEAMS_CAPTION: '🧩 تم تقسيم الأدوار على الفريقين',
  CONTROL_PANEL_INTRO: '🎭 اضغط زر (رتبتك) لمعرفة رتبتك بشكل خاص\n🌙 أثناء الليل اضغط زر (إجراءات الليل) لتنفيذ دورك',
  ROUND_START: (n) => `🕯️ **الجولة ${n}** بدأت...`,

  // Night phases - public status
  NIGHT_MAFIA_STATUS: '🗡 جاري انتظار المافيا لاختيار شخص لقتله...',
  NIGHT_DOCTOR_STATUS: '💊 جاري انتظار الطبيب لاختيار شخص لحمايته...',
  NIGHT_DETECTIVE_STATUS: '🔍 جاري انتظار المحقق لاختيار شخص للتحقق...',
  RESOLVING_NIGHT: '🌙 يتم الآن تنفيذ أحداث الليل...',

  // Night resolved - public
  MAFIA_CHOSE: '🗡 اختارت المافيا الشخص الذي سيتم اغتياله ...',
  DOCTOR_CHOSE: '💊 اختار الطبيب الشخص الذي سيحميه من اغتيال المافيا',
  KILL_SAVED: (mention) => `🛡️ فشلت عملية المافيا، لقد تم حماية ${mention} بواسطة الطبيب`,
  KILL_SUCCESS: (mention, role) => `⚰️ نجحت عملية المافيا وتم قتل ${mention} وهذا الشخص كان **${role}**`,

  // Day phases
  DAY_DISCUSS: `🔎 لديكم ${DAY_DISCUSS_SECONDS} ثانية للتحقق بين اللاعبين ومعرفة المافيا للتصويت على طرده من اللعبة`,
  DAY_VOTE_TITLE: '🗳️ **التصويت**',
  DAY_VOTE_PROMPT: `لديكم ${DAY_VOTE_SECONDS} ثانية لاختيار شخص لطرده من اللعبة`,
  RESOLVING_VOTE: '🗳️ يتم الآن احتساب الأصوات...',

  // Vote results
  VOTE_SKIP: 'تم تخطي هذه الجولة، لم يتم طرد أي لاعب',
  VOTE_TIE: 'تعادل في التصويت، لم يتم طرد أي لاعب هذه الجولة',
  VOTE_EXPEL: (mention, role) => `💣 تم التصويت على طرد ${mention} وكان هذا الشخص **${role}**`,

  // Game end
  TEAM1_WIN: '🏆 فاز الفريق الاول',
  TEAM2_WIN: '🏆 فاز الفريق الثاني',
  WINNERS_LINE: (mentions) => `${mentions} - 👑 فازوا باللعبة!`,
  GAME_ENDED: '🏁 انتهت اللعبة',

  // Timer
  TIMER: (epoch) => `⏱️ ينتهي الوقت <t:${epoch}:R>`,

  // Ephemeral - role reveal
  ROLE_CITIZEN: '👤 **رتبتك: مواطن**\nهدفك: كشف المافيا قبل أن يقتلوكم.\nفي النهار: ناقش وصوّت لطرد المافيا.',
  ROLE_DOCTOR: '💊 **رتبتك: طبيب**\nكل ليلة اختر لاعبًا لحمايته (يمكنك حماية نفسك).\nممنوع: لا يمكنك حماية نفس اللاعب ليلتين متتاليتين.',
  ROLE_DETECTIVE: '🔍 **رتبتك: محقق**\nكل ليلة اختر لاعبًا للتحقق منه.\nستظهر لك نتيجة التحقيق بشكل خاص.',
  ROLE_MAFIA: (teammates) => `🗡 **رتبتك: مافيا**\nاتفقوا على اغتيال لاعب كل ليلة.\nأعضاء المافيا: ${teammates}`,

  // Ephemeral - night actions
  MAFIA_ACTION_TITLE: '🗡 **دور المافيا**',
  MAFIA_ACTION_PROMPT: (epoch) => `لديك ${NIGHT_MAFIA_SECONDS} ثانية لاختيار شخص لاغتياله\n⏱️ ينتهي الوقت <t:${epoch}:R>`,
  DOCTOR_ACTION_TITLE: '💊 **أنت الطبيب**',
  DOCTOR_ACTION_PROMPT: (epoch) => `لديك ${NIGHT_DOCTOR_SECONDS} ثانية لاختيار شخص لحمايته\n⏱️ ينتهي الوقت <t:${epoch}:R>\nممنوع: لا يمكنك حماية نفس اللاعب ليلتين متتاليتين`,
  DETECTIVE_ACTION_TITLE: '🔍 **أنت المحقق**',
  DETECTIVE_ACTION_PROMPT: (epoch) => `لديك ${NIGHT_DETECTIVE_SECONDS} ثانية لاختيار شخص للتحقق\n⏱️ ينتهي الوقت <t:${epoch}:R>`,
  DETECTIVE_LAST_RESULT: (text) => `نتيجة آخر تحقيق: ${text || '—'}`,
  CURRENT_PICK: (mention) => `اختيارك الحالي: ${mention || 'لم تختر بعد'}`,
  VOTE_CONFIRMED: (mention) => `✅ تم تسجيل تصويتك لقتل ${mention}`,
  PROTECT_CONFIRMED: (mention) => `✅ تم تسجيل حمايتك لـ ${mention}`,
  CHECK_CONFIRMED: (mention) => `✅ تم تسجيل تحقيقك على ${mention}`,
  CHECK_RESULT: (mention, role) => `🔍 نتيجة التحقيق: ${mention} هو (${role})`,

  // Ephemeral - hint
  HINT_BOUGHT: (m, c) => `✅ تم شراء تلميح (-${HINT_COST} 🪙)\n🔎 تلميح: أحد هؤلاء مافيا: ${m} أو ${c}`,

  // Ephemeral - errors (exact strings from spec)
  NOT_IN_GAME: '❌ أنت لست في هذه اللعبة',
  GAME_EXPIRED: '⏰ انتهت هذه اللعبة',
  DEAD_BLOCKED: '💀 أنت ميت ولا يمكنك التفاعل مع اللعبة',
  WRONG_PHASE: '❌ لا يمكنك الضغط الآن',
  NOT_YOUR_TURN: '❌ ليس دورك الآن',
  INVALID_TARGET: '❌ هذا الهدف غير صالح',
  CANNOT_PROTECT_SAME_TWICE: '❌ لا يمكنك حماية نفس اللاعب مرتين متتاليتين',
  HINT_WRONG_PHASE: '❌ التلميح متاح فقط أثناء التصويت',
  HINT_ALREADY_USED: '❌ استخدمت تلميح هذه الجولة بالفعل',
  HINT_NO_BALANCE: (needed, have) => `❌ رصيدك غير كافٍ! تحتاج: ${needed} | لديك: ${have}`,

  // Cancellation
  GAME_CANCELLED: '❌ تم إلغاء اللعبة',
};

// ==================== EMBED COLORS ====================

export const COLORS = {
  NIGHT: 0x2C2F33,    // Dark gray
  DAY: 0xF1C40F,      // Yellow
  TEAM1_WIN: 0x3CFF6B, // Green
  TEAM2_WIN: 0xFF3C3C,  // Red
  ERROR: 0xED4245,     // Red
  INFO: 0x5865F2,      // Blurple
};
