CREATE TABLE IF NOT EXISTS lead_sdr_vectors (
  lead_id uuid PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  vector text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
