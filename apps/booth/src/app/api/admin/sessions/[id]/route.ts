import { NextResponse } from "next/server";
import { isShortIdShape } from "@booth/core";
import { deleteSession } from "@booth/db";
import { errorResponse } from "@/lib/api";

/** Delete on request: the photos go, the row stays for the numbering. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/sessions/[id]">) {
  const { id } = await ctx.params;
  if (!isShortIdShape(id)) return NextResponse.json({ error: "No such session" }, { status: 404 });
  try {
    await deleteSession(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
