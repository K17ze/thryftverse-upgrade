-- 212: Add encrypted body columns to chat_messages and support_messages.
--
-- UK-GDPR Art. 5(1)(f) (integrity and confidentiality) requires appropriate
-- security of personal data, including protection against unauthorised access
-- to the database. Chat and support message bodies may contain PII (user
-- conversations, order details, addresses discussed in support). This
-- migration adds the infrastructure for application-layer encryption of
-- message bodies using the key service (keyService.ts).
--
-- Strategy: dual-write with fallback read.
-- 1. New columns `body_ciphertext` and `key_version` are added (nullable).
-- 2. New writes encrypt the body and store ciphertext in `body_ciphertext`,
--    with `body` set to `[encrypted]` as a tombstone.
-- 3. A backfill worker encrypts existing plaintext rows in batches.
-- 4. Read paths check `body_ciphertext` first; if non-null, decrypt via key
--    service. If null, fall back to `body` (for un-migrated rows).
-- 5. Once all rows are migrated, a future migration drops `body` and makes
--    `body_ciphertext` NOT NULL.
--
-- This is a P2 remediation item from the privacy/retention audit (item #33).
-- The encryption uses the 'message' key namespace in the key service.
--
-- Idempotent: uses ADD COLUMN IF NOT EXISTS.

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS body_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS key_version INTEGER;

ALTER TABLE support_messages
  ADD COLUMN IF NOT EXISTS body_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS key_version INTEGER;

-- Index for the backfill worker: find un-encrypted rows efficiently.
CREATE INDEX IF NOT EXISTS chat_messages_encryption_backfill_idx
  ON chat_messages (id)
  WHERE body_ciphertext IS NULL AND body NOT IN ('[erased]', '[retention-expired]');

CREATE INDEX IF NOT EXISTS support_messages_encryption_backfill_idx
  ON support_messages (id)
  WHERE body_ciphertext IS NULL AND body NOT IN ('[erased]', '[retention-expired]');

COMMENT ON COLUMN chat_messages.body_ciphertext IS
  'Application-layer encrypted message body (ciphertext from keyService.encryptJsonPayload). NULL for un-migrated rows.';
COMMENT ON COLUMN chat_messages.key_version IS
  'Key service key version used for encryption. NULL for un-migrated rows.';
COMMENT ON COLUMN support_messages.body_ciphertext IS
  'Application-layer encrypted message body (ciphertext from keyService.encryptJsonPayload). NULL for un-migrated rows.';
COMMENT ON COLUMN support_messages.key_version IS
  'Key service key version used for encryption. NULL for un-migrated rows.';
