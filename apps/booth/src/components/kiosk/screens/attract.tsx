"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import type { SessionView, TemplateSummary } from "@booth/db";
import { Aperture, Frame, Grain, Spotlight } from "@/components/chrome";
import { Composite, MIRROR_TRANSFORM, sessionPhotos } from "@/components/composite";

/**
 * The attract loop. With the iPad's camera live, the whole screen is a
 * mirror and the words sit along the bottom, clear of the faces in it:
 * a mirror pulls people in better than other people's photos. Without
 * one, the evening's prints drift past on a wall; before the first
 * print, a lamp and the names.
 */
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
  const prints = recent.filter((s) => s.takenCount === s.shotCount && s.shots.length > 0).slice(0, 12);
  const background = stream ? "camera" : prints.length > 0 ? "photos" : "lamp";
  return (
    <button
      type="button"
      onClick={onTap}
      data-testid="attract"
      data-background={background === "lamp" ? "photos" : background}
      className="relative flex h-dvh w-full flex-col justify-end overflow-hidden bg-velvet text-left"
    >
      {stream ? <Mirror stream={stream} /> : prints.length > 0 ? <Wall prints={prints} templates={templates} /> : <Lamp />}
      <div
        className={`absolute inset-0 ${
          stream
            ? "bg-[linear-gradient(to_bottom,rgba(13,10,15,0.45)_0%,rgba(13,10,15,0)_22%,rgba(13,10,15,0)_45%,rgba(13,10,15,0.85)_70%,rgba(13,10,15,0.97)_100%)]"
            : "bg-[linear-gradient(to_bottom,rgba(13,10,15,0.2)_0%,rgba(13,10,15,0)_30%,rgba(13,10,15,0.9)_72%,rgba(13,10,15,1)_100%)]"
        }`}
        aria-hidden
      />
      <Grain />
      <Frame inset="inset-5" />

      <div className="relative flex animate-rise items-end justify-between gap-10 px-14 pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
        <div className="min-w-0">
          <p className="eyebrow">Photo booth</p>
          <h1 className="display-italic mt-3 max-w-[11ch] text-[clamp(4.5rem,9.5vw,8.5rem)] text-ivory">{eventName}</h1>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-5 pb-2">
          <p className="eyebrow eyebrow-dim">Tap anywhere</p>
          <span className="tap animate-glow">
            <Camera className="h-8 w-8" strokeWidth={2.2} />
            Begin
          </span>
        </div>
      </div>
    </button>
  );
}

/**
 * The front camera behind the attract loop, mirrored like the live
 * screen's. It fades in on its first frame, so a camera still waking up
 * shows the velvet rather than a black rectangle.
 */
function Mirror({ stream }: { stream: MediaStream }) {
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

/** The evening so far: the prints drift past in two rows, each on its mat, each a little askew. */
function Wall({ prints, templates }: { prints: SessionView[]; templates: TemplateSummary[] }) {
  const byId = new Map(templates.map((t) => [t.id, t]));
  const row = (items: SessionView[], reverse: boolean) => (
    <div className={`flex w-max gap-10 animate-drift ${reverse ? "[animation-direction:reverse] [animation-duration:80s]" : ""}`}>
      {[...items, ...items].map((s, i) => {
        const t = byId.get(s.templateId);
        if (!t) return null;
        return (
          <div
            key={`${s.id}-${i}`}
            className="h-[30dvh] shrink-0"
            style={{ width: `calc(30dvh * ${t.width / t.height})`, transform: `rotate(${i % 2 ? 1.6 : -1.2}deg)` }}
          >
            <Composite template={t} photos={sessionPhotos(s.shots)} composed={s.webUrl} filter={s.filter} mirrored={s.mirrored} mat />
          </div>
        );
      })}
    </div>
  );
  const half = Math.ceil(prints.length / 2);
  const top = prints.slice(0, half);
  const bottom = prints.length > 1 ? prints.slice(half) : prints;
  return (
    <div className="absolute inset-x-0 top-[8dvh] flex flex-col gap-10 opacity-60" aria-hidden>
      {row(top, false)}
      {row(bottom.length ? bottom : top, true)}
    </div>
  );
}

/** Before the first print and without a camera: the lamp, and the booth's mark under it. */
function Lamp() {
  return (
    <>
      <Spotlight />
      <div className="absolute inset-0 flex items-center justify-center pb-[18dvh]" aria-hidden>
        <Aperture className="h-[34dvh] w-[34dvh] animate-breathe text-gold opacity-25" />
      </div>
    </>
  );
}
