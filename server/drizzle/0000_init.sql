CREATE TABLE IF NOT EXISTS "roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "label" text NOT NULL,
  "permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "roles_name_unique" UNIQUE("name")
);

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "login" text NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "role_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "users_login_unique" UNIQUE("login"),
  CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE IF NOT EXISTS "profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "phone" text,
  "region" text,
  "avatar" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id")
);

CREATE TABLE IF NOT EXISTS "realtors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "region" text NOT NULL,
  "phone" text,
  "user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "stages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "label" text NOT NULL,
  "color" text DEFAULT 'sky' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "automations" jsonb DEFAULT '[]'::jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS "fields" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "label" text NOT NULL,
  "type" text DEFAULT 'text' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "channels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "connected" boolean DEFAULT false NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "phone" text,
  "email" text,
  "region" text,
  "preferred_time" text,
  "comment" text,
  "source" text DEFAULT 'form' NOT NULL,
  "channel_id" uuid,
  "status_id" uuid,
  "assigned_realtor_id" uuid,
  "custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "lead_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid NOT NULL,
  "text" text NOT NULL,
  "author" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "text" text NOT NULL,
  "assignee" text,
  "author" text,
  "lead_id" uuid,
  "done" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "calls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "external_id" text,
  "phone" text NOT NULL,
  "direction" text NOT NULL,
  "duration" integer DEFAULT 0,
  "recording_url" text,
  "lead_id" uuid,
  "provider" text,
  "status" text DEFAULT 'completed',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" text NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "realtors" ADD CONSTRAINT "realtors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "leads" ADD CONSTRAINT "leads_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "leads" ADD CONSTRAINT "leads_status_id_stages_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_realtor_id_realtors_id_fk" FOREIGN KEY ("assigned_realtor_id") REFERENCES "public"."realtors"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "calls" ADD CONSTRAINT "calls_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "users_status_idx" ON "users" USING btree ("status");
CREATE INDEX IF NOT EXISTS "leads_phone_idx" ON "leads" USING btree ("phone");
CREATE INDEX IF NOT EXISTS "leads_status_idx" ON "leads" USING btree ("status_id");
CREATE INDEX IF NOT EXISTS "leads_created_idx" ON "leads" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "calls_phone_idx" ON "calls" USING btree ("phone");
CREATE UNIQUE INDEX IF NOT EXISTS "integrations_type_idx" ON "integrations" USING btree ("type");
