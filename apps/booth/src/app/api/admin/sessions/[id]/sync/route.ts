import { NextResponse } from "next/server";
import { isShortIdShape } from "@booth/core";
import { resyncSession } from "@booth/db";
import { errorResponse } from "@/lib/api";

/** Queues another send to the gallery; the gallery replaces its copy rather than adding one. */
export async function POST(_request: Request, ctx: RouteContext<"/api/admin/sessions/[id]/sync">) {
  const { id } = await ctx.params;
  if (!isShortIdShape(id)) return NextResponse.json({ error: "No such session" }, { status: 404 });
  try {
    await resyncSession(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
