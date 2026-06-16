CREATE TABLE IF NOT EXISTS "org_units" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "parent_id" uuid,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "description" text,
  "default_role_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "realtors" ADD COLUMN IF NOT EXISTS "org_unit_id" uuid;
ALTER TABLE "realtors" ADD COLUMN IF NOT EXISTS "position" text;
ALTER TABLE "realtors" ADD COLUMN IF NOT EXISTS "role_id" uuid;

ALTER TABLE "org_units" ADD CONSTRAINT "org_units_parent_id_org_units_id_fk"
  FOREIGN KEY ("parent_id") REFERENCES "public"."org_units"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "org_units" ADD CONSTRAINT "org_units_default_role_id_roles_id_fk"
  FOREIGN KEY ("default_role_id") REFERENCES "public"."roles"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "realtors" ADD CONSTRAINT "realtors_org_unit_id_org_units_id_fk"
  FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_units"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "realtors" ADD CONSTRAINT "realtors_role_id_roles_id_fk"
  FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
