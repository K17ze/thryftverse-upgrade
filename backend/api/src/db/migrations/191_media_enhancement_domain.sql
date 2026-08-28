-- 191 — Media Enhancement Domain
--
-- Establishes the server-side source-of-truth for AI photo enhancement of
-- listing media. Per report #14, the previous implementation used
-- AI_PHOTO_DEMO_MODE = __DEV__ which made production the unsafe branch:
-- non-demo apply functions returned the same URI with isDemo:false
-- (false-success no-op). This migration creates the domain tables so the
-- backend can deliver an honest capability state and, when a provider is
-- configured, run idempotent enhancement jobs with provenance.
--
-- The capability endpoint (/media-enhancement/capabilities) returns
-- `available: false` until a provider is configured. This is the fail-closed
-- gate — the frontend must never claim or apply an enhancement without a
-- server-confirmed capability.
--
-- Operation risk tiers (per report §5.2):
--   A — deterministic presentation (EXIF, crop, compression, exposure)
--   B — subject-preserving ML (background cutout, neutral background, shadow)
--   C — generative composition (lifestyle background, relighting)
--   D — prohibited for condition evidence (remove damage, alter labels/logos)
--
-- Ownership: Media Platform (bytes + lifecycle), Enhancement domain (job +
-- operation policy), Applied ML (provider adapter), Listings (listing_media
-- revision), Trust & Safety (moderation/counterfeit/condition truth).

-- ── Enhancement jobs ──────────────────────────────────────────────────────
-- An idempotent job representing one enhancement request for one source asset.
-- Unique on (owner_id, idempotency_key) so replays return the original result.

CREATE TABLE IF NOT EXISTS media_enhancement_jobs (
  id                  TEXT PRIMARY KEY,
  owner_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_media_asset_id TEXT REFERENCES media_assets(id) ON DELETE CASCADE,
  operation_policy_version TEXT NOT NULL DEFAULT '1',
  request_hash        TEXT NOT NULL,
  idempotency_key     TEXT NOT NULL,
  state               TEXT NOT NULL DEFAULT 'queued'
                          CHECK (state IN ('queued','processing','candidate_ready',
                                           'partial','policy_rejected','failed',
                                           'cancelled','expired','outcome_unknown',
                                           'reconciling','applied','reverted')),
  provider            TEXT NOT NULL DEFAULT 'none',
  provider_job_id     TEXT,
  model_id            TEXT,
  model_version       TEXT,
  region              TEXT,
  attempts            INTEGER NOT NULL DEFAULT 0,
  error_code          TEXT,
  unknown_since       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  UNIQUE (owner_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_enh_jobs_owner_state
  ON media_enhancement_jobs (owner_id, state);
CREATE INDEX IF NOT EXISTS idx_enh_jobs_source_asset
  ON media_enhancement_jobs (source_media_asset_id);
CREATE INDEX IF NOT EXISTS idx_enh_jobs_expires
  ON media_enhancement_jobs (expires_at)
  WHERE expires_at IS NOT NULL;

-- ── Enhancement operations ────────────────────────────────────────────────
-- The ordered list of operations applied within a job. Each operation has a
-- risk tier and typed parameters — no arbitrary user prompts in v1.

CREATE TABLE IF NOT EXISTS media_enhancement_operations (
  id                  TEXT PRIMARY KEY,
  job_id              TEXT NOT NULL REFERENCES media_enhancement_jobs(id) ON DELETE CASCADE,
  ordinal             INTEGER NOT NULL DEFAULT 0,
  operation_type      TEXT NOT NULL
                          CHECK (operation_type IN ('background_removal','ai_shadows',
                                    'auto_crop','color_correction',
                                    'background_replace','lighting_fix',
                                    'exif_orientation','compression')),
  parameters_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_tier           CHAR(1) NOT NULL DEFAULT 'B'
                          CHECK (risk_tier IN ('A','B','C','D')),
  prompt_template_version TEXT,
  UNIQUE (job_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_enh_ops_job
  ON media_enhancement_operations (job_id, ordinal);

-- ── Media derivations ─────────────────────────────────────────────────────
-- Links a source asset to a derived (enhanced) asset with fidelity metrics,
-- moderation status, provenance manifest reference, and approval tracking.
-- Candidates are quarantined until moderation + fidelity checks pass.

CREATE TABLE IF NOT EXISTS media_derivations (
  id                  TEXT PRIMARY KEY,
  source_asset_id     TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  derived_asset_id    TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  job_id              TEXT NOT NULL REFERENCES media_enhancement_jobs(id) ON DELETE CASCADE,
  candidate_rank      INTEGER NOT NULL DEFAULT 0,
  source_sha256       TEXT,
  derived_sha256      TEXT,
  fidelity_metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  moderation_status   TEXT NOT NULL DEFAULT 'pending'
                          CHECK (moderation_status IN ('pending','approved','review','rejected','failed')),
  disclosure_type     TEXT NOT NULL DEFAULT 'none'
                          CHECK (disclosure_type IN ('none','standard_editing','ai_assisted','ai_generated')),
  c2pa_manifest_ref   TEXT,
  approved_by         TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_derivations_source
  ON media_derivations (source_asset_id);
CREATE INDEX IF NOT EXISTS idx_derivations_derived
  ON media_derivations (derived_asset_id);
CREATE INDEX IF NOT EXISTS idx_derivations_job
  ON media_derivations (job_id);

-- ── Listing media revisions ───────────────────────────────────────────────
-- An immutable audit trail of listing-media pointer mutations. When a seller
-- applies an enhanced asset to a listing, a revision row records the old and
-- new asset IDs, the actor, and an idempotency key. Revert creates a new
-- revision pointing back to the source.

CREATE TABLE IF NOT EXISTS listing_media_revisions (
  id                  TEXT PRIMARY KEY,
  listing_id          TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  actor_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_revision       TEXT NOT NULL,
  old_asset_id        TEXT,
  new_asset_id        TEXT,
  reason              TEXT NOT NULL DEFAULT 'enhancement_apply',
  idempotency_key     TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_listing_media_revisions_listing
  ON listing_media_revisions (listing_id, created_at DESC);

-- ── updated_at triggers ───────────────────────────────────────────────────
-- Per migration 120, tables with updated_at use the generic trigger function.

CREATE TRIGGER trg_enh_jobs_updated_at
  BEFORE UPDATE ON media_enhancement_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_enh_ops_updated_at
  BEFORE UPDATE ON media_enhancement_operations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_derivations_updated_at
  BEFORE UPDATE ON media_derivations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_listing_media_revisions_updated_at
  BEFORE UPDATE ON listing_media_revisions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
