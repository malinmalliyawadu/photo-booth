"use client";

import { useEffect, useState } from "react";

export interface CameraHealth {
  status: "ok" | "warn" | "error";
  detail: string;
}

export interface IpadCamera {
  /** The front camera, live, or null while it is opening or broken. */
  stream: MediaStream | null;
  health: CameraHealth;
}

const CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: "user",
    // More than any iPad front camera has: Safari settles on the largest
    // mode it supports, which is what the print wants.
    width: { ideal: 4032 },
    height: { ideal: 3024 },
  },
};

/** A frame smaller than this prints soft in a postcard slot. */
const MIN_PIXELS = 1280 * 720;
const RETRY_MS = 5000;
const REPORT_MS = 5000;
const OPENING: CameraHealth = { status: "warn", detail: "Opening the front camera" };

/**
 * The iPad's front camera, held open for as long as the booth is in iPad
 * mode, so it has settled its exposure and focus long before a guest
 * taps, and Safari asks for permission (if it asks at all) when the
 * attendant loads the page rather than mid-countdown.
 *
 * Safari stops the camera when the page is hidden or another app takes
 * it, so a track that ends is reopened, and one that is merely muted
 * (Control Centre, a notification) is reported until it comes back.
 * The health goes to the controller every few seconds for the admin
 * page, which is the attendant's only window into the iPad.
 */
export function useIpadCamera(enabled: boolean): IpadCamera {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [health, setHealth] = useState<CameraHealth>(OPENING);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let opening = false;
    let current: MediaStream | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const release = () => {
      current?.getTracks().forEach((t) => t.stop());
      current = null;
    };
    const retryLater = () => {
      clearTimeout(retry);
      retry = setTimeout(() => void open(), RETRY_MS);
    };

    const open = async () => {
      if (disposed || opening) return;
      opening = true;
      clearTimeout(retry);
      setHealth(OPENING);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("This page cannot use the camera: open the booth over https");
        }
        const next = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
        if (disposed) {
          next.getTracks().forEach((t) => t.stop());
          return;
        }
        release();
        current = next;
        const track = next.getVideoTracks()[0]!;
        track.addEventListener("ended", () => {
          if (current !== next) return;
          release();
          setStream(null);
          setHealth({ status: "error", detail: "The camera stopped; reopening it" });
          retryLater();
        });
        track.addEventListener("mute", () => {
          if (current === next) setHealth({ status: "warn", detail: "The camera is interrupted (Control Centre, a call or a locked screen)" });
        });
        track.addEventListener("unmute", () => {
          if (current === next) setHealth(describe(track));
        });
        setStream(next);
        setHealth(describe(track));
      } catch (err) {
        if (disposed) return;
        setStream(null);
        setHealth({ status: "error", detail: explain(err) });
        retryLater();
      } finally {
        opening = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const track = current?.getVideoTracks()[0];
      if (!track || track.readyState === "ended") void open();
    };

    void open();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      clearTimeout(retry);
      document.removeEventListener("visibilitychange", onVisible);
      release();
      setStream(null);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const report = () =>
      fetch("/api/kiosk/camera", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: health.status, detail: health.detail }),
      }).catch(() => {
        // The controller is unreachable; the admin page will show the camera as stale.
      });
    void report();
    const id = setInterval(report, REPORT_MS);
    return () => clearInterval(id);
  }, [enabled, health.status, health.detail]);

  return { stream: enabled ? stream : null, health };
}

function describe(track: MediaStreamTrack): CameraHealth {
  const { width = 0, height = 0 } = track.getSettings();
  const name = track.label || "Front camera";
  if (track.muted) return { status: "warn", detail: `${name} is interrupted` };
  if (width * height < MIN_PIXELS) {
    return { status: "warn", detail: `${name} at ${width}×${height}: too small for a sharp print` };
  }
  return { status: "ok", detail: `${name} at ${width}×${height}` };
}

function explain(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
      return "Safari is not allowed to use the camera: in Safari, aA › Website Settings › Camera › Allow, then reload";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No front camera found";
    case "NotReadableError":
      return "Another app is using the camera";
    default:
      return err instanceof Error ? err.message : String(err);
  }
}
