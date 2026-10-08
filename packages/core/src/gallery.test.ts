import { describe, expect, it } from "vitest";
import { gallerySetting, planSync, sessionLink, type GallerySetting } from "./gallery";

const ID = "abcdefghjkmnpqrstuvw";

describe("sessionLink", () => {
  it("fills the placeholder in", () => {
    expect(sessionLink("https://w.example/i/booth/{id}", ID)).toBe(`https://w.example/i/booth/${ID}`);
  });

  it("appends the ID to a bare prefix, with or without a trailing slash", () => {
    expect(sessionLink("https://w.example/i/booth", ID)).toBe(`https://w.example/i/booth/${ID}`);
    expect(sessionLink("https://w.example/i/booth/", ID)).toBe(`https://w.example/i/booth/${ID}`);
  });

  it("fills every placeholder and ignores whitespace around the template", () => {
    expect(sessionLink("  https://w.example/{id}?s={id} ", ID)).toBe(`https://w.example/${ID}?s=${ID}`);
  });
});

describe("gallerySetting", () => {
  it("is off with nothing set, and treats an empty compose variable as unset", () => {
    expect(gallerySetting({})).toEqual({ kind: "off" });
    expect(gallerySetting({ GALLERY_SYNC_URL: "", GALLERY_SYNC_TOKEN: "" })).toEqual({ kind: "off" });
  });

  it("is on with a URL and a token", () => {
    expect(gallerySetting({ GALLERY_SYNC_URL: "https://w.example/api/booth/photos", GALLERY_SYNC_TOKEN: "s3cret" })).toEqual({
      kind: "on",
      url: "https://w.example/api/booth/photos",
      token: "s3cret",
      host: "w.example",
    });
  });

  it("reports half a configuration rather than guessing", () => {
    expect(gallerySetting({ GALLERY_SYNC_URL: "https://w.example/x" })).toMatchObject({ kind: "invalid", detail: expect.stringContaining("GALLERY_SYNC_TOKEN") });
    expect(gallerySetting({ GALLERY_SYNC_TOKEN: "s3cret" })).toMatchObject({ kind: "invalid", detail: expect.stringContaining("GALLERY_SYNC_URL") });
  });

  it("reports a URL it cannot send to", () => {
    expect(gallerySetting({ GALLERY_SYNC_URL: "w.example/api", GALLERY_SYNC_TOKEN: "t" })).toMatchObject({ kind: "invalid", detail: expect.stringContaining("not a URL") });
    expect(gallerySetting({ GALLERY_SYNC_URL: "ftp://w.example/api", GALLERY_SYNC_TOKEN: "t" })).toMatchObject({ kind: "invalid", detail: expect.stringContaining("http") });
  });
});

describe("planSync", () => {
  const on: GallerySetting = { kind: "on", url: "https://w.example/api/booth/photos", token: "t", host: "w.example" };
  const composed = { deletedAt: null, webPath: "sessions/x/web-1.jpg", thumbPath: "sessions/x/thumb-1.jpg" };

  it("uploads the web photo and thumbnail of a composed session", () => {
    expect(planSync(on, composed)).toEqual({ kind: "upload", photo: composed.webPath, thumb: composed.thumbPath });
  });

  it("skips a deleted session whatever else is true", () => {
    expect(planSync(on, { ...composed, deletedAt: new Date() })).toMatchObject({ kind: "skip" });
    expect(planSync({ kind: "off" }, { ...composed, deletedAt: new Date() })).toMatchObject({ kind: "skip" });
  });

  it("skips quietly when no gallery is configured", () => {
    expect(planSync({ kind: "off" }, composed)).toEqual({ kind: "skip", reason: "no gallery is configured" });
  });

  it("fails, to be retried, when the gallery is misconfigured", () => {
    expect(planSync({ kind: "invalid", detail: "bad" }, composed)).toEqual({ kind: "fail", reason: "bad" });
  });

  it("fails rather than sending the raw shots when there is no web photo yet", () => {
    expect(planSync(on, { ...composed, webPath: null })).toMatchObject({ kind: "fail", reason: expect.stringContaining("compositor") });
    expect(planSync(on, { ...composed, thumbPath: null })).toMatchObject({ kind: "fail" });
  });
});
