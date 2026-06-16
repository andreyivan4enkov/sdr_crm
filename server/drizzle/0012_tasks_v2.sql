ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'new';
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "priority" text NOT NULL DEFAULT 'normal';
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "due_at" timestamptz;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "assignee_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "checklist" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "status_summary" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "require_summary" boolean NOT NULL DEFAULT false;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "watchers" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "completed_at" timestamptz;

CREATE INDEX IF NOT EXISTS "tasks_assignee_user_idx" ON "tasks" ("assignee_user_id");
CREATE INDEX IF NOT EXISTS "tasks_status_idx" ON "tasks" ("status");
CREATE INDEX IF NOT EXISTS "tasks_due_at_idx" ON "tasks" ("due_at");

GRANT ALL ON TABLE "tasks" TO jbrealty;
