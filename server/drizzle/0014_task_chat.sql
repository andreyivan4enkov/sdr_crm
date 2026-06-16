ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "comments" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "pinned_result" jsonb;
