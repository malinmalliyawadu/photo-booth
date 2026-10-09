"use client";

import { Camera, Cpu, Droplet, Layers, Pause, Play, Printer, UploadCloud } from "lucide-react";
import { INK_LOW, PAPER_LOW } from "@booth/core";
import type { ComponentName, SessionView, TemplateSummary } from "@booth/db";
import { Composite, sessionPhotos } from "@/components/composite";
import { PHASE_LABEL, PRINT_LABEL, sessionNumber, timeAgo } from "@/lib/format";
import { Gauge, Section, Stepper, SupplyPill } from "./controls";
import { COMPONENT_NAMES, componentTone } from "./health";
import { useAdmin } from "./shell";

/** What is happening and what to do about it: the components, the guest in the booth, the supplies, the pause. */
export function LiveTab() {
  const { snapshot, setBooth } = useAdmin();
  const { booth, components, session, templates, queue } = snapshot;
  return (
    <>
      <Section title="Right now" eyebrow={session ? "In the booth" : "Idle"}>
        {session ? (
          <ActiveSession session={session} templates={templates} />
        ) : (
          <p className="text-sm text-ivory-soft">Nobody in the booth. The attract loop is showing.</p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2" data-testid="components">
          {COMPONENT_NAMES.map((name) => (
            <ComponentCard
              key={name}
              name={name}
              value={components[name]}
              tone={componentTone(snapshot, name)}
              now={snapshot.at}
              reporter={name === "camera" && booth.cameraMode === "ipad" ? "the iPad" : "the worker"}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="pill pill-off">
            <UploadCloud className="h-3.5 w-3.5" /> {queue.pendingSync} {queue.pendingSync === 1 ? "upload" : "uploads"} queued
          </span>
          {queue.failed > 0 && <span className="pill pill-error">{queue.failed} jobs failed</span>}
        </div>
      </Section>

      <button
        type="button"
        className={`btn mt-5 w-full min-h-14 text-base ${booth.paused ? "btn-primary" : ""}`}
        onClick={() => setBooth({ paused: !booth.paused }, "Pause")}
        data-testid="pause"
      >
        {booth.paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
        {booth.paused ? "Resume the booth" : "Pause the booth"}
      </button>

      <Section title="Supplies" eyebrow="SELPHY CP1300">
        <Supply
          icon={<Layers className="h-4 w-4" />}
          label="Paper"
          hint="postcards in the tray"
          value={booth.paperLeft}
          max={booth.paperTraySize}
          low={PAPER_LOW}
          onChange={(paperLeft) => setBooth({ paperLeft }, "Paper")}
          onRefill={() => setBooth({ paperLeft: booth.paperTraySize }, "Paper")}
          refillLabel="Tray refilled"
          testId="paper"
          refillTestId="refill-paper"
        />
        <div className="hairline my-4" aria-hidden />
        <Supply
          icon={<Droplet className="h-4 w-4" />}
          label="Ink"
          hint="prints left on the cassette"
          value={booth.inkLeft}
          max={booth.inkCassetteSize}
          low={INK_LOW}
          onChange={(inkLeft) => setBooth({ inkLeft }, "Ink")}
          onRefill={() => setBooth({ inkLeft: booth.inkCassetteSize }, "Ink")}
          refillLabel="Ink replaced"
          testId="ink"
          refillTestId="new-ink"
        />
      </Section>
    </>
  );
}

function ActiveSession({ session, templates }: { session: SessionView; templates: TemplateSummary[] }) {
  const template = templates.find((t) => t.id === session.templateId);
  return (
    <div className="flex items-center gap-4 rounded-xl bg-gold-tint/50 p-3 ring-1 ring-gold/30" data-testid={`session-${session.id}`}>
      {template && session.shots.length > 0 ? (
        <Composite template={template} photos={sessionPhotos(session.shots)} composed={session.thumbUrl} filter={session.filter} mirrored={session.mirrored} className="w-24 shrink-0 rounded-sm" />
      ) : (
        <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-sm bg-velvet text-ivory-faint">
          <Camera className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="display text-2xl text-gold">{sessionNumber(session.number)}</p>
        <p className="text-sm text-ivory">
          {PHASE_LABEL[session.phase]}
          {session.phase === "countdown" || session.phase === "capturing" ? `, photo ${session.shot} of ${session.shotCount}` : ""}
        </p>
        <p className="text-xs text-ivory-faint">
          {template?.name ?? "Unknown layout"}
          {session.print ? ` · ${PRINT_LABEL[session.print]}` : ""}
        </p>
      </div>
      <span className="pill pill-gold">Live</span>
    </div>
  );
}

function ComponentCard({
  name,
  value,
  tone,
  now,
  reporter,
}: {
  name: ComponentName;
  value: { status: string; detail: string; seenAt: string } | undefined;
  tone: "ok" | "warn" | "error" | "off";
  now: string;
  /** Who writes this component's health, for the stale message. */
  reporter: string;
}) {
  const stale = value && tone === "error" && value.status !== "error";
  const Icon = name === "camera" ? Camera : name === "printer" ? Printer : name === "sync" ? UploadCloud : Cpu;
  return (
    <div className="rounded-xl bg-velvet p-3 ring-1 ring-velvet-edge" data-testid={`component-${name}`} data-status={tone}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold capitalize">
          <Icon className="h-4 w-4 text-ivory-faint" />
          {name}
        </span>
        <span className={`pill pill-${tone}`}>{tone}</span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-ivory-soft">{stale ? `Not heard from ${reporter}` : (value?.detail ?? "Not started")}</p>
      {value && <p className="mono mt-1 text-[11px] text-ivory-faint">{timeAgo(value.seenAt, new Date(now).getTime())}</p>}
    </div>
  );
}

function Supply({
  icon,
  label,
  hint,
  value,
  max,
  low,
  onChange,
  onRefill,
  refillLabel,
  testId,
  refillTestId,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  value: number;
  max: number;
  low: number;
  onChange: (v: number) => void;
  onRefill: () => void;
  refillLabel: string;
  testId: string;
  refillTestId: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-ivory-faint">{icon}</span>
          {label}
          <span className="font-normal text-ivory-faint">{hint}</span>
        </span>
        <SupplyPill left={value} low={low} />
      </div>
      <div className="mt-2">
        <Gauge value={value} max={max} low={low} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <Stepper value={value} min={0} max={max} suffix={`/${max}`} onChange={onChange} testId={testId} />
        <button type="button" className="btn" onClick={onRefill} data-testid={refillTestId}>
          {refillLabel}
        </button>
      </div>
    </div>
  );
}
