"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { Camera, Check, Printer, RotateCcw, X } from "lucide-react";
import { spellShortId } from "@booth/core";
import type { CameraMode } from "@booth/core";
import type { SessionView, TemplateSummary } from "@booth/db";
import { Composite, samplePhotos, sessionPhotos } from "@/components/composite";
import { useCountdown } from "./countdown";
import { IpadCamera } from "./ipad-camera";

const PREVIEW_STREAM_URL = "/preview/stream";

export function AttractScreen({
  eventName,
  recent,
  templates,
  onTap,
}: {
  eventName: string;
  recent: SessionView[];
  templates: TemplateSummary[];
  onTap: () => void;
}) {
  const strip = recent.filter((s) => s.takenCount === s.shotCount && s.shots.length > 0).slice(0, 12);
  const byId = new Map(templates.map((t) => [t.id, t]));
  return (
    <button
      type="button"
      onClick={onTap}
      data-testid="attract"
      className="relative flex h-dvh w-full flex-col items-center justify-center overflow-hidden bg-night text-left"
    >
      {strip.length > 0 && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 opacity-35" aria-hidden>
          <div className="flex w-max animate-drift gap-6">
            {[...strip, ...strip].map((s, i) => {
              const t = byId.get(s.templateId);
              return t ? (
                <div key={`${s.id}-${i}`} className="h-[36dvh]" style={{ width: `calc(36dvh * ${t.width / t.height})` }}>
                  <Composite template={t} photos={sessionPhotos(s.shots)} className="rounded-xl" />
                </div>
              ) : null;
            })}
          </div>
        </div>
      )}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(15,17,19,0.35)_0%,rgba(15,17,19,0.92)_70%)]" aria-hidden />
      <div className="relative flex animate-rise flex-col items-center gap-10 px-10 text-center">
        <p className="eyebrow">Photo booth</p>
        <h1 className="display text-[clamp(3.5rem,11vw,9rem)] leading-[0.95] text-cream">{eventName}</h1>
        <div className="mt-4 flex items-center gap-4">
          <span className="tap animate-breathe">
            <Camera className="h-8 w-8" strokeWidth={2.4} />
            Tap to start
          </span>
        </div>
      </div>
    </button>
  );
}

export function PausedScreen({ eventName }: { eventName: string }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-6 px-10 text-center" data-testid="paused">
      <p className="eyebrow">{eventName}</p>
      <h1 className="display text-[clamp(3rem,8vw,6rem)] leading-tight">Back in a moment</h1>
      <p className="text-2xl text-cream-soft">The booth is taking a short break.</p>
    </div>
  );
}

export function PickerScreen({
  templates,
  busy,
  error,
  onPick,
  onBack,
}: {
  templates: TemplateSummary[];
  busy: boolean;
  error: string | null;
  onPick: (id: string) => void;
  onBack: () => void;
}) {
  // Up to three layouts sit in one row; more go two rows deep, so a
  // landscape preview never shrinks to a postage stamp.
  const columns = templates.length <= 3 ? Math.max(templates.length, 1) : Math.ceil(templates.length / 2);
  const rows = templates.length <= 3 ? 1 : 2;
  return (
    <div className="flex h-dvh flex-col px-10 pt-10 pb-8" data-testid="picker">
      <header className="flex items-end justify-between">
        <div className="animate-rise">
          <p className="eyebrow">Step one</p>
          <h1 className="display mt-2 text-[clamp(2.5rem,6vw,4.5rem)] leading-none">Pick a layout</h1>
        </div>
        <button type="button" onClick={onBack} className="tap tap-quiet min-h-16 px-7 text-xl" disabled={busy}>
          <X className="h-6 w-6" /> Back
        </button>
      </header>
      {error && (
        <p className="mt-6 rounded-2xl bg-rose-tint px-6 py-4 text-xl text-rose" role="alert">
          {error}
        </p>
      )}
      <div className="mt-8 grid min-h-0 flex-1 gap-6" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {templates.map((t, i) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            disabled={busy}
            data-testid={`layout-${t.id}`}
            className="card group flex min-h-0 animate-rise flex-col gap-3 p-4 text-left transition active:scale-[0.98] disabled:opacity-60"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className="min-h-0 flex-1">
              <Composite template={t} photos={samplePhotos(t.shotCount, i)} className="rounded-lg shadow-2xl" fit />
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="display text-2xl">{t.name}</span>
              <span className="mono text-sm text-cream-faint">
                {t.shotCount} {t.shotCount === 1 ? "shot" : "shots"}
              </span>
            </div>
          </button>
        ))}
        {templates.length === 0 && (
          <p className="col-span-full text-2xl text-cream-soft">No layouts are switched on. The attendant can fix that from the admin page.</p>
        )}
      </div>
    </div>
  );
}

