/**
 * Mafia Visual Configuration V2 — Premium Quality
 * Canvas layout, colors, fonts, panel configs, and asset paths for image generation
 */

export const MAFIA_VISUAL_CONFIG = {
  enabled: true,

  // ==================== CANVAS ====================
  canvas: {
    width: 1536,
    height: 1024,
    supersample: 2,
    // Dynamic height: when teams banner spills to a second row
    dynamicHeightThreshold: 4,
    dynamicHeightIncrease: 320,
  },

  // ==================== ASSETS ====================
  assets: {
    background: 'assets/images/mafia/mafia-bg.png',
    mafiaIcon: 'assets/images/mafia/mafia-role-icon.png',
    citizenIcon: 'assets/images/mafia/mafia-citizen-icon.png',
    doctorIcon: 'assets/images/mafia/mafia-doctor-icon.png',
    detectiveIcon: 'assets/images/mafia/mafia-detective-icon.png',
  },

  // ==================== FONTS ====================
  fonts: {
    // Readability-first stack with broad Arabic/Latin/symbol support.
    title: '"Noto Sans Arabic UI", "Noto Sans", "Noto Sans Symbols 2", "Cairo", "Arial"',
    label: '"Noto Sans Arabic UI", "Noto Sans", "Noto Sans Symbols 2", "Cairo", "Arial"',
    body: '"Noto Sans Arabic UI", "Noto Sans", "Noto Sans Symbols 2", "Cairo", "Arial"',
    small: '"Noto Sans Arabic UI", "Noto Sans", "Noto Sans Symbols 2", "Cairo", "Arial"',
  },

  // ==================== COLORS ====================
  colors: {
    // Team 1 — Citizens (soft green)
    team1: '#4ADE80',
    team1RGB: [74, 222, 128],
    team1Glow: 'rgba(74, 222, 128, 0.5)',

    // Team 2 — Mafia (warm red)
    team2: '#EF4444',
    team2RGB: [239, 68, 68],
    team2Glow: 'rgba(239, 68, 68, 0.5)',

    // Text
    titleCore: '#FFFFFF',          // White core for neon text
    roleText: '#F2F4F8',
    playerName: '#F6F8FC',
    dimmedText: 'rgba(232,236,245,0.72)',

    // Gold palette
    gold: '#FFD700',
    goldRGB: [255, 215, 0],
    goldGlow: 'rgba(255, 215, 0, 0.4)',
    goldMetallic: '#D4AF37',

    // Misc
    detectiveFallbackBg: '#1a1a3e',
    detectiveFallbackBorder: '#5865F2',
    defaultAvatarBg: '#5865F2',
  },

  // ==================== NEON GLOW SYSTEM ====================
  neonGlow: {
    layers: 3,           // Number of glow passes
    maxBlur: 18,
    minBlur: 3,
    coreBlur: 1.5,
    outlineWidth: 1,
  },

  // ==================== VIGNETTE ====================
  vignette: {
    intensity: 0.34,
    innerRatio: 0.35,    // Inner radius as % of canvas diagonal
    outerRatio: 0.95,    // Outer radius as % of canvas diagonal
  },

  // ==================== FILM GRAIN ====================
  filmGrain: {
    enabled: true,
    density: 0.004,
    maxAlpha: 0.02,
    dotSize: 1,
  },

  // ==================== GLASS PANELS ====================
  panels: {
    cornerRadius: 18,
    borderAlpha: 0.06,
    innerGlowAlpha: 0.025,
    // Per-section alphas
    teamSection: 0.30,
    objectives: 0.34,
    titleArea: 0.22,
    winnersArea: 0.30,
    losersArea: 0.26,
  },

  // ==================== TEAMS BANNER ====================
  teamLabels: {
    team2: { x: 356, y: 130 },    // Mafia — left side
    team1: { x: 1180, y: 130 },   // Citizens — right side
    fontSize: 52,
  },

  icons: {
    offsetY: 150,          // px below team label center
    spacingX: 190,
    minSpacingX: 125,
    size: 170,
    maxPerRow: 4,
    rowGap: 220,
  },

  roleText: {
    offsetY: 108,
    fontSize: 32,
  },

  objectives: {
    fontSize: 24,
    y: 940,
    team1: { x: 1200 },
    team2: { x: 336 },
  },

  vsSeparator: {
    x: 768,               // Center of 1536 canvas
    y: 320,               // Vertically centered with icons
    fontSize: 42,
  },

  overlayAlpha: {
    teams: 0.12,
    win: 0.14,
  },

  // ==================== WIN BANNER ====================
  winBanner: {
    // Trophy (canvas-drawn star + laurel wreath)
    trophy: { y: 55, size: 55 },

    // Title
    title: {
      y: 125,
      fontSize: 58,
      subtitleY: 185,
      subtitleFontSize: 30,
    },

    // Divider
    dividerY: 225,

    // Winners section
    winners: {
      labelY: 270,
      labelFontSize: 38,
      avatarY: 400,
      avatarSize: 126,
      avatarSpacing: 185,
      borderWidth: 4,
      roleIconSize: 56,
      roleIconOffsetY: 96,
      nameOffsetY: 142,
      nameFontSize: 28,
      nameMaxChars: 11,
      maxPerRow: 4,
      rowGap: 220,
    },

    // Losers section
    losers: {
      labelY: 600,
      labelFontSize: 30,
      avatarY: 690,
      avatarSize: 92,
      avatarSpacing: 145,
      borderWidth: 3,
      roleIconSize: 44,
      roleIconOffsetY: 68,
      nameOffsetY: 106,
      nameFontSize: 22,
      nameMaxChars: 10,
      dimAlpha: 0.52,
      maxPerRow: 4,
      rowGap: 170,
    },

    // Footer
    footer: { y: 870, fontSize: 26 },

    // Accent glow bars (top + bottom)
    accentBarHeight: 4,
  },

  // ==================== NEON RING (avatars) ====================
  neonRing: {
    passes: 3,
    maxLineWidth: 8,
    minLineWidth: 2,
    glowAlpha: 0.14,
  },
};

export default MAFIA_VISUAL_CONFIG;
