import { NextResponse } from "next/server";
import { DEFAULT_PROP, isPoseId, isPropId, type PoseId } from "@booth/core";
import { startSession } from "@booth/db";
import { errorResponse, readJson } from "@/lib/api";

/**
 * A guest tapped a layout, picked the props to pose in if the booth
 * offers any, and took the pose ideas if they wanted some. The ideas are
 * checked against the layout's shot count where the layout is known,
 * in `startSession`.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ templateId?: unknown; prop?: unknown; poses?: unknown }>(request);
    if (typeof body.templateId !== "string") {
      return NextResponse.json({ error: "templateId is required" }, { status: 400 });
    }
    const prop = body.prop ?? DEFAULT_PROP;
    if (!isPropId(prop)) return NextResponse.json({ error: "Unknown props" }, { status: 400 });
    let poses: PoseId[] | null = null;
    if (body.poses != null) {
      if (!Array.isArray(body.poses) || !body.poses.every(isPoseId)) {
        return NextResponse.json({ error: "Unknown pose" }, { status: 400 });
      }
      poses = body.poses;
    }
    const row = await startSession(body.templateId, prop, poses);
    return NextResponse.json({ id: row.id, number: row.number }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
