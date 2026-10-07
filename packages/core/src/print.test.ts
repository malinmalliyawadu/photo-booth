import { describe, expect, it } from "vitest";
import { PRINT_PX, mmToPx } from "./print";

describe("print dimensions", () => {
  it("is the postcard at 300 dpi", () => {
    expect(PRINT_PX).toEqual({ width: 1748, height: 1181 });
  });

  it("rounds millimetres to whole pixels", () => {
    expect(mmToPx(10)).toBe(118);
    expect(mmToPx(25.4)).toBe(300);
  });
});
