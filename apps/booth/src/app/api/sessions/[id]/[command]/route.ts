import { NextResponse } from "next/server";
import { isShortIdShape } from "@booth/core";
import { commandSession } from "@booth/db";
import { errorResponse } from "@/lib/api";

const COMMANDS = {
  accept: { type: "accepted" },
  finish: { type: "finished" },
  retake: { type: "retake" },
  cancel: { type: "cancelled", reason: "the guest started over" },
} as const;

/** The guest's buttons: accept, finish, retake, cancel. */
export async function POST(_request: Request, ctx: RouteContext<"/api/sessions/[id]/[command]">) {
  const { id, command } = await ctx.params;
  if (!isShortIdShape(id)) return NextResponse.json({ error: "No such session" }, { status: 404 });
  const event = COMMANDS[command as keyof typeof COMMANDS];
  if (!event) return NextResponse.json({ error: `Unknown command "${command}"` }, { status: 404 });
  try {
    const row = await commandSession(id, event);
    return NextResponse.json({ id: row.id, phase: row.phase });
  } catch (err) {
    return errorResponse(err);
  }
}
