"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Camera, Check, FlipHorizontal2, Printer, RotateCcw, X } from "lucide-react";
import { cssFilter, filterById, needsFilterChoice, spellShortId } from "@booth/core";
import type { CameraMode, FilterId } from "@booth/core";
import type { SessionView, TemplateSummary } from "@booth/db";
import { Composite, MIRROR_TRANSFORM, samplePhotos, sessionPhotos } from "@/components/composite";
import { useCountdown } from "./countdown";
import type { IpadCamera } from "./use-ipad-camera";
import { useIpadCapture } from "./use-ipad-capture";
import { Viewfinder } from "./viewfinder";

const PREVIEW_STREAM_URL = "/preview/stream";

export function AttractScreen({
  eventName,
  recent,
  templates,
  stream,
  onTap,
}: {
  eventName: string;
  recent: SessionView[];
  templates: TemplateSummary[];
  /** The iPad's front camera when it is live: guests see themselves and come over. */
  stream: MediaStream | null;
  onTap: () => void;
}) {
  const title = (
    <>
      <p className="eyebrow">Photo booth</p>
      <h1 className="display text-[clamp(3.5rem,11vw,9rem)] leading-[0.95] text-cream">{eventName}</h1>
      <div className="mt-4 flex items-center gap-4">
        <span className="tap animate-breathe">
          <Camera className="h-8 w-8" strokeWidth={2.4} />
          Tap to start
        </span>
      </div>
    </>
  );

  // A mirror pulls people in better than other people's photos, so the
  // live camera takes the whole screen and the words move to the bottom,
  // clear of the faces in it.
  if (stream) {
    return (
      <button
        type="button"
        onClick={onTap}
        data-testid="attract"
        data-background="camera"
        className="relative flex h-dvh w-full flex-col items-center justify-end overflow-hidden bg-night pb-[calc(8dvh+env(safe-area-inset-bottom))] text-left"
      >
        <AttractMirror stream={stream} />
        <div
          className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(15,17,19,0.4)_0%,rgba(15,17,19,0)_20%,rgba(15,17,19,0)_38%,rgba(15,17,19,0.82)_62%,rgba(15,17,19,0.96)_100%)]"
          aria-hidden
        />
        <div className="relative flex animate-rise flex-col items-center gap-6 px-10 text-center">{title}</div>
      </button>
    );
  }

  const strip = recent.filter((s) => s.takenCount === s.shotCount && s.shots.length > 0).slice(0, 12);
  const byId = new Map(templates.map((t) => [t.id, t]));
  return (
    <button
      type="button"
      onClick={onTap}
      data-testid="attract"
      data-background="photos"
      className="relative flex h-dvh w-full flex-col items-center justify-center overflow-hidden bg-night text-left"
    >
      {strip.length > 0 && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 opacity-35" aria-hidden>
          <div className="flex w-max animate-drift gap-6">
            {[...strip, ...strip].map((s, i) => {
              const t = byId.get(s.templateId);
              return t ? (
                <div key={`${s.id}-${i}`} className="h-[36dvh]" style={{ width: `calc(36dvh * ${t.width / t.height})` }}>
                  <Composite template={t} photos={sessionPhotos(s.shots)} filter={s.filter} mirrored={s.mirrored} className="rounded-xl" />
                </div>
              ) : null;
            })}
          </div>
        </div>
      )}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(15,17,19,0.35)_0%,rgba(15,17,19,0.92)_70%)]" aria-hidden />
      <div className="relative flex animate-rise flex-col items-center gap-10 px-10 text-center">{title}</div>
    </button>
  );
}

/**
 * The front camera behind the attract loop, mirrored like the live
 * screen's. It fades in on its first frame, so a camera still waking up
 * shows the night background rather than a black rectangle.
 */
