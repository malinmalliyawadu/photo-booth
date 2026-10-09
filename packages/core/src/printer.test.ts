import { describe, expect, it } from "vitest";
import {
  JOB_STATE,
  PRINTER_STATE,
  describeReasons,
  findSelphy,
  jobOutcome,
  printerHealth,
  printerLink,
  queueBlocked,
  stuckReason,
  type Presence,
  type QueueReport,
} from "./printer";

const queue = (over: Partial<QueueReport> = {}): QueueReport => ({
  state: PRINTER_STATE.idle,
  reasons: ["none"],
  message: "",
  accepting: true,
  ...over,
});

const usb = (presence: Presence) => ({ via: "usb" as const, presence, reasons: [] });
const wifi = (presence: Presence, reasons: string[] = []) => ({ via: "network" as const, presence, reasons });

describe("printerHealth", () => {
  it("is ready when the queue is idle and the printer is on USB", () => {
    expect(printerHealth(queue(), usb("present"), "SELPHY")).toEqual({ status: "ok", detail: "Ready (on USB)" });
    expect(printerHealth(queue({ state: PRINTER_STATE.processing }), usb("present"), "SELPHY")).toEqual({ status: "ok", detail: "Printing (on USB)" });
    expect(printerHealth(queue(), usb("unknown"), "SELPHY")).toEqual({ status: "ok", detail: "Ready (queue ready)" });
  });

  it("says unplugged before anything CUPS thinks, since CUPS cannot tell", () => {
    expect(printerHealth(queue(), usb("absent"), "SELPHY")).toMatchObject({ status: "error", detail: expect.stringMatching(/Not on USB/) });
  });

  it("names the fix for a stopped or refusing queue", () => {
    expect(printerHealth(queue({ state: PRINTER_STATE.stopped, reasons: ["paused"] }), usb("present"), "SELPHY")).toEqual({
      status: "error",
      detail: "The queue is stopped: run cupsenable SELPHY",
    });
    expect(
      printerHealth(queue({ state: PRINTER_STATE.stopped, reasons: ["paused", "media-empty-error"] }), usb("present"), "SELPHY").detail,
    ).toBe("Out of paper: refill the paper tray. The queue is stopped: run cupsenable SELPHY");
    expect(printerHealth(queue({ state: PRINTER_STATE.stopped, message: "Printer error 0x12" }), usb("present"), "SELPHY").detail).toBe(
      "Printer error 0x12. The queue is stopped: run cupsenable SELPHY",
    );
    expect(printerHealth(queue({ accepting: false }), usb("present"), "SELPHY").detail).toBe("The queue is refusing jobs: run cupsaccept SELPHY");
  });

  it("turns state reasons into the attendant's words, errors before warnings", () => {
    expect(printerHealth(queue({ reasons: ["media-low-warning"] }), usb("present"), "SELPHY")).toEqual({ status: "warn", detail: "Paper is running low" });
    expect(printerHealth(queue({ reasons: ["media-low-warning", "marker-supply-empty-error"] }), usb("present"), "SELPHY")).toEqual({
      status: "error",
      detail: "The ink cassette is used up: put in a new one",
    });
    // No suffix is an error by the spec.
    expect(printerHealth(queue({ reasons: ["media-jam"] }), usb("present"), "SELPHY").status).toBe("error");
    expect(printerHealth(queue({ reasons: ["toner-low-error"] }), usb("present"), "SELPHY").detail).toBe("The printer reports toner-low");
  });

  it("ignores reports and CUPS's own progress notes", () => {
    expect(printerHealth(queue({ reasons: ["cups-waiting-for-job-completed", "other-report"] }), usb("present"), "SELPHY").status).toBe("ok");
  });

  it("looks for an AirPrint printer on the Wi-Fi, and takes its word with the queue's", () => {
    expect(printerHealth(queue(), wifi("present", ["none"]), "SELPHY")).toEqual({ status: "ok", detail: "Ready (on Wi-Fi)" });
    expect(printerHealth(queue(), wifi("absent"), "SELPHY")).toEqual({
      status: "error",
      detail: "Not answering on Wi-Fi: check that the printer is switched on and on the booth's Wi-Fi",
    });
    // Idle, CUPS knows nothing of the paper; the printer does.
    expect(printerHealth(queue(), wifi("present", ["media-empty-error"]), "SELPHY")).toMatchObject({ status: "error", detail: "Out of paper: refill the paper tray" });
    expect(printerHealth(queue({ reasons: ["media-low-warning"] }), wifi("present", ["media-low-warning"]), "SELPHY").detail).toBe("Paper is running low");
  });
});

