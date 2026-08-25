# P2 #33 — Data Privacy, Retention & Deletion Propagation Audit

**Auditor:** Senior privacy/security engineer (evidence-based, anti-AI-design policy)
**Scope:** ThryftVerse backend (`backend/api/src`) + frontend contracts + DB migrations
**Regulatory lens:** UK-GDPR Art. 5(1)(e) storage limitation, Art. 17 right to erasure, Art. 25 data protection by design, Art. 30 records of processing, Art. 33 breach notification, Art. 35 DPIA; GDPR Art. 28 processor contract obligations.

---

## 1. Executive Finding

ThryftVerse has **two parallel, inconsistent erasure flows** (GDPR in `index.ts`, CCPA in `compliance.ts`) that cover overlapping but **non-identical** data classes. Neither flow cascades to the majority of user-generated content: **support transcripts, support AI agent runs, chat messages, AI usage events, media assets, listings, orders, auction bids, or co-own holdings**. The only data class with a genuine retention engine is **catalogue import raw data** (`catalogImportRetention.ts`), which enforces a 30-day `raw_delete_after` window with a dedicated worker. Every other data class is **retained indefinitely** with no TTL, no scheduled purge, and no deletion propagation to object storage, search indices, or external AI/moderation vendors.

**Media lifecycle is the largest gap:** `deleteObject()` exists in `lib/s3.ts:151` but is called in exactly **one** place — orphaned upload-intent cleanup (`mediaAssets.ts:945`). Media revoke (`mediaAssets.ts:717`) sets `status='revoked'` and nulls `canonical_url` but **never deletes the S3 object**. Listing soft-delete (`listings.ts:4133`) sets `status='deleted'` but does **not** trigger media GC. There is no reference-counted media deletion orchestrator.

**AI/transcript retention is unbounded:** `ai_usage_events` uses `ON DELETE RESTRICT` (`068_ai_usage_and_policy_closure.sql:10`) which would **block** hard user deletion, and has no retention TTL. `support_agent_runs` stores `tool_calls`, `tool_results`, `validator_outcomes` as plaintext JSONB (`151_support_conversations.sql:254-256`) — potentially PII-bearing — with no expiry. `support_messages.body` is plaintext (`151_support_conversations.sql:65`), unencrypted, retained forever. The OpenAI integration correctly sets `store: false` (`openaiAgent.ts:240`, `supportAgentTurnHandler.ts:186`), which is the sole vendor-side protection.

**PII encryption is partial:** `secure_messages` and `catalog_import` raw snapshots use application-layer ciphertext (`secureMessages.ts:95`, `catalogImportRetention.ts:80`), but `chat_messages.body`, `support_messages.body`, `user_compliance_profiles` (legal_name, DOB), and `ai_usage_events` are **plaintext at rest**. Logger redaction (`logger.ts:5`) covers only `password/token/secret/apiKey` — **not** email, phone, address, or message bodies.

**Severity: P2-High.** UK-GDPR Art. 5(1)(e) storage limitation is violated for every data class except catalogue imports. Art. 17 erasure is incompletely fulfilled — a DSAR erasure leaves support transcripts, chat history, AI runs, media, and listings intact and attributable to the user ID.

---

## 2. Evidence Table

