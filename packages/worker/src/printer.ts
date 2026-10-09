/**
 * The printer: CUPS on the controller, driving the SELPHY over USB
 * through Gutenprint (`ops/printer.sh` sets the queue up), or a fake.
 *
 * The worker speaks IPP to CUPS directly rather than through `lp` and
 * `lpstat`: one request queues the postcard and returns its job ID, and
 * the job's own state says when the card is in the tray or why it is
 * not, with no text output to parse. CUPS cannot see the paper or a
 * pulled cable until a job runs, so the status also looks for the
 * printer on the USB bus.
 */
import { readFile, readdir } from "node:fs/promises";
import { userInfo } from "node:os";
import { join } from "node:path";
import {
  BLOCKED_GRACE_MS,
  GROUP,
  JOB_STATE,
  OPERATION,
  PRINT_TIMEOUT_MS,
  STATUS_NOT_FOUND,
  VALUE,
  decodeResponse,
  describeStatus,
  encodeRequest,
  findSelphy,
  groupOf,
  isSuccess,
  jobOutcome,
  printerHealth,
  queueBlocked,
  stuckReason,
  type IppAttribute,
  type IppResponse,
  type JobReport,
  type PrinterHealth,
  type QueueReport,
  type Supply,
  type UsbDevice,
  type UsbPresence,
} from "@booth/core";

export interface Printer {
  readonly kind: "fake" | "cups";
  /**
   * Prints one landscape postcard JPEG. Resolves once the card is out;
   * rejects with the reason, in the attendant's words, when it is not
   * (a `PrintFailure` when the printer said why).
   */
  print(absPath: string, title: string): Promise<void>;
  status(): Promise<PrinterHealth>;
}

/** A print that did not come out, and the supply the printer says ran out, if that is why. */
export class PrintFailure extends Error {
  constructor(
    message: string,
    readonly empty: Supply | null = null,
  ) {
    super(message);
    this.name = "PrintFailure";
  }
}

/** Takes a moment, prints nothing. The paper and ink counters still come down. */
export class FakePrinter implements Printer {
  readonly kind = "fake" as const;
  constructor(private readonly printMs = 1500) {}

  async print(): Promise<void> {
    await new Promise((r) => setTimeout(r, this.printMs));
  }

  async status(): Promise<PrinterHealth> {
    return { status: "ok", detail: "Fake printer (nothing comes out)" };
  }
}

export interface CupsOptions {
  /** The queue over HTTP: http://localhost:631/printers/SELPHY for the one `ops/printer.sh` makes. */
  url: string;
  /** The queue's name, for the fixes the admin page suggests. */
  queue: string;
  /** Whether the printer is on the USB bus; Linux's sysfs by default. */
  usb?: () => Promise<UsbPresence>;
  pollMs?: number;
  timeoutMs?: number;
  blockedGraceMs?: number;
}

/** One IPP request to CUPS, which answers at once: it is local. */
const REQUEST_TIMEOUT_MS = 10_000;

const PRINTER_ATTRIBUTES = ["printer-state", "printer-state-reasons", "printer-state-message", "printer-is-accepting-jobs"];
const JOB_ATTRIBUTES = ["job-state", "job-state-reasons", "job-state-message"];

export class CupsPrinter implements Printer {
  readonly kind = "cups" as const;
  private readonly endpoint: string;
  private readonly printerUri: string;
  private readonly user = userInfo().username;
  private requestId = 0;

  constructor(private readonly opts: CupsOptions) {
    const url = new URL(opts.url);
    this.endpoint = url.toString();
    this.printerUri = `ipp://${url.host}${url.pathname}`;
  }

  async print(absPath: string, title: string): Promise<void> {
    const document = await readFile(absPath);
    // What the printer already said before this job, which may be left over from the last one.
    const before = new Set((await this.queue().catch(() => null))?.reasons ?? []);
    const res = await this.request(
      OPERATION.printJob,
      [
        { tag: VALUE.name, name: "job-name", values: [title] },
        { tag: VALUE.mimeMediaType, name: "document-format", values: ["image/jpeg"] },
      ],
      // The postcard is exactly the page: fill it, never shrink it inside a white border.
      [{ tag: VALUE.keyword, name: "print-scaling", values: ["fill"] }],
      document,
    );
    if (!isSuccess(res.status)) throw new Error(`CUPS refused the print: ${describeStatus(res)}`);
    const jobId = groupOf(res, GROUP.job).get("job-id")?.[0];
    if (typeof jobId !== "number") throw new Error("CUPS took the print but gave no job ID");

    const timeoutMs = this.opts.timeoutMs ?? PRINT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    let job: JobReport = { state: JOB_STATE.pending, reasons: [], message: "" };
    let queue: QueueReport | null = null;
    let blockedSince: number | null = null;
    for (;;) {
      await new Promise((r) => setTimeout(r, this.opts.pollMs ?? 1000));
      try {
        [job, queue] = await Promise.all([this.job(jobId), this.queue()]);
      } catch {
        // CUPS restarting, say: keep asking until the deadline.
      }
      const outcome = jobOutcome(job, queue);
      if (outcome.kind === "printed") return;
      if (outcome.kind === "failed") throw new PrintFailure(outcome.reason, outcome.empty);

      // The printer reports something only a person can fix: fail the
      // job now, so the prints behind it do not each wait out the
      // timeout. While this job is printing, only what the printer said
      // since it started counts; a reason from before may be left over
      // from the last job, and the driver will fail this one if not.
      const blocked = !queue
        ? null
        : job.state === JOB_STATE.processing
          ? queueBlocked({ ...queue, reasons: queue.reasons.filter((r) => !before.has(r)) })
          : queueBlocked(queue);
      blockedSince = blocked ? (blockedSince ?? Date.now()) : null;
      if (blocked && Date.now() - blockedSince! >= (this.opts.blockedGraceMs ?? BLOCKED_GRACE_MS)) {
        await this.cancel(jobId);
        throw new PrintFailure(blocked.detail, blocked.empty);
      }
      if (Date.now() >= deadline) {
        await this.cancel(jobId);
        throw new PrintFailure(stuckReason(job, queue, timeoutMs));
      }
    }
  }

