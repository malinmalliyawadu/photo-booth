import { describe, expect, it } from "vitest";
import { GROUP, OPERATION, VALUE, decodeResponse, describeStatus, encodeRequest, groupOf, isSuccess } from "./ipp";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

/** Builds response bytes by hand: [tag, name, value bytes] per attribute. */
function response(status: number, body: (number | [number, string, Uint8Array | string])[]): Uint8Array {
  const parts: number[] = [2, 0, status >> 8, status & 0xff, 0, 0, 0, 7];
  for (const item of body) {
    if (typeof item === "number") {
      parts.push(item);
      continue;
    }
    const [tag, name, value] = item;
    const n = new TextEncoder().encode(name);
    const v = typeof value === "string" ? new TextEncoder().encode(value) : value;
    parts.push(tag, n.length >> 8, n.length & 0xff, ...n, v.length >> 8, v.length & 0xff, ...v);
  }
  parts.push(GROUP.end);
  return Uint8Array.from(parts);
}

const int = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setInt32(0, n);
  return b;
};

describe("encodeRequest", () => {
  it("writes the header, each group, and the end tag", () => {
    const bytes = encodeRequest({
      operation: OPERATION.getPrinterAttributes,
      requestId: 1,
      groups: [
        {
          tag: GROUP.operation,
          attributes: [
            { tag: VALUE.charset, name: "attributes-charset", values: ["utf-8"] },
            { tag: VALUE.keyword, name: "requested-attributes", values: ["printer-state", "copies"] },
          ],
        },
      ],
    });
    expect(hex(bytes)).toBe(
      [
        "0200", "000b", "00000001", // version 2.0, Get-Printer-Attributes, request 1
        "01", // operation attributes
        "47", "0012", hex(new TextEncoder().encode("attributes-charset")), "0005", hex(new TextEncoder().encode("utf-8")),
        "44", "0014", hex(new TextEncoder().encode("requested-attributes")), "000d", hex(new TextEncoder().encode("printer-state")),
        "44", "0000", "0006", hex(new TextEncoder().encode("copies")), // a second value has no name
        "03",
      ].join(""),
    );
  });

  it("encodes integers, enums and booleans as their fixed-width forms", () => {
    const bytes = encodeRequest({
      operation: OPERATION.getJobAttributes,
      requestId: 2,
      groups: [
        {
          tag: GROUP.operation,
          attributes: [
            { tag: VALUE.integer, name: "job-id", values: [-2] },
            { tag: VALUE.boolean, name: "b", values: [true] },
          ],
        },
      ],
    });
    expect(hex(bytes.subarray(9))).toBe("21" + "0006" + hex(new TextEncoder().encode("job-id")) + "0004" + "fffffffe" + "22" + "0001" + "62" + "0001" + "01" + "03");
  });

  it("refuses a value of the wrong type rather than sending garbage", () => {
    expect(() =>
      encodeRequest({ operation: 1, requestId: 1, groups: [{ tag: GROUP.operation, attributes: [{ tag: VALUE.integer, name: "job-id", values: ["7"] }] }] }),
    ).toThrow(/integer/);
    expect(() =>
      encodeRequest({ operation: 1, requestId: 1, groups: [{ tag: GROUP.operation, attributes: [{ tag: VALUE.keyword, name: "x", values: [] }] }] }),
    ).toThrow(/no values/);
  });
});

