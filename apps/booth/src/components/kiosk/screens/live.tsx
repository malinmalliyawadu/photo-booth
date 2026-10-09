"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Camera, X } from "lucide-react";
import { cssFilter, type CameraMode } from "@booth/core";
import type { SessionView, TemplateSummary } from "@booth/db";
import { MIRROR_TRANSFORM, sessionPhotos } from "@/components/composite";
import { useCountdown } from "../countdown";
import type { Sounds } from "../sounds";
import type { IpadCamera } from "../use-ipad-camera";
import { useIpadCapture } from "../use-ipad-capture";
import { Viewfinder } from "../viewfinder";

const PREVIEW_STREAM_URL = "/preview/stream";

/** Stand-ins for the camera frame's shape until the camera reports it. */
const IPAD_FRAME = { width: 4, height: 3 };
const DSLR_FRAME = { width: 3, height: 2 };

/**
 * Posing. The viewfinder fills the screen, cropped to the slot; the
 * countdown is a numeral inside an aperture ring that drains to zero;
 * the photos already taken collect as small prints along the foot.
 */
export function LiveScreen({
  session,
  template,
  cameraMode,
  camera,
  sounds,
  onCancel,
}: {
  session: SessionView;
  template: TemplateSummary;
  cameraMode: CameraMode;
  camera: IpadCamera;
  sounds: Sounds;
  onCancel: () => void;
}) {
  const left = useCountdown(session.phase === "countdown" ? session.countdownEndsAt : null);
  // "Hold still" from the moment the digits hit zero: the camera fires
  // then (the iPad) or a beat later (the worker), and the guest should
  // already be frozen for it.
  const capturing = session.phase === "capturing" || (session.phase === "countdown" && left === 0);
  const ipad = cameraMode === "ipad";
  const video = useRef<HTMLVideoElement>(null);
  const { flash, error: captureError } = useIpadCapture(ipad, session, video);
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  const photos = sessionPhotos(session.shots);
  const freshShot = session.shots.at(-1);
  const cameraError = ipad ? (captureError ?? (camera.health.status === "error" ? camera.health.detail : null)) : null;
  // The guest poses through the filter they picked. It is CSS on the
  // preview only: the frame the iPad reads from the video underneath is
  // the camera's own, and the file stays that way.
  const look = cssFilter(session.filter);

  // A tick on every second of the countdown, the shutter at its zero.
  const counting = session.phase === "countdown" && !capturing ? left : 0;
  useEffect(() => {
    if (counting > 0) sounds.tick(counting === 1);
  }, [counting, sounds]);
  const shot = capturing ? session.shot : 0;
  useEffect(() => {
    if (shot > 0) sounds.shutter();
  }, [shot, sounds]);

  return (
    <div
      className="relative flex h-dvh flex-col overflow-hidden"
      data-testid="live"
      data-phase={session.phase}
      data-filter={session.filter}
      data-mirrored={session.mirrored}
    >
      <div className="absolute inset-0">
        <Viewfinder frame={frame ?? (ipad ? IPAD_FRAME : DSLR_FRAME)} slots={template.slots} shot={session.shot}>
          <div className="h-full w-full" style={{ filter: look }} data-testid="viewfinder-look">
            {ipad ? (
              <LiveVideo stream={camera.stream} videoRef={video} onFrame={setFrame} />
            ) : cameraMode === "gphoto2" ? (
              <img
                src={PREVIEW_STREAM_URL}
                alt=""
                className="h-full w-full object-cover"
                onLoad={(e) => setFrame({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
              />
            ) : (
              <FakeViewfinder />
            )}
          </div>
        </Viewfinder>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(13,10,15,0.6)_0%,rgba(13,10,15,0)_28%,rgba(13,10,15,0)_62%,rgba(13,10,15,0.8)_100%)]" />
      </div>

      {ipad ? (
        flash.state === "on" ? (
          <div className="pointer-events-none absolute inset-0 z-20 bg-white" data-testid="flash" />
        ) : flash.state === "fading" ? (
          <div key={`flash-${flash.count}`} className="pointer-events-none absolute inset-0 z-20 animate-flash bg-white" />
        ) : null
      ) : (
        session.phase === "capturing" && <div key={`flash-${session.shot}`} className="pointer-events-none absolute inset-0 z-20 animate-flash bg-ivory" />
      )}

      <header className="relative z-10 flex items-start justify-between px-12 pt-safe-8">
        <div className="animate-fade">
          <p className="eyebrow">{template.name}</p>
          <p className="display mt-2 text-4xl" data-testid="shot-label">
            Photo {session.shot} of {session.shotCount}
          </p>
        </div>
        <button type="button" onClick={onCancel} className="tap tap-ghost tap-sm">
          <X className="h-5 w-5" /> Start over
        </button>
      </header>

      <div className="relative z-10 flex flex-1 items-center justify-center">
        {capturing ? (
          <p
            className="display-italic animate-tick text-[clamp(4.5rem,11vw,9rem)] text-ivory [text-shadow:0_6px_40px_rgba(0,0,0,0.6)]"
            data-testid="hold-still"
          >
            Hold still
          </p>
        ) : left > 0 && session.countdownEndsAt ? (
          <div className="relative flex h-[60dvh] w-[60dvh] items-center justify-center">
            <Ring key={session.countdownEndsAt} endsAt={session.countdownEndsAt} seconds={session.countdownSeconds} />
            <span
              key={left}
              className="display animate-tick text-[34dvh] leading-none text-ivory [text-shadow:0_8px_50px_rgba(0,0,0,0.7)]"
              data-testid="countdown"
            >
              {left}
            </span>
          </div>
        ) : null}
      </div>

      <footer className="relative z-10 flex items-end justify-between gap-6 px-12 pb-safe-8">
        <div className="flex items-end gap-4">
          {Array.from({ length: session.shotCount }, (_, i) => i + 1).map((n) =>
            photos[n] ? (
              <div
                key={n}
                className={`mat mat-thin h-24 w-32 p-1 ${freshShot?.shot === n ? "animate-rise" : ""}`}
                style={{ transform: `rotate(${n % 2 ? -1.5 : 1.5}deg)` }}
              >
                <img
                  src={photos[n]}
                  alt=""
                  className="h-full w-full object-cover"
                  style={{ filter: look, transform: session.mirrored ? MIRROR_TRANSFORM : undefined }}
                />
              </div>
            ) : (
              <div
                key={n}
                className={`flex h-24 w-32 items-center justify-center rounded-sm ring-1 ${
                  n === session.shot ? "ring-gold/80 bg-gold/10" : "ring-ivory/25"
                }`}
              >
                <span className={`display text-2xl ${n === session.shot ? "text-gold" : "text-ivory/45"}`}>{n}</span>
              </div>
            ),
          )}
        </div>
        {cameraError && (
          <p className="max-w-md rounded-xl bg-claret-tint px-4 py-2 text-claret" role="alert" data-testid="camera-error">
            {cameraError}
          </p>
        )}
      </footer>
    </div>
  );
}

/**
 * The aperture ring around the numeral. One CSS animation per
 * countdown (the parent keys it by the deadline), started part-way
 * through so it is in step with the controller's clock, drains the
 * stroke from full to empty.
 */
function Ring({ endsAt, seconds }: { endsAt: string; seconds: number }) {
  const r = 47;
  const length = 2 * Math.PI * r;
  // How far into the countdown this ring is mounted (a reload mid-count lands part-way).
  const [elapsed] = useState(() => Math.max(0, Date.now() - (Date.parse(endsAt) - seconds * 1000)));
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90 text-gold" aria-hidden>
      <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="0.5" className="opacity-25" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeDasharray={length}
        className="animate-drain drop-shadow-[0_0_6px_rgba(217,181,106,0.6)]"
        style={{ "--ring-length": `${length}`, animationDuration: `${seconds}s`, animationDelay: `${-elapsed / 1000}s` } as React.CSSProperties}
      />
    </svg>
  );
}