| # | Data class | Path:Line | Retention/deletion status | Gap |
|---|-----------|-----------|--------------------------|-----|
| E1 | User account | `index.ts:16428-16446` | GDPR erasure: anonymises username, nulls email/password_hash, sets `is_erased=TRUE`, `deleted_at=NOW()` | User row retained (soft-delete). `ai_usage_events.user_id` is `ON DELETE RESTRICT` (`068:10`) — hard delete would fail. |
| E2 | User account (CCPA) | `compliance.ts:291-303` | CCPA deletion: sets `username='deleted_user'`, `email=NULL`, `is_erased=TRUE` | **Weaker than GDPR flow.** Does NOT null password_hash, two_factor_enabled, last_login_at. Does NOT delete payment methods, secure profiles, secure messages, interactions, recommendations, notification devices, totp, recovery codes. Inconsistent with GDPR flow. |
| E3 | User addresses | `index.ts:16448` | GDPR: hard `DELETE FROM user_addresses` | CCPA flow only soft-deletes (`compliance.ts:311` sets `deleted_at`). Divergent. |
| E4 | Payment methods | `index.ts:16449` | GDPR: hard `DELETE FROM user_payment_methods` | CCPA flow: **not touched**. |
| E5 | Secure messages | `index.ts:16452` | GDPR: hard `DELETE FROM secure_messages WHERE sender_id OR recipient_id` | Encrypted at rest (`secureMessages.ts:95`). CCPA flow: **not touched**. |
| E6 | Secure profiles | `index.ts:16450` | GDPR: hard `DELETE FROM user_secure_profiles` | CCPA flow: **not touched**. |
| E7 | Wallet secure snapshots | `index.ts:16451` | GDPR: hard `DELETE` | CCPA flow: **not touched**. |
| E8 | Interactions | `index.ts:16453` | GDPR: hard `DELETE` | CCPA flow: **not touched**. |
| E9 | Recommendations | `index.ts:16454-16455` | GDPR: hard `DELETE` recommendations + feedback | CCPA flow: **not touched**. |
| E10 | Notification devices | `index.ts:16456` | GDPR: hard `DELETE` | CCPA flow: **not touched**. |
| E11 | Notification events | `index.ts:16458-16469` | GDPR: anonymise title/body to `[erased]`, set `gdprErased` metadata | Retained for audit. CCPA flow: **not touched**. |
| E12 | TOTP / recovery codes | `index.ts:16471-16472` | GDPR: hard `DELETE` | CCPA flow: **not touched**. |
| E13 | Sessions / refresh tokens | `index.ts:16473-16474` | GDPR: revoke (set `revoked_at`), delete password reset tokens | CCPA flow: only revokes sessions (`compliance.ts:306`). |
| E14 | Compliance profile (KYC) | `index.ts:16477-16494` | GDPR: nulls legal_name, date_of_birth, sets kyc_status='expired' | Retained for AML/financial-record exemption (legitimate). CCPA flow: **not touched**. |
| E15 | **Chat messages** | `010_chat_groups_and_bots.sql:26-35` | `body TEXT NOT NULL` plaintext. Soft-delete columns exist (`149:31` `deleted_for_everyone_at`) | **Neither GDPR nor CCPA flow touches chat_messages.** No retention TTL. No anonymisation. Plaintext at rest. |
| E16 | **Chat conversations** | `010_chat_groups_and_bots.sql` | `ON DELETE CASCADE` from user would cascade conversations → messages | GDPR flow does NOT hard-delete user row, so cascade never fires. Conversations retained indefinitely. |
| E17 | **Support messages** | `151_support_conversations.sql:60-69` | `body TEXT NOT NULL` plaintext. `author_id ... ON DELETE SET NULL` | **Neither erasure flow touches support_messages.** No TTL. Plaintext. `author_id` set to NULL on user hard-delete (which never happens). |
| E18 | **Support agent runs** | `151_support_conversations.sql:243-263` | Stores `tool_calls`, `tool_results`, `validator_outcomes` as JSONB (may contain PII). `conversation_id ... ON DELETE CASCADE` | **No erasure.** No TTL. Cascades only if conversation is hard-deleted (never triggered by erasure flow). |
| E19 | **Support cases / events / handoffs** | `151:91-153` | `user_id ... ON DELETE CASCADE` | Would cascade on user hard-delete, but erasure flow never hard-deletes user. Retained indefinitely. |
| E20 | **AI usage events** | `068_ai_usage_and_policy_closure.sql:8-42` | `user_id ... ON DELETE RESTRICT`, `conversation_id ... ON DELETE RESTRICT` | **No retention TTL. No deletion path.** `ON DELETE RESTRICT` actively blocks user hard-deletion. GDPR export includes them (`index.ts:16287`) but erasure does NOT delete them. |
| E21 | **Listings** | `listings.ts:4133-4172` | Soft-delete: `status='deleted'`. Sold listings cannot be deleted (`4150`). Search index removal is fire-and-forget (`4169`). | **No media GC triggered.** No retention TTL on deleted listings. No anonymisation of seller-attributable data. Erasure flow does NOT touch listings. |
| E22 | **Media assets** | `074_authoritative_media_lifecycle.sql:9-71` | Full lifecycle state machine with `deleted` status (`44`). `owner_id ... ON DELETE CASCADE` | **No delete endpoint sets status='deleted'.** Revoke (`mediaAssets.ts:717`) sets `revoked` but does NOT delete S3 object. `deleteObject()` only called for orphaned upload intents (`mediaAssets.ts:945`). No GC when parent listing is soft-deleted. |
| E23 | **Media derivatives** | `074:80-98` | `media_asset_id ... ON DELETE CASCADE` | `purge_derivatives` job (`mediaAssets.ts:788`) deletes DB rows (`854`) but the actual S3 object deletion is delegated to an external worker with no verified contract. |
| E24 | **Media bindings** | `074:103-123` | `media_asset_id ... ON DELETE RESTRICT`, `owner_id ... ON DELETE CASCADE` | Revoke sets `removed_at` (`mediaAssets.ts:769`) but binding row retained. |
| E25 | **Catalogue import raw data** | `catalogImportRetention.ts:41-122` | 30-day `raw_delete_after` window. `enforceRetention()` nulls `raw_snapshot_ciphertext` and `source_url_ciphertext`. Worker: `catalogImportRetentionHandler.ts`. | **Only data class with a retention engine.** Normalised fields and created listings retained indefinitely (by design). `deleteBatchData()` for GDPR does NOT delete created listings (`catalogImportRetention.ts:137-139`). |
| E26 | **Orders** | `index.ts:16274` (export only) | Retained indefinitely for order history. Sold listings retained (`listings.ts:4150-4152`). | **No retention TTL.** No anonymisation. Erasure flow does NOT touch orders. Legitimate for financial-record exemption but no documented retention policy. |
| E27 | **Auction bids** | `index.ts:16275` (export only) | `bidder_id` retained. | **No deletion.** No TTL. Erasure flow does NOT touch. |
| E28 | **Co-own orders / holdings** | `index.ts:16276-16277` (export only) | Retained for trading history. | **No deletion.** No TTL. Erasure flow does NOT touch. |
| E29 | **KYC cases / AML alerts** | `index.ts:16280-16281` (export only) | Retained for regulatory exemption. | Legitimate under financial-record exemption, but no documented retention period or disposal schedule. |
| E30 | **GDPR request log** | `009_compliance_regulatory_foundation.sql:433-446` | `gdpr_requests` retained. `user_id ... ON DELETE CASCADE`. | Audit record — legitimate retention. |
| E31 | **Compliance audit log** | `009:451-463` | Immutable (trigger prevents UPDATE/DELETE, `009:513-527`). `actor_user_id ... ON DELETE SET NULL`, `subject_user_id ... ON DELETE SET NULL`. | Legitimate immutability, but PII in `payload` JSONB is never redacted even after erasure. |
| E32 | **Logger redaction** | `logger.ts:5` | Pino redact paths: `['*.password', '*.token', '*.secret', '*.apiKey']` | **Does not redact email, phone, address, message bodies, legal_name, date_of_birth.** PII leakage risk in structured logs. |
| E33 | **Encryption at rest** | `secureMessages.ts:95`, `catalogImportRetention.ts:80`, `keyService.ts` | Application-layer encryption for secure_messages, catalog import raw snapshots, secure profiles, wallet snapshots | **chat_messages.body, support_messages.body, support_agent_runs.tool_results, ai_usage_events, user_compliance_profiles (legal_name, DOB) are plaintext at rest.** No column-level encryption (pgcrypto not used). |
| E34 | **Vendor AI retention** | `openaiAgent.ts:240`, `supportAgentTurnHandler.ts:186` | `store: false` in OpenAI Responses API request body | Good — OpenAI does not retain transcripts. But no DPA/Art. 28 processor contract enforcement in code. No verification that moderation vendors (AWS Rekognition, Sightengine) do not retain copies. |
| E35 | **Moderation vendor copies** | `lib/moderation/moderationProvider.ts:7` | Provider interface decouples vendor. No retention/deletion contract in interface. | **No deletion propagation to moderation vendors.** No TTL on moderation results stored in DB. No vendor-side deletion API call on erasure. |
| E36 | **Search index** | `listings.ts:4169` | `removeListingFromIndex(listingId)` fire-and-forget on listing delete | **No removal on user erasure.** No removal on media revoke. No removal on support message deletion. Search index may retain stale/attributable data after erasure. |
| E37 | **Backups** | `queuePriorities.ts:103-108` | `backup_check` repeatable job (24h). | **No backup deletion strategy for erased users.** Erased user data persists in backups with no expiry or targeted purge. PITR would restore erased data. |
| E38 | **Scheduled retention jobs** | `queuePriorities.ts:58-110` | Repeatable jobs: auction_end_check, escrow_release_sweep, payout_schedule_sweep, search_index_sync, analytics_mv_refresh, backup_check | **No repeatable job for message retention, AI run purge, media GC, support transcript expiry, or DSAR fulfilment.** |

