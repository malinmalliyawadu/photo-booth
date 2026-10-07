/**
 * Layouts are Canva designs exported as PNGs with every photo slot
 * painted solid #FF00FF. This module finds the slots, so a layout can be
 * added or changed without touching code, and knocks the magenta out so
 * the photos can sit underneath.
 *
 * Everything here works on raw RGBA pixels. Decoding and encoding the PNG
 * is sharp's job in the app and the worker; this module stays pure so it
 * can be tested against the real exports.
 */
import { MIN_SLOT_MM, PRINT_DPI, SAFE_MARGIN_MM, mmToPx } from "./print";

export interface Rgba {
  width: number;
  height: number;
  /** width * height * 4 bytes, row-major, RGBA. */
  data: Uint8Array;
}

export interface Slot {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Which shot fills this slot, 1-based. Two slots may share a shot. */
  shot: number;
}

export type Orientation = "landscape" | "portrait";

export interface TextField {
  /** What to print: a literal, or a token the compositor fills in. */
  text: string;
  x: number;
  y: number;
  /** Pixels at the template's resolution. */
  size: number;
  font?: string;
  color?: string;
  align?: "left" | "center" | "right";
}

/** The optional JSON sidecar next to a template PNG. */
export interface Sidecar {
  /** Slot index (reading order, 0-based) to shot number (1-based). */
  shots?: number[];
  texts?: TextField[];
}

export interface DetectedSlots {
  slots: Slot[];
  /** Human sentences for the admin page; a layout with warnings still saves. */
  warnings: string[];
}

export interface TemplateSpec {
  width: number;
  height: number;
  orientation: Orientation;
  slots: Slot[];
  shotCount: number;
  texts: TextField[];
}

/**
 * Euclidean distance in RGB below which a pixel counts as the marker.
 * Canva anti-aliases block edges, so an exact match would leave a
 * one-pixel pink frame around every slot and sometimes split a slot in
 * two. A distance of 80 still rejects every real pink and purple.
 */
export const MAGENTA_TOLERANCE = 80;

export function isMarker(r: number, g: number, b: number, tolerance = MAGENTA_TOLERANCE): boolean {
  const dr = 255 - r;
  const db = 255 - b;
  return dr * dr + g * g + db * db <= tolerance * tolerance;
}

export function orientationOf(width: number, height: number): Orientation {
  return height > width ? "portrait" : "landscape";
}

/**
 * Finds every connected run of marker pixels and returns their bounding
 * boxes in reading order, numbered 1..n by default. Regions narrower or
 * shorter than `minSlotPx` are reported as warnings, not slots.
 */
export function detectSlots(
  image: Rgba,
  options: { minSlotPx?: number; dpi?: number } = {},
): DetectedSlots {
  const { width, height, data } = image;
  const dpi = options.dpi ?? PRINT_DPI;
  const minSlotPx = options.minSlotPx ?? mmToPx(MIN_SLOT_MM, dpi);
  const safePx = mmToPx(SAFE_MARGIN_MM, dpi);

  const marker = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < marker.length; i++, p += 4) {
    if (isMarker(data[p]!, data[p + 1]!, data[p + 2]!)) marker[i] = 1;
  }

  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];

  for (let start = 0; start < marker.length; start++) {
    if (!marker[start] || seen[start]) continue;
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    while (top > 0) {
      const i = stack[--top]!;
      const x = i % width;
      const y = (i - x) / width;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const neighbours = [i - 1, i + 1, i - width, i + width];
      if (x === 0) neighbours[0] = -1;
      if (x === width - 1) neighbours[1] = -1;
      for (const n of neighbours) {
        if (n >= 0 && n < marker.length && marker[n] && !seen[n]) {
          seen[n] = 1;
          stack[top++] = n;
        }
      }
    }
    boxes.push({ x0, y0, x1, y1 });
  }

  const warnings: string[] = [];
  const kept = boxes.filter((b) => {
    const w = b.x1 - b.x0 + 1;
    const h = b.y1 - b.y0 + 1;
    if (w < minSlotPx || h < minSlotPx) {
      warnings.push(
        `Ignored a ${w} x ${h} px magenta mark at (${b.x0}, ${b.y0}): smaller than ${MIN_SLOT_MM} mm`,
      );
      return false;
    }
    return true;
  });

  const ordered = readingOrder(kept.map((b) => ({ x: b.x0, y: b.y0, width: b.x1 - b.x0 + 1, height: b.y1 - b.y0 + 1 })));
  const slots: Slot[] = ordered.map((b, i) => ({ ...b, shot: i + 1 }));

  if (slots.length === 0) warnings.push("No photo slots found: mark each one with a solid #FF00FF block");
  for (const s of slots) {
    const tooClose =
      s.x < safePx || s.y < safePx || s.x + s.width > width - safePx || s.y + s.height > height - safePx;
    if (tooClose) {
      warnings.push(
        `Slot ${s.shot} is within ${SAFE_MARGIN_MM} mm of the edge; borderless printing will crop it`,
      );
    }
  }
  return { slots, warnings };
}

