/**
 * What the guest sees while posing should be what lands in the layout.
 * A slot crops its photo like CSS `object-fit: cover`, centred (the
 * browser's `Composite` does, and so will the compositor), so the part
 * of the camera frame that survives depends on the slot's shape. The
 * kiosk shows only that part, and the guests frame themselves for it.
 */
import type { Slot } from "./template";

/** A rectangle as fractions of the camera frame, 0 to 1. */
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const FULL_FRAME: Crop = { x: 0, y: 0, width: 1, height: 1 };

/** The centred cover crop of a frame for one slot shape. */
export function coverCrop(frame: { width: number; height: number }, slot: { width: number; height: number }): Crop {
  if (frame.width <= 0 || frame.height <= 0 || slot.width <= 0 || slot.height <= 0) return FULL_FRAME;
  const frameAspect = frame.width / frame.height;
  const slotAspect = slot.width / slot.height;
  const width = slotAspect >= frameAspect ? 1 : slotAspect / frameAspect;
  const height = slotAspect >= frameAspect ? frameAspect / slotAspect : 1;
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
}

/**
 * The part of the frame visible in every slot the shot fills. Two slots
 * of different shapes can share a shot; showing their overlap means
 * nobody framed at the edge of one is cut off in the other. A shot with
 * no slot shows the whole frame.
 */
export function viewfinderCrop(frame: { width: number; height: number }, slots: readonly Slot[], shot: number): Crop {
  const crops = slots.filter((s) => s.shot === shot).map((s) => coverCrop(frame, s));
  if (crops.length === 0) return FULL_FRAME;
  const width = Math.min(...crops.map((c) => c.width));
  const height = Math.min(...crops.map((c) => c.height));
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
}
