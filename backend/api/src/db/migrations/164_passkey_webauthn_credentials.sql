-- 164_passkey_webauthn_credentials.sql
--
-- AUTH-017: Passkey/WebAuthn credential storage.
--
-- Implements the NCSC CYBERUK 2026 recommendation: passkeys as the primary
-- phishing-resistant authentication factor. Passkeys cryptographically bind
-- authentication to the legitimate service (RP), eliminating credential
-- stuffing, phishing, and session hijacking via credential theft.
--
-- This table stores registered WebAuthn credentials (passkeys) for users.
-- A user may have multiple passkeys (e.g. one per device). The credential
-- ID is globally unique and is the primary lookup key during authentication.
--
-- Design:
--   - credential_id is stored as base64url TEXT (the WebAuthn spec format)
--   - public_key is stored as BYTEA (raw CBOR-encoded public key)
--   - counter is the sign count for clone detection
--   - transports records how the credential can be reached (internal, hybrid,
--     usb, nfc, ble) — used by the browser to find the right authenticator
--   - name is a user-facing label (e.g. "iPhone Face ID", "Mac Touch ID")
--   - backup_eligible / backup_state indicate whether the passkey is synced
--     via a credential manager (Apple Passwords, Google Password Manager)
--
-- The NCSC recommends passkeys over passwords wherever available. This
-- implementation supports both platform authenticators (Touch ID, Face ID)
-- and cross-platform authenticators (security keys) via the transports field.

CREATE TABLE IF NOT EXISTS user_passkeys (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id   TEXT NOT NULL UNIQUE,
  public_key      BYTEA NOT NULL,
  counter         INTEGER NOT NULL DEFAULT 0,
  device_type     VARCHAR(40) NOT NULL DEFAULT 'singleDevice',
  transports      TEXT[] NOT NULL DEFAULT '{}',
  name            VARCHAR(120),
  backup_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  backup_state    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id
  ON user_passkeys (user_id);

CREATE INDEX IF NOT EXISTS idx_user_passkeys_credential_id
  ON user_passkeys (credential_id);

-- Track the current challenge for each user during registration/authentication.
-- Challenges are single-use and expire after 5 minutes. Stored in a separate
-- table so we don't pollute the users table with transient state.
CREATE TABLE IF NOT EXISTS passkey_challenges (
  id           UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id      TEXT REFERENCES users(id) ON DELETE CASCADE,
  challenge    TEXT NOT NULL,
  challenge_type VARCHAR(20) NOT NULL DEFAULT 'registration',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
  consumed_at  TIMESTAMPTZ,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_passkey_challenges_user_id
  ON passkey_challenges (user_id);

CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expires_at
  ON passkey_challenges (expires_at);

-- Add passkey_registered flag to users for quick checks
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS passkey_registered BOOLEAN NOT NULL DEFAULT FALSE;
