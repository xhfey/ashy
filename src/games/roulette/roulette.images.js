/**
 * Roulette Game Image Generation
 * Generates wheel images for the elimination game
 */

import { createCanvas, loadImage, registerFont } from 'canvas';
import path from 'path';
import { fileURLToPath } from 'url';
import { WHEEL_COLORS } from './roulette.constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsPath = path.join(__dirname, '../../assets/roulette');

// Register fonts (reuse from dice)
try {
  const fontPath = path.join(__dirname, '../../assets/fonts');
  registerFont(path.join(fontPath, 'Cairo-Bold.ttf'), { family: 'Cairo', weight: '700' });
} catch (e) {
  console.warn('[RouletteImages] Failed to register fonts:', e.message);
}

// Wheel dimensions
const WHEEL_SIZE = 550;
const CENTER_X = WHEEL_SIZE / 2;
const CENTER_Y = WHEEL_SIZE / 2;
const OUTER_RADIUS = 220;
const INNER_RADIUS = 80;

// Image cache
const imageCache = new Map();

/**
 * Load image with caching
 */
async function loadCachedImage(imagePath) {
  if (imageCache.has(imagePath)) return imageCache.get(imagePath);

  try {
    const img = await loadImage(imagePath);
    imageCache.set(imagePath, img);
    return img;
  } catch (error) {
    return null;
  }
}

/**
 * Generate wheel image
 * @param {Array} players - Array of alive players
 * @param {string|null} currentTurnId - Current player's turn (highlighted)
 * @param {string|null} eliminatedId - Just eliminated player (X mark)
 * @returns {Buffer} PNG image buffer
 */
export async function generateWheelImage(players, currentTurnId = null, eliminatedId = null) {
  const canvas = createCanvas(WHEEL_SIZE, WHEEL_SIZE);
  const ctx = canvas.getContext('2d');

  // Draw background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, WHEEL_SIZE, WHEEL_SIZE);

  // Try to load background asset
  const bgImage = await loadCachedImage(path.join(assetsPath, 'wheel-background.png'));
  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, WHEEL_SIZE, WHEEL_SIZE);
  }

  // Draw wheel segments
  const segmentCount = players.length;
  const anglePerSegment = (2 * Math.PI) / segmentCount;

  for (let i = 0; i < segmentCount; i++) {
    const player = players[i];
    const startAngle = i * anglePerSegment - Math.PI / 2;
    const endAngle = startAngle + anglePerSegment;
    const midAngle = startAngle + anglePerSegment / 2;

    // Segment color
    let color = WHEEL_COLORS[i % WHEEL_COLORS.length];

    // Highlight current turn
    if (currentTurnId && player.userId === currentTurnId) {
      color = '#FFD700'; // Gold
    }

    // Darken eliminated
    if (eliminatedId && player.userId === eliminatedId) {
      color = '#2d2d2d';
    }

    // Draw segment
    ctx.beginPath();
    ctx.moveTo(CENTER_X, CENTER_Y);
    ctx.arc(CENTER_X, CENTER_Y, OUTER_RADIUS, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    // Draw segment border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw player name
    const textRadius = (OUTER_RADIUS + INNER_RADIUS) / 2;
    const textX = CENTER_X + Math.cos(midAngle) * textRadius;
    const textY = CENTER_Y + Math.sin(midAngle) * textRadius;

    ctx.save();
    ctx.translate(textX, textY);

    // Rotate text to follow wheel
    let textAngle = midAngle + Math.PI / 2;
    if (midAngle > Math.PI / 2 && midAngle < (3 * Math.PI) / 2) {
      textAngle += Math.PI;
    }
    ctx.rotate(textAngle);

    // Draw name
    ctx.font = '700 18px "Cairo", Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Truncate long names
    let name = player.displayName;
    if (name.length > 12) {
      name = name.slice(0, 10) + '..';
    }
    ctx.fillText(name, 0, 0);

    // Draw X for eliminated
    if (eliminatedId && player.userId === eliminatedId) {
      ctx.font = '700 32px Arial';
      ctx.fillStyle = '#E74C3C';
      ctx.fillText('✖', 0, 0);
    }

    ctx.restore();
  }

  // Draw inner circle
  ctx.beginPath();
  ctx.arc(CENTER_X, CENTER_Y, INNER_RADIUS, 0, 2 * Math.PI);
  ctx.fillStyle = '#0d0d1a';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Try to load center emblem
  const centerImage = await loadCachedImage(path.join(assetsPath, 'wheel-center.png'));
  if (centerImage) {
    const centerSize = INNER_RADIUS * 1.5;
    ctx.drawImage(
      centerImage,
      CENTER_X - centerSize / 2,
      CENTER_Y - centerSize / 2,
      centerSize,
      centerSize
    );
  } else {
    // Draw fallback center text
    ctx.font = '700 28px "Cairo", Arial';
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎡', CENTER_X, CENTER_Y);
  }

  // Try to load frame overlay
  const frameImage = await loadCachedImage(path.join(assetsPath, 'wheel-frame.png'));
  if (frameImage) {
    ctx.drawImage(frameImage, 0, 0, WHEEL_SIZE, WHEEL_SIZE);
  }

  // Draw pointer (on right side)
  const pointerImage = await loadCachedImage(path.join(assetsPath, 'pointer.png'));
  if (pointerImage) {
    ctx.drawImage(pointerImage, WHEEL_SIZE - 50, CENTER_Y - 25, 50, 50);
  } else {
    // Fallback pointer
    ctx.beginPath();
    ctx.moveTo(WHEEL_SIZE - 10, CENTER_Y);
    ctx.lineTo(WHEEL_SIZE - 40, CENTER_Y - 15);
    ctx.lineTo(WHEEL_SIZE - 40, CENTER_Y + 15);
    ctx.closePath();
    ctx.fillStyle = '#FFD700';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  return canvas.toBuffer('image/png');
}

/**
 * Generate spinning animation frame (future enhancement)
 */
export async function generateSpinFrame(players, rotation) {
  // Could implement actual spinning animation frames
  // For now, just return static wheel
  return generateWheelImage(players);
}
