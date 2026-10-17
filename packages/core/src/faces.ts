/**
 * The faces in a photo, as the kiosk's face detector found them.
 *
 * The iPad runs MediaPipe's full-range BlazeFace on the frame it takes
 * and sends what it found with the photo; the face props (`props.ts`)
 * are drawn from it, live on the kiosk and on the print alike. Every
 * position is a fraction of the camera's own, unmirrored frame (x of
 * its width, y of its height, from the top left), so a face found on a
 * small copy of the frame lands in the same place on the full one.
 *
 * Full range rather than MediaPipe's default short-range model, and not
 * jeeliz: guests stand a metre or two from an ultra-wide front camera,
 * where a face is 5 to 10% of the frame's width. Both of the others
 * find nothing that small; this one found every face in a seven-person
 * group portrait.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Face {
  /** Around the face, from brow to chin and cheek to cheek. */
  box: { x: number; y: number; width: number; height: number };
  /** The eyes, the one on the frame's left first. */
  eyes: [Point, Point];
  /** The tip of the nose. */
  nose: Point;
  /** The middle of the mouth. */
  mouth: Point;
  /** How sure the detector was, 0 to 1. */
  score: number;
}

/** The header the kiosk sends a photo's faces in, as JSON, with the photo as the body. */
export const FACES_HEADER = "x-booth-faces";

/** A group bigger than this is a crowd behind the guests, not the guests. */
export const MAX_FACES = 12;

/** The parts of a MediaPipe `Detection` read here. */
export interface DetectedFace {
  /** In the pixels of the image the detector was given. */
  boundingBox?: { originX: number; originY: number; width: number; height: number };
  /** Fractions of that image: right eye, left eye (the subject's), nose tip, mouth, then the ears. */
  keypoints: readonly { x: number; y: number }[];
  categories: readonly { score: number }[];
}

/**
 * MediaPipe's detections as faces. `input` is the size of the image the
 * detector was given, which the box is in pixels of; the keypoints are
 * already fractions. The most certain faces are kept, then put in
 * reading order so the stored list is stable from shot to shot.
 */
export function facesFromDetections(detections: readonly DetectedFace[], input: { width: number; height: number }): Face[] {
  if (input.width <= 0 || input.height <= 0) return [];
  const faces: Face[] = [];
  for (const d of detections) {
    const [a, b, nose, mouth] = d.keypoints;
    if (!d.boundingBox || !a || !b || !nose || !mouth) continue;
    const [left, right] = a.x <= b.x ? [a, b] : [b, a];
    faces.push({
      box: {
        x: round(d.boundingBox.originX / input.width),
        y: round(d.boundingBox.originY / input.height),
        width: round(d.boundingBox.width / input.width),
        height: round(d.boundingBox.height / input.height),
      },
      eyes: [point(left), point(right)],
      nose: point(nose),
      mouth: point(mouth),
      score: round(d.categories[0]?.score ?? 0),
    });
  }
  return faces
    .sort((p, q) => q.score - p.score)
    .slice(0, MAX_FACES)
    .sort((p, q) => p.box.x - q.box.x || p.box.y - q.box.y);
}

/**
 * Faces from the wire (the kiosk's upload) or the database: the list if
 * every field is a finite number where it should be and the positions
 * are near the frame, else null. A keypoint may sit a little outside the
 * frame when a face is cut off at its edge.
 */
export function parseFaces(value: unknown): Face[] | null {
  if (!Array.isArray(value) || value.length > MAX_FACES) return null;
  const faces: Face[] = [];
  for (const v of value) {
    if (!isRecord(v) || !isRecord(v.box) || !Array.isArray(v.eyes) || v.eyes.length !== 2) return null;
    const box = { x: v.box.x, y: v.box.y, width: v.box.width, height: v.box.height };
    const points = [v.eyes[0], v.eyes[1], v.nose, v.mouth];
    if (!Object.values(box).every(near) || !((box.width as number) > 0) || !((box.height as number) > 0)) return null;
    if (!points.every((p) => isRecord(p) && near(p.x) && near(p.y))) return null;
    if (typeof v.score !== "number" || !(v.score >= 0 && v.score <= 1)) return null;
    const [left, right, nose, mouth] = points as Point[];
    faces.push({
      box: box as Face["box"],
      eyes: [point(left!), point(right!)],
      nose: point(nose!),
      mouth: point(mouth!),
      score: v.score,
    });
  }
  return faces;
}

