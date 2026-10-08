import { describe, expect, it } from "vitest";
import { coverCrop, FULL_FRAME, viewfinderCrop } from "./viewfinder";
import type { Slot } from "./template";

const frame43 = { width: 1920, height: 1440 };

function slot(width: number, height: number, shot: number): Slot {
  return { x: 0, y: 0, width, height, shot };
}

describe("coverCrop", () => {
  it("keeps the whole frame when the shapes match", () => {
    expect(coverCrop(frame43, { width: 400, height: 300 })).toEqual(FULL_FRAME);
  });

  it("trims top and bottom for a wider slot", () => {
    const c = coverCrop(frame43, { width: 1600, height: 900 });
    expect(c.width).toBe(1);
    expect(c.height).toBeCloseTo(0.75);
    expect(c.y).toBeCloseTo(0.125);
    expect(c.x).toBe(0);
  });

  it("trims the sides for a taller slot", () => {
    const c = coverCrop(frame43, { width: 600, height: 800 });
    expect(c.height).toBe(1);
    expect(c.width).toBeCloseTo(0.5625);
    expect(c.x).toBeCloseTo(0.21875);
  });

  it("falls back to the whole frame before the camera reports a size", () => {
    expect(coverCrop({ width: 0, height: 0 }, { width: 600, height: 800 })).toEqual(FULL_FRAME);
  });
});

describe("viewfinderCrop", () => {
  it("shows the crop of the slot the shot fills", () => {
    const slots = [slot(1600, 900, 1), slot(600, 800, 2)];
    expect(viewfinderCrop(frame43, slots, 1).height).toBeCloseTo(0.75);
    expect(viewfinderCrop(frame43, slots, 2).width).toBeCloseTo(0.5625);
  });

  it("shows the overlap when one shot fills slots of different shapes", () => {
    const c = viewfinderCrop(frame43, [slot(1600, 900, 1), slot(600, 800, 1)], 1);
    expect(c.width).toBeCloseTo(0.5625);
    expect(c.height).toBeCloseTo(0.75);
    expect(c.x).toBeCloseTo(0.21875);
    expect(c.y).toBeCloseTo(0.125);
  });

  it("shows the whole frame for a shot with no slot", () => {
    expect(viewfinderCrop(frame43, [slot(1600, 900, 1)], 2)).toEqual(FULL_FRAME);
  });
});
