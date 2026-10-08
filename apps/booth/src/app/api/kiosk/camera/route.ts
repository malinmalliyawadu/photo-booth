import { NextResponse } from "next/server";
import { z } from "zod";
import { db, readBooth, reportComponent } from "@booth/db";
import { errorResponse, readJson } from "@/lib/api";

const Report = z
  .object({
    status: z.enum(["ok", "warn", "error"]),
    detail: z.string().trim().min(1).max(200),
  })
  .strict();

/**
 * The iPad camera's heartbeat. In iPad mode the worker has no camera to
 * ask, so the kiosk reports what getUserMedia gave it every few seconds
 * and the admin page shows that. In any other mode the worker owns the
 * camera's health and a kiosk left open somewhere is told no.
 */
export async function PUT(request: Request) {
  try {
    const parsed = Report.safeParse(await readJson(request));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
    const settings = await readBooth(db);
    if (settings.cameraMode !== "ipad") {
      return NextResponse.json({ error: "The booth is not using the iPad camera" }, { status: 409 });
    }
    await reportComponent(db, "camera", parsed.data.status, parsed.data.detail);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
