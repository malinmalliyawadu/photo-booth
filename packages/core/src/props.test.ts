import { describe, expect, it } from "vitest";
import type { Face } from "./faces";
import {
  DEFAULT_PROP,
  PROPS,
  PROP_IDS,
  faceCrop,
  isPropId,
  needsPropChoice,
  offeredProps,
  placeProp,
  placementBounds,
  propById,
  propChoices,
  propImageUrl,
} from "./props";

/** A level face, 200 px wide on a 1000 × 1000 frame, its eyes at (500, 300). */
const FACE: Face = {
  box: { x: 0.4, y: 0.25, width: 0.2, height: 0.2 },
  eyes: [
    { x: 0.46, y: 0.3 },
    { x: 0.54, y: 0.3 },
  ],
  nose: { x: 0.5, y: 0.36 },
  mouth: { x: 0.5, y: 0.4 },
  score: 0.9,
};
const FRAME = { width: 1000, height: 1000 };

/** The same face turned `deg` clockwise about the middle of its eyes. */
function turned(face: Face, deg: number): Face {
  const a = (deg * Math.PI) / 180;
  const cx = 0.5;
  const cy = 0.3;
  const turn = (p: { x: number; y: number }) => ({
    x: cx + (p.x - cx) * Math.cos(a) - (p.y - cy) * Math.sin(a),
    y: cy + (p.x - cx) * Math.sin(a) + (p.y - cy) * Math.cos(a),
  });
  return { ...face, eyes: [turn(face.eyes[0]), turn(face.eyes[1])], nose: turn(face.nose), mouth: turn(face.mouth) };
}

describe("the catalogue", () => {
  it("has unique ids and names, and no props first", () => {
    expect(new Set(PROP_IDS).size).toBe(PROPS.length);
    expect(new Set(PROPS.map((p) => p.name)).size).toBe(PROPS.length);
    expect(PROP_IDS[0]).toBe(DEFAULT_PROP);
    expect(propById(DEFAULT_PROP).art).toBeNull();
  });

  it("has artwork for every prop, as an SVG whose viewBox matches its size", () => {
    for (const { id, art } of PROPS.filter((p) => p.id !== DEFAULT_PROP)) {
      expect(art, id).not.toBeNull();
      expect(art!.svg).toContain(`viewBox="0 0 ${art!.width} ${art!.height}"`);
      // librsvg and Safari draw these alike; text and filters they do not.
      expect(art!.svg).not.toMatch(/<text|<filter|<image|font-family/);
    }
  });

  it("recognises its ids and nothing else", () => {
    expect(isPropId("crown")).toBe(true);
    expect(isPropId("fez")).toBe(false);
    expect(isPropId(null)).toBe(false);
    expect(() => propById("fez" as never)).toThrow(/Unknown prop/);
  });
});

describe("what the booth offers", () => {
  it("keeps known props, in catalogue order, never no props", () => {
    expect(offeredProps(["moustache", "crown", "crown", "fez", "none", 3])).toEqual(["crown", "moustache"]);
    expect(offeredProps([])).toEqual([]);
  });

  it("asks only when there is a prop to wear, and always offers none first", () => {
    expect(needsPropChoice([])).toBe(false);
    expect(needsPropChoice(["crown"])).toBe(true);
    expect(propChoices(["crown", "specs"])).toEqual(["none", "crown", "specs"]);
  });
});

