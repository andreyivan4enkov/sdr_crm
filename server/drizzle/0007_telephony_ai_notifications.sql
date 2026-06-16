ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "transcript" text;
ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "transcript_status" text DEFAULT 'none';
ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "ai_summary" text;
ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "ai_suggestions" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS "calls_provider_external_idx" ON "calls" ("provider", "external_id") WHERE "external_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "notification_settings" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_user_endpoint_idx" ON "push_subscriptions" ("user_id", "endpoint");

GRANT ALL ON TABLE "notification_settings" TO jbrealty;
GRANT ALL ON TABLE "push_subscriptions" TO jbrealty;
