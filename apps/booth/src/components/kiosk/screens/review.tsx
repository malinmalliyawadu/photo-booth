"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { Check, FlipHorizontal2, Printer, RotateCcw, X } from "lucide-react";
import { cssFilter, filterById, needsFilterChoice, type FilterId } from "@booth/core";
import type { SessionView, TemplateSummary } from "@booth/db";
import { Grain, Spotlight } from "@/components/chrome";
import { Composite, MIRROR_TRANSFORM, sessionPhotos } from "@/components/composite";
import type { Sounds } from "../sounds";

/**
 * The photos, through the filter the guest picks here, flipped if they
 * want them the way the mirror showed them. A tap shows at once on the
 * print and goes to the booth; the snapshot confirms it a moment later.
 * The swatches are the first photo through each look, so the comparison
 * is on the guest's own face, not a sample.
 */
export function ReviewScreen({
  session,
  template,
  filters,
  sounds,
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
  sounds: Sounds;
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
  const asking = needsFilterChoice(filters);
  // The photos are in: a chime as the review opens.
  useEffect(() => sounds.chime(), [sounds]);
  return (
    <div className="relative flex h-dvh flex-col overflow-hidden px-12 pt-safe-8 pb-safe-8" data-testid="review" data-filter={filter} data-mirrored={mirrored}>
      <Spotlight />
      <Grain />
      <header className="relative flex items-end justify-between">
        <div className="animate-rise">
          <p className="eyebrow">{asking ? "Step three of three" : "Looking good"}</p>
          <h1 className="display mt-3 text-[clamp(2.75rem,6vw,4.5rem)]">{asking ? "Choose your look" : "Here's your photo"}</h1>
        </div>
        <button type="button" onClick={onCancel} className="tap tap-ghost tap-sm" disabled={busy}>
          <X className="h-5 w-5" /> Start over
        </button>
      </header>

      <div className="relative my-6 grid min-h-0 flex-1 grid-cols-[1.4fr_1fr] gap-10">
        <div className="min-h-0 animate-rise">
          <Composite template={template} photos={sessionPhotos(session.shots)} filter={filter} mirrored={mirrored} fit mat />
        </div>
        <div className="card flex min-h-0 animate-rise flex-col overflow-y-auto p-3" style={{ animationDelay: "120ms" }}>
          {asking && (
            <div role="radiogroup" aria-label="Filter" data-testid="filters" className="flex flex-col gap-1">
              {filters.map((id) => (
                <Choice
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
                </Choice>
              ))}
            </div>
          )}
          {asking && <div className="hairline mx-4 mt-auto mb-2 shrink-0 pt-2" aria-hidden />}
          {/* The photo the way the mirror showed it: the swatch is the first shot flipped, in the chosen look. */}
          <Choice
            role="switch"
            selected={mirrored}
            label="Mirrored"
            hint="The way you saw yourself"
            icon={<FlipHorizontal2 className="h-5 w-5" />}
            testId="mirror"
            onClick={() => {
              setFlipped(!mirrored);
              onMirror(!mirrored);
            }}
          >
            {sample && (
              <img src={sample} alt="" className="h-full w-full object-cover" style={{ filter: cssFilter(filter), transform: MIRROR_TRANSFORM }} draggable={false} />
            )}
          </Choice>
        </div>
      </div>

      <footer className="relative flex items-center justify-end gap-4">
        <button type="button" onClick={onRetake} className="tap tap-ghost" disabled={busy}>
          <RotateCcw className="h-7 w-7" /> Retake
        </button>
        <button type="button" onClick={onAccept} className="tap" disabled={busy} data-testid="accept">
          <Printer className="h-8 w-8" strokeWidth={2.2} /> Print it
        </button>
      </footer>
    </div>
  );
}

/**
 * One choice on the review screen: a swatch of the guest's own first
 * photo the way this option would show it, with its name beside it,
 * and a check (a radio) or a switch at the end of the row.
 */
function Choice({
  role,
  selected,
  label,
  hint,
  icon,
  testId,
  onClick,
  children,
}: {
  role: "radio" | "switch";
  selected: boolean;
  label: string;
  hint?: string;
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
      className={`flex min-h-[4.6rem] w-full shrink-0 items-center gap-4 rounded-xl px-3 py-2 text-left transition-[background,transform] duration-150 active:scale-[0.985] ${
        selected ? "bg-gold-tint shadow-[inset_0_0_0_1px_var(--color-gold)]" : "active:bg-velvet-lifted"
      }`}
    >
      <div className="h-14 w-[4.75rem] shrink-0 overflow-hidden rounded-md bg-velvet-lifted shadow-[0_8px_20px_-8px_rgba(0,0,0,0.8)]">{children}</div>
      <span className="min-w-0 flex-1">
        <span className={`flex items-center gap-2 text-xl font-semibold ${selected ? "text-ivory" : "text-ivory-soft"}`}>
          {icon}
          {label}
        </span>
        {hint && <span className="mt-0.5 block text-sm text-ivory-faint">{hint}</span>}
      </span>
      {role === "radio" ? (
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
            selected ? "bg-gold text-velvet" : "ring-1 ring-ivory/30"
          }`}
          aria-hidden
        >
          {selected && <Check className="h-5 w-5" strokeWidth={3} />}
        </span>
      ) : (
        <span className="switch" aria-checked={selected} aria-hidden />
      )}
    </button>
  );
}
