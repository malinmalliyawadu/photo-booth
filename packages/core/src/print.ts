/**
 * The one thing the printer accepts: a landscape postcard at 300 dpi.
 * Every layout, portrait ones included, becomes this image before it is
 * sent to CUPS. Canva exports at the same size, so a template and a
 * print are the same pixel grid.
 */
export const PRINT_DPI = 300;

/** Selphy postcard paper, landscape, in millimetres. */
export const POSTCARD_MM = { width: 148, height: 100 } as const;

export function mmToPx(mm: number, dpi: number = PRINT_DPI): number {
  return Math.round((mm / 25.4) * dpi);
}

/** 1748 x 1181 at 300 dpi. */
export const PRINT_PX = {
  width: mmToPx(POSTCARD_MM.width),
  height: mmToPx(POSTCARD_MM.height),
} as const;

/**
 * Borderless printing crops the edges, so anything that matters stays
 * this far in. Reported on the admin page when a slot breaks it.
 */
export const SAFE_MARGIN_MM = 4;

/** Below this a "slot" is more likely a stray magenta pixel than a photo. */
export const MIN_SLOT_MM = 10;
