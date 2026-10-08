/**
 * Idempotent: creates the booth row and the component rows, and loads
 * every PNG under templates/ (with its optional .json sidecar) once.
 * `seeded_templates` remembers each file, so a layout the attendant
 * deleted or renamed stays that way across restarts and deploys, while
 * a file added to the repo later still arrives. Safe to run on every start.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSidecar } from "@booth/core";
import { db, pool } from "./client";
import { booth, components, seededTemplates, type ComponentName } from "./schema";
import { ingestTemplate, listTemplates } from "./templates";

const TEMPLATES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../templates");

export async function seed(): Promise<void> {
  await db.insert(booth).values({ id: 1 }).onConflictDoNothing();
  const names: ComponentName[] = ["worker", "camera", "printer", "sync"];
  await db
    .insert(components)
    .values(names.map((name) => ({ name, status: "off" as const, detail: "Not started" })))
    .onConflictDoNothing();

  const seeded = new Set((await db.select({ file: seededTemplates.file }).from(seededTemplates)).map((r) => r.file));
  // Databases from before seeded_templates have the layouts but not the record.
  const loaded = new Set((await listTemplates()).map((t) => t.name));
  const files = (await readdir(TEMPLATES_DIR).catch(() => [])).filter((f) => f.endsWith(".png")).sort();
  for (const file of files) {
    if (seeded.has(file)) continue;
    const words = path.basename(file, ".png").replace(/^\d+-/, "").replace(/-/g, " ");
    const name = words.charAt(0).toUpperCase() + words.slice(1);
    if (!loaded.has(name)) {
      const png = await readFile(path.join(TEMPLATES_DIR, file));
      const sidecarPath = path.join(TEMPLATES_DIR, `${path.basename(file, ".png")}.json`);
      const sidecarJson = await readFile(sidecarPath, "utf8").catch(() => null);
      const row = await ingestTemplate({ name, png, sidecar: sidecarJson ? parseSidecar(sidecarJson) : null });
      console.log(`Loaded layout "${row.name}": ${row.slots.length} slots, ${row.shotCount} shots${row.warnings.length ? ` (${row.warnings.join("; ")})` : ""}`);
    }
    await db.insert(seededTemplates).values({ file }).onConflictDoNothing();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  seed()
    .then(() => pool.end())
    .then(() => console.log("Seeded"))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
