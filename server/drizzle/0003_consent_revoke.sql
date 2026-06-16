ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "pd_consent_revoked" boolean DEFAULT false NOT NULL;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "pd_consent_revoked_at" timestamp with time zone;