/**
 * The front camera, mirrored so guests see themselves as in a mirror.
 * Reports the frame size, which changes when the iPad is rotated.
 */
function LiveVideo({
  stream,
  videoRef,
  onFrame,
}: {
  stream: MediaStream | null;
  videoRef: Ref<HTMLVideoElement>;
  onFrame: (frame: { width: number; height: number }) => void;
}) {
  const own = useRef<HTMLVideoElement>(null);
  useImperativeHandle(videoRef, () => own.current!, []);
  useEffect(() => {
    const v = own.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    const report = () => {
      if (v.videoWidth > 0) onFrame({ width: v.videoWidth, height: v.videoHeight });
    };
    report();
    v.addEventListener("loadedmetadata", report);
    v.addEventListener("resize", report);
    return () => {
      v.removeEventListener("loadedmetadata", report);
      v.removeEventListener("resize", report);
    };
  }, [stream, onFrame]);
  return <video ref={own} autoPlay playsInline muted className="h-full w-full object-cover" style={{ transform: MIRROR_TRANSFORM }} />;
}

/** Stands in for the live preview when the fake camera is in use. */
function FakeViewfinder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(ellipse_at_50%_35%,#3a2d3f_0%,#1a1320_55%,#0d0a0f_100%)]">
      <div className="flex flex-col items-center gap-3 opacity-50">
        <Camera className="h-20 w-20 text-ivory-faint" strokeWidth={1.1} />
        <p className="eyebrow eyebrow-dim">Fake camera</p>
      </div>
    </div>
  );
}
