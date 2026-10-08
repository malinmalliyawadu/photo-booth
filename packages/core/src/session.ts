/**
 * The session state machine.
 *
 * A session is one visit to the booth: a guest picks a layout, poses
 * through a countdown once per photo slot, sees the result, and gets a
 * print and a QR code. This module decides what happens next; it never
 * touches the database, the camera or the clock. The booth app and the
 * worker both call `transition`, persist the state it returns and enqueue
 * the effects as jobs, so the two processes cannot disagree about what a
 * session is allowed to do.
 *
 *   countdown ─(countdown_elapsed)─▶ capturing ─(shot_taken)─▶ countdown (next shot)
 *                                        │                 └─▶ review (last shot)
 *                                        └─(shot_failed)─▶ countdown (retry) | failed
 *   review ─(filter_chosen | mirror_chosen)─▶ review
 *          ├─(retake)─▶ countdown (shot 1)
 *          └─(accepted | timed_out)─▶ composing ─(composed)─▶ delivering ─(finished | timed_out)─▶ done
 *                                               └─(compose_failed | timed_out)─▶ failed
 *
 * The review comes before the compositor because the review is where
 * the guest picks the look and the mirror: the browser draws the photos
 * under the layout with each choice as it is made, and the print and
 * web JPEGs are made once, from what was accepted.
 *
 * Timing events (`countdown_elapsed`, `timed_out`) carry the phase and
 * shot they were armed for and are ignored when the session has moved
 * on, so a stale job is harmless. Command events (`accepted`, `cancelled`
 * ...) in the wrong phase are refused, so a double tap cannot skip a step.
 */

import { DEFAULT_FILTER, type FilterId } from "./filters";

export type Phase =
  | "countdown"
  | "capturing"
  | "composing"
  | "review"
  | "delivering"
  | "done"
  | "abandoned"
  | "failed";

export type PrintStatus = "pending" | "printing" | "printed" | "failed" | "skipped";

export interface SessionState {
  phase: Phase;
  /** How many shots the layout needs. */
  shotCount: number;
  /** The shot being counted down to or captured, 1-based. */
  shot: number;
  /** Shots safely on disk, in order: `takenCount` of `shotCount`. */
  takenCount: number;
  /** Failed attempts at the current shot. */
  attempts: number;
  /** Seconds of countdown before each shot. */
  countdownSeconds: number;
  /** When the current countdown fires, ISO 8601, or null outside `countdown`. */
  countdownEndsAt: string | null;
  /** Null until the photos are put together and the print is queued. */
  print: PrintStatus | null;
  /** Why the session failed or was abandoned, for the admin page. */
  reason: string | null;
  /** The look on the photos, chosen on the review screen; the camera's colours until then. */
  filter: FilterId;
  /** The photos drawn flipped, the way the mirror showed the guest; chosen on the review screen. */
  mirrored: boolean;
}

export type SessionEvent =
  | { type: "countdown_elapsed"; shot: number }
  | { type: "shot_taken"; shot: number }
  | { type: "shot_failed"; shot: number; reason: string }
  | { type: "composed" }
  | { type: "compose_failed"; reason: string }
  | { type: "accepted" }
  | { type: "retake" }
  | { type: "filter_chosen"; filter: FilterId }
  | { type: "mirror_chosen"; mirrored: boolean }
  | { type: "print_started" }
  | { type: "printed" }
  | { type: "print_failed"; reason: string }
  | { type: "print_skipped"; reason: string }
  | { type: "finished" }
  | { type: "cancelled"; reason: string }
  | { type: "timed_out"; phase: Phase; shot: number };

/**
 * What the caller must make happen. Each becomes a job for the worker;
 * `at` is when the job becomes due.
 */
export type Effect =
  | { kind: "countdown"; shot: number; at: Date }
  | { kind: "capture"; shot: number }
  | { kind: "compose" }
  | { kind: "print" }
  | { kind: "sync" }
  | { kind: "timeout"; phase: Phase; shot: number; at: Date };

export type Transition =
  | { ok: true; state: SessionState; effects: Effect[]; stale: false }
  | { ok: true; state: SessionState; effects: []; stale: true }
  | { ok: false; reason: string };

/** How many times one shot may fail before the session gives up. */
export const MAX_SHOT_ATTEMPTS = 3;

/** Phases the booth is busy in: at most one session is active at a time. */
export const ACTIVE_PHASES: readonly Phase[] = [
  "countdown",
  "capturing",
  "composing",
  "review",
  "delivering",
];

/**
 * How long each phase may sit before the machine moves it along. A
 * capture that has not landed is retried; a guest who walked away from
 * the review still gets their print and their photos; a QR screen
 * nobody dismissed returns to the attract loop.
 */
export const TIMEOUTS_MS = {
  capturing: 20_000,
  composing: 60_000,
  review: 60_000,
  delivering: 90_000,
} as const;

export function isActivePhase(phase: Phase): boolean {
  return ACTIVE_PHASES.includes(phase);
}

export function beginSession(
  input: { shotCount: number; countdownSeconds: number; filter?: FilterId },
  now: Date,
): { state: SessionState; effects: Effect[] } {
  if (!Number.isInteger(input.shotCount) || input.shotCount < 1) {
    throw new Error(`A layout needs at least one shot, got ${input.shotCount}`);
  }
  const state: SessionState = {
    phase: "countdown",
    shotCount: input.shotCount,
    shot: 1,
    takenCount: 0,
    attempts: 0,
    countdownSeconds: input.countdownSeconds,
    countdownEndsAt: null,
    print: null,
    reason: null,
    filter: input.filter ?? DEFAULT_FILTER,
    mirrored: false,
  };
  return armCountdown(state, 1, now);
}

