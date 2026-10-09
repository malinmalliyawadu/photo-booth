"use client";

import { Camera, Printer, Trash2, UploadCloud } from "lucide-react";
import { filterById } from "@booth/core";
import type { SessionView, TemplateSummary } from "@booth/db";
import { Composite, sessionPhotos } from "@/components/composite";
import { post } from "@/components/use-snapshot";
import { PHASE_LABEL, PRINT_LABEL, clockTime, sessionNumber } from "@/lib/format";
import { Section } from "./controls";
import { useAdmin } from "./shell";

/** Every session of the evening, newest first, with a reprint, a resend and a delete on each. */
export function SessionsTab() {
  const { snapshot, run } = useAdmin();
  const { session, recent, templates } = snapshot;
  const count = recent.length + (session ? 1 : 0);
  return (
    <Section title="Sessions" eyebrow={count ? `Last ${count}` : undefined}>
      {session && <SessionRow s={session} templates={templates} onAction={run} live />}
      {recent.map((s) => (
        <SessionRow key={s.id} s={s} templates={templates} onAction={run} />
      ))}
      {count === 0 && <p className="text-sm text-ivory-soft">Nothing yet. The first guest&apos;s print lands here.</p>}
    </Section>
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
  const tone = s.phase === "done" ? "ok" : s.phase === "failed" ? "error" : s.phase === "abandoned" ? "off" : "gold";
  return (
    <div
      className={`flex gap-3 border-t border-velvet-edge py-3 first:border-t-0 ${live ? "-mx-2 rounded-xl bg-gold-tint/50 px-2 ring-1 ring-gold/30" : ""}`}
      data-testid={`session-${s.id}`}
    >
      {template && s.shots.length > 0 ? (
        <Composite template={template} photos={sessionPhotos(s.shots)} composed={s.thumbUrl} filter={s.filter} mirrored={s.mirrored} className="w-24 shrink-0 self-start rounded-sm" />
      ) : (
        <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-sm bg-velvet text-ivory-faint">
          <Camera className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="display text-xl">{sessionNumber(s.number)}</span>
          <span className="mono text-xs text-ivory-faint">{clockTime(s.createdAt)}</span>
          <span className={`pill pill-${tone}`}>{live ? "Live" : PHASE_LABEL[s.phase]}</span>
        </p>
        <p className="mt-0.5 text-xs text-ivory-soft">
          {[
            template?.name ?? "Unknown layout",
            s.filter !== "colour" ? filterById(s.filter).name.toLowerCase() : null,
            s.mirrored ? "mirrored" : null,
            s.print ? PRINT_LABEL[s.print].toLowerCase() : null,
            s.printCount > 1 ? `${s.printCount} prints` : null,
            s.syncedAt ? "in the gallery" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {s.phase === "failed" && s.reason && <p className="mt-0.5 text-xs text-claret">{s.reason}</p>}
        <div className="mt-2 flex items-center gap-2">
          {!live && complete && (
            <>
              <button
                type="button"
                className="btn min-h-9 px-3 text-xs whitespace-nowrap"
                aria-label="Print again"
                onClick={() => onAction("Reprint", () => post(`/api/admin/sessions/${s.id}/reprint`))}
                data-testid="reprint"
              >
                <Printer className="h-3.5 w-3.5" /> Reprint
              </button>
              <button
                type="button"
                className="btn min-h-9 px-3 text-xs whitespace-nowrap"
                aria-label="Send to the gallery again"
                onClick={() => onAction("Send to the gallery", () => post(`/api/admin/sessions/${s.id}/sync`))}
                data-testid="resync"
              >
                <UploadCloud className="h-3.5 w-3.5" /> Resend
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-danger ml-auto min-h-9 min-w-9 px-0"
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
      </div>
    </div>
  );
}
