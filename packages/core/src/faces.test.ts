import { describe, expect, it } from "vitest";
import {
  FACE_GRACE_MS,
  MAX_FACES,
  blendFaces,
  faceAxes,
  facesFromDetections,
  parseFaces,
  trackFaces,
  type DetectedFace,
  type Face,
  type TrackedFace,
} from "./faces";

/**
 * What MediaPipe's full-range detector returned for the portrait of
 * Sally Ride (NASA, public domain), given a 640 × 800 copy: the box in
 * that copy's pixels, the keypoints as fractions, the subject's right
 * eye (on the image's left) first.
 */
const SALLY: DetectedFace = {
  boundingBox: { originX: 243, originY: 197, width: 176, height: 176 },
  keypoints: [
    { x: 0.461, y: 0.317 },
    { x: 0.577, y: 0.323 },
    { x: 0.519, y: 0.371 },
    { x: 0.515, y: 0.411 },
    { x: 0.392, y: 0.336 },
    { x: 0.639, y: 0.347 },
  ],
  categories: [{ score: 0.92 }],
};

const FACE: Face = {
  box: { x: 0.4, y: 0.25, width: 0.2, height: 0.16 },
  eyes: [
    { x: 0.46, y: 0.3 },
    { x: 0.54, y: 0.3 },
  ],
  nose: { x: 0.5, y: 0.34 },
  mouth: { x: 0.5, y: 0.38 },
  score: 0.9,
};

function at(face: Face, dx: number, dy = 0): Face {
  const move = (p: { x: number; y: number }) => ({ x: p.x + dx, y: p.y + dy });
  return {
    ...face,
    box: { ...face.box, x: face.box.x + dx, y: face.box.y + dy },
    eyes: [move(face.eyes[0]), move(face.eyes[1])],
    nose: move(face.nose),
    mouth: move(face.mouth),
  };
}

describe("facesFromDetections", () => {
  it("turns the box into fractions and keeps the eyes, nose and mouth", () => {
    const [face] = facesFromDetections([SALLY], { width: 640, height: 800 });
    expect(face).toEqual({
      box: { x: 0.3797, y: 0.2463, width: 0.275, height: 0.22 },
      eyes: [
        { x: 0.461, y: 0.317 },
        { x: 0.577, y: 0.323 },
      ],
      nose: { x: 0.519, y: 0.371 },
      mouth: { x: 0.515, y: 0.411 },
      score: 0.92,
    });
  });

  it("puts the eye on the frame's left first, whichever the detector names first", () => {
    const swapped = { ...SALLY, keypoints: [SALLY.keypoints[1]!, SALLY.keypoints[0]!, ...SALLY.keypoints.slice(2)] };
    const [face] = facesFromDetections([swapped], { width: 640, height: 800 });
    expect(face!.eyes[0].x).toBeLessThan(face!.eyes[1].x);
  });

  it("skips a detection with no box or too few keypoints", () => {
    const boxless: DetectedFace = { keypoints: SALLY.keypoints, categories: SALLY.categories };
    expect(facesFromDetections([boxless, { ...SALLY, keypoints: SALLY.keypoints.slice(0, 3) }], { width: 640, height: 800 })).toEqual([]);
  });

  it("keeps the most certain faces, in reading order", () => {
    const shifted = (dx: number, score: number): DetectedFace => ({
      boundingBox: { ...SALLY.boundingBox!, originX: SALLY.boundingBox!.originX + dx * 640 },
      keypoints: SALLY.keypoints.map((k) => ({ x: k.x + dx, y: k.y })),
      categories: [{ score }],
    });
    const many = Array.from({ length: MAX_FACES + 3 }, (_, i) => shifted(i * 0.01, i < 3 ? 0.5 : 0.9));
    const faces = facesFromDetections(many.reverse(), { width: 640, height: 800 });
    expect(faces).toHaveLength(MAX_FACES);
    expect(faces.every((f) => f.score === 0.9)).toBe(true);
    expect(faces.map((f) => f.box.x)).toEqual([...faces.map((f) => f.box.x)].sort((a, b) => a - b));
  });

  it("finds nothing in an empty image", () => {
    expect(facesFromDetections([SALLY], { width: 0, height: 0 })).toEqual([]);
  });
});

