CREATE TABLE IF NOT EXISTS "pipelines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "stages" ADD COLUMN IF NOT EXISTS "pipeline_id" uuid;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "pipeline_id" uuid;

INSERT INTO "pipelines" ("id", "name", "sort_order", "is_default")
SELECT gen_random_uuid(), 'Основная', 0, true
WHERE NOT EXISTS (SELECT 1 FROM "pipelines" LIMIT 1);

UPDATE "stages" SET "pipeline_id" = (SELECT "id" FROM "pipelines" WHERE "is_default" = true ORDER BY "sort_order" LIMIT 1)
WHERE "pipeline_id" IS NULL;

UPDATE "leads" l SET "pipeline_id" = s."pipeline_id"
FROM "stages" s WHERE l."status_id" = s."id" AND l."pipeline_id" IS NULL;

UPDATE "leads" SET "pipeline_id" = (SELECT "id" FROM "pipelines" WHERE "is_default" = true LIMIT 1)
WHERE "pipeline_id" IS NULL;

ALTER TABLE "stages" ALTER COLUMN "pipeline_id" SET NOT NULL;
ALTER TABLE "leads" ALTER COLUMN "pipeline_id" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "stages" ADD CONSTRAINT "stages_pipeline_id_pipelines_id_fk"
    FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "leads" ADD CONSTRAINT "leads_pipeline_id_pipelines_id_fk"
    FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
