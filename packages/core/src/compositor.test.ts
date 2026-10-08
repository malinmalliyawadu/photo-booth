import { describe, expect, it } from "vitest";
import { SLOT_BLEED_PX, THUMB_LONG_EDGE, WEB_LONG_EDGE, fitLongEdge, placePhotos, planOutputs } from "./compositor";
import { PRINT_PX } from "./print";
import type { Slot } from "./template";

const slot = (x: number, y: number, width: number, height: number, shot: number): Slot => ({ x, y, width, height, shot });

describe("placePhotos", () => {
  const layout = { width: 1748, height: 1181, slots: [slot(100, 100, 600, 400, 1), slot(800, 100, 400, 600, 2)] };

  it("draws each photo over its slot and the halo the knock-out left around it", () => {
    const frames = new Map([[1, { width: 3000, height: 2000 }], [2, { width: 3000, height: 2000 }]]);
    const [a, b] = placePhotos(layout, frames);
    expect(a!.dest).toEqual({ left: 100 - SLOT_BLEED_PX, top: 100 - SLOT_BLEED_PX, width: 602, height: 402 });
    expect(b!.dest).toEqual({ left: 799, top: 99, width: 402, height: 602 });
  });

  it("crops like object-fit: cover, centred", () => {
    const frames = new Map([[1, { width: 3000, height: 2000 }], [2, { width: 3000, height: 2000 }]]);
    const [wide, tall] = placePhotos(layout, frames);
    // A 602 x 402 slot is a hair narrower than the 3:2 frame: the full
    // height, a few columns off each side.
    expect(wide!.crop.height).toBe(2000);
    expect(wide!.crop.width).toBe(Math.round(3000 * ((602 / 402) / 1.5)));
    expect(Math.abs(wide!.crop.left + wide!.crop.width / 2 - 1500)).toBeLessThanOrEqual(1);
    // A tall slot keeps a centred column of the full height.
    expect(tall!.crop.height).toBe(2000);
    expect(tall!.crop.width).toBe(Math.round(3000 * ((402 / 602) / 1.5)));
    expect(tall!.crop.left + tall!.crop.width / 2).toBeCloseTo(1500, 0);
  });

  it("keeps the crop inside the frame and the halo inside the layout", () => {
    const edge = { width: 100, height: 80, slots: [slot(0, 0, 100, 80, 1)] };
    const [p] = placePhotos(edge, new Map([[1, { width: 7, height: 3 }]]));
    expect(p!.dest).toEqual({ left: 0, top: 0, width: 100, height: 80 });
    expect(p!.crop.left).toBeGreaterThanOrEqual(0);
    expect(p!.crop.left + p!.crop.width).toBeLessThanOrEqual(7);
    expect(p!.crop.top + p!.crop.height).toBeLessThanOrEqual(3);
    expect(p!.crop.width).toBeGreaterThanOrEqual(1);
  });

  it("fills two slots from one shot, each cropped for its own shape", () => {
    const strip = { width: 1181, height: 1748, slots: [slot(50, 50, 500, 300, 1), slot(600, 50, 300, 500, 1)] };
    const placements = placePhotos(strip, new Map([[1, { width: 4000, height: 3000 }]]));
    expect(placements.map((p) => p.shot)).toEqual([1, 1]);
    expect(placements[0]!.crop).not.toEqual(placements[1]!.crop);
  });

  it("refuses a layout with a photo missing", () => {
    expect(() => placePhotos(layout, new Map([[1, { width: 10, height: 10 }]]))).toThrow(/Photo 2 is missing/);
    expect(() => placePhotos(layout, new Map([[1, { width: 10, height: 10 }], [2, { width: 0, height: 10 }]]))).toThrow(/Photo 2 is empty/);
  });
});

describe("planOutputs", () => {
  it("prints a landscape layout as it is", () => {
    const plan = planOutputs({ width: PRINT_PX.width, height: PRINT_PX.height });
    expect(plan.print).toEqual({ ...PRINT_PX, rotate: 0 });
    expect(plan.web).toEqual({ width: WEB_LONG_EDGE, height: Math.round(PRINT_PX.height * (WEB_LONG_EDGE / PRINT_PX.width)) });
    expect(Math.max(plan.thumb.width, plan.thumb.height)).toBe(THUMB_LONG_EDGE);
  });

  it("turns a portrait layout onto the landscape card, and keeps it upright for screens", () => {
    const plan = planOutputs({ width: PRINT_PX.height, height: PRINT_PX.width });
    expect(plan.print).toEqual({ ...PRINT_PX, rotate: 90 });
    expect(plan.web.height).toBe(WEB_LONG_EDGE);
    expect(plan.web.width).toBeLessThan(plan.web.height);
  });

  it("never scales a small layout up for the web", () => {
    expect(fitLongEdge({ width: 800, height: 600 }, WEB_LONG_EDGE)).toEqual({ width: 800, height: 600 });
  });
});