describe("parseFaces", () => {
  it("accepts what facesFromDetections makes", () => {
    const faces = facesFromDetections([SALLY], { width: 640, height: 800 });
    expect(parseFaces(JSON.parse(JSON.stringify(faces)))).toEqual(faces);
    expect(parseFaces([])).toEqual([]);
  });

  it("allows a keypoint a little outside the frame, for a face cut off at its edge", () => {
    expect(parseFaces([at(FACE, -0.5)])).toHaveLength(1);
  });

  it("refuses anything else", () => {
    expect(parseFaces(null)).toBeNull();
    expect(parseFaces({})).toBeNull();
    expect(parseFaces(Array.from({ length: MAX_FACES + 1 }, () => FACE))).toBeNull();
    expect(parseFaces([{ ...FACE, score: 2 }])).toBeNull();
    expect(parseFaces([{ ...FACE, box: { ...FACE.box, width: 0 } }])).toBeNull();
    expect(parseFaces([{ ...FACE, nose: { x: Number.NaN, y: 0 } }])).toBeNull();
    expect(parseFaces([{ ...FACE, mouth: { x: 3, y: 0 } }])).toBeNull();
    expect(parseFaces([{ ...FACE, eyes: [FACE.eyes[0]] }])).toBeNull();
  });

  it("drops fields it does not know", () => {
    const [face] = parseFaces([{ ...FACE, extra: true, nose: { ...FACE.nose, z: 1 } }])!;
    expect(face).toEqual(FACE);
  });
});

describe("faceAxes", () => {
  it("is the middle of the eyes, the eye line's angle and the box's width, in pixels", () => {
    const axes = faceAxes(FACE, { width: 1000, height: 500 });
    expect(axes.x).toBeCloseTo(500);
    expect(axes.y).toBeCloseTo(150);
    expect(axes.angle).toBeCloseTo(0);
    expect(axes.size).toBeCloseTo(200);
  });

  it("measures the angle in pixels, so a frame's shape does not skew it", () => {
    // 0.1 across and 0.1 down is 45° on a square frame and less on a wide one.
    const tilted: Face = { ...FACE, eyes: [{ x: 0.4, y: 0.3 }, { x: 0.5, y: 0.4 }] };
    expect(faceAxes(tilted, { width: 1000, height: 1000 }).angle).toBeCloseTo(Math.PI / 4);
    expect(faceAxes(tilted, { width: 2000, height: 1000 }).angle).toBeCloseTo(Math.atan2(100, 200));
  });
});

describe("trackFaces", () => {
  const ids = () => {
    let n = 0;
    return () => ++n;
  };

  it("follows a face from frame to frame under one id", () => {
    const next = ids();
    const first = trackFaces([], [FACE], 0, next);
    const second = trackFaces(first, [at(FACE, 0.001)], 50, next);
    expect(second.map((t) => t.id)).toEqual(first.map((t) => t.id));
  });

  it("smooths the detector's jitter on a still face, and keeps up with a face that moves", () => {
    const next = ids();
    const start = trackFaces([], [FACE], 0, next);
    const jitter = trackFaces(start, [at(FACE, 0.003)], 50, next)[0]!;
    expect(jitter.face.box.x - FACE.box.x).toBeCloseTo(0.001);
    const moved = trackFaces(start, [at(FACE, 0.1)], 50, next)[0]!;
    expect(moved.face.box.x).toBeCloseTo(FACE.box.x + 0.1);
  });

  it("gives two faces two ids and matches each to its nearest", () => {
    const next = ids();
    const left = FACE;
    const right = at(FACE, 0.4);
    const first = trackFaces([], [left, right], 0, next);
    const second = trackFaces(first, [at(right, 0.01), at(left, -0.01)], 50, next);
    const byId = new Map(second.map((t) => [t.id, t.face.box.x]));
    expect(byId.get(first[0]!.id)!).toBeLessThan(FACE.box.x);
    expect(byId.get(first[1]!.id)!).toBeGreaterThan(FACE.box.x + 0.4);
  });

  it("treats a face further than its width from every followed one as new", () => {
    const next = ids();
    const first = trackFaces([], [FACE], 0, next);
    const jumped = trackFaces(first, [at(FACE, 0.3)], 50, next);
    expect(jumped.map((t) => t.id)).toEqual([1, 2]);
  });

  it("keeps a lost face for a moment, then lets it go", () => {
    const next = ids();
    const seen: TrackedFace[] = trackFaces([], [FACE], 0, next);
    expect(trackFaces(seen, [], FACE_GRACE_MS - 1, next)).toEqual(seen);
    expect(trackFaces(seen, [], FACE_GRACE_MS, next)).toEqual([]);
  });
});

describe("blendFaces", () => {
  it("moves every point the same share of the way", () => {
    const halfway = blendFaces(FACE, at(FACE, 0.2, 0.1), 0.5);
    expect(halfway.box.x).toBeCloseTo(FACE.box.x + 0.1);
    expect(halfway.mouth.y).toBeCloseTo(FACE.mouth.y + 0.05);
    expect(halfway.eyes[1].x).toBeCloseTo(FACE.eyes[1].x + 0.1);
  });
});
