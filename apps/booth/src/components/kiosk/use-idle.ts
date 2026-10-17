"use client";

import { useEffect, useRef } from "react";

const ACTIVITY = ["pointerdown", "scroll", "keydown"] as const;

/**
 * Calls `onIdle` once nobody has touched the screen for `ms`. Scrolls
 * count: a scroll inside a list does not bubble, but a capturing
 * listener on the window still hears it.
 */
export function useIdle(enabled: boolean, ms: number, onIdle: () => void): void {
  const callback = useRef(onIdle);
  useEffect(() => {
    callback.current = onIdle;
  });
  useEffect(() => {
    if (!enabled) return;
    let timer = setTimeout(() => callback.current(), ms);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => callback.current(), ms);
    };
    for (const type of ACTIVITY) window.addEventListener(type, reset, { capture: true, passive: true });
    return () => {
      clearTimeout(timer);
      for (const type of ACTIVITY) window.removeEventListener(type, reset, { capture: true });
    };
  }, [enabled, ms]);
}
