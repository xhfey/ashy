/**
 * Mafia Image Generation
 *
 * Canvas-based image generation for Mafia game UI:
 * - generateTeamsBanner(dist, detectiveEnabled) → Buffer(PNG)
 * - generateWinBanner(winningTeam, players, roundsPlayed) → Buffer(PNG)
 * - generateRoleCard() → null (deferred)
 *
 * ALL visual elements are canvas-drawn (no emoji) for headless server compat.
 * Follows dice.images.js patterns: prewarm, caching, 2x supersampling, Cairo font.
 */

import { createCanvas, loadImage, registerFont } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../../utils/logger.js';
import { MAFIA_VISUAL_CONFIG as CFG } from '../../config/mafia.visual.config.js';
import { ROLE_NAMES, TEAMS, getTeam } from './mafia.constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '../../../');

// ==================== IMAGE CACHE ====================

const imageCache = new Map();
const CACHE_CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

const cacheCleanupTimer = setInterval(() => {
  if (imageCache.size > 0) {
    logger.info(`[MafiaImages] Clearing image cache (${imageCache.size} images)`);
    imageCache.clear();
  }
}, CACHE_CLEANUP_INTERVAL);
if (typeof cacheCleanupTimer.unref === 'function') cacheCleanupTimer.unref();

// ==================== FONT REGISTRATION ====================

try {
  const fontPath = path.join(PROJECT_ROOT, 'assets/fonts');
  const register = (filename, family, weight) => {
    const fullPath = path.join(fontPath, filename);
    if (!fs.existsSync(fullPath)) return;
    registerFont(fullPath, { family, weight });
  };

  // Readability-focused UI fonts.
  register('NotoSansArabicUI-ExtraBold.ttf', 'Noto Sans Arabic UI', '800');
  register('NotoSansArabicUI-Bold.ttf', 'Noto Sans Arabic UI', '700');
  register('NotoSansArabicUI-Medium.ttf', 'Noto Sans Arabic UI', '500');
  register('NotoSans-Bold.ttf', 'Noto Sans', '700');
  register('NotoSans-Medium.ttf', 'Noto Sans', '500');
  register('NotoSansSymbols2-Regular.ttf', 'Noto Sans Symbols 2', '400');

  // Fallback fonts.
  register('Cairo-Bold.ttf', 'Cairo', '700');
  register('ElMessiri-Bold.ttf', 'El Messiri', '700');
  register('Tajawal-ExtraBold.ttf', 'Tajawal ExtraBold', '800');
  register('Tajawal-Bold.ttf', 'Tajawal Bold', '700');
  register('Tajawal-Medium.ttf', 'Tajawal Medium', '500');
} catch (e) {
  logger.warn('[MafiaImages] Font registration warning:', e.message);
}

// ==================== CORE HELPERS ====================

const RENDER_SCALE = CFG.canvas.supersample;

function sanitizeDisplayName(raw, maxChars = 14) {
  let name = typeof raw === 'string' ? raw : '';
  name = name
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\uFE0F/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!name) return 'Unknown';
  const chars = Array.from(name);
  if (chars.length > maxChars) {
    return `${chars.slice(0, Math.max(1, maxChars - 1)).join('')}…`;
  }
  return name;
}

function isolateBidi(text) {
  return `\u2068${text}\u2069`;
}

function fitFontSize(ctx, text, options = {}) {
  const {
    baseSize,
    minSize,
    weight = 500,
    family,
    maxWidth,
  } = options;

  let size = baseSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  return size;
}

async function loadCachedImage(assetPath) {
  if (!assetPath) return null;
  if (imageCache.has(assetPath)) return imageCache.get(assetPath);

  try {
    const fullPath = path.join(PROJECT_ROOT, assetPath);
    const img = await loadImage(fullPath);
    imageCache.set(assetPath, img);
    return img;
  } catch (error) {
    logger.error(`[MafiaImages] Failed to load: ${assetPath}`, error.message);
    return null;
  }
}

/**
 * Load a Discord avatar from URL (supports http/https)
 */