describe("placeProp", () => {
  it("places nothing for no props", () => {
    expect(placeProp(FACE, "none", FRAME)).toBeNull();
  });

  it("puts glasses on the eyes, sized in face widths", () => {
    const fit = propById("specs").fit;
    const art = propById("specs").art!;
    const p = placeProp(FACE, "specs", FRAME)!;
    expect(p.width).toBeCloseTo(fit.width * 200);
    expect(p.height).toBeCloseTo((p.width * art.height) / art.width);
    expect(p.angle).toBeCloseTo(0);
    // The pin sits on the eyes: the middle is (0.5 - pin) of the artwork away from it.
    expect(p.x).toBeCloseTo(500 + (0.5 - fit.pin.x) * p.width);
    expect(p.y).toBeCloseTo(300 + fit.offset.y * 200 + (0.5 - fit.pin.y) * p.height);
  });

  it("puts a crown above the eyes and a moustache by the mouth", () => {
    const crown = placeProp(FACE, "crown", FRAME)!;
    expect(crown.y + crown.height / 2).toBeLessThan(300);
    const moustache = placeProp(FACE, "moustache", FRAME)!;
    expect(moustache.y).toBeGreaterThan(360);
    expect(moustache.y).toBeLessThan(400);
  });

  it("scales with the face and the frame", () => {
    const small = placeProp(FACE, "crown", FRAME)!;
    const big = placeProp(FACE, "crown", { width: 2000, height: 2000 })!;
    expect(big.width).toBeCloseTo(small.width * 2);
    expect(big.x).toBeCloseTo(small.x * 2);
    expect(big.y).toBeCloseTo(small.y * 2);
  });

  it("turns with the head, about the face rather than about the artwork", () => {
    for (const id of PROP_IDS.filter((p) => p !== "none")) {
      const level = placeProp(FACE, id, FRAME)!;
      const tilted = placeProp(turned(FACE, 30), id, FRAME)!;
      expect(tilted.angle, id).toBeCloseTo(30);
      expect(tilted.width, id).toBeCloseTo(level.width);
      // The middle of the artwork turns about the middle of the eyes.
      const a = (30 * Math.PI) / 180;
      const dx = level.x - 500;
      const dy = level.y - 300;
      expect(tilted.x, id).toBeCloseTo(500 + dx * Math.cos(a) - dy * Math.sin(a));
      expect(tilted.y, id).toBeCloseTo(300 + dx * Math.sin(a) + dy * Math.cos(a));
    }
  });
});

describe("placementBounds", () => {
  it("is the placement itself when level", () => {
    expect(placementBounds({ x: 100, y: 50, width: 40, height: 20, angle: 0 })).toEqual({ left: 80, top: 40, right: 120, bottom: 60 });
  });

  it("swaps width and height at a quarter turn", () => {
    const b = placementBounds({ x: 100, y: 50, width: 40, height: 20, angle: 90 });
    expect(b.right - b.left).toBeCloseTo(20);
    expect(b.bottom - b.top).toBeCloseTo(40);
  });
});

describe("propImageUrl", () => {
  it("is the artwork as a data URL", () => {
    expect(propImageUrl("none")).toBeNull();
    const url = propImageUrl("crown")!;
    expect(url.startsWith("data:image/svg+xml,")).toBe(true);
    expect(decodeURIComponent(url.slice("data:image/svg+xml,".length))).toBe(propById("crown").art!.svg);
  });
});

describe("faceCrop", () => {
  it("frames the face at the chip's shape", () => {
    const crop = faceCrop(FACE, FRAME, 4 / 3);
    expect((crop.width * FRAME.width) / (crop.height * FRAME.height)).toBeCloseTo(4 / 3);
    expect(crop.width * FRAME.width).toBeCloseTo(200 * 2.6);
    // Centred on the eyes across, a little above them down.
    expect((crop.x + crop.width / 2) * FRAME.width).toBeCloseTo(500);
    expect((crop.y + crop.height / 2) * FRAME.height).toBeLessThan(300);
  });

  it("stays inside the frame for a face at its edge or one too big for it", () => {
    const edge: Face = { ...FACE, eyes: [{ x: 0.01, y: 0.02 }, { x: 0.09, y: 0.02 }] };
    const crop = faceCrop(edge, FRAME, 1);
    expect(crop.x).toBe(0);
    expect(crop.y).toBe(0);
    const huge = faceCrop({ ...FACE, box: { ...FACE.box, width: 0.9 } }, FRAME, 2);
    expect(huge.width).toBeCloseTo(1);
    expect(huge.height).toBeCloseTo(0.5);
    expect(huge.x).toBe(0);
  });
});
