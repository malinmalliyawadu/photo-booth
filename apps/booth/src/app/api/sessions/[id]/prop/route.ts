import { NextResponse } from "next/server";
import { isPropId, isShortIdShape } from "@booth/core";
import { chooseProp } from "@booth/db";
import { errorResponse, readJson } from "@/lib/api";

/** The guest picked other props on the review screen. */
export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/prop">) {
  const { id } = await ctx.params;
  if (!isShortIdShape(id)) return NextResponse.json({ error: "No such session" }, { status: 404 });
  try {
    const body = await readJson<{ prop?: unknown }>(request);
    if (!isPropId(body.prop)) return NextResponse.json({ error: "Unknown props" }, { status: 400 });
    const row = await chooseProp(id, body.prop);
    return NextResponse.json({ id: row.id, prop: row.prop });
  } catch (err) {
    return errorResponse(err);
  }
}
