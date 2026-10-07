import { asc, eq, sql } from "drizzle-orm";
import { writeFile } from "node:fs/promises";
import sharp, { type OutputInfo } from "sharp";
import {
  PRINT_PX,
  applySidecar,
  detectSlots,
  knockOutMarkers,
  newShortId,
  orientationOf,
  type Rgba,
  type Sidecar,
} from "@booth/core";
import { db, type Db } from "./client";
import { notify } from "./notify";
import { templates, type TemplateRow } from "./schema";
import { ensureDir, removeData, resolveData, templatePaths } from "./storage";

/** The widest the kiosk ever shows a template, so the overlay it loads can be smaller than the print. */
export const SCREEN_OVERLAY_PX = 1000;

export class TemplateError extends Error {}

/**
 * Stores a Canva export: finds the slots, knocks the magenta out, writes
 * the files and the row. The admin upload and the seed both come
 * through here, so a layout is one thing however it arrived.
 */
export async function ingestTemplate(input: {
  name: string;
  png: Buffer;
  sidecar: Sidecar | null;
}): Promise<TemplateRow> {
  let decoded: { data: Buffer; info: OutputInfo };
  try {
    decoded = await sharp(input.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch (err) {
    throw new TemplateError(`Not a PNG the app can read: ${err instanceof Error ? err.message : err}`);
  }
  const { width, height } = decoded.info;
  const image: Rgba = { width, height, data: new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength) };

  const detected = detectSlots(image);
  if (detected.slots.length === 0) throw new TemplateError(detected.warnings.join(" "));
  let mapped: ReturnType<typeof applySidecar>;
  try {
    mapped = applySidecar(detected.slots, input.sidecar);
  } catch (err) {
    throw new TemplateError(err instanceof Error ? err.message : String(err));
  }

  const warnings = [...detected.warnings];
  const expected = [PRINT_PX, { width: PRINT_PX.height, height: PRINT_PX.width }];
  if (!expected.some((e) => e.width === width && e.height === height)) {
    warnings.push(
      `Exported at ${width} x ${height} px; the print is ${PRINT_PX.width} x ${PRINT_PX.height}, so it will be scaled`,
    );
  }

  const id = newShortId();
  await ensureDir("templates");
  const overlay = knockOutMarkers(image, mapped.slots);
  const overlaySharp = sharp(Buffer.from(overlay.data.buffer, overlay.data.byteOffset, overlay.data.byteLength), {
    raw: { width, height, channels: 4 },
  });
  await Promise.all([
    writeFile(resolveData(templatePaths.png(id)), input.png),
    overlaySharp.clone().png({ compressionLevel: 9 }).toFile(resolveData(templatePaths.overlay(id))),
    overlaySharp
      .clone()
      .resize({ width: SCREEN_OVERLAY_PX, height: SCREEN_OVERLAY_PX, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toFile(resolveData(templatePaths.thumb(id))),
  ]);

  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({ next: sql<number>`coalesce(max(${templates.sortOrder}), 0) + 1` })
      .from(templates);
    const [row] = await tx
      .insert(templates)
      .values({
        id,
        name: input.name,
        width,
        height,
        orientation: orientationOf(width, height),
        slots: mapped.slots,
        shotCount: mapped.shotCount,
        texts: input.sidecar?.texts ?? [],
        warnings,
        sortOrder: Number(order?.next ?? 1),
      })
      .returning();
    await notify(tx);
    return row!;
  });
}

export async function listTemplates(dbOrTx: Db = db): Promise<TemplateRow[]> {
  return dbOrTx.query.templates.findMany({ orderBy: [asc(templates.sortOrder), asc(templates.createdAt)] });
}

export async function updateTemplate(
  id: string,
  patch: Partial<Pick<TemplateRow, "name" | "active" | "sortOrder">>,
): Promise<TemplateRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx.update(templates).set(patch).where(eq(templates.id, id)).returning();
    if (!row) throw new TemplateError("No such layout");
    await notify(tx);
    return row;
  });
}

/** Refused while a session still references it; deactivate instead. */
export async function deleteTemplate(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [used] = await tx.execute<{ n: string }>(sql`select count(*) as n from sessions where template_id = ${id}`).then((r) => r.rows);
    if (Number(used?.n ?? 0) > 0) {
      throw new TemplateError("Sessions were taken with this layout; switch it off instead of deleting it");
    }
    const deleted = await tx.delete(templates).where(eq(templates.id, id)).returning({ id: templates.id });
    if (deleted.length === 0) throw new TemplateError("No such layout");
    await notify(tx);
  });
  await Promise.all([
    removeData(templatePaths.png(id)),
    removeData(templatePaths.overlay(id)),
    removeData(templatePaths.thumb(id)),
  ]);
}
