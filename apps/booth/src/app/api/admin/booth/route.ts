import { NextResponse } from "next/server";
import { z } from "zod";
import { updateBooth } from "@booth/db";
import { errorResponse, readJson } from "@/lib/api";

const Patch = z
  .object({
    eventName: z.string().trim().min(1).max(60),
    paused: z.boolean(),
    cameraMode: z.enum(["fake", "gphoto2", "ipad"]),
    countdownSeconds: z.number().int().min(1).max(15),
    paperLeft: z.number().int().min(0).max(999),
    paperPackSize: z.number().int().min(1).max(999),
    lockedTemplateId: z.string().nullable(),
  })
  .partial()
  .strict();

/** The attendant's knobs: pause, camera, countdown, paper, locked layout, event name. */
export async function PATCH(request: Request) {
  try {
    const parsed = Patch.safeParse(await readJson(request));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
    const row = await updateBooth(parsed.data);
    return NextResponse.json(row);
  } catch (err) {
    return errorResponse(err);
  }
}
