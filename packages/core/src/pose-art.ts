/**
 * The pose ideas' pictures: one stick figure per person, drawn from a
 * few joint angles, so thirty poses are one style in one file and a
 * new idea is a line of numbers, not a drawing. Ivory on nothing, bold
 * enough for a swatch beside the idea and a picture over the countdown.
 *
 * A figure stands in a 200 by 200 box, feet at the foot; a pose places
 * one or more at an `x` and a scale. Limb angles are degrees from
 * straight down, positive away from the body's middle (so the same
 * numbers on both sides make a symmetric pose); `bend` turns the lower
 * segment on from the upper one, outward positive. Same SVG subset as
 * the props: paths, circles, lines and groups, no text, no filters.
 */
import type { Art } from "./prop-art";
import type { PoseId } from "./poses";

type Face = "smile" | "grin" | "line" | "o" | "pout" | "wink" | "silly" | "roar";
type Hand = "open" | "fist" | "point" | "peace" | "thumb" | "glass" | "claw" | "hush";

interface Limb {
  /** The upper segment's angle. */
  a: number;
  /** The lower segment's turn on from the upper, outward positive. */
  bend?: number;
  hand?: Hand;
}

interface Figure {
  /** The middle of the figure, in the 200-wide box; 100 is centred. */
  x?: number;
  /** 1 fills the box; two people share it at 0.8. */
  s?: number;
  /** Lifted off the ground, in box units (a jump). */
  lift?: number;
  /** The whole body's tilt about the hips, degrees, clockwise positive. */
  lean?: number;
  /** The head: its tilt, and how far its face has turned (dx) or lifted (dy). */
  head?: { tilt?: number; dx?: number; dy?: number };
  face?: Face;
  arms?: { l?: Limb; r?: Limb };
  legs?: { l?: Limb; r?: Limb };
}

const INK = "#f3e9d2";
const DARK = "#1a1320";
const LINE = 7;

const HEAD_R = 16;
const SHOULDER_Y = 62;
const HIP_Y = 114;
const UPPER_ARM = 34;
const FOREARM = 30;
const THIGH = 38;
const SHIN = 38;

const STAND: Limb = { a: 8 };
const HANG: Limb = { a: 12 };

const rad = (deg: number) => (deg * Math.PI) / 180;
const n = (v: number) => Math.round(v * 10) / 10;

/** The end of a segment of `length` at `angle` from down, on the `side` (+1 right, -1 left) of the body. */
function reach(from: { x: number; y: number }, angle: number, length: number, side: 1 | -1) {
  return { x: from.x + side * Math.sin(rad(angle)) * length, y: from.y + Math.cos(rad(angle)) * length };
}

function seg(a: { x: number; y: number }, b: { x: number; y: number }, width = LINE): string {
  return `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${INK}" stroke-width="${width}" stroke-linecap="round"/>`;
}

function limb(from: { x: number; y: number }, l: Limb, upper: number, lower: number, side: 1 | -1): { svg: string; end: { x: number; y: number }; dir: number } {
  const elbow = reach(from, l.a, upper, side);
  const dir = l.a + (l.bend ?? 0);
  const end = reach(elbow, dir, lower, side);
  return { svg: seg(from, elbow) + seg(elbow, end), end, dir };
}

/** What a hand holds or does, drawn at the wrist, along the forearm's direction. */
function hand(at: { x: number; y: number }, dir: number, side: 1 | -1, kind: Hand): string {
  const on = (angle: number, length: number) => reach(at, angle, length, side);
  switch (kind) {
    case "open":
      return "";
    case "fist":
      return `<circle cx="${n(at.x)}" cy="${n(at.y)}" r="6.5" fill="${INK}"/>`;
    case "point":
      return seg(at, on(dir, 15), 5);
    case "peace":
      return seg(at, on(dir - 16, 16), 4.5) + seg(at, on(dir + 16, 16), 4.5);
    case "thumb":
      return `<circle cx="${n(at.x)}" cy="${n(at.y)}" r="6.5" fill="${INK}"/>` + seg(at, { x: at.x, y: at.y - 15 }, 5);
    case "glass": {
      const top = on(dir, 14);
      return (
        seg(at, top, 4) +
        `<path d="M${n(top.x - 9)} ${n(top.y - 2)} h18 l-3 -18 h-12 z" fill="${INK}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`
      );
    }
    case "claw":
      return [-28, 0, 28].map((spread) => seg(at, on(dir + spread, 13), 4)).join("");
    case "hush":
      return seg(at, on(dir, 12), 4.5);
  }
}

