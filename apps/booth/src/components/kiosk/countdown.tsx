"use client";

import { useEffect, useState } from "react";

/**
 * Seconds left until `endsAt`. A clock ticks in state ten times a
 * second and the digit is derived from it, so the first tick after a
 * new deadline is at most 100 ms late, which no guest can see.
 */
export function useCountdown(endsAt: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 1000));
}
