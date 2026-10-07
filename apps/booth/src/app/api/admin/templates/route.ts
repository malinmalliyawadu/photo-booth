import { NextResponse } from "next/server";
import { parseSidecar, type Sidecar } from "@booth/core";
import { ingestTemplate } from "@booth/db";
import { errorResponse } from "@/lib/api";

const MAX_PNG = 40 * 1024 * 1024;

/**
 * Upload a layout: multipart with `png`, an optional `sidecar` JSON
 * file, and a `name`. The response carries the slots found and any
 * warnings, which the admin page shows over a preview on sample photos.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const png = form.get("png");
    if (!(png instanceof File) || png.size === 0) return NextResponse.json({ error: "Choose a PNG" }, { status: 400 });
    if (png.size > MAX_PNG) return NextResponse.json({ error: "That PNG is over 40 MB" }, { status: 400 });
    const nameField = form.get("name");
    const name = (typeof nameField === "string" && nameField.trim()) || png.name.replace(/\.png$/i, "").replace(/[-_]+/g, " ");

    let sidecar: Sidecar | null = null;
    const sidecarFile = form.get("sidecar");
    if (sidecarFile instanceof File && sidecarFile.size > 0) {
      try {
        sidecar = parseSidecar(await sidecarFile.text());
      } catch (err) {
        return NextResponse.json({ error: `Sidecar: ${err instanceof Error ? err.message : err}` }, { status: 400 });
      }
    }
    const row = await ingestTemplate({ name, png: Buffer.from(await png.arrayBuffer()), sidecar });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
