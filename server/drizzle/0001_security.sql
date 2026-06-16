ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "pd_consent" boolean DEFAULT false NOT NULL;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "pd_consent_at" timestamp with time zone;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "erased_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "user_login" text,
  "action" text NOT NULL,
  "entity_type" text,
  "entity_id" text,
  "ip" text,
  "user_agent" text,
  "meta" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "audit_log_created_idx" ON "audit_log" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "audit_log_user_idx" ON "audit_log" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "audit_log_action_idx" ON "audit_log" USING btree ("action");
