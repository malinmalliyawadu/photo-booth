import { NextResponse } from "next/server";
import { isFilterId, isShortIdShape } from "@booth/core";
import { chooseFilter } from "@booth/db";
import { errorResponse, readJson } from "@/lib/api";

/** The guest tapped a filter on the review screen. */
export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/filter">) {
  const { id } = await ctx.params;
  if (!isShortIdShape(id)) return NextResponse.json({ error: "No such session" }, { status: 404 });
  try {
    const body = await readJson<{ filter?: unknown }>(request);
    if (!isFilterId(body.filter)) return NextResponse.json({ error: "Unknown filter" }, { status: 400 });
    const row = await chooseFilter(id, body.filter);
    return NextResponse.json({ id: row.id, filter: row.filter });
  } catch (err) {
    return errorResponse(err);
  }
}
