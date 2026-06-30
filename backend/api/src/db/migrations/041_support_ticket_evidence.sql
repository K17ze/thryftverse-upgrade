ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS evidence_media_urls TEXT[] NOT NULL DEFAULT '{}';
