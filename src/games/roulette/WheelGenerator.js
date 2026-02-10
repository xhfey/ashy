/**
 * Roulette Wheel Generator
 * Generates an animated GIF of the spinning wheel.
 *
 * All visual settings are configurable via src/config/wheel.config.js.
 * To customize: edit that file (colors, images, animation, text).
 *
 * Visual features:
 * - 2x supersampled rendering (anti-aliased edges)
 * - Compound physics easing (accelerate → constant → friction decay)
 * - 4-layer motion blur trail
 * - 3-stop radial gradients on segments (3D depth)
 * - Text drop shadows
 * - Fade-in winner celebration with pulse
 * - Pre-rendered static layers for performance
 * - Pre-calculated segment math (no per-frame recalculation)
 */

import { createCanvas, loadImage, registerFont } from 'canvas';
import GIFEncoder from 'gif-encoder-2';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import logger from '../../utils/logger.js';
import { WHEEL_CONFIG as cfg } from '../../config/wheel.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..', '..', '..');

// ==================== DERIVED CONSTANTS ====================

const S = cfg.canvas.supersample;
const OUTPUT_SIZE = cfg.canvas.size;
const RENDER_SIZE = OUTPUT_SIZE * S;
const RENDER_CENTER = RENDER_SIZE / 2;

// Scaled wheel geometry (for supersampled rendering)
const OUTER_R = cfg.wheel.outerRadius * S;
const INNER_R = cfg.wheel.innerRadius * S;
const TEXT_R = cfg.wheel.textRadius * S;

// ==================== FONT REGISTRATION ====================

try {
  const fontPath = path.join(PROJECT_ROOT, 'assets', 'fonts');
  if (fs.existsSync(path.join(fontPath, 'Cairo-Bold.ttf'))) {
    registerFont(path.join(fontPath, 'Cairo-Bold.ttf'), { family: 'Cairo', weight: '700' });
  }
  if (fs.existsSync(path.join(fontPath, 'Cinzel-Bold.ttf'))) {
    registerFont(path.join(fontPath, 'Cinzel-Bold.ttf'), { family: 'Cinzel', weight: '700' });
  }
} catch (e) {
  logger.warn(`[WheelGenerator] Font registration failed: ${e.message}`);
}

// ==================== ASSET CACHE ====================

const imageCache = new Map();

function loadAsset(assetRelativePath) {
  if (imageCache.has(assetRelativePath)) return imageCache.get(assetRelativePath);

  const promise = (async () => {
    try {
      const fullPath = path.join(PROJECT_ROOT, assetRelativePath);
      return await loadImage(fullPath);
    } catch (e) {
      logger.warn(`[WheelGenerator] Asset not found: ${assetRelativePath}, using fallback`);
      return null;
    }
  })();

  imageCache.set(assetRelativePath, promise);
  return promise;
}

// ==================== UTILITY FUNCTIONS ====================