---

## 3. Deletion Propagation Map

### 3.1 What cascades correctly

```
GDPR erasure (index.ts:16369) ──┐
  ├── users row: anonymised (soft-delete, NOT hard-deleted)
  ├── user_addresses: HARD DELETE ✓
  ├── user_payment_methods: HARD DELETE ✓
  ├── user_secure_profiles: HARD DELETE ✓
  ├── wallet_secure_snapshots: HARD DELETE ✓
  ├── secure_messages: HARD DELETE (sender OR recipient) ✓
  ├── interactions: HARD DELETE ✓
  ├── recommendations + feedback: HARD DELETE ✓
  ├── notification_devices: HARD DELETE ✓
  ├── notification_events: anonymise title/body ✓
  ├── user_totp_factors: HARD DELETE ✓
  ├── user_recovery_codes: HARD DELETE ✓
  ├── user_sessions: revoke ✓
  ├── refresh_tokens: revoke ✓
  ├── password_reset_tokens: HARD DELETE ✓
  └── user_compliance_profiles: nullify legal_name, DOB ✓ (regulatory exemption)
```

### 3.2 What orphans (NOT touched by any erasure flow)

```
GDPR/CCPA erasure ──✗──> chat_messages          (plaintext, no TTL, no anonymisation)
                ──✗──> chat_conversations        (retained, attributable)
                ──✗──> chat_message_attachments  (media URLs retained)
                ──✗──> chat_message_reactions     (retained)
                ──✗──> chat_message_read_receipts (retained)
                ──✗──> support_conversations      (retained, user_id attributable)
                ──✗──> support_messages           (plaintext body, author_id attributable)
                ──✗──> support_agent_runs         (tool_results may contain PII)
                ──✗──> support_agent_citations    (retained)
                ──✗──> support_cases              (retained, user_id attributable)
                ──✗──> support_case_events        (payload may contain PII)
                ──✗──> support_handoffs           (handoff_bundle may contain PII)
                ──✗──> support_feedback           (retained)
                ──✗──> ai_usage_events            (ON DELETE RESTRICT, no TTL)
                ──✗──> listings                   (soft-deleted only by seller action)
                ──✗──> media_assets               (revoked only by owner action)
                ──✗──> media_derivatives          (S3 objects may persist)
                ──✗──> media_bindings             (removed_at set only on revoke)
                ──✗──> orders                     (retained indefinitely)
                ──✗──> auction_bids               (retained indefinitely)
                ──✗──> coOwn_orders / holdings    (retained indefinitely)
                ──✗──> kyc_cases / aml_alerts     (retained, legitimate but undocumented)
                ──✗──> search index entries       (no erasure propagation)
                ──✗──> S3 media objects           (no GC on parent delete)
                ──✗──> backup snapshots           (no targeted purge)
                ──✗──> vendor copies (AI/mod)     (no deletion contract)
```

