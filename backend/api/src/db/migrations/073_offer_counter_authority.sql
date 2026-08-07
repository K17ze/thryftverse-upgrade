-- Server-authoritative offer counter chains and replay protection.

ALTER TABLE listing_offers
  ADD COLUMN IF NOT EXISTS offered_by_user_id TEXT
    REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_hash TEXT;

UPDATE listing_offers
SET offered_by_user_id = buyer_id
WHERE offered_by_user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS listing_offers_actor_idempotency_idx
  ON listing_offers (offered_by_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS listing_offers_parent_chain_idx
  ON listing_offers (parent_offer_id, counter_round ASC);
