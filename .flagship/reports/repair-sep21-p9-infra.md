# Repair report — Sep-21 audit, infrastructure/recovery/test batch (P9)

Date: 2026-09-21. Scope: audit `ThryftVerse-Validation-and-Upgrade-Report-2026-09-21.md`
sections 4.3, 4.8, 4.10, Appendix D residual blockers 1–3, release governance, §2.1 test notes.

## S1 — migration 326 reachability (P1) — FIXED

New migration `backend/api/src/db/migrations/325b_media_embeddings_pgvector_prefill.sql`.
The lexical sort (`325_…` < `325b_…` < `326_…`) makes it run immediately before 326 on
every pending database. It feature-detects `pg_available_extensions` exactly like 326
(no-op + NOTICE when vector is unavailable), installs the bigint-promoted codec ported
from migration 330 (`get_byte(...)::bigint * 16777216`), adds
`embedding_vec vector(512)` IF NOT EXISTS, and runs 326's exact backfill predicate
(`WHERE embedding_vec IS NULL AND dimensions = 512 AND octet_length(embedding) =
dimensions * 4`). When 326 then runs, its backfill matches zero rows and the
int4-overflowing expression is never evaluated; 326 re-CREATE OR REPLACEs the buggy
codec (harmless — only its own empty backfill referenced it) and 330 re-repairs it.
On DBs that already applied 326 the file is pending → runs → fully guarded → clean no-op.
`325b_..._down.sql` is a deliberate no-op (326's down owns column/function/view removal).
326 itself is untouched — checksum-frozen.

Test updates in `mediaEmbeddingPgvector.test.ts`: new describe block asserts 325b
exists, sorts between the 325_* files and 326_* (string order AND real readdir sort),
uses the same pgvector gate, carries bigint promotion (and no pre-fix int4 term),
runs the identical backfill predicate, is idempotent, and ships a no-op down file.
The existing 326 freeze assertion (buggy arithmetic must stay committed) is preserved.

## restore-guard — postgres-restore-verify.mjs (P1) — FIXED

`assertScratchTarget` now parses with `pg-connection-string` (the installed driver
parser) so comparisons use the EFFECTIVE coordinates the pg driver will use, and
rejects any target URL carrying connection-override query params
(`host`, `port`, `dbname`, `database`, `user`, `password`) outright — the audit's
`postgresql://u:p@decoy/app_test?host=prod` case is now refused. The scratch marker
must hold on the effective database name; source comparison handles URL form and
libpq keyword DSNs (small `parseKeywordDsn` extractor — the installed
pg-connection-string version does not parse keyword DSNs). Non-connection params
(`sslmode` etc.) remain allowed.

New test `src/__tests__/postgresRestoreGuard.test.ts` (10 cases, vm-extracted guard —
same read-only technique as the audit): decoy-override, every override param,
credential-only marker, explicit-port equality, keyword-DSN source, identical strings,
valid scratch accept, sslmode accept, missing marker, missing URL.

## backup-erasure (P1) — FIXED

`src/workers/handlers/backupExpiryHandler.ts`:
- Purge proof now uses snapshot-boundary (content) time parsed from the artifact key
  (`thryftverse_YYYY-MM-DDTHH-MM-SSZ…`, stamped at pg_dump START), so a snapshot started
  before erasure but uploaded after it is correctly counted as retained.
- Unknown content boundary (unparseable key / missing metadata) fails closed —
  unknown ≠ purged.
- Noncurrent versions are inventoried via `ListObjectVersionsCommand` (delete markers
  skipped — markers aren't retained bytes; surviving versions are listed separately).
  Denied/failed/truncated version listing marks the batch `purge_failed`; a store that
  returns `NotImplemented` (no versioning possible) proceeds on the current listing.
- `store_inventory_verified` now means: complete current-object listing + complete
  noncurrent-version inventory + every object's content boundary provably post-erasure.

`backend/scripts/automated-backup.sh`: plaintext dump is no longer deleted on mere
encrypted-artifact existence. The upload block verifies the remote object via
`aws s3api head-object` ContentLength == local byte size (fails hard otherwise) and
attaches `snapshot-started-at` object metadata. The cleanup trap deletes plaintext only
when `UPLOAD_VERIFIED=true` or when no S3 destination is configured (encrypted file is
the only artifact — plaintext must not linger). On upload failure both plaintext and
encrypted artifacts are preserved for operator recovery. `bash -n` clean.

## sloTracker rolling window (P2) — FIXED

`src/lib/sloTracker.ts` now writes per-day bucket keys
(`slo:<service>:<YYYY-MM-DD>:total|errors|latency_sum`, UTC, TTL = window + 1 day for
GC). Reads sum the trailing 30 day-buckets via `mget` — a hot service reports a true
rolling 30-day window instead of a lifetime total with a renewing TTL. Service
discovery parses bucket keys (and still recognizes legacy non-bucketed keys).
`/metrics/slo` output shape unchanged.

## ota-rollback truthfulness + key material (P1 ops) — FIXED

`ota-rollback.yml`: the `republish` method now exits non-zero with an explicit
"not executed — dispatch Release Train" error (no more false "rollback executed");
the success notice is scoped to `method == 'rollback'`; a per-channel
`concurrency` group was added; the key file is written under `umask 077` (restrictive
at creation, no chmod window) and an `if: always()` scrub step removes it.

Identical hardening applied to every job that materializes OTA key material:
`release-train.yml` (publish-update), `build-and-deploy.yml` (all 5 stage jobs),
`ota-staged-rollout.yml`, `staging-deploy.yml`. All edited YAML parses.

## settings.yml required contexts — RECONCILED

`main` contexts now cover the real PR-gate job names across frontend-ci, backend-ci,
ci-gates and secret-scan — including `Gitleaks secret scan`, `Decision baseline tests`,
the full ci-gates job set (`ESLint`, `Visual release gates`, `Support agent eval suite`,
`SBOM generation`, etc.) and the additional frontend-ci gates (`Phase verification
suite`, `Expo doctor health check`, `Migration prefix check`, …). Excluded on purpose:
`Surface density check` and `Maestro E2E` (continue-on-error/report-only; Maestro is
push-to-main only so it could never satisfy a PR gate). `develop` gained the secret-scan
context.

## check-release-config.mjs stale interface (P2) — FIXED

`checkOta` now prefers `EXPO_OTA_CODE_SIGNING_PRIVATE_KEY` (falling back to the legacy
`EXPO_PUBLIC_OTA_CODE_SIGNING_KEY` the workflows bridge into), still requires the
committed `keys/update-certificate.pem`, and now cryptographically verifies the
configured private key's SPKI public key matches the certificate — presence alone is
no longer proof. Fail-closed on unparseable key or mismatch. Verified locally: missing
env/cert → exit 1; generated RSA pair → match; wrong key → mismatch detected.

## infraOps.test.ts defect — FIXED

The test now awaits `publishRealtimeEvent` and asserts the real resolution (`0`
delivered). `seq: false` isolates the Redis-backed per-topic sequence transport —
with no Redis in the test env, `realtimeSequence` INCR would sit in the ioredis
offline queue (`maxRetriesPerRequest: null`) and hang the awaited promise; the
assertion under test is delivery count, not sequence allocation.

## country-policy gateway lists — DECISION: exclude `oneze_internal` from public lists

Investigated what the lists feed: `resolveCountryCapabilities().payments.gatewaysByChannel`
is returned verbatim by `GET /users/:id/capabilities` (routes/users.ts) and drives
`getAllowedGatewayIds` → `GET /payments/gateways` (public selectable-gateway listing at
index.ts:25383) — public-facing. It also feeds enforcement
(`isGatewayAllowedForChannel`, index.ts:29210) and defaulting
(`resolveChannelGateway`, index.ts:28913) — internal routing where `oneze_internal`
IS legitimate: the frontend passes `gatewayId: 'oneze_internal'` explicitly for
1ZE-wallet checkout (frontend/src/services/commerceApi.ts:753) and index.ts:22877
documents it as the required marketplace purchase rail.

Resolution: `payments.gatewaysByChannel` is now the PUBLIC contract — `oneze_internal`
is removed from every channel (it is a closed-loop internal ledger rail, not a
selectable provider). A new `payments.internalRailsByChannel` records the internal
rail per channel (`commerce: ['oneze_internal']`, `oneze_wallet: ['oneze_internal']`);
`isGatewayAllowedForChannel` and `resolveChannelGateway` consult public ∪ internal so
explicit wallet-pay requests and the commerce default are unchanged, while
`getAllowedGatewayIds`/`/payments/gateways` advertise public gateways only.
`getConfiguredClusters` likewise reports public primaries.

Tests kept (both assertions now pass as written). Two adjacent stale expectations were
repaired with in-test rationale: `payouts.gatewayPriority` no longer expects
`wise_global` (never configured — no certified adapter, PAY-14) and the empty-channel
fixture in countryCapabilityPolicy.test.ts now also clears `internalRailsByChannel` to
model a genuinely unconfigured channel. Assertions unchanged.

## Validation run

- `cd backend/api && npx tsc --noEmit` — clean.
- node:test focused run: 110/110 pass across mediaEmbeddingPgvector (42),
  backupExpiryProof (7), postgresRestoreGuard (10), countryCapabilities (9),
  countryCapabilityPolicy (3), infraOps (3), checkoutMoneyPathGuards,
  walletMoneyPathReservations.
- `bash -n` automated-backup.sh — clean; all edited workflow YAML + settings.yml
  parse (`yaml.safe_load`).
- check-release-config verified with a generated RSA pair (match + mismatch paths).

## Residual notes / not in scope

- Host-alias equivalence (decoy DNS name resolving to the same IP) is still not
  detectable by string comparison — documented limitation of the restore guard.
- A backup re-uploaded post-erasure under a NEW timestamped key carries post-erasure
  boundary metadata while containing pre-erasure content; only a signed manifest with
  recorded snapshot boundaries closes that fully — fail-closed on unknowns mitigates.
- `sloTracker` in-memory fallback remains a process-lifetime approximation (Redis is
  the source of truth; documented).
- Frontend `capabilitiesApi.ts` type does not declare `internalRailsByChannel`
  (additive, non-breaking) — worth mirroring next frontend pass.
