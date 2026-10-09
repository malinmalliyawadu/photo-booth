ALTER TABLE "booth" ALTER COLUMN "camera_mode" SET DEFAULT 'ipad';--> statement-breakpoint
-- The fake camera was the default only because nothing else worked yet;
-- the booth shoots with the iPad. A booth someone set to gphoto2 keeps it.
UPDATE "booth" SET "camera_mode" = 'ipad' WHERE "camera_mode" = 'fake';
