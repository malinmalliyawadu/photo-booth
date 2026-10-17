import { NextResponse } from "next/server";
import { DEFAULT_PROP, isPropId } from "@booth/core";
import { startSession } from "@booth/db";
import { errorResponse, readJson } from "@/lib/api";

/** A guest tapped a layout, and picked the props to pose in if the booth offers any. */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ templateId?: unknown; prop?: unknown }>(request);
    if (typeof body.templateId !== "string") {
      return NextResponse.json({ error: "templateId is required" }, { status: 400 });
    }
    const prop = body.prop ?? DEFAULT_PROP;
    if (!isPropId(prop)) return NextResponse.json({ error: "Unknown props" }, { status: 400 });
    const row = await startSession(body.templateId, prop);
    return NextResponse.json({ id: row.id, number: row.number }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
