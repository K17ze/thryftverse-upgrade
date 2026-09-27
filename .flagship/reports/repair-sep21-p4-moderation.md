# Repair Report — 2026-09-21 P4 Moderation / Media-Transport Findings

Audit source: `ThryftVerse-Validation-and-Upgrade-Report-2026-09-21.md` §4.5 and
Appendix C items **S3**, **S4**, **S6**, and "Independent weaker media fetchers
remain".

## S3 (P1) — provider credentials not forwarded; no boot validation; image-only provider allowed as sole provider

**Fixed.**

- `docker-compose.yml` (dev base): `api` service now declares
  `MODERATION_PROVIDER` (`:-mock` dev default) plus pass-throughs for
  `SIGHTENGINE_API_USER`, `SIGHTENGINE_API_KEY`, `AWS_REGION`,
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (`:-` empty defaults, matching
  the file's optional-var convention) with a comment documenting the
  text-moderation requirement.
- `docker-compose.prod.yml`: `api` (after `MODERATION_PROVIDER` at ~L281) and
  `worker` (~L420) now forward the same five variables as conditional
  pass-throughs (`:-`), matching the file's vendor-conditional convention
  (PERSONA_*/MOLLIE_* etc.); `docker compose config` confirms both services
  render the vars.
- `backend/docker-compose.production.yml`: the five vars were already
  forwarded on `api` (L407–411) and `worker` (L563–567); comments updated to
  document the conditional-credential rule and the rekognition text limitation.
- Boot validation: `collectModerationProviderConfigErrors()` +
  `assertModerationProviderReady()` added to
  `backend/api/src/lib/moderation/moderationService.ts` and invoked at module
  load. `index.ts` imports the module at API startup, so a selected-but-
  unconfigured provider kills the process before it serves traffic rather than
  failing closed on every write. Rules: `sightengine` requires
  `SIGHTENGINE_API_USER`+`SIGHTENGINE_API_KEY`; `rekognition` requires the AWS
  trio AND is rejected as the sole provider — Rekognition moderates images
  only, no `MODERATION_TEXT_PROVIDER`-style split config exists in the repo
  (verified by grep), so the fail-fast check is the fix. `mock`/unset pass.
- Fail-closed publication behaviour is untouched — `listingTextGateAction`
  still holds `review`/`failed` on `risk_pending`.

## S4 (P2) — Rekognition own-object byte fallback unbounded/undeadlined

**Fixed** in `backend/api/src/lib/moderation/rekognitionProvider.ts`:

- `S3Like.send` now accepts `{ abortSignal }`; `HeadObject` and `GetObject`
  are wrapped in an `ownStoreDeadline()` AbortController raced against the
  operation (so even SDK stubs that ignore the signal are bounded by the
  documented 15 s budget, tunable in tests via
  `__setOwnStoreIoTimeoutMsForTests`).
- `readOwnObjectBytes` consumes stream bodies incrementally with a manual
  async iterator — every `next()` races the deadline, the byte counter trips
  the 5 MiB cap mid-stream, and a misleading/absent `Content-Length` is
  handled (declared-length pre-check plus authoritative stream count). The
  `transformToByteArray` path remains only as a non-iterable compatibility
  fallback, still deadline-raced and post-checked.
- Body teardown destroys the stream **before** awaiting `iterator.return()`
  — a pending `next()` on a stalled stream only settles after destroy, and
  the reverse order deadlocks (caught by the new stalled-stream test).
  `destroyS3Body` runs on every exit (cap, abort, error, completion).

## S6 (P2) — transient DNS failure classified as permanent SSRF quarantine

**Fixed.**

- `safeRemoteMediaFetch.ts`: `resolveValidatedAddresses` now returns a
  discriminated `AddressResolution` — `blocked` (literal/resolved address in a
  blocklisted range), `nxdomain` (ENOTFOUND/ENODATA/empty answer), or
  `dns_transient` (EAI_AGAIN/SERVFAIL/other resolver errors). New
  `PinnedFetchFailureCode` `'dns_transient'`; `fetchPinnedRemoteMedia` maps
  the three reasons to `ssrf_blocked` / `dns_unresolved` / `dns_transient`
  respectively — `ssrf_blocked` is emitted only for true policy violations.
- `remoteImport.ts`: `dns_unresolved` removed from `SSRF_FAILURE_CODES`; the
  error prefix map is now three-way — `dns_unresolved` → `MEDIA_NOT_FOUND`
  (permanent dead source, distinct non-policy classification recorded in
  `last_error_code`), policy codes → `SSRF_BLOCKED` (quarantine, unchanged),
  `dns_transient`/`timeout`/`http_error`/`fetch_failed`/etc. →
  `REMOTE_FETCH_FAILED` (retryable). The import worker's `isSsrfBlock` branch
  therefore only fires on genuine policy violations; a resolver blip retries
  through the bounded attempt path instead of permanently quarantining.
- `rekognitionProvider.ts` `INPUT_FAILURE_CODES` intentionally retains
  `dns_unresolved` (a dead host is a permanent input problem → `review`) and
  does not list `dns_transient` (transient → `failed` → caller retry).

## Weaker media fetchers

**Fixed.** Both `workers/handlers/extractionIntelligenceHandler.ts` and
`workers/handlers/moderationTriageHandler.ts` deleted their bespoke
`downloadImage` implementations (headers-only timeout + unbounded
`arrayBuffer`; extraction's hostname check lacked DNS resolution) and now call
`fetchPinnedRemoteMedia` with `allowHttp:false`, byte cap, redirect bound, and
one whole-request deadline. Extraction's `isPrivateHostname`/`isUrlSafe`
helpers were removed (subsumed by the shared transport's canonicalizing
blocklist + connect pinning). Both log only the transport's log-safe
host/path message, never the full URL.

## Files changed

- `backend/api/src/lib/safeRemoteMediaFetch.ts`
- `backend/api/src/lib/media/remoteImport.ts`
- `backend/api/src/lib/moderation/rekognitionProvider.ts`
- `backend/api/src/lib/moderation/moderationService.ts`
- `backend/api/src/workers/handlers/extractionIntelligenceHandler.ts`
- `backend/api/src/workers/handlers/moderationTriageHandler.ts`
- `docker-compose.yml`, `docker-compose.prod.yml`,
  `backend/docker-compose.production.yml` (env forwarding/comments only)
- `backend/api/src/__tests__/moderationImportSafety.test.ts` (+14 tests)

## Verification

- `npx tsc --noEmit` — clean.
- `vitest run moderationImportSafety.test.ts` — **49/49 pass** (new: 5 S3
  boot-gate, 5 S4 stream-bound tests using real `Readable` bodies —
  oversized chunked, under-reported Content-Length, stalled-stream deadline,
  missing-metadata path, abortSignal propagation; 4 S6 DNS-class tests —
  EAI_AGAIN transient + retry recovery, ENOTFOUND `MEDIA_NOT_FOUND`,
  blocked-IP still `ssrf_blocked`).
- `vitest run safeRemoteMediaFetch.test.ts` — 38/38; visualSearchRoute,
  mediaEmbeddingPgvector, vectorSearchIntegration, extractionIntelligenceTypes
  — pass.
- `node --test catalogImportHardening.test.ts productionReadiness.test.ts` —
  27/27 pass.
- Full unit suite: 1492 pass / 3 fail — all three pre-existing/environmental
  and unrelated (Redis `ECONNREFUSED 127.0.0.1:6379` timeout in
  backendWorkflowClosure; `oneze_internal` capability-cluster assertions in
  countryCapabilities/countryCapabilityPolicy; a pending-Promise assertion in
  infraOps realtime). No overlap with touched files.
- `docker compose config` validates `docker-compose.yml`,
  `docker-compose.prod.yml` merge, and `backend/docker-compose.production.yml`;
  the merged prod config shows all five credential vars on `api` and `worker`.

## Residual notes

- `MEDIA_NOT_FOUND` rows still traverse the worker's bounded retry path
  (3 attempts → terminal `quarantined` with a not-found error code) rather
  than instant quarantine — `catalogImportMediaHandler.ts` was outside this
  repair's file ownership, so the honest classification is carried entirely
  by the error vocabulary; the `isSsrfBlock` policy-quarantine branch never
  fires for it.
- The worker process does not import `moderationService.ts` (provider calls
  only happen in the API process today), so the module-load gate fires at
  API boot. If a future worker code path instantiates providers, the same
  check runs on first import.
