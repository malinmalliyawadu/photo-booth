ALTER TABLE "booth" ALTER COLUMN "paper_left" SET DEFAULT 18;--> statement-breakpoint
ALTER TABLE "booth" ADD COLUMN "paper_tray_size" integer DEFAULT 18 NOT NULL;--> statement-breakpoint
ALTER TABLE "booth" ADD COLUMN "ink_left" integer DEFAULT 36 NOT NULL;--> statement-breakpoint
ALTER TABLE "booth" ADD COLUMN "ink_cassette_size" integer DEFAULT 36 NOT NULL;