/**
 * A face's own axes in the frame's pixels: where its eyes are, which way
 * the eye line runs (radians, clockwise from the frame's x axis, since y
 * runs down), and its size (the box's width), which is the unit props
 * are measured in. The box rather than the distance between the eyes,
 * which shrinks as the head turns.
 */
export interface FaceAxes {
  x: number;
  y: number;
  angle: number;
  size: number;
}

export function faceAxes(face: Face, frame: { width: number; height: number }): FaceAxes {
  const [l, r] = face.eyes;
  return {
    x: ((l.x + r.x) / 2) * frame.width,
    y: ((l.y + r.y) / 2) * frame.height,
    angle: Math.atan2((r.y - l.y) * frame.height, (r.x - l.x) * frame.width),
    size: face.box.width * frame.width,
  };
}

/** A face as the live preview follows it: smoothed, and kept a moment after the detector loses it. */
export interface TrackedFace {
  /** Stable while the face is followed, for the screen's keys. */
  id: number;
  face: Face;
  /** When the detector last saw it, in the caller's milliseconds. */
  seenAt: number;
}

/** How long a face the detector missed stays on screen, so a blink of the detector is not a blink of the crown. */
export const FACE_GRACE_MS = 400;

/**
 * One step of the live preview's tracking. Each detected face takes over
 * the nearest face already followed, if its eyes are within one face
 * width of it, and moves towards where it was found: all the way when
 * it moved a lot (a guest stepping in should not leave the crown
 * behind), a third of the way when it barely moved (the detector's
 * jitter on a still face). The rest are new faces; faces not found
 * again are dropped after `FACE_GRACE_MS`.
 */
export function trackFaces(followed: readonly TrackedFace[], detected: readonly Face[], now: number, nextId: () => number): TrackedFace[] {
  const free = new Set(followed);
  const tracked: TrackedFace[] = [];
  for (const face of detected) {
    const [ex, ey] = eyeMiddle(face);
    let best: TrackedFace | null = null;
    let bestDistance = Infinity;
    for (const t of free) {
      const [tx, ty] = eyeMiddle(t.face);
      const distance = Math.hypot(ex - tx, ey - ty);
      if (distance < bestDistance && distance < Math.max(face.box.width, t.face.box.width)) {
        best = t;
        bestDistance = distance;
      }
    }
    if (!best) {
      tracked.push({ id: nextId(), face, seenAt: now });
      continue;
    }
    free.delete(best);
    const alpha = Math.min(1, Math.max(1 / 3, bestDistance / (0.25 * face.box.width)));
    tracked.push({ id: best.id, face: blendFaces(best.face, face, alpha), seenAt: now });
  }
  for (const t of free) if (now - t.seenAt < FACE_GRACE_MS) tracked.push(t);
  return tracked.sort((a, b) => a.id - b.id);
}

/** `from` moved `alpha` of the way to `to`. */
export function blendFaces(from: Face, to: Face, alpha: number): Face {
  const mix = (a: number, b: number) => a + (b - a) * alpha;
  const mixPoint = (a: Point, b: Point) => ({ x: mix(a.x, b.x), y: mix(a.y, b.y) });
  return {
    box: {
      x: mix(from.box.x, to.box.x),
      y: mix(from.box.y, to.box.y),
      width: mix(from.box.width, to.box.width),
      height: mix(from.box.height, to.box.height),
    },
    eyes: [mixPoint(from.eyes[0], to.eyes[0]), mixPoint(from.eyes[1], to.eyes[1])],
    nose: mixPoint(from.nose, to.nose),
    mouth: mixPoint(from.mouth, to.mouth),
    score: to.score,
  };
}

function eyeMiddle(face: Face): [number, number] {
  return [(face.eyes[0].x + face.eyes[1].x) / 2, (face.eyes[0].y + face.eyes[1].y) / 2];
}

function point(p: { x: number; y: number }): Point {
  return { x: round(p.x), y: round(p.y) };
}

/** Four decimals: a tenth of a pixel on the largest frame, and a quarter of the bytes. */
function round(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

function near(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= -0.5 && v <= 1.5;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
