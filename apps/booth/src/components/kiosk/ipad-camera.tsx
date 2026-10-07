"use client";

import { useEffect, useRef } from "react";

/**
 * The fallback camera. When the booth is in iPad mode this component
 * shows the front camera as the live preview and, when the session asks
 * for shot N, grabs a frame and uploads it. It is why the booth is HTTPS
 * from day one: Safari refuses getUserMedia on a plain origin.
 */
export function IpadCamera({
  sessionId,
  capturingShot,
  onError,
}: {
  sessionId: string | null;
  /** The shot the session is waiting on from us, or null. */
  capturingShot: number | null;
  onError: (message: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const uploaded = useRef<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch((err: unknown) => onError(`The iPad camera is not available: ${err instanceof Error ? err.message : err}`));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onError]);

  useEffect(() => {
    if (!sessionId || capturingShot === null) return;
    const key = `${sessionId}:${capturingShot}`;
    if (uploaded.current === key) return;
    uploaded.current = key;
    const v = video.current;
    if (!v || v.videoWidth === 0) {
      onError("The iPad camera has no picture yet");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror back: the preview is mirrored so guests can frame themselves,
    // the photo should read the right way round.
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0);
    canvas.toBlob(
      async (blob) => {
        if (!blob) return onError("Could not read a frame from the iPad camera");
        const res = await fetch(`/api/sessions/${sessionId}/shots/${capturingShot}`, {
          method: "PUT",
          headers: { "Content-Type": "image/jpeg" },
          body: blob,
        });
        if (!res.ok && res.status !== 409) {
          uploaded.current = null;
          onError(`Upload failed (${res.status})`);
        }
      },
      "image/jpeg",
      0.92,
    );
  }, [sessionId, capturingShot, onError]);

  return (
    <video
      ref={video}
      autoPlay
      playsInline
      muted
      className="h-full w-full object-cover"
      style={{ transform: "scaleX(-1)" }}
    />
  );
}
