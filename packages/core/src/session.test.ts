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
        expect(taken.state.phase).toBe("composing");
        expect(kinds(taken.effects)).toEqual(["compose", "timeout"]);
      }
      state = taken.state;
    }

    const review = step(state, { type: "composed" });
    expect(review.state.phase).toBe("review");
    expect(kinds(review.effects)).toEqual(["timeout"]);

    const delivering = step(review.state, { type: "accepted" });
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

  it("a one-shot layout composes straight after the first shot", () => {
    const { state } = start(1);
    const fired = step(state, { type: "countdown_elapsed", shot: 1 });
    const taken = step(fired.state, { type: "shot_taken", shot: 1 });
    expect(taken.state.phase).toBe("composing");
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
  it("cannot accept before the composite exists", () => {
    const { state } = start();
    expect(transition(state, { type: "accepted" }, T0)).toMatchObject({ ok: false });
  });

  it("cannot finish twice", () => {
    const { state } = start(1);
    const s = [
      { type: "countdown_elapsed", shot: 1 },
      { type: "shot_taken", shot: 1 },
      { type: "composed" },
      { type: "accepted" },
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
      { type: "composed" },
      { type: "accepted" },
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
      { type: "compose_failed", reason: "sharp blew up" },
    ].reduce((st, ev) => step(st, ev as SessionEvent).state, state);
    expect(s.phase).toBe("failed");
    expect(s.reason).toBe("sharp blew up");
  });
});

describe("timeouts move a stalled session along", () => {
  function atReview() {
    const { state } = start(1);
    return [
      { type: "countdown_elapsed", shot: 1 },
      { type: "shot_taken", shot: 1 },
      { type: "composed" },
    ].reduce((st, ev) => step(st, ev as SessionEvent).state, state);
  }

  it("arms the review timeout for the documented duration", () => {
    const { state } = start(1);
    const composing = step(
      step(state, { type: "countdown_elapsed", shot: 1 }).state,
      { type: "shot_taken", shot: 1 },
    );
    const review = step(composing.state, { type: "composed" }, T0);
    expect(review.effects).toEqual([
      { kind: "timeout", phase: "review", shot: 1, at: later(TIMEOUTS_MS.review) },
    ]);
  });

  it("a guest who walks away from the review still gets a print and a QR", () => {
    const timed = step(atReview(), { type: "timed_out", phase: "review", shot: 1 });
    expect(timed.state.phase).toBe("delivering");
    expect(kinds(timed.effects)).toEqual(["print", "sync", "timeout"]);
  });

  it("a QR screen nobody dismissed goes back to idle", () => {
    const delivering = step(atReview(), { type: "accepted" }).state;
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