function face(kind: Face): string {
  const eyes = (left: string, right: string) => left + right;
  const dot = (x: number) => `<circle cx="${x}" cy="-3" r="2.4" fill="${DARK}"/>`;
  const cross = (x: number) => `<path d="M${x - 3} -6 l6 6 M${x + 3} -6 l-6 6" stroke="${DARK}" stroke-width="2" stroke-linecap="round"/>`;
  const closed = (x: number) => `<path d="M${x - 3.5} -3 h7" stroke="${DARK}" stroke-width="2.2" stroke-linecap="round"/>`;
  const mouth = {
    smile: `<path d="M-6.5 4.5 Q0 11 6.5 4.5" fill="none" stroke="${DARK}" stroke-width="2.4" stroke-linecap="round"/>`,
    grin: `<path d="M-7.5 3.5 Q0 14 7.5 3.5 Z" fill="${DARK}"/>`,
    line: `<path d="M-5.5 6.5 h11" stroke="${DARK}" stroke-width="2.4" stroke-linecap="round"/>`,
    o: `<ellipse cx="0" cy="6.5" rx="3.6" ry="4.6" fill="${DARK}"/>`,
    pout: `<circle cx="0" cy="6.5" r="2.6" fill="${DARK}"/>`,
    wink: `<path d="M-7.5 3.5 Q0 14 7.5 3.5 Z" fill="${DARK}"/>`,
    silly: `<path d="M-7 3 Q0 12 7 3 Z" fill="${DARK}"/><ellipse cx="2" cy="10" rx="3.2" ry="4.2" fill="#d16c7c"/>`,
    roar: `<path d="M-8 2 Q0 17 8 2 Z" fill="${DARK}"/>`,
  }[kind];
  const eye =
    kind === "wink" ? eyes(closed(-6), dot(6)) : kind === "silly" ? eyes(cross(-6), cross(6)) : kind === "roar" ? eyes(closed(-6), closed(6)) : eyes(dot(-6), dot(6));
  return eye + mouth;
}

function figure(f: Figure): string {
  const s = f.s ?? 1;
  const x = f.x ?? 100;
  const lift = f.lift ?? 0;
  const hip = { x: 100, y: HIP_Y };
  const shoulder = { x: 100, y: SHOULDER_Y };
  const headAt = { x: 100, y: SHOULDER_Y - 6 - HEAD_R };
  const legs = f.legs ?? {};
  const arms = f.arms ?? {};
  const left = limb(hip, legs.l ?? STAND, THIGH, SHIN, -1);
  const right = limb(hip, legs.r ?? STAND, THIGH, SHIN, 1);
  const armL = limb(shoulder, arms.l ?? HANG, UPPER_ARM, FOREARM, -1);
  const armR = limb(shoulder, arms.r ?? HANG, UPPER_ARM, FOREARM, 1);
  const head = f.head ?? {};
  const upper =
    seg(hip, shoulder, LINE + 1) +
    armL.svg +
    armR.svg +
    hand(armL.end, armL.dir, -1, arms.l?.hand ?? "open") +
    hand(armR.end, armR.dir, 1, arms.r?.hand ?? "open") +
    `<circle cx="${headAt.x}" cy="${headAt.y}" r="${HEAD_R}" fill="${INK}"/>` +
    `<g transform="translate(${n(headAt.x + (head.dx ?? 0))} ${n(headAt.y + (head.dy ?? 0))}) rotate(${head.tilt ?? 0})">${face(f.face ?? "smile")}</g>`;
  const body = `${left.svg}${right.svg}<g transform="rotate(${f.lean ?? 0} ${hip.x} ${hip.y})">${upper}</g>`;
  return `<g transform="translate(${n(x - 100 * s)} ${n(200 - 200 * s - lift)}) scale(${s})">${body}</g>`;
}

/** A heart, `size` wide, centred at (x, y). */
function heart(x: number, y: number, size: number, fill = "#d16c7c"): string {
  const h = size / 2;
  return `<path transform="translate(${x} ${y}) scale(${n(h / 10)})" d="M0 8 C-10 0 -10 -9 -4 -9 C-1 -9 0 -6 0 -5 C0 -6 1 -9 4 -9 C10 -9 10 0 0 8 Z" fill="${fill}"/>`;
}

