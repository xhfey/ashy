/**
 * Roulette Wheel Generator
 * Generates an animated GIF of the spinning wheel.
 * Optimized for high quality: 2x Supersampling + Best GIF Quality
 */

import { createCanvas, loadImage, registerFont } from 'canvas';
import GIFEncoder from 'gif-encoder-2';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Register Fonts
try {
    const fontPath = path.join(__dirname, '../../../assets/fonts');
    if (fs.existsSync(path.join(fontPath, 'Cairo-Bold.ttf'))) {
        registerFont(path.join(fontPath, 'Cairo-Bold.ttf'), { family: 'Cairo', weight: '700' });
    }
    if (fs.existsSync(path.join(fontPath, 'Cinzel-Bold.ttf'))) {
        registerFont(path.join(fontPath, 'Cinzel-Bold.ttf'), { family: 'Cinzel', weight: '700' });
    }
} catch (e) {
    console.warn('Font registration failed:', e.message);
}

// ==================== CONSTANTS ====================

// 2x Supersampling for crisp details
const SCALE = 2;

const CANVAS = {
    width: 550 * SCALE,
    height: 550 * SCALE,
    centerX: 275 * SCALE,
    centerY: 275 * SCALE,
    targetWidth: 550,
    targetHeight: 550,
};

const WHEEL = {
    outerRadius: 220 * SCALE,
    innerRadius: 60 * SCALE,
    textRadius: 150 * SCALE,
};

const POINTER = {
    x: 500 * SCALE,
    y: 275 * SCALE,
    width: 60 * SCALE,  // Adjusted to actual asset size (60x40) scaled up
    height: 40 * SCALE,
};

const CENTER_EMBLEM = {
    // Center is 140x140 in design doc, but asset is 1024x1024.
    // We want it to be 140x140 in final output (280x280 in supersampled)
    width: 140 * SCALE,
    height: 140 * SCALE,
    get x() { return CANVAS.centerX - this.width / 2; },
    get y() { return CANVAS.centerY - this.height / 2; },
};

const SEGMENT_COLORS = [
    '#C98350', '#8B2942', '#D86075', '#413A86',
    '#BC495C', '#2D4A3E', '#D48D56', '#4A3B6B',
    '#8B4513', '#6B3A5B', '#3D5C5C', '#7B3F3F'
];

const COLORS = {
    text: '#ECECED',
    textShadow: '#000000',
    border: '#1A1A1A'
};

const ANIMATION = {
    frameDelay: 50, // 20fps
    phases: [
        { frames: 10, speed: 35 },
        { frames: 12, speed: 25 },
        { frames: 10, speed: 15 },
        { frames: 8, speed: 8 },
        { frames: 5, speed: 0 },
    ]
};

// ==================== ASSET LOADING ====================

const imageCache = new Map();

async function loadAsset(filename) {
    if (imageCache.has(filename)) return imageCache.get(filename);

    try {
        const assetPath = path.join(__dirname, '../../../assets/images/roulette', filename);
        const img = await loadImage(assetPath);
        imageCache.set(filename, img);
        return img;
    } catch (e) {
        console.error(`Failed to load asset ${filename}:`, e.message);
        return null;
    }
}

// ==================== DRAWING HELPERS ====================

