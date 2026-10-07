import { describe, expect, it } from "vitest";
import {
  applySidecar,
  detectSlots,
  isMarker,
  knockOutMarkers,
  parseSidecar,
  readingOrder,
  type Rgba,
} from "./template";

/** A white canvas with solid magenta rectangles painted on it. */
function canvas(
  width: number,
  height: number,
  rects: { x: number; y: number; w: number; h: number; color?: [number, number, number] }[],
): Rgba {
  const data = new Uint8Array(width * height * 4).fill(255);
  for (const r of rects) {
    const [cr, cg, cb] = r.color ?? [255, 0, 255];
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const p = (y * width + x) * 4;
        data[p] = cr;
        data[p + 1] = cg;
        data[p + 2] = cb;
      }
    }
  }
  return { width, height, data };
}

// Small canvases at a low dpi so the tests stay readable: 10 mm at 30 dpi
// is 12 px, and the safe margin is 5 px.
const DPI = 30;

describe("isMarker", () => {
  it("accepts pure magenta and its anti-aliased neighbours", () => {
    expect(isMarker(255, 0, 255)).toBe(true);
    expect(isMarker(250, 40, 245)).toBe(true);
  });

  it("rejects colours a design might really use", () => {
    expect(isMarker(255, 255, 255)).toBe(false);
    expect(isMarker(219, 112, 147)).toBe(false); // pale violet red
    expect(isMarker(128, 0, 128)).toBe(false); // purple
    expect(isMarker(255, 105, 180)).toBe(false); // hot pink
  });
});

describe("detectSlots", () => {
  it("finds a 2x2 grid in reading order", () => {
    const image = canvas(200, 140, [
      { x: 20, y: 20, w: 70, h: 45 },
      { x: 110, y: 20, w: 70, h: 45 },
      { x: 20, y: 75, w: 70, h: 45 },
      { x: 110, y: 75, w: 70, h: 45 },
    ]);
    const { slots, warnings } = detectSlots(image, { dpi: DPI });
    expect(warnings).toEqual([]);
    expect(slots).toEqual([
      { x: 20, y: 20, width: 70, height: 45, shot: 1 },
      { x: 110, y: 20, width: 70, height: 45, shot: 2 },
      { x: 20, y: 75, width: 70, height: 45, shot: 3 },
      { x: 110, y: 75, width: 70, height: 45, shot: 4 },
    ]);
  });

  it("keeps staggered slots in one row", () => {
    const image = canvas(200, 100, [
      { x: 110, y: 24, w: 60, h: 40 },
      { x: 20, y: 20, w: 60, h: 40 },
    ]);
    const { slots } = detectSlots(image, { dpi: DPI });
    expect(slots.map((s) => s.x)).toEqual([20, 110]);
  });

  it("tolerates anti-aliased edges without splitting a slot", () => {
    const image = canvas(100, 100, [{ x: 20, y: 20, w: 40, h: 40 }]);
    // A soft column down the middle, as Canva leaves on a block edge.
    for (let y = 20; y < 60; y++) {
      const p = (y * 100 + 40) * 4;
      image.data[p] = 240;
      image.data[p + 1] = 30;
      image.data[p + 2] = 235;
    }
    const { slots } = detectSlots(image, { dpi: DPI });
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ x: 20, y: 20, width: 40, height: 40 });
  });

  it("reports a stray mark as a warning rather than a slot", () => {
    const image = canvas(200, 140, [
      { x: 20, y: 20, w: 70, h: 45 },
      { x: 150, y: 100, w: 3, h: 3 },
    ]);
    const { slots, warnings } = detectSlots(image, { dpi: DPI });
    expect(slots).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Ignored a 3 x 3 px magenta mark/);
  });

  it("warns when a slot runs into the borderless crop", () => {
    const image = canvas(200, 140, [{ x: 2, y: 20, w: 70, h: 45 }]);
    const { slots, warnings } = detectSlots(image, { dpi: DPI });
    expect(slots).toHaveLength(1);
    expect(warnings[0]).toMatch(/Slot 1 is within 4 mm of the edge/);
  });

  it("warns when nothing is marked", () => {
    const { slots, warnings } = detectSlots(canvas(50, 50, []), { dpi: DPI });
    expect(slots).toEqual([]);
    expect(warnings[0]).toMatch(/No photo slots found/);
  });

  it("does not merge slots that only touch diagonally", () => {
    const image = canvas(100, 100, [
      { x: 10, y: 10, w: 30, h: 30 },
      { x: 40, y: 40, w: 30, h: 30 },
    ]);
    expect(detectSlots(image, { dpi: DPI }).slots).toHaveLength(2);
  });
});