### 3.3 Listing deletion (listings.ts:4133)

```
DELETE /listings/:listingId
  ├── listings.status = 'deleted' (soft-delete)
  ├── invalidateSearchCache() (fire-and-forget)
  ├── removeListingFromIndex() (fire-and-forget)
  ──✗──> media_assets (no GC, no revoke, no reference count check)
  ──✗──> media_bindings (no removal_at set)
  ──✗──> listing_offers (retained — "preserves offers, moderation evidence")
  ──✗──> S3 objects (never deleted)
```

### 3.4 Media revoke (mediaAssets.ts:717)

```
POST /media/assets/:assetId/revoke
  ├── media_assets.status = 'revoked', canonical_url = NULL
  ├── media_bindings.removed_at = NOW()
  ├── media_processing_jobs: active jobs → 'dead'
  └── enqueue purge_derivatives job
       ├── (external worker deletes S3 derivative objects — unverified)
       └── DB rows: DELETE FROM media_derivatives (mediaAssets.ts:854)
  ──✗──> original S3 object NEVER deleted
  ──✗──> search index not updated
```

### 3.5 Catalogue import retention (catalogImportRetention.ts:41) — the only complete flow

```
enforceRetention(batchId)
  ├── verify raw_delete_after < NOW()
  ├── raw_snapshot_ciphertext = NULL (all items in batch)
  ├── source_url_ciphertext = NULL (all media rows)
  └── log counts
(Catalogue import is the ONLY data class with a working retention engine.)
```

---

## 4. Media Lifecycle Audit

| Lifecycle event | DB transition | S3 object deleted? | Gap |
|----------------|--------------|-------------------|-----|
| Upload (orphaned) | `upload_intents.cleanup_status='cleaned'` | **Yes** — `deleteStoredObject()` (`mediaAssets.ts:945`) | Only path that calls `deleteObject()`. |
| Revoke | `status='revoked'`, `canonical_url=NULL` (`mediaAssets.ts:752`) | **No** — original object retained forever | Revoke is a visibility toggle, not a deletion. |
| purge_derivatives | `DELETE FROM media_derivatives` (`mediaAssets.ts:854`) | **Maybe** — delegated to external worker, no verified contract | No confirmation that S3 derivative objects are actually deleted. |
| Listing soft-delete | `listings.status='deleted'` (`listings.ts:4159`) | **No** — no media GC triggered | Media orphans accumulate. |
| User erasure (GDPR) | `users.is_erased=TRUE` | **No** — media_assets not touched | `media_assets.owner_id ON DELETE CASCADE` never fires (user not hard-deleted). |
| User erasure (CCPA) | `users.is_erased=TRUE` | **No** | Same. |

