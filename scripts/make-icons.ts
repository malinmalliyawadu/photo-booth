/**
 * Rasterises the booth's icon (apps/booth/src/app/icon.svg) into the
 * PNG sizes a home-screen install needs: the Apple touch icon Next
 * links from the app directory, and the manifest's 192 and 512. Run it
 * after changing the SVG and commit the PNGs.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP = path.join(ROOT, "apps/booth/src/app");
const PUBLIC_ICONS = path.join(ROOT, "apps/booth/public/icons");
const SOURCE = path.join(APP, "icon.svg");

async function png(size: number, file: string) {
  await sharp(SOURCE, { density: (72 * size) / 512 })
    .resize(size, size)
    .flatten({ background: "#0d0a0f" })
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log("wrote", path.relative(ROOT, file));
}

await mkdir(PUBLIC_ICONS, { recursive: true });
await png(180, path.join(APP, "apple-icon.png"));
await png(192, path.join(PUBLIC_ICONS, "icon-192.png"));
await png(512, path.join(PUBLIC_ICONS, "icon-512.png"));
