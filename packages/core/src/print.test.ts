import { describe, expect, it } from "vitest";
import { PRINT_PX, mmToPx, printBlocker } from "./print";

describe("print dimensions", () => {
  it("is the postcard at 300 dpi", () => {
    expect(PRINT_PX).toEqual({ width: 1748, height: 1181 });
  });

  it("rounds millimetres to whole pixels", () => {
    expect(mmToPx(10)).toBe(118);
    expect(mmToPx(25.4)).toBe(300);
  });
});

describe("printBlocker", () => {
  it("lets a print go while there is paper and ink", () => {
    expect(printBlocker({ paperLeft: 1, inkLeft: 1 })).toBeNull();
  });

  it("stops at an empty tray or a spent cassette, the cassette first", () => {
    expect(printBlocker({ paperLeft: 0, inkLeft: 10 })).toBe("The paper tray is empty");
    expect(printBlocker({ paperLeft: 5, inkLeft: 0 })).toBe("The ink cassette is used up");
    expect(printBlocker({ paperLeft: 0, inkLeft: 0 })).toBe("The ink cassette is used up");
  });
});
