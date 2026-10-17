"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Printer, RotateCcw, X } from "lucide-react";
import { copiesLeft, copyRefusal, type CopyBooth, type CopySession } from "@booth/core";
import type { PrintView, TemplateSummary } from "@booth/db";
import { Grain, Spotlight } from "@/components/chrome";
import { Composite } from "@/components/composite";
import { post } from "@/components/use-snapshot";
import { clockTime } from "@/lib/format";

/** The confirmation stays this long before the attract loop comes back on its own. */
const CONFIRM_MS = 12_000;

type Loaded = { prints: PrintView[]; at: Date };

/**
 * "Print a copy", from the attract screen: the evening's prints, newest
 * first, for a guest to find theirs by the faces in it; then the print
 * on its own with the button, or the reason there is none; then "on its
 * way". The booth decides with `copyRefusal`, and so does this screen
 * before the button is offered, from the same snapshot numbers.
 */
export function CopiesScreen({
  templates,
  booth,
  onClose,
}: {
  templates: TemplateSummary[];
  booth: CopyBooth;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const load = useCallback(() => {
    fetch("/api/kiosk/prints")
      .then((res) => (res.ok ? (res.json() as Promise<{ prints: PrintView[] }>) : Promise.reject(new Error(String(res.status)))))
      .then(({ prints }) => setLoaded({ prints, at: new Date() }))
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  const byId = new Map(templates.map((t) => [t.id, t]));
  const print = chosen ? loaded?.prints.find((p) => p.id === chosen) : undefined;
  const template = print ? byId.get(print.templateId) : undefined;

  if (print && template && loaded) {
    return (
      <CopyScreen
        print={print}
        template={template}
        booth={booth}
        now={loaded.at}
        sent={sent}
        onBack={() => setChosen(null)}
        onSent={(guestCopies) => {
          setSent(true);
          setLoaded({ ...loaded, prints: loaded.prints.map((p) => (p.id === print.id ? { ...p, guestCopies } : p)) });
        }}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden pt-safe-8" data-testid="copies">
      <Spotlight />
      <Grain />
      <header className="relative flex items-end justify-between px-12">
        <div className="animate-rise">
          <p className="eyebrow">Another copy</p>
          <h1 className="display mt-3 text-[clamp(2.75rem,6vw,4.5rem)]">Find your print</h1>
        </div>
        <button type="button" onClick={onClose} className="tap tap-ghost tap-sm">
          <X className="h-6 w-6" /> Back
        </button>
      </header>

      {loaded === null ? (
        <Message testId="copies-loading">
          {failed ? (
            <>
              <p className="text-2xl text-ivory-soft">The booth did not answer.</p>
              <button
                type="button"
                onClick={() => {
                  setFailed(false);
                  load();
                }}
                className="tap tap-ghost tap-sm"
              >
                <RotateCcw className="h-5 w-5" /> Try again
              </button>
            </>
          ) : (
            <p className="text-2xl text-ivory-soft">Finding tonight&apos;s prints</p>
          )}
        </Message>
      ) : loaded.prints.length === 0 ? (
        <Message testId="copies-empty">
          <p className="text-2xl text-ivory-soft">No prints yet tonight. Yours will be the first.</p>
        </Message>
      ) : (
        // The list scrolls under the header's edge; the bottom padding lets the last row clear the home indicator.
        <ul className="relative mt-6 grid min-h-0 flex-1 auto-rows-min grid-cols-4 gap-x-6 gap-y-7 overflow-y-auto px-12 pt-4 pb-safe-10 [mask-image:linear-gradient(to_bottom,transparent,black_1.5rem)]">
          {loaded.prints.map((p, i) => {
            const t = byId.get(p.templateId);
            if (!t) return null;
            return (
              <li key={p.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 11) * 40}ms` }}>
                <button
                  type="button"
                  onClick={() => {
                    setSent(false);
                    setChosen(p.id);
                  }}
                  className="flex w-full flex-col items-center gap-3 rounded-2xl p-2 transition-transform duration-150 active:scale-[0.97]"
                  data-testid={`print-${p.id}`}
                >
                  <div className="aspect-[5/4] w-full">
                    <Composite template={t} photos={{}} composed={p.thumbUrl} fit mat />
                  </div>
                  <span className="mono text-base text-ivory-faint">{clockTime(p.createdAt)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Message({ testId, children }: { testId: string; children: React.ReactNode }) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-6 px-12 pb-safe-8 text-center" data-testid={testId}>
      {children}
    </div>
  );
}

/** One print, large, with the button or the reason there is none, and then "on its way". */
function CopyScreen({
  print,
  template,
  booth,
  now,
  sent,
  onBack,
  onSent,
  onClose,
}: {
  print: PrintView;
  template: TemplateSummary;
  booth: CopyBooth;
  now: Date;
  sent: boolean;
  onBack: () => void;
  onSent: (guestCopies: number) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session: CopySession = { phase: "done", composed: true, deleted: false, createdAt: print.createdAt, guestCopies: print.guestCopies };
  const refusal = error ?? copyRefusal(booth, session, now);
  const left = copiesLeft(booth.guestCopyLimit, session);

  useEffect(() => {
    if (!sent) return;
    const id = setTimeout(onClose, CONFIRM_MS);
    return () => clearTimeout(id);
  }, [sent, onClose]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await post(`/api/sessions/${print.id}/copy`);
      const data = (await res.json().catch(() => ({}))) as { guestCopies?: number; error?: string };
      if (res.ok && typeof data.guestCopies === "number") onSent(data.guestCopies);
      else setError(data.error ?? "The booth did not answer");
    } catch {
      setError("The booth did not answer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden px-12 pt-safe-8 pb-safe-8" data-testid="copy">
      <Spotlight />
      <Grain />
      <header className="relative flex items-end justify-between">
        <div className="animate-rise">
          <p className="eyebrow">Taken at {clockTime(print.createdAt)}</p>
          <h1 className="display mt-3 text-[clamp(2.75rem,6vw,4.5rem)]">{sent ? "On its way" : "Another copy"}</h1>
        </div>
        {!sent && (
          <button type="button" onClick={onBack} className="tap tap-ghost tap-sm" disabled={busy}>
            <ArrowLeft className="h-6 w-6" /> All prints
          </button>
        )}
      </header>

      <div className="relative my-6 grid min-h-0 flex-1 grid-cols-[1.4fr_1fr] items-center gap-10">
        <div className="h-full min-h-0 animate-rise">
          <Composite template={template} photos={{}} composed={print.webUrl} fit mat />
        </div>
        <div className="flex animate-rise flex-col items-start gap-6" style={{ animationDelay: "120ms" }}>
          {sent ? (
            <>
              <p className="flex items-center gap-3 text-2xl text-sage" data-testid="copy-sent">
                <Check className="h-7 w-7" /> Printing your copy
              </p>
              <p className="max-w-sm text-xl text-ivory-soft">Collect it from the printer&apos;s tray in about a minute.</p>
            </>
          ) : refusal ? (
            <p className="max-w-sm text-2xl text-amber" role="status" data-testid="copy-refusal">
              {refusal}
            </p>
          ) : (
            <>
              <p className="max-w-sm text-xl text-ivory-soft">The same print again, out of the printer in about a minute.</p>
              {booth.guestCopyLimit > 1 && (
                <p className="mono text-base text-ivory-faint" data-testid="copies-left">
                  {left} of {booth.guestCopyLimit} copies left for this print
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <footer className="relative flex justify-end">
        {sent ? (
          <button type="button" onClick={onClose} className="tap" data-testid="copy-done">
            <Check className="h-8 w-8" strokeWidth={2.6} /> Done
          </button>
        ) : (
          <button type="button" onClick={send} className="tap" disabled={busy || refusal !== null} data-testid="print-copy">
            <Printer className="h-8 w-8" strokeWidth={2.2} /> Print a copy
          </button>
        )}
      </footer>
    </div>
  );
}