  /** Cancelled so a print given up on cannot come out later as well as its reprint. */
  private async cancel(jobId: number): Promise<void> {
    await this.request(OPERATION.cancelJob, [{ tag: VALUE.integer, name: "job-id", values: [jobId] }]).catch(() => null);
  }

  async status(): Promise<PrinterHealth> {
    let queue: QueueReport;
    try {
      queue = await this.queue();
    } catch (err) {
      return { status: "error", detail: err instanceof Error ? err.message : String(err) };
    }
    return printerHealth(queue, await (this.opts.usb ?? usbPresence)(), this.opts.queue);
  }

  private async queue(): Promise<QueueReport> {
    const res = await this.request(OPERATION.getPrinterAttributes, [
      { tag: VALUE.keyword, name: "requested-attributes", values: PRINTER_ATTRIBUTES },
    ]);
    if (res.status === STATUS_NOT_FOUND) throw new Error(`CUPS has no queue named ${this.opts.queue}: run ops/printer.sh`);
    if (!isSuccess(res.status)) throw new Error(`CUPS: ${describeStatus(res)}`);
    const a = groupOf(res, GROUP.printer);
    return {
      state: Number(a.get("printer-state")?.[0] ?? 0),
      reasons: (a.get("printer-state-reasons") ?? []).filter((r): r is string => typeof r === "string"),
      message: String(a.get("printer-state-message")?.[0] ?? "").trim(),
      accepting: a.get("printer-is-accepting-jobs")?.[0] !== false,
    };
  }

  private async job(jobId: number): Promise<JobReport> {
    const res = await this.request(OPERATION.getJobAttributes, [
      { tag: VALUE.integer, name: "job-id", values: [jobId] },
      { tag: VALUE.keyword, name: "requested-attributes", values: JOB_ATTRIBUTES },
    ]);
    if (!isSuccess(res.status)) throw new Error(`CUPS: ${describeStatus(res)}`);
    const a = groupOf(res, GROUP.job);
    return {
      state: Number(a.get("job-state")?.[0] ?? 0),
      reasons: (a.get("job-state-reasons") ?? []).filter((r): r is string => typeof r === "string"),
      message: String(a.get("job-state-message")?.[0] ?? "").trim(),
    };
  }

  private async request(
    operation: number,
    attributes: IppAttribute[],
    jobAttributes: IppAttribute[] = [],
    document?: Uint8Array,
  ): Promise<IppResponse> {
    const header = encodeRequest({
      operation,
      requestId: ++this.requestId,
      groups: [
        {
          tag: GROUP.operation,
          attributes: [
            { tag: VALUE.charset, name: "attributes-charset", values: ["utf-8"] },
            { tag: VALUE.naturalLanguage, name: "attributes-natural-language", values: ["en"] },
            { tag: VALUE.uri, name: "printer-uri", values: [this.printerUri] },
            { tag: VALUE.name, name: "requesting-user-name", values: [this.user] },
            ...attributes,
          ],
        },
        ...(jobAttributes.length ? [{ tag: GROUP.job, attributes: jobAttributes }] : []),
      ],
    });
    const body = document ? Buffer.concat([header, document]) : header;
    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/ipp" },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(`CUPS is not answering at ${new URL(this.endpoint).host} (${networkError(err)}): is it installed and running?`);
    }
    if (!res.ok) throw new Error(`CUPS answered HTTP ${res.status}`);
    return decodeResponse(new Uint8Array(await res.arrayBuffer()));
  }
}

/** The useful part of a failed fetch: undici puts the socket's error code under `cause`. */
function networkError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = err.cause as { code?: unknown; message?: unknown } | undefined;
  if (typeof cause?.code === "string") return cause.code;
  if (typeof cause?.message === "string" && cause.message) return cause.message;
  return err.name === "TimeoutError" ? "timed out" : err.message;
}

/**
 * Whether the SELPHY is on the USB bus, from Linux's sysfs: switched
 * off or unplugged, it is gone from there. Unknown where there is no
 * sysfs to read, which leaves the queue's word as the only one.
 */
export async function usbPresence(root = "/sys/bus/usb/devices"): Promise<UsbPresence> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return "unknown";
  }
  const read = (entry: string, file: string) => readFile(join(root, entry, file), "utf8").then((s) => s.trim(), () => undefined);
  const devices = await Promise.all(
    entries.map(async (entry): Promise<UsbDevice | null> => {
      const [vendorId, productId, product] = await Promise.all([read(entry, "idVendor"), read(entry, "idProduct"), read(entry, "product")]);
      return vendorId && productId ? { vendorId, productId, product } : null;
    }),
  );
  return findSelphy(devices.filter((d): d is UsbDevice => d !== null)) ? "present" : "absent";
}

export function printerFor(env: NodeJS.ProcessEnv): Printer {
  const kind = env.BOOTH_PRINTER || "fake";
  switch (kind) {
    case "fake":
      return new FakePrinter();
    case "cups": {
      const queue = env.BOOTH_PRINTER_QUEUE || "SELPHY";
      const server = env.BOOTH_CUPS_URL || "http://localhost:631";
      return new CupsPrinter({ url: new URL(`/printers/${encodeURIComponent(queue)}`, server).toString(), queue });
    }
    default:
      throw new Error(`Unknown BOOTH_PRINTER "${kind}": fake or cups`);
  }
}
