UPDATE "release_settings"
SET "id" = 'windows'
WHERE "id" = 'global'
  AND NOT EXISTS (SELECT 1 FROM "release_settings" WHERE "id" = 'windows');
--> statement-breakpoint
ALTER TABLE "release_settings" ALTER COLUMN "id" SET DEFAULT 'windows';
