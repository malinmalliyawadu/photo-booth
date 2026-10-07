import { NextResponse } from "next/server";
import { startSession } from "@booth/db";
import { errorResponse, readJson } from "@/lib/api";

/** A guest tapped a layout. */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ templateId?: unknown }>(request);
    if (typeof body.templateId !== "string") {
      return NextResponse.json({ error: "templateId is required" }, { status: 400 });
    }
    const row = await startSession(body.templateId);
    return NextResponse.json({ id: row.id, number: row.number }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
