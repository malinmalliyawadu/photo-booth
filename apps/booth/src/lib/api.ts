import { NextResponse } from "next/server";
import { sessionLink } from "@booth/core";
import { SessionError, TemplateError } from "@booth/db";

/** Maps the persistence layer's refusals to responses; anything else is a 500 with its message logged. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof SessionError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof TemplateError) return NextResponse.json({ error: err.message }, { status: 400 });
  console.error(err);
  return NextResponse.json({ error: "Something went wrong on the booth" }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new SessionError("Malformed JSON", 400);
  }
}

/**
 * Where the QR code points: the gallery's page for the session, from
 * `GALLERY_SESSION_URL` (see `sessionLink`). Unset, it points at the
 * booth itself, which has no such page: a QR has to encode something,
 * and a booth with no gallery is a booth whose prints are the copy.
 */
export function sessionUrl(id: string): string {
  // `||`, not `??`: a compose file passes an unset variable as "".
  return sessionLink(process.env.GALLERY_SESSION_URL || "https://localhost:3100/s/{id}", id);
}
