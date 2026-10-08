import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTER,
  FILTERS,
  FILTER_IDS,
  UNCHANGED,
  applyLook,
  cssFilter,
  defaultFilter,
  filterById,
  isFilterId,
  needsFilterChoice,
  offeredFilters,
  type Look,
} from "./filters";

describe("the catalogue", () => {
  it("has unique ids and names", () => {
    expect(new Set(FILTER_IDS).size).toBe(FILTERS.length);
    expect(new Set(FILTERS.map((f) => f.name)).size).toBe(FILTERS.length);
  });

  it("offers the camera's own colours as the default, unchanged", () => {
    expect(filterById(DEFAULT_FILTER).look).toEqual(UNCHANGED);
  });

  it("recognises its ids and nothing else", () => {
    expect(isFilterId("mono")).toBe(true);
    expect(isFilterId("sepia")).toBe(false);
    expect(isFilterId(1)).toBe(false);
    expect(() => filterById("sepia" as never)).toThrow(/Unknown filter/);
  });
});

describe("cssFilter", () => {
  it("is none when nothing changes", () => {
    expect(cssFilter("colour")).toBe("none");
    expect(cssFilter(UNCHANGED)).toBe("none");
  });

  it("leaves out the unchanged parts", () => {
    expect(cssFilter("mono")).toBe("grayscale(1) contrast(1.08) brightness(1.02)");
    expect(cssFilter("pop")).toBe("saturate(1.45) contrast(1.12)");
  });

  it("blends colour before adjusting tone, whatever order the look lists them", () => {
    expect(cssFilter({ brightness: 1.1, contrast: 0.9, saturate: 0.8, sepia: 0.2, grayscale: 0.5 })).toBe(
      "grayscale(0.5) sepia(0.2) saturate(0.8) contrast(0.9) brightness(1.1)",
    );
  });
});

describe("offeredFilters", () => {
  it("keeps the catalogue's order whatever order they were saved in", () => {
    expect(offeredFilters(["pop", "colour", "mono"])).toEqual(["colour", "mono", "pop"]);
  });

  it("drops what is not a filter and collapses duplicates", () => {
    expect(offeredFilters(["mono", "sepia", 3, null, "mono"])).toEqual(["mono"]);
  });

  it("never comes back empty", () => {
    expect(offeredFilters([])).toEqual([DEFAULT_FILTER]);
    expect(offeredFilters(["nope"])).toEqual([DEFAULT_FILTER]);
  });
});

describe("choosing for a guest who was not asked", () => {
  it("asks only when there is a choice", () => {
    expect(needsFilterChoice(["mono"])).toBe(false);
    expect(needsFilterChoice(["colour", "mono"])).toBe(true);
  });

  it("prefers the camera's colours, else the first on offer", () => {
    expect(defaultFilter(["mono", "colour"])).toBe("colour");
    expect(defaultFilter(["vintage", "pop"])).toBe("vintage");
    expect(defaultFilter([])).toBe(DEFAULT_FILTER);
  });
});

describe("applyLook", () => {
  const COLOURS = [[200, 40, 30], [250, 200, 10], [20, 120, 240], [128, 128, 128], [240, 240, 240], [10, 10, 10]];

  /**
   * What Chromium draws for each colour above through the CSS filter
   * (a canvas with `ctx.filter`, read back with getImageData). The
   * compositor must land within one level of it, which is rounding.
   */
  const BROWSER: { css: string; look: Look; expected: number[][] }[] = [
    { css: "saturate(1.45)", look: { ...UNCHANGED, saturate: 1.45 }, expected: [[255, 25, 10], [255, 201, 0], [0, 126, 255], [128, 128, 128], [240, 240, 240], [10, 10, 10]] },
    { css: "contrast(1.12)", look: { ...UNCHANGED, contrast: 1.12 }, expected: [[208, 29, 18], [255, 208, 0], [7, 119, 253], [128, 128, 128], [253, 253, 253], [0, 0, 0]] },
    { css: "sepia(0.55)", look: { ...UNCHANGED, sepia: 0.55 }, expected: [[153, 74, 57], [252, 214, 101], [89, 125, 164], [153, 142, 124], [255, 255, 232], [12, 11, 10]] },
    { css: "grayscale(1)", look: { ...UNCHANGED, grayscale: 1 }, expected: [[73, 73, 73], [197, 197, 197], [107, 107, 107], [128, 128, 128], [240, 240, 240], [10, 10, 10]] },
    { css: "brightness(1.1)", look: { ...UNCHANGED, brightness: 1.1 }, expected: [[220, 44, 33], [255, 220, 11], [22, 132, 255], [140, 140, 140], [255, 255, 255], [11, 11, 11]] },
    { css: "saturate(3) brightness(0.5)", look: { ...UNCHANGED, saturate: 3, brightness: 0.5 }, expected: [[127, 0, 0], [127, 103, 0], [0, 72, 127], [64, 64, 64], [120, 120, 120], [5, 5, 5]] },
    { css: cssFilter("pop"), look: filterById("pop").look, expected: [[255, 12, 0], [255, 209, 0], [0, 125, 255], [128, 128, 128], [253, 253, 253], [0, 0, 0]] },
    { css: cssFilter("vintage"), look: filterById("vintage").look, expected: [[166, 73, 54], [255, 223, 92], [88, 130, 174], [160, 147, 125], [255, 255, 241], [9, 8, 7]] },
    { css: cssFilter("mono"), look: filterById("mono").look, expected: [[69, 69, 69], [206, 206, 206], [107, 107, 107], [130, 130, 130], [253, 253, 253], [0, 0, 0]] },
    { css: cssFilter("faded"), look: filterById("faded").look, expected: [[171, 70, 62], [246, 212, 91], [71, 132, 202], [146, 144, 139], [255, 255, 248], [26, 26, 26]] },
  ];

  it.each(BROWSER)("matches the browser's $css", ({ look, expected }) => {
    const pixels = new Uint8Array(COLOURS.flat());
    applyLook(pixels, 3, look);
    const got = [...pixels];
    expected.flat().forEach((want, i) => expect(Math.abs(got[i]! - want), `channel ${i}: ${got[i]} vs ${want}`).toBeLessThanOrEqual(1));
  });

  it("clamps after every step, as the browser does", () => {
    // Saturating a red past white and halving it gives half-red, not the
    // overflow halved: the browser's 127, where one combined matrix
    // would give 255.
    const pixels = new Uint8Array([200, 40, 30]);
    applyLook(pixels, 3, { ...UNCHANGED, saturate: 3, brightness: 0.5 });
    expect(pixels[0]).toBeLessThanOrEqual(128);
  });

  it("leaves the camera's colours and alpha alone", () => {
    const pixels = new Uint8Array([200, 40, 30, 77, 1, 2, 3, 0]);
    applyLook(pixels, 4, "colour");
    expect([...pixels]).toEqual([200, 40, 30, 77, 1, 2, 3, 0]);
    applyLook(pixels, 4, "mono");
    expect(pixels[3]).toBe(77);
    expect(pixels[7]).toBe(0);
    expect(pixels[0]).toBe(pixels[1]);
  });

  it("refuses a buffer that is not whole pixels", () => {
    expect(() => applyLook(new Uint8Array(4), 3, "mono")).toThrow(/whole number/);
  });
});
