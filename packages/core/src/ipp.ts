/**
 * The Internet Printing Protocol's wire format (RFC 8010), which is
 * how the worker talks to CUPS: a request is a short binary header,
 * groups of tagged attributes, and then the document; the response is
 * the same shape with a status code where the operation was.
 *
 * Just the codec: no sockets, no clock. The worker POSTs the bytes to
 * CUPS over HTTP and decodes what comes back.
 */

export const IPP_VERSION = [2, 0] as const;

export const OPERATION = {
  printJob: 0x0002,
  cancelJob: 0x0008,
  getJobAttributes: 0x0009,
  getPrinterAttributes: 0x000b,
} as const;

export const GROUP = {
  operation: 0x01,
  job: 0x02,
  end: 0x03,
  printer: 0x04,
  unsupported: 0x05,
} as const;
export type GroupTag = (typeof GROUP)[keyof typeof GROUP];

export const VALUE = {
  unsupported: 0x10,
  unknown: 0x12,
  noValue: 0x13,
  integer: 0x21,
  boolean: 0x22,
  enum: 0x23,
  octetString: 0x30,
  dateTime: 0x31,
  resolution: 0x32,
  rangeOfInteger: 0x33,
  begCollection: 0x34,
  textWithLanguage: 0x35,
  nameWithLanguage: 0x36,
  endCollection: 0x37,
  text: 0x41,
  name: 0x42,
  keyword: 0x44,
  uri: 0x45,
  uriScheme: 0x46,
  charset: 0x47,
  naturalLanguage: 0x48,
  mimeMediaType: 0x49,
  memberAttrName: 0x4a,
} as const;
export type ValueTag = (typeof VALUE)[keyof typeof VALUE];

export interface IppResolution {
  x: number;
  y: number;
  /** 3 is dots per inch, 4 dots per centimetre. */
  units: number;
}

export interface IppRange {
  lower: number;
  upper: number;
}

export interface IppCollection {
  [member: string]: IppValue[];
}

/** Out-of-band values (unsupported, unknown, no-value) decode as null. */
export type IppValue = number | boolean | string | Date | Uint8Array | IppResolution | IppRange | IppCollection | null;

/** One attribute to send: the tag says how its values are encoded. */
export interface IppAttribute {
  tag: ValueTag;
  name: string;
  values: (number | boolean | string)[];
}

export interface IppRequest {
  operation: number;
  requestId: number;
  groups: { tag: GroupTag; attributes: IppAttribute[] }[];
}

export interface IppResponse {
  version: [number, number];
  status: number;
  requestId: number;
  groups: { tag: GroupTag; attributes: Map<string, IppValue[]> }[];
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The header and attributes of a request; the document, if any, follows these bytes. */
export function encodeRequest(request: IppRequest): Uint8Array {
  const out = new Writer();
  out.u8(IPP_VERSION[0]).u8(IPP_VERSION[1]).u16(request.operation).i32(request.requestId);
  for (const group of request.groups) {
    out.u8(group.tag);
    for (const attr of group.attributes) {
      if (attr.values.length === 0) throw new Error(`IPP attribute ${attr.name} has no values`);
      attr.values.forEach((value, i) => {
        out.u8(attr.tag);
        out.string16(i === 0 ? attr.name : "");
        out.bytes16(encodeValue(attr.tag, value, attr.name));
      });
    }
  }
  out.u8(GROUP.end);
  return out.finish();
}

function encodeValue(tag: ValueTag, value: number | boolean | string, name: string): Uint8Array {
  switch (tag) {
    case VALUE.integer:
    case VALUE.enum: {
      if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`IPP ${name} wants an integer, got ${value}`);
      const b = new Uint8Array(4);
      new DataView(b.buffer).setInt32(0, value);
      return b;
    }
    case VALUE.boolean:
      if (typeof value !== "boolean") throw new Error(`IPP ${name} wants a boolean, got ${value}`);
      return Uint8Array.of(value ? 1 : 0);
    case VALUE.text:
    case VALUE.name:
    case VALUE.keyword:
    case VALUE.uri:
    case VALUE.uriScheme:
    case VALUE.charset:
    case VALUE.naturalLanguage:
    case VALUE.mimeMediaType:
      if (typeof value !== "string") throw new Error(`IPP ${name} wants a string, got ${value}`);
      return encoder.encode(value);
    default:
      throw new Error(`Sending IPP value tag 0x${tag.toString(16)} is not supported`);
  }
}

export function decodeResponse(bytes: Uint8Array): IppResponse {
  const r = new Reader(bytes);
  const version: [number, number] = [r.u8(), r.u8()];
  const status = r.u16();
  const requestId = r.i32();
  const groups: IppResponse["groups"] = [];
  let current: Map<string, IppValue[]> | null = null;
  let last: IppValue[] | null = null;

  for (;;) {
    const tag = r.u8();
    if (tag === GROUP.end) break;
    if (tag < 0x10) {
      // A delimiter: a new group starts (the same group tag may repeat, one per job or printer).
      current = new Map();
      groups.push({ tag: tag as GroupTag, attributes: current });
      last = null;
      continue;
    }
    if (!current) throw new Error("IPP response has an attribute before any group");
    const name = r.string16();
    if (name === "") {
      // Another value of the attribute before it.
      if (!last) throw new Error("IPP response has an additional value with no attribute");
      last.push(readValue(r, tag));
    } else {
      last = [readValue(r, tag)];
      current.set(name, last);
    }
  }
  return { version, status, requestId, groups };
}

function readValue(r: Reader, tag: number): IppValue {
  if (tag === VALUE.begCollection) {
    r.skip(r.u16());
    return readCollection(r);
  }
  const value = r.bytes16();
  return decodeValue(tag, value);
}