**Finding:** There is no reference-counted media deletion orchestrator. `media_bindings` tracks bindings (`074:103`) with `removed_at`, but no worker scans for assets with zero active bindings and purges them. The `media_processing_jobs` `purge_derivatives` job type (`074:133`) only handles derivatives, not the original object. S3 lifecycle policies are not configured in code.

---

## 5. AI / Transcript Retention Audit

| Data store | Location | Retention | Anonymised? | Encrypted? |
|-----------|----------|-----------|-------------|------------|
| `ai_usage_events` | `068:8-42` | **Indefinite** | No | No (plaintext) |
| `support_agent_runs.tool_calls` | `151:254` | **Indefinite** | No | No (JSONB) |
| `support_agent_runs.tool_results` | `151:255` | **Indefinite** | No | No (JSONB) |
| `support_agent_runs.validator_outcomes` | `151:256` | **Indefinite** | No | No (JSONB) |
| `support_messages.body` | `151:65` | **Indefinite** | No | No (plaintext) |
| `chat_messages.body` | `010:32` | **Indefinite** | No (soft-delete tombstone only) | No (plaintext) |
| OpenAI provider-side | `openaiAgent.ts:240` | `store: false` — not retained by OpenAI | N/A | N/A |
| Support agent provider-side | `supportAgentTurnHandler.ts:186` | `store: false` — not retained by OpenAI | N/A | N/A |

**Finding:** The `store: false` flag is the correct and sole vendor-side protection — OpenAI does not retain transcripts. However, **on the ThryftVerse side, every AI-related data store is retained indefinitely with no TTL, no anonymisation, and no encryption**. `ai_usage_events` is exported in DSAR (`index.ts:16287`) but never deleted on erasure. `support_agent_runs` stores full tool call/result traces that may contain user PII (order details, addresses projected into context) and are never purged.

The `safety_identifier` (`openaiAgent.ts:226-228`) is a SHA-256 hash of `thryftverse:${userId}` — this is a pseudonymous identifier sent to OpenAI. It is not reversible without the userId, but it is **deterministic and stable across requests for the same user**, which means OpenAI could correlate sessions even with `store: false`. This is acceptable under Art. 25 pseudonymisation but should be documented.

---

## 6. Vendor-Copy Propagation Gaps

| Vendor | Data sent | Retention contract | Deletion propagation |
|--------|----------|-------------------|---------------------|
| OpenAI (AI agent) | User message text, conversation history, system instructions | `store: false` in request (`openaiAgent.ts:240`) | N/A (not stored vendor-side) |
| OpenAI (support agent) | Customer message, redacted context projection, knowledge passages | `store: false` (`supportAgentTurnHandler.ts:186`) | N/A |
| Moderation (AWS Rekognition / Sightengine) | Media object URLs / image bytes | **No retention contract in interface** (`moderationProvider.ts:7`) | **No deletion API call on erasure** |
| Payment providers (Stripe, etc.) | Payment intent data, customer details | Governed by provider DPA (external) | **No code-level deletion propagation** — `paymentProviders.ts:264` has no deletion method |
| Shipping providers | Tracking numbers, addresses | Governed by provider DPA (external) | **No code-level deletion propagation** — `shippingProvider.ts` has no deletion method |

**Finding:** There is no Art. 28 processor contract enforcement in code. The moderation provider interface (`moderationProvider.ts`) has no `deleteData()` method, no retention TTL field, and no audit hook. When a user is erased, no outbound call is made to any vendor to delete their copies. The `store: false` flag for OpenAI is the only vendor-side protection, and it is not verified or auditable.

---

## 7. Proposed Flagship Privacy Architecture

### 7.1 Retention Policy Engine

**Goal:** Centralised, declarative retention policies per data class, enforced by a scheduled worker.

```
retention_policies table:
  - id, data_class, ttl_days, action (delete | anonymise | nullify_fields),
    field_list (for nullify), legal_basis, regulatory_reference,
    effective_from, expires_at, created_at
```

Data classes and proposed TTLs (UK-GDPR Art. 5(1)(e) storage limitation):