/** Short strokes radiating from (x, y): a jump's lift, a laugh, a dancer's swing. */
function rays(x: number, y: number, angles: number[], from: number, to: number): string {
  return angles
    .map((a) => seg({ x: x + Math.sin(rad(a)) * from, y: y - Math.cos(rad(a)) * from }, { x: x + Math.sin(rad(a)) * to, y: y - Math.cos(rad(a)) * to }, 4))
    .join("");
}

function art(...parts: string[]): Art {
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">${parts.join("")}</svg>`, width: 200, height: 200 };
}

const PAIR = { l: { x: 72, s: 0.8 }, r: { x: 128, s: 0.8 } };

/** Every idea's picture. */
export const POSE_ART: Record<PoseId, Art> = {
  smile: art(figure({ face: "smile", arms: { l: { a: 14 }, r: { a: 14 } } })),
  serious: art(figure({ face: "line", arms: { l: { a: 6 }, r: { a: 6 } }, legs: { l: { a: 4 }, r: { a: 4 } } })),
  hips: art(figure({ face: "smile", arms: { l: { a: 48, bend: -112, hand: "fist" }, r: { a: 48, bend: -112, hand: "fist" } }, legs: { l: { a: 14 }, r: { a: 14 } } })),
  thumbs: art(figure({ face: "grin", arms: { l: { a: 42, bend: 96, hand: "thumb" }, r: { a: 42, bend: 96, hand: "thumb" } } })),
  glance: art(figure({ face: "smile", head: { dx: 7, tilt: -12 }, lean: -6, arms: { l: { a: -4 }, r: { a: 24, bend: -70 } }, legs: { l: { a: 2 }, r: { a: 18 } } })),
  shoulder: art(
    figure({ ...PAIR.l, face: "grin", arms: { l: { a: 14 }, r: { a: 80, bend: 42 } } }),
    figure({ ...PAIR.r, face: "grin", arms: { l: { a: 80, bend: 42 }, r: { a: 14 } } }),
  ),
  lean: art(
    figure({ ...PAIR.l, lean: 14, face: "smile", arms: { l: { a: 16 }, r: { a: 8 } } }),
    figure({ ...PAIR.r, lean: -14, face: "smile", arms: { l: { a: 8 }, r: { a: 16 } } }),
  ),
  cheek: art(
    figure({ x: 80, s: 0.8, lean: 11, face: "smile", arms: { l: { a: 18 }, r: { a: 4 } } }),
    figure({ x: 120, s: 0.8, lean: -11, face: "smile", arms: { l: { a: 4 }, r: { a: 18 } } }),
  ),
  you: art(figure({ face: "grin", arms: { l: { a: 14 }, r: { a: 92, bend: 0, hand: "point" } } })),
  peace: art(figure({ face: "grin", arms: { l: { a: 100, bend: 62, hand: "peace" }, r: { a: 100, bend: 62, hand: "peace" } } })),
  kiss: art(figure({ face: "pout", arms: { l: { a: 14 }, r: { a: 30, bend: 128 } } }), heart(146, 52, 18), heart(162, 36, 11)),
  wink: art(figure({ face: "wink", arms: { l: { a: 14 }, r: { a: 52, bend: -116, hand: "fist" } } })),
  heart: art(figure({ face: "smile", arms: { l: { a: 136, bend: -78 }, r: { a: 136, bend: -78 } } }), heart(100, 16, 30)),
  shh: art(figure({ face: "line", arms: { l: { a: 10 }, r: { a: 18, bend: 142, hand: "hush" } } })),
  cheers: art(figure({ face: "grin", arms: { l: { a: 14 }, r: { a: 110, bend: 34, hand: "glass" } } })),
  model: art(figure({ face: "pout", lean: 7, head: { tilt: 14 }, arms: { l: { a: 2 }, r: { a: 48, bend: -112, hand: "fist" } }, legs: { l: { a: 4 }, r: { a: 24, bend: -30 } } })),
  point: art(
    figure({ ...PAIR.l, face: "grin", arms: { l: { a: 14 }, r: { a: 88, hand: "point" } } }),
    figure({ ...PAIR.r, face: "grin", arms: { l: { a: 88, hand: "point" }, r: { a: 14 } } }),
  ),
  secret: art(
    figure({ ...PAIR.l, lean: 10, face: "smile", arms: { l: { a: 10 }, r: { a: 70, bend: 54 } } }),
    figure({ ...PAIR.r, face: "o", head: { dx: -4 }, arms: { l: { a: 54, bend: 118 }, r: { a: 54, bend: 118 } } }),
  ),
  backs: art(
    figure({ x: 76, s: 0.8, lean: -5, face: "smile", head: { dx: -4 }, arms: { l: { a: 62, bend: -150 }, r: { a: 62, bend: -150 } } }),
    figure({ x: 124, s: 0.8, lean: 5, face: "smile", head: { dx: 4 }, arms: { l: { a: 62, bend: -150 }, r: { a: 62, bend: -150 } } }),
  ),
  gaze: art(
    figure({ ...PAIR.l, face: "smile", head: { dx: 8 }, arms: { l: { a: 18 }, r: { a: 30 } } }),
    figure({ ...PAIR.r, face: "smile", head: { dx: -8 }, arms: { l: { a: 30 }, r: { a: 18 } } }),
  ),
  shocked: art(figure({ face: "o", arms: { l: { a: 56, bend: 118 }, r: { a: 56, bend: 118 } }, legs: { l: { a: 16 }, r: { a: 16 } } })),
  laugh: art(figure({ face: "grin", head: { dy: -3, tilt: 0 }, lean: -8, arms: { l: { a: 46, bend: -96 }, r: { a: 46, bend: -96 } } }), rays(100, 36, [-50, -25, 25, 50], 24, 36)),
  jump: art(
    figure({ face: "grin", lift: 14, s: 0.9, arms: { l: { a: 142 }, r: { a: 142 } }, legs: { l: { a: 32 }, r: { a: 32 } } }),
    rays(100, 198, [-42, -16, 16, 42], 4, 20),
  ),
  hands: art(figure({ face: "grin", arms: { l: { a: 148 }, r: { a: 148 } }, legs: { l: { a: 14 }, r: { a: 14 } } })),
  flex: art(figure({ face: "line", arms: { l: { a: 96, bend: -128, hand: "fist" }, r: { a: 96, bend: -128, hand: "fist" } }, legs: { l: { a: 16 }, r: { a: 16 } } })),
  silly: art(figure({ face: "silly", arms: { l: { a: 108, bend: 66 }, r: { a: 108, bend: 66 } } })),
  dance: art(
    figure({ face: "grin", lean: 10, head: { tilt: 10 }, arms: { l: { a: 34, bend: 70 }, r: { a: 158, bend: 10 } }, legs: { l: { a: 4 }, r: { a: 34, bend: -44 } } }),
    rays(160, 64, [-30, 0, 30], 18, 30),
  ),
  roar: art(figure({ face: "roar", head: { dy: 2 }, lean: 0, arms: { l: { a: 78, bend: 86, hand: "claw" }, r: { a: 78, bend: 86, hand: "claw" } }, legs: { l: { a: 18 }, r: { a: 18 } } })),
  hug: art(
    figure({ x: 84, s: 0.8, lean: 8, face: "smile", arms: { l: { a: 20 }, r: { a: 96, bend: 74 } } }),
    figure({ x: 116, s: 0.8, lean: -8, face: "smile", arms: { l: { a: 96, bend: 74 }, r: { a: 20 } } }),
  ),
  pile: art(
    figure({ x: 100, s: 0.78, face: "grin", arms: { l: { a: 112, bend: -36 }, r: { a: 112, bend: -36 } } }),
    figure({ x: 58, s: 0.6, face: "grin", lean: 12, arms: { l: { a: 18 }, r: { a: 60 } }, legs: { l: { a: 36, bend: -70 }, r: { a: 36, bend: -70 } } }),
    figure({ x: 142, s: 0.6, face: "grin", lean: -12, arms: { l: { a: 60 }, r: { a: 18 } }, legs: { l: { a: 36, bend: -70 }, r: { a: 36, bend: -70 } } }),
  ),
};

export function poseImageUrl(id: PoseId): string {
  return `data:image/svg+xml,${encodeURIComponent(POSE_ART[id].svg)}`;
}