export function transition(state: SessionState, event: SessionEvent, now: Date): Transition {
  switch (event.type) {
    case "countdown_elapsed": {
      if (state.phase !== "countdown" || state.shot !== event.shot) return stale(state);
      const next = { ...state, phase: "capturing" as const, countdownEndsAt: null };
      return ok(next, [
        { kind: "capture", shot: state.shot },
        timeout(next, now),
      ]);
    }

    case "shot_taken": {
      if (state.phase !== "capturing" || state.shot !== event.shot) {
        return refuse(`shot ${event.shot} taken in ${describe(state)}`);
      }
      const takenCount = state.takenCount + 1;
      if (takenCount < state.shotCount) {
        return armCountdownTransition({ ...state, takenCount, attempts: 0 }, state.shot + 1, now);
      }
      const next = { ...state, phase: "review" as const, takenCount, attempts: 0 };
      return ok(next, [timeout(next, now)]);
    }

    case "shot_failed": {
      if (state.phase !== "capturing" || state.shot !== event.shot) return stale(state);
      return retryOrFail(state, event.reason, now);
    }

    case "composed": {
      if (state.phase !== "composing") return refuse(`composed in ${describe(state)}`);
      return deliver(state, now);
    }

    case "compose_failed": {
      if (state.phase !== "composing") return stale(state);
      return ok({ ...state, phase: "failed", reason: event.reason }, []);
    }

    case "accepted": {
      if (state.phase !== "review") return refuse(`accepted in ${describe(state)}`);
      return compose(state, now);
    }

    case "retake": {
      if (state.phase !== "review") return refuse(`retake in ${describe(state)}`);
      return armCountdownTransition({ ...state, takenCount: 0, attempts: 0 }, 1, now);
    }

    // The guest compares the looks on the review screen, and flips the
    // photos to match the mirror they posed in. Once accepted the photos
    // are put together with what was chosen, so no more changes.
    case "filter_chosen": {
      if (state.phase !== "review") return refuse(`filter chosen in ${describe(state)}`);
      return ok({ ...state, filter: event.filter }, []);
    }

    case "mirror_chosen": {
      if (state.phase !== "review") return refuse(`mirror chosen in ${describe(state)}`);
      return ok({ ...state, mirrored: event.mirrored }, []);
    }

    case "print_started": {
      if (state.phase !== "delivering" || state.print !== "pending") return stale(state);
      return ok({ ...state, print: "printing" }, []);
    }

    case "printed":
    case "print_failed":
    case "print_skipped": {
      if (state.phase !== "delivering") return stale(state);
      const print = event.type === "printed" ? "printed" : event.type === "print_failed" ? "failed" : "skipped";
      return ok({ ...state, print }, []);
    }

    case "finished": {
      if (state.phase !== "delivering") return refuse(`finished in ${describe(state)}`);
      return ok({ ...state, phase: "done" }, []);
    }

    case "cancelled": {
      if (!isActivePhase(state.phase)) return refuse(`cancelled in ${describe(state)}`);
      return ok({ ...state, phase: "abandoned", countdownEndsAt: null, reason: event.reason }, []);
    }

    case "timed_out": {
      if (state.phase !== event.phase || state.shot !== event.shot) return stale(state);
      switch (state.phase) {
        case "capturing":
          return retryOrFail(state, "the camera did not answer in time", now);
        case "composing":
          return ok({ ...state, phase: "failed", reason: "compositing did not finish in time" }, []);
        case "review":
          return compose(state, now);
        case "delivering":
          return ok({ ...state, phase: "done" }, []);
        default:
          return stale(state);
      }
    }
  }
}

/** The look is settled: the worker puts the print and web JPEGs together. */
function compose(state: SessionState, now: Date): Transition {
  const next = { ...state, phase: "composing" as const };
  return ok(next, [{ kind: "compose" }, timeout(next, now)]);
}

function deliver(state: SessionState, now: Date): Transition {
  const next = { ...state, phase: "delivering" as const, print: "pending" as const };
  return ok(next, [{ kind: "print" }, { kind: "sync" }, timeout(next, now)]);
}

function retryOrFail(state: SessionState, reason: string, now: Date): Transition {
  const attempts = state.attempts + 1;
  if (attempts >= MAX_SHOT_ATTEMPTS) {
    return ok(
      { ...state, phase: "failed", countdownEndsAt: null, attempts, reason },
      [],
    );
  }
  return armCountdownTransition({ ...state, attempts }, state.shot, now);
}

function armCountdown(state: SessionState, shot: number, now: Date) {
  const at = new Date(now.getTime() + state.countdownSeconds * 1000);
  const next: SessionState = {
    ...state,
    phase: "countdown",
    shot,
    countdownEndsAt: at.toISOString(),
  };
  return { state: next, effects: [{ kind: "countdown" as const, shot, at }] };
}

function armCountdownTransition(state: SessionState, shot: number, now: Date): Transition {
  const { state: next, effects } = armCountdown(state, shot, now);
  return ok(next, effects);
}

function timeout(state: SessionState, now: Date): Effect {
  const phase = state.phase as keyof typeof TIMEOUTS_MS;
  return {
    kind: "timeout",
    phase,
    shot: state.shot,
    at: new Date(now.getTime() + TIMEOUTS_MS[phase]),
  };
}

function describe(state: SessionState): string {
  return `${state.phase} (shot ${state.shot} of ${state.shotCount})`;
}

function ok(state: SessionState, effects: Effect[]): Transition {
  return { ok: true, state, effects, stale: false };
}

function stale(state: SessionState): Transition {
  return { ok: true, state, effects: [], stale: true };
}

function refuse(reason: string): Transition {
  return { ok: false, reason };
}