| Data class | Proposed TTL | Action | Legal basis |
|-----------|-------------|--------|-------------|
| Chat messages (non-order) | 180 days after conversation inactive | Anonymise body, null sender_user_id | Legitimate interest (Art. 6(1)(f)) |
| Chat messages (order-related) | 7 years (financial records) | Retain, anonymise after order closure | Legal obligation (AML/financial) |
| Support messages | 2 years after case closed | Anonymise body, null author_id | Legitimate interest |
| Support agent runs | 90 days after conversation closed | Hard delete | Legitimate interest (quality assurance) |
| AI usage events | 365 days | Hard delete | Legitimate interest (cost audit) |
| Media assets (revoked/deleted) | 90 days after status change | Hard delete + S3 object delete | Legitimate interest |
| Listings (soft-deleted, unsold) | 180 days | Hard delete + media GC | Legitimate interest |
| Orders | 7 years | Anonymise PII fields, retain financial skeleton | Legal obligation |
| Catalogue import raw data | 30 days (existing) | Nullify ciphertext (existing) | Legitimate interest |
| KYC/AML cases | 5 years after case closure | Retain, then hard delete | Legal obligation (MLR 2017) |
| GDPR request logs | 3 years | Hard delete | Legitimate interest (audit) |
| Compliance audit log | 7 years | Retain (immutable) | Legal obligation |

**Implementation:**
- New `retentionEnforcementWorker` handler, added to `queuePriorities.ts:58` as a repeatable job (hourly).
- Worker iterates `retention_policies`, executes `action` on rows past `NOW() - ttl_days`.
- Each enforcement batch writes to `retention_enforcement_log` (batch_id, policy_id, rows_affected, executed_at).

### 7.2 Deletion Orchestration (DB → media → AI vendor → search index → backups)

**Goal:** A single, idempotent, multi-stage erasure orchestrator that replaces the two divergent flows.

```
POST /compliance/erasure (replaces both /users/me DELETE and /compliance/ccpa/request-deletion)
  Stage 1 — DB (transactional):
    - users: anonymise (username, email, password_hash, etc.) — existing logic
    - user_addresses, payment_methods, secure_profiles, secure_messages: hard delete
    - interactions, recommendations, notification_devices: hard delete
    - support_messages: anonymise body='[erased]', null author_id
    - support_agent_runs: hard delete
    - chat_messages (non-order): anonymise body='[erased]', null sender_user_id
    - ai_usage_events: hard delete (change FK to ON DELETE CASCADE or delete first)
    - listings (unsold, soft-deleted): hard delete + enqueue media GC
    - orders: anonymise PII fields, retain financial skeleton
    - media_assets: enqueue media GC job per asset
  Stage 2 — Object storage (async, queued):
    - For each media_asset: deleteObject(original) + deleteObject(derivatives)
    - Verify deletion via HeadObject; retry with backoff
  Stage 3 — Search index (async):
    - removeListingFromIndex for each owned listing
    - removeSupportConversationFromIndex for each support conversation
    - removeMediaFromIndex for each media asset
  Stage 4 — Vendor propagation (async, best-effort with audit):
    - Call moderation vendor deletion API (if contract supports)
    - Verify OpenAI store:false (no action needed, log confirmation)
    - Call payment provider data deletion API (if contract supports, subject to financial-record exemption)
  Stage 5 — Backup flag:
    - Mark user_id in backup_deletion_manifest table
    - Backup retention policy must expire all backups containing the user within 90 days
    - Document that PITR restore of pre-erasure state is a controlled breach procedure
  Stage 6 — Audit:
    - Write to compliance_audit_log: gdpr.erasure.orchestrated, stages completed, gaps
```

**Key change:** `ai_usage_events.user_id` FK must change from `ON DELETE RESTRICT` to `ON DELETE CASCADE` (or the orchestrator deletes rows before the user row). This is a **blocking migration** — the current schema makes hard user deletion impossible.

### 7.3 DSAR Workflow

**Goal:** Unified, auditable DSAR (Data Subject Access Request) pipeline covering both export and erasure.

```
gdpr_requests (existing, 009:433) — extend:
  - add stages JSONB (tracks orchestration stage completion)
  - add completed_stages TEXT[]
  - add gaps JSONB (stages that failed or were skipped)
  - add vendor_propagation_status JSONB

POST /compliance/dsar
  - request_type: 'export' | 'erasure'
  - Creates gdpr_requests row (status='processing')
  - Enqueues dsar_orchestration job
  - Returns requestId immediately (Art. 12(3) — 1 month deadline)

GET /compliance/dsar/:requestId
  - Returns status, stages completed, gaps
  - For export: returns signed URL to export bundle (time-limited)
```

The existing export flow (`index.ts:16187-16367`) is comprehensive but **synchronous** — it runs in the request handler and could timeout for users with large histories. Move to async with signed URL delivery.

