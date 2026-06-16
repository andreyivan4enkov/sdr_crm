INSERT INTO roles (name, label, permissions)
SELECT 'manager', 'Руководитель',
  '["leads.read","leads.read_all","leads.write","leads.assign","leads.export","team.read","team.manage","analytics.view","calls.view","calls.dial","users.invite"]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'manager');

UPDATE roles
SET permissions = permissions || '["leads.read_all"]'::jsonb
WHERE name = 'integrator'
  AND NOT (permissions @> '["leads.read_all"]'::jsonb)
  AND NOT (permissions @> '["*"]'::jsonb);