/** Members are a memberAttrName followed by its values, until endCollection. */
function readCollection(r: Reader): IppCollection {
  const collection: IppCollection = {};
  let member: IppValue[] | null = null;
  for (;;) {
    const tag = r.u8();
    r.skip(r.u16()); // members carry their name as a value, so this one is empty
    if (tag === VALUE.endCollection) {
      r.skip(r.u16());
      return collection;
    }
    if (tag === VALUE.memberAttrName) {
      member = [];
      collection[decoder.decode(r.bytes16())] = member;
      continue;
    }
    if (!member) throw new Error("IPP collection has a value with no member name");
    if (tag === VALUE.begCollection) {
      r.skip(r.u16());
      member.push(readCollection(r));
    } else {
      member.push(decodeValue(tag, r.bytes16()));
    }
  }
}

function decodeValue(tag: number, b: Uint8Array): IppValue {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  switch (tag) {
    case VALUE.integer:
    case VALUE.enum:
      return view.getInt32(0);
    case VALUE.boolean:
      return b[0] !== 0;
    case VALUE.dateTime: {
      // RFC 2579 DateAndTime: local time plus the offset from UTC.
      const utc = Date.UTC(view.getUint16(0), b[2]! - 1, b[3], b[4], b[5], b[6], b[7]! * 100);
      const sign = b[8] === 0x2d ? -1 : 1; // '-' is behind UTC
      return new Date(utc - sign * (b[9]! * 60 + b[10]!) * 60_000);
    }
    case VALUE.resolution:
      return { x: view.getInt32(0), y: view.getInt32(4), units: b[8]! };
    case VALUE.rangeOfInteger:
      return { lower: view.getInt32(0), upper: view.getInt32(4) };
    case VALUE.textWithLanguage:
    case VALUE.nameWithLanguage: {
      const langLength = view.getUint16(0);
      const textLength = view.getUint16(2 + langLength);
      return decoder.decode(b.subarray(4 + langLength, 4 + langLength + textLength));
    }
    case VALUE.octetString:
      return b.slice();
    default:
      if (tag >= 0x10 && tag <= 0x1f) return null;
      if (tag >= 0x40 && tag <= 0x5f) return decoder.decode(b);
      return b.slice();
  }
}

/** The first group with this tag, or an empty map. */
export function groupOf(response: IppResponse, tag: GroupTag): Map<string, IppValue[]> {
  return response.groups.find((g) => g.tag === tag)?.attributes ?? new Map();
}

export function isSuccess(status: number): boolean {
  return status < 0x0100;
}

const STATUS_NAMES: Record<number, string> = {
  0x0000: "successful-ok",
  0x0001: "successful-ok-ignored-or-substituted-attributes",
  0x0002: "successful-ok-conflicting-attributes",
  0x0400: "client-error-bad-request",
  0x0401: "client-error-forbidden",
  0x0402: "client-error-not-authenticated",
  0x0403: "client-error-not-authorized",
  0x0404: "client-error-not-possible",
  0x0405: "client-error-timeout",
  0x0406: "client-error-not-found",
  0x0407: "client-error-gone",
  0x040a: "client-error-document-format-not-supported",
  0x040b: "client-error-attributes-or-values-not-supported",
  0x0411: "client-error-document-format-error",
  0x0500: "server-error-internal-error",
  0x0501: "server-error-operation-not-supported",
  0x0502: "server-error-service-unavailable",
  0x0503: "server-error-version-not-supported",
  0x0504: "server-error-device-error",
  0x0505: "server-error-temporary-error",
  0x0506: "server-error-not-accepting-jobs",
  0x0507: "server-error-busy",
  0x0508: "server-error-job-canceled",
};

export const STATUS_NOT_FOUND = 0x0406;

/** The status code's keyword, with the server's own message when it sent one. */
export function describeStatus(response: IppResponse): string {
  const name = STATUS_NAMES[response.status] ?? `status 0x${response.status.toString(16).padStart(4, "0")}`;
  const message = groupOf(response, GROUP.operation).get("status-message")?.[0];
  return typeof message === "string" && message ? `${name}: ${message}` : name;
}

class Writer {
  private chunks: Uint8Array[] = [];

  u8(n: number): this {
    this.chunks.push(Uint8Array.of(n));
    return this;
  }

  u16(n: number): this {
    this.chunks.push(Uint8Array.of(n >> 8, n & 0xff));
    return this;
  }

  i32(n: number): this {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setInt32(0, n);
    this.chunks.push(b);
    return this;
  }

  string16(s: string): this {
    return this.bytes16(encoder.encode(s));
  }

  bytes16(b: Uint8Array): this {
    if (b.length > 0xffff) throw new Error("IPP value longer than 65535 bytes");
    this.u16(b.length);
    this.chunks.push(b);
    return this;
  }

  finish(): Uint8Array {
    const out = new Uint8Array(this.chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of this.chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
}

class Reader {
  private at = 0;
  private readonly view: DataView;

  constructor(private readonly b: Uint8Array) {
    this.view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }

  private need(n: number) {
    if (this.at + n > this.b.length) throw new Error("IPP response ended early");
  }

  u8(): number {
    this.need(1);
    return this.b[this.at++]!;
  }

  u16(): number {
    this.need(2);
    const n = this.view.getUint16(this.at);
    this.at += 2;
    return n;
  }

  i32(): number {
    this.need(4);
    const n = this.view.getInt32(this.at);
    this.at += 4;
    return n;
  }

  skip(n: number) {
    this.need(n);
    this.at += n;
  }

  bytes16(): Uint8Array {
    const n = this.u16();
    this.need(n);
    const b = this.b.subarray(this.at, this.at + n);
    this.at += n;
    return b;
  }

  string16(): string {
    return decoder.decode(this.bytes16());
  }
}
