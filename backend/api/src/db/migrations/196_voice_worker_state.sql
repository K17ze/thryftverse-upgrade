-- 196: Voice worker state — waveform extraction, transcription and audio
-- moderation job tracking.
--
-- Companion to migration 195. The voice_messages and voice_transcriptions
-- tables hold the derived data; this migration adds the worker bookkeeping
-- for retry/DLQ and the audio moderation decision log.
--
-- 1. `voice_waveform_jobs` — one row per waveform extraction attempt. The
--    worker decodes the audio asset, normalizes PCM into bounded samples,
--    and writes waveform_samples + algorithm_version. Retries land here.
-- 2. `voice_transcription_jobs` — one row per transcription attempt, linked
--    to the derived voice_transcriptions row. Carries provider/model
--    identity and failure telemetry.
-- 3. `audio_moderation_decisions` — the audio safety decision log. Audio
--    moderation is its own pipeline (not image moderation): it handles
--    speech-content review signals, rate limits and evidence retention.

-- ── 1. voice_waveform_jobs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_waveform_jobs (
  id TEXT PRIMARY KEY,
  voice_message_id TEXT NOT NULL
    REFERENCES voice_messages(id) ON DELETE CASCADE,
  media_asset_id TEXT NOT NULL
    REFERENCES media_assets(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_error TEXT,
  sample_count INTEGER,
  algorithm_version INTEGER,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (voice_message_id)
);

CREATE INDEX IF NOT EXISTS voice_waveform_jobs_status_idx
  ON voice_waveform_jobs (status, queued_at ASC)
  WHERE status IN ('pending', 'failed');

-- ── 2. voice_transcription_jobs ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_transcription_jobs (
  id TEXT PRIMARY KEY,
  transcription_id TEXT NOT NULL
    REFERENCES voice_transcriptions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  provider TEXT,
  model_id TEXT,
  model_version TEXT,
  language TEXT,
  last_error TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS voice_transcription_jobs_status_idx
  ON voice_transcription_jobs (status, queued_at ASC)
  WHERE status IN ('pending', 'failed');

-- ── 3. audio_moderation_decisions ──────────────────────────────────────────
-- Audio moderation is distinct from image moderation: it evaluates speech
-- content, not visual policy. Decisions feed back into
-- voice_messages.moderation_state.
CREATE TABLE IF NOT EXISTS audio_moderation_decisions (
  id TEXT PRIMARY KEY,
  voice_message_id TEXT NOT NULL
    REFERENCES voice_messages(id) ON DELETE CASCADE,
  decision TEXT NOT NULL
    CHECK (decision IN ('allowed', 'limited', 'blocked')),
  reason_codes TEXT[],
  provider TEXT,
  model_id TEXT,
  model_version TEXT,
  confidence NUMERIC(4, 3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  -- Evidence retention: the moderation provider may retain a hash reference
  -- for appeal/audit. The audio bytes themselves are never logged here.
  evidence_hash TEXT,
  reviewer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audio_moderation_decisions_voice_idx
  ON audio_moderation_decisions (voice_message_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audio_moderation_decisions_decision_idx
  ON audio_moderation_decisions (decision, created_at DESC)
  WHERE decision IN ('limited', 'blocked');
