import { describe, expect, it } from "vitest";
import {
  MAX_SHOT_ATTEMPTS,
  TIMEOUTS_MS,
  beginSession,
  transition,
  type Effect,
  type SessionEvent,
  type SessionState,
} from "./session";

const T0 = new Date("2027-03-20T19:00:00.000Z");
const later = (ms: number) => new Date(T0.getTime() + ms);

function start(shotCount = 4, countdownSeconds = 5) {
  return beginSession({ shotCount, countdownSeconds }, T0);
}

/** Apply a command, asserting the machine accepted it as a real move. */
function step(state: SessionState, event: SessionEvent, now = T0) {
  const result = transition(state, event, now);
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  if (result.stale) throw new Error(`stale: ${event.type} in ${state.phase}`);
  return result;
}

const kinds = (effects: Effect[]) => effects.map((e) => e.kind);

describe("beginSession", () => {
  it("starts counting down to the first shot", () => {
    const { state, effects } = start();
    expect(state.phase).toBe("countdown");
    expect(state.shot).toBe(1);
    expect(state.takenCount).toBe(0);
    expect(state.countdownEndsAt).toBe(later(5000).toISOString());
    expect(effects).toEqual([{ kind: "countdown", shot: 1, at: later(5000) }]);
  });

  it("refuses a layout with no slots", () => {
    expect(() => beginSession({ shotCount: 0, countdownSeconds: 5 }, T0)).toThrow(/at least one shot/);
  });
});

describe("the happy path", () => {
  it("walks four shots through to done", () => {
    let { state } = start(4);
    for (let shot = 1; shot <= 4; shot++) {
      const fired = step(state, { type: "countdown_elapsed", shot });
      expect(fired.state.phase).toBe("capturing");
      expect(fired.state.countdownEndsAt).toBeNull();
      expect(kinds(fired.effects)).toEqual(["capture", "timeout"]);

      const taken = step(fired.state, { type: "shot_taken", shot });
      expect(taken.state.takenCount).toBe(shot);
      if (shot < 4) {
        expect(taken.state.phase).toBe("countdown");
        expect(taken.state.shot).toBe(shot + 1);
        expect(kinds(taken.effects)).toEqual(["countdown"]);
      } else {
        expect(taken.state.phase).toBe("review");
        expect(kinds(taken.effects)).toEqual(["timeout"]);
      }
      state = taken.state;
    }

    // Accepting settles the look; the compositor runs on it.
    const composing = step(state, { type: "accepted" });
    expect(composing.state.phase).toBe("composing");
    expect(composing.state.print).toBeNull();
    expect(kinds(composing.effects)).toEqual(["compose", "timeout"]);

    const delivering = step(composing.state, { type: "composed" });
    expect(delivering.state.phase).toBe("delivering");
    expect(delivering.state.print).toBe("pending");
    expect(kinds(delivering.effects)).toEqual(["print", "sync", "timeout"]);

    const printing = step(delivering.state, { type: "print_started" });
    expect(printing.state.print).toBe("printing");
    const printed = step(printing.state, { type: "printed" });
    expect(printed.state.print).toBe("printed");
    expect(printed.state.phase).toBe("delivering");

    const done = step(printed.state, { type: "finished" });
    expect(done.state.phase).toBe("done");
    expect(done.effects).toEqual([]);
  });

  it("a one-shot layout goes to the review straight after the first shot", () => {
    const { state } = start(1);
    const fired = step(state, { type: "countdown_elapsed", shot: 1 });
    const taken = step(fired.state, { type: "shot_taken", shot: 1 });
    expect(taken.state.phase).toBe("review");
  });
});

describe("stale timing events", () => {
  it("ignores a countdown that fired for an earlier shot", () => {
    const { state } = start();
    const fired = step(state, { type: "countdown_elapsed", shot: 1 });
    const next = step(fired.state, { type: "shot_taken", shot: 1 });
    const result = transition(next.state, { type: "countdown_elapsed", shot: 1 }, T0);
    expect(result).toMatchObject({ ok: true, stale: true, effects: [] });
  });

  it("ignores a timeout armed for a phase the session has left", () => {
    const { state } = start();
    const fired = step(state, { type: "countdown_elapsed", shot: 1 });
    const taken = step(fired.state, { type: "shot_taken", shot: 1 });
    const result = transition(taken.state, { type: "timed_out", phase: "capturing", shot: 1 }, T0);
    expect(result).toMatchObject({ ok: true, stale: true });
    expect(result.ok && result.state).toBe(taken.state);
  });

  it("ignores a countdown after the session was cancelled", () => {
    const { state } = start();
    const cancelled = step(state, { type: "cancelled", reason: "guest tapped back" });
    expect(cancelled.state.phase).toBe("abandoned");
    expect(cancelled.state.countdownEndsAt).toBeNull();
    expect(transition(cancelled.state, { type: "countdown_elapsed", shot: 1 }, T0)).toMatchObject({ stale: true });
  });
});

