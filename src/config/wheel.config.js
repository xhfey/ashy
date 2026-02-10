// ============================================================
// WHEEL VISUAL CONFIG
// Change these values to customize the wheel appearance.
// To use custom images: replace the PNG files in the assets
// folder and update the paths below if needed.
// ============================================================

export const WHEEL_CONFIG = {
  // -- IMAGES --
  // Point these to your own PNGs (relative to project root)
  assets: {
    background: 'assets/images/roulette-wheel/roulette-wheel-bg.png',    // 550x550, transparent center
    frame:      'assets/images/roulette-wheel/roulette-wheel-frame.png',  // 550x550, transparent center
    center:     'assets/images/roulette-wheel/roulette-wheel-center.png', // 140x140, your logo/emblem
    pointer:    'assets/images/roulette-wheel/roulette-wheel-pointer.png', // arrow pointing LEFT
  },

  // -- CANVAS --
  canvas: {
    size: 550,                // Output GIF size (square)
    supersample: 2,           // Render quality multiplier (2 = crisp anti-aliased, 1 = fast)
    backgroundColor: '#1a1a2e',
  },

  // -- WHEEL GEOMETRY --
  wheel: {
    outerRadius: 235,
    innerRadius: 60,
    textRadius: 165,
  },

  // -- POINTER POSITION (on the canvas) --
  pointer: { x: 440, y: 255, width: 60, height: 40 },

  // -- CENTER EMBLEM POSITION --
  centerEmblem: { x: 205, y: 205, width: 140, height: 140 },

  // -- SEGMENT COLORS (cycle through for players) --
  segmentColors: [
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
  ],

  // -- SEGMENT STYLE --
  segment: {
    borderColor: '#1A1A1A',
    borderWidth: 2,
    gradient: {
      innerBrighten: 15,    // % brighter at inner edge (3D highlight)
      outerDarken: -20,     // % darker at outer edge (3D shadow)
      highlightStop: 0.3,   // Where the highlight transitions to true color
    },
  },

  // -- TEXT --
  text: {
    fontFamily: 'Cairo',
    color: '#ECECED',
    strokeColor: '#000000',
    strokeWidth: 3,
    shadow: {
      color: 'rgba(0,0,0,0.6)',
      blur: 4,
      offsetX: 1,
      offsetY: 1,
    },
    maxLength: 12,
    darkTextColor: '#1A1A1A',
    luminanceThreshold: 0.5,
    sizes: {
      large: 16,      // <= 8 players, short names
      medium: 14,     // <= 12 players or medium names
      small: 12,      // long names
      tiny: 11,       // > 12 players
    },
  },

  // -- ANIMATION --
  animation: {
    fps: 20,                 // Target FPS (higher = smoother)
    totalSpins: 4,           // Full rotations before stopping
    durationSec: 2.2,        // Seconds of spinning
    anticipation: {
      frames: 4,             // Wind-back frames before spin
      degrees: -12,          // Wind-back angle
      delayMs: 55,           // ms per anticipation frame
    },
    celebration: {
      frames: 14,            // Winner highlight frames
      delayMs: 45,           // ms per celebration frame
    },
    hold: {
      frames: 3,             // Hold on landing before celebration
      delayMs: 60,           // ms per hold frame
    },
    spinDelays: [
      { upTo: 0.2, delay: 30 },   // Fast start
      { upTo: 0.5, delay: 35 },   // Constant speed
      { upTo: 0.8, delay: 45 },   // Decelerating
      { upTo: 1.0, delay: 55 },   // Final slow
    ],
  },

  // -- EASING (how the wheel decelerates) --
  easing: {
    rampEnd: 0.15,           // End of acceleration phase (0-1)
    decayStart: 0.45,        // Start of deceleration phase (0-1)
    decayExponent: 4,        // Higher = heavier friction feel
  },

  // -- MOTION BLUR --
  motionBlur: {
    layers: 4,               // Ghost trail layers (more = smoother blur)
    maxOffset: 4,            // Max angular offset in degrees
    baseAlpha: 0.12,         // Alpha of closest ghost layer
    alphaFalloff: 0.6,       // Each layer multiplied by this
    speedThreshold: 80,      // Min deg/sec to activate blur
    speedCap: 500,           // Blur maxes out at this speed
  },

  // -- TICK EFFECT (segment clicking near the end) --
  tick: {
    progressThreshold: 0.85, // Start ticking at this progress (0-1)
    speedThreshold: 300,     // deg/sec below which ticking activates
  },

  // -- WINNER GLOW --
  winner: {
    glowColor: '#FFD700',
    glowMaxBlur: 35,
    glowLineWidth: 5,
    fadeInFrames: 6,         // Frames to fade glow from 0 to full
    pulseAmplitude: 0.15,    // Brightness oscillation (0-1)
    pulseFrequency: 2,       // Full pulse cycles during celebration
  },

  // -- FALLBACK COLORS (when images are missing) --
  fallback: {
    frameStroke: '#FFD700',
    frameLineWidth: 8,
    centerFill: '#2a2a4a',
    centerStroke: '#FFD700',
    centerLineWidth: 3,
    centerRadius: 50,
    pointerFill: '#FFD700',
    pointerStroke: '#000000',
    pointerLineWidth: 2,
  },

  // -- GIF ENCODER --
  encoder: {
    quality: 8,              // 1-30, lower = better color (slower)
    repeat: -1,              // -1 = play once, 0 = loop forever
  },
};