function AttractMirror({ stream }: { stream: MediaStream }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const v = video.current;
    if (v && v.srcObject !== stream) v.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={video}
      autoPlay
      playsInline
      muted
      aria-hidden
      onPlaying={() => setPlaying(true)}
      data-testid="attract-camera"
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${playing ? "opacity-100" : "opacity-0"}`}
      style={{ transform: MIRROR_TRANSFORM }}
    />
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
    <div className="flex h-dvh flex-col px-10 pt-safe-10 pb-safe-8" data-testid="picker">
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
  camera,
  onCancel,
}: {
  session: SessionView;
  template: TemplateSummary;
  cameraMode: CameraMode;
  camera: IpadCamera;
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

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden" data-testid="live" data-phase={session.phase} data-filter={session.filter} data-mirrored={session.mirrored}>
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
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(15,17,19,0.55)_0%,rgba(15,17,19,0)_30%,rgba(15,17,19,0)_60%,rgba(15,17,19,0.75)_100%)]" />
      </div>

      {ipad ? (
        flash.state === "on" ? (
          <div className="pointer-events-none absolute inset-0 z-20 bg-white" data-testid="flash" />
        ) : flash.state === "fading" ? (
          <div key={`flash-${flash.count}`} className="pointer-events-none absolute inset-0 z-20 animate-flash bg-white" />
        ) : null
      ) : (
        session.phase === "capturing" && <div key={`flash-${session.shot}`} className="pointer-events-none absolute inset-0 z-20 animate-flash bg-cream" />
      )}

      <header className="relative z-10 flex items-start justify-between px-10 pt-safe-8">
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

      <footer className="relative z-10 flex items-end justify-between px-10 pb-safe-8">
        <div className="flex gap-3">
          {Array.from({ length: session.shotCount }, (_, i) => i + 1).map((n) => (
            <div
              key={n}
              className={`h-20 w-28 overflow-hidden rounded-lg bg-night-raised shadow-lg ring-1 ring-night-edge ${freshShot?.shot === n ? "animate-rise" : ""}`}
            >
              {photos[n] ? (
                <img src={photos[n]} alt="" className="h-full w-full object-cover" style={{ filter: look, transform: session.mirrored ? MIRROR_TRANSFORM : undefined }} />
              ) : null}
            </div>
          ))}
        </div>
        {cameraError && (
          <p className="max-w-md rounded-xl bg-rose-tint px-4 py-2 text-rose" role="alert" data-testid="camera-error">
            {cameraError}
          </p>
        )}
      </footer>
    </div>
  );
}

/** Stand-ins for the camera frame's shape until the camera reports it. */
const IPAD_FRAME = { width: 4, height: 3 };
const DSLR_FRAME = { width: 3, height: 2 };

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

/**
 * The photos, through the filter the guest picks here, flipped if they
 * want them the way the mirror showed them. A tap shows at once on the
 * composite and goes to the booth; the snapshot confirms it a moment
 * later. The chips are the first photo through each look, so the
 * comparison is on the guest's own face, not a sample.
 */
export function ReviewScreen({
  session,
  template,
  filters,
  onFilter,
  onMirror,
  onAccept,
  onRetake,
  onCancel,
  busy,
}: {
  session: SessionView;
  template: TemplateSummary;
  /** What the booth offers; with one there is nothing to ask. */
  filters: FilterId[];
  onFilter: (id: FilterId) => void;
  onMirror: (mirrored: boolean) => void;
  onAccept: () => void;
  onRetake: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [chosen, setChosen] = useState<FilterId | null>(null);
  if (chosen !== null && chosen === session.filter) setChosen(null);
  const filter = chosen ?? session.filter;
  const [flipped, setFlipped] = useState<boolean | null>(null);
  if (flipped !== null && flipped === session.mirrored) setFlipped(null);
  const mirrored = flipped ?? session.mirrored;
  const sample = session.shots[0]?.url;
  return (
    <div className="flex h-dvh flex-col px-10 pt-safe-8 pb-safe-8" data-testid="review" data-filter={filter} data-mirrored={mirrored}>
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
        <Composite
          template={template}
          photos={sessionPhotos(session.shots)}
          filter={filter}
          mirrored={mirrored}
          className="rounded-xl shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)]"
          fit
        />
      </div>
      <div className="mb-6 flex animate-rise items-stretch justify-center gap-3" style={{ animationDelay: "120ms" }}>
        {needsFilterChoice(filters) && (
          <>
            <div className="flex gap-3" role="radiogroup" aria-label="Filter" data-testid="filters">
              {filters.map((id) => (
                <Chip
                  key={id}
                  role="radio"
                  selected={filter === id}
                  label={filterById(id).name}
                  testId={`filter-${id}`}
                  onClick={() => {
                    setChosen(id);
                    onFilter(id);
                  }}
                >
                  {sample && <img src={sample} alt="" className="h-full w-full object-cover" style={{ filter: cssFilter(id) }} draggable={false} />}
                </Chip>
              ))}
            </div>
            <div className="my-3 w-px bg-night-edge" aria-hidden />
          </>
        )}
        {/* The photo the way the mirror showed it: the chip is the first shot flipped, in the chosen look. */}
        <Chip
          role="switch"
          selected={mirrored}
          label="Mirrored"
          icon={<FlipHorizontal2 className="h-4 w-4" />}
          testId="mirror"
          onClick={() => {
            setFlipped(!mirrored);
            onMirror(!mirrored);
          }}
        >
          {sample && (
            <img src={sample} alt="" className="h-full w-full object-cover" style={{ filter: cssFilter(filter), transform: MIRROR_TRANSFORM }} draggable={false} />
          )}
        </Chip>
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

/**
 * One choice on the review screen: a thumbnail of the guest's own first
 * photo the way this option would show it, with its name under it.
 */
function Chip({
  role,
  selected,
  label,
  icon,
  testId,
  onClick,
  children,
}: {
  role: "radio" | "switch";
  selected: boolean;
  label: string;
  icon?: React.ReactNode;
  testId: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      onClick={onClick}
      data-testid={testId}
      className={`flex flex-col items-center gap-2 rounded-2xl p-2 pb-3 transition active:scale-[0.97] ${
        selected ? "bg-night-lifted shadow-[inset_0_0_0_2px_var(--color-ember)]" : "shadow-[inset_0_0_0_1px_var(--color-night-edge)]"
      }`}
    >
      <div className="h-20 w-28 overflow-hidden rounded-xl bg-night-raised">{children}</div>
      <span className={`flex items-center gap-1.5 text-base font-semibold ${selected ? "text-cream" : "text-cream-soft"}`}>
        {icon}
        {label}
      </span>
    </button>
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
    <div className="flex h-dvh flex-col px-10 pt-safe-8 pb-safe-8" data-testid="deliver">
      <header className="animate-rise">
        <p className="eyebrow">All done</p>
        <h1 className="display mt-2 text-[clamp(2.5rem,6vw,4.5rem)] leading-none">Scan for your photos</h1>
      </header>
      <div className="my-6 grid min-h-0 flex-1 grid-cols-[1.2fr_1fr] items-center gap-10">
        <div className="h-full min-h-0">
          <Composite
            template={template}
            photos={sessionPhotos(session.shots)}
            filter={session.filter}
            mirrored={session.mirrored}
            className="rounded-xl shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)]"
            fit
          />
        </div>
        <div className="flex animate-rise flex-col items-center gap-5 text-center" style={{ animationDelay: "120ms" }}>
          <div className="rounded-3xl bg-cream p-5 shadow-2xl">
            <img src={`/api/sessions/${session.id}/qr`} alt="QR code for your photos" className="h-[34dvh] w-[34dvh]" data-testid="qr" />
          </div>
          <p className="mono text-lg tracking-[0.15em] text-cream-soft">{spellShortId(session.id)}</p>
          <p className="text-xl text-cream-soft">Your photos will be in the gallery in a moment.</p>
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
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center p-3 pt-safe-3" data-testid="disconnected">
      <span className="pill pill-warn animate-pulse-soft text-sm">Reconnecting to the booth</span>
    </div>
  );
}