describe("decodeResponse", () => {
  it("reads the status, groups, and every value shape CUPS sends", () => {
    const date = Uint8Array.of(0x07, 0xea, 10, 9, 14, 30, 5, 0, 0x2b, 13, 0); // 2026-10-09 14:30:05 +13:00
    const bytes = response(0x0000, [
      GROUP.operation,
      [VALUE.charset, "attributes-charset", "utf-8"],
      [VALUE.textWithLanguage, "status-message", Uint8Array.of(0, 2, 0x65, 0x6e, 0, 2, 0x6f, 0x6b)],
      GROUP.printer,
      [VALUE.enum, "printer-state", int(3)],
      [VALUE.keyword, "printer-state-reasons", "media-empty-error"],
      [VALUE.keyword, "", "cups-waiting-for-job-completed"],
      [VALUE.boolean, "printer-is-accepting-jobs", Uint8Array.of(1)],
      [VALUE.resolution, "printer-resolution-default", Uint8Array.of(...int(300), ...int(300), 3)],
      [VALUE.rangeOfInteger, "copies-supported", Uint8Array.of(...int(1), ...int(99))],
      [VALUE.dateTime, "printer-current-time", date],
      [VALUE.noValue, "printer-state-message", new Uint8Array()],
    ]);
    const res = decodeResponse(bytes);
    expect(res.status).toBe(0);
    expect(res.requestId).toBe(7);
    expect(isSuccess(res.status)).toBe(true);
    expect(groupOf(res, GROUP.operation).get("status-message")).toEqual(["ok"]);
    const printer = groupOf(res, GROUP.printer);
    expect(printer.get("printer-state")).toEqual([3]);
    expect(printer.get("printer-state-reasons")).toEqual(["media-empty-error", "cups-waiting-for-job-completed"]);
    expect(printer.get("printer-is-accepting-jobs")).toEqual([true]);
    expect(printer.get("printer-resolution-default")).toEqual([{ x: 300, y: 300, units: 3 }]);
    expect(printer.get("copies-supported")).toEqual([{ lower: 1, upper: 99 }]);
    expect(printer.get("printer-current-time")).toEqual([new Date("2026-10-09T01:30:05Z")]);
    expect(printer.get("printer-state-message")).toEqual([null]);
  });

  it("reads collections, nested and multi-valued", () => {
    const bytes = response(0x0000, [
      GROUP.printer,
      [VALUE.begCollection, "media-col-default", new Uint8Array()],
      [VALUE.memberAttrName, "", "media-size"],
      [VALUE.begCollection, "", new Uint8Array()],
      [VALUE.memberAttrName, "", "x-dimension"],
      [VALUE.integer, "", int(14800)],
      [VALUE.memberAttrName, "", "y-dimension"],
      [VALUE.integer, "", int(10000)],
      [VALUE.endCollection, "", new Uint8Array()],
      [VALUE.memberAttrName, "", "media-type"],
      [VALUE.keyword, "", "photographic"],
      [VALUE.keyword, "", "stationery"],
      [VALUE.endCollection, "", new Uint8Array()],
      [VALUE.integer, "after", int(1)],
    ]);
    const printer = groupOf(decodeResponse(bytes), GROUP.printer);
    expect(printer.get("media-col-default")).toEqual([
      { "media-size": [{ "x-dimension": [14800], "y-dimension": [10000] }], "media-type": ["photographic", "stationery"] },
    ]);
    expect(printer.get("after")).toEqual([1]);
  });

  it("keeps one group per repeated delimiter, one per job", () => {
    const res = decodeResponse(
      response(0x0000, [GROUP.operation, GROUP.job, [VALUE.integer, "job-id", int(1)], GROUP.job, [VALUE.integer, "job-id", int(2)]]),
    );
    expect(res.groups.filter((g) => g.tag === GROUP.job).map((g) => g.attributes.get("job-id"))).toEqual([[1], [2]]);
  });

  it("names the status and passes on the server's message", () => {
    const res = decodeResponse(
      response(0x0406, [GROUP.operation, [VALUE.text, "status-message", "The printer or class does not exist."]]),
    );
    expect(isSuccess(res.status)).toBe(false);
    expect(describeStatus(res)).toBe("client-error-not-found: The printer or class does not exist.");
    expect(describeStatus(decodeResponse(response(0x0999, [])))).toBe("status 0x0999");
  });

  it("says so when the bytes stop short", () => {
    const whole = response(0, [GROUP.printer, [VALUE.keyword, "printer-state-reasons", "none"]]);
    expect(() => decodeResponse(whole.subarray(0, whole.length - 3))).toThrow(/ended early/);
  });

  it("decodes what it encodes", () => {
    const sent = encodeRequest({
      operation: OPERATION.printJob,
      requestId: 9,
      groups: [
        {
          tag: GROUP.operation,
          attributes: [
            { tag: VALUE.uri, name: "printer-uri", values: ["ipp://localhost/printers/SELPHY"] },
            { tag: VALUE.name, name: "job-name", values: ["Booth K7QF"] },
          ],
        },
        { tag: GROUP.job, attributes: [{ tag: VALUE.keyword, name: "print-scaling", values: ["fill"] }] },
      ],
    });
    const back = decodeResponse(sent);
    expect(back.status).toBe(OPERATION.printJob);
    expect(groupOf(back, GROUP.operation).get("job-name")).toEqual(["Booth K7QF"]);
    expect(groupOf(back, GROUP.job).get("print-scaling")).toEqual(["fill"]);
  });
});
