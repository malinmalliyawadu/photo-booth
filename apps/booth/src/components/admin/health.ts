import { INK_LOW, PAPER_LOW } from "@booth/core";
import type { ComponentName, Snapshot } from "@booth/db";

/** A component report older than this is treated as missing: the worker (or the iPad) has gone quiet. */
export const STALE_MS = 15_000;

export type Tone = "ok" | "warn" | "error" | "off";

export const COMPONENT_NAMES: ComponentName[] = ["worker", "camera", "printer", "sync"];

/** The status of one component as the admin page shows it: stale reports count as errors. */
export function componentTone(snapshot: Snapshot, name: ComponentName): Tone {
  const value = snapshot.components[name];
  if (!value) return "off";
  const stale = Date.parse(snapshot.at) - Date.parse(value.seenAt) > STALE_MS;
  return stale ? "error" : value.status;
}

/**
 * The one-word answer to "is the booth all right?", for the top of the
 * admin page: the worst of the components, the supplies and the queue.
 * The sync component is optional, so it only ever warns.
 */
export function boothVerdict(snapshot: Snapshot): { tone: Tone; label: string; detail: string } {
  const { booth, queue } = snapshot;
  const problems: string[] = [];
  let tone: Tone = "ok";
  const raise = (to: Tone, why: string) => {
    problems.push(why);
    if (to === "error" || (to === "warn" && tone !== "error")) tone = to;
  };
  for (const name of COMPONENT_NAMES) {
    const t = componentTone(snapshot, name);
    if (t === "error") raise(name === "sync" ? "warn" : "error", `${name} is down`);
    else if (t === "warn") raise("warn", `${name} needs a look`);
    else if (t === "off" && name !== "sync") raise("warn", `${name} has not reported`);
  }
  if (booth.paperLeft <= 0) raise("error", "the paper tray is empty");
  else if (booth.paperLeft <= PAPER_LOW) raise("warn", "paper is running low");
  if (booth.inkLeft <= 0) raise("error", "the ink cassette is spent");
  else if (booth.inkLeft <= INK_LOW) raise("warn", "ink is running low");
  if (queue.failed > 0) raise("warn", `${queue.failed} ${queue.failed === 1 ? "job" : "jobs"} failed`);

  if (booth.paused) return { tone: "warn", label: "Paused", detail: problems[0] ?? "Guests see “back in a moment”" };
  if (tone === "ok") return { tone, label: "All good", detail: "Everything is reporting in" };
  // One line on a phone: the first problem, and how many more there are.
  const detail = problems.length > 2 ? `${problems[0]}, and ${problems.length - 1} more` : problems.join(", ");
  return { tone, label: tone === "error" ? "Needs attention" : "Keep an eye on it", detail };
}
