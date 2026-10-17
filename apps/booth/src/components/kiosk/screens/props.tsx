"use client";

import { useState } from "react";
import { Camera, X } from "lucide-react";
import { propById, propChoices, type PropId } from "@booth/core";
import type { TemplateSummary } from "@booth/db";
import { Grain, Spotlight } from "@/components/chrome";
import { CameraPreview } from "../camera-preview";
import { PropSwatch, PropTile } from "../choice";
import type { FaceFinder } from "../face-finder";
import type { IpadCamera } from "../use-ipad-camera";

/**
 * Before posing: the guests try the props on, live, in the viewfinder
 * they are about to pose in, and start the countdown wearing the ones
 * they like. Nothing is stored until they start; the session begins
 * with the props chosen, and the review lets them change their minds.
 */
export function PropsScreen({
  template,
  offered,
  camera,
  finder,
  step,
  busy,
  error,
  onStart,
  onBack,
}: {
  template: TemplateSummary;
  /** The props the booth offers; "no props" is always a choice besides. */
  offered: PropId[];
  camera: IpadCamera;
  finder: FaceFinder | null;
  /** Which step this is, and of how many, for the eyebrow. */
  step: { n: number; of: number };
  busy: boolean;
  error: string | null;
  onStart: (prop: PropId) => void;
  onBack: () => void;
}) {
  const choices = propChoices(offered);
  // The first prop on, so the guests see what this is the moment they arrive.
  const [prop, setProp] = useState<PropId>(choices[1] ?? choices[0]!);
  return (
    <div className="relative flex h-dvh flex-col overflow-hidden px-12 pt-safe-8 pb-safe-8" data-testid="props" data-prop={prop}>
      <Spotlight />
      <Grain />
      <header className="relative flex items-end justify-between">
        <div className="animate-rise">
          <p className="eyebrow">
            Step {words(step.n)} of {words(step.of)}
          </p>
          <h1 className="display mt-3 text-[clamp(2.75rem,6vw,4.5rem)]">Try on some props</h1>
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

      <div className="relative my-6 grid min-h-0 flex-1 grid-cols-[1.4fr_1fr] gap-10">
        <div className="min-h-0 animate-rise overflow-hidden rounded-2xl shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)]">
          <CameraPreview cameraMode="ipad" camera={camera} finder={finder} slots={template.slots} shot={1} prop={prop} look="none" />
        </div>
        <div className="card flex min-h-0 animate-rise flex-col p-3" style={{ animationDelay: "120ms" }}>
          <p className="px-3 pt-2 pb-3 text-lg text-ivory-soft">Everyone in the photo wears them. You can change them after.</p>
          <div role="radiogroup" aria-label="Props" data-testid="prop-choices" className="grid min-h-0 grid-cols-3 content-start gap-1 overflow-y-auto">
            {choices.map((id) => (
              <PropTile key={id} selected={prop === id} label={propById(id).name} testId={`prop-${id}`} onClick={() => setProp(id)}>
                <PropSwatch prop={id} />
              </PropTile>
            ))}
          </div>
        </div>
      </div>

      <footer className="relative flex items-center justify-end gap-4">
        <button type="button" onClick={() => onStart(prop)} className="tap" disabled={busy} data-testid="start">
          <Camera className="h-8 w-8" strokeWidth={2.2} /> Start the countdown
        </button>
      </footer>
    </div>
  );
}

const WORDS = ["zero", "one", "two", "three", "four", "five"];

/** "two", for "Step two of four". */
export function words(n: number): string {
  return WORDS[n] ?? String(n);
}
