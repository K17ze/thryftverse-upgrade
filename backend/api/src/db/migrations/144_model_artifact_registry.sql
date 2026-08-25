-- Migration 144: Model artifact registry
--
-- The decision_policy_versions table (migration 077) is a good policy
-- registry but not a complete artifact registry. When trained models
-- (LightGBM LambdaRank / XE-NDCG-MART) are promoted, we need full
-- artifact lineage: which binary served what traffic, what code and
-- data produced it, who approved it, and what to roll back to.
--
-- This table extends the policy registry with the minimum viable
-- artifact lineage fields drawn from MLflow / Meta model registry /
-- Vertex AI best practices (2026): immutable write-once versions,
-- signed artifact hashes, training-code + dataset + feature-schema +
-- preprocessing lineage, an explicit approval gate, and a rollback
-- target. It is deliberately NOT MLflow — it is the minimal registry
-- that lets an auditor answer "what model served this traffic, was it
-- approved, and what produced it."
--
-- model_id + model_version is the immutable identity. Status advances
-- forward (candidate -> shadow -> active -> retired; blocked is a
-- terminal hold). Only one model per task may be active at a time,
-- enforced by a partial unique index. Promotion to active requires an
-- approval_actor and stamps approved_at.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS model_artifacts (
  model_id TEXT NOT NULL,
  model_version TEXT NOT NULL,
  task TEXT NOT NULL CHECK (task IN (
    'recommendation_ranking', 'visual_search', 'catalogue_import',
    'fraud_scoring', 'moderation_triage'
  )),
  owner TEXT NOT NULL,
  criticality TEXT NOT NULL CHECK (criticality IN ('low', 'medium', 'high')),
  artifact_uri TEXT NOT NULL,
  artifact_sha256 TEXT NOT NULL CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  container_digest TEXT,
  training_code_commit TEXT NOT NULL,
  training_dataset_manifest TEXT NOT NULL,
  feature_schema_version TEXT NOT NULL,
  preprocessing_version TEXT NOT NULL,
  framework_runtime TEXT NOT NULL,
  evaluation_report_uri TEXT,
  model_card_uri TEXT,
  approval_actor TEXT,
  approved_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN (
    'candidate', 'shadow', 'active', 'retired', 'blocked'
  )),
  rollback_model_version TEXT,
  retention_deletion_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (model_id, model_version),
  -- An active model must carry an approval record.
  CHECK (status <> 'active' OR (approval_actor IS NOT NULL AND approved_at IS NOT NULL)),
  -- A rollback target is only meaningful once a model has been promoted.
  CHECK (rollback_model_version IS NULL OR status IN ('active', 'retired', 'blocked'))
);

-- Only one active model per task at a time.
CREATE UNIQUE INDEX IF NOT EXISTS model_artifacts_one_active_per_task_idx
  ON model_artifacts (task)
  WHERE status = 'active';

-- Lookup by task + status (dashboard / promotion queries).
CREATE INDEX IF NOT EXISTS model_artifacts_task_status_idx
  ON model_artifacts (task, status);

-- Lookup by owner (team-owned model inventory).
CREATE INDEX IF NOT EXISTS model_artifacts_owner_idx
  ON model_artifacts (owner, created_at DESC);

-- Integrity verification lookup by content hash (detect duplicate
-- registrations of the same binary under different versions).
CREATE INDEX IF NOT EXISTS model_artifacts_sha256_idx
  ON model_artifacts (artifact_sha256);

COMMENT ON TABLE model_artifacts IS
  'Immutable model artifact registry. Extends decision_policy_versions with full artifact lineage (binary hash, training code, dataset manifest, feature schema, approval gate, rollback target). Write-once per (model_id, model_version).';
COMMENT ON COLUMN model_artifacts.model_id IS
  'Stable model identifier across versions (e.g. recommendation_ranker).';
COMMENT ON COLUMN model_artifacts.model_version IS
  'Immutable version tag for this artifact (e.g. v1.3.0). Combined with model_id it is the primary key.';
COMMENT ON COLUMN model_artifacts.task IS
  'The ML task this model serves. Constrains the active-model uniqueness to one per task.';
COMMENT ON COLUMN model_artifacts.criticality IS
  'Risk tier. High-criticality models require stricter promotion gates and monitoring.';
COMMENT ON COLUMN model_artifacts.artifact_uri IS
  'Immutable location of the trained model binary (e.g. s3://bucket/path/model.bin).';
COMMENT ON COLUMN model_artifacts.artifact_sha256 IS
  'SHA-256 of the artifact binary. Integrity verification: the serving layer must reject a model whose hash does not match.';
COMMENT ON COLUMN model_artifacts.container_digest IS
  'OCI container digest if the model is packaged as an immutable ModelKit. Nullable for non-containerised artifacts.';
COMMENT ON COLUMN model_artifacts.training_code_commit IS
  'Git commit hash that produced the training run. Lineage back to source code.';
COMMENT ON COLUMN model_artifacts.training_dataset_manifest IS
  'Manifest URI or fingerprint of the training dataset (e.g. S3 manifest ETag, DVC hash). Lineage back to data.';
COMMENT ON COLUMN model_artifacts.feature_schema_version IS
  'Version of the feature schema the model was trained against. Must match the serving feature schema.';
COMMENT ON COLUMN model_artifacts.preprocessing_version IS
  'Version of the preprocessing / feature-extraction pipeline. Distinct from feature schema so pipeline-only changes are tracked.';
COMMENT ON COLUMN model_artifacts.framework_runtime IS
  'Framework + runtime the model requires to serve (e.g. lightgbm-4.5, onnxruntime-1.18).';
COMMENT ON COLUMN model_artifacts.evaluation_report_uri IS
  'URI of the offline evaluation report (metrics, slices, fairness checks). Nullable until evaluation completes.';
COMMENT ON COLUMN model_artifacts.model_card_uri IS
  'URI of the model card documenting intended use, limitations, and ethical review.';
COMMENT ON COLUMN model_artifacts.approval_actor IS
  'User id of the human who approved promotion. Required for status = active.';
COMMENT ON COLUMN model_artifacts.approved_at IS
  'Timestamp of approval. Required for status = active.';
COMMENT ON COLUMN model_artifacts.status IS
  'Lifecycle stage: candidate (registered, not serving), shadow (serving shadow traffic), active (serving production), retired (superseded), blocked (held pending investigation).';
COMMENT ON COLUMN model_artifacts.rollback_model_version IS
  'Previous active version to roll back to if this model regresses. Set at promotion time.';
COMMENT ON COLUMN model_artifacts.retention_deletion_metadata IS
  'JSONB metadata for retention / deletion policy compliance (e.g. deletion target date, legal hold flags).';
