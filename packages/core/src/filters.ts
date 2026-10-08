/**
 * The filters a guest can pick: one look for every photo in a session.
 *
 * The shots on disk stay exactly as the camera took them. The filter is
 * stored on the session and applied wherever the photos are drawn: by
 * the browser as CSS (`Composite`, the live preview) and by the
 * compositor for the print and web JPEGs, through `applyLook`, which is
 * the same arithmetic the browser does. One definition, two renderers,
 * so the print matches what the guest saw on the screen.
 */

export type FilterId = "colour" | "mono" | "vintage" | "faded" | "pop";

/**
 * A look as adjustments on the camera's frame. `grayscale` and `sepia`
 * are blends from 0 (off) to 1; the rest are multipliers where 1 means
 * unchanged. Each is a CSS filter function of the same name, and
 * `applyLook` is each function's definition in the Filter Effects spec.
 */
export interface Look {
  grayscale: number;
  sepia: number;
  saturate: number;
  contrast: number;
  brightness: number;
}

export interface Filter {
  id: FilterId;
  /** What the tile says. */
  name: string;
  look: Look;
}

export const UNCHANGED: Look = { grayscale: 0, sepia: 0, saturate: 1, contrast: 1, brightness: 1 };

/** Every filter the booth knows, in the order the kiosk and admin show them. */
export const FILTERS: readonly Filter[] = [
  { id: "colour", name: "Colour", look: UNCHANGED },
  { id: "mono", name: "Black & white", look: { ...UNCHANGED, grayscale: 1, contrast: 1.08, brightness: 1.02 } },
  { id: "vintage", name: "Vintage", look: { ...UNCHANGED, sepia: 0.55, saturate: 1.1, contrast: 1.02, brightness: 1.04 } },
  { id: "faded", name: "Faded", look: { ...UNCHANGED, sepia: 0.15, saturate: 0.75, contrast: 0.88, brightness: 1.1 } },
  { id: "pop", name: "Pop", look: { ...UNCHANGED, saturate: 1.45, contrast: 1.12 } },
];

/** The ids in catalogue order, typed as a non-empty tuple for schema validators. */
export const FILTER_IDS = FILTERS.map((f) => f.id) as [FilterId, ...FilterId[]];

/** The camera's own colours: what a session gets when nobody chose. */
export const DEFAULT_FILTER: FilterId = "colour";

export function isFilterId(value: unknown): value is FilterId {
  return typeof value === "string" && FILTER_IDS.includes(value as FilterId);
}

export function filterById(id: FilterId): Filter {
  const filter = FILTERS.find((f) => f.id === id);
  if (!filter) throw new Error(`Unknown filter "${id}"`);
  return filter;
}

/**
 * The CSS `filter` value for a look, functions in a fixed order since
 * they compose left to right: the colour blends first, then the tone.
 * Unchanged parts are left out, and an unchanged look is `none`.
 */
export function cssFilter(filter: FilterId | Look): string {
  const look = typeof filter === "string" ? filterById(filter).look : filter;
  const parts = [
    look.grayscale !== 0 && `grayscale(${look.grayscale})`,
    look.sepia !== 0 && `sepia(${look.sepia})`,
    look.saturate !== 1 && `saturate(${look.saturate})`,
    look.contrast !== 1 && `contrast(${look.contrast})`,
    look.brightness !== 1 && `brightness(${look.brightness})`,
  ].filter((p): p is string => typeof p === "string");
  return parts.length ? parts.join(" ") : "none";
}

/**
 * The filters the booth offers, from the stored setting: anything that
 * is not a filter is dropped, duplicates collapse, the order is the
 * catalogue's, and an empty choice means the camera's own colours, so
 * the kiosk always has one to use.
 */
export function offeredFilters(stored: readonly unknown[]): FilterId[] {
  const chosen = new Set(stored.filter(isFilterId));
  const offered = FILTER_IDS.filter((id) => chosen.has(id));
  return offered.length ? offered : [DEFAULT_FILTER];
}

/** Whether the kiosk asks: only when there is more than one to pick from. */
export function needsFilterChoice(offered: readonly FilterId[]): boolean {
  return offered.length > 1;
}