### 7.4 PII Minimisation

- **chat_messages.body**: Migrate to ciphertext using `keyService.encryptJsonPayload()` (same as `secureMessages.ts:95`). Add `body_ciphertext` + `key_version` columns, backfill, drop `body`.
- **support_messages.body**: Same encryption migration.
- **support_agent_runs.tool_calls/tool_results/validator_outcomes**: Encrypt as a single JSONB ciphertext blob.
- **ai_usage_events**: No message content stored (only token counts, model, cost) — already minimal. No change needed.
- **user_compliance_profiles.legal_name, date_of_birth**: Encrypt at rest using column-level encryption (pgcrypto or application-layer).
- **compliance_audit_log.payload**: Implement redaction pass — after erasure, replace PII fields in payload with `[erased]` hashes. This requires a new trigger or a post-erasure sweep (the table is currently immutable via trigger `009:513`; add a privileged redaction function that bypasses the trigger for GDPR erasure compliance).

### 7.5 Encryption

- **At rest (DB):** Introduce `pgcrypto` for column-level encryption of PII fields that cannot use application-layer encryption (e.g., `user_compliance_profiles.legal_name`). Application-layer encryption (via `keyService.ts`) for message bodies and AI transcripts.
- **Key management:** `keyService.ts` already supports key versioning (`key_version` columns). Document key rotation procedure. Enforce HSM/KMS in production (not environment variables).
- **In transit:** Verify TLS 1.2+ for all vendor calls (OpenAI, moderation, payments). Add mTLS for internal service calls.

### 7.6 Logging Scrubbing

**Current:** `logger.ts:5` redacts `['*.password', '*.token', '*.secret', '*.apiKey']`.

**Proposed:**
```typescript
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      '*.password', '*.token', '*.secret', '*.apiKey',
      '*.email', '*.phoneNumber', '*.address', '*.addressLine1',
      '*.addressLine2', '*.postalCode', '*.dateOfBirth', '*.legalName',
      '*.body', '*.message', '*.messageText', '*.ciphertext',
      '*.cardNumber', '*.iban', '*.sortCode', '*.accountNumber',
    ],
    censor: '[REDACTED]',
  },
});
```

Additionally, audit all `request.log.error` and `logger.info` calls near PII-bearing operations (orders, payments, KYC, messages) to ensure no raw PII is logged in structured fields outside the redact paths.

### 7.7 Scheduled Job Additions

Add to `queuePriorities.ts:61` `repeatableJobs`:

```typescript
{ queueName: 'infra_ops', config: {
    name: 'retention_enforcement_sweep',
    data: { reason: 'scheduled' },
    options: { repeat: { every: 60 * 60_000 }, removeOnComplete: true, removeOnFail: 100 },
}},
{ queueName: 'infra_ops', config: {
    name: 'media_gc_sweep',
    data: { reason: 'scheduled' },
    options: { repeat: { every: 6 * 60 * 60_000 }, removeOnComplete: true, removeOnFail: 100 },
}},
{ queueName: 'infra_ops', config: {
    name: 'dsar_orchestration_sweep',
    data: { reason: 'scheduled' },
    options: { repeat: { every: 15 * 60_000 }, removeOnComplete: true, removeOnFail: 100 },
}},
{ queueName: 'infra_ops', config: {
    name: 'backup_expiry_check',
    data: { reason: 'scheduled' },
    options: { repeat: { every: 24 * 60 * 60_000 }, removeOnComplete: true, removeOnFail: 100 },
}},
```

---

## 8. Evidence Tags (Line References)

