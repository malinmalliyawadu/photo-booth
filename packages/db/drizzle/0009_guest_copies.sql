ALTER TABLE "booth" ADD COLUMN "guest_copy_limit" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "guest_copies" integer DEFAULT 0 NOT NULL;