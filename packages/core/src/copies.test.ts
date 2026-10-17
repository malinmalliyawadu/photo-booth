import { describe, expect, it } from "vitest";
import { GUEST_COPY_RESERVE, GUEST_COPY_WINDOW_MS, copiesLeft, copyRefusal, isFindable, type CopyBooth, type CopySession } from "./copies";

const now = new Date("2027-03-20T22:00:00Z");

const session = (over: Partial<CopySession> = {}): CopySession => ({
  phase: "done",
  composed: true,
  deleted: false,
  createdAt: new Date(now.getTime() - 60 * 60_000),
  guestCopies: 0,
  ...over,
});

const booth = (over: Partial<CopyBooth> = {}): CopyBooth => ({
  guestCopyLimit: 1,
  paperLeft: 18,
  inkLeft: 36,
  pendingPrints: 0,
  printerDown: false,
  ...over,
});

describe("isFindable", () => {
  it("offers a finished, composed print from tonight", () => {
    expect(isFindable(session(), now)).toBe(true);
  });

  it("hides a session still in progress, one that failed or was abandoned, and one with no postcard", () => {
    for (const phase of ["countdown", "review", "composing", "delivering", "failed", "abandoned"] as const) {
      expect(isFindable(session({ phase }), now), phase).toBe(false);
    }
    expect(isFindable(session({ composed: false }), now)).toBe(false);
  });

  it("hides a session deleted on request", () => {
    expect(isFindable(session({ deleted: true }), now)).toBe(false);
  });

  it("hides a print from an earlier party", () => {
    const edge = new Date(now.getTime() - GUEST_COPY_WINDOW_MS);
    expect(isFindable(session({ createdAt: edge }), now)).toBe(true);
    expect(isFindable(session({ createdAt: new Date(edge.getTime() - 1) }), now)).toBe(false);
    expect(isFindable(session({ createdAt: edge.toISOString() }), now)).toBe(true);
  });
});

describe("copiesLeft", () => {
  it("counts down from the limit and stops at zero", () => {
    expect(copiesLeft(2, { guestCopies: 0 })).toBe(2);
    expect(copiesLeft(2, { guestCopies: 1 })).toBe(1);
    expect(copiesLeft(2, { guestCopies: 2 })).toBe(0);
    // The attendant lowered the limit after a guest had two.
    expect(copiesLeft(1, { guestCopies: 2 })).toBe(0);
  });
});

describe("copyRefusal", () => {
  it("lets a copy go with the booth stocked and the print untouched", () => {
    expect(copyRefusal(booth(), session(), now)).toBeNull();
  });

  it("refuses everything while copies are switched off", () => {
    expect(copyRefusal(booth({ guestCopyLimit: 0 }), session(), now)).toBe("Copies are not on offer right now");
  });

  it("refuses a print a guest could not have found", () => {
    expect(copyRefusal(booth(), session({ deleted: true }), now)).toBe("That print is not available");
    expect(copyRefusal(booth(), session({ phase: "delivering" }), now)).toBe("That print is not available");
  });

  it("refuses once the session has had its copies, in words that count them", () => {
    expect(copyRefusal(booth(), session({ guestCopies: 1 }), now)).toBe("This print has had its copy");
    expect(copyRefusal(booth({ guestCopyLimit: 2 }), session({ guestCopies: 1 }), now)).toBeNull();
    expect(copyRefusal(booth({ guestCopyLimit: 2 }), session({ guestCopies: 2 }), now)).toBe("This print has had its 2 copies");
  });

  it("says the session has had its copies before it blames the printer", () => {
    expect(copyRefusal(booth({ printerDown: true, paperLeft: 0 }), session({ guestCopies: 1 }), now)).toBe("This print has had its copy");
  });

  it("refuses while the printer is down or empty", () => {
    expect(copyRefusal(booth({ printerDown: true }), session(), now)).toMatch(/not answering/);
    expect(copyRefusal(booth({ paperLeft: 0 }), session(), now)).toMatch(/needs a refill/);
    expect(copyRefusal(booth({ inkLeft: 0 }), session(), now)).toMatch(/needs a refill/);
  });

  it("keeps the last cards for new sessions, counting the prints already queued", () => {
    const enough = GUEST_COPY_RESERVE + 1;
    expect(copyRefusal(booth({ paperLeft: enough }), session(), now)).toBeNull();
    expect(copyRefusal(booth({ paperLeft: enough - 1 }), session(), now)).toMatch(/kept for new photos/);
    expect(copyRefusal(booth({ inkLeft: enough - 1 }), session(), now)).toMatch(/kept for new photos/);
    expect(copyRefusal(booth({ paperLeft: enough + 1, pendingPrints: 1 }), session(), now)).toBeNull();
    expect(copyRefusal(booth({ paperLeft: enough + 1, pendingPrints: 2 }), session(), now)).toMatch(/kept for new photos/);
  });
});
