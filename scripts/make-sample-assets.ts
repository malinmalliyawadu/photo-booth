/**
 * Generates stand-in artwork so the booth runs with no hardware and no
 * Canva: four layouts under templates/ with magenta slots exactly as a
 * Canva export would carry them, and eight sample photos the fake camera
 * returns. The real templates replace the PNGs; the script stays for
 * anyone who clones the repo.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const TEMPLATES = path.join(ROOT, "templates");
const SAMPLES = path.join(ROOT, "packages/worker/samples");
// The kiosk's layout picker and the admin preview show the same photos.
const PUBLIC_SAMPLES = path.join(ROOT, "apps/booth/public/samples");

const W = 1748;
const H = 1181;
const MAGENTA = "#FF00FF";

type Rect = { x: number; y: number; w: number; h: number };

function slotRects(rects: Rect[]): string {
  return rects.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${MAGENTA}"/>`).join("");
}

function frame(width: number, height: number, inner: string, caption: string, sub: string): string {
  const captionY = height - 70;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#f4efe4"/>
    <rect x="30" y="30" width="${width - 60}" height="${height - 60}" fill="none" stroke="#1d2621" stroke-width="3"/>
    <rect x="40" y="40" width="${width - 80}" height="${height - 80}" fill="none" stroke="#b8923a" stroke-width="1.5"/>
    ${inner}
    <text x="${width / 2}" y="${captionY}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="54" fill="#1d2621">${caption}</text>
    <text x="${width / 2}" y="${captionY + 40}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="24" letter-spacing="6" fill="#7a5d24">${sub}</text>
  </svg>`;
}

async function png(svg: string, file: string) {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(file);
  console.log("wrote", path.relative(ROOT, file));
}

async function templates() {
  await mkdir(TEMPLATES, { recursive: true });

  // 1. Two by two: the default. 720 x 480 slots, a caption band below.
  {
    const sw = 720, sh = 480, gap = 30, top = 70;
    const left = (W - 2 * sw - gap) / 2;
    const rects = [0, 1].flatMap((r) => [0, 1].map((c) => ({ x: left + c * (sw + gap), y: top + r * (sh + gap), w: sw, h: sh })));
    await png(frame(W, H, slotRects(rects), "Two by two", "PHOTO BOOTH"), path.join(TEMPLATES, "01-two-by-two.png"));
  }

  // 2. Big shot: one slot, for the large groups.
  {
    const rects = [{ x: 70, y: 70, w: W - 140, h: 920 }];
    await png(frame(W, H, slotRects(rects), "Big shot", "PHOTO BOOTH"), path.join(TEMPLATES, "02-big-shot.png"));
  }

  // 3. Three up: portrait, three wide slots stacked.
  {
    const pw = H, ph = W;
    const sw = pw - 140, sh = 440, gap = 30, top = 70;
    const rects = [0, 1, 2].map((r) => ({ x: 70, y: top + r * (sh + gap), w: sw, h: sh }));
    await png(frame(pw, ph, slotRects(rects), "Three up", "PHOTO BOOTH"), path.join(TEMPLATES, "03-three-up.png"));
  }

  // 4. Double strip: portrait, two identical 50 x 148 mm strips side by
  // side, cut lengthwise. Reading order pairs the strips row by row, so
  // the sidecar maps slots [A1, B1, A2, B2, A3, B3] to shots [1,1,2,2,3,3].
  {
    const pw = H, ph = W;
    const half = pw / 2;
    const sw = 480, sh = 420, gap = 30, top = 70;
    const rects = [0, 1, 2].flatMap((r) => [0, 1].map((s) => ({ x: s * half + (half - sw) / 2, y: top + r * (sh + gap), w: sw, h: sh })));
    const cut = `<line x1="${half}" y1="30" x2="${half}" y2="${ph - 30}" stroke="#b8923a" stroke-width="1" stroke-dasharray="12 10"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}" viewBox="0 0 ${pw} ${ph}">
      <rect width="${pw}" height="${ph}" fill="#f4efe4"/>
      ${slotRects(rects)}
      ${cut}
      ${[0, 1].map((s) => `<text x="${s * half + half / 2}" y="${ph - 150}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="40" fill="#1d2621">Double strip</text>
      <text x="${s * half + half / 2}" y="${ph - 110}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="18" letter-spacing="5" fill="#7a5d24">PHOTO BOOTH</text>`).join("")}
    </svg>`;
    await png(svg, path.join(TEMPLATES, "04-double-strip.png"));
    await writeFile(path.join(TEMPLATES, "04-double-strip.json"), JSON.stringify({ shots: [1, 1, 2, 2, 3, 3] }, null, 2) + "\n");
  }
}

async function samples() {
  await mkdir(SAMPLES, { recursive: true });
  await mkdir(PUBLIC_SAMPLES, { recursive: true });
  const palettes = [
    ["#f7b267", "#f4845f"],
    ["#5c7aea", "#a0c4ff"],
    ["#2a9d8f", "#e9c46a"],
    ["#e76f51", "#f4a261"],
    ["#8d99ae", "#edf2f4"],
    ["#b56576", "#eaac8b"],
    ["#355070", "#6d597a"],
    ["#43aa8b", "#90be6d"],
  ];
  for (let i = 0; i < palettes.length; i++) {
    const [a, b] = palettes[i]!;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200" viewBox="0 0 1800 1200">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
      <rect width="1800" height="1200" fill="url(#g)"/>
      <circle cx="${600 + i * 80}" cy="${500 + (i % 3) * 60}" r="260" fill="#ffffff" fill-opacity="0.18"/>
      <circle cx="${1200 - i * 60}" cy="${700 - (i % 2) * 120}" r="180" fill="#000000" fill-opacity="0.08"/>
      <text x="900" y="680" text-anchor="middle" font-family="Georgia, serif" font-size="420" fill="#ffffff" fill-opacity="0.9">${i + 1}</text>
      <text x="900" y="800" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="48" letter-spacing="12" fill="#ffffff" fill-opacity="0.8">SAMPLE SHOT</text>
    </svg>`;
    const file = path.join(SAMPLES, `sample-${i + 1}.jpg`);
    await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile(file);
    await sharp(Buffer.from(svg)).resize({ width: 600 }).jpeg({ quality: 80 }).toFile(path.join(PUBLIC_SAMPLES, `sample-${i + 1}.jpg`));
    console.log("wrote", path.relative(ROOT, file));
  }
}

await templates();
await samples();