function drawWheelSegments(ctx, players, rotationAngle) {
    const numSegments = players.length;
    const segmentAngle = (2 * Math.PI) / numSegments;

    ctx.save();
    ctx.translate(CANVAS.centerX, CANVAS.centerY);
    ctx.rotate(rotationAngle * Math.PI / 180);

    players.forEach((player, i) => {
        // 1. Draw Segment
        const startAngle = i * segmentAngle;
        const endAngle = (i + 1) * segmentAngle;

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, WHEEL.outerRadius, startAngle, endAngle);
        ctx.closePath();

        ctx.fillStyle = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
        ctx.fill();

        ctx.lineWidth = 2 * SCALE;
        ctx.strokeStyle = COLORS.border;
        ctx.stroke();

        // 2. Draw Text
        ctx.save();
        ctx.rotate(startAngle + segmentAngle / 2);
        ctx.translate(WHEEL.textRadius, 0);

        // Scale font size
        const fontSize = (players.length > 8 ? 14 : 16) * SCALE;
        ctx.font = `bold ${fontSize}px "Cairo", "Arial", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Shadow
        ctx.shadowColor = COLORS.textShadow;
        ctx.shadowBlur = 3 * SCALE;
        ctx.shadowOffsetX = 1 * SCALE;
        ctx.shadowOffsetY = 1 * SCALE;

        ctx.fillStyle = COLORS.text;
        ctx.fillText(player.name.slice(0, 12), 0, 0);

        ctx.restore();
    });

    ctx.restore();
}

// ==================== CORE GENERATOR ====================

/**
 * Generate Roulete Wheel GIF
 * @param {Array<{name: string}>} players - List of players
 * @param {number} winnerIndex - Index of the winner in the players array
 * @returns {Promise<Buffer>} - GIF Buffer
 */
export async function generateWheelGif(players, winnerIndex) {
    const [bgImg, frameImg, centerImg, pointerImg] = await Promise.all([
        loadAsset('wheel-background.png'),
        loadAsset('wheel-frame.png'),
        loadAsset('wheel-center.png'),
        loadAsset('pointer.png')
    ]);

    // Encoder setup for 550x550 output
    const encoder = new GIFEncoder(CANVAS.targetWidth, CANVAS.targetHeight);
    encoder.start();
    encoder.setRepeat(0);
    encoder.setDelay(ANIMATION.frameDelay);
    encoder.setQuality(1); // BEST Quality (1 is best, 20 is fast)
    encoder.setTransparent(0x00000000);

    // High-res canvas for rendering
    const renderCanvas = createCanvas(CANVAS.width, CANVAS.height);
    const ctx = renderCanvas.getContext('2d');

    // Final canvas for downscaling
    const finalCanvas = createCanvas(CANVAS.targetWidth, CANVAS.targetHeight);
    const finalCtx = finalCanvas.getContext('2d');

    // Animation Math
    const numSegments = players.length;
    const segmentAngle = 360 / numSegments;
    const winnerCenterAngle = (winnerIndex + 0.5) * segmentAngle;

    let totalAnimDistance = 0;
    for (const phase of ANIMATION.phases) {
        totalAnimDistance += phase.frames * phase.speed;
    }

    const finalTarget = 360 - winnerCenterAngle;
    let startAngle = finalTarget - (totalAnimDistance % 360);
    let currentAngle = startAngle;

    // Render Frames
    for (const phase of ANIMATION.phases) {
        for (let i = 0; i < phase.frames; i++) {
            // Clear High-res
            ctx.fillStyle = '#0f0f13';
            ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);

            // 1. Background (Scaled)
            if (bgImg) ctx.drawImage(bgImg, 0, 0, CANVAS.width, CANVAS.height);

            // 2. Spinning Wheel
            currentAngle += phase.speed;
            drawWheelSegments(ctx, players, currentAngle);

            // 3. Frame (Scaled)
            if (frameImg) ctx.drawImage(frameImg, 0, 0, CANVAS.width, CANVAS.height);

            // 4. Center Emblem (Scaled - fixes the 1024->140 jaggedness)
            if (centerImg) {
                ctx.drawImage(centerImg, CENTER_EMBLEM.x, CENTER_EMBLEM.y, CENTER_EMBLEM.width, CENTER_EMBLEM.height);
            }

            // 5. Pointer (Scaled)
            if (pointerImg) {
                ctx.drawImage(pointerImg, POINTER.x, POINTER.y - POINTER.height / 2, POINTER.width, POINTER.height);
            }

            // Downscale to final size
            finalCtx.drawImage(renderCanvas, 0, 0, CANVAS.targetWidth, CANVAS.targetHeight);

            encoder.addFrame(finalCtx);
        }
    }

    encoder.finish();
    return encoder.out.getData();
}
