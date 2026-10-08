import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { FILTER_IDS, type CameraMode, type FilterId, type Phase, type PrintStatus, type Slot, type TextField } from "@booth/core";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * One row, id always 1: the knobs the attendant can turn on the night.
 * Camera and printer health live in `components`, written by the worker.
 */
export const booth = pgTable(
  "booth",
  {
    id: integer("id").primaryKey().default(1),
    eventName: text("event_name").notNull().default("Photo booth"),
    paused: boolean("paused").notNull().default(false),
    cameraMode: text("camera_mode").$type<CameraMode>().notNull().default("fake"),
    countdownSeconds: integer("countdown_seconds").notNull().default(5),
    paperLeft: integer("paper_left").notNull().default(36),
    paperPackSize: integer("paper_pack_size").notNull().default(36),
    /** When set, the picker is skipped and every session uses this layout. */
    lockedTemplateId: text("locked_template_id"),
    /** Which filters the kiosk offers; one means the step is skipped. */
    filters: jsonb("filters").$type<FilterId[]>().notNull().default([...FILTER_IDS]),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [check("booth_singleton", sql`${t.id} = 1`)],
);

export type ComponentName = "worker" | "camera" | "printer" | "sync";
export type ComponentStatus = "ok" | "warn" | "error" | "off";

/** Health of each moving part, as last reported by the worker. */
export const components = pgTable("components", {
  name: text("name").$type<ComponentName>().primaryKey(),
  status: text("status").$type<ComponentStatus>().notNull().default("off"),
  detail: text("detail").notNull().default(""),
  seenAt: timestamptz("seen_at").notNull().defaultNow(),
});

export const templates = pgTable("templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  orientation: text("orientation").$type<"landscape" | "portrait">().notNull(),
  slots: jsonb("slots").$type<Slot[]>().notNull(),
  shotCount: integer("shot_count").notNull(),
  texts: jsonb("texts").$type<TextField[]>().notNull().default([]),
  warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  /**
   * Deleted by the attendant while sessions still use it: gone from admin
   * and the picker, kept (row and overlay) so those sessions still draw.
   */
  deletedAt: timestamptz("deleted_at"),
});

/**
 * Every file under templates/ the seed has loaded, so a layout the
 * attendant deleted or renamed is not loaded again on the next start.
 */
export const seededTemplates = pgTable("seeded_templates", {
  file: text("file").primaryKey(),
  seededAt: timestamptz("seeded_at").notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** The short ID in the QR code. */
    id: text("id").primaryKey(),
    /** A friendly running number for the admin page and the print. */
    number: serial("number").notNull(),
    templateId: text("template_id")
      .notNull()
      .references(() => templates.id),
    /** The look the guest picked, applied wherever the photos are drawn. */
    filter: text("filter").$type<FilterId>().notNull().default("colour"),
    /** Drawn flipped, the way the mirror showed the guest; the files are never flipped. */
    mirrored: boolean("mirrored").notNull().default(false),
    phase: text("phase").$type<Phase>().notNull(),
    shot: integer("shot").notNull(),
    shotCount: integer("shot_count").notNull(),
    takenCount: integer("taken_count").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    countdownSeconds: integer("countdown_seconds").notNull(),
    countdownEndsAt: timestamptz("countdown_ends_at"),
    print: text("print").$type<PrintStatus>(),
    reason: text("reason"),
    /**
     * The compositor's postcard, web photo and thumbnail, relative to the
     * data directory. Null until the guest accepts and it has run.
     */
    compositePath: text("composite_path"),
    webPath: text("web_path"),
    thumbPath: text("thumb_path"),
    printCount: integer("print_count").notNull().default(0),
    syncedAt: timestamptz("synced_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    finishedAt: timestamptz("finished_at"),
    /** Delete on request: the row stays for the numbering, the files go. */
    deletedAt: timestamptz("deleted_at"),
  },
  (t) => [index("sessions_phase_idx").on(t.phase), index("sessions_created_idx").on(t.createdAt)],
);

export const shots = pgTable(
  "shots",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    shot: integer("shot").notNull(),
    path: text("path").notNull(),
    takenAt: timestamptz("taken_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.shot] })],
);

export type JobKind = "countdown" | "capture" | "timeout" | "compose" | "print" | "sync";
export type JobStatus = "queued" | "running" | "done" | "failed";

/**
 * One table, one kind column, one loop. The worker claims the next due
 * row with FOR UPDATE SKIP LOCKED, so a second worker would be safe,
 * and a crash mid-job leaves it `running` for the sweeper to re-queue.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    kind: text("kind").$type<JobKind>().notNull(),
    sessionId: text("session_id").references(() => sessions.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    runAt: timestamptz("run_at").notNull().defaultNow(),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lockedBy: text("locked_by"),
    lockedAt: timestamptz("locked_at"),
    error: text("error"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    finishedAt: timestamptz("finished_at"),
  },
  (t) => [index("jobs_due_idx").on(t.status, t.runAt)],
);

export type BoothRow = typeof booth.$inferSelect;
export type ComponentRow = typeof components.$inferSelect;
export type TemplateRow = typeof templates.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type ShotRow = typeof shots.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