| Tag | File:Line | Finding |
|-----|----------|---------|
| [E1] | `index.ts:16428-16446` | GDPR erasure: user anonymisation (soft-delete) |
| [E2] | `compliance.ts:291-303` | CCPA deletion: weaker, divergent flow |
| [E3] | `index.ts:16448` vs `compliance.ts:311` | Addresses: hard delete vs soft delete divergence |
| [E4-E14] | `index.ts:16449-16494` | GDPR cascade coverage (payment methods, secure messages, etc.) |
| [E15] | `010_chat_groups_and_bots.sql:26-35` | chat_messages: plaintext, no TTL, not touched by erasure |
| [E16] | `149_chat_message_lifecycle_columns.sql:31` | Soft-delete columns exist but no erasure propagation |
| [E17] | `151_support_conversations.sql:60-69` | support_messages: plaintext, no TTL, not touched |
| [E18] | `151_support_conversations.sql:243-263` | support_agent_runs: tool_results JSONB, no TTL, not touched |
| [E19] | `151_support_conversations.sql:91-153` | support_cases/events: ON DELETE CASCADE but user never hard-deleted |
| [E20] | `068_ai_usage_and_policy_closure.sql:10` | ai_usage_events: ON DELETE RESTRICT blocks hard user deletion |
| [E20b] | `index.ts:16287` | ai_usage_events exported in DSAR but never deleted on erasure |
| [E21] | `listings.ts:4133-4172` | Listing soft-delete: no media GC, no erasure propagation |
| [E21b] | `listings.ts:4150-4152` | Sold listings cannot be deleted (retained for order history) |
| [E22] | `074_authoritative_media_lifecycle.sql:9-71` | media_assets lifecycle: deleted status exists but never set by any endpoint |
| [E22b] | `mediaAssets.ts:717-793` | Media revoke: sets revoked, does NOT delete S3 object |
| [E22c] | `mediaAssets.ts:945` | Only call site for deleteObject() — orphaned upload intents only |
| [E22d] | `lib/s3.ts:151-158` | deleteObject() definition — exists but underused |
| [E23] | `mediaAssets.ts:854` | purge_derivatives: deletes DB rows, S3 deletion delegated to external worker |
| [E25] | `catalogImportRetention.ts:41-122` | Catalogue import retention: only working TTL engine (30 days) |
| [E25b] | `catalogImportRetentionHandler.ts:31-56` | Retention worker handler |
| [E25c] | `catalogImportRetention.ts:229-240` | findExpiredBatches() discovery query |
| [E25d] | `catalogImportRetention.ts:147-215` | deleteBatchData() for GDPR — does NOT delete created listings |
| [E26] | `index.ts:16274` | Orders: exported in DSAR, never deleted, no TTL |
| [E30] | `009_compliance_regulatory_foundation.sql:433-446` | gdpr_requests table |
| [E31] | `009:451-527` | compliance_audit_log: immutable, payload PII never redacted |
| [E32] | `logger.ts:5` | Logger redact: only password/token/secret/apiKey |
| [E33] | `secureMessages.ts:95`, `keyService.ts` | Application-layer encryption for secure_messages, catalog imports |
| [E33b] | `010:32`, `151:65` | chat_messages.body, support_messages.body: plaintext at rest |
| [E34] | `openaiAgent.ts:240` | store: false — OpenAI does not retain |
| [E34b] | `supportAgentTurnHandler.ts:186` | store: false — support agent does not retain at OpenAI |
| [E34c] | `openaiAgent.ts:226-228` | safety_identifier: deterministic SHA-256 hash of userId |
| [E35] | `lib/moderation/moderationProvider.ts:7` | Moderation provider interface: no retention/deletion contract |
| [E36] | `listings.ts:4169` | Search index removal: fire-and-forget, only on listing delete |
| [E37] | `queuePriorities.ts:103-108` | backup_check job: no backup deletion strategy for erased users |
| [E38] | `queuePriorities.ts:58-110` | Repeatable jobs: no retention, media GC, or DSAR orchestration |
| [E38b] | `workers/index.ts:98-100` | catalogImportRetentionJob handler registered |
| [E39] | `support/contextProjectionService.ts:91` | Support context projection: redacts address/payment details before AI |
| [E39b] | `support/supportAgentTurnHandler.ts:130` | Support prompt: "sensitive details redacted" context projection |

---

## 9. Priority Remediation Order

1. **P0 (blocking):** Change `ai_usage_events.user_id` FK from `ON DELETE RESTRICT` to `ON DELETE CASCADE` (or delete rows in erasure flow). Current schema makes compliant user deletion impossible.
2. **P0:** Unify GDPR and CCPA erasure flows into a single orchestrator. The CCPA flow (`compliance.ts:291`) is strictly weaker and leaves payment methods, secure messages, and auth factors intact.
3. **P1:** Add support_messages, support_agent_runs, chat_messages, and ai_usage_events to the erasure cascade (anonymise or hard delete per data class).
4. **P1:** Implement media GC sweep — scan `media_assets` with zero active `media_bindings` (where `removed_at IS NOT NULL` or no bindings exist) and `status IN ('revoked','deleted')`, delete S3 objects, then hard-delete DB rows.
5. **P1:** Implement retention policy engine + scheduled enforcement worker (§7.1, §7.7).
6. **P2:** Encrypt chat_messages.body and support_messages.body at rest (§7.4).
7. **P2:** Expand logger redact paths (§7.6).
8. **P2:** Add vendor deletion propagation contract to moderation provider interface (§6).
9. **P3:** Document backup expiry strategy for erased user data (§7.2 Stage 5).
10. **P3:** Move DSAR export to async with signed URL delivery (§7.3).
