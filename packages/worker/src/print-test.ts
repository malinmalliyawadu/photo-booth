/**
 * `pnpm print:test`: a calibration card through the booth's own printer
 * code, the way a guest's print goes.
 *
 * The card is the postcard at print size with a coloured frame at each
 * of several distances from the edge. Borderless printing trims a
 * little off every side, so the outermost frame left whole on the card
 * is how much a layout must keep clear (`SAFE_MARGIN_MM` in core). The
 * colour patches and the grey wedge are for checking the print against
 * the screen.
 *
 *   pnpm print:test                       # print it on BOOTH_PRINTER
 *   pnpm print:test -- --out card.jpg     # only write the file
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { PRINT_DPI, PRINT_PX, SAFE_MARGIN_MM } from "@booth/core";
import { printerFor } from "./printer";

/** Frames, in millimetres from the edge, each in its own colour. */
const FRAMES: [mm: number, colour: string][] = [
  [1, "#d7263d"],
  [2, "#f46036"],
  [3, "#e2a100"],
  [4, "#1b998b"],
  [5, "#2e86de"],
  [6, "#6c3fc5"],
  [8, "#c2185b"],
  [10, "#222222"],
];
const PATCHES = ["#ff0000", "#00ff00", "#0000ff", "#00ffff", "#ff00ff", "#ffff00"];
const FONT = "DejaVu Sans, Helvetica, Arial, sans-serif";

const px = (mm: number) => (mm / 25.4) * PRINT_DPI;

function calibrationSvg(now: Date): string {
  const { width: W, height: H } = PRINT_PX;
  const stroke = 3;
  const frames = FRAMES.map(([mm, colour]) => {
    const inset = px(mm) - stroke / 2;
    return `<rect x="${inset}" y="${inset}" width="${W - 2 * inset}" height="${H - 2 * inset}" fill="none" stroke="${colour}" stroke-width="${stroke}"/>`;
  }).join("");

  const legendX = 360;
  const legend = FRAMES.map(([mm, colour], i) => {
    const y = 520 + i * 52;
    const note = mm === SAFE_MARGIN_MM ? " · the layouts' safe margin now" : "";
    return `<rect x="${legendX}" y="${y - 30}" width="60" height="34" fill="${colour}"/>
      <text x="${legendX + 80}" y="${y}" font-family="${FONT}" font-size="34" fill="#222">${mm} mm${note}</text>`;
  }).join("");

  const patchX = 1150;
  const patches = PATCHES.map(
    (c, i) => `<rect x="${patchX + (i % 3) * 82}" y="${490 + Math.floor(i / 3) * 82}" width="72" height="72" fill="${c}"/>`,
  ).join("");
  const wedge = Array.from({ length: 11 }, (_, i) => {
    const v = Math.round((255 * i) / 10);
    return `<rect x="${patchX + i * 22}" y="750" width="22" height="90" fill="rgb(${v},${v},${v})"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    ${frames}
    <text x="${legendX}" y="330" font-family="${FONT}" font-size="56" font-weight="bold" fill="#222">Booth test print</text>
    <text x="${legendX}" y="375" font-family="${FONT}" font-size="28" fill="#666">${now.toISOString().slice(0, 16).replace("T", " ")} UTC · the outermost whole frame is the safe margin</text>
    <text x="${legendX}" y="455" font-family="${FONT}" font-size="26" fill="#666" letter-spacing="3">FRAME FROM THE EDGE</text>
    <text x="${patchX}" y="455" font-family="${FONT}" font-size="26" fill="#666" letter-spacing="3">COLOUR</text>
    <text x="${patchX}" y="730" font-family="${FONT}" font-size="26" fill="#666" letter-spacing="3">GREY</text>
    ${legend}
    ${patches}
    ${wedge}
  </svg>`;
}

async function main() {
  const outIndex = process.argv.indexOf("--out");
  const out = outIndex > 0 ? process.argv[outIndex + 1] : undefined;
  const file = out ?? join(tmpdir(), `booth-test-print-${Date.now()}.jpg`);
  await sharp(Buffer.from(calibrationSvg(new Date())))
    .withMetadata({ density: PRINT_DPI })
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toFile(file);
  console.log(`Wrote ${file}`);
  if (out) return;

  const printer = printerFor(process.env);
  if (printer.kind === "fake") throw new Error("BOOTH_PRINTER is fake: set it to cups in .env (see ops/printer.sh)");
  const status = await printer.status();
  console.log(`Printer: ${status.status}, ${status.detail}`);
  console.log("Printing; a postcard takes about a minute");
  await printer.print(file, "Booth test print");
  console.log("Printed. The outermost frame left whole on the card is the safe margin.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
