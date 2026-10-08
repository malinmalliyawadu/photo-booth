"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Camera, Lock, Minus, Pause, Play, Plus, Printer, RefreshCw, Trash2, Upload } from "lucide-react";
import type { CameraMode } from "@booth/core";
import type { ComponentName, SessionView, Snapshot, TemplateRow, TemplateSummary } from "@booth/db";
import { Composite, samplePhotos, sessionPhotos } from "@/components/composite";
import { patch, post, useSnapshot } from "@/components/use-snapshot";
import { PHASE_LABEL, PRINT_LABEL, clockTime, sessionNumber, timeAgo } from "@/lib/format";

const STALE_MS = 15_000;

export function AdminPanel({ initial }: { initial: Snapshot }) {
  const { snapshot, connected } = useSnapshot(initial);
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();

  async function run(label: string, fn: () => Promise<Response>) {
    const res = await fn().catch(() => null);
    if (!res) return setToast(`${label}: the booth did not answer`);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setToast(`${label}: ${data.error ?? res.status}`);
    }
  }
  const setBooth = (body: Record<string, unknown>, label = "Settings") => run(label, () => patch("/api/admin/booth", body));

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const { booth, components, templates, session, recent, queue } = snapshot;

  return (
    <main className="min-h-dvh bg-night pb-24 text-cream">
      <div className="mx-auto max-w-xl px-4 pt-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Booth admin</p>
            <h1 className="display mt-1 text-3xl">{booth.eventName}</h1>
          </div>
          <span className={`pill ${connected ? "pill-ok" : "pill-warn"}`} data-testid="connection">
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-mint" : "bg-gold"}`} />
            {connected ? "Live" : "Reconnecting"}
          </span>
        </header>

        {toast && (
          <p className="mt-4 rounded-xl bg-rose-tint px-4 py-3 text-sm text-rose" role="alert" data-testid="toast">
            {toast}
          </p>
        )}

        <Section title="Now" eyebrow="Status">
          <div className="grid grid-cols-2 gap-2" data-testid="components">
            {(["worker", "camera", "printer", "sync"] as ComponentName[]).map((name) => (
              <ComponentCard
                key={name}
                name={name}
                value={components[name]}
                now={snapshot.at}
                reporter={name === "camera" && booth.cameraMode === "ipad" ? "the iPad" : "the worker"}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-cream-soft">
            <span className="pill pill-off">{queue.pendingSync} uploads queued</span>
            {queue.failed > 0 && <span className="pill pill-error">{queue.failed} jobs failed</span>}
            {session ? (
              <span className="pill pill-warn">
                {sessionNumber(session.number)} {PHASE_LABEL[session.phase].toLowerCase()}
              </span>
            ) : (
              <span className="pill pill-off">Booth idle</span>
            )}
          </div>
        </Section>

        <Section title="Controls" eyebrow="Booth">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`btn ${booth.paused ? "btn-primary" : ""}`}
              onClick={() => setBooth({ paused: !booth.paused }, "Pause")}
              data-testid="pause"
            >
              {booth.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {booth.paused ? "Resume the booth" : "Pause the booth"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setBooth({ paperLeft: booth.paperPackSize }, "Paper")}
              data-testid="new-pack"
            >
              <RefreshCw className="h-4 w-4" /> New paper pack
            </button>
          </div>

          <Row label="Camera">
            <Segmented<CameraMode>
              value={booth.cameraMode}
              options={[
                ["fake", "Fake"],
                ["gphoto2", "DSLR"],
                ["ipad", "iPad"],
              ]}
              onChange={(cameraMode) => setBooth({ cameraMode }, "Camera")}
            />
          </Row>

          <Row label="Countdown">
            <Stepper
              value={booth.countdownSeconds}
              min={1}
              max={15}
              suffix="s"
              onChange={(countdownSeconds) => setBooth({ countdownSeconds }, "Countdown")}
            />
          </Row>

          <Row label="Paper left">
            <div className="flex items-center gap-2">
              <Stepper
                value={booth.paperLeft}
                min={0}
                max={999}
                onChange={(paperLeft) => setBooth({ paperLeft }, "Paper")}
                testId="paper"
              />
              <span className="mono text-sm text-cream-faint">of {booth.paperPackSize}</span>
              {booth.paperLeft <= 10 && <span className="pill pill-warn">Low</span>}
            </div>
          </Row>

          <Row label="Only offer">
            <select
              className="field"
              value={booth.lockedTemplateId ?? ""}
              onChange={(e) => setBooth({ lockedTemplateId: e.target.value || null }, "Layout lock")}
              data-testid="lock"
            >
              <option value="">Every active layout</option>
              {templates
                .filter((t) => t.active)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} only
                  </option>
                ))}
            </select>
          </Row>

          <EventName value={booth.eventName} onSave={(eventName) => setBooth({ eventName }, "Event name")} />
        </Section>

        <Section title="Layouts" eyebrow="Templates">
          <ul className="space-y-3">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center gap-3" data-testid={`template-${t.id}`}>
                <Composite template={t} photos={samplePhotos(t.shotCount)} className="w-24 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{t.name}</p>
                  <p className="mono text-xs text-cream-faint">
                    {t.slots.length} {t.slots.length === 1 ? "slot" : "slots"}, {t.shotCount} {t.shotCount === 1 ? "shot" : "shots"}, {t.orientation}
                  </p>
                  {t.warnings.length > 0 && <p className="mt-1 text-xs text-gold">{t.warnings.join(" ")}</p>}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={t.active}
                    onChange={(e) => run("Layout", () => patch(`/api/admin/templates/${t.id}`, { active: e.target.checked }))}
                    className="h-5 w-5 accent-ember"
                    data-testid={`template-active-${t.id}`}
                  />
                  On
                </label>
                <button
                  type="button"
                  className="btn btn-danger min-h-9 px-2"
                  aria-label={`Delete ${t.name}`}
                  onClick={() => {
                    if (confirm(`Delete the layout "${t.name}"?`)) void run("Delete", () => fetch(`/api/admin/templates/${t.id}`, { method: "DELETE" }));
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <UploadForm onDone={(msg) => setToast(msg)} />
        </Section>

        <Section title="Sessions" eyebrow={`Last ${recent.length}`}>
          {session && <SessionRow s={session} templates={templates} onAction={run} live />}
          {recent.map((s) => (
            <SessionRow key={s.id} s={s} templates={templates} onAction={run} />
          ))}
          {recent.length === 0 && !session && <p className="text-sm text-cream-soft">Nothing yet.</p>}
        </Section>

        <button
          type="button"
          className="btn mt-8 w-full"
          onClick={async () => {
            await fetch("/api/admin/login", { method: "DELETE" });
            router.push("/admin/login");
            router.refresh();
          }}
        >
          <Lock className="h-4 w-4" /> Sign out
        </button>
      </div>
    </main>
  );
}

function Section({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="card mt-5 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="display text-xl">{title}</h2>
        <span className="eyebrow">{eyebrow}</span>
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 grid grid-cols-[6.5rem_1fr] items-center gap-3">
      <span className="text-sm font-semibold text-cream-soft">{label}</span>
      {children}
    </div>
  );
}

function ComponentCard({
  name,
  value,
  now,
  reporter,
}: {
  name: ComponentName;
  value: Snapshot["components"][ComponentName];
  now: string;
  /** Who writes this component's health, for the stale message. */
  reporter: string;
}) {
  const stale = value && new Date(now).getTime() - new Date(value.seenAt).getTime() > STALE_MS;
  const status = !value ? "off" : stale ? "error" : value.status;
  const icon = name === "camera" ? <Camera className="h-4 w-4" /> : name === "printer" ? <Printer className="h-4 w-4" /> : null;
  return (
    <div className="rounded-xl bg-night p-3 ring-1 ring-night-edge" data-testid={`component-${name}`} data-status={status}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold capitalize">
          {icon}
          {name}
        </span>
        <span className={`pill pill-${status}`}>{status}</span>
      </div>
      <p className="mt-1 text-xs leading-snug text-cream-soft">{stale ? `Not heard from ${reporter}` : (value?.detail ?? "Not started")}</p>
      {value && <p className="mono mt-1 text-[11px] text-cream-faint">{timeAgo(value.seenAt, new Date(now).getTime())}</p>}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-night p-1 ring-1 ring-night-edge" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`rounded-lg py-2 text-sm font-semibold transition ${value === v ? "bg-ember text-night" : "text-cream-soft"}`}
          data-testid={`camera-${v}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  suffix = "",
  onChange,
  testId,
}: {
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
  testId?: string;
}) {
  return (
    <div className="inline-flex items-center rounded-xl bg-night ring-1 ring-night-edge">
      <button type="button" className="px-3 py-2" aria-label="Less" onClick={() => onChange(Math.max(min, value - 1))}>
        <Minus className="h-4 w-4" />
      </button>
      <span className="mono min-w-12 text-center" data-testid={testId}>
        {value}
        {suffix}
      </span>
      <button type="button" className="px-3 py-2" aria-label="More" onClick={() => onChange(Math.min(max, value + 1))}>
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function EventName({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(value);
  if (saved !== value) {
    setSaved(value);
    setDraft(value);
  }
  return (
    <Row label="Event">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim() && draft !== value) onSave(draft.trim());
        }}
      >
        <input className="field" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={60} data-testid="event-name" />
        <button type="submit" className="btn" disabled={draft.trim() === value || !draft.trim()}>
          Save
        </button>
      </form>
    </Row>
  );
}

function UploadForm({ onDone }: { onDone: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TemplateRow | null>(null);
  const form = useRef<HTMLFormElement>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/admin/templates", { method: "POST", body: new FormData(e.currentTarget) }).catch(() => null);
    setBusy(false);
    if (!res) return onDone("Upload: the booth did not answer");
    const data = (await res.json().catch(() => ({}))) as TemplateRow & { error?: string };
    if (!res.ok) return onDone(`Upload: ${data.error ?? res.status}`);
    setResult(data);
    form.current?.reset();
  }

  return (
    <form ref={form} onSubmit={submit} className="mt-4 space-y-3 rounded-xl bg-night p-3 ring-1 ring-night-edge" data-testid="upload">
      <p className="text-sm font-semibold">Add a layout</p>
      <p className="text-xs text-cream-soft">A PNG from Canva with every photo slot painted #FF00FF. Add the JSON sidecar if two slots share a shot or the layout has text to fill in.</p>
      <input name="name" className="field" placeholder="Name (optional)" maxLength={60} />
      <label className="block text-xs text-cream-soft">
        PNG
        <input name="png" type="file" accept="image/png" required className="file-input" data-testid="upload-png" />
      </label>
      <label className="block text-xs text-cream-soft">
        Sidecar JSON (optional)
        <input name="sidecar" type="file" accept="application/json,.json" className="file-input" />
      </label>
      <button type="submit" className="btn w-full" disabled={busy}>
        <Upload className="h-4 w-4" /> {busy ? "Reading slots" : "Upload"}
      </button>
      {result && (
        <div className="space-y-2 rounded-lg bg-night-raised p-3" data-testid="upload-result">
          <p className="text-sm">
            <span className="font-semibold">{result.name}</span>: {result.slots.length} slots, {result.shotCount} shots
          </p>
          <Composite
            template={{ ...result, screenUrl: `/media/templates/${result.id}.thumb.png` }}
            photos={samplePhotos(result.shotCount)}
            className="w-full rounded-md"
          />
          {result.warnings.map((w) => (
            <p key={w} className="text-xs text-gold">
              {w}
            </p>
          ))}
        </div>
      )}
    </form>
  );
}

function SessionRow({
  s,
  templates,
  onAction,
  live = false,
}: {
  s: SessionView;
  templates: TemplateSummary[];
  onAction: (label: string, fn: () => Promise<Response>) => Promise<void>;
  live?: boolean;
}) {
  const template = templates.find((t) => t.id === s.templateId);
  const complete = s.takenCount === s.shotCount && s.shots.length > 0;
  return (
    <div className={`flex items-center gap-3 border-t border-night-edge py-3 first:border-t-0 ${live ? "rounded-lg bg-ember-tint/40 px-2" : ""}`} data-testid={`session-${s.id}`}>
      {template && s.shots.length > 0 ? (
        <Composite template={template} photos={sessionPhotos(s.shots)} className="w-20 shrink-0 rounded-md" />
      ) : (
        <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-md bg-night text-cream-faint">
          <Camera className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0 flex-1 text-sm">
        <p className="flex items-center gap-2">
          <span className="mono font-medium">{sessionNumber(s.number)}</span>
          <span className="text-cream-faint">{clockTime(s.createdAt)}</span>
          {live && <span className="pill pill-warn">Live</span>}
        </p>
        <p className="text-cream-soft">
          {PHASE_LABEL[s.phase]}
          {s.print ? `, ${PRINT_LABEL[s.print].toLowerCase()}` : ""}
          {s.printCount > 1 ? ` (${s.printCount} prints)` : ""}
          {s.syncedAt ? ", synced" : ""}
        </p>
        {s.phase === "failed" && s.reason && <p className="text-xs text-rose">{s.reason}</p>}
      </div>
      {!live && complete && (
        <button
          type="button"
          className="btn min-h-9 px-2"
          aria-label="Print again"
          onClick={() => onAction("Reprint", () => post(`/api/admin/sessions/${s.id}/reprint`))}
          data-testid="reprint"
        >
          <Printer className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        className="btn btn-danger min-h-9 px-2"
        aria-label="Delete this session"
        onClick={() => {
          if (confirm(`Delete ${sessionNumber(s.number)} and its photos?`)) {
            void onAction("Delete", () => fetch(`/api/admin/sessions/${s.id}`, { method: "DELETE" }));
          }
        }}
        data-testid="delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
