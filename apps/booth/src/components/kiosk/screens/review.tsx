"use client";

import { useEffect, useState } from "react";
import { FlipHorizontal2, Printer, RotateCcw, X } from "lucide-react";
import {
  cssFilter,
  faceCrop,
  filterById,
  needsFilterChoice,
  needsPropChoice,
  propById,
  propChoices,
  type Face,
  type FilterId,
  type PropId,
} from "@booth/core";
import type { SessionView, ShotView, TemplateSummary } from "@booth/db";
import { Grain, Spotlight } from "@/components/chrome";
import { Composite, CoveredPhoto, FramedPhoto, sessionPhotos } from "@/components/composite";
import { Choice, PropSwatch, PropTile, SWATCH, TILE } from "../choice";
import type { Sounds } from "../sounds";
import { words } from "./props";

/**
 * The photos, through the look and the props the guest picks here,
 * flipped if they want them the way the mirror showed them. A tap shows
 * at once on the print and goes to the booth; the snapshot confirms it
 * a moment later. The swatches are the first photo through each look,
 * and a close-up of the biggest face in it wearing each prop, so the
 * comparison is on the guest's own face, not a sample. With both to
 * choose from, the card switches between them; the mirror is always at
 * its foot.
 */
export function ReviewScreen({
  session,
  template,
  filters,
  props,
  step,
  sounds,
  onFilter,
  onProp,
  onMirror,
  onAccept,
  onRetake,
  onCancel,
  busy,
}: {
  session: SessionView;
  template: TemplateSummary;
  /** The looks the booth offers; with one there is nothing to ask. */
  filters: FilterId[];
  /** The props the booth offers; asked only when the photos have faces to wear them. */
  props: PropId[];
  /** Which step this is, and of how many, when there is something to choose. */
  step: { n: number; of: number };
  sounds: Sounds;
  onFilter: (id: FilterId) => void;
  onProp: (id: PropId) => void;
  onMirror: (mirrored: boolean) => void;
  onAccept: () => void;
  onRetake: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [chosen, setChosen] = useState<FilterId | null>(null);
  if (chosen !== null && chosen === session.filter) setChosen(null);
  const filter = chosen ?? session.filter;
  const [worn, setWorn] = useState<PropId | null>(null);
  if (worn !== null && worn === session.prop) setWorn(null);
  const prop = worn ?? session.prop;
  const [flipped, setFlipped] = useState<boolean | null>(null);
  if (flipped !== null && flipped === session.mirrored) setFlipped(null);
  const mirrored = flipped ?? session.mirrored;
  const sample = session.shots[0];
  const askingLook = needsFilterChoice(filters);
  const askingProps = needsPropChoice(props) && session.shots.some((s) => s.faces?.length);
  const asking = askingLook || askingProps;
  const [tab, setTab] = useState<"look" | "props">(askingLook ? "look" : "props");
  const showing = askingLook && askingProps ? tab : askingLook ? "look" : "props";
  const look = cssFilter(filter);
  // The photos are in: a chime as the review opens.
  useEffect(() => sounds.chime(), [sounds]);
  return (
    <div
      className="relative flex h-dvh flex-col overflow-hidden px-12 pt-safe-8 pb-safe-8"
      data-testid="review"
      data-filter={filter}
      data-prop={prop}
      data-mirrored={mirrored}
    >
      <Spotlight />
      <Grain />
      <header className="relative flex items-end justify-between">
        <div className="animate-rise">
          <p className="eyebrow">{asking ? `Step ${words(step.n)} of ${words(step.of)}` : "Looking good"}</p>
          <h1 className="display mt-3 text-[clamp(2.75rem,6vw,4.5rem)]">{asking ? "Choose your look" : "Here's your photo"}</h1>
        </div>
        <button type="button" onClick={onCancel} className="tap tap-ghost tap-sm" disabled={busy}>
          <X className="h-5 w-5" /> Start over
        </button>
      </header>

      <div className="relative my-6 grid min-h-0 flex-1 grid-cols-[1.4fr_1fr] gap-10">
        <div className="min-h-0 animate-rise">
          <Composite template={template} photos={sessionPhotos(session.shots)} filter={filter} prop={prop} mirrored={mirrored} fit mat />
        </div>
        <div className="card flex min-h-0 animate-rise flex-col p-3" style={{ animationDelay: "120ms" }}>
          {askingLook && askingProps && (
            <div role="tablist" aria-label="Choose" className="mb-2 grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-velvet p-1">
              {(["look", "props"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={showing === t}
                  onClick={() => setTab(t)}
                  data-testid={`tab-${t}`}
                  className={`rounded-lg py-2.5 text-lg font-semibold transition-colors ${
                    showing === t ? "bg-gold-tint text-ivory shadow-[inset_0_0_0_1px_var(--color-gold)]" : "text-ivory-faint"
                  }`}
                >
                  {t === "look" ? "Look" : "Props"}
                </button>
              ))}
            </div>
          )}
          <div className="flex min-h-0 flex-col overflow-y-auto">
            {askingLook && showing === "look" && (
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
                    {sample && <CoveredPhoto photo={sample} box={SWATCH} look={cssFilter(id)} prop={prop} mirrored={false} />}
                  </Choice>
                ))}
              </div>
            )}
            {askingProps && showing === "props" && (
              <div role="radiogroup" aria-label="Props" data-testid="props-choices" className="grid grid-cols-4 gap-1">
                {propChoices(props).map((id) => (
                  <PropTile
                    key={id}
                    selected={prop === id}
                    label={propById(id).name}
                    testId={`prop-${id}`}
                    onClick={() => {
                      setWorn(id);
                      onProp(id);
                    }}
                  >
                    <FaceSwatch shot={sample} prop={id} look={look} />
                  </PropTile>
                ))}
              </div>
            )}
          </div>
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
            {sample && <CoveredPhoto photo={sample} box={SWATCH} look={look} prop={prop} mirrored />}
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
 * A prop on the biggest face in a photo, close up; the artwork alone
 * when the photo has no face to put it on.
 */
function FaceSwatch({ shot, prop, look }: { shot: ShotView | undefined; prop: PropId; look: string }) {
  const face = shot?.faces?.reduce<Face | null>((big, f) => (!big || f.box.width > big.box.width ? f : big), null);
  if (!shot?.width || !shot.height || !face) return <PropSwatch prop={prop} />;
  const frame = { width: shot.width, height: shot.height };
  return (
    <FramedPhoto
      photo={{ ...shot, ...frame }}
      crop={faceCrop(face, frame, TILE.width / TILE.height)}
      look={look}
      prop={prop}
      mirrored={false}
    />
  );
}
