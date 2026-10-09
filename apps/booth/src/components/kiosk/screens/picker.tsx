"use client";

import { X } from "lucide-react";
import type { TemplateSummary } from "@booth/db";
import { Grain, Spotlight } from "@/components/chrome";
import { Composite, samplePhotos } from "@/components/composite";

/** Step one: the layouts on offer, each shown as the print it makes. */
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
    <div className="relative flex h-dvh flex-col overflow-hidden px-12 pt-safe-9 pb-safe-8" data-testid="picker">
      <Spotlight />
      <Grain />
      <header className="relative flex items-end justify-between">
        <div className="animate-rise">
          <p className="eyebrow">Step one of three</p>
          <h1 className="display mt-3 text-[clamp(2.75rem,6vw,4.5rem)]">Choose your layout</h1>
        </div>
        <button type="button" onClick={onBack} className="tap tap-ghost tap-sm" disabled={busy}>
          <X className="h-6 w-6" /> Back
        </button>
      </header>
      {error && (
        <p className="relative mt-5 rounded-2xl bg-claret-tint px-6 py-4 text-xl text-claret" role="alert">
          {error}
        </p>
      )}
      <div
        className="relative mt-7 grid min-h-0 flex-1 gap-5"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
      >
        {templates.map((t, i) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            disabled={busy}
            data-testid={`layout-${t.id}`}
            className="card group flex min-h-0 animate-rise flex-col gap-4 p-5 text-left transition-[transform,box-shadow] duration-150 active:scale-[0.975] active:shadow-[inset_0_0_0_1px_var(--color-gold)] disabled:opacity-60"
            style={{ animationDelay: `${90 + i * 80}ms` }}
          >
            <div className="flex items-baseline gap-3">
              <span className="display text-3xl text-gold">{String(i + 1).padStart(2, "0")}</span>
              <span className="display min-w-0 flex-1 truncate text-2xl">{t.name}</span>
              <span className="mono text-sm text-ivory-faint">
                {t.shotCount} {t.shotCount === 1 ? "photo" : "photos"}
              </span>
            </div>
            <div className="min-h-0 flex-1 pb-1">
              <Composite template={t} photos={samplePhotos(t.shotCount, i)} fit mat />
            </div>
          </button>
        ))}
        {templates.length === 0 && (
          <p className="col-span-full self-center text-center text-2xl text-ivory-soft">
            No layouts are switched on. The attendant can fix that from the admin page.
          </p>
        )}
      </div>
    </div>
  );
}
