import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminConfigured, checkPassword, expectedToken } from "@/lib/admin-auth";
import { readJson } from "@/lib/api";

export async function POST(request: Request) {
  if (!adminConfigured()) {
    return NextResponse.json({ error: "ADMIN_PASSWORD is not set on the controller" }, { status: 503 });
  }
  const body = await readJson<{ password?: unknown }>(request).catch(() => ({}) as { password?: unknown });
  if (typeof body.password !== "string" || !(await checkPassword(body.password))) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const token = (await expectedToken())!;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // The booth is HTTPS; `pnpm dev:http` is the one exception and a
    // Secure cookie would silently never be set there.
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
