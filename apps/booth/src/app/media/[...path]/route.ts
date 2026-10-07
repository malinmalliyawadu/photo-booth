import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { resolveData } from "@booth/db";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/**
 * Serves the data directory: shots, composites and template overlays.
 * Every file name carries an unguessable ID, so a guest cannot browse
 * to another guest's photos, and every file is immutable once written,
 * so the iPad caches hard.
 */
export async function GET(_request: Request, ctx: RouteContext<"/media/[...path]">) {
  const { path: parts } = await ctx.params;
  const relative = parts.join("/");
  const ext = relative.slice(relative.lastIndexOf(".")).toLowerCase();
  const type = TYPES[ext];
  if (!type || parts.some((p) => p === ".." || p === "")) return new Response("Not found", { status: 404 });

  let abs: string;
  try {
    abs = resolveData(relative);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const info = await stat(abs).catch(() => null);
  if (!info?.isFile()) return new Response("Not found", { status: 404 });

  const body = Readable.toWeb(createReadStream(abs)) as ReadableStream<Uint8Array>;
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(info.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
