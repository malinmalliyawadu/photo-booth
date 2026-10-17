import { NextResponse } from "next/server";
import { isShortIdShape } from "@booth/core";
import { printGuestCopy } from "@booth/db";
import { errorResponse } from "@/lib/api";

/** A guest asked for a copy of an earlier print at the kiosk; refused with the reason the kiosk shows. */
export async function POST(_request: Request, ctx: RouteContext<"/api/sessions/[id]/copy">) {
  const { id } = await ctx.params;
  if (!isShortIdShape(id)) return NextResponse.json({ error: "No such session" }, { status: 404 });
  try {
    return NextResponse.json(await printGuestCopy(id));
  } catch (err) {
    return errorResponse(err);
  }
}
