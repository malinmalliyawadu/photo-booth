import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTER,
  FILTERS,
  FILTER_IDS,
  UNCHANGED,
  cssFilter,
  defaultFilter,
  filterById,
  isFilterId,
  needsFilterChoice,
  offeredFilters,
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
