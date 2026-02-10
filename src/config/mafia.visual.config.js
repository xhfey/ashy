/**
 * Mafia Visual Configuration
 * Canvas layout, colors, fonts, and asset paths for image generation
 */

export const MAFIA_VISUAL_CONFIG = {
  enabled: true,

  // Canvas dimensions (matches background image)
  canvas: {
    width: 1536,
    height: 1024,
    supersample: 2,
  },

  // Asset paths (relative to project root)
  assets: {
    background: 'assets/images/mafia/mafia-bg.png',
    mafiaIcon: 'assets/images/mafia/mafia-role-icon.png',
    citizenIcon: 'assets/images/mafia/mafia-citizen-icon.png',
    doctorIcon: 'assets/images/mafia/mafia-doctor-icon.png',
    detectiveIcon: null, // Not yet provided, uses canvas fallback in drawDetectiveFallback()
  },

  // ==================== TEAMS BANNER ====================

  // Team label positions (center-aligned text anchors)
  teamLabels: {
    team2: { x: 356, y: 140 },   // Mafia — red glow (left side)
    team1: { x: 1101, y: 140 },  // Citizens — green (right side)
    fontSize: 48,                 // Bigger than before (was 42)
  },

  // Role icon layout — now shows one icon PER player (not grouped with ×N)
  icons: {
    offsetY: 140,       // px below team label center for icon row
    spacingX: 130,      // px between icon centers (horizontal)
    minSpacingX: 75,    // minimum spacing when many icons (adaptive)
    size: 110,          // rendered icon diameter (was 70 — much bigger now)
    borderWidth: 3,
  },

  // Role text below icons
  roleText: {
    offsetY: 70,        // px below icon center
    fontSize: 22,
  },

  // Team objective text at bottom corners (Fizbo style)
  objectives: {
    fontSize: 22,
    y: 940,
    team1: { x: 1200 },    // Right side — citizens objective
    team2: { x: 336 },     // Left side — mafia objective
  },

  // ==================== WIN BANNER ====================

  winBanner: {
    overlayAlpha: 0.40,

    // Trophy (canvas-drawn gold star, no emoji)
    trophy: { y: 50, size: 50 },

    // Title
    title: {
      y: 110,
      fontSize: 58,
      subtitleY: 170,
      subtitleFontSize: 30,
    },

    // Divider
    dividerY: 210,

    // Winners section
    winners: {
      labelY: 260,
      labelFontSize: 32,
      avatarY: 380,
      avatarSize: 110,
      avatarSpacing: 145,
      borderWidth: 4,
      roleIconSize: 38,
      roleIconOffsetY: 78,
      nameOffsetY: 108,
      nameFontSize: 20,
    },

    // Losers section
    losers: {
      labelY: 580,
      labelFontSize: 26,
      avatarY: 670,
      avatarSize: 76,
      avatarSpacing: 110,
      borderWidth: 3,
      roleIconSize: 30,
      roleIconOffsetY: 55,
      nameOffsetY: 80,
      nameFontSize: 16,
      dimAlpha: 0.45,
    },

    // Footer
    footer: { y: 850, fontSize: 24 },

    // Accent glow bars (top + bottom)
    accentBarHeight: 5,

    // Default avatar fallback
    defaultAvatarBg: '#5865F2',
  },

  // ==================== COLORS ====================

  colors: {
    team1: '#3CFF6B',
    team1Glow: 'rgba(60, 255, 107, 0.6)',
    team2: '#FF3C3C',
    team2Glow: 'rgba(255, 60, 60, 0.6)',
    roleText: '#FFFFFF',
    countText: '#FFD700',
    labelOutline: 'rgba(0, 0, 0, 0.5)',
    detectiveFallbackBg: '#1a1a3e',
    detectiveFallbackBorder: '#5865F2',
  },

  // Font stacks
  fonts: {
    label: '"Cairo", "Arial"',
    role: '"Cairo", "Arial"',
  },
};

export default MAFIA_VISUAL_CONFIG;
