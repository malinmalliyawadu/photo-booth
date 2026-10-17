/**
 * Face props on a frame, with sharp: each face's prop rasterised from
 * the same SVG the kiosk shows, at the size and turn `placeProp` gives,
 * and laid over the camera's frame before the frame is cut into its
 * slots, so a prop near a slot's edge is cut off where the browser cuts
 * it off too.
 */
import sharp, { type OverlayOptions } from "sharp";
import { placeProp, propById, type Face, type PropId, type Size } from "@booth/core";

/** `frame` is raw sRGB, three channels; the result is the same frame with the props on it. */
export async function drawProps(frame: Buffer, size: Size, faces: readonly Face[], id: PropId): Promise<Buffer> {
  const { art } = propById(id);
  if (!art || faces.length === 0) return frame;
  const overlays: OverlayOptions[] = [];
  for (const face of faces) {
    const placed = placeProp(face, id, size);
    if (!placed) continue;
    const width = Math.max(1, Math.round(placed.width));
    const height = Math.max(1, Math.round(placed.height));
    // Rasterised at the size it is drawn, not scaled from a small one:
    // librsvg's density is pixels per 72 of the viewBox's units.
    const flat = sharp(Buffer.from(art.svg), { density: (72 * width) / art.width })
      .resize(width, height, { fit: "fill" })
      .ensureAlpha()
      .raw();
    // Turned in a pipeline of its own: sharp's operation order would
    // otherwise turn it before the resize.
    const { data, info } =
      placed.angle === 0
        ? await flat.toBuffer({ resolveWithObject: true })
        : await sharp(await flat.toBuffer(), { raw: { width, height, channels: 4 } })
            .rotate(placed.angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .raw()
            .toBuffer({ resolveWithObject: true });
    // sharp's rotate grows the canvas around the middle, which is where
    // the placement says the middle goes.
    const left = Math.round(placed.x - info.width / 2);
    const top = Math.round(placed.y - info.height / 2);
    // Only the part inside the frame: sharp refuses an overlay that hangs off it.
    const x0 = Math.max(0, left);
    const y0 = Math.max(0, top);
    const x1 = Math.min(size.width, left + info.width);
    const y1 = Math.min(size.height, top + info.height);
    if (x1 <= x0 || y1 <= y0) continue;
    const visible =
      x0 === left && y0 === top && x1 === left + info.width && y1 === top + info.height
        ? data
        : await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
            .extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 })
            .raw()
            .toBuffer();
    overlays.push({ input: visible, raw: { width: x1 - x0, height: y1 - y0, channels: 4 }, left: x0, top: y0 });
  }
  if (overlays.length === 0) return frame;
  return sharp(frame, { raw: { ...size, channels: 3 } }).composite(overlays).removeAlpha().raw().toBuffer();
}
