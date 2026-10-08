"use client";

import { useEffect, useMemo, useState } from "react";
import type { Snapshot } from "@booth/db";
import { Composite, sessionPhotos } from "@/components/composite";
import { useSnapshot } from "@/components/use-snapshot";

const DWELL_MS = 7000;

/**
 * The TV. Loops the latest photos, newest first, and cuts to a fresh one
 * the moment it lands. Nothing to tap, so it is not a kiosk surface.
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
    <main className="relative flex h-dvh items-center justify-center overflow-hidden bg-night p-[6vmin] text-cream" data-testid="slideshow">
      {current && template ? (
        <div key={current.id} className="h-full w-full animate-rise">
          <Composite template={template} photos={sessionPhotos(current.shots)} filter={current.filter} mirrored={current.mirrored} className="rounded-2xl shadow-[0_60px_120px_-40px_rgba(0,0,0,0.9)]" fit />
        </div>
      ) : (
        <div className="text-center">
          <p className="eyebrow">{snapshot.booth.eventName}</p>
          <p className="display-italic mt-4 text-[clamp(3rem,7vw,6rem)]">Photos appear here</p>
        </div>
      )}
      <p className="eyebrow absolute right-[4vmin] bottom-[3vmin]">{snapshot.booth.eventName}</p>
    </main>
  );
}