export function LiveScreen({
  session,
  template,
  cameraMode,
  onCancel,
}: {
  session: SessionView;
  template: TemplateSummary;
  cameraMode: CameraMode;
  onCancel: () => void;
}) {
  const left = useCountdown(session.phase === "countdown" ? session.countdownEndsAt : null);
  // "Hold still" from the moment the digits hit zero: the worker fires a
  // beat later and the guest should already be frozen for it.
  const capturing = session.phase === "capturing" || (session.phase === "countdown" && left === 0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const photos = sessionPhotos(session.shots);
  const freshShot = session.shots.at(-1);

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden" data-testid="live" data-phase={session.phase}>
      <div className="absolute inset-0">
        {cameraMode === "ipad" ? (
          <IpadCamera sessionId={session.id} capturingShot={capturing ? session.shot : null} onError={setCameraError} />
        ) : cameraMode === "gphoto2" ? (
          <img src={PREVIEW_STREAM_URL} alt="" className="h-full w-full object-cover" />
        ) : (
          <FakeViewfinder />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(15,17,19,0.55)_0%,rgba(15,17,19,0)_30%,rgba(15,17,19,0)_60%,rgba(15,17,19,0.75)_100%)]" />
      </div>

      {session.phase === "capturing" && <div key={`flash-${session.shot}`} className="pointer-events-none absolute inset-0 z-20 animate-flash bg-cream" />}

      <header className="relative z-10 flex items-start justify-between px-10 pt-8">
        <div>
          <p className="eyebrow">{template.name}</p>
          <p className="display mt-1 text-4xl" data-testid="shot-label">
            Photo {session.shot} of {session.shotCount}
          </p>
        </div>
        <button type="button" onClick={onCancel} className="tap tap-quiet min-h-14 px-6 text-lg">
          <X className="h-5 w-5" /> Start over
        </button>
      </header>

      <div className="relative z-10 flex flex-1 items-center justify-center">
        {capturing ? (
          <p className="display-italic animate-tick text-[clamp(4rem,10vw,8rem)]" data-testid="hold-still">
            Hold still
          </p>
        ) : left > 0 ? (
          <span key={left} className="display animate-tick text-[clamp(10rem,28vw,22rem)] leading-none" data-testid="countdown">
            {left}
          </span>
        ) : null}
      </div>

      <footer className="relative z-10 flex items-end justify-between px-10 pb-8">
        <div className="flex gap-3">
          {Array.from({ length: session.shotCount }, (_, i) => i + 1).map((n) => (
            <div
              key={n}
              className={`h-20 w-28 overflow-hidden rounded-lg bg-night-raised shadow-lg ring-1 ring-night-edge ${freshShot?.shot === n ? "animate-rise" : ""}`}
            >
              {photos[n] ? <img src={photos[n]} alt="" className="h-full w-full object-cover" /> : null}
            </div>
          ))}
        </div>
        {cameraError && <p className="max-w-md rounded-xl bg-rose-tint px-4 py-2 text-rose">{cameraError}</p>}
      </footer>
    </div>
  );
}

/** Stands in for the live preview when the fake camera is in use. */
function FakeViewfinder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(ellipse_at_50%_40%,#2d3139_0%,#14171b_60%,#0f1113_100%)]">
      <div className="flex flex-col items-center gap-3 opacity-50">
        <Camera className="h-20 w-20 text-cream-faint" strokeWidth={1.2} />
        <p className="eyebrow">Fake camera</p>
      </div>
    </div>
  );
}

export function ComposingScreen() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-6" data-testid="composing">
      <div className="h-16 w-16 animate-spin rounded-full border-4 border-night-edge border-t-ember" />
      <p className="display-italic text-5xl">Putting it together</p>
    </div>
  );
}