describe("printerLink", () => {
  it("looks on the USB bus for a USB queue", () => {
    expect(printerLink("gutenprint53+usb://canon-cp1300/C1234")).toEqual({ via: "usb" });
    expect(printerLink("usb://Canon/SELPHY%20CP1300?serial=1")).toEqual({ via: "usb" });
  });

  it("asks an AirPrint printer over plain HTTP, on IPP's port unless the URI names one", () => {
    expect(printerLink("ipp://Canon-SELPHY-CP1300.local:631/ipp/print")).toEqual({
      via: "network",
      url: "http://Canon-SELPHY-CP1300.local:631/ipp/print",
      printerUri: "ipp://Canon-SELPHY-CP1300.local:631/ipp/print",
    });
    expect(printerLink("ipp://192.168.8.20/ipp/print")).toMatchObject({ url: "http://192.168.8.20:631/ipp/print" });
    expect(printerLink("ipp://[fe80::1]:8631/ipp/print")).toMatchObject({ url: "http://[fe80::1]:8631/ipp/print" });
  });

  it("cannot look for a printer it would need DNS-SD or a certificate to reach", () => {
    expect(printerLink("dnssd://Canon%20SELPHY%20CP1300._ipp._tcp.local./?uuid=1")).toEqual({ via: "unknown" });
    expect(printerLink("ipps://Canon-SELPHY-CP1300.local:443/ipp/print")).toEqual({ via: "unknown" });
    expect(printerLink(undefined)).toEqual({ via: "unknown" });
    expect(printerLink("not a uri")).toEqual({ via: "unknown" });
  });
});

describe("describeReasons", () => {
  it("weighs a known keyword by what it means, not by its suffix", () => {
    // A printer that calls an empty tray a warning still cannot print.
    expect(describeReasons(["media-empty-warning"])).toEqual({ status: "error", detail: "Out of paper: refill the paper tray", empty: "paper" });
    expect(describeReasons(["marker-supply-empty"])).toMatchObject({ status: "error", empty: "ink" });
    expect(describeReasons(["media-low-error"])).toMatchObject({ status: "warn", empty: null });
    expect(describeReasons(["media-empty-report"])).toBeNull();
  });

  it("names the blocking reason over a warning listed first", () => {
    expect(describeReasons(["media-low-warning", "media-jam-error"])?.detail).toBe("Paper jam: open the printer and clear it");
  });
});

describe("queueBlocked", () => {
  it("is nothing for a queue that can print, warnings and all", () => {
    expect(queueBlocked(queue())).toBeNull();
    expect(queueBlocked(queue({ reasons: ["media-low-warning"] }))).toBeNull();
  });

  it("is the reason a person has to fix, or the stopped queue", () => {
    expect(queueBlocked(queue({ reasons: ["media-empty-error"] }))).toMatchObject({ detail: "Out of paper: refill the paper tray", empty: "paper" });
    expect(queueBlocked(queue({ state: PRINTER_STATE.stopped, reasons: ["paused"], message: "Paused by lp" }))).toEqual({
      status: "error",
      detail: "Paused by lp",
      empty: null,
    });
    expect(queueBlocked(queue({ state: PRINTER_STATE.stopped, reasons: ["paused"] }))?.detail).toBe("The print queue is stopped");
  });
});

describe("jobOutcome", () => {
  const job = (state: number, message = "") => ({ state, reasons: [], message });

  it("waits until the job is done one way or the other", () => {
    for (const s of [JOB_STATE.pending, JOB_STATE.pendingHeld, JOB_STATE.processing, JOB_STATE.processingStopped]) {
      expect(jobOutcome(job(s), queue())).toEqual({ kind: "waiting" });
    }
    expect(jobOutcome(job(JOB_STATE.completed), queue())).toEqual({ kind: "printed" });
  });

  it("explains a failed job by the printer first, then the job, then the queue", () => {
    expect(jobOutcome(job(JOB_STATE.aborted, "Job aborted"), queue({ reasons: ["media-empty-error"] }))).toEqual({
      kind: "failed",
      reason: "Out of paper: refill the paper tray",
      empty: "paper",
    });
    expect(jobOutcome(job(JOB_STATE.aborted, "Backend failed"), queue({ message: "x" }))).toEqual({ kind: "failed", reason: "Backend failed", empty: null });
    expect(jobOutcome(job(JOB_STATE.aborted), queue({ message: "Printer not responding" }))).toEqual({
      kind: "failed",
      reason: "Printer not responding",
      empty: null,
    });
    expect(jobOutcome(job(JOB_STATE.canceled), null)).toEqual({ kind: "failed", reason: "The print was cancelled", empty: null });
    expect(jobOutcome(job(JOB_STATE.aborted), null)).toEqual({ kind: "failed", reason: "The printer gave up on the print", empty: null });
  });

  it("says what a stuck job was waiting on", () => {
    expect(stuckReason(job(JOB_STATE.processing), queue({ reasons: ["media-jam-error"] }))).toBe(
      "The print did not finish within 3 minutes: Paper jam: open the printer and clear it",
    );
    expect(stuckReason(job(JOB_STATE.pending), null)).toBe("The print did not finish within 3 minutes");
    expect(stuckReason(job(JOB_STATE.pending), null, 3000)).toBe("The print did not finish within 3 seconds");
  });
});

describe("findSelphy", () => {
  it("finds the Canon printer and not a Canon camera", () => {
    const camera = { vendorId: "04a9", productId: "32d5", product: "Canon Digital Camera" };
    const selphy = { vendorId: "04a9", productId: "3302", product: "SELPHY CP1300" };
    expect(findSelphy([camera, selphy])).toBe(selphy);
    expect(findSelphy([camera])).toBeNull();
    expect(findSelphy([{ vendorId: "05ac", productId: "12a8", product: "iPad" }])).toBeNull();
    expect(findSelphy([{ vendorId: "04A9", productId: "3302", product: "CP1300" }])).not.toBeNull();
  });

  it("counts a Canon device with no product string rather than claim the printer is unplugged", () => {
    expect(findSelphy([{ vendorId: "04a9", productId: "3302" }])).not.toBeNull();
  });
});
