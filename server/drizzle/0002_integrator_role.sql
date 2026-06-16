INSERT INTO "roles" ("id", "name", "label", "permissions")
SELECT gen_random_uuid(), 'integrator', 'Интегратор',
  '["leads.read","leads.write","leads.assign","leads.delete","leads.erase","stages.manage","fields.manage","channels.manage","profiles.manage","analytics.view","settings.manage","audit.view","calls.view","calls.dial","integrations.manage","users.invite"]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'integrator');
