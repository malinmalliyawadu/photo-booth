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

/**
 * What one KP-108IN / RP-108 pack is made of, as the SELPHY CP1300
 * uses it: an ink cassette lasts 36 prints, and the paper tray holds 18
 * postcards, so the tray is refilled twice per cassette. The booth
 * counts both down, because the printer only says it is out once a
 * guest's print has failed.
 */
export const PAPER_TRAY_SHEETS = 18;
export const INK_CASSETTE_PRINTS = 36;

/** At or below these the admin page says "Low". */
export const PAPER_LOW = 3;
export const INK_LOW = 5;

/** Why the next print cannot go, or null when it can. */
export function printBlocker(supplies: { paperLeft: number; inkLeft: number }): string | null {
  if (supplies.inkLeft <= 0) return "The ink cassette is used up";
  if (supplies.paperLeft <= 0) return "The paper tray is empty";
  return null;
}
