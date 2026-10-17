import { and, desc, inArray, isNull } from "drizzle-orm";
import {
  offeredFilters,
  offeredProps,
  parseFaces,
  type CameraMode,
  type Face,
  type FilterId,
  type Phase,
  type PoseId,
  type PrintStatus,
  type PropId,
  type Slot,
} from "@booth/core";
import { db } from "./client";
import { readBooth } from "./booth";
import { queueCounts } from "./jobs";
import { findActiveSession } from "./sessions";
import { components, sessions, shots, type ComponentName, type ComponentStatus, type SessionRow, type ShotRow } from "./schema";
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
    /** Whether the kiosk plays its ticks, shutter and chime. */
    sounds: boolean;
    /** Postcards in the paper tray, and how many it holds. */
    paperLeft: number;
    paperTraySize: number;
    /** Prints left on the ink cassette, and how many a new one has. */
    inkLeft: number;
    inkCassetteSize: number;
    lockedTemplateId: string | null;
    /** The filters the kiosk offers, in the order it shows them. */
    filters: FilterId[];
    /** The face props the kiosk offers before posing, in the order it shows them; empty skips the step. */
    props: PropId[];
    /** Copies a guest may print of each session from the kiosk; 0 is off. */
    guestCopyLimit: number;
    /** Whether the kiosk offers pose ideas before posing; off skips the step. */
    poseIdeas: boolean;
  };
  components: Record<ComponentName, { status: ComponentStatus; detail: string; seenAt: string } | undefined>;
  templates: TemplateSummary[];
  session: SessionView | null;
  recent: SessionView[];
  queue: { pendingSync: number; pendingPrints: number; failed: number };
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
  /** What every face in the photos wears. */
  prop: PropId;
  /** The photos are drawn flipped, the way the mirror showed the guest. */
  mirrored: boolean;
  /** One pose idea per shot, shown while counting down; null when the guests wanted none. */
  poses: PoseId[] | null;
  phase: Phase;
  shot: number;
  shotCount: number;
  takenCount: number;
  countdownSeconds: number;
  countdownEndsAt: string | null;
  print: PrintStatus | null;
  reason: string | null;
  printCount: number;
  /** Copies guests asked for at the kiosk. */
  guestCopies: number;
  shots: ShotView[];
  compositeUrl: string | null;
  webUrl: string | null;
  thumbUrl: string | null;
  syncedAt: string | null;
  createdAt: string;
  finishedAt: string | null;
  deleted: boolean;
}

export interface ShotView {
  shot: number;
  url: string;
  /** The frame's size, upright; null on shots from before it was recorded. */
  width: number | null;
  height: number | null;
  /**
   * The faces the props are drawn on; null when nobody looked. Left out
   * (null) for a session the compositor has made its JPEGs for, which
   * every screen shows instead: forty sessions' faces in every snapshot
   * would be weight nobody draws.
   */
  faces: Face[] | null;
}

export const RECENT_LIMIT = 40;

function shotViews(rows: ShotRow[], session: SessionRow): ShotView[] {
  const drawn = session.webPath === null;
  return [...rows]
    .sort((a, b) => a.shot - b.shot)
    .map((s) => ({
      shot: s.shot,
      url: mediaUrl(s.path)!,
      width: s.width,
      height: s.height,
      faces: drawn && s.faces !== null ? parseFaces(s.faces) : null,
    }));
}

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
  const view = (row: SessionRow) => toView(row, shotRows.filter((s) => s.sessionId === row.id));

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
      sounds: settings.sounds,
      paperLeft: settings.paperLeft,
      paperTraySize: settings.paperTraySize,
      inkLeft: settings.inkLeft,
      inkCassetteSize: settings.inkCassetteSize,
      lockedTemplateId: settings.lockedTemplateId,
      filters: offeredFilters(settings.filters),
      props: offeredProps(settings.props),
      guestCopyLimit: settings.guestCopyLimit,
      poseIdeas: settings.poseIdeas,
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

function toView(row: SessionRow, shotRows: ShotRow[]): SessionView {
  return {
    id: row.id,
    number: row.number,
    templateId: row.templateId,
    filter: row.filter,
    prop: row.prop,
    mirrored: row.mirrored,
    poses: row.poses,
    phase: row.phase,
    shot: row.shot,
    shotCount: row.shotCount,
    takenCount: row.takenCount,
    countdownSeconds: row.countdownSeconds,
    countdownEndsAt: row.countdownEndsAt?.toISOString() ?? null,
    print: row.print,
    reason: row.reason,
    printCount: row.printCount,
    guestCopies: row.guestCopies,
    shots: shotViews(shotRows, row),
    compositeUrl: mediaUrl(row.compositePath),
    webUrl: mediaUrl(row.webPath),
    thumbUrl: mediaUrl(row.thumbPath),
    syncedAt: row.syncedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    deleted: row.deletedAt !== null,
  };
}
