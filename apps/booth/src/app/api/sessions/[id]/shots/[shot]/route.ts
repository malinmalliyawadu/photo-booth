import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { FACES_HEADER, isShortIdShape, parseFaces, type Face } from "@booth/core";
import { ensureDir, getSession, recordShot, resolveData, sessionPaths } from "@booth/db";
import { errorResponse } from "@/lib/api";

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * The iPad camera's upload. In iPad mode the worker cannot take the
 * shot, so the kiosk grabs a frame from getUserMedia at the end of the
 * countdown and PUTs it here, with the faces it found in it in
 * `FACES_HEADER`. The frame is re-encoded through sharp so a bad upload
 * fails here, not in the compositor. Faces that do not parse are
 * dropped, not refused: a guest's photo matters more than their crown.
 */
export async function PUT(request: Request, ctx: RouteContext<"/api/sessions/[id]/shots/[shot]">) {
  const { id, shot: shotParam } = await ctx.params;
  const shot = Number(shotParam);
  if (!isShortIdShape(id) || !Number.isInteger(shot) || shot < 1) {
    return NextResponse.json({ error: "No such shot" }, { status: 404 });
  }
  try {
    const session = await getSession(id);
    if (!session || session.deletedAt) return NextResponse.json({ error: "No such session" }, { status: 404 });
    if (session.phase !== "capturing" || session.shot !== shot) {
      return NextResponse.json({ error: `Not waiting for shot ${shot}` }, { status: 409 });
    }
    const body = Buffer.from(await request.arrayBuffer());
    if (body.length === 0 || body.length > MAX_BYTES) {
      return NextResponse.json({ error: "Expected a JPEG body" }, { status: 400 });
    }
    const { data: jpeg, info } = await sharp(body).rotate().jpeg({ quality: 92 }).toBuffer({ resolveWithObject: true });
    await ensureDir(sessionPaths.dir(id));
    const rel = sessionPaths.shot(id, shot);
    await writeFile(resolveData(rel), jpeg);
    const result = await recordShot(id, shot, rel, { width: info.width, height: info.height, faces: readFaces(request, id, shot) });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
    return NextResponse.json({ shot, phase: result.row.phase });
  } catch (err) {
    return errorResponse(err);
  }
}

/** The faces in the upload's header; null when there are none to read. */
function readFaces(request: Request, id: string, shot: number): Face[] | null {
  const header = request.headers.get(FACES_HEADER);
  if (header === null) return null;
  let faces: Face[] | null = null;
  try {
    faces = parseFaces(JSON.parse(header));
  } catch {
    faces = null;
  }
  if (faces === null) console.warn(`session ${id} shot ${shot}: the faces sent with the photo do not parse; storing none`);
  return faces;
}
