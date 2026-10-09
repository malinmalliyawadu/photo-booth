"use client";

/* eslint-disable @next/next/no-img-element */
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Lock, Trash2, Upload, Volume2, VolumeX } from "lucide-react";
import { FILTERS, cssFilter, type CameraMode, type FilterId } from "@booth/core";
import type { TemplateRow } from "@booth/db";
import { Composite, samplePhotos } from "@/components/composite";
import { patch } from "@/components/use-snapshot";
import { Row, Section, Segmented, Stepper } from "./controls";
import { useAdmin } from "./shell";

/** Set once for the evening: the event, the camera, the countdown, the layouts and the looks on offer. */
export function SetupTab() {
  const { snapshot, setBooth, run, notify } = useAdmin();
  const { booth, templates } = snapshot;
  const router = useRouter();
  return (
    <>
      <Section title="The booth" eyebrow="Settings">
        <EventName value={booth.eventName} onSave={(eventName) => setBooth({ eventName }, "Event name")} />
        <Row label="Camera">
          <Segmented<CameraMode>
            value={booth.cameraMode}
            options={[
              ["fake", "Fake"],
              ["gphoto2", "DSLR"],
              ["ipad", "iPad"],
            ]}
            onChange={(cameraMode) => setBooth({ cameraMode }, "Camera")}
            testPrefix="camera"
          />
        </Row>
        <Row label="Countdown" hint="before each photo">
          <Stepper value={booth.countdownSeconds} min={1} max={15} suffix="s" onChange={(countdownSeconds) => setBooth({ countdownSeconds }, "Countdown")} />
        </Row>
        <Row label="Sounds" hint="ticks, shutter, chime">
          <button
            type="button"
            role="switch"
            aria-checked={booth.sounds}
            onClick={() => setBooth({ sounds: !booth.sounds }, "Sounds")}
            className="flex items-center gap-3 justify-self-start text-sm font-semibold"
            data-testid="sounds"
          >
            <span className="switch" aria-checked={booth.sounds} aria-hidden />
            {booth.sounds ? <Volume2 className="h-4 w-4 text-ivory-faint" /> : <VolumeX className="h-4 w-4 text-ivory-faint" />}
            {booth.sounds ? "On" : "Off"}
          </button>
        </Row>
        <Row label="Only offer" hint="skips the picker">
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
      </Section>

      <Section title="Looks" eyebrow="On the review screen">
        <p className="text-xs text-ivory-soft">What a guest can pick for their photos. Offer one and nothing is asked.</p>
        <FilterToggles offered={booth.filters} onChange={(filters) => setBooth({ filters }, "Filters")} />
      </Section>

      <Section title="Layouts" eyebrow="In the picker">
        <ul className="space-y-3">
          {templates
            .filter((t) => !t.deleted)
            .map((t) => (
              <li key={t.id} className="flex items-center gap-3" data-testid={`template-${t.id}`}>
                <Composite template={t} photos={samplePhotos(t.shotCount)} className="w-24 shrink-0 rounded-sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{t.name}</p>
                  <p className="mono text-xs text-ivory-faint">
                    {t.slots.length} {t.slots.length === 1 ? "slot" : "slots"}, {t.shotCount} {t.shotCount === 1 ? "shot" : "shots"}
                  </p>
                  <p className="mono text-xs text-ivory-faint">{t.orientation}</p>
                  {t.warnings.length > 0 && <p className="mt-1 text-xs text-amber">{t.warnings.join(" ")}</p>}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={t.active}
                    onChange={(e) => run("Layout", () => patch(`/api/admin/templates/${t.id}`, { active: e.target.checked }))}
                    className="h-5 w-5 accent-gold"
                    data-testid={`template-active-${t.id}`}
                  />
                  On
                </label>
                <button
                  type="button"
                  className="btn btn-icon btn-danger"
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
        <UploadForm onDone={notify} />
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
    </>
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
    <Row label="Event" hint="on every screen">
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

/**
 * One switch per filter in the catalogue, each with the same sample
 * through its look. The last one on cannot be switched off: the kiosk
 * always needs a filter to give a session.
 */
function FilterToggles({ offered, onChange }: { offered: FilterId[]; onChange: (filters: FilterId[]) => void }) {
  return (
    <ul className="mt-3 grid grid-cols-1 gap-2 min-[480px]:grid-cols-2" data-testid="filters">
      {FILTERS.map((f) => {
        const on = offered.includes(f.id);
        return (
          <li key={f.id}>
            <label className={`flex items-center gap-3 rounded-xl p-2 ring-1 ${on ? "bg-velvet ring-gold/40" : "bg-velvet ring-velvet-edge"}`}>
              <img src="/samples/sample-1.jpg" alt="" className="h-10 w-14 shrink-0 rounded-sm object-cover" style={{ filter: cssFilter(f.id) }} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{f.name}</span>
              <input
                type="checkbox"
                checked={on}
                disabled={on && offered.length === 1}
                onChange={(e) => onChange(e.target.checked ? [...offered, f.id] : offered.filter((id) => id !== f.id))}
                className="h-5 w-5 accent-gold disabled:opacity-40"
                data-testid={`filter-on-${f.id}`}
              />
            </label>
          </li>
        );
      })}
    </ul>
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
    <form ref={form} onSubmit={submit} className="mt-4 space-y-3 rounded-xl bg-velvet p-3 ring-1 ring-velvet-edge" data-testid="upload">
      <p className="text-sm font-semibold">Add a layout</p>
      <p className="text-xs text-ivory-soft">A PNG from Canva with every photo slot painted #FF00FF. Add the JSON sidecar if two slots share a shot or the layout has text to fill in.</p>
      <input name="name" className="field" placeholder="Name (optional)" maxLength={60} />
      <label className="block text-xs text-ivory-soft">
        PNG
        <input name="png" type="file" accept="image/png" required className="file-input" data-testid="upload-png" />
      </label>
      <label className="block text-xs text-ivory-soft">
        Sidecar JSON (optional)
        <input name="sidecar" type="file" accept="application/json,.json" className="file-input" />
      </label>
      <button type="submit" className="btn w-full" disabled={busy}>
        <Upload className="h-4 w-4" /> {busy ? "Reading slots" : "Upload"}
      </button>
      {result && (
        <div className="space-y-2 rounded-lg bg-velvet-raised p-3" data-testid="upload-result">
          <p className="text-sm">
            <span className="font-semibold">{result.name}</span>: {result.slots.length} slots, {result.shotCount} shots
          </p>
          <Composite template={{ ...result, screenUrl: `/media/templates/${result.id}.thumb.png` }} photos={samplePhotos(result.shotCount)} className="w-full rounded-sm" />
          {result.warnings.map((w) => (
            <p key={w} className="text-xs text-amber">
              {w}
            </p>
          ))}
        </div>
      )}
    </form>
  );
}
