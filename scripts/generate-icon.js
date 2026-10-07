/**
 * Generates the app icon as a 1200x1200 PNG using SVG → canvas → PNG.
 * Run: node scripts/generate-icon.js
 * Output: assets/icon-1200.png
 */
import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const SIZE = 1200;
const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext('2d');

// Background gradient — deep purple
const bg = ctx.createLinearGradient(0, 0, SIZE, SIZE);
bg.addColorStop(0, '#1a0533');
bg.addColorStop(0.5, '#2d1b69');
bg.addColorStop(1, '#0f1117');
ctx.fillStyle = bg;
// Rounded rect background
const r = 240;
ctx.beginPath();
ctx.moveTo(r, 0);
ctx.lineTo(SIZE - r, 0);
ctx.quadraticCurveTo(SIZE, 0, SIZE, r);
ctx.lineTo(SIZE, SIZE - r);
ctx.quadraticCurveTo(SIZE, SIZE, SIZE - r, SIZE);
ctx.lineTo(r, SIZE);
ctx.quadraticCurveTo(0, SIZE, 0, SIZE - r);
ctx.lineTo(0, r);
ctx.quadraticCurveTo(0, 0, r, 0);
ctx.closePath();
ctx.fill();

// Subtle radial glow in center
const glow = ctx.createRadialGradient(600, 600, 0, 600, 600, 500);
glow.addColorStop(0, 'rgba(108,99,255,0.35)');
glow.addColorStop(1, 'rgba(108,99,255,0)');
ctx.fillStyle = glow;
ctx.beginPath();
ctx.arc(600, 600, 500, 0, Math.PI * 2);
ctx.fill();

// Globe circle
ctx.strokeStyle = 'rgba(108,99,255,0.6)';
ctx.lineWidth = 14;
ctx.beginPath();
ctx.arc(600, 540, 270, 0, Math.PI * 2);
ctx.stroke();

// Globe meridian lines
ctx.strokeStyle = 'rgba(108,99,255,0.3)';
ctx.lineWidth = 8;
// Horizontal lines
for (const y of [-120, 0, 120]) {
  const ry = Math.abs(y) / 270;
  const hw = Math.sqrt(1 - ry * ry) * 270;
  ctx.beginPath();
  ctx.ellipse(600, 540 + y, hw, 20, 0, 0, Math.PI * 2);
  ctx.stroke();
}
// Vertical ellipse
ctx.beginPath();
ctx.ellipse(600, 540, 130, 270, 0, 0, Math.PI * 2);
ctx.stroke();

// Exchange arrows — horizontal swap
ctx.strokeStyle = '#6c63ff';
ctx.lineWidth = 28;
ctx.lineCap = 'round';
ctx.lineJoin = 'round';
// Arrow right (top)
const ay1 = 510;
ctx.beginPath();
ctx.moveTo(370, ay1);
ctx.lineTo(830, ay1);
ctx.stroke();
ctx.beginPath();
ctx.moveTo(780, ay1 - 50);
ctx.lineTo(840, ay1);
ctx.lineTo(780, ay1 + 50);
ctx.stroke();
// Arrow left (bottom)
const ay2 = 580;
ctx.beginPath();
ctx.moveTo(830, ay2);
ctx.lineTo(370, ay2);
ctx.stroke();
ctx.beginPath();
ctx.moveTo(420, ay2 - 50);
ctx.lineTo(360, ay2);
ctx.lineTo(420, ay2 + 50);
ctx.stroke();

// Currency symbols on arrows
ctx.fillStyle = '#ffffff';
ctx.font = 'bold 110px sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('$', 430, ay1);
ctx.fillText('€', 770, ay2);

// App name
ctx.fillStyle = '#ffffff';
ctx.font = 'bold 72px sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('Multi Currency', 600, 900);

ctx.fillStyle = '#9d97ff';
ctx.font = '52px sans-serif';
ctx.fillText('Converter', 600, 975);

// Save
const outDir = resolve(process.cwd(), 'assets');
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, 'icon-1200.png');
writeFileSync(outPath, canvas.toBuffer('image/png'));
console.log(`✅ Icon saved: ${outPath}`);
