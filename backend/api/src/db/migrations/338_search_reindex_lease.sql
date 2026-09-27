-- Durable fenced lease for the global search reindex (audit S2).
--
-- The previous implementation held a PostgreSQL SESSION advisory lock on a
-- pooled client. Production routes all DB traffic through PgBouncer in
-- TRANSACTION pooling mode, where a checked-out node client does not pin a
-- server session — the lock could leak onto a pooled backend or unlock on a
-- different session. PgBouncer explicitly lists session advisory locks as
-- incompatible with transaction pooling.
--
-- This table backs a lease that is correct under transaction pooling because
-- every operation is a single self-contained statement (each statement is its
-- own transaction, so no session affinity is ever required):
--
--   acquire : INSERT ... ON CONFLICT DO UPDATE ... WHERE expired-or-same-holder
--             RETURNING fence — atomic; proceeds only when rowCount = 1
--   renew   : UPDATE ... WHERE name AND holder AND fence — extends expires_at
--   release : DELETE ... WHERE name AND holder AND fence — honest release
--
-- A crashed holder's lease self-recovers via expires_at; the monotonically
-- increasing fence makes takeovers detectable so a stale holder cannot
-- release or renew a lease it no longer owns.

CREATE TABLE IF NOT EXISTS search_reindex_lease (
  name        TEXT PRIMARY KEY,
  holder      TEXT NOT NULL,
  fence       BIGINT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL
);