async function loadAvatarImage(url) {
  if (!url) return null;
  const cacheKey = `avatar:${url}`;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);

  try {
    const img = await loadImage(url);
    imageCache.set(cacheKey, img);
    return img;
  } catch (error) {
    logger.warn(`[MafiaImages] Failed to load avatar: ${url}`, error.message);
    return null;
  }
}

function downsampleCanvas(sourceCanvas, targetWidth, targetHeight) {
  const finalCanvas = createCanvas(targetWidth, targetHeight);
  const finalCtx = finalCanvas.getContext('2d');
  finalCtx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
  return finalCanvas;
}

/**
 * Load all 4 role icons and return a map { MAFIA, CITIZEN, DOCTOR, DETECTIVE }
 */
async function loadRoleIcons() {
  const [mafiaIcon, citizenIcon, doctorIcon, detectiveIcon] = await Promise.all([
    loadCachedImage(CFG.assets.mafiaIcon),
    loadCachedImage(CFG.assets.citizenIcon),
    loadCachedImage(CFG.assets.doctorIcon),
    loadCachedImage(CFG.assets.detectiveIcon),
  ]);
  return { MAFIA: mafiaIcon, CITIZEN: citizenIcon, DOCTOR: doctorIcon, DETECTIVE: detectiveIcon };
}

// ==================== DRAWING HELPERS ====================

/**
 * Draw text with glow/shadow effect
 */
function drawGlowText(ctx, text, x, y, options = {}) {
  const {
    font,
    color = '#FFFFFF',
    align = 'center',
    baseline = 'middle',
    glowColor = 'rgba(0,0,0,0.65)',
    glowBlur = 5,
    outlineColor = 'rgba(0,0,0,0.5)',
    outlineWidth = 0.8,
  } = options;

  ctx.save();
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;

  if (glowBlur > 0) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glowBlur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  ctx.fillStyle = color;
  ctx.fillText(text, x, y);

  if (outlineWidth > 0) {
    ctx.shadowBlur = 0;
    ctx.lineWidth = outlineWidth;
    ctx.strokeStyle = outlineColor;
    ctx.strokeText(text, x, y);
  }

  ctx.restore();
}

/**
 * Draw an image inside a circular clip (center-cropped to square)
 */
