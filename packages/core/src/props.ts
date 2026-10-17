/**
 * The face props: a crown, glasses, a moustache, worn by every face in
 * the photos. Like the look, a prop is a choice on the session, never a
 * change to the files: each shot keeps the faces the kiosk found in it
 * (`faces.ts`), and wherever the photos are drawn the prop is drawn on
 * those faces from the same geometry. The kiosk does it in the browser,
 * live while the guests pose and on the review; the compositor does it
 * with sharp for the print. One placement, two renderers.
 *
 * A prop is pinned to a point on the face (between the eyes, the nose,
 * the mouth), offset along the face's own axes, sized in face widths,
 * and turned with the eye line, so it tilts when the head does.
 */
import type { Crop } from "./viewfinder";
import { faceAxes, type Face } from "./faces";
import { BOW_TIE, BUNNY_EARS, CROWN, FLOWERS, HALO, HEARTS, MASK, MOUSTACHE, PARTY_HAT, SPECS, TIARA, TOP_HAT, type Art } from "./prop-art";

export type PropId =
  | "none"
  | "crown"
  | "tiara"
  | "flowers"
  | "halo"
  | "tophat"
  | "partyhat"
  | "bunny"
  | "hearts"
  | "specs"
  | "mask"
  | "moustache"
  | "bowtie";

export interface Fit {
  /** The point on the face the prop is pinned to. */
  to: "eyes" | "nose" | "mouth";
  /** From that point, in face widths: x towards the face's right as the frame shows it, y down its length. */
  offset: { x: number; y: number };
  /** The artwork's width, in face widths. */
  width: number;
  /** The point of the artwork that goes on the pin, as fractions of the artwork. */
  pin: { x: number; y: number };
}

export interface Prop {
  id: PropId;
  /** What the chip says. */
  name: string;
  /** Null for "none". */
  art: Art | null;
  fit: Fit;
}

const NOWHERE: Fit = { to: "eyes", offset: { x: 0, y: 0 }, width: 0, pin: { x: 0.5, y: 0.5 } };

/** Every prop the booth knows, in the order the kiosk and admin show them. */
export const PROPS: readonly Prop[] = [
  { id: "none", name: "No props", art: null, fit: NOWHERE },
  { id: "crown", name: "Crown", art: CROWN, fit: { to: "eyes", offset: { x: 0, y: -0.37 }, width: 0.86, pin: { x: 0.5, y: 0.94 } } },
  { id: "tiara", name: "Tiara", art: TIARA, fit: { to: "eyes", offset: { x: 0, y: -0.4 }, width: 0.95, pin: { x: 0.5, y: 0.9 } } },
  { id: "flowers", name: "Flowers", art: FLOWERS, fit: { to: "eyes", offset: { x: 0, y: -0.4 }, width: 1.45, pin: { x: 0.5, y: 0.6 } } },
  { id: "halo", name: "Halo", art: HALO, fit: { to: "eyes", offset: { x: 0, y: -0.9 }, width: 0.9, pin: { x: 0.5, y: 0.5 } } },
  { id: "tophat", name: "Top hat", art: TOP_HAT, fit: { to: "eyes", offset: { x: 0, y: -0.37 }, width: 1.15, pin: { x: 0.5, y: 0.88 } } },
  { id: "partyhat", name: "Party hat", art: PARTY_HAT, fit: { to: "eyes", offset: { x: 0, y: -0.38 }, width: 0.8, pin: { x: 0.5, y: 0.9 } } },
  { id: "bunny", name: "Bunny ears", art: BUNNY_EARS, fit: { to: "eyes", offset: { x: 0, y: -0.6 }, width: 1.5, pin: { x: 0.5, y: 0.72 } } },
  { id: "hearts", name: "Hearts", art: HEARTS, fit: { to: "eyes", offset: { x: 0, y: 0.02 }, width: 0.98, pin: { x: 0.5, y: 0.48 } } },
  { id: "specs", name: "Specs", art: SPECS, fit: { to: "eyes", offset: { x: 0, y: 0 }, width: 0.98, pin: { x: 0.5, y: 0.52 } } },
  { id: "mask", name: "Mask", art: MASK, fit: { to: "eyes", offset: { x: 0, y: 0 }, width: 1.05, pin: { x: 0.5, y: 0.46 } } },
  { id: "moustache", name: "Moustache", art: MOUSTACHE, fit: { to: "mouth", offset: { x: 0, y: -0.1 }, width: 0.64, pin: { x: 0.5, y: 0.4 } } },
  { id: "bowtie", name: "Bow tie", art: BOW_TIE, fit: { to: "mouth", offset: { x: 0, y: 0.5 }, width: 0.85, pin: { x: 0.5, y: 0.5 } } },
];

