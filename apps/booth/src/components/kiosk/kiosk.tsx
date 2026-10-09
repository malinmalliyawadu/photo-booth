"use client";

import { useCallback, useState } from "react";
import type { FilterId } from "@booth/core";
import type { Snapshot } from "@booth/db";
import { post, useSnapshot } from "@/components/use-snapshot";
import {
  AttractScreen,
  ComposingScreen,
  ConnectionBanner,
  DeliverScreen,
  EndedScreen,
  LiveScreen,
  PausedScreen,
  PickerScreen,
  ReviewScreen,
} from "./screens";
import { useSounds } from "./sounds";
import { useIpadCamera } from "./use-ipad-camera";

/**
 * The guest-facing screen. Which screen shows is a function of the
 * snapshot; the only local state is whether the guest has tapped out
 * of the attract loop, and the last session this screen was following,
 * so a failure can be explained before the loop comes back.
 */
export function Kiosk({ initial }: { initial: Snapshot }) {
  const { snapshot, connected } = useSnapshot(initial);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followed, setFollowed] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const { session, booth, templates } = snapshot;
  // Open for as long as the booth is in iPad mode, not just while a
  // guest is posing: see useIpadCamera.
  const camera = useIpadCamera(booth.cameraMode === "ipad");
  const sounds = useSounds(booth.sounds);

  // Remember which session this screen is on. When it leaves the active
  // phases as a failure, explain before the attract loop comes back.
  if (session && session.id !== followed) {
    setFollowed(session.id);
    setPicking(false);
  }
  const outcome = !session && followed ? snapshot.recent.find((s) => s.id === followed) : undefined;
  const ended = outcome?.phase === "failed" && dismissed !== followed ? { id: followed!, reason: outcome.reason } : null;

  const command = useCallback(async (url: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const res = await post(url, body);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "The booth did not answer");
      }
    } catch {
      setError("The booth did not answer");
    } finally {
      setBusy(false);
    }
  }, []);

  const start = useCallback((templateId: string) => command("/api/sessions", { templateId }), [command]);
  const dismissEnded = useCallback(() => setDismissed(followed), [followed]);

  // The attendant locked one layout: the first tap starts straight away.
  const tapToStart = useCallback(() => {
    if (booth.lockedTemplateId) void start(booth.lockedTemplateId);
    else setPicking(true);
  }, [booth.lockedTemplateId, start]);

  const active = templates.filter((t) => t.active && (!booth.lockedTemplateId || t.id === booth.lockedTemplateId));
  const template = session ? templates.find((t) => t.id === session.templateId) : undefined;

  let screen: React.ReactNode;
  if (booth.paused && !session) {
    screen = <PausedScreen eventName={booth.eventName} />;
  } else if (ended) {
    screen = <EndedScreen reason={ended.reason} onDismiss={dismissEnded} />;
  } else if (!session || !template) {
    screen = picking ? (
      <PickerScreen templates={active} busy={busy} error={error} onPick={start} onBack={() => setPicking(false)} />
    ) : (
      <AttractScreen eventName={booth.eventName} recent={snapshot.recent} templates={templates} stream={camera.stream} onTap={tapToStart} />
    );
  } else {
    const url = (c: string) => `/api/sessions/${session.id}/${c}`;
    switch (session.phase) {
      case "countdown":
      case "capturing":
        screen = (
          <LiveScreen session={session} template={template} cameraMode={booth.cameraMode} camera={camera} sounds={sounds} onCancel={() => command(url("cancel"))} />
        );
        break;
      case "composing":
        screen = <ComposingScreen />;
        break;
      case "review":
        screen = (
          <ReviewScreen
            session={session}
            template={template}
            filters={booth.filters}
            sounds={sounds}
            busy={busy}
            onFilter={(filter: FilterId) => command(url("filter"), { filter })}
            onMirror={(mirrored: boolean) => command(url("mirror"), { mirrored })}
            onAccept={() => command(url("accept"))}
            onRetake={() => command(url("retake"))}
            onCancel={() => command(url("cancel"))}
          />
        );
        break;
      case "delivering":
        screen = <DeliverScreen session={session} template={template} sounds={sounds} busy={busy} onDone={() => command(url("finish"))} />;
        break;
      default:
        screen = <ComposingScreen />;
    }
  }

  return (
    <main className="kiosk bg-velvet text-ivory">
      <ConnectionBanner connected={connected} />
      {screen}
    </main>
  );
}
