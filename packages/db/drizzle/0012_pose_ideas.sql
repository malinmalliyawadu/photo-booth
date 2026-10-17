ALTER TABLE "booth" ADD COLUMN "pose_ideas" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "poses" jsonb;