/** The ids in catalogue order, typed as a non-empty tuple for schema validators. */
export const PROP_IDS = PROPS.map((p) => p.id) as [PropId, ...PropId[]];

/** Faces as they are: what a session gets when nobody chose. */
export const DEFAULT_PROP: PropId = "none";

export function isPropId(value: unknown): value is PropId {
  return typeof value === "string" && PROP_IDS.includes(value as PropId);
}

export function propById(id: PropId): Prop {
  const prop = PROPS.find((p) => p.id === id);
  if (!prop) throw new Error(`Unknown prop "${id}"`);
  return prop;
}

/**
 * The props the booth offers, from the stored setting: anything that is
 * not a prop is dropped, duplicates collapse, the order is the
 * catalogue's. "No props" is never in the list; it is always a choice,
 * and an empty list means the booth offers none.
 */
export function offeredProps(stored: readonly unknown[]): PropId[] {
  const chosen = new Set(stored.filter(isPropId));
  return PROP_IDS.filter((id) => id !== DEFAULT_PROP && chosen.has(id));
}

/** Whether the kiosk asks: when there is a prop to wear. */
export function needsPropChoice(offered: readonly PropId[]): boolean {
  return offered.length > 0;
}

/** The kiosk's chips: no props first, then each on offer. */
export function propChoices(offered: readonly PropId[]): PropId[] {
  return [DEFAULT_PROP, ...offered.filter((id) => id !== DEFAULT_PROP)];
}

/**
 * Where one prop goes on one face, in the frame's pixels: the middle of
 * the artwork, its size, and its turn in degrees clockwise about its
 * middle (CSS `rotate` and sharp's `rotate` agree on the sense).
 */
export interface PropPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
}

export function placeProp(face: Face, id: PropId, frame: { width: number; height: number }): PropPlacement | null {
  const { art, fit } = propById(id);
  if (!art) return null;
  const axes = faceAxes(face, frame);
  const pin =
    fit.to === "eyes"
      ? { x: axes.x, y: axes.y }
      : { x: face[fit.to].x * frame.width, y: face[fit.to].y * frame.height };
  const cos = Math.cos(axes.angle);
  const sin = Math.sin(axes.angle);
  // Along the face: u is its right (along the eye line), v its down.
  const along = (u: number, v: number) => ({ x: u * cos - v * sin, y: u * sin + v * cos });
  const width = fit.width * axes.size;
  const height = (width * art.height) / art.width;
  const offset = along(fit.offset.x * axes.size, fit.offset.y * axes.size);
  const toMiddle = along((0.5 - fit.pin.x) * width, (0.5 - fit.pin.y) * height);
  return {
    x: pin.x + offset.x + toMiddle.x,
    y: pin.y + offset.y + toMiddle.y,
    width,
    height,
    angle: (axes.angle * 180) / Math.PI,
  };
}

/** The axis-aligned box a placement covers once turned, in the frame's pixels. */
export function placementBounds(p: PropPlacement): { left: number; top: number; right: number; bottom: number } {
  const a = (p.angle * Math.PI) / 180;
  const halfW = (Math.abs(p.width * Math.cos(a)) + Math.abs(p.height * Math.sin(a))) / 2;
  const halfH = (Math.abs(p.width * Math.sin(a)) + Math.abs(p.height * Math.cos(a))) / 2;
  return { left: p.x - halfW, top: p.y - halfH, right: p.x + halfW, bottom: p.y + halfH };
}

/** The artwork as a URL an `<img>` can show. */
export function propImageUrl(id: PropId): string | null {
  const { art } = propById(id);
  return art ? `data:image/svg+xml,${encodeURIComponent(art.svg)}` : null;
}

/**
 * A close-up of one face for a chip: a crop of the frame with the
 * chip's aspect ratio, `zoom` face widths across, centred a little above
 * the eyes so a crown is in it as well as the chin, and kept inside the
 * frame. Fractions of the frame, like the viewfinder's crop.
 */
export function faceCrop(face: Face, frame: { width: number; height: number }, aspect: number, zoom = 2.6): Crop {
  const axes = faceAxes(face, frame);
  let width = Math.min(frame.width, axes.size * zoom);
  let height = width / aspect;
  if (height > frame.height) {
    height = frame.height;
    width = height * aspect;
  }
  const cx = axes.x;
  const cy = axes.y - 0.12 * axes.size;
  const left = Math.min(frame.width - width, Math.max(0, cx - width / 2));
  const top = Math.min(frame.height - height, Math.max(0, cy - height / 2));
  return { x: left / frame.width, y: top / frame.height, width: width / frame.width, height: height / frame.height };
}
