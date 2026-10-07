"use client";

import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "@booth/db";

/**
 * Subscribes to the state stream. EventSource reconnects on its own;
 * `connected` goes false while it is trying, so a screen can say so
 * instead of silently showing stale state.
 */
export function useSnapshot(initial: Snapshot): { snapshot: Snapshot; connected: boolean } {
  const [snapshot, setSnapshot] = useState(initial);
  const [connected, setConnected] = useState(true);
  const latest = useRef(initial.at);

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.addEventListener("state", (event) => {
      const next = JSON.parse((event as MessageEvent<string>).data) as Snapshot;
      if (next.at < latest.current) return;
      latest.current = next.at;
      setSnapshot(next);
      setConnected(true);
    });
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, []);

  return { snapshot, connected };
}

export async function post(url: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function patch(url: string, body: unknown): Promise<Response> {
  return fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
