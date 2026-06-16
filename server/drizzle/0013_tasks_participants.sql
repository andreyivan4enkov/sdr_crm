ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "co_executors" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "notify_participants" boolean NOT NULL DEFAULT true;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "due_notified_at" timestamptz;