describe("readingOrder", () => {
  it("sorts rows top to bottom and slots left to right within a row", () => {
    const boxes = [
      { x: 50, y: 50, width: 10, height: 10, id: "d" },
      { x: 0, y: 52, width: 10, height: 10, id: "c" },
      { x: 50, y: 0, width: 10, height: 10, id: "b" },
      { x: 0, y: 0, width: 10, height: 10, id: "a" },
    ];
    expect(readingOrder(boxes).map((b) => b.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("knockOutMarkers", () => {
  it("makes the slot transparent, one pixel beyond its edge, and nothing else", () => {
    const image = canvas(40, 40, [{ x: 10, y: 10, w: 10, h: 10 }]);
    const { slots } = detectSlots(image, { minSlotPx: 1 });
    const out = knockOutMarkers(image, slots);
    const alpha = (x: number, y: number) => out.data[(y * 40 + x) * 4 + 3];
    expect(alpha(15, 15)).toBe(0);
    expect(alpha(10, 10)).toBe(0);
    expect(alpha(9, 10)).toBe(0); // the one-pixel halo
    expect(alpha(20, 15)).toBe(0);
    expect(alpha(8, 10)).toBe(255);
    expect(alpha(0, 0)).toBe(255);
    expect(alpha(9, 9)).toBe(255); // the halo is 4-connected, no corner bleed
  });

  it("leaves the input untouched", () => {
    const image = canvas(20, 20, [{ x: 5, y: 5, w: 5, h: 5 }]);
    const before = Uint8Array.from(image.data);
    knockOutMarkers(image, detectSlots(image, { minSlotPx: 1 }).slots);
    expect(image.data).toEqual(before);
  });
});

describe("applySidecar", () => {
  const slots = Array.from({ length: 6 }, (_, i) => ({ x: i, y: 0, width: 1, height: 1, shot: i + 1 }));

  it("numbers slots by position when there is no sidecar", () => {
    expect(applySidecar(slots, null)).toEqual({ slots, shotCount: 6 });
  });

  it("maps two strips to the same three shots", () => {
    const { slots: mapped, shotCount } = applySidecar(slots, { shots: [1, 2, 3, 1, 2, 3] });
    expect(shotCount).toBe(3);
    expect(mapped.map((s) => s.shot)).toEqual([1, 2, 3, 1, 2, 3]);
  });

  it("rejects a mapping that does not match the slots found", () => {
    expect(() => applySidecar(slots, { shots: [1, 2] })).toThrow(/maps 2 slots but the PNG has 6/);
  });

  it("rejects a mapping with a hole in it", () => {
    expect(() => applySidecar(slots, { shots: [1, 3, 3, 1, 3, 3] })).toThrow(/skips shot 2/);
  });
});

describe("parseSidecar", () => {
  it("reads shots and texts", () => {
    const s = parseSidecar(
      '{"shots":[1,2,3,1,2,3],"texts":[{"text":"{date}","x":10,"y":20,"size":30,"align":"center"}]}',
    );
    expect(s.shots).toEqual([1, 2, 3, 1, 2, 3]);
    expect(s.texts).toEqual([{ text: "{date}", x: 10, y: 20, size: 30, align: "center" }]);
  });

  it("rejects malformed files with a reason", () => {
    expect(() => parseSidecar("[]")).toThrow(/JSON object/);
    expect(() => parseSidecar('{"shots":"1,2"}')).toThrow(/array of shot numbers/);
    expect(() => parseSidecar('{"texts":[{"text":"x"}]}')).toThrow(/missing "x"/);
  });
});
