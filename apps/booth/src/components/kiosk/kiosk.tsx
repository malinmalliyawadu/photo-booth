"use client";

import { useCallback, useState } from "react";
import { needsPropChoice, type FilterId, type PropId } from "@booth/core";
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
  PropsScreen,
  ReviewScreen,
} from "./screens";
import { useFaceFinder } from "./face-finder";
import { useSounds } from "./sounds";
import { useIpadCamera } from "./use-ipad-camera";

/**
 * The guest-facing screen. Which screen shows is a function of the
 * snapshot; the only local state is how far the guest has got before
 * there is a session (tapped out of the attract loop, picked a layout
 * and trying props on), and the last session this screen was following,
 * so a failure can be explained before the loop comes back.
 */
export function Kiosk({ initial }: { initial: Snapshot }) {
  const { snapshot, connected } = useSnapshot(initial);
  const [picking, setPicking] = useState(false);
  /** The layout the guests are trying props on for, before the session starts. */
  const [trying, setTrying] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followed, setFollowed] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const { session, booth, templates } = snapshot;
  // Open for as long as the booth is in iPad mode, not just while a
  // guest is posing: see useIpadCamera.
  const camera = useIpadCamera(booth.cameraMode === "ipad");
  // The props need faces, and only the iPad looks for them: it finds
  // them live while the guests pose and in each photo it takes.
  const { finder, status: finderStatus } = useFaceFinder(booth.cameraMode === "ipad");
  const askProps = booth.cameraMode === "ipad" && needsPropChoice(booth.props) && finderStatus !== "error";
  const steps = 3 + (askProps ? 1 : 0);
  const sounds = useSounds(booth.sounds);

  // Remember which session this screen is on. When it leaves the active
  // phases as a failure, explain before the attract loop comes back.
  if (session && session.id !== followed) {
    setFollowed(session.id);
    setPicking(false);
    setTrying(null);
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

  const start = useCallback((templateId: string, prop?: PropId) => command("/api/sessions", { templateId, prop }), [command]);
  const dismissEnded = useCallback(() => setDismissed(followed), [followed]);

  // A layout picked: on to the props, or straight into the countdown.
  const pick = useCallback(
    (templateId: string) => {
      if (askProps) setTrying(templateId);
      else void start(templateId);
    },
    [askProps, start],
  );

  // The attendant locked one layout: the first tap skips the picker.
  const tapToStart = useCallback(() => {
    if (booth.lockedTemplateId) pick(booth.lockedTemplateId);
    else setPicking(true);
  }, [booth.lockedTemplateId, pick]);

  const backFromProps = useCallback(() => {
    setTrying(null);
    setError(null);
    if (booth.lockedTemplateId) setPicking(false);
  }, [booth.lockedTemplateId]);

  const active = templates.filter((t) => t.active && (!booth.lockedTemplateId || t.id === booth.lockedTemplateId));
  const template = session ? templates.find((t) => t.id === session.templateId) : undefined;

  let screen: React.ReactNode;
  if (booth.paused && !session) {
    screen = <PausedScreen eventName={booth.eventName} />;
  } else if (ended) {
    screen = <EndedScreen reason={ended.reason} onDismiss={dismissEnded} />;
  } else if (!session || !template) {
    const trial = askProps ? active.find((t) => t.id === trying) : undefined;
    screen = trial ? (
      <PropsScreen
        template={trial}
        offered={booth.props}
        camera={camera}
        finder={finder}
        step={{ n: 2, of: steps }}
        busy={busy}
        error={error}
        onStart={(prop) => start(trial.id, prop)}
        onBack={backFromProps}
      />
    ) : picking ? (
      <PickerScreen templates={active} step={{ n: 1, of: steps }} busy={busy} error={error} onPick={pick} onBack={() => setPicking(false)} />
    ) : (
      <AttractScreen eventName={booth.eventName} recent={snapshot.recent} templates={templates} stream={camera.stream} onTap={tapToStart} />
    );
  } else {
    const url = (c: string) => `/api/sessions/${session.id}/${c}`;
    switch (session.phase) {
      case "countdown":
      case "capturing":
        screen = (
          <LiveScreen
            session={session}
            template={template}
            cameraMode={booth.cameraMode}
            camera={camera}
            finder={finder}
            sounds={sounds}
            onCancel={() => command(url("cancel"))}
          />
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
            props={booth.props}
            step={{ n: steps, of: steps }}
            sounds={sounds}
            busy={busy}
            onFilter={(filter: FilterId) => command(url("filter"), { filter })}
            onProp={(prop: PropId) => command(url("prop"), { prop })}
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
