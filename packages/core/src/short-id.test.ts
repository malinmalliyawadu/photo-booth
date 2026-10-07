import { describe, expect, it } from "vitest";
import { SHORT_ID_LENGTH, isShortIdShape, newShortId, spellShortId } from "./short-id";

describe("newShortId", () => {
  it("is the declared length", () => {
    expect(newShortId()).toHaveLength(SHORT_ID_LENGTH);
  });

  it("never emits a confusable character", () => {
    const banned = /[il1o]/;
    for (let i = 0; i < 500; i++) expect(newShortId()).not.toMatch(banned);
  });

  it("uses the whole alphabet rather than a biased slice", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) for (const c of newShortId()) seen.add(c);
    expect(seen.size).toBe(32);
  });

  it("does not repeat", () => {
    const ids = new Set(Array.from({ length: 2000 }, () => newShortId()));
    expect(ids.size).toBe(2000);
  });

  it("produces ids its own validator accepts", () => {
    for (let i = 0; i < 200; i++) expect(isShortIdShape(newShortId())).toBe(true);
  });
});

describe("isShortIdShape", () => {
  it("rejects the wrong length", () => {
    expect(isShortIdShape("abc")).toBe(false);
    expect(isShortIdShape("a".repeat(SHORT_ID_LENGTH + 1))).toBe(false);
    expect(isShortIdShape("")).toBe(false);
  });

  it("rejects characters outside the alphabet", () => {
    for (const bad of ["A", "i", "l", "o", "1", "-", "/", ".", "%"]) {
      expect(isShortIdShape(bad + "a".repeat(SHORT_ID_LENGTH - 1))).toBe(false);
    }
  });

  it("is not fooled by a valid id with something appended", () => {
    expect(isShortIdShape(`${newShortId()}/../admin`)).toBe(false);
    expect(isShortIdShape(`${newShortId()}\n`)).toBe(false);
  });
});

describe("spellShortId", () => {
  it("groups in fours", () => {
    expect(spellShortId("abcdefghjkmnpqrstuvw")).toBe("abcd efgh jkmn pqrs tuvw");
  });
});
