-- 081_policy_protection_versioning.sql
-- T04: Policy/protection terms are versioned and attributable.
-- Stores versioned buyer-protection and platform policy documents
-- that the product detail screen can reference authoritatively.

CREATE TABLE IF NOT EXISTS policy_documents (
  id TEXT PRIMARY KEY DEFAULT ('pol_' || gen_random_uuid()::text),
  -- Logical policy key (e.g., 'buyer_protection', 'seller_protection',
  -- 'returns', 'authenticity_guarantee')
  policy_key TEXT NOT NULL,
  -- Monotonically increasing version per policy_key
  version INTEGER NOT NULL CHECK (version >= 1),
  previous_version_id TEXT REFERENCES policy_documents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (
    status IN ('draft', 'published', 'superseded')
  ),
  -- Human-readable title and summary shown in the product detail UI
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 10 AND 2000),
  -- Full terms body (markdown or plain text)
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 10 AND 50000),
  -- Jurisdiction scope (NULL = global/default)
  jurisdiction TEXT,
  -- Effective and supersession timestamps
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  -- Attribution
  authored_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One published version per policy_key at a time
  UNIQUE (policy_key, version)
);

-- Only one published (non-draft, non-superseded) version per policy_key
CREATE UNIQUE INDEX IF NOT EXISTS policy_documents_one_published_per_key
  ON policy_documents (policy_key)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS policy_documents_key_idx
  ON policy_documents (policy_key, version DESC);

CREATE INDEX IF NOT EXISTS policy_documents_published_idx
  ON policy_documents (policy_key, published_at DESC)
  WHERE status = 'published';
