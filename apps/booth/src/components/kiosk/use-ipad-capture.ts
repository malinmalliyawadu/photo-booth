"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  beginTaking,
  frameTaken,
  planCapture,
  sameEpisode,
  sendFailed,
  type CaptureEpisode,
  type CaptureView,
} from "@booth/core";

/**
 * How long the white screen lights the guests before the frame is read.
 * The front camera has no flash; the screen is the flash, the way
 * FaceTime's is, and auto-exposure needs a moment to settle on the
 * brighter faces or the photo comes out blown.
 */
const FLASH_LEAD_MS = 250;
/** How long to wait for a first picture on a screen that just opened. */
const FRAME_WAIT_MS = 2000;
const SEND_RETRY_MS = 600;
const MAX_SENDS = 4;

type Frame = { blob: Blob } | { error: string };

export interface Flash {
  state: "off" | "on" | "fading";
  /** Increments per flash, so the fade can be keyed to replay. */
  count: number;
}

/**
 * Runs `planCapture` against the snapshots and does what it says: arms
 * the timer for the countdown's zero, lights the screen and reads the
 * frame, and hands it over (or the reason there is none) once the
 * session is waiting for it. A network blip is retried a few times;
 * after that the capturing timeout retries the shot.
 */
class CaptureController {
  private episode: CaptureEpisode | null = null;
  private view: CaptureView | null = null;
  private frame: Frame | null = null;
  private sends = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(
    private readonly video: () => HTMLVideoElement | null,
    private readonly flash: (state: Flash["state"]) => void,
    private readonly error: (message: string | null) => void,
  ) {}

  update(view: CaptureView | null) {
    this.view = view;
    this.step();
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
  }

  private step() {
    if (this.disposed) return;
    const before = this.episode;
    const { episode, action } = planCapture(before, this.view);
    if (!episode || !before || !sameEpisode(episode, before)) {
      clearTimeout(this.timer);
      this.frame = null;
      this.sends = 0;
    }
    this.episode = episode;
    if (!episode) return;
    switch (action.kind) {
      case "arm": {
        const armed = episode;
        this.timer = setTimeout(() => {
          const taking = beginTaking(this.episode, armed);
          if (!taking) return;
          this.episode = taking;
          void this.take(taking);
        }, Math.max(0, Date.parse(action.at) - Date.now()));
        break;
      }
      case "take":
        clearTimeout(this.timer);
        void this.take(episode);
        break;
      case "send":
        void this.send(episode);
        break;
      case "none":
        break;
    }
  }

  private async take(taking: CaptureEpisode) {
    this.flash("on");
    let frame: Frame;
    try {
      await sleep(FLASH_LEAD_MS);
      frame = { blob: await grabFrame(await this.readyVideo()) };
      this.error(null);
    } catch (err) {
      frame = { error: err instanceof Error ? err.message : String(err) };
      this.error(frame.error);
    }
    if (this.disposed) return;
    this.flash("fading");
    const held = frameTaken(this.episode, taking);
    if (!held) return;
    this.episode = held;
    this.frame = frame;
    this.step();
  }

  private async send(sent: CaptureEpisode) {
    const frame = this.frame;
    if (!frame) return;
    const url = `/api/sessions/${sent.session}/shots/${sent.shot}`;
    let res: Response | null = null;
    try {
      res =
        "blob" in frame
          ? await fetch(url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: frame.blob })
          : await fetch(`${url}/failed`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reason: frame.error }),
            });
    } catch {
      res = null;
    }
    // Saved, or refused because the session has moved on (cancelled, the
    // timeout retried the shot): either way this episode is over.
    if (res && res.status < 500) return;
    if (++this.sends >= MAX_SENDS) {
      this.error("The photo could not reach the booth");
      return;
    }
    await sleep(SEND_RETRY_MS);
    const again = sendFailed(this.episode, sent);
    if (!again || this.disposed) return;
    this.episode = again;
    this.step();
  }

  /** The preview, once it has a picture. A screen that just opened mid-shot may need a moment. */
  private async readyVideo(): Promise<HTMLVideoElement> {
    const deadline = Date.now() + FRAME_WAIT_MS;
    for (;;) {
      const v = this.video();
      if (v && v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && v.videoWidth > 0) return v;
      if (Date.now() >= deadline) throw new Error("the camera has no picture");
      await sleep(50);
    }
  }
}

/**
 * The full camera frame as a JPEG. The preview is mirrored with CSS so
 * guests see themselves as in a mirror; the frame underneath is not, so
 * the photo reads the right way round as drawn.
 */
function grabFrame(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("could not read the camera"));
  ctx.drawImage(video, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("could not encode the photo"))), "image/jpeg", 0.92),
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Takes the photos in iPad mode. `view` is the active session as the
 * snapshot shows it; `video` is the preview the frame is read from.
 */
export function useIpadCapture(
  enabled: boolean,
  view: CaptureView | null,
  video: RefObject<HTMLVideoElement | null>,
): { flash: Flash; error: string | null } {
  const [flash, setFlash] = useState<Flash>({ state: "off", count: 0 });
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<CaptureController | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const c = new CaptureController(
      () => video.current,
      (state) => setFlash((f) => ({ state, count: state === "on" ? f.count + 1 : f.count })),
      setError,
    );
    controller.current = c;
    return () => {
      c.dispose();
      controller.current = null;
    };
  }, [enabled, video]);

  const id = view?.id ?? null;
  const phase = view?.phase ?? null;
  const shot = view?.shot ?? null;
  const endsAt = view?.countdownEndsAt ?? null;
  useEffect(() => {
    controller.current?.update(id && phase && shot ? { id, phase, shot, countdownEndsAt: endsAt } : null);
  }, [enabled, id, phase, shot, endsAt]);

  return { flash, error };
}