export function ReviewScreen({
  session,
  template,
  onAccept,
  onRetake,
  onCancel,
  busy,
}: {
  session: SessionView;
  template: TemplateSummary;
  onAccept: () => void;
  onRetake: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex h-dvh flex-col px-10 pt-8 pb-8" data-testid="review">
      <header className="flex items-end justify-between">
        <div className="animate-rise">
          <p className="eyebrow">Looking good</p>
          <h1 className="display mt-2 text-[clamp(2.5rem,6vw,4.5rem)] leading-none">Here&apos;s your photo</h1>
        </div>
        <button type="button" onClick={onCancel} className="tap tap-quiet min-h-14 px-6 text-lg" disabled={busy}>
          <X className="h-5 w-5" /> Start over
        </button>
      </header>
      <div className="my-6 min-h-0 flex-1 animate-rise">
        <Composite template={template} photos={sessionPhotos(session.shots)} className="rounded-xl shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)]" fit />
      </div>
      <footer className="flex items-center justify-center gap-5">
        <button type="button" onClick={onRetake} className="tap tap-quiet" disabled={busy}>
          <RotateCcw className="h-7 w-7" /> Retake
        </button>
        <button type="button" onClick={onAccept} className="tap" disabled={busy} data-testid="accept">
          <Printer className="h-8 w-8" strokeWidth={2.4} /> Print it
        </button>
      </footer>
    </div>
  );
}

export function DeliverScreen({
  session,
  template,
  onDone,
  busy,
}: {
  session: SessionView;
  template: TemplateSummary;
  onDone: () => void;
  busy: boolean;
}) {
  const print = printLine(session);
  return (
    <div className="flex h-dvh flex-col px-10 pt-8 pb-8" data-testid="deliver">
      <header className="animate-rise">
        <p className="eyebrow">All done</p>
        <h1 className="display mt-2 text-[clamp(2.5rem,6vw,4.5rem)] leading-none">Scan for your photos</h1>
      </header>
      <div className="my-6 grid min-h-0 flex-1 grid-cols-[1.2fr_1fr] items-center gap-10">
        <div className="h-full min-h-0">
          <Composite template={template} photos={sessionPhotos(session.shots)} className="rounded-xl shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)]" fit />
        </div>
        <div className="flex animate-rise flex-col items-center gap-5 text-center" style={{ animationDelay: "120ms" }}>
          <div className="rounded-3xl bg-cream p-5 shadow-2xl">
            <img src={`/api/sessions/${session.id}/qr`} alt="QR code for your photos" className="h-[34dvh] w-[34dvh]" data-testid="qr" />
          </div>
          <p className="mono text-lg tracking-[0.15em] text-cream-soft">{spellShortId(session.id)}</p>
          <p className="text-xl text-cream-soft">Photos appear in the gallery shortly, even if the Wi-Fi is slow tonight.</p>
          <p className={`flex items-center gap-2 text-xl ${print.tone}`} data-testid="print-status">
            {print.icon}
            {print.text}
          </p>
        </div>
      </div>
      <footer className="flex justify-center">
        <button type="button" onClick={onDone} className="tap" disabled={busy} data-testid="done">
          <Check className="h-8 w-8" strokeWidth={2.6} /> Done
        </button>
      </footer>
    </div>
  );
}

function printLine(session: SessionView): { text: string; tone: string; icon: React.ReactNode } {
  switch (session.print) {
    case "printed":
      return { text: "Your print is in the tray", tone: "text-mint", icon: <Check className="h-6 w-6" /> };
    case "failed":
      return { text: "The print did not come out; the attendant can print it again", tone: "text-rose", icon: <Printer className="h-6 w-6" /> };
    case "skipped":
      return { text: "Out of paper right now; your photos are safe", tone: "text-gold", icon: <Printer className="h-6 w-6" /> };
    default:
      return {
        text: "Printing your copy",
        tone: "text-cream-soft",
        icon: <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-night-edge border-t-ember" />,
      };
  }
}

export function EndedScreen({ reason, onDismiss }: { reason: string | null; onDismiss: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 8000);
    return () => clearTimeout(id);
  }, [onDismiss]);
  return (
    <button type="button" onClick={onDismiss} className="flex h-dvh w-full flex-col items-center justify-center gap-6 px-10 text-center" data-testid="ended">
      <p className="eyebrow">Sorry about that</p>
      <h1 className="display text-[clamp(3rem,8vw,6rem)] leading-tight">That didn&apos;t work</h1>
      <p className="max-w-2xl text-2xl text-cream-soft">{reason ?? "Something went wrong with the camera."} Tap to try again.</p>
    </button>
  );
}

export function ConnectionBanner({ connected }: { connected: boolean }) {
  if (connected) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center p-3" data-testid="disconnected">
      <span className="pill pill-warn animate-pulse-soft text-sm">Reconnecting to the booth</span>
    </div>
  );
}
