import { NextResponse } from "next/server";
import { isShortIdShape } from "@booth/core";
import { chooseMirror } from "@booth/db";
import { errorResponse, readJson } from "@/lib/api";

/** The guest flipped the photos on the review screen, or flipped them back. */
export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/mirror">) {
  const { id } = await ctx.params;
  if (!isShortIdShape(id)) return NextResponse.json({ error: "No such session" }, { status: 404 });
  try {
    const body = await readJson<{ mirrored?: unknown }>(request);
    if (typeof body.mirrored !== "boolean") return NextResponse.json({ error: "mirrored must be true or false" }, { status: 400 });
    const row = await chooseMirror(id, body.mirrored);
    return NextResponse.json({ id: row.id, mirrored: row.mirrored });
  } catch (err) {
    return errorResponse(err);
  }
}
