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

// The gold inner frame line sits this far in from the edge; nothing drawn crosses it.
const INNER = 40;
// The space under the photos for the caption: from the lowest slot to the
// inner frame line, or on the frameless strip to as far from the bottom
// edge as the photos start from the top.
const CAPTION_BAND = 160;
// The least room the caption keeps from the photos above it, the line
// below it and the sides of its band.
const CAPTION_CLEARANCE = 28;

type Band = { top: number; bottom: number; left: number; right: number };

type CaptionStyle = { size: number; subSize: number; subGap: number; tracking: number };
const CAPTION: CaptionStyle = { size: 54, subSize: 24, subGap: 48, tracking: 6 };
const STRIP_CAPTION: CaptionStyle = { size: 40, subSize: 18, subGap: 40, tracking: 5 };

function captionText(cx: number, baseline: number, caption: string, sub: string, style: CaptionStyle): string {
  return `<text x="${cx}" y="${baseline}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${style.size}" fill="#1d2621">${caption}</text>
    <text x="${cx}" y="${baseline + style.subGap}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${style.subSize}" letter-spacing="${style.tracking}" fill="#7a5d24">${sub}</text>`;
}

/** The rows and columns the drawn text actually covers, whatever fonts this machine substituted. */
async function inkBounds(width: number, height: number, fragment: string): Promise<Band> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${fragment}</svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ink: Band = { top: info.height, bottom: -1, left: info.width, right: -1 };
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] === 0) continue;
      ink.top = Math.min(ink.top, y);
      ink.bottom = Math.max(ink.bottom, y + 1);
      ink.left = Math.min(ink.left, x);
      ink.right = Math.max(ink.right, x + 1);
    }
  }
  if (ink.bottom < 0) throw new Error("The caption drew nothing: no font for it on this machine?");
  return ink;
}

/**
 * Sets the caption and its small line centred in the band, measured from
 * the rendered text rather than guessed from font sizes, and refuses to
 * write a layout where it would touch the photos or the frame.
 */
async function caption(width: number, height: number, band: Band, title: string, sub: string, style: CaptionStyle): Promise<string> {
  const cx = (band.left + band.right) / 2;
  const trial = Math.round((band.top + band.bottom) / 2);
  const ink = await inkBounds(width, height, captionText(cx, trial, title, sub, style));
  const baseline = trial + Math.round((band.top + band.bottom - ink.top - ink.bottom) / 2);
  const fragment = captionText(cx, baseline, title, sub, style);
  const placed = await inkBounds(width, height, fragment);
  const room = Math.min(placed.top - band.top, band.bottom - placed.bottom, placed.left - band.left, band.right - placed.right);
  if (room < CAPTION_CLEARANCE) {
    throw new Error(`"${title}" caption keeps ${room} px from its band, under the ${CAPTION_CLEARANCE} px it needs`);
  }
  return fragment;
}

/** The bottom edge of the lowest slot, where the caption band starts. */
function slotsBottom(rects: Rect[]): number {
  return Math.max(...rects.map((r) => r.y + r.h));
}

async function frame(width: number, height: number, rects: Rect[], title: string, sub: string): Promise<string> {
  const band = { top: slotsBottom(rects), bottom: height - INNER, left: INNER, right: width - INNER };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#f4efe4"/>
    <rect x="30" y="30" width="${width - 60}" height="${height - 60}" fill="none" stroke="#1d2621" stroke-width="3"/>
    <rect x="${INNER}" y="${INNER}" width="${width - 2 * INNER}" height="${height - 2 * INNER}" fill="none" stroke="#b8923a" stroke-width="1.5"/>
    ${slotRects(rects)}
    ${await caption(width, height, band, title, sub, CAPTION)}
  </svg>`;
}

async function png(svg: string, file: string) {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(file);
  console.log("wrote", path.relative(ROOT, file));
}

async function templates() {
  await mkdir(TEMPLATES, { recursive: true });

  // 1. Two by two: the default. Four 3:2 slots, as tall as the caption band allows.
  {
    const gap = 30, top = 70;
    const sh = Math.floor((H - INNER - CAPTION_BAND - top - gap) / 2);
    const sw = sh * 1.5;
    const left = (W - 2 * sw - gap) / 2;
    const rects = [0, 1].flatMap((r) => [0, 1].map((c) => ({ x: left + c * (sw + gap), y: top + r * (sh + gap), w: sw, h: sh })));
    await png(await frame(W, H, rects, "Two by two", "PHOTO BOOTH"), path.join(TEMPLATES, "01-two-by-two.png"));
  }

  // 2. Big shot: one slot, for the large groups.
  {
    const top = 70;
    const rects = [{ x: 70, y: top, w: W - 140, h: H - INNER - CAPTION_BAND - top }];
    await png(await frame(W, H, rects, "Big shot", "PHOTO BOOTH"), path.join(TEMPLATES, "02-big-shot.png"));
  }

  // 3. Three up: portrait, three wide slots stacked.
  {
    const pw = H, ph = W;
    const gap = 30, top = 70;
    const sw = pw - 140, sh = Math.floor((ph - INNER - CAPTION_BAND - top - 2 * gap) / 3);
    const rects = [0, 1, 2].map((r) => ({ x: 70, y: top + r * (sh + gap), w: sw, h: sh }));
    await png(await frame(pw, ph, rects, "Three up", "PHOTO BOOTH"), path.join(TEMPLATES, "03-three-up.png"));
  }

  // 4. Double strip: portrait, two identical 50 x 148 mm strips side by
  // side, cut lengthwise. Reading order pairs the strips row by row, so
  // the sidecar maps slots [A1, B1, A2, B2, A3, B3] to shots [1,1,2,2,3,3].
  {
    const pw = H, ph = W;
    const half = pw / 2;
    const sw = 480, gap = 30, top = 70;
    // No frame to sit inside: each strip's caption band ends as far from
    // the bottom edge as its first photo starts from the top.
    const sh = Math.floor((ph - top - CAPTION_BAND - top - 2 * gap) / 3);
    const rects = [0, 1, 2].flatMap((r) => [0, 1].map((s) => ({ x: s * half + (half - sw) / 2, y: top + r * (sh + gap), w: sw, h: sh })));
    const cut = `<line x1="${half}" y1="30" x2="${half}" y2="${ph - 30}" stroke="#b8923a" stroke-width="1" stroke-dasharray="12 10"/>`;
    const captions = await Promise.all(
      [0, 1].map((s) =>
        caption(pw, ph, { top: slotsBottom(rects), bottom: ph - top, left: s * half, right: (s + 1) * half }, "Double strip", "PHOTO BOOTH", STRIP_CAPTION),
      ),
    );
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}" viewBox="0 0 ${pw} ${ph}">
      <rect width="${pw}" height="${ph}" fill="#f4efe4"/>
      ${slotRects(rects)}
      ${cut}
      ${captions.join("")}
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