describe("commands in the wrong phase are refused", () => {
  it("cannot accept before the photos are taken", () => {
    const { state } = start();
    expect(transition(state, { type: "accepted" }, T0)).toMatchObject({ ok: false });
  });

  it("cannot be composed except after the review", () => {
    expect(transition(start().state, { type: "composed" }, T0)).toMatchObject({ ok: false });
    expect(transition(reviewing(), { type: "composed" }, T0)).toMatchObject({ ok: false });
    const delivering = step(step(reviewing(), { type: "accepted" }).state, { type: "composed" }).state;
    expect(transition(delivering, { type: "composed" }, T0)).toMatchObject({ ok: false });
  });

  it("cannot accept twice", () => {
    const composing = step(reviewing(), { type: "accepted" }).state;
    expect(transition(composing, { type: "accepted" }, T0)).toMatchObject({ ok: false });
    expect(transition(composing, { type: "retake" }, T0)).toMatchObject({ ok: false });
  });

  it("cannot finish twice", () => {
    const { state } = start(1);
    const s = [
      { type: "countdown_elapsed", shot: 1 },
      { type: "shot_taken", shot: 1 },
      { type: "accepted" },
      { type: "composed" },
      { type: "finished" },
    ].reduce((st, ev) => step(st, ev as SessionEvent).state, state);
    expect(s.phase).toBe("done");
    expect(transition(s, { type: "finished" }, T0)).toMatchObject({ ok: false });
    expect(transition(s, { type: "cancelled", reason: "x" }, T0)).toMatchObject({ ok: false });
  });

  it("refuses a shot for the wrong index rather than silently dropping it", () => {
    const { state } = start();
    const fired = step(state, { type: "countdown_elapsed", shot: 1 });
    expect(transition(fired.state, { type: "shot_taken", shot: 2 }, T0)).toMatchObject({ ok: false });
  });
});

describe("failures", () => {
  it("retries a failed shot with a fresh countdown", () => {
    const { state } = start();
    const fired = step(state, { type: "countdown_elapsed", shot: 1 });
    const retry = step(fired.state, { type: "shot_failed", shot: 1, reason: "usb" }, later(1000));
    expect(retry.state.phase).toBe("countdown");
    expect(retry.state.shot).toBe(1);
    expect(retry.state.attempts).toBe(1);
    expect(retry.state.countdownEndsAt).toBe(later(6000).toISOString());
    expect(kinds(retry.effects)).toEqual(["countdown"]);
  });

  it("gives up after the maximum attempts", () => {
    let { state } = start();
    for (let attempt = 1; attempt < MAX_SHOT_ATTEMPTS; attempt++) {
      state = step(state, { type: "countdown_elapsed", shot: 1 }).state;
      state = step(state, { type: "shot_failed", shot: 1, reason: "usb" }).state;
      expect(state.phase).toBe("countdown");
    }
    state = step(state, { type: "countdown_elapsed", shot: 1 }).state;
    const dead = step(state, { type: "timed_out", phase: "capturing", shot: 1 });
    expect(dead.state.phase).toBe("failed");
    expect(dead.state.reason).toMatch(/did not answer/);
    expect(dead.effects).toEqual([]);
  });

  it("resets the attempt counter once a shot lands", () => {
    const { state } = start();
    const fired = step(state, { type: "countdown_elapsed", shot: 1 });
    const retry = step(fired.state, { type: "shot_failed", shot: 1, reason: "usb" });
    const fired2 = step(retry.state, { type: "countdown_elapsed", shot: 1 });
    const taken = step(fired2.state, { type: "shot_taken", shot: 1 });
    expect(taken.state.attempts).toBe(0);
  });

  it("a print failure keeps the QR screen up", () => {
    const { state } = start(1);
    const s = [
      { type: "countdown_elapsed", shot: 1 },
      { type: "shot_taken", shot: 1 },
      { type: "accepted" },
      { type: "composed" },
      { type: "print_failed", reason: "jam" },
    ].reduce((st, ev) => step(st, ev as SessionEvent).state, state);
    expect(s.phase).toBe("delivering");
    expect(s.print).toBe("failed");
  });

  it("a compose failure fails the session", () => {
    const { state } = start(1);
    const s = [
      { type: "countdown_elapsed", shot: 1 },
      { type: "shot_taken", shot: 1 },
      { type: "accepted" },
      { type: "compose_failed", reason: "sharp blew up" },
    ].reduce((st, ev) => step(st, ev as SessionEvent).state, state);
    expect(s.phase).toBe("failed");
    expect(s.reason).toBe("sharp blew up");
  });

  it("a compose failure after the session moved on is ignored", () => {
    expect(transition(reviewing(), { type: "compose_failed", reason: "late" }, T0)).toMatchObject({ ok: true, stale: true });
  });
});

