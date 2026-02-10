/**
 * Centralized Timer Configuration
 *
 * All game timer durations in one place.
 * Individual game constant files re-export from here for backward compatibility.
 */

// ==================== LOBBY COUNTDOWNS (seconds) ====================

export const LOBBY_COUNTDOWN = {
  DICE: 30,
  ROULETTE: 60,
  DEFAULT: 30,
};

// ==================== DICE GAME TIMERS ====================

export const DICE_TIMERS = {
  TURN_MS: 20_000,     // 20s for roll/skip decision
  BLOCK_MS: 15_000,    // 15s to choose block target
  WARNING_MS: 5_000,   // Hurry-up warning fires at 5s remaining
};

// ==================== ROULETTE GAME TIMERS ====================

export const ROULETTE_TIMERS = {
  KICK_MS: 15_000,             // 15s to pick target
  RESULT_DELAY_MS: 2_000,     // 2s pause before next turn
  CELEBRATION_DELAY_MS: 1_500, // 1.5s celebration
  WARNING_MS: 5_000,           // Hurry-up warning fires at 5s remaining
};

// ==================== MAFIA GAME TIMERS ====================

export const MAFIA_TIMERS = {
  NIGHT_MAFIA_MS: 20_000,      // 20s for mafia to vote on kill target
  NIGHT_DOCTOR_MS: 20_000,     // 20s for doctor to choose protection
  NIGHT_DETECTIVE_MS: 20_000,  // 20s for detective to investigate
  DAY_DISCUSS_MS: 15_000,      // 15s discussion before voting
  DAY_VOTE_MS: 20_000,         // 20s for day voting
  ROLE_REVEAL_MS: 5_000,       // 5s pause for role reveal
  RESOLVE_DELAY_MS: 2_000,     // 2s pause for dramatic effect
};