function drawCircularIcon(ctx, img, cx, cy, size, borderWidth) {
  const radius = size / 2;
  ctx.save();

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  const srcSize = Math.min(img.width, img.height);
  const sx = (img.width - srcSize) / 2;
  const sy = (img.height - srcSize) / 2;

  ctx.drawImage(img, sx, sy, srcSize, srcSize, cx - radius, cy - radius, size, size);
  ctx.restore();

  // Border ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.lineWidth = borderWidth || CFG.icons.borderWidth || 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw detective fallback icon (canvas-drawn magnifying glass)
 */
function drawDetectiveFallback(ctx, cx, cy, size) {
  const radius = size / 2;
  ctx.save();

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = CFG.colors.detectiveFallbackBg;
  ctx.fill();
  ctx.strokeStyle = CFG.colors.detectiveFallbackBorder;
  ctx.lineWidth = CFG.icons.borderWidth || 3;
  ctx.stroke();

  const glassR = size * 0.18;
  const glassCx = cx - glassR * 0.25;
  const glassCy = cy - glassR * 0.25;

  ctx.beginPath();
  ctx.arc(glassCx, glassCy, glassR, 0, Math.PI * 2);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(glassCx + glassR * 0.7, glassCy + glassR * 0.7);
  ctx.lineTo(glassCx + glassR * 1.8, glassCy + glassR * 1.8);
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw a filled colored circle
 */
function drawColoredDot(ctx, cx, cy, radius, color) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/**
 * Draw a gradient divider line across the canvas
 */
function drawDivider(ctx, y, width, alpha = 0.4) {
  ctx.save();
  const grad = ctx.createLinearGradient(width * 0.2, 0, width * 0.8, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(width * 0.2, y);
  ctx.lineTo(width * 0.8, y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw an accent glow bar (horizontal gradient at top or bottom edge)
 */
function drawAccentBar(ctx, y, width, height, glowColor) {
  ctx.save();
  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.3, glowColor);
  grad.addColorStop(0.7, glowColor);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, y, width, height);
  ctx.restore();
}

/**
 * Draw background (image or gradient fallback) + overlay
 */
async function drawBackground(ctx, width, height, overlayAlpha = 0.3) {
  const bgImg = await loadCachedImage(CFG.assets.background);
  if (bgImg) {
    ctx.drawImage(bgImg, 0, 0, width, height);
  } else {
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#1a0a1e');
    grad.addColorStop(1, '#0d0d15');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Calculate adaptive spacing for N items within available width
 */
function calcSpacing(count, maxSpacing, minSpacing, availableWidth) {
  if (count <= 1) return { spacing: 0, totalWidth: 0 };
  const idealWidth = (count - 1) * maxSpacing;
  if (idealWidth <= availableWidth) {
    return { spacing: maxSpacing, totalWidth: idealWidth };
  }
  const spacing = Math.max(minSpacing, availableWidth / (count - 1));
  return { spacing, totalWidth: (count - 1) * spacing };
}

// ==================== TEAMS BANNER HELPERS ====================

/**
 * Draw a single role icon + role name below (no count text — Fizbo style)
 */
function drawRoleIcon(ctx, cx, cy, roleKey, iconImg, iconSize) {
  if (iconImg) {
    drawCircularIcon(ctx, iconImg, cx, cy, iconSize);
  } else if (roleKey === 'DETECTIVE') {
    drawDetectiveFallback(ctx, cx, cy, iconSize);
  }

  const name = ROLE_NAMES[roleKey] || roleKey;
  drawGlowText(ctx, name, cx, cy + CFG.roleText.offsetY, {
    font: `700 ${CFG.roleText.fontSize}px ${CFG.fonts.body || CFG.fonts.label}`,
    color: CFG.colors.roleText,
    glowBlur: 3,
    glowColor: 'rgba(0,0,0,0.8)',
  });
}

/**
 * Flatten role distribution into individual role entries for a team
 * e.g. { CITIZEN: 3, DOCTOR: 1 } → [{role: CITIZEN}, {role: CITIZEN}, {role: CITIZEN}, {role: DOCTOR}]
 */
function flattenTeamRoles(dist, teamRoleKeys) {
  const entries = [];
  for (const key of teamRoleKeys) {
    const count = dist[key] || 0;
    for (let i = 0; i < count; i++) {
      entries.push(key);
    }
  }
  return entries;
}

function drawRoleRows(ctx, roles, roleIcons, options = {}) {
  const {
    centerX,
    startY,
    availableWidth,
    iconSize,
    maxPerRow,
    rowGap,
  } = options;

  if (roles.length <= maxPerRow) {
    const layout = calcSpacing(roles.length, CFG.icons.spacingX, CFG.icons.minSpacingX, availableWidth);
    const startX = centerX - layout.totalWidth / 2;
    for (let i = 0; i < roles.length; i++) {
      const cx = roles.length === 1 ? centerX : startX + i * layout.spacing;
      drawRoleIcon(ctx, cx, startY, roles[i], roleIcons[roles[i]], iconSize);
    }
    return;
  }

  const row1Count = Math.ceil(roles.length / 2);
  const row1 = roles.slice(0, row1Count);
  const row2 = roles.slice(row1Count);

  const layout1 = calcSpacing(row1.length, CFG.icons.spacingX, CFG.icons.minSpacingX, availableWidth);
  const row1StartX = centerX - layout1.totalWidth / 2;
  for (let i = 0; i < row1.length; i++) {
    const cx = row1.length === 1 ? centerX : row1StartX + i * layout1.spacing;
    drawRoleIcon(ctx, cx, startY, row1[i], roleIcons[row1[i]], iconSize);
  }

  const row2Y = startY + rowGap;
  const layout2 = calcSpacing(row2.length, CFG.icons.spacingX, CFG.icons.minSpacingX, availableWidth);
  const row2StartX = centerX - layout2.totalWidth / 2;
  for (let i = 0; i < row2.length; i++) {
    const cx = row2.length === 1 ? centerX : row2StartX + i * layout2.spacing;
    drawRoleIcon(ctx, cx, row2Y, row2[i], roleIcons[row2[i]], iconSize);
  }
}

// ==================== WIN BANNER HELPERS ====================

/**
 * Canvas-drawn gold 5-point star (replaces trophy emoji)
 */
function drawCanvasTrophy(ctx, cx, cy, size) {
  const outerR = size / 2;
  const innerR = outerR * 0.4;
  const spikes = 5;

  ctx.save();
  ctx.beginPath();

  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / 2 * 3) + (i * Math.PI / spikes);
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.closePath();

  ctx.shadowColor = 'rgba(255, 215, 0, 0.6)';
  ctx.shadowBlur = 25;
  ctx.fillStyle = '#FFD700';
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255, 200, 0, 0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw a death badge (small dark circle with red X) at bottom-right of avatar
 */
function drawDeathBadge(ctx, cx, cy, avatarSize) {
  const badgeR = 12;
  const bx = cx + avatarSize / 2 - badgeR - 2;
  const by = cy + avatarSize / 2 - badgeR - 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 60, 60, 0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const xSize = 5;
  ctx.beginPath();
  ctx.moveTo(bx - xSize, by - xSize);
  ctx.lineTo(bx + xSize, by + xSize);
  ctx.moveTo(bx + xSize, by - xSize);
  ctx.lineTo(bx - xSize, by + xSize);
  ctx.strokeStyle = '#FF4444';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw a greyscale circular avatar using pixel manipulation
 */
function drawGreyscaleAvatar(ctx, img, cx, cy, size) {
  const radius = size / 2;
  const tempCanvas = createCanvas(size, size);
  const tempCtx = tempCanvas.getContext('2d');

  // Clip to circle on temp canvas
  tempCtx.beginPath();
  tempCtx.arc(radius, radius, radius, 0, Math.PI * 2);
  tempCtx.closePath();
  tempCtx.clip();

  // Center-crop source
  const srcSize = Math.min(img.width, img.height);
  const sx = (img.width - srcSize) / 2;
  const sy = (img.height - srcSize) / 2;
  tempCtx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, size, size);

  // Convert to greyscale
  const imageData = tempCtx.getImageData(0, 0, size, size);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const grey = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = grey;
    data[i + 1] = grey;
    data[i + 2] = grey;
  }
  tempCtx.putImageData(imageData, 0, 0);

  // Draw onto main canvas
  ctx.drawImage(tempCanvas, cx - radius, cy - radius);
}

/**
 * Draw a default avatar fallback (colored circle with first letter)
 */
function drawDefaultAvatar(ctx, cx, cy, size, displayName) {
  const radius = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = CFG.colors.defaultAvatarBg || '#5865F2';
  ctx.fill();

  const safe = sanitizeDisplayName(displayName, 2);
  const initial = Array.from(safe)[0] || '?';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 ${Math.floor(size * 0.4)}px ${CFG.fonts.small || CFG.fonts.label}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initial, cx, cy);
  ctx.restore();
}

/**
 * Draw a full player avatar slot: avatar circle + optional role icon + name
 */
async function drawPlayerAvatar(ctx, player, cx, cy, cfg, options = {}) {
  const {
    borderColor = '#FFFFFF',
    dimmed = false,
    accentColor = null,
    roleIconImg = null,
    nameMaxWidth = null,
  } = options;

  const size = cfg.avatarSize;
  const radius = size / 2;

  // Load avatar image
  const avatarImg = await loadAvatarImage(player.avatarURL);

  // Draw avatar
  if (avatarImg) {
    if (dimmed) {
      // Greyscale for losers
      ctx.save();
      ctx.globalAlpha = cfg.dimAlpha || 0.45;
      drawGreyscaleAvatar(ctx, avatarImg, cx, cy, size);
      ctx.globalAlpha = 1.0;
      ctx.restore();
    } else {
      drawCircularIcon(ctx, avatarImg, cx, cy, size, cfg.borderWidth);
    }
  } else {
    // Fallback avatar
    if (dimmed) {
      ctx.save();
      ctx.globalAlpha = cfg.dimAlpha || 0.45;
      drawDefaultAvatar(ctx, cx, cy, size, player.displayName);
      ctx.globalAlpha = 1.0;
      ctx.restore();
    } else {
      drawDefaultAvatar(ctx, cx, cy, size, player.displayName);
    }
  }

  // Border ring (colored for winners, grey for losers)
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.lineWidth = cfg.borderWidth;
  ctx.strokeStyle = dimmed ? 'rgba(150, 150, 150, 0.4)' : (accentColor || borderColor);
  ctx.stroke();
  ctx.restore();

  // Death badge for dead winners
  if (!dimmed && !player.alive) {
    drawDeathBadge(ctx, cx, cy, size);
  }

  // Role icon badge below avatar
  if (roleIconImg) {
    const iconY = cy + cfg.roleIconOffsetY;
    drawCircularIcon(ctx, roleIconImg, cx, iconY, cfg.roleIconSize, 2);
  } else if (player.role === 'DETECTIVE') {
    const iconY = cy + cfg.roleIconOffsetY;
    drawDetectiveFallback(ctx, cx, iconY, cfg.roleIconSize);
  }

  // Display name below
  const nameY = cy + cfg.nameOffsetY;
  const nameColor = dimmed ? (CFG.colors.dimmedText || 'rgba(255,255,255,0.65)') : (CFG.colors.playerName || '#FFFFFF');
  const rawName = sanitizeDisplayName(player.displayName, cfg.nameMaxChars || 14);
  const safeName = isolateBidi(rawName);
  const maxNameWidth = Math.max(90, nameMaxWidth ?? Math.max(cfg.avatarSize * 2, 160));
  const fittedSize = fitFontSize(ctx, safeName, {
    baseSize: cfg.nameFontSize,
    minSize: Math.max(13, Math.floor(cfg.nameFontSize * 0.62)),
    weight: 700,
    family: CFG.fonts.small || CFG.fonts.body || CFG.fonts.label,
    maxWidth: maxNameWidth,
  });

  drawGlowText(ctx, safeName, cx, nameY, {
    font: `700 ${fittedSize}px ${CFG.fonts.small || CFG.fonts.body || CFG.fonts.label}`,
    color: nameColor,
    glowBlur: dimmed ? 1.5 : 2.2,
    glowColor: 'rgba(0,0,0,0.8)',
    outlineWidth: dimmed ? 0.5 : 0.7,
  });
}

// ==================== EXPORTS ====================

/**
 * Prewarm all Mafia image assets into memory cache
 */
export async function prewarmMafiaAssets() {
  if (!CFG.enabled) {
    logger.debug('[MafiaImages] Image generation disabled');
    return;
  }

  const assetPaths = Object.values(CFG.assets).filter(Boolean);
  await Promise.allSettled(assetPaths.map(p => loadCachedImage(p)));
  logger.info(`[MafiaImages] Asset prewarm complete (${assetPaths.length} assets)`);
}

/**
 * Generate team distribution banner image
 *
 * Shows one icon PER player (duplicate icons for same role), Fizbo style.
 * e.g. 3 mafia = 3 separate mafia icons, not "mafia ×3"
 *
 * @param {Object} dist - Role distribution { MAFIA, DOCTOR, DETECTIVE, CITIZEN }
 * @param {boolean} detectiveEnabled - Whether detective role is in this game
 * @returns {Buffer|null} PNG buffer, or null if images disabled
 */
export async function generateTeamsBanner(dist, detectiveEnabled) {
  if (!CFG.enabled) return null;

  const { width } = CFG.canvas;

  const team2Roles = flattenTeamRoles(dist, ['MAFIA']);
  const team1RoleKeys = ['CITIZEN', 'DOCTOR'];
  if (detectiveEnabled && dist.DETECTIVE > 0) team1RoleKeys.push('DETECTIVE');
  const team1Roles = flattenTeamRoles(dist, team1RoleKeys);

  const maxPerRow = CFG.icons.maxPerRow || 4;
  const rowGap = CFG.icons.rowGap || 200;
  const needsMultiRow = team1Roles.length > maxPerRow || team2Roles.length > maxPerRow;
  const height = needsMultiRow
    ? CFG.canvas.height + (CFG.canvas.dynamicHeightIncrease || 320)
    : CFG.canvas.height;

  try {
    const renderCanvas = createCanvas(width * RENDER_SCALE, height * RENDER_SCALE);
    const ctx = renderCanvas.getContext('2d');
    ctx.scale(RENDER_SCALE, RENDER_SCALE);

    // 1. Background + overlay
    await drawBackground(ctx, width, height, CFG.overlayAlpha?.teams ?? 0.16);

    // 2. Team labels
    const labelFont = `700 ${CFG.teamLabels.fontSize}px ${CFG.fonts.label}`;

    drawGlowText(ctx, 'الفريق الثاني', CFG.teamLabels.team2.x, CFG.teamLabels.team2.y, {
      font: labelFont,
      color: CFG.colors.team2,
      glowColor: CFG.colors.team2Glow || 'rgba(239,68,68,0.45)',
      glowBlur: 6,
      outlineWidth: 0.8,
      outlineColor: 'rgba(0,0,0,0.32)',
    });

    drawGlowText(ctx, 'الفريق الاول', CFG.teamLabels.team1.x, CFG.teamLabels.team1.y, {
      font: labelFont,
      color: CFG.colors.team1,
      glowColor: CFG.colors.team1Glow || 'rgba(74,222,128,0.45)',
      glowBlur: 6,
      outlineWidth: 0.8,
      outlineColor: 'rgba(0,0,0,0.32)',
    });

    // 3. Load role icons
    const roleIcons = await loadRoleIcons();

    // 4. Team 2 roles (Mafia — left side)
    const team2CenterX = CFG.teamLabels.team2.x;
    const iconY = CFG.teamLabels.team2.y + CFG.icons.offsetY;
    const iconSize = CFG.icons.size;

    // Available width for each side
    const team2Available = width / 2 - 90;
    drawRoleRows(ctx, team2Roles, roleIcons, {
      centerX: team2CenterX,
      startY: iconY,
      availableWidth: team2Available,
      iconSize,
      maxPerRow,
      rowGap,
    });

    // 5. Team 1 roles (Citizens — right side)
    const team1CenterX = CFG.teamLabels.team1.x;
    const team1Available = width / 2 - 90;
    drawRoleRows(ctx, team1Roles, roleIcons, {
      centerX: team1CenterX,
      startY: iconY,
      availableWidth: team1Available,
      iconSize,
      maxPerRow,
      rowGap,
    });

    // 6. Team objectives at bottom corners (Fizbo style)
    const objY = needsMultiRow ? height - 72 : CFG.objectives.y;
    const objFont = `700 ${CFG.objectives.fontSize}px ${CFG.fonts.body || CFG.fonts.label}`;
    const dotR = 7;

    // Team 1 objective (right side)
    const obj1X = CFG.objectives.team1.x;
    drawColoredDot(ctx, obj1X - 180, objY, dotR, CFG.colors.team1);
    drawGlowText(ctx, 'الهدف : كشف المافيا قبل ما ينقتلون', obj1X, objY, {
      font: objFont,
      color: CFG.colors.team1,
      glowBlur: 3,
      glowColor: 'rgba(60, 255, 107, 0.4)',
    });

    // Team 2 objective (left side)
    const obj2X = CFG.objectives.team2.x;
    drawColoredDot(ctx, obj2X - 180, objY, dotR, CFG.colors.team2);
    drawGlowText(ctx, 'الهدف : اغتيال جميع اعضاء الشعب', obj2X, objY, {
      font: objFont,
      color: CFG.colors.team2,
      glowBlur: 3,
      glowColor: 'rgba(255, 60, 60, 0.4)',
    });

    // 7. Downsample and export
    const finalCanvas = downsampleCanvas(renderCanvas, width, height);
    return finalCanvas.toBuffer('image/png');

  } catch (error) {
    logger.error('[MafiaImages] generateTeamsBanner failed:', error);
    return null;
  }
}

/**
 * Generate win banner image
 *
 * Horizontal avatar rows, canvas-drawn elements (no emoji).
 * Winners displayed big & colorful, losers small & greyed out.
 *
 * @param {number} winningTeam - 1 (Citizens) or 2 (Mafia)
 * @param {Object[]} players - Array of { userId, displayName, role, alive, avatarURL }
 * @param {number} roundsPlayed - Number of rounds played
 * @returns {Buffer|null} PNG buffer, or null if images disabled
 */
export async function generateWinBanner(winningTeam, players, roundsPlayed) {
  if (!CFG.enabled) return null;

  const { width } = CFG.canvas;
  const WB = CFG.winBanner;
  const maxWinnersPerRow = WB.winners.maxPerRow || 4;
  const maxLosersPerRow = WB.losers.maxPerRow || 4;

  const winners = players.filter(p => getTeam(p.role) === winningTeam);
  const losers = players.filter(p => getTeam(p.role) !== winningTeam);
  const winnersMultiRow = winners.length > maxWinnersPerRow;
  const losersMultiRow = losers.length > maxLosersPerRow;

  let height = CFG.canvas.height;
  if (winnersMultiRow) height += 220;
  if (losersMultiRow) height += 170;

  try {
    const renderCanvas = createCanvas(width * RENDER_SCALE, height * RENDER_SCALE);
    const ctx = renderCanvas.getContext('2d');
    ctx.scale(RENDER_SCALE, RENDER_SCALE);

    // 1. Background + overlay
    await drawBackground(ctx, width, height, CFG.overlayAlpha?.win ?? WB.overlayAlpha ?? 0.16);

    // 2. Theme colors
    const isTeam1 = winningTeam === TEAMS.TEAM_1;
    const accentColor = isTeam1 ? CFG.colors.team1 : CFG.colors.team2;
    const accentGlow = isTeam1
      ? (CFG.colors.team1Glow || 'rgba(74,222,128,0.45)')
      : (CFG.colors.team2Glow || 'rgba(239,68,68,0.45)');
    const teamName = isTeam1 ? 'الفريق الاول' : 'الفريق الثاني';
    const teamSubtitle = isTeam1 ? 'المدنيون' : 'المافيا';

    // 3. Top accent bar
    drawAccentBar(ctx, 0, width, WB.accentBarHeight, accentGlow);

    // 4. Canvas-drawn trophy (no emoji)
    drawCanvasTrophy(ctx, width / 2, WB.trophy.y, WB.trophy.size);

    // 5. Title
    drawGlowText(ctx, `فاز ${teamName}`, width / 2, WB.title.y, {
      font: `700 ${WB.title.fontSize}px ${CFG.fonts.title || CFG.fonts.label}`,
      color: accentColor,
      glowColor: accentGlow,
      glowBlur: 7,
      outlineWidth: 0.9,
      outlineColor: 'rgba(0,0,0,0.35)',
    });

    // 6. Subtitle
    drawGlowText(ctx, `( ${teamSubtitle} )`, width / 2, WB.title.subtitleY, {
      font: `700 ${WB.title.subtitleFontSize}px ${CFG.fonts.label}`,
      color: accentColor,
      glowColor: accentGlow,
      glowBlur: 4,
      outlineWidth: 0.6,
    });

    // 7. Divider
    drawDivider(ctx, WB.dividerY, width, 0.28);

    // 8. Load role icons
    const roleIcons = await loadRoleIcons();

    // 9. Winners label
    drawGlowText(ctx, 'الفائزون', width / 2, WB.winners.labelY, {
      font: `700 ${WB.winners.labelFontSize}px ${CFG.fonts.label}`,
      color: '#FFD700',
      glowColor: 'rgba(255, 215, 0, 0.5)',
      glowBlur: 4,
    });

    // 10. Winner avatars (single/multi row)
    const drawPlayerRows = async (list, cfg, yStart, opts = {}) => {
      const maxPerRow = cfg.maxPerRow || 4;
      const rowGap = cfg.rowGap || 180;
      const margin = opts.margin || 100;
      const minSpacing = opts.minSpacing || 80;

      if (list.length <= maxPerRow) {
        const layout = calcSpacing(list.length, cfg.avatarSpacing, minSpacing, width - margin * 2);
        const startX = width / 2 - layout.totalWidth / 2;
        const nameWidth = Math.max(90, Math.min(cfg.avatarSize * 1.9, layout.spacing * 0.84));
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          const cx = list.length === 1 ? width / 2 : startX + i * layout.spacing;
          await drawPlayerAvatar(ctx, p, cx, yStart, cfg, { ...opts.avatarOpts(p), nameMaxWidth: nameWidth });
        }
        return { rows: 1, yEnd: yStart };
      }

      const row1Count = Math.ceil(list.length / 2);
      const row1 = list.slice(0, row1Count);
      const row2 = list.slice(row1Count);

      const layout1 = calcSpacing(row1.length, cfg.avatarSpacing, minSpacing, width - margin * 2);
      const row1StartX = width / 2 - layout1.totalWidth / 2;
      const row1NameWidth = Math.max(90, Math.min(cfg.avatarSize * 1.9, layout1.spacing * 0.84));
      for (let i = 0; i < row1.length; i++) {
        const p = row1[i];
        const cx = row1.length === 1 ? width / 2 : row1StartX + i * layout1.spacing;
        await drawPlayerAvatar(ctx, p, cx, yStart, cfg, { ...opts.avatarOpts(p), nameMaxWidth: row1NameWidth });
      }

      const row2Y = yStart + rowGap;
      const layout2 = calcSpacing(row2.length, cfg.avatarSpacing, minSpacing, width - margin * 2);
      const row2StartX = width / 2 - layout2.totalWidth / 2;
      const row2NameWidth = Math.max(90, Math.min(cfg.avatarSize * 1.9, layout2.spacing * 0.84));
      for (let i = 0; i < row2.length; i++) {
        const p = row2[i];
        const cx = row2.length === 1 ? width / 2 : row2StartX + i * layout2.spacing;
        await drawPlayerAvatar(ctx, p, cx, row2Y, cfg, { ...opts.avatarOpts(p), nameMaxWidth: row2NameWidth });
      }

      return { rows: 2, yEnd: row2Y };
    };

    await drawPlayerRows(winners, WB.winners, WB.winners.avatarY, {
      margin: 100,
      minSpacing: 90,
      avatarOpts: (p) => ({
        borderColor: accentColor,
        dimmed: false,
        accentColor: p.alive ? accentColor : 'rgba(200,200,200,0.55)',
        roleIconImg: roleIcons[p.role] || null,
      }),
    });

    const winnerSectionShift = winnersMultiRow ? (WB.winners.rowGap || 220) - 35 : 0;

    // 11. Divider before losers
    const losersLabelY = WB.losers.labelY + winnerSectionShift;
    const loserDivY = losersLabelY - 25;
    drawDivider(ctx, loserDivY, width, 0.2);

    // 12. Losers label
    drawGlowText(ctx, 'الخاسرون', width / 2, losersLabelY, {
      font: `700 ${WB.losers.labelFontSize}px ${CFG.fonts.label}`,
      color: 'rgba(255,255,255,0.45)',
      glowBlur: 2.5,
      glowColor: 'rgba(0,0,0,0.6)',
    });

    // 13. Loser avatars (single/multi row)
    const losersStartY = WB.losers.avatarY + winnerSectionShift;
    await drawPlayerRows(losers, WB.losers, losersStartY, {
      margin: 120,
      minSpacing: 70,
      avatarOpts: (p) => ({
        borderColor: 'rgba(150,150,150,0.45)',
        dimmed: true,
        roleIconImg: roleIcons[p.role] || null,
      }),
    });

    // 14. Round count
    const footerShift = winnerSectionShift + (losersMultiRow ? (WB.losers.rowGap || 170) - 40 : 0);
    const footerY = Math.min(WB.footer.y + footerShift, height - 40);
    drawGlowText(ctx, `عدد الجولات: ${roundsPlayed}`, width / 2, footerY, {
      font: `700 ${WB.footer.fontSize}px ${CFG.fonts.label}`,
      color: 'rgba(255,255,255,0.7)',
      glowBlur: 2.5,
      glowColor: 'rgba(0,0,0,0.6)',
    });

    // 15. Bottom accent bar
    drawAccentBar(ctx, height - WB.accentBarHeight, width, WB.accentBarHeight, accentGlow);

    // 16. Downsample and export
    const finalCanvas = downsampleCanvas(renderCanvas, width, height);
    return finalCanvas.toBuffer('image/png');

  } catch (error) {
    logger.error('[MafiaImages] generateWinBanner failed:', error);
    return null;
  }
}

/**
 * Generate role card (deferred — not yet implemented)
 * @returns {null}
 */
export function generateRoleCard() {
  return null;
}
