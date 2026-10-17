ALTER TABLE "booth" ADD COLUMN "props" jsonb DEFAULT '["crown","flowers","tophat","hearts","specs","moustache"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "prop" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "shots" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "shots" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "shots" ADD COLUMN "faces" jsonb;