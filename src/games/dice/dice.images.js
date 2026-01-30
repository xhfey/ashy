/**
 * Dice Game Image Generation
 * Visual Overhaul: Custom fonts, glow effects, and smart layout
 * Advanced Effects: Supersampling, colored glows, team colors, rank badges
 */

import { createCanvas, loadImage, registerFont } from 'canvas';
import { DICE_IMAGES } from './dice.constants.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imageCache = new Map();

// ==================== AUTOMATIC CACHE CLEANUP ====================
// Clear image cache every 6 hours to prevent memory leaks
const CACHE_CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

setInterval(() => {
  if (imageCache.size > 0) {
    console.log(`[DiceImages] Clearing image cache (${imageCache.size} images)`);
    imageCache.clear();
  }
}, CACHE_CLEANUP_INTERVAL);

// Register Custom Fonts
try {
  const fontPath = path.join(__dirname, '../../../assets/fonts');
  registerFont(path.join(fontPath, 'Cinzel-Bold.ttf'), { family: 'Cinzel', weight: '700' });
  registerFont(path.join(fontPath, 'Cairo-Bold.ttf'), { family: 'Cairo', weight: '700' });
  registerFont(path.join(fontPath, 'RobotoMono-Bold.ttf'), { family: 'Roboto Mono', weight: '700' });
} catch (e) {
  console.warn('Failed to register custom fonts, falling back to system fonts:', e.message);
}

// Layout constants
const LAYOUT = {
  WIDTH: 1536,
  HEIGHT: 1024,

  SCORE_TEAM_A: { x: 500, y: 200 },
  SCORE_TEAM_B: { x: 1032, y: 200 },
  ROUND_TEXT: { x: 768, y: 350 },

  TEAM_A_SLOTS: [
    { name: { x: 385, y: 482 }, score: { x: 700, y: 484 }, dice: { x: 67, y: 476 }, special: { x: 122, y: 508 } },
    { name: { x: 385, y: 576 }, score: { x: 700, y: 578 }, dice: { x: 67, y: 576 }, special: { x: 127, y: 602 } },
    { name: { x: 385, y: 670 }, score: { x: 700, y: 672 }, dice: { x: 67, y: 670 }, special: { x: 127, y: 696 } },
    { name: { x: 385, y: 764 }, score: { x: 700, y: 766 }, dice: { x: 67, y: 764 }, special: { x: 127, y: 790 } },
    { name: { x: 385, y: 858 }, score: { x: 700, y: 860 }, dice: { x: 67, y: 858 }, special: { x: 127, y: 884 } },
  ],

  TEAM_B_SLOTS: [
    { name: { x: 1124, y: 484 }, score: { x: 838, y: 484 }, dice: { x: 1473, y: 482 }, special: { x: 1419, y: 512 } },
    { name: { x: 1127, y: 578 }, score: { x: 838, y: 578 }, dice: { x: 1473, y: 575 }, special: { x: 1419, y: 604 } },
    { name: { x: 1127, y: 672 }, score: { x: 838, y: 672 }, dice: { x: 1473, y: 669 }, special: { x: 1419, y: 698 } },
    { name: { x: 1127, y: 766 }, score: { x: 838, y: 766 }, dice: { x: 1473, y: 763 }, special: { x: 1419, y: 792 } },
    { name: { x: 1127, y: 860 }, score: { x: 838, y: 860 }, dice: { x: 1473, y: 857 }, special: { x: 1419, y: 886 } },
  ],

  DICE_SIZE: 80,
  SPECIAL_SIZE: 35,
};

const COLORS = {
  SCORE: '#FFD700',
  NAME: '#FFFFFF',
  POSITIVE: '#4ECB71',
  NEGATIVE: '#E74C3C',
  TEAM_A: '#4A90E2',  // Blue
  TEAM_B: '#E24A4A',  // Red
};

// Toggle visual glow effects
const ENABLE_GLOW = false;

// Font Stacks
const FONTS = {
  NAMES: '"Cinzel", "Cairo", "Arial"',
  SCORES: '"Roboto Mono", "Cairo", "Arial"',
  FALLBACK: 'Arial'
};

// Supersampling scale
const RENDER_SCALE = 2;

/**
 * Load image with caching
 */
async function loadCachedImage(imagePath) {
  if (!imagePath) return null;
  if (imageCache.has(imagePath)) return imageCache.get(imagePath);

  try {
    const fullPath = path.join(__dirname, '../../../', imagePath);
    const img = await loadImage(fullPath);
    imageCache.set(imagePath, img);
    return img;
  } catch (error) {
    console.error(`Failed to load image: ${imagePath}`, error.message);
    return null;
  }
}

function getDiceImagePath(value) {
  if (DICE_IMAGES[value]) return DICE_IMAGES[value];
  if (typeof value === 'number' && value >= 1 && value <= 6) return DICE_IMAGES[value];
  return DICE_IMAGES[1];
}

function getSpecialIconKey(meta) {
  if (!meta || !meta.outcomeType) return null;
  if (['SKIP', 'NORMAL'].includes(meta.outcomeType)) return null;
  if (meta.outcomeType === 'MODIFIER') return meta.outcomeDisplay;
  return meta.outcomeType;
}

// ==================== VISUAL HELPERS ====================

function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ell = '…';
  let t = text;
  while (t.length > 1 && ctx.measureText(t + ell).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + ell;
}

function fitFontSize(ctx, text, fontString, startPx, minPx, maxWidth) {
  let px = startPx;
  while (px > minPx) {
    ctx.font = `700 ${px}px ${fontString}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= 1;
  }
  return px;
}

/**
 * Get contextual glow color based on dice value or outcome
 */
function getContextualGlow(value, meta) {
  // Special outcomes get special glows
  if (meta && meta.outcomeType) {
    if (meta.outcomeType === 'X2') return 'rgba(255, 215, 0, 0.8)'; // Golden
    if (meta.outcomeType === 'BLOCK') return 'rgba(138, 43, 226, 0.7)'; // Purple
    if (meta.outcomeType === 'ZERO') return 'rgba(220, 20, 60, 0.7)'; // Crimson
    if (meta.outcomeType === 'MODIFIER') {
      if (meta.outcomeDisplay.startsWith('+')) return 'rgba(78, 203, 113, 0.6)'; // Green
      return 'rgba(231, 76, 60, 0.6)'; // Red
    }
  }

  // Regular dice: high rolls = green, low rolls = red
  if (value === 6) return 'rgba(78, 203, 113, 0.5)';
  if (value === 1) return 'rgba(231, 76, 60, 0.5)';

  return 'rgba(0, 0, 0, 0.65)'; // Default
}

function drawGlowyText(ctx, text, x, y, options = {}) {
  const {
    font,
    color = '#FFFFFF',
    align = 'center',
    baseline = 'middle',
    glow = 'rgba(0,0,0,0.65)',
    glowBlur = 10,
    outline = 'rgba(0,0,0,0.35)',
    outlineWidth = 1.25,
  } = options;

  ctx.save();
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;

  // Glow
  if (ENABLE_GLOW && glowBlur > 0) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = glowBlur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  // Fill
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);

  // Thin outline (optional)
  if (outlineWidth > 0) {
    ctx.shadowBlur = 0;
    ctx.lineWidth = outlineWidth;
    ctx.strokeStyle = outline;
    ctx.strokeText(text, x, y);
  }

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawPill(ctx, cx, cy, w, h, options = {}) {
  const {
    fill = 'rgba(0,0,0,0.35)',
    stroke = 'rgba(255,255,255,0.12)',
    strokeWidth = 1,
  } = options;

  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.save();
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw subtle radial gradient overlay for depth
 */
function drawGradientOverlay(ctx, width, height) {
  const overlay = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
  overlay.addColorStop(0, 'rgba(255,255,255,0.05)');
  overlay.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Draw glowing ring around special dice
 */
function drawGlowingRing(ctx, x, y, radius, glowColor) {
  if (!ENABLE_GLOW) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = 3;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 20;
  ctx.stroke();
  ctx.restore();
}

function drawPlayerName(ctx, name, slot, align, teamColor) {
  // Name box derived from dice + score positions
  const pad = 22;
  let x, maxW;

  if (align === 'left') {
    const left = slot.dice.x + (LAYOUT.DICE_SIZE / 2) + pad;
    const right = slot.score.x - 90;
    x = left;
    maxW = Math.max(50, right - left);
  } else {
    // Right alignment (Team B)
    const right = slot.dice.x - (LAYOUT.DICE_SIZE / 2) - pad;
    const left = slot.score.x + 90;
    x = right;
    maxW = Math.max(50, right - left);
  }

  const startPx = 40;
  const minPx = 26;
  const px = fitFontSize(ctx, name, FONTS.NAMES, startPx, minPx, maxW);
  const font = `700 ${px}px ${FONTS.NAMES}`;

  ctx.font = font;
  const safeName = ellipsize(ctx, name, maxW);

  // Use team color for glow
  drawGlowyText(ctx, safeName, x, slot.name.y, {
    font: font,
    color: '#F5F7FF',
    align: align,
    glowBlur: 10,
    glow: teamColor ? `${teamColor}66` : 'rgba(0,0,0,0.65)', // Add alpha
    outlineWidth: 1.1,
  });
}

/**
 * Find top scorer in team and return their index
 */
function getTopScorerIndex(team, round) {
  let maxScore = -Infinity;
  let topIndex = -1;

  team.forEach((player, i) => {
    const score = player.roundScores ? (player.roundScores[round - 1] || 0) : 0;
    if (score > maxScore) {
      maxScore = score;
      topIndex = i;
    }
  });

  return maxScore > 0 ? topIndex : -1;
}

function sumTeamRounds(team, round) {
  if (!Array.isArray(team) || !Number.isFinite(round) || round < 1) return 0;
  let total = 0;
  for (const player of team) {
    const scores = Array.isArray(player?.roundScores) ? player.roundScores : [];
    for (let i = 0; i < round && i < scores.length; i++) {
      const val = Number(scores[i] || 0);
      if (Number.isFinite(val)) total += val;
    }
  }
  return total;
}

/**
 * Downscale canvas for supersampling
 */
function downsampleCanvas(sourceCanvas, targetWidth, targetHeight) {
  const finalCanvas = createCanvas(targetWidth, targetHeight);
  const finalCtx = finalCanvas.getContext('2d');
  finalCtx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
  return finalCanvas;
}

// ==================== EXPORTS ====================

export async function generateDiceImage(value) {
  const canvas = createCanvas(150, 150);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, 150, 150);

  const imagePath = getDiceImagePath(value);
  const diceImg = await loadCachedImage(imagePath);

  if (diceImg) {
    ctx.drawImage(diceImg, 15, 15, 120, 120);
  } else {
    drawGlowyText(ctx, String(value), 75, 75, {
      font: 'bold 60px Arial'
    });
  }

  return canvas.toBuffer('image/png');
}

export async function generateRoundSummary(roundData) {
  const { round, teamA, teamB, teamAScore, teamBScore } = roundData;
  const hasRoundScores = [...teamA, ...teamB].some(
    (player) => Array.isArray(player?.roundScores) && player.roundScores.length > 0
  );
  const totalTeamA = hasRoundScores ? sumTeamRounds(teamA, round) : teamAScore;
  const totalTeamB = hasRoundScores ? sumTeamRounds(teamB, round) : teamBScore;

  // Render at 2x scale
  const renderCanvas = createCanvas(LAYOUT.WIDTH * RENDER_SCALE, LAYOUT.HEIGHT * RENDER_SCALE);
  const ctx = renderCanvas.getContext('2d');
  ctx.scale(RENDER_SCALE, RENDER_SCALE);

  // Background
  const bgImg = await loadCachedImage(DICE_IMAGES.ROUND_BG);
  if (bgImg) {
    ctx.drawImage(bgImg, 0, 0, LAYOUT.WIDTH, LAYOUT.HEIGHT);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, LAYOUT.WIDTH, LAYOUT.HEIGHT);
    gradient.addColorStop(0, '#1a0a2e');
    gradient.addColorStop(1, '#2d1b4e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, LAYOUT.WIDTH, LAYOUT.HEIGHT);
  }

  // Gradient overlay for depth
  drawGradientOverlay(ctx, LAYOUT.WIDTH, LAYOUT.HEIGHT);

  // Draw Scores
  drawGlowyText(ctx, String(totalTeamA ?? 0), LAYOUT.SCORE_TEAM_A.x, LAYOUT.SCORE_TEAM_A.y, {
    font: `700 72px ${FONTS.SCORES}`,
    color: COLORS.SCORE,
    glowBlur: 15,
    glow: `${COLORS.TEAM_A}99`
  });

  drawGlowyText(ctx, String(totalTeamB ?? 0), LAYOUT.SCORE_TEAM_B.x, LAYOUT.SCORE_TEAM_B.y, {
    font: `700 72px ${FONTS.SCORES}`,
    color: COLORS.SCORE,
    glowBlur: 15,
    glow: `${COLORS.TEAM_B}99`
  });

  // Round Indicator
  drawGlowyText(ctx, `${round}/3`, LAYOUT.ROUND_TEXT.x, LAYOUT.ROUND_TEXT.y, {
    font: `700 48px ${FONTS.NAMES}`,
    color: COLORS.SCORE
  });

  // Find top scorers
  const topScorerA = getTopScorerIndex(teamA, round);
  const topScorerB = getTopScorerIndex(teamB, round);

  // Players - with yields between each to prevent event loop blocking
  for (let i = 0; i < teamA.length && i < 5; i++) {
    await drawPlayerSlot(ctx, teamA[i], LAYOUT.TEAM_A_SLOTS[i], round, 'left', COLORS.TEAM_A, i === topScorerA);
    // Yield after every 2 players to keep event loop responsive
    if (i % 2 === 1) await new Promise(r => setImmediate(r));
  }
  for (let i = 0; i < teamB.length && i < 5; i++) {
    await drawPlayerSlot(ctx, teamB[i], LAYOUT.TEAM_B_SLOTS[i], round, 'right', COLORS.TEAM_B, i === topScorerB);
    // Yield after every 2 players to keep event loop responsive
    if (i % 2 === 1) await new Promise(r => setImmediate(r));
  }

  // Downsample to final size
  const finalCanvas = downsampleCanvas(renderCanvas, LAYOUT.WIDTH, LAYOUT.HEIGHT);
  return finalCanvas.toBuffer('image/png');
}

export async function generateTeamAnnouncement(gameData) {
  const { teamA, teamB } = gameData;

  // Render at 2x scale
  const renderCanvas = createCanvas(LAYOUT.WIDTH * RENDER_SCALE, LAYOUT.HEIGHT * RENDER_SCALE);
  const ctx = renderCanvas.getContext('2d');
  ctx.scale(RENDER_SCALE, RENDER_SCALE);

  const bgImg = await loadCachedImage(DICE_IMAGES.ROUND_BG);
  if (bgImg) {
    ctx.drawImage(bgImg, 0, 0, LAYOUT.WIDTH, LAYOUT.HEIGHT);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, LAYOUT.WIDTH, LAYOUT.HEIGHT);
    gradient.addColorStop(0, '#1a0a2e');
    gradient.addColorStop(1, '#2d1b4e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, LAYOUT.WIDTH, LAYOUT.HEIGHT);
  }

  // Gradient overlay
  drawGradientOverlay(ctx, LAYOUT.WIDTH, LAYOUT.HEIGHT);

  // Player Counts with team colors
  drawGlowyText(ctx, String(teamA.length), LAYOUT.SCORE_TEAM_A.x, LAYOUT.SCORE_TEAM_A.y, {
    font: `700 72px ${FONTS.SCORES}`,
    color: '#FFD700',
    glowBlur: 15,
    glow: `${COLORS.TEAM_A}99`
  });

  drawGlowyText(ctx, String(teamB.length), LAYOUT.SCORE_TEAM_B.x, LAYOUT.SCORE_TEAM_B.y, {
    font: `700 72px ${FONTS.SCORES}`,
    color: '#FFD700',
    glowBlur: 15,
    glow: `${COLORS.TEAM_B}99`
  });

  // VS
  drawGlowyText(ctx, 'VS', LAYOUT.WIDTH / 2, LAYOUT.ROUND_TEXT.y, {
    font: `700 56px ${FONTS.NAMES}`,
    color: '#FFFFFF'
  });

  // Team A List - with yields between players
  for (let i = 0; i < teamA.length && i < 5; i++) {
    const player = teamA[i];
    const slot = LAYOUT.TEAM_A_SLOTS[i];
    const name = player.displayName || player.username || 'Unknown';

    drawPlayerName(ctx, name, slot, 'left', COLORS.TEAM_A);

    if (player.hasBetterLuck) {
      drawGlowyText(ctx, '🍀', slot.dice.x, slot.dice.y, {
        font: '50px Arial',
        glow: 'rgba(0,255,0,0.5)'
      });
    }
    // Yield every 2 players
    if (i % 2 === 1) await new Promise(r => setImmediate(r));
  }

  // Team B List - with yields between players
  for (let i = 0; i < teamB.length && i < 5; i++) {
    const player = teamB[i];
    const slot = LAYOUT.TEAM_B_SLOTS[i];
    const name = player.displayName || player.username || 'Unknown';

    drawPlayerName(ctx, name, slot, 'right', COLORS.TEAM_B);

    if (player.hasBetterLuck) {
      drawGlowyText(ctx, '🍀', slot.dice.x, slot.dice.y, {
        font: '50px Arial',
        glow: 'rgba(0,255,0,0.5)'
      });
    }
    // Yield every 2 players
    if (i % 2 === 1) await new Promise(r => setImmediate(r));
  }

  const finalCanvas = downsampleCanvas(renderCanvas, LAYOUT.WIDTH, LAYOUT.HEIGHT);
  return finalCanvas.toBuffer('image/png');
}

async function drawPlayerSlot(ctx, player, slot, round, align, teamColor, isTopScorer = false) {
  const meta = player.roundMeta ? player.roundMeta[round - 1] : null;
  const score = player.roundScores ? (player.roundScores[round - 1] || 0) : 0;

  // Blocked logic
  if (player.wasBlockedThisRound) {
    const name = player.displayName || player.username || 'Unknown';
    drawPlayerName(ctx, name + ' 🚫', slot, align, null);

    if (slot.score) {
      drawPill(ctx, slot.score.x, slot.score.y, 150, 46);
      drawGlowyText(ctx, '+0', slot.score.x, slot.score.y, {
        font: `700 36px ${FONTS.SCORES}`,
        color: COLORS.NEGATIVE
      });
    }

    drawGlowyText(ctx, '🚫', slot.dice.x, slot.dice.y, {
      font: '60px Arial',
      glow: 'rgba(255,0,0,0.5)'
    });
    return;
  }

  // Normal Player
  const name = player.displayName || player.username || 'Unknown';
  const displayName = isTopScorer ? `${name} 👑` : name;
  drawPlayerName(ctx, displayName, slot, align, teamColor);

  if (slot.score) {
    const scoreStr = score >= 0 ? `+${score}` : `${score}`;

    // Team-colored pill border
    drawPill(ctx, slot.score.x, slot.score.y, 150, 46, {
      stroke: `${teamColor}66`,
      strokeWidth: 2
    });

    drawGlowyText(ctx, scoreStr, slot.score.x, slot.score.y, {
      font: `700 34px ${FONTS.SCORES}`,
      color: score >= 0 ? COLORS.POSITIVE : COLORS.NEGATIVE,
      glowBlur: 8
    });
  }

  // Dice Result
  if (meta && meta.firstRoll) {
    const diceImg = await loadCachedImage(getDiceImagePath(meta.firstRoll));
    const x = slot.dice.x - LAYOUT.DICE_SIZE / 2;
    const y = slot.dice.y - LAYOUT.DICE_SIZE / 2;

    // Special outcome gets glowing ring
    const specialIconKey = getSpecialIconKey(meta);
    if (specialIconKey) {
      const glowColor = getContextualGlow(meta.firstRoll, meta);
      drawGlowingRing(ctx, slot.dice.x, slot.dice.y, LAYOUT.DICE_SIZE / 2 + 5, glowColor);
    }

    if (diceImg) {
      if (ENABLE_GLOW) {
        const diceGlow = getContextualGlow(meta.firstRoll, meta);
        ctx.save();
        ctx.shadowColor = diceGlow;
        ctx.shadowBlur = 15;
        ctx.drawImage(diceImg, x, y, LAYOUT.DICE_SIZE, LAYOUT.DICE_SIZE);
        ctx.restore();
      } else {
        ctx.drawImage(diceImg, x, y, LAYOUT.DICE_SIZE, LAYOUT.DICE_SIZE);
      }
    } else {
      drawGlowyText(ctx, String(meta.firstRoll), slot.dice.x, slot.dice.y, {
        font: `700 48px ${FONTS.SCORES}`
      });
    }

    // Draw special icon
    if (specialIconKey) {
      const specialPath = getDiceImagePath(specialIconKey);
      const specialImg = await loadCachedImage(specialPath);

      if (specialImg) {
        const sx = slot.special.x - LAYOUT.SPECIAL_SIZE / 2;
        const sy = slot.special.y - LAYOUT.SPECIAL_SIZE / 2;

        // Dark circle background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.beginPath();
        ctx.arc(slot.special.x, slot.special.y, LAYOUT.SPECIAL_SIZE / 2 + 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.drawImage(specialImg, sx, sy, LAYOUT.SPECIAL_SIZE, LAYOUT.SPECIAL_SIZE);
      } else {
        let displayText = specialIconKey;
        if (specialIconKey === 'ZERO') displayText = 'Ø';
        if (specialIconKey === 'X2') displayText = '×2';
        if (specialIconKey === 'BLOCK') displayText = '🚫';

        drawGlowyText(ctx, displayText, slot.special.x, slot.special.y, {
          font: 'bold 18px Arial',
          color: '#FFD700'
        });
      }
    }
  }
}

export async function generateGameResult(gameData) {
  const { teamA, teamB, teamATotal, teamBTotal, winner } = gameData;

  // Render at 2x scale
  const renderCanvas = createCanvas(LAYOUT.WIDTH * RENDER_SCALE, LAYOUT.HEIGHT * RENDER_SCALE);
  const ctx = renderCanvas.getContext('2d');
  ctx.scale(RENDER_SCALE, RENDER_SCALE);

  const bgImg = await loadCachedImage(DICE_IMAGES.ROUND_BG);
  if (bgImg) {
    ctx.drawImage(bgImg, 0, 0, LAYOUT.WIDTH, LAYOUT.HEIGHT);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, LAYOUT.WIDTH, LAYOUT.HEIGHT);
    gradient.addColorStop(0, '#1a0a2e');
    gradient.addColorStop(1, '#2d1b4e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, LAYOUT.WIDTH, LAYOUT.HEIGHT);
  }

  // Dark overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(0, 0, LAYOUT.WIDTH, LAYOUT.HEIGHT);

  // Gradient overlay
  drawGradientOverlay(ctx, LAYOUT.WIDTH, LAYOUT.HEIGHT);

  // Winner Announcement
  let winnerText, winnerColor, winnerGlow;
  if (winner === 'TIE') {
    winnerText = '🤝 تعادل! 🤝';
    winnerColor = '#FFFFFF';
    winnerGlow = 'rgba(255,255,255,0.8)';
  } else if (winner === 'A') {
    winnerText = '🏆 فاز الفريق الأزرق! 🏆';
    winnerColor = COLORS.TEAM_A;
    winnerGlow = `${COLORS.TEAM_A}CC`;
  } else {
    winnerText = '🏆 فاز الفريق الأحمر! 🏆';
    winnerColor = COLORS.TEAM_B;
    winnerGlow = `${COLORS.TEAM_B}CC`;
  }

  drawGlowyText(ctx, winnerText, LAYOUT.WIDTH / 2, 100, {
    font: `700 56px ${FONTS.NAMES}`,
    color: winnerColor,
    glowBlur: 20,
    glow: winnerGlow
  });

  // Final Scores with winner emphasis
  drawGlowyText(ctx, String(teamATotal), LAYOUT.SCORE_TEAM_A.x, LAYOUT.SCORE_TEAM_A.y, {
    font: `700 84px ${FONTS.SCORES}`,
    color: winner === 'A' ? '#FFD700' : '#FFFFFF',
    glowBlur: 20,
    glow: winner === 'A' ? 'rgba(255,215,0,0.9)' : `${COLORS.TEAM_A}66`
  });

  drawGlowyText(ctx, String(teamBTotal), LAYOUT.SCORE_TEAM_B.x, LAYOUT.SCORE_TEAM_B.y, {
    font: `700 84px ${FONTS.SCORES}`,
    color: winner === 'B' ? '#FFD700' : '#FFFFFF',
    glowBlur: 20,
    glow: winner === 'B' ? 'rgba(255,215,0,0.9)' : `${COLORS.TEAM_B}66`
  });

  drawGlowyText(ctx, 'النتيجة النهائية', LAYOUT.WIDTH / 2, LAYOUT.ROUND_TEXT.y, {
    font: `700 40px ${FONTS.NAMES}`,
    color: '#FFD700'
  });

  // Find overall top scorer in each team
  const topScorerA = teamA.reduce((maxIdx, player, idx, arr) =>
    (player.totalScore || 0) > (arr[maxIdx].totalScore || 0) ? idx : maxIdx, 0
  );
  const topScorerB = teamB.reduce((maxIdx, player, idx, arr) =>
    (player.totalScore || 0) > (arr[maxIdx].totalScore || 0) ? idx : maxIdx, 0
  );

  // Team A Totals - with yields between players
  for (let i = 0; i < teamA.length && i < 5; i++) {
    const p = teamA[i];
    const slot = LAYOUT.TEAM_A_SLOTS[i];
    const name = p.displayName || p.username || 'Unknown';
    const total = p.totalScore || 0;
    const scoreColor = total >= 0 ? COLORS.POSITIVE : COLORS.NEGATIVE;
    const displayName = i === topScorerA && total > 0 ? `${name} 👑` : name;

    drawPlayerName(ctx, displayName, { ...slot, name: { ...slot.name, y: slot.name.y - 15 } }, 'left', COLORS.TEAM_A);

    if (slot.score) {
      drawPill(ctx, slot.score.x, slot.score.y, 160, 50, {
        stroke: `${COLORS.TEAM_A}66`,
        strokeWidth: 2
      });
      drawGlowyText(ctx, `${total >= 0 ? '+' : ''}${total}`, slot.score.x, slot.score.y, {
        font: `700 44px ${FONTS.SCORES}`,
        color: scoreColor
      });
    }
    // Yield every 2 players
    if (i % 2 === 1) await new Promise(r => setImmediate(r));
  }

  // Team B Totals - with yields between players
  for (let i = 0; i < teamB.length && i < 5; i++) {
    const p = teamB[i];
    const slot = LAYOUT.TEAM_B_SLOTS[i];
    const name = p.displayName || p.username || 'Unknown';
    const total = p.totalScore || 0;
    const scoreColor = total >= 0 ? COLORS.POSITIVE : COLORS.NEGATIVE;
    const displayName = i === topScorerB && total > 0 ? `${name} 👑` : name;

    drawPlayerName(ctx, displayName, { ...slot, name: { ...slot.name, y: slot.name.y - 15 } }, 'right', COLORS.TEAM_B);

    if (slot.score) {
      drawPill(ctx, slot.score.x, slot.score.y, 160, 50, {
        stroke: `${COLORS.TEAM_B}66`,
        strokeWidth: 2
      });
      drawGlowyText(ctx, `${total >= 0 ? '+' : ''}${total}`, slot.score.x, slot.score.y, {
        font: `700 44px ${FONTS.SCORES}`,
        color: scoreColor
      });
    }
    // Yield every 2 players
    if (i % 2 === 1) await new Promise(r => setImmediate(r));
  }

  const finalCanvas = downsampleCanvas(renderCanvas, LAYOUT.WIDTH, LAYOUT.HEIGHT);
  return finalCanvas.toBuffer('image/png');
}
