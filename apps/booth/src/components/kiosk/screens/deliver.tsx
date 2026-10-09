"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect } from "react";
import { Check, Printer, QrCode } from "lucide-react";
import { spellShortId } from "@booth/core";
import type { SessionView, TemplateSummary } from "@booth/db";
import { Grain, Spotlight } from "@/components/chrome";
import { Composite, sessionPhotos } from "@/components/composite";
import type { Sounds } from "../sounds";

/**
 * The print, as it was printed and sent, beside a gift tag with the
 * QR code to the gallery. The print's progress is one line under it.
 */
export function DeliverScreen({
  session,
  template,
  sounds,
  onDone,
  busy,
}: {
  session: SessionView;
  template: TemplateSummary;
  sounds: Sounds;
  onDone: () => void;
  busy: boolean;
}) {
  const print = printLine(session);
  // The print is in the tray: the same chime as the review, so the ear learns it.
  const printed = session.print === "printed";
  useEffect(() => {
    if (printed) sounds.chime();
  }, [printed, sounds]);
  return (
    <div className="relative flex h-dvh flex-col overflow-hidden px-12 pt-safe-8 pb-safe-8" data-testid="deliver">
      <Spotlight />
      <Grain />
      <header className="relative animate-rise">
        <p className="eyebrow">All done</p>
        <h1 className="display mt-3 text-[clamp(2.75rem,6vw,4.5rem)]">That&apos;s a keeper</h1>
      </header>
      <div className="relative my-6 grid min-h-0 flex-1 grid-cols-[1.3fr_1fr] items-center gap-10">
        <div className="h-full min-h-0 animate-rise">
          <Composite
            template={template}
            photos={sessionPhotos(session.shots)}
            composed={session.webUrl}
            filter={session.filter}
            mirrored={session.mirrored}
            fit
            mat
          />
        </div>
        <div className="flex animate-rise flex-col items-center gap-5" style={{ animationDelay: "140ms" }}>
          <div className="relative flex flex-col items-center rounded-2xl bg-ivory px-7 pt-7 pb-6 text-velvet shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)]">
            <span className="absolute top-1/2 -left-3 h-6 w-6 -translate-y-1/2 rounded-full bg-velvet" aria-hidden />
            <span className="absolute top-1/2 -right-3 h-6 w-6 -translate-y-1/2 rounded-full bg-velvet" aria-hidden />
            <img src={`/api/sessions/${session.id}/qr`} alt="QR code for your photos" className="h-[31dvh] w-[31dvh]" data-testid="qr" />
            <p className="mono mt-4 text-base tracking-[0.2em] text-velvet/70">{spellShortId(session.id)}</p>
            <div className="mt-4 w-full border-t border-dashed border-velvet/25" aria-hidden />
            <p className="display-italic mt-4 flex items-center gap-2 text-3xl">
              <QrCode className="h-6 w-6" /> Scan to keep them
            </p>
          </div>
          <p className="max-w-sm text-center text-lg text-ivory-soft">Your photos will be in the gallery in a moment.</p>
          <p className={`flex items-center gap-2 text-xl ${print.tone}`} data-testid="print-status">
            {print.icon}
            {print.text}
          </p>
        </div>
      </div>
      <footer className="relative flex justify-end">
        <button type="button" onClick={onDone} className="tap" disabled={busy} data-testid="done">
          <Check className="h-8 w-8" strokeWidth={2.6} /> Done
        </button>
      </footer>
    </div>
  );
}

function printLine(session: SessionView): { text: string; tone: string; icon: React.ReactNode } {
  switch (session.print) {
    case "printed":
      return { text: "Your print is in the tray", tone: "text-sage", icon: <Check className="h-6 w-6" /> };
    case "failed":
      return { text: "The print did not come out; the attendant can print it again", tone: "text-claret", icon: <Printer className="h-6 w-6" /> };
    case "skipped":
      return { text: "The printer needs a refill; your photos are safe", tone: "text-amber", icon: <Printer className="h-6 w-6" /> };
    default:
      return {
        text: "Printing your copy",
        tone: "text-ivory-soft",
        icon: <span className="inline-block h-5 w-5 animate-spin-slow rounded-full border-2 border-velvet-edge border-t-gold" />,
      };
  }
}
