import { NextResponse } from "next/server";
import { z } from "zod";
import { isShortIdShape } from "@booth/core";
import { applySessionEvent } from "@booth/db";
import { errorResponse, readJson } from "@/lib/api";

const Failure = z.object({ reason: z.string().trim().min(1).max(200) }).strict();

/**
 * The iPad camera could not take the shot (no picture, permission
 * revoked mid-session). Saying so at once lets the state machine count
 * down again or give up, instead of the guest holding still until the
 * capturing timeout.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/shots/[shot]/failed">) {
  const { id, shot: shotParam } = await ctx.params;
  const shot = Number(shotParam);
  if (!isShortIdShape(id) || !Number.isInteger(shot) || shot < 1) {
    return NextResponse.json({ error: "No such shot" }, { status: 404 });
  }
  try {
    const parsed = Failure.safeParse(await readJson(request));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
    const result = await applySessionEvent(id, { type: "shot_failed", shot, reason: `iPad camera: ${parsed.data.reason}` });
    if (!result.ok || result.stale) return NextResponse.json({ error: `Not waiting for shot ${shot}` }, { status: 409 });
    return NextResponse.json({ shot, phase: result.row.phase });
  } catch (err) {
    return errorResponse(err);
  }
}
