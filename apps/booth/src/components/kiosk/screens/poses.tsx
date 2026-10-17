"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useState } from "react";
import { Shuffle, Sparkles, X } from "lucide-react";
import { planPoses, poseById, poseImageUrl, type CameraMode, type PoseId } from "@booth/core";
import type { TemplateSummary } from "@booth/db";
import { Grain, Spotlight } from "@/components/chrome";
import { CameraPreview } from "../camera-preview";
import type { FaceFinder } from "../face-finder";
import type { IpadCamera } from "../use-ipad-camera";
import { words } from "./props";

/**
 * Before posing: for the guests who freeze when the countdown starts,
 * an idea for each photo. The plan is drawn here, for as many people as
 * the iPad sees in the frame (the most it has seen since they arrived,
 * so a face lost for a moment does not reshuffle it), and can be drawn
 * again; the guests who want it start the countdown with it, the
 * others without. Nothing is stored until they start.
 */
export function PosesScreen({
  template,
  cameraMode,
  camera,
  finder,
  step,
  next,
  busy,
  error,
  onChoose,
  onBack,
}: {
  template: TemplateSummary;
  cameraMode: CameraMode;
  camera: IpadCamera;
  finder: FaceFinder | null;
  /** Which step this is, and of how many, for the eyebrow. */
  step: { n: number; of: number };
  /** What a choice leads to: the props, or straight into the countdown. */
  next: "props" | "countdown";
  busy: boolean;
  error: string | null;
  onChoose: (poses: PoseId[] | null) => void;
  onBack: () => void;
}) {
  // The most faces seen at once; the plan is for that many, or for
  // anyone while nobody has been seen (another camera, nobody in the frame yet).
  const [people, setPeople] = useState(0);
  const seen = useCallback((count: number) => setPeople((most) => Math.max(most, count)), []);
  const headcount = people === 0 ? null : Math.min(people, 3);
  const [plan, setPlan] = useState<{ for: number | null; poses: PoseId[] }>(() => ({ for: null, poses: planPoses(template.shotCount, null, Math.random) }));
  if (plan.for !== headcount) setPlan({ for: headcount, poses: planPoses(template.shotCount, headcount, Math.random) });
  const shuffle = () => setPlan({ for: headcount, poses: planPoses(template.shotCount, headcount, Math.random) });
  const counting = cameraMode === "ipad" && finder !== null;
  const one = template.shotCount === 1;

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden px-12 pt-safe-8 pb-safe-8" data-testid="poses" data-people={people}>
      <Spotlight />
      <Grain />
      <header className="relative flex items-end justify-between">
        <div className="animate-rise">
          <p className="eyebrow">
            Step {words(step.n)} of {words(step.of)}
          </p>
          <h1 className="display mt-3 text-[clamp(2.75rem,6vw,4.5rem)]">Want some pose ideas?</h1>
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
          <CameraPreview cameraMode={cameraMode} camera={camera} finder={finder} slots={template.slots} shot={1} prop="none" look="none" onPeople={seen} />
        </div>
        <div className="card flex min-h-0 animate-rise flex-col p-5" style={{ animationDelay: "120ms" }}>
          <p className="text-base text-ivory-soft">
            Not sure what to do when the countdown starts? Take {one ? "an idea for your photo" : "an idea for each photo"}: it is on the screen
            while the digits run, with extra seconds to get into it.
          </p>
          <ol className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto" data-testid="pose-plan">
            {plan.poses.map((id, i) => {
              const pose = poseById(id);
              return (
                <li
                  key={`${i}-${id}`}
                  className="flex animate-rise items-center gap-3 rounded-xl bg-velvet-lifted/60 py-1.5 pr-3.5 pl-2"
                  style={{ animationDelay: `${i * 60}ms` }}
                  data-testid={`pose-idea-${i + 1}`}
                  data-pose={id}
                >
                  <img src={poseImageUrl(id)} alt="" className="h-14 w-14 shrink-0" draggable={false} />
                  <span className="display text-xl text-gold">{String(i + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="display-italic block text-[1.35rem] leading-tight">{pose.title}</span>
                    <span className="mt-0.5 block text-sm text-ivory-faint">{pose.hint}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="mt-3 flex items-center justify-between gap-4">
            {counting ? (
              <p className="eyebrow eyebrow-dim" data-testid="headcount">
                {people === 0 ? "Step into the frame" : people === 1 ? "Just you in the frame" : `${people} of you in the frame`}
              </p>
            ) : (
              <span />
            )}
            <button type="button" onClick={shuffle} className="tap tap-ghost tap-sm" disabled={busy} data-testid="shuffle">
              <Shuffle className="h-5 w-5" /> Other ideas
            </button>
          </div>
        </div>
      </div>

      <footer className="relative flex items-center justify-end gap-4">
        <button type="button" onClick={() => onChoose(null)} className="tap tap-ghost" disabled={busy} data-testid="poses-skip">
          {next === "countdown" ? "Start without" : "No thanks"}
        </button>
        <button type="button" onClick={() => onChoose(plan.poses)} className="tap" disabled={busy} data-testid="poses-take">
          <Sparkles className="h-8 w-8" strokeWidth={2.2} /> {next === "countdown" ? "Start with ideas" : "Yes please"}
        </button>
      </footer>
    </div>
  );
}
