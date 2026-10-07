import type { Phase, PrintStatus } from "@booth/core";

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} h ago`;
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit" });
}

export const PHASE_LABEL: Record<Phase, string> = {
  countdown: "Counting down",
  capturing: "Taking a photo",
  composing: "Putting it together",
  review: "Reviewing",
  delivering: "Printing",
  done: "Done",
  abandoned: "Started over",
  failed: "Failed",
};

export const PRINT_LABEL: Record<PrintStatus, string> = {
  pending: "Print queued",
  printing: "Printing",
  printed: "Printed",
  failed: "Print failed",
  skipped: "No paper",
};

export function sessionNumber(n: number): string {
  return `#${String(n).padStart(3, "0")}`;
}
