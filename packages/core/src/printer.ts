/**
 * What the printer is up to, in words the attendant can act on.
 *
 * The worker asks CUPS for the queue's state and each job's state over
 * IPP, and looks for the SELPHY itself: on the USB bus, or over Wi-Fi
 * when it prints by AirPrint. This module turns those answers into the
 * printer card on the admin page and into a job's outcome. It never
 * talks to CUPS or the printer itself.
 */

/** printer-state (RFC 8011 5.4.11). */
export const PRINTER_STATE = { idle: 3, processing: 4, stopped: 5 } as const;

/** job-state (RFC 8011 5.3.7). */
export const JOB_STATE = {
  pending: 3,
  pendingHeld: 4,
  processing: 5,
  processingStopped: 6,
  canceled: 7,
  aborted: 8,
  completed: 9,
} as const;

/**
 * How long one print may take, from the request to the card in the
 * tray, before the worker cancels it and calls it failed. A postcard is
 * about 50 s on the CP1300 (four passes: yellow, magenta, cyan, the
 * overcoat); the rest is room for a reprint queued behind it.
 */
export const PRINT_TIMEOUT_MS = 3 * 60_000;

/** The queue as CUPS reports it. */
export interface QueueReport {
  state: number;
  reasons: string[];
  message: string;
  accepting: boolean;
  /** Where CUPS sends the queue's jobs, which says where to look for the printer. */
  deviceUri?: string | undefined;
}

/**
 * How the worker can look for the printer itself, from the queue's
 * device URI: on the USB bus for the SELPHY through Gutenprint
 * (gutenprint53+usb://canon-cp1300/...), or by asking the printer over
 * the network for AirPrint (ipp://Canon-SELPHY-CP1300.local:631/ipp/print),
 * at `url` over plain HTTP, naming itself as `printerUri`. A dnssd://
 * or ipps:// queue cannot be asked: the first needs a DNS-SD lookup
 * and the second the printer's self-signed certificate.
 */
export type PrinterLink = { via: "usb" } | { via: "network"; url: string; printerUri: string } | { via: "unknown" };

export function printerLink(deviceUri: string | undefined): PrinterLink {
  let uri: URL;
  try {
    uri = new URL(deviceUri ?? "");
  } catch {
    return { via: "unknown" };
  }
  const scheme = uri.protocol.slice(0, -1).toLowerCase();
  if (scheme === "usb" || scheme.endsWith("+usb")) return { via: "usb" };
  if (scheme !== "ipp" || !uri.hostname) return { via: "unknown" };
  const host = uri.port ? uri.host : `${uri.hostname}:631`;
  return { via: "network", url: `http://${host}${uri.pathname}`, printerUri: `ipp://${host}${uri.pathname}` };
}

/** Whether the printer itself was found: unknown where it cannot be looked for (no sysfs on macOS, a dnssd:// queue). */
export type Presence = "present" | "absent" | "unknown";

/** What the worker found when it looked for the printer itself. */
export interface Sighting {
  via: PrinterLink["via"];
  presence: Presence;
  /** printer-state-reasons from the printer itself, when it was asked over the network. */
  reasons: string[];
}

export interface PrinterHealth {
  status: "ok" | "warn" | "error";
  detail: string;
}

/**
 * How long the printer may report something that stops printing (out
 * of paper, a jam, an open cover) while a job waits before the job is
 * cancelled and fails. Long enough to ride out a flicker, short enough
 * that the prints behind it are not each held for the full timeout.
 */
export const BLOCKED_GRACE_MS = 10_000;

export type Supply = "paper" | "ink";

interface Reason {
  keyword: string;
  words: string;
  /** Printing cannot go on until someone fixes it, whatever the keyword's suffix says. */
  blocks: boolean;
  /** The supply that ran out, so the booth's own count can say so too. */
  empty?: Supply;
}

/**
 * printer-state-reasons keywords, without their -error / -warning /
 * -report suffix, in the attendant's words. The first one present wins,
 * so the order is what to fix first.
 */
const REASONS: Reason[] = [
  { keyword: "media-empty", words: "Out of paper: refill the paper tray", blocks: true, empty: "paper" },
  { keyword: "media-needed", words: "Out of paper: refill the paper tray", blocks: true, empty: "paper" },
  { keyword: "marker-supply-empty", words: "The ink cassette is used up: put in a new one", blocks: true, empty: "ink" },
  { keyword: "media-jam", words: "Paper jam: open the printer and clear it", blocks: true },
  { keyword: "cover-open", words: "A cover is open", blocks: true },
  { keyword: "door-open", words: "A door is open", blocks: true },
  { keyword: "input-tray-missing", words: "The paper tray is out: slide it back in", blocks: true },
  { keyword: "marker-supply-missing", words: "No ink cassette: put one in", blocks: true },
  { keyword: "offline", words: "The printer is offline", blocks: true },
  { keyword: "shutdown", words: "The printer is switched off", blocks: true },
  { keyword: "connecting-to-device", words: "Looking for the printer", blocks: false },
  { keyword: "media-low", words: "Paper is running low", blocks: false },
  { keyword: "marker-supply-low", words: "The ink cassette is nearly used up", blocks: false },
];

function base(reason: string): string {
  return reason.replace(/-(error|warning|report)$/, "");
}

/**
 * A known keyword's weight is the table's: a printer that calls an
 * empty tray a warning still cannot print. Otherwise the suffix says,
 * and no suffix is an error by the spec, except CUPS's own progress
 * notes (cups-waiting-for-...), which say nothing is wrong.
 */