/** The filter a session gets when the guest was not asked: the camera's colours if offered, else the first on offer. */
export function defaultFilter(offered: readonly FilterId[]): FilterId {
  return offered.includes(DEFAULT_FILTER) ? DEFAULT_FILTER : (offered[0] ?? DEFAULT_FILTER);
}

/**
 * One step of a look, as the Filter Effects spec defines the CSS
 * function: a 3 x 3 colour matrix (grayscale, sepia, saturate), or a
 * per-channel line `v * slope + intercept` (contrast, brightness), on
 * sRGB values from 0 to 1.
 */
export type LookStep =
  | { kind: "matrix"; m: readonly [number, number, number, number, number, number, number, number, number] }
  | { kind: "linear"; slope: number; intercept: number };

/** The steps of a look in the order `cssFilter` writes them, unchanged ones left out. */
export function lookSteps(look: Look): LookStep[] {
  const steps: LookStep[] = [];
  if (look.grayscale !== 0) {
    const a = 1 - clamp01(look.grayscale);
    steps.push({
      kind: "matrix",
      m: [
        0.2126 + 0.7874 * a, 0.7152 - 0.7152 * a, 0.0722 - 0.0722 * a,
        0.2126 - 0.2126 * a, 0.7152 + 0.2848 * a, 0.0722 - 0.0722 * a,
        0.2126 - 0.2126 * a, 0.7152 - 0.7152 * a, 0.0722 + 0.9278 * a,
      ],
    });
  }
  if (look.sepia !== 0) {
    const a = 1 - clamp01(look.sepia);
    steps.push({
      kind: "matrix",
      m: [
        0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a,
        0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a,
        0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a,
      ],
    });
  }
  if (look.saturate !== 1) {
    const s = Math.max(0, look.saturate);
    steps.push({
      kind: "matrix",
      m: [
        0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
        0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
        0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
      ],
    });
  }
  if (look.contrast !== 1) {
    const c = Math.max(0, look.contrast);
    steps.push({ kind: "linear", slope: c, intercept: 0.5 - 0.5 * c });
  }
  if (look.brightness !== 1) {
    steps.push({ kind: "linear", slope: Math.max(0, look.brightness), intercept: 0 });
  }
  return steps;
}

/**
 * Applies a look to 8-bit sRGB pixels in place, the way a browser draws
 * the CSS filter: each step in turn, clamped to 0..1 after every one
 * (the spec's filter primitives clamp, and a saturated red pushed past
 * white by one step must not come back from it in the next), and back
 * to 8 bits by truncating, which is what Chromium does: measured on its
 * canvas, this lands within one level of it on every look (the tests
 * hold the numbers). `channels` is 3 or 4; alpha is left alone.
 */
export function applyLook(data: Uint8Array | Uint8ClampedArray, channels: 3 | 4, filter: FilterId | Look): void {
  const look = typeof filter === "string" ? filterById(filter).look : filter;
  const steps = lookSteps(look);
  if (steps.length === 0) return;
  if (data.length % channels !== 0) throw new Error(`${data.length} bytes is not a whole number of ${channels}-channel pixels`);
  for (let p = 0; p < data.length; p += channels) {
    let r = data[p]! / 255;
    let g = data[p + 1]! / 255;
    let b = data[p + 2]! / 255;
    for (const step of steps) {
      if (step.kind === "matrix") {
        const m = step.m;
        const nr = m[0] * r + m[1] * g + m[2] * b;
        const ng = m[3] * r + m[4] * g + m[5] * b;
        const nb = m[6] * r + m[7] * g + m[8] * b;
        r = clamp01(nr);
        g = clamp01(ng);
        b = clamp01(nb);
      } else {
        r = clamp01(r * step.slope + step.intercept);
        g = clamp01(g * step.slope + step.intercept);
        b = clamp01(b * step.slope + step.intercept);
      }
    }
    data[p] = Math.floor(r * 255);
    data[p + 1] = Math.floor(g * 255);
    data[p + 2] = Math.floor(b * 255);
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