describe("timeouts move a stalled session along", () => {
  function atReview() {
    const { state } = start(1);
    return [
      { type: "countdown_elapsed", shot: 1 },
      { type: "shot_taken", shot: 1 },
    ].reduce((st, ev) => step(st, ev as SessionEvent).state, state);
  }

  it("arms the review timeout for the documented duration", () => {
    const { state } = start(1);
    const review = step(step(state, { type: "countdown_elapsed", shot: 1 }).state, { type: "shot_taken", shot: 1 }, T0);
    expect(review.effects).toEqual([
      { kind: "timeout", phase: "review", shot: 1, at: later(TIMEOUTS_MS.review) },
    ]);
  });

  it("a guest who walks away from the review still gets a print and a QR", () => {
    const timed = step(atReview(), { type: "timed_out", phase: "review", shot: 1 });
    expect(timed.state.phase).toBe("composing");
    expect(timed.effects).toEqual([
      { kind: "compose" },
      { kind: "timeout", phase: "composing", shot: 1, at: later(TIMEOUTS_MS.composing) },
    ]);
    const delivering = step(timed.state, { type: "composed" });
    expect(delivering.state.phase).toBe("delivering");
    expect(kinds(delivering.effects)).toEqual(["print", "sync", "timeout"]);
  });

  it("a review timeout after the guest accepted is stale", () => {
    const composing = step(atReview(), { type: "accepted" }).state;
    expect(transition(composing, { type: "timed_out", phase: "review", shot: 1 }, T0)).toMatchObject({ stale: true });
  });

  it("a compositor that never answers fails the session", () => {
    const composing = step(atReview(), { type: "accepted" }).state;
    const timed = step(composing, { type: "timed_out", phase: "composing", shot: 1 });
    expect(timed.state.phase).toBe("failed");
    expect(timed.state.reason).toMatch(/did not finish in time/);
  });

  it("the guest can still walk away while the photos are put together", () => {
    const composing = step(atReview(), { type: "accepted" }).state;
    expect(step(composing, { type: "cancelled", reason: "guest tapped back" }).state.phase).toBe("abandoned");
  });

  it("a QR screen nobody dismissed goes back to idle", () => {
    const delivering = step(step(atReview(), { type: "accepted" }).state, { type: "composed" }).state;
    const timed = step(delivering, { type: "timed_out", phase: "delivering", shot: 1 });
    expect(timed.state.phase).toBe("done");
  });

  it("retake goes back to the first shot", () => {
    const retake = step(atReview(), { type: "retake" });
    expect(retake.state.phase).toBe("countdown");
    expect(retake.state.shot).toBe(1);
    expect(retake.state.takenCount).toBe(0);
  });
});

/** A one-shot session on the review screen. */
function reviewing() {
  let { state } = start(1);
  state = step(state, { type: "countdown_elapsed", shot: 1 }).state;
  return step(state, { type: "shot_taken", shot: 1 }).state;
}

describe("filter_chosen", () => {
  it("starts in the camera's colours unless told otherwise", () => {
    expect(start().state.filter).toBe("colour");
    expect(beginSession({ shotCount: 1, countdownSeconds: 5, filter: "mono" }, T0).state.filter).toBe("mono");
  });

  it("changes the look on the review screen, as often as the guest likes, with nothing to do", () => {
    const state = reviewing();
    const once = step(state, { type: "filter_chosen", filter: "mono" });
    expect(once.state.filter).toBe("mono");
    expect(once.state.phase).toBe("review");
    expect(once.effects).toEqual([]);
    expect(step(once.state, { type: "filter_chosen", filter: "pop" }).state.filter).toBe("pop");
  });

  it("is refused anywhere else", () => {
    const { state } = start();
    expect(transition(state, { type: "filter_chosen", filter: "mono" }, T0)).toMatchObject({ ok: false });
    const composing = step(reviewing(), { type: "accepted" }).state;
    expect(transition(composing, { type: "filter_chosen", filter: "mono" }, T0)).toMatchObject({ ok: false });
  });

  it("survives a retake and the rest of the session", () => {
    const chosen = step(reviewing(), { type: "filter_chosen", filter: "vintage" }).state;
    expect(step(chosen, { type: "retake" }).state.filter).toBe("vintage");
    expect(step(chosen, { type: "accepted" }).state.filter).toBe("vintage");
  });
});

describe("mirror_chosen", () => {
  it("starts the right way round", () => {
    expect(start().state.mirrored).toBe(false);
  });

  it("flips the photos on the review screen, and back, with nothing to do", () => {
    const state = reviewing();
    const flipped = step(state, { type: "mirror_chosen", mirrored: true });
    expect(flipped.state.mirrored).toBe(true);
    expect(flipped.state.phase).toBe("review");
    expect(flipped.effects).toEqual([]);
    expect(step(flipped.state, { type: "mirror_chosen", mirrored: false }).state.mirrored).toBe(false);
  });

  it("is refused anywhere else", () => {
    const { state } = start();
    expect(transition(state, { type: "mirror_chosen", mirrored: true }, T0)).toMatchObject({ ok: false });
    const composing = step(reviewing(), { type: "accepted" }).state;
    expect(transition(composing, { type: "mirror_chosen", mirrored: true }, T0)).toMatchObject({ ok: false });
  });

  it("survives a retake and the rest of the session", () => {
    const flipped = step(reviewing(), { type: "mirror_chosen", mirrored: true }).state;
    expect(step(flipped, { type: "retake" }).state.mirrored).toBe(true);
    expect(step(flipped, { type: "accepted" }).state.mirrored).toBe(true);
  });
});