function severity(reason: string): "error" | "warn" | null {
  if (reason === "none" || reason.endsWith("-report")) return null;
  const known = REASONS.find((r) => r.keyword === base(reason));
  if (known) return known.blocks ? "error" : "warn";
  if (reason.endsWith("-error")) return "error";
  if (reason.endsWith("-warning")) return "warn";
  if (reason.startsWith("cups-") || reason.startsWith("com.apple.")) return null;
  return "error";
}

export interface ReasonWords {
  status: "error" | "warn";
  detail: string;
  empty: Supply | null;
}

/** The queue's reasons, as the one sentence the admin card shows, or null when nothing needs doing. */
export function describeReasons(reasons: string[]): ReasonWords | null {
  const serious = reasons.filter((r) => severity(r) !== null);
  if (serious.length === 0) return null;
  const status = serious.some((r) => severity(r) === "error") ? "error" : "warn";
  const bases = serious.map(base);
  const known = REASONS.find((r) => bases.includes(r.keyword) && (status === "warn" || r.blocks));
  return {
    status,
    detail: known ? known.words : `The printer reports ${bases.join(", ")}`,
    empty: known?.empty ?? null,
  };
}

/** What stops the queue printing right now, or null when nothing does. */
export function queueBlocked(queue: QueueReport): ReasonWords | null {
  const why = describeReasons(queue.reasons.filter((r) => r !== "paused"));
  if (why?.status === "error") return why;
  if (queue.state === PRINTER_STATE.stopped || queue.reasons.includes("paused")) {
    return { status: "error", detail: queue.message || "The print queue is stopped", empty: null };
  }
  return null;
}

/**
 * The admin card for the printer. CUPS knows the queue but not the
 * paper: until a job runs, an unplugged printer looks like an idle
 * queue, so the printer itself is looked for as well. Over the network
 * it answers for itself, and what it says counts with the queue's word.
 */
export function printerHealth(cups: QueueReport, seen: Sighting, queueName: string): PrinterHealth {
  if (seen.presence === "absent") {
    return seen.via === "network"
      ? { status: "error", detail: "Not answering on Wi-Fi: check that the printer is switched on and on the booth's Wi-Fi" }
      : { status: "error", detail: "Not on USB: check the cable and that the printer is switched on" };
  }
  const queue = { ...cups, reasons: [...new Set([...cups.reasons, ...seen.reasons])] };
  if (queue.reasons.includes("paused") || queue.state === PRINTER_STATE.stopped) {
    const why = describeReasons(queue.reasons.filter((r) => r !== "paused"));
    return {
      status: "error",
      detail: `${why ? `${why.detail}. ` : queue.message ? `${queue.message}. ` : ""}The queue is stopped: run cupsenable ${queueName}`,
    };
  }
  if (!queue.accepting) return { status: "error", detail: `The queue is refusing jobs: run cupsaccept ${queueName}` };
  const why = describeReasons(queue.reasons);
  if (why) return { status: why.status, detail: why.detail };
  const where = seen.presence === "present" ? (seen.via === "network" ? "on Wi-Fi" : "on USB") : "queue ready";
  return { status: "ok", detail: queue.state === PRINTER_STATE.processing ? `Printing (${where})` : `Ready (${where})` };
}

/** A job as CUPS reports it. */
export interface JobReport {
  state: number;
  reasons: string[];
  message: string;
}

export type JobOutcome = { kind: "waiting" } | { kind: "printed" } | { kind: "failed"; reason: string; empty: Supply | null };

/** Whether a job is finished, and if it did not print, why, in the attendant's words. */
export function jobOutcome(job: JobReport, queue: QueueReport | null): JobOutcome {
  switch (job.state) {
    case JOB_STATE.completed:
      return { kind: "printed" };
    case JOB_STATE.canceled:
    case JOB_STATE.aborted: {
      const why = queue ? describeReasons(queue.reasons) : null;
      const reason =
        why?.detail || job.message || queue?.message || (job.state === JOB_STATE.canceled ? "The print was cancelled" : "The printer gave up on the print");
      return { kind: "failed", reason, empty: why?.empty ?? null };
    }
    default:
      return { kind: "waiting" };
  }
}

/** What a print waiting too long is waiting for, for the failure message. */
export function stuckReason(job: JobReport, queue: QueueReport | null, timeoutMs = PRINT_TIMEOUT_MS): string {
  const why = queue ? describeReasons(queue.reasons) : null;
  const detail = why?.detail || job.message || queue?.message;
  const within = timeoutMs >= 60_000 ? `${Math.round(timeoutMs / 60_000)} minutes` : `${Math.round(timeoutMs / 1000)} seconds`;
  return `The print did not finish within ${within}${detail ? `: ${detail}` : ""}`;
}

/** A device on the USB bus, as Linux's sysfs describes it. */
export interface UsbDevice {
  /** Four hex digits, lower case, as sysfs writes them. */
  vendorId: string;
  productId: string;
  product?: string | undefined;
}

/** Canon's USB vendor ID. */
export const CANON_USB_VENDOR = "04a9";

/**
 * The SELPHY among the USB devices. Canon makes cameras too, so a Canon
 * device counts only when its product string names a SELPHY or a CP
 * model; one with no product string (unreadable) counts, since a
 * false "unplugged" on the admin page is worse than a missed one.
 */
export function findSelphy(devices: UsbDevice[]): UsbDevice | null {
  return (
    devices.find((d) => {
      if (d.vendorId.toLowerCase() !== CANON_USB_VENDOR) return false;
      if (d.product === undefined) return true;
      return /selphy|\bcp\s?-?\d{3,4}\b/i.test(d.product);
    }) ?? null
  );
}
