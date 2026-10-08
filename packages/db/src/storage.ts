/**
 * The data directory: originals, composites and templates on the
 * controller's SSD. Postgres holds paths relative to it, so the
 * directory can move (or be restored from the night-of backup) without
 * touching a row.
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

let repoRoot: string | undefined;

/**
 * The nearest ancestor of the working directory that holds the
 * workspace file. Every package script runs from its own folder, so a
 * relative BOOTH_DATA_DIR has to mean the same place for all of them.
 * Production sets an absolute path and never gets here.
 */
function findRepoRoot(): string {
  if (repoRoot) return repoRoot;
  let dir = process.cwd();
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return (repoRoot = dir);
    const parent = path.dirname(dir);
    if (parent === dir) return (repoRoot = process.cwd());
    dir = parent;
  }
}

export function dataDir(): string {
  return path.resolve(findRepoRoot(), process.env.BOOTH_DATA_DIR ?? "./data");
}

/** Absolute path for a stored relative path, refusing anything that escapes the data directory. */
export function resolveData(relative: string): string {
  const root = dataDir();
  const abs = path.resolve(root, relative);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`Path escapes the data directory: ${relative}`);
  }
  return abs;
}

/**
 * Where a session's files go. `/media` tells browsers a file never
 * changes, so a file is never written twice: every call but `dir` names
 * a new file, and the row it is stored on is how it is found again. A
 * retake that reused `shot-1.jpg` would show the guest their first
 * photo, straight from Safari's cache.
 */
export const sessionPaths = {
  dir: (id: string) => `sessions/${id}`,
  shot: (id: string, shot: number) => `sessions/${id}/shot-${shot}-${fresh()}.jpg`,
  composite: (id: string) => `sessions/${id}/print-${fresh()}.jpg`,
  web: (id: string) => `sessions/${id}/web-${fresh()}.jpg`,
  thumb: (id: string) => `sessions/${id}/thumb-${fresh()}.jpg`,
};

function fresh(): string {
  return randomBytes(4).toString("hex");
}

export const templatePaths = {
  png: (id: string) => `templates/${id}.png`,
  /** The same PNG with the magenta knocked out, for layering over photos. */
  overlay: (id: string) => `templates/${id}.overlay.png`,
  thumb: (id: string) => `templates/${id}.thumb.png`,
};

export async function ensureDir(relative: string): Promise<string> {
  const abs = resolveData(relative);
  await mkdir(abs, { recursive: true });
  return abs;
}

export async function removeData(relative: string): Promise<void> {
  await rm(resolveData(relative), { recursive: true, force: true });
}

/** The URL the booth app serves a stored file at. */
export function mediaUrl(relative: string | null): string | null {
  return relative ? `/media/${relative}` : null;
}
