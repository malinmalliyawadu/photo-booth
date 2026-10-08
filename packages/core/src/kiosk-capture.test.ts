import { describe, expect, it } from "vitest";
import { beginTaking, frameTaken, planCapture, sendFailed, type CaptureEpisode, type CaptureView } from "./kiosk-capture";

const T1 = "2026-10-08T10:00:03.000Z";
const T2 = "2026-10-08T10:00:09.000Z";

function view(phase: CaptureView["phase"], shot = 1, countdownEndsAt: string | null = phase === "countdown" ? T1 : null): CaptureView {
  return { id: "abc123", phase, shot, countdownEndsAt };
}

function episodeAt(stage: CaptureEpisode["stage"], shot = 1, endsAt: string | null = T1): CaptureEpisode {
  return { session: "abc123", shot, endsAt, stage };
}

describe("planCapture", () => {
  it("arms a timer for the countdown's deadline", () => {
    const plan = planCapture(null, view("countdown"));
    expect(plan.action).toEqual({ kind: "arm", at: T1 });
    expect(plan.episode).toEqual(episodeAt("armed"));
  });

  it("does not re-arm for a repeat of the same countdown", () => {
    const armed = episodeAt("armed");
    expect(planCapture(armed, view("countdown")).action).toEqual({ kind: "none" });
    const held = episodeAt("held");
    expect(planCapture(held, view("countdown"))).toEqual({ episode: held, action: { kind: "none" } });
  });

  it("re-arms when a failed shot counts down again", () => {
    const plan = planCapture(episodeAt("sent"), view("countdown", 1, T2));
    expect(plan.action).toEqual({ kind: "arm", at: T2 });
    expect(plan.episode?.stage).toBe("armed");
  });

  it("arms the next shot after one is taken", () => {
    const plan = planCapture(episodeAt("sent"), view("countdown", 2, T2));
    expect(plan.episode).toEqual(episodeAt("armed", 2, T2));
  });

  it("sends a frame it took at zero once the session is capturing", () => {
    const plan = planCapture(episodeAt("held"), view("capturing"));
    expect(plan.action).toEqual({ kind: "send" });
    expect(plan.episode?.stage).toBe("sent");
  });

  it("takes the frame at once if capturing arrives before its own zero", () => {
    const plan = planCapture(episodeAt("armed"), view("capturing"));
    expect(plan.action).toEqual({ kind: "take" });
    expect(plan.episode?.stage).toBe("taking");
  });

  it("takes the frame at once on a screen that opens mid-capture", () => {
    const plan = planCapture(null, view("capturing", 3));
    expect(plan.action).toEqual({ kind: "take" });
    expect(plan.episode).toEqual(episodeAt("taking", 3, null));
  });

  it("waits while the frame is being taken or after it is sent", () => {
    expect(planCapture(episodeAt("taking"), view("capturing")).action).toEqual({ kind: "none" });
    expect(planCapture(episodeAt("sent"), view("capturing")).action).toEqual({ kind: "none" });
  });

  it("drops the episode when the session moves on", () => {
    expect(planCapture(episodeAt("held"), view("composing"))).toEqual({ episode: null, action: { kind: "none" } });
    expect(planCapture(episodeAt("held"), null)).toEqual({ episode: null, action: { kind: "none" } });
  });

  it("starts fresh for a different session", () => {
    const plan = planCapture(episodeAt("held"), { ...view("capturing"), id: "zzz999" });
    expect(plan.action).toEqual({ kind: "take" });
    expect(plan.episode?.session).toBe("zzz999");
  });
});

describe("the episode's own steps", () => {
  it("begins taking only an episode that is still armed", () => {
    const armed = episodeAt("armed");
    expect(beginTaking(armed, armed)?.stage).toBe("taking");
    expect(beginTaking(episodeAt("taking"), armed)).toBeNull();
    expect(beginTaking(episodeAt("armed", 1, T2), armed)).toBeNull();
    expect(beginTaking(null, armed)).toBeNull();
  });

  it("holds a frame only for the episode that took it", () => {
    const taking = episodeAt("taking");
    expect(frameTaken(taking, taking)?.stage).toBe("held");
    // A retry re-armed the shot while the old frame was being read.
    expect(frameTaken(episodeAt("armed", 1, T2), taking)).toBeNull();
  });

  it("holds the frame again after a send worth retrying", () => {
    const sent = episodeAt("sent");
    expect(sendFailed(sent, sent)?.stage).toBe("held");
    expect(sendFailed(episodeAt("armed", 2, T2), sent)).toBeNull();
  });

  it("walks a whole shot: arm, zero, hold, capturing, send", () => {
    let plan = planCapture(null, view("countdown"));
    const armed = plan.episode!;
    let ep = beginTaking(plan.episode, armed)!;
    ep = frameTaken(ep, ep)!;
    plan = planCapture(ep, view("countdown"));
    expect(plan.action.kind).toBe("none");
    plan = planCapture(plan.episode, view("capturing"));
    expect(plan.action.kind).toBe("send");
  });
});
