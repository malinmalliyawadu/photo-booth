"use client";

import { useEffect } from "react";
import { Aperture, Frame, Grain, Rule, Spotlight } from "@/components/chrome";

export function PausedScreen({ eventName }: { eventName: string }) {
  return (
    <div className="relative flex h-dvh flex-col items-center justify-center gap-7 overflow-hidden px-10 text-center" data-testid="paused">
      <Spotlight />
      <Grain />
      <Frame inset="inset-5" />
      <Aperture className="h-14 w-14 text-gold" />
      <p className="eyebrow">{eventName}</p>
      <h1 className="display-italic text-[clamp(3.5rem,9vw,7rem)]">Back in a moment</h1>
      <Rule className="w-64" />
      <p className="text-2xl text-ivory-soft">The booth is taking a short break.</p>
    </div>
  );
}

/** Between the print going and the files landing: a print developing in the tray. */
export function ComposingScreen() {
  return (
    <div className="relative flex h-dvh flex-col items-center justify-center gap-8 overflow-hidden" data-testid="composing">
      <Spotlight />
      <Grain />
      <div className="relative h-40 w-60 overflow-hidden rounded-sm bg-ivory/10 ring-1 ring-ivory/30">
        <div className="absolute inset-y-0 w-1/2 animate-develop bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
      </div>
      <p className="display-italic text-5xl">Developing your print</p>
    </div>
  );
}

export function EndedScreen({ reason, onDismiss }: { reason: string | null; onDismiss: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 8000);
    return () => clearTimeout(id);
  }, [onDismiss]);
  return (
    <button
      type="button"
      onClick={onDismiss}
      className="relative flex h-dvh w-full flex-col items-center justify-center gap-6 overflow-hidden px-10 text-center"
      data-testid="ended"
    >
      <Spotlight />
      <Grain />
      <p className="eyebrow">Sorry about that</p>
      <h1 className="display-italic text-[clamp(3.5rem,9vw,7rem)]">That didn&apos;t work</h1>
      <p className="max-w-2xl text-2xl text-ivory-soft">{reason ?? "Something went wrong with the camera."} Tap to try again.</p>
    </button>
  );
}

export function ConnectionBanner({ connected }: { connected: boolean }) {
  if (connected) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center p-3 pt-safe-3" data-testid="disconnected">
      <span className="pill pill-warn animate-breathe text-sm">Reconnecting to the booth</span>
    </div>
  );
}
