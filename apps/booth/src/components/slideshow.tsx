"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import type { Snapshot } from "@booth/db";
import { Grain, Spotlight } from "@/components/chrome";
import { Composite, sessionPhotos } from "@/components/composite";
import { useSnapshot } from "@/components/use-snapshot";
import { clockTime, sessionNumber } from "@/lib/format";

const DWELL_MS = 8000;

/**
 * The TV. Loops the latest prints, newest first, and cuts to a fresh one
 * the moment it lands. Each print sits on its mat under a slow zoom,
 * over a soft wash of its own colours, the way a projector lights the
 * wall around a slide. Nothing to tap, so it is not a kiosk surface.
 */
export function Slideshow({ initial }: { initial: Snapshot }) {
  const { snapshot } = useSnapshot(initial);
  const byId = useMemo(() => new Map(snapshot.templates.map((t) => [t.id, t])), [snapshot.templates]);
  const finished = useMemo(
    () => snapshot.recent.filter((s) => s.takenCount === s.shotCount && s.shots.length > 0 && byId.has(s.templateId)),
    [snapshot.recent, byId],
  );
  const [index, setIndex] = useState(0);
  const newest = finished[0]?.id;
  const [seen, setSeen] = useState(newest);

  // A new session jumps the queue.
  if (newest !== seen) {
    setSeen(newest);
    setIndex(0);
  }

  useEffect(() => {
    if (finished.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % finished.length), DWELL_MS);
    return () => clearInterval(id);
  }, [finished.length]);

  const current = finished[index % Math.max(finished.length, 1)];
  const template = current ? byId.get(current.templateId) : undefined;

  return (
    <main className="relative h-dvh overflow-hidden bg-velvet text-ivory" data-testid="slideshow">
      {current?.webUrl ? (
        <div key={`wash-${current.id}`} className="absolute inset-0 animate-fade [animation-duration:1.6s]" aria-hidden>
          <img src={current.webUrl} alt="" className="absolute -inset-[12%] h-[124%] w-[124%] object-cover opacity-45 blur-[70px] saturate-[1.4]" />
          <div className="absolute inset-0 bg-velvet/55" />
        </div>
      ) : (
        <Spotlight />
      )}
      <Grain />

      {current && template ? (
        <div key={current.id} className="absolute inset-x-[6vmin] top-[5vmin] bottom-[10vmin] animate-rise [animation-duration:1.2s]">
          <div className="h-full w-full animate-kenburns" style={{ animationDuration: `${DWELL_MS + 2500}ms` }}>
            <Composite
              template={template}
              photos={sessionPhotos(current.shots)}
              composed={current.webUrl}
              filter={current.filter}
              mirrored={current.mirrored}
              fit
              mat
            />
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-center">
          <p className="eyebrow">{snapshot.booth.eventName}</p>
          <p className="display-italic text-[clamp(3rem,7vw,6.5rem)]">The first print lands here</p>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-velvet/80 to-transparent px-[4vmin] pt-[8vmin] pb-[3vmin]">
        <p className="display-italic text-[clamp(1.75rem,3.2vw,3rem)] text-gold">{snapshot.booth.eventName}</p>
        {current && <Caption key={current.id} session={current} newest={index === 0} />}
      </div>
    </main>
  );
}

/** A session this young is announced as just taken. */
const FRESH_MS = 2 * 60_000;

/** The number and the time under a print, and "just taken" while the newest one is still warm. */
function Caption({ session, newest }: { session: Snapshot["recent"][number]; newest: boolean }) {
  const [shownAt] = useState(() => Date.now());
  const fresh = newest && shownAt - Date.parse(session.createdAt) < FRESH_MS;
  return (
    <div className="flex items-center gap-4">
      {fresh && <span className="pill pill-gold animate-breathe text-sm">Just taken</span>}
      <p className="mono text-[clamp(0.9rem,1.4vw,1.2rem)] text-ivory-soft">
        {sessionNumber(session.number)} <span className="text-ivory-faint">· {clockTime(session.createdAt)}</span>
      </p>
    </div>
  );
}
