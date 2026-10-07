import { NextResponse } from "next/server";
import { isShortIdShape } from "@booth/core";
import { reprintSession } from "@booth/db";
import { errorResponse } from "@/lib/api";

export async function POST(_request: Request, ctx: RouteContext<"/api/admin/sessions/[id]/reprint">) {
  const { id } = await ctx.params;
  if (!isShortIdShape(id)) return NextResponse.json({ error: "No such session" }, { status: 404 });
  try {
    await reprintSession(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
