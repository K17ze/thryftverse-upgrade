-- 195: Voice message domain — durable audio asset lifecycle, waveform,
-- transcription and access revocation.
--
-- Fixes P0/P1 defects identified in report 19 (Voice Messages and Audio Media):
-- 1. Adds `audio` to `media_assets.media_kind` CHECK so voice assets are
--    first-class, not misclassified as `document` with no audio semantics.
-- 2. Adds `audio/*` MIME types to the upload policy seed is handled in
--    config.ts (runtime allowlist), not here — this migration is schema only.
-- 3. Adds the `voice_messages` derived table binding a chat message to its
--    audio media asset with duration, container/codec, waveform samples and
--    moderation state. This is the canonical read path for voice bubbles so
--    recipients and second devices get deterministic waveform + transcript
--    instead of `Math.random()` decoration on the client.
-- 4. Adds the `voice_transcriptions` table for derived, opt-in, async
--    transcription with provenance and rating (per WhatsApp's on-device model
--    and Telegram's pending/complete/rated lifecycle). Transcription is
--    derived data, never authoritative sender text.
-- 5. Adds `voice_playback_authorizations` for short-lived, membership-bound
--    playback URL issuance so deleted/blocked users cannot access audio via
--    a cached public URL (P1 access revocation).
--
-- Design principles (AGENTS.md §4 anti-AI):
-- - Waveform is decoded PCM, not decorative. The worker writes bounded
--   32–80 samples with an algorithm version. The client renders real bars
--   or an honest progress line — never `Math.random()`.
-- - Transcription is opt-in, single-language, recipient-side, derived. The
--   sender is not notified. The text is labelled "Automatically transcribed".
-- - Access is fail-closed: a deleted/blocked membership removes playback
--   authorization. CDN cache rules must not make removed audio public.

-- ── 1. Add `audio` to media_assets.media_kind ──────────────────────────────
-- The original CHECK (migration 074) only allowed image/video/document. Voice
-- assets were forced into `document`, losing audio-specific semantics and
-- duration probing. We drop and recreate the constraint to add `audio`.
ALTER TABLE media_assets
  DROP CONSTRAINT IF EXISTS media_assets_media_kind_check;

ALTER TABLE media_assets
  ADD CONSTRAINT media_assets_media_kind_check
  CHECK (media_kind IN ('image', 'video', 'audio', 'document'));

-- Same expansion for media_derivatives.
ALTER TABLE media_derivatives
  DROP CONSTRAINT IF EXISTS media_derivatives_media_kind_check;

ALTER TABLE media_derivatives
  ADD CONSTRAINT media_derivatives_media_kind_check
  CHECK (media_kind IN ('image', 'video', 'audio', 'document'));

-- ── 2. voice_messages — canonical voice message binding ────────────────────
-- One row per voice message. Binds the chat message to its audio media asset
-- and carries the deterministic waveform + container/codec metadata. The
-- client reads this to render a real waveform; absent samples mean "render
-- an honest progress line, not fake bars".
CREATE TABLE IF NOT EXISTS voice_messages (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE
    REFERENCES chat_messages(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL
    REFERENCES chat_conversations(id) ON DELETE CASCADE,
  media_asset_id TEXT NOT NULL
    REFERENCES media_assets(id) ON DELETE RESTRICT,
  sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Audio metadata verified at finalization time. The backend decodes the
  -- file to confirm container/codec/duration and rejects polyglot/mismatch.
  duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
  bytes BIGINT NOT NULL CHECK (bytes > 0),
  container TEXT NOT NULL CHECK (container IN ('m4a', 'ogg', 'webm', 'mp4')),
  codec TEXT NOT NULL CHECK (codec IN ('aac', 'opus', 'mp3')),
  sample_rate_hz INTEGER CHECK (sample_rate_hz IS NULL OR sample_rate_hz > 0),
  channels INTEGER CHECK (channels IS NULL OR channels > 0),
  -- Deterministic waveform: bounded 32–80 samples in [0,1], with an
  -- algorithm version so the client can invalidate stale shapes.
  waveform_samples JSONB,
  waveform_sample_count INTEGER
    CHECK (waveform_sample_count IS NULL OR (waveform_sample_count >= 16 AND waveform_sample_count <= 128)),
  waveform_algorithm_version INTEGER
    CHECK (waveform_algorithm_version IS NULL OR waveform_algorithm_version > 0),
  waveform_ready_at TIMESTAMPTZ,
  -- Moderation state for the audio asset. `pending` until the audio safety
  -- worker has run. `allowed` permits playback; `limited` permits the sender
  -- but hides from recipient pending review; `blocked` denies all playback.
  moderation_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_state IN ('pending', 'allowed', 'limited', 'blocked')),
  moderation_reason TEXT,
  moderated_at TIMESTAMPTZ,
  -- Soft delete propagation: when the message is deleted-for-everyone or the
  -- sender/recipient membership is removed, the playback authorization is
  -- revoked. The asset itself is retained for evidence/legal-hold per policy.
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS voice_messages_conversation_idx
  ON voice_messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS voice_messages_sender_idx
  ON voice_messages (sender_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS voice_messages_asset_idx
  ON voice_messages (media_asset_id);
CREATE INDEX IF NOT EXISTS voice_messages_moderation_idx
  ON voice_messages (moderation_state, updated_at ASC)
  WHERE moderation_state = 'pending';

-- ── 3. voice_transcriptions — derived, opt-in, async ───────────────────────
-- Transcription is derived lifecycle data, never authoritative sender text.
-- Opt-in per recipient (per WhatsApp's on-device model): the recipient
-- requests transcription, the worker processes, the result is labelled
-- "Automatically transcribed" with pending/failure/unsupported/correction
-- states. The sender is not notified.
CREATE TABLE IF NOT EXISTS voice_transcriptions (
  id TEXT PRIMARY KEY,
  voice_message_id TEXT NOT NULL
    REFERENCES voice_messages(id) ON DELETE CASCADE,
  -- The user who requested the transcription. Per-report, transcription is
  -- recipient-side and opt-in; one row per (voice_message, requesting_user).
  requested_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'processing', 'complete', 'failed_retryable', 'failed_final', 'unsupported')),
  -- The derived text. NULL until state = 'complete'. Marked derived on the
  -- client so it is never presented as the sender's exact words.
  text TEXT,
  language TEXT,
  model_id TEXT,
  model_version TEXT,
  -- Provenance + confidence for internal telemetry and correction flow.
  confidence NUMERIC(4, 3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  -- Recipient rating per Telegram's good/bad lifecycle. Drives model
  -- improvement; never shown to the sender.
  rating TEXT CHECK (rating IS NULL OR rating IN ('good', 'bad')),
  rated_at TIMESTAMPTZ,
  -- Correction/report flow for failed/incorrect transcriptions.
  correction_note TEXT,
  reported_at TIMESTAMPTZ,
  failure_reason TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (voice_message_id, requested_by_user_id)
);

CREATE INDEX IF NOT EXISTS voice_transcriptions_state_idx
  ON voice_transcriptions (state, queued_at ASC)
  WHERE state IN ('queued', 'processing', 'failed_retryable');
CREATE INDEX IF NOT EXISTS voice_transcriptions_user_idx
  ON voice_transcriptions (requested_by_user_id, updated_at DESC);

-- ── 4. voice_playback_authorizations — short-lived, membership-bound ───────
-- Playback URLs are issued against current membership/block/delete policy.
-- A row records the authorization so revocation (delete/block/leave) can
-- invalidate it and the CDN can be told to evict. This is the P1 access
-- revocation control: deleted/blocked users cannot access audio via a
-- cached public URL.
CREATE TABLE IF NOT EXISTS voice_playback_authorizations (
  id TEXT PRIMARY KEY,
  voice_message_id TEXT NOT NULL
    REFERENCES voice_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The authorized URL (signed, short TTL). Stored so revocation can target
  -- the exact grant; the URL itself contains no reusable secret after TTL.
  authorized_url TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (voice_message_id, user_id, authorized_url)
);

CREATE INDEX IF NOT EXISTS voice_playback_auth_user_idx
  ON voice_playback_authorizations (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS voice_playback_auth_voice_idx
  ON voice_playback_authorizations (voice_message_id, user_id);

-- ── 5. chat_message_attachments.kind already accepts 'audio' (migration 149)
--    No schema change needed there. The send route will insert kind='audio'.
-- ── 6. Update chat_messages metadata read path: the serializer already
--    returns metadata; voice messages carry voiceUri/durationMs/waveform in
--    metadata AND a canonical voice_messages row. The client prefers the row.
