ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

UPDATE leads l
SET assigned_user_id = r.user_id
FROM realtors r
WHERE l.assigned_realtor_id = r.id
  AND l.assigned_user_id IS NULL
  AND r.user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_assigned_user_idx ON leads(assigned_user_id);