/**
 * Rows first, then left to right. Two boxes share a row when their
 * vertical extents overlap by more than half the shorter one, which
 * copes with slots that are deliberately a little staggered.
 */
export function readingOrder<T extends { x: number; y: number; width: number; height: number }>(
  boxes: T[],
): T[] {
  const byTop = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: T[][] = [];
  for (const box of byTop) {
    const row = rows.find((r) => r.some((other) => overlapsVertically(box, other)));
    if (row) row.push(box);
    else rows.push([box]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x));
}

function overlapsVertically(
  a: { y: number; height: number },
  b: { y: number; height: number },
): boolean {
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlap > Math.min(a.height, b.height) / 2;
}

/**
 * Makes the marker transparent so the template can be layered over the
 * photos. The mask is grown by one pixel so anti-aliased edge pixels the
 * tolerance missed go too; a pixel of design at 300 dpi is invisible and
 * a pink fringe around every photo is not. Returns a new buffer.
 */
export function knockOutMarkers(image: Rgba, slots: Slot[]): Rgba {
  const { width, height } = image;
  const data = new Uint8Array(image.data);
  const mask = new Uint8Array(width * height);
  for (const s of slots) {
    const x0 = Math.max(0, s.x - 1);
    const y0 = Math.max(0, s.y - 1);
    const x1 = Math.min(width - 1, s.x + s.width);
    const y1 = Math.min(height - 1, s.y + s.height);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * width + x;
        const p = i * 4;
        if (isMarker(data[p]!, data[p + 1]!, data[p + 2]!)) mask[i] = 1;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const hit =
        mask[i] ||
        (x > 0 && mask[i - 1]) ||
        (x < width - 1 && mask[i + 1]) ||
        (y > 0 && mask[i - width]) ||
        (y < height - 1 && mask[i + width]);
      if (hit) data[i * 4 + 3] = 0;
    }
  }
  return { width, height, data };
}

/** Applies the sidecar's shot mapping, validating it against the slots found. */
export function applySidecar(detected: Slot[], sidecar: Sidecar | null): { slots: Slot[]; shotCount: number } {
  if (!sidecar?.shots) {
    return { slots: detected, shotCount: detected.length };
  }
  const { shots } = sidecar;
  if (shots.length !== detected.length) {
    throw new Error(`The sidecar maps ${shots.length} slots but the PNG has ${detected.length}`);
  }
  const shotCount = Math.max(...shots);
  for (let n = 1; n <= shotCount; n++) {
    if (!shots.includes(n)) throw new Error(`The sidecar skips shot ${n}`);
  }
  for (const n of shots) {
    if (!Number.isInteger(n) || n < 1) throw new Error(`Shot numbers start at 1, got ${n}`);
  }
  return {
    slots: detected.map((slot, i) => ({ ...slot, shot: shots[i]! })),
    shotCount,
  };
}

export function parseSidecar(json: string): Sidecar {
  const raw: unknown = JSON.parse(json);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("The sidecar must be a JSON object");
  }
  const obj = raw as Record<string, unknown>;
  const sidecar: Sidecar = {};
  if (obj.shots !== undefined) {
    if (!Array.isArray(obj.shots) || !obj.shots.every((n) => typeof n === "number")) {
      throw new Error('"shots" must be an array of shot numbers, one per slot in reading order');
    }
    sidecar.shots = obj.shots as number[];
  }
  if (obj.texts !== undefined) {
    if (!Array.isArray(obj.texts)) throw new Error('"texts" must be an array');
    sidecar.texts = obj.texts.map((t, i) => {
      if (typeof t !== "object" || t === null) throw new Error(`texts[${i}] must be an object`);
      const f = t as Record<string, unknown>;
      for (const key of ["text", "x", "y", "size"]) {
        if (f[key] === undefined) throw new Error(`texts[${i}] is missing "${key}"`);
      }
      if (typeof f.text !== "string") throw new Error(`texts[${i}].text must be a string`);
      for (const key of ["x", "y", "size"]) {
        if (typeof f[key] !== "number") throw new Error(`texts[${i}].${key} must be a number`);
      }
      const field: TextField = { text: f.text, x: f.x as number, y: f.y as number, size: f.size as number };
      if (typeof f.font === "string") field.font = f.font;
      if (typeof f.color === "string") field.color = f.color;
      if (f.align === "left" || f.align === "center" || f.align === "right") field.align = f.align;
      return field;
    });
  }
  return sidecar;
}
