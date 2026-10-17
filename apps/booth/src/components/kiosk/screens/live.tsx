"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cssFilter, poseById, poseImageUrl, type CameraMode } from "@booth/core";
import type { SessionView, TemplateSummary } from "@booth/db";
import { CoveredPhoto, sessionPhotos } from "@/components/composite";
import { CameraPreview } from "../camera-preview";
import { useCountdown } from "../countdown";
import type { FaceFinder } from "../face-finder";
import type { Sounds } from "../sounds";
import type { IpadCamera } from "../use-ipad-camera";
import { useIpadCapture } from "../use-ipad-capture";

/** The thumbnails of the photos taken so far, along the foot. */
const THUMB_BOX = { width: 4, height: 3 };

/**
 * Posing. The viewfinder fills the screen, cropped to the slot; the
 * countdown is a numeral inside an aperture ring that drains to zero;
 * the photos already taken collect as small prints along the foot. A
 * session that took the pose ideas has this shot's idea across the top,
 * from the first tick until the photo is taken.
 */
export function LiveScreen({
  session,
  template,
  cameraMode,
  camera,
  finder,
  sounds,
  onCancel,
}: {
  session: SessionView;
  template: TemplateSummary;
  cameraMode: CameraMode;
  camera: IpadCamera;
  /** Finds the faces for the props, live and in each photo as it is taken; null until it loads. */
  finder: FaceFinder | null;
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
  const { flash, error: captureError } = useIpadCapture(ipad, session, video, finder);
  const photos = sessionPhotos(session.shots);
  const freshShot = session.shots.at(-1);
  const cameraError = ipad ? (captureError ?? (camera.health.status === "error" ? camera.health.detail : null)) : null;
  // The guest poses through the filter and the props they picked. Both
  // are on the preview only: the frame the iPad reads from the video
  // underneath is the camera's own, and the file stays that way.
  const look = cssFilter(session.filter);
  const pose = session.poses ? poseById(session.poses[session.shot - 1] ?? session.poses[0]!) : null;

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
      data-prop={session.prop}
      data-mirrored={session.mirrored}
    >
      <div className="absolute inset-0">
        <CameraPreview cameraMode={cameraMode} camera={camera} finder={finder} slots={template.slots} shot={session.shot} prop={session.prop} look={look} videoRef={video} />
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
        {pose && (
          <div key={session.shot} className="flex max-w-3xl animate-rise items-center gap-5 px-6 [text-shadow:0_4px_30px_rgba(0,0,0,0.7)]" data-testid="pose" data-pose={pose.id}>
            <img src={poseImageUrl(pose.id)} alt="" className="h-32 w-32 shrink-0 drop-shadow-[0_6px_24px_rgba(0,0,0,0.7)]" draggable={false} />
            <div>
              <p className="eyebrow">Pose idea</p>
              <p className="display-italic mt-2 text-[clamp(2.75rem,5.5vw,4.5rem)] leading-none text-gold-bright">{pose.title}</p>
              <p className="mt-3 text-2xl text-ivory-soft">{pose.hint}</p>
            </div>
          </div>
        )}
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
                <div className="relative h-full w-full overflow-hidden">
                  <CoveredPhoto photo={photos[n]} box={THUMB_BOX} look={look} prop={session.prop} mirrored={session.mirrored} />
                </div>
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

