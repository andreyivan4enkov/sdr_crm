CREATE TABLE IF NOT EXISTS "analytics_dashboards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "widgets" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "goals" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON TABLE "analytics_dashboards" TO jbrealty;
