"use client";

import { useCallback, useState } from "react";
import { KIOSK_IDLE_MS, isFindable, type CopyBooth, type FilterId } from "@booth/core";
import type { Snapshot } from "@booth/db";
import { post, useSnapshot } from "@/components/use-snapshot";
import {
  AttractScreen,
  ComposingScreen,
  ConnectionBanner,
  CopiesScreen,
  DeliverScreen,
  EndedScreen,
  LiveScreen,
  PausedScreen,
  PickerScreen,
  ReviewScreen,
} from "./screens";
import { useSounds } from "./sounds";
import { useIdle } from "./use-idle";
import { useIpadCamera } from "./use-ipad-camera";

/**
 * The guest-facing screen. Which screen shows is a function of the
 * snapshot; the only local state is where a guest has gone from the
 * attract loop (the layout picker, or the evening's prints for a copy),
 * and the last session this screen was following, so a failure can be
 * explained before the loop comes back.
 */
export function Kiosk({ initial }: { initial: Snapshot }) {
  const { snapshot, connected } = useSnapshot(initial);
  const [away, setAway] = useState<"picker" | "copies" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followed, setFollowed] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const { session, booth, templates, components, queue } = snapshot;
  // Open for as long as the booth is in iPad mode, not just while a
  // guest is posing: see useIpadCamera.
  const camera = useIpadCamera(booth.cameraMode === "ipad");
  const sounds = useSounds(booth.sounds);

  // Remember which session this screen is on. When it leaves the active
  // phases as a failure, explain before the attract loop comes back.
  if (session && session.id !== followed) {
    setFollowed(session.id);
    setAway(null);
  }
  // A guest who walks away from the picker or the prints leaves the mirror for the next one.
  const backToAttract = useCallback(() => setAway(null), []);
  useIdle(away !== null && !session, KIOSK_IDLE_MS, backToAttract);
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
    else setAway("picker");
  }, [booth.lockedTemplateId, start]);

  const active = templates.filter((t) => t.active && (!booth.lockedTemplateId || t.id === booth.lockedTemplateId));
  const template = session ? templates.find((t) => t.id === session.templateId) : undefined;
  const copyBooth: CopyBooth = {
    guestCopyLimit: booth.guestCopyLimit,
    paperLeft: booth.paperLeft,
    inkLeft: booth.inkLeft,
    pendingPrints: queue.pendingPrints,
    printerDown: components.printer?.status === "error",
  };
  // The way in is offered once there is a print to find; the snapshot's
  // time stands in for the clock, which a render must not read.
  const copiesOffered =
    booth.guestCopyLimit > 0 &&
    snapshot.recent.some((s) =>
      isFindable(
        { phase: s.phase, composed: s.thumbUrl !== null, deleted: s.deleted, createdAt: s.createdAt, guestCopies: s.guestCopies },
        new Date(snapshot.at),
      ),
    );
  // Switched off, or the last print deleted, while a guest was browsing.
  if (away === "copies" && !copiesOffered) setAway(null);

  let screen: React.ReactNode;
  if (booth.paused && !session) {
    screen = <PausedScreen eventName={booth.eventName} />;
  } else if (ended) {
    screen = <EndedScreen reason={ended.reason} onDismiss={dismissEnded} />;
  } else if (!session || !template) {
    screen =
      away === "picker" ? (
        <PickerScreen templates={active} busy={busy} error={error} onPick={start} onBack={backToAttract} />
      ) : away === "copies" ? (
        <CopiesScreen templates={templates} booth={copyBooth} onClose={backToAttract} />
      ) : (
        <AttractScreen
          eventName={booth.eventName}
          recent={snapshot.recent}
          templates={templates}
          stream={camera.stream}
          onTap={tapToStart}
          onCopies={copiesOffered ? () => setAway("copies") : undefined}
        />
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
