/**
 * The filters a guest can pick: one look for every photo in a session.
 *
 * The shots on disk stay exactly as the camera took them. The filter is
 * stored on the session and applied wherever the photos are drawn: by
 * the browser today (`Composite`, the live preview) and by phase 2's
 * compositor for the print and web JPEGs. One definition, two renderers,
 * so the print matches what the guest saw on the screen.
 */

export type FilterId = "colour" | "mono" | "vintage" | "faded" | "pop";

/**
 * A look as adjustments on the camera's frame. `grayscale` and `sepia`
 * are blends from 0 (off) to 1; the rest are multipliers where 1 means
 * unchanged. Each is a CSS filter function of the same name, and sharp
 * has an equivalent for the compositor: `grayscale()`, a `recomb()` of
 * the sepia matrix, `modulate()` for saturation and brightness, and
 * `linear(c, 128 * (1 - c))` for contrast.
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