function getLuminance(hexColor) {
  const rgb = hexColor.match(/[A-Za-z0-9]{2}/g).map(v => parseInt(v, 16));
  const [r, g, b] = rgb.map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getTextColor(segmentColor) {
  const luminance = getLuminance(segmentColor);
  return luminance > cfg.text.luminanceThreshold ? cfg.text.darkTextColor : cfg.text.color;
}

function shadeColor(color, percent) {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, (num >> 8 & 0x00FF) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

function truncateText(text, maxLength = cfg.text.maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 1) + '…';
}

function normalizeAngle(angle) {
  angle = angle % 360;
  return angle < 0 ? angle + 360 : angle;
}

// ==================== EASING ====================

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Compound 3-phase easing:
 * Phase 1 (0 → rampEnd): Quadratic acceleration
 * Phase 2 (rampEnd → decayStart): Constant velocity
 * Phase 3 (decayStart → 1.0): Exponential friction decay
 */
function compoundEase(t) {
  const { rampEnd, decayStart, decayExponent } = cfg.easing;

  // Phase 1: Acceleration (quadratic ease-in)
  if (t <= rampEnd) {
    const lt = t / rampEnd;
    return lt * lt * rampEnd * 0.5;
  }

  const accelDist = rampEnd * 0.5;

  // Phase 2: Constant speed (linear)
  if (t <= decayStart) {
    const lt = (t - rampEnd) / (decayStart - rampEnd);
    return accelDist + lt * (decayStart - rampEnd);
  }

  const constDist = decayStart - rampEnd;
  const decayDist = 1.0 - accelDist - constDist;

  // Phase 3: Heavy friction decay
  const lt = (t - decayStart) / (1.0 - decayStart);
  return accelDist + constDist + decayDist * (1 - Math.pow(1 - lt, decayExponent));
}

// ==================== FRAME DELAY ====================

function getSpinFrameDelay(t) {
  for (const bracket of cfg.animation.spinDelays) {
    if (t <= bracket.upTo) return bracket.delay;
  }
  return cfg.animation.spinDelays[cfg.animation.spinDelays.length - 1].delay;
}

// ==================== PRE-CALCULATION ====================

function getSegmentColorIndex(i, numSegments) {
  const colorCount = cfg.segmentColors.length;
  if (numSegments <= colorCount) return i % colorCount;
  const cycle = Math.floor(i / colorCount);
  const offset = cycle % colorCount;
  return (i + offset) % colorCount;
}

function preCalculateSegments(players) {
  const numSegments = players.length;
  const segmentAngle = (2 * Math.PI) / numSegments;
  const sizes = cfg.text.sizes;

  return players.map((rawPlayer, i) => {
    const player = (rawPlayer && typeof rawPlayer === 'object')
      ? rawPlayer
      : { name: String(rawPlayer ?? 'Unknown') };

    const startAngle = i * segmentAngle;
    const endAngle = (i + 1) * segmentAngle;
    const midAngle = startAngle + segmentAngle / 2;
    const colorIndex = getSegmentColorIndex(i, numSegments);
    const color = cfg.segmentColors[colorIndex];

    const displayName = truncateText(player.displayName || player.name || 'Unknown');
    const nameLength = displayName.length;
    let fontSize;
    if (numSegments > 12) fontSize = sizes.tiny;
    else if (nameLength > 12) fontSize = sizes.small;
    else if (nameLength > 8) fontSize = sizes.medium;
    else if (numSegments > 8) fontSize = sizes.medium;
    else fontSize = sizes.large;

    return {
      player,
      startAngle,
      endAngle,
      midAngle,
      color,
      textAngle: midAngle,
      fontSize: fontSize * S,
      textColor: getTextColor(color),
      displayName,
    };
  });
}

// ==================== STATIC LAYER RENDERING ====================

async function createStaticLayers() {
  const [bgImg, frameImg, centerImg, pointerImg] = await Promise.all([
    loadAsset(cfg.assets.background),
    loadAsset(cfg.assets.frame),
    loadAsset(cfg.assets.center),
    loadAsset(cfg.assets.pointer),
  ]);

  // Base layer (solid fill)
  const baseCanvas = createCanvas(OUTPUT_SIZE, OUTPUT_SIZE);
  const baseCtx = baseCanvas.getContext('2d', { alpha: false });
  baseCtx.fillStyle = cfg.canvas.backgroundColor;
  baseCtx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  // Overlay layer (background art + frame + center + pointer)
  const overlayCanvas = createCanvas(OUTPUT_SIZE, OUTPUT_SIZE);
  const overlayCtx = overlayCanvas.getContext('2d', { alpha: true });

  // Background art
  if (bgImg) {
    overlayCtx.drawImage(bgImg, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  }

  // Frame
  if (frameImg) {
    overlayCtx.drawImage(frameImg, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  } else {
    overlayCtx.strokeStyle = cfg.fallback.frameStroke;
    overlayCtx.lineWidth = cfg.fallback.frameLineWidth;
    overlayCtx.beginPath();
    overlayCtx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 220, 0, Math.PI * 2);
    overlayCtx.stroke();
  }

  // Center emblem
  if (centerImg) {
    const ce = cfg.centerEmblem;
    overlayCtx.drawImage(centerImg, ce.x, ce.y, ce.width, ce.height);
  } else {
    overlayCtx.fillStyle = cfg.fallback.centerFill;
    overlayCtx.strokeStyle = cfg.fallback.centerStroke;
    overlayCtx.lineWidth = cfg.fallback.centerLineWidth;
    overlayCtx.beginPath();
    overlayCtx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, cfg.fallback.centerRadius, 0, Math.PI * 2);
    overlayCtx.fill();
    overlayCtx.stroke();
  }

  // Pointer
  if (pointerImg) {
    const p = cfg.pointer;
    overlayCtx.drawImage(pointerImg, p.x, p.y, p.width, p.height);
  } else {
    overlayCtx.fillStyle = cfg.fallback.pointerFill;
    overlayCtx.strokeStyle = cfg.fallback.pointerStroke;
    overlayCtx.lineWidth = cfg.fallback.pointerLineWidth;
    overlayCtx.beginPath();
    overlayCtx.moveTo(OUTPUT_SIZE - 30, OUTPUT_SIZE / 2);
    overlayCtx.lineTo(OUTPUT_SIZE - 5, OUTPUT_SIZE / 2 - 20);
    overlayCtx.lineTo(OUTPUT_SIZE - 5, OUTPUT_SIZE / 2 + 20);
    overlayCtx.closePath();
    overlayCtx.fill();
    overlayCtx.stroke();
  }

  return { baseCanvas, overlayCanvas };
}

// ==================== WHEEL SEGMENT DRAWING ====================

/**
 * Draw wheel segments at supersampled resolution.
 * @param {number} glowIntensity - Winner glow intensity 0..1 (0 = off)
 */
function drawWheelSegments(ctx, segments, rotationAngle, winnerIndex = -1, glowIntensity = 0) {
  const seg = cfg.segment;
  const grad = seg.gradient;
  const txt = cfg.text;
  const win = cfg.winner;

  ctx.save();
  ctx.translate(RENDER_CENTER, RENDER_CENTER);
  ctx.rotate(rotationAngle * Math.PI / 180);

  segments.forEach((segment, i) => {
    const { startAngle, endAngle, color, textAngle, fontSize, textColor, displayName } = segment;

    // Dynamic text flip based on current rotation
    const currentAngleDeg = normalizeAngle((textAngle * 180 / Math.PI) + rotationAngle);
    const needsFlip = currentAngleDeg > 90 && currentAngleDeg < 270;

    // Draw segment
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, OUTER_R, startAngle, endAngle);
    ctx.closePath();

    // 3-stop radial gradient for 3D depth
    const gradient = ctx.createRadialGradient(0, 0, INNER_R, 0, 0, OUTER_R);
    gradient.addColorStop(0, shadeColor(color, grad.innerBrighten));
    gradient.addColorStop(grad.highlightStop, color);
    gradient.addColorStop(1, shadeColor(color, grad.outerDarken));

    ctx.fillStyle = gradient;
    ctx.fill();

    // Segment border
    ctx.lineWidth = seg.borderWidth * S;
    ctx.strokeStyle = seg.borderColor;
    ctx.stroke();

    // Winner glow (fade-in + pulse)
    if (glowIntensity > 0 && i === winnerIndex) {
      ctx.save();
      ctx.shadowColor = win.glowColor;
      ctx.shadowBlur = win.glowMaxBlur * S * glowIntensity;
      ctx.lineWidth = win.glowLineWidth * S * glowIntensity;
      ctx.strokeStyle = win.glowColor;
      ctx.globalAlpha = glowIntensity;
      ctx.stroke();
      ctx.restore();
    }

    // Draw text
    ctx.save();
    ctx.rotate(textAngle);
    ctx.translate(TEXT_R, 0);

    if (needsFlip) {
      ctx.rotate(Math.PI);
    }

    ctx.font = `bold ${fontSize}px "${txt.fontFamily}", "Arial", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Text drop shadow
    ctx.shadowColor = txt.shadow.color;
    ctx.shadowBlur = txt.shadow.blur * S;
    ctx.shadowOffsetX = txt.shadow.offsetX * S;
    ctx.shadowOffsetY = txt.shadow.offsetY * S;

    // Text stroke
    ctx.lineWidth = txt.strokeWidth * S;
    ctx.strokeStyle = txt.strokeColor;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeText(displayName, 0, 0);

    // Clear shadow for fill (prevent double shadow)
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Text fill
    ctx.fillStyle = textColor;
    ctx.fillText(displayName, 0, 0);

    ctx.restore();
  });

  ctx.restore();
}

// ==================== MOTION BLUR ====================

function drawWheelWithBlur(wheelCtx, segments, angle, speedDegPerSec) {
  const mb = cfg.motionBlur;
  wheelCtx.clearRect(0, 0, RENDER_SIZE, RENDER_SIZE);

  // Scale blur with velocity
  const blurAmount = Math.min(
    Math.max((speedDegPerSec - mb.speedThreshold) / (mb.speedCap - mb.speedThreshold), 0),
    1,
  );

  if (blurAmount > 0.05) {
    // Draw ghost trail layers (furthest first)
    for (let layer = mb.layers; layer >= 1; layer--) {
      const layerOffset = (layer / mb.layers) * mb.maxOffset * blurAmount;
      const layerAlpha = mb.baseAlpha * Math.pow(mb.alphaFalloff, layer - 1) * blurAmount;

      wheelCtx.globalAlpha = layerAlpha;
      drawWheelSegments(wheelCtx, segments, angle - layerOffset);
    }
  }

  // Main wheel (full opacity)
  wheelCtx.globalAlpha = 1;
  drawWheelSegments(wheelCtx, segments, angle);
}

// ==================== CORE GIF GENERATOR ====================

/**
 * Generate Roulette Wheel GIF
 * @param {Array<{name: string, displayName?: string}>} players
 * @param {number} winnerIndex - Index of the winner
 * @returns {Promise<Buffer>} GIF buffer
 */
export async function generateWheelGif(players, winnerIndex) {
  if (!Array.isArray(players) || players.length === 0) {
    throw new Error('[WheelGenerator] players must be a non-empty array');
  }
  if (typeof winnerIndex !== 'number' || winnerIndex < 0 || winnerIndex >= players.length) {
    throw new Error(`[WheelGenerator] winnerIndex must be between 0 and ${players.length - 1}, got: ${winnerIndex}`);
  }

  const anim = cfg.animation;
  const segments = preCalculateSegments(players);
  const { baseCanvas, overlayCanvas } = await createStaticLayers();

  // GIF encoder at output resolution
  const encoder = new GIFEncoder(OUTPUT_SIZE, OUTPUT_SIZE);
  encoder.start();
  encoder.setRepeat(cfg.encoder.repeat);
  encoder.setQuality(cfg.encoder.quality);

  // Supersampled wheel canvas
  const wheelCanvas = createCanvas(RENDER_SIZE, RENDER_SIZE);
  const wheelCtx = wheelCanvas.getContext('2d', { alpha: true });

  // Final compositing canvas (output resolution)
  const finalCanvas = createCanvas(OUTPUT_SIZE, OUTPUT_SIZE);
  const finalCtx = finalCanvas.getContext('2d', { alpha: false });
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';

  // Animation math
  const numSegments = players.length;
  const segmentAngle = 360 / numSegments;
  const winnerCenterAngle = (winnerIndex + 0.5) * segmentAngle;

  const spins = anim.totalSpins;
  const fractionalOffset = (spins - Math.floor(spins)) * 360;
  const finalAngle = normalizeAngle(-winnerCenterAngle - fractionalOffset);
  const totalSpin = spins * 360 + finalAngle;

  const totalSpinFrames = Math.floor(anim.durationSec * anim.fps);
  const windBackDegrees = anim.anticipation.frames > 0 ? anim.anticipation.degrees : 0;
  const spinStartAngle = windBackDegrees;
  const spinDistance = totalSpin - spinStartAngle;

  let previousAngle = spinStartAngle;
  let lastSegmentIndex = -1;

  // Helper: composite one frame
  function compositeFrame() {
    finalCtx.drawImage(baseCanvas, 0, 0);
    finalCtx.drawImage(wheelCanvas, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE); // Downsample
    finalCtx.drawImage(overlayCanvas, 0, 0);
  }

  // ===== ANTICIPATION PHASE =====
  const antFrames = anim.anticipation.frames;
  for (let i = 0; i < antFrames; i++) {
    const t = antFrames > 1 ? i / (antFrames - 1) : 1;
    const windBack = windBackDegrees * easeOutCubic(t);

    wheelCtx.clearRect(0, 0, RENDER_SIZE, RENDER_SIZE);
    drawWheelSegments(wheelCtx, segments, windBack);
    compositeFrame();

    encoder.setDelay(anim.anticipation.delayMs);
    encoder.addFrame(finalCtx);

    await new Promise(resolve => setTimeout(resolve, 0));
  }

  // ===== SPIN PHASE =====
  for (let i = 0; i < totalSpinFrames; i++) {
    const t = i / totalSpinFrames;
    const easedProgress = compoundEase(t);
    const currentAngle = spinStartAngle + easedProgress * spinDistance;

    const delay = getSpinFrameDelay(t);
    const dt = delay / 1000;
    const deltaAngle = Math.abs(currentAngle - previousAngle);
    const speedDegPerSec = deltaAngle / dt;

    // Tick/snap effect near the end
    let displayAngle = currentAngle;
    if (t > cfg.tick.progressThreshold) {
      const currentSegmentIndex = Math.floor((normalizeAngle(currentAngle) / segmentAngle)) % numSegments;
      if (currentSegmentIndex !== lastSegmentIndex && speedDegPerSec < cfg.tick.speedThreshold) {
        displayAngle = Math.round(currentAngle / (segmentAngle / 2)) * (segmentAngle / 2);
      }
      lastSegmentIndex = currentSegmentIndex;
    }

    // Composite frame with motion blur
    drawWheelWithBlur(wheelCtx, segments, displayAngle, speedDegPerSec);
    compositeFrame();

    encoder.setDelay(delay);
    encoder.addFrame(finalCtx);

    previousAngle = currentAngle;

    if (i % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }

  // ===== HOLD FRAMES (exact landing, no glow yet) =====
  const normalizedFinalAngle = normalizeAngle(totalSpin);
  for (let i = 0; i < anim.hold.frames; i++) {
    wheelCtx.clearRect(0, 0, RENDER_SIZE, RENDER_SIZE);
    drawWheelSegments(wheelCtx, segments, normalizedFinalAngle);
    compositeFrame();

    encoder.setDelay(anim.hold.delayMs);
    encoder.addFrame(finalCtx);
  }

  // ===== CELEBRATION PHASE (fade-in glow + pulse) =====
  const celFrames = anim.celebration.frames;
  const win = cfg.winner;
  for (let i = 0; i < celFrames; i++) {
    // Fade-in phase
    let glowIntensity;
    if (i < win.fadeInFrames) {
      glowIntensity = (i + 1) / win.fadeInFrames;
    } else {
      glowIntensity = 1.0;
    }

    // Sine pulse on top of full glow
    if (i >= win.fadeInFrames) {
      const pulseT = (i - win.fadeInFrames) / Math.max(1, celFrames - win.fadeInFrames);
      const pulse = Math.sin(pulseT * Math.PI * 2 * win.pulseFrequency) * win.pulseAmplitude;
      glowIntensity = Math.min(1.0, Math.max(0.3, glowIntensity + pulse));
    }

    wheelCtx.clearRect(0, 0, RENDER_SIZE, RENDER_SIZE);
    drawWheelSegments(wheelCtx, segments, normalizedFinalAngle, winnerIndex, glowIntensity);
    compositeFrame();

    encoder.setDelay(anim.celebration.delayMs);
    encoder.addFrame(finalCtx);

    if (i % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }

  encoder.finish();
  return encoder.out.getData();
}

// ==================== DURATION CALCULATION ====================

function computeSpinPhaseDurationMs() {
  const totalSpinFrames = Math.floor(cfg.animation.durationSec * cfg.animation.fps);
  if (totalSpinFrames <= 0) return 0;
  let total = 0;
  for (let i = 0; i < totalSpinFrames; i++) {
    total += getSpinFrameDelay(i / totalSpinFrames);
  }
  return total;
}

function computeWheelGifDurationMs() {
  const anim = cfg.animation;
  const anticipationMs = anim.anticipation.frames * anim.anticipation.delayMs;
  const spinMs = computeSpinPhaseDurationMs();
  const holdMs = anim.hold.frames * anim.hold.delayMs;
  const celebrationMs = anim.celebration.frames * anim.celebration.delayMs;
  return anticipationMs + spinMs + holdMs + celebrationMs;
}

export const WHEEL_GIF_DURATION_MS = computeWheelGifDurationMs();

// ==================== STATIC WHEEL ====================

export async function generateStaticWheel(players) {
  if (!Array.isArray(players) || players.length === 0) {
    throw new Error('[WheelGenerator] players must be a non-empty array');
  }

  const segments = preCalculateSegments(players);
  const { baseCanvas, overlayCanvas } = await createStaticLayers();

  const wheelCanvas = createCanvas(RENDER_SIZE, RENDER_SIZE);
  const wheelCtx = wheelCanvas.getContext('2d', { alpha: true });

  const finalCanvas = createCanvas(OUTPUT_SIZE, OUTPUT_SIZE);
  const finalCtx = finalCanvas.getContext('2d', { alpha: false });
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';

  finalCtx.drawImage(baseCanvas, 0, 0);
  drawWheelSegments(wheelCtx, segments, 0);
  finalCtx.drawImage(wheelCanvas, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  finalCtx.drawImage(overlayCanvas, 0, 0);

  return finalCanvas.toBuffer('image/png');
}

// ==================== CACHE MANAGEMENT ====================

export function clearAssetsCache() {
  imageCache.clear();
}

export async function prewarmWheelAssets() {
  const assetPaths = Object.values(cfg.assets);
  await Promise.allSettled(assetPaths.map(p => loadAsset(p)));
  logger.info(`[WheelGenerator] Asset prewarm complete (${assetPaths.length} assets)`);
}
