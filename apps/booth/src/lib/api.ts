import { NextResponse } from "next/server";
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

/** Where the QR code points. Phase 5 makes it the gallery on Coolify. */
export function galleryOrigin(): string {
  // `||`, not `??`: a compose file passes an unset variable as "".
  return (process.env.GALLERY_ORIGIN || "https://localhost:3100").replace(/\/+$/, "");
}

export function sessionUrl(id: string): string {
  return `${galleryOrigin()}/s/${id}`;
}
