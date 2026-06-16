INSERT INTO "roles" ("name", "label", "permissions")
SELECT 'marketer', 'Маркетолог', '["leads.read","leads.read_all","leads.write","analytics.view","channels.manage","marketing.manage","settings.manage","team.read"]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'marketer');

INSERT INTO "integrations" ("type", "enabled", "config")
SELECT 'vk', false, jsonb_build_object('webhookSecret', gen_random_uuid()::text, 'groupId', '', 'accessToken', '')
WHERE NOT EXISTS (SELECT 1 FROM "integrations" WHERE "type" = 'vk');

INSERT INTO "integrations" ("type", "enabled", "config")
SELECT 'yandex_direct', false, jsonb_build_object('webhookSecret', gen_random_uuid()::text, 'clientLogin', '', 'token', '', 'accountId', '')
WHERE NOT EXISTS (SELECT 1 FROM "integrations" WHERE "type" = 'yandex_direct');

INSERT INTO "integrations" ("type", "enabled", "config")
SELECT 'yandex_metrica', false, jsonb_build_object('counterId', '', 'oauthToken', '', 'siteUrl', '')
WHERE NOT EXISTS (SELECT 1 FROM "integrations" WHERE "type" = 'yandex_metrica');

INSERT INTO "integrations" ("type", "enabled", "config")
SELECT 'avito', false, jsonb_build_object('webhookSecret', gen_random_uuid()::text, 'clientId', '', 'clientSecret', '', 'userId', '')
WHERE NOT EXISTS (SELECT 1 FROM "integrations" WHERE "type" = 'avito');

INSERT INTO "channels" ("name", "type", "connected")
SELECT 'Яндекс Метрика', 'ad', false
WHERE NOT EXISTS (SELECT 1 FROM "channels" WHERE "name" = 'Яндекс Метрика');
