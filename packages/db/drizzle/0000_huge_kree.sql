CREATE TABLE "booth" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"event_name" text DEFAULT 'Photo booth' NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"camera_mode" text DEFAULT 'fake' NOT NULL,
	"countdown_seconds" integer DEFAULT 5 NOT NULL,
	"paper_left" integer DEFAULT 36 NOT NULL,
	"paper_pack_size" integer DEFAULT 36 NOT NULL,
	"locked_template_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booth_singleton" CHECK ("booth"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "components" (
	"name" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'off' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"session_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"number" serial NOT NULL,
	"template_id" text NOT NULL,
	"phase" text NOT NULL,
	"shot" integer NOT NULL,
	"shot_count" integer NOT NULL,
	"taken_count" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"countdown_seconds" integer NOT NULL,
	"countdown_ends_at" timestamp with time zone,
	"print" text,
	"reason" text,
	"composite_path" text,
	"web_path" text,
	"thumb_path" text,
	"print_count" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shots" (
	"session_id" text NOT NULL,
	"shot" integer NOT NULL,
	"path" text NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shots_session_id_shot_pk" PRIMARY KEY("session_id","shot")
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"orientation" text NOT NULL,
	"slots" jsonb NOT NULL,
	"shot_count" integer NOT NULL,
	"texts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_due_idx" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "sessions_phase_idx" ON "sessions" USING btree ("phase");--> statement-breakpoint
CREATE INDEX "sessions_created_idx" ON "sessions" USING btree ("created_at");