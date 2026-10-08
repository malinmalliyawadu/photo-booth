/**
 * When the iPad takes the photo.
 *
 * In iPad mode the kiosk is the camera. The photo should be taken the
 * moment the guest's countdown reaches zero on screen, not a beat later
 * when the controller's countdown job has fired and the snapshot saying
 * `capturing` has crossed the Wi-Fi. So the kiosk takes the frame at its
 * own zero and holds it, and hands it over once the session is waiting
 * for that shot (the upload is refused before then).
 *
 * One countdown is one episode, keyed by session, shot and deadline, so
 * a retry after a failed shot (same shot, new deadline) is a new
 * episode and a late snapshot repeating the old deadline is not. A
 * screen that opens straight into `capturing` (Safari reloaded mid-shot)
 * takes the frame at once.
 *
 * This module decides; the kiosk owns the timer, the camera and the
 * network.
 */
import type { Phase } from "./session";

export type CaptureStage =
  /** Counting down; the frame is taken at `endsAt`. */
  | "armed"
  /** The flash is up and the frame is being read. */
  | "taking"
  /** A frame (or the reason there is none) is waiting for `capturing`. */
  | "held"
  /** Handed to the controller. Nothing more to do for this episode. */
  | "sent";

export interface CaptureEpisode {
  session: string;
  shot: number;
  /** The countdown deadline this episode was armed for; null when it began in `capturing`. */
  endsAt: string | null;
  stage: CaptureStage;
}

/** The parts of the active session the plan reads. */
export interface CaptureView {
  id: string;
  phase: Phase;
  shot: number;
  countdownEndsAt: string | null;
}

export type CaptureAction =
  | { kind: "none" }
  /** Take the frame at this instant (replaces any earlier timer). */
  | { kind: "arm"; at: string }
  /** Take the frame now. */
  | { kind: "take" }
  /** Hand the held frame to the controller now. */
  | { kind: "send" };

export interface CapturePlan {
  episode: CaptureEpisode | null;
  action: CaptureAction;
}

const NONE: CaptureAction = { kind: "none" };

/** The next step, given the episode so far and the session as the snapshot shows it. */
export function planCapture(episode: CaptureEpisode | null, view: CaptureView | null): CapturePlan {
  if (!view || (view.phase !== "countdown" && view.phase !== "capturing")) {
    return { episode: null, action: NONE };
  }
  const same = episode !== null && episode.session === view.id && episode.shot === view.shot;

  if (view.phase === "countdown") {
    if (!view.countdownEndsAt) return { episode: null, action: NONE };
    if (same && episode.endsAt === view.countdownEndsAt) return { episode, action: NONE };
    return {
      episode: { session: view.id, shot: view.shot, endsAt: view.countdownEndsAt, stage: "armed" },
      action: { kind: "arm", at: view.countdownEndsAt },
    };
  }

  // capturing
  if (!same) {
    return { episode: { session: view.id, shot: view.shot, endsAt: null, stage: "taking" }, action: { kind: "take" } };
  }
  switch (episode.stage) {
    case "armed":
      return { episode: { ...episode, stage: "taking" }, action: { kind: "take" } };
    case "held":
      return { episode: { ...episode, stage: "sent" }, action: { kind: "send" } };
    case "taking":
    case "sent":
      return { episode, action: NONE };
  }
}

/** The timer fired or the snapshot asked for the frame: start taking it if this episode is still armed. */
export function beginTaking(episode: CaptureEpisode | null, armedFor: CaptureEpisode): CaptureEpisode | null {
  if (!episode || !sameEpisode(episode, armedFor) || episode.stage !== "armed") return null;
  return { ...episode, stage: "taking" };
}

/** The frame is read (or failed): hold it, if the episode is still the one that took it. */
export function frameTaken(episode: CaptureEpisode | null, took: CaptureEpisode): CaptureEpisode | null {
  if (!episode || !sameEpisode(episode, took) || episode.stage !== "taking") return null;
  return { ...episode, stage: "held" };
}

/** The hand-over failed in a way worth retrying (the network, the controller restarting). */
export function sendFailed(episode: CaptureEpisode | null, sent: CaptureEpisode): CaptureEpisode | null {
  if (!episode || !sameEpisode(episode, sent) || episode.stage !== "sent") return null;
  return { ...episode, stage: "held" };
}

export function sameEpisode(a: CaptureEpisode, b: CaptureEpisode): boolean {
  return a.session === b.session && a.shot === b.shot && a.endsAt === b.endsAt;
}
