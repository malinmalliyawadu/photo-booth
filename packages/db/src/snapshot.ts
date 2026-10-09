import { desc, eq, inArray, isNull, and } from "drizzle-orm";
import { offeredFilters, type CameraMode, type FilterId, type Phase, type PrintStatus, type Slot } from "@booth/core";
import { db } from "./client";
import { readBooth } from "./booth";
import { queueCounts } from "./jobs";
import { findActiveSession } from "./sessions";
import { components, sessions, shots, type ComponentName, type ComponentStatus } from "./schema";
import { listTemplates } from "./templates";
import { mediaUrl } from "./storage";

/**
 * Everything a screen needs, in one message. The kiosk, the admin page
 * and the slideshow all receive the same snapshot over SSE and pick what
 * they show; one shape means one place to get it right.
 */
export interface Snapshot {
  at: string;
  booth: {
    eventName: string;
    paused: boolean;
    cameraMode: CameraMode;
    countdownSeconds: number;
    /** Postcards in the paper tray, and how many it holds. */
    paperLeft: number;
    paperTraySize: number;
    /** Prints left on the ink cassette, and how many a new one has. */
    inkLeft: number;
    inkCassetteSize: number;
    lockedTemplateId: string | null;
    /** The filters the kiosk offers, in the order it shows them. */
    filters: FilterId[];
  };
  components: Record<ComponentName, { status: ComponentStatus; detail: string; seenAt: string } | undefined>;
  templates: TemplateSummary[];
  session: SessionView | null;
  recent: SessionView[];
  queue: { pendingSync: number; failed: number };
}

export interface TemplateSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  orientation: "landscape" | "portrait";
  slots: Slot[];
  shotCount: number;
  active: boolean;
  sortOrder: number;
  warnings: string[];
  /** Retired: past sessions still draw it, nothing offers it. Never active. */
  deleted: boolean;
  /** The knocked-out overlay at print size and at screen size. */
  overlayUrl: string;
  screenUrl: string;
}

export interface SessionView {
  id: string;
  number: number;
  templateId: string;
  filter: FilterId;
  /** The photos are drawn flipped, the way the mirror showed the guest. */
  mirrored: boolean;
  phase: Phase;
  shot: number;
  shotCount: number;
  takenCount: number;
  countdownSeconds: number;
  countdownEndsAt: string | null;
  print: PrintStatus | null;
  reason: string | null;
  printCount: number;
  shots: { shot: number; url: string }[];
  compositeUrl: string | null;
  webUrl: string | null;
  thumbUrl: string | null;
  syncedAt: string | null;
  createdAt: string;
  finishedAt: string | null;
  deleted: boolean;
}

export const RECENT_LIMIT = 40;

export async function readSnapshot(): Promise<Snapshot> {
  const [settings, componentRows, templateRows, active, recentRows, queue] = await Promise.all([
    readBooth(db),
    db.select().from(components),
    listTemplates(),
    findActiveSession(db),
    db.query.sessions.findMany({
      where: and(isNull(sessions.deletedAt), inArray(sessions.phase, ["done", "delivering", "review", "failed", "abandoned"])),
      orderBy: desc(sessions.createdAt),
      limit: RECENT_LIMIT,
    }),
    queueCounts(db),
  ]);

  const ids = [...(active ? [active.id] : []), ...recentRows.map((r) => r.id)];
  const shotRows = ids.length ? await db.select().from(shots).where(inArray(shots.sessionId, ids)) : [];
  const shotsFor = (id: string) =>
    shotRows
      .filter((s) => s.sessionId === id)
      .sort((a, b) => a.shot - b.shot)
      .map((s) => ({ shot: s.shot, url: mediaUrl(s.path)! }));

  const view = (row: typeof sessions.$inferSelect): SessionView => ({
    id: row.id,
    number: row.number,
    templateId: row.templateId,
    filter: row.filter,
    mirrored: row.mirrored,
    phase: row.phase,
    shot: row.shot,
    shotCount: row.shotCount,
    takenCount: row.takenCount,
    countdownSeconds: row.countdownSeconds,
    countdownEndsAt: row.countdownEndsAt?.toISOString() ?? null,
    print: row.print,
    reason: row.reason,
    printCount: row.printCount,
    shots: shotsFor(row.id),
    compositeUrl: mediaUrl(row.compositePath),
    webUrl: mediaUrl(row.webPath),
    thumbUrl: mediaUrl(row.thumbPath),
    syncedAt: row.syncedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    deleted: row.deletedAt !== null,
  });

  const componentMap = {} as Snapshot["components"];
  for (const c of componentRows) {
    componentMap[c.name] = { status: c.status, detail: c.detail, seenAt: c.seenAt.toISOString() };
  }

  return {
    at: new Date().toISOString(),
    booth: {
      eventName: settings.eventName,
      paused: settings.paused,
      cameraMode: settings.cameraMode,
      countdownSeconds: settings.countdownSeconds,
      paperLeft: settings.paperLeft,
      paperTraySize: settings.paperTraySize,
      inkLeft: settings.inkLeft,
      inkCassetteSize: settings.inkCassetteSize,
      lockedTemplateId: settings.lockedTemplateId,
      filters: offeredFilters(settings.filters),
    },
    components: componentMap,
    templates: templateRows.map((t) => ({
      id: t.id,
      name: t.name,
      width: t.width,
      height: t.height,
      orientation: t.orientation,
      slots: t.slots,
      shotCount: t.shotCount,
      active: t.active,
      sortOrder: t.sortOrder,
      warnings: t.warnings,
      deleted: t.deletedAt !== null,
      overlayUrl: `/media/templates/${t.id}.overlay.png`,
      screenUrl: `/media/templates/${t.id}.thumb.png`,
    })),
    session: active ? view(active) : null,
    recent: recentRows.filter((r) => r.id !== active?.id).map(view),
    queue,
  };
}

/** The session view for one row, for the admin page's history beyond `recent`. */
export async function readSessionView(id: string): Promise<SessionView | null> {
  const row = await db.query.sessions.findFirst({ where: eq(sessions.id, id) });
  if (!row) return null;
  const shotRows = await db.select().from(shots).where(eq(shots.sessionId, id));
  return {
    id: row.id,
    number: row.number,
    templateId: row.templateId,
    filter: row.filter,
    mirrored: row.mirrored,
    phase: row.phase,
    shot: row.shot,
    shotCount: row.shotCount,
    takenCount: row.takenCount,
    countdownSeconds: row.countdownSeconds,
    countdownEndsAt: row.countdownEndsAt?.toISOString() ?? null,
    print: row.print,
    reason: row.reason,
    printCount: row.printCount,
    shots: shotRows.sort((a, b) => a.shot - b.shot).map((s) => ({ shot: s.shot, url: mediaUrl(s.path)! })),
    compositeUrl: mediaUrl(row.compositePath),
    webUrl: mediaUrl(row.webPath),
    thumbUrl: mediaUrl(row.thumbPath),
    syncedAt: row.syncedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    deleted: row.deletedAt !== null,
  };
}
