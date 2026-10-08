/**
 * The compositor's geometry: where each photo is cut from its frame and
 * where it lands on the layout, and what size each output file is. The
 * worker does the pixels with sharp; every number it uses comes from
 * here, so the arithmetic is tested and the browser's `Composite` and
 * the print agree.
 *
 * A slot crops its photo like CSS `object-fit: cover`, centred, which is
 * what `Composite` draws and what the viewfinder showed the guest
 * (`coverCrop`). Mirroring flips the cropped photo; a centred crop of a
 * flipped frame is the flipped centred crop, so the order is free.
 */
import { PRINT_PX } from "./print";
import type { Slot } from "./template";
import { coverCrop } from "./viewfinder";

/** Whole pixels. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Placement {
  shot: number;
  /** The part of the shot's frame that is kept, in the frame's pixels. */
  crop: Rect;
  /** Where it goes on the layout, in the layout's pixels. */
  dest: Rect;
}

/**
 * `knockOutMarkers` clears one pixel of halo around every slot, so the
 * photo is drawn that much bigger or the halo would show the paper.
 */
export const SLOT_BLEED_PX = 1;

/** The long edge of the JPEG the gallery gets: sharp on a phone at 3x, a fraction of the print's weight. */
export const WEB_LONG_EDGE = 1600;
/** The long edge of the thumbnail the admin page, the attract loop and the gallery grid show. */
export const THUMB_LONG_EDGE = 480;

/**
 * One placement per slot, in slot order. `frames` holds each shot's
 * size after EXIF rotation; a slot whose shot has no frame is an error,
 * since a print with a hole in it is worse than no print.
 */
export function placePhotos(
  layout: { width: number; height: number; slots: readonly Slot[] },
  frames: ReadonlyMap<number, Size>,
): Placement[] {
  return layout.slots.map((slot) => {
    const frame = frames.get(slot.shot);
    if (!frame) throw new Error(`Photo ${slot.shot} is missing`);
    if (frame.width < 1 || frame.height < 1) throw new Error(`Photo ${slot.shot} is empty`);
    const left = Math.max(0, slot.x - SLOT_BLEED_PX);
    const top = Math.max(0, slot.y - SLOT_BLEED_PX);
    const right = Math.min(layout.width, slot.x + slot.width + SLOT_BLEED_PX);
    const bottom = Math.min(layout.height, slot.y + slot.height + SLOT_BLEED_PX);
    const dest = { left, top, width: right - left, height: bottom - top };
    const crop = coverCrop(frame, dest);
    return { shot: slot.shot, crop: toPixels(crop, frame), dest };
  });
}

/** A fractional crop as whole pixels inside the frame, never empty. */
function toPixels(crop: { x: number; y: number; width: number; height: number }, frame: Size): Rect {
  const width = Math.min(frame.width, Math.max(1, Math.round(crop.width * frame.width)));
  const height = Math.min(frame.height, Math.max(1, Math.round(crop.height * frame.height)));
  const left = Math.min(frame.width - width, Math.max(0, Math.round(crop.x * frame.width)));
  const top = Math.min(frame.height - height, Math.max(0, Math.round(crop.y * frame.height)));
  return { left, top, width, height };
}

export interface OutputPlan {
  /**
   * The postcard: always landscape at `PRINT_PX`, because that is the
   * one thing the printer takes. A portrait layout is turned a quarter
   * clockwise first (`rotate`), and a layout exported at another size is
   * scaled to cover the card, centred.
   */
  print: Size & { rotate: 0 | 90 };
  /** For the gallery and the screens, the layout's way up. */
  web: Size;
  thumb: Size;
}

export function planOutputs(layout: Size): OutputPlan {
  const portrait = layout.height > layout.width;
  return {
    print: { width: PRINT_PX.width, height: PRINT_PX.height, rotate: portrait ? 90 : 0 },
    web: fitLongEdge(layout, WEB_LONG_EDGE),
    thumb: fitLongEdge(layout, THUMB_LONG_EDGE),
  };
}

/** Scaled down so the long edge is at most `longEdge`, never up. */
export function fitLongEdge(size: Size, longEdge: number): Size {
  const scale = Math.min(1, longEdge / Math.max(size.width, size.height));
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}
