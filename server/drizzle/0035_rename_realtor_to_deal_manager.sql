-- Rename legacy realtor identifiers to deal_manager (менеджер по сделкам)
ALTER TABLE "realtors" RENAME TO "deal_managers";
--> statement-breakpoint
ALTER TABLE "leads" RENAME COLUMN "assigned_realtor_id" TO "assigned_deal_manager_id";
--> statement-breakpoint
UPDATE "roles" SET "name" = 'deal_manager', "label" = 'Менеджер по сделкам' WHERE "name" = 'realtor';
--> statement-breakpoint
UPDATE "audit_log" SET "entity_type" = 'deal_manager' WHERE "entity_type" = 'realtor';