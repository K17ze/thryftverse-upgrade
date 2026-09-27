# PKG-06 Report — Moderation provider contract, fail-closed review, remote import transport safety

**Status: COMPLETE** (B1–B4 closed; regression tests added and green)

## Findings

### B1 — malformed Rekognition `Image.Url` — FIXED
`backend/api/src/lib/moderation/rekognitionProvider.ts` rebuilt around the real `DetectModerationLabels` contract (Bytes ≤5MB or `S3Object{Bucket,Name,Version}` — no `Url` member):

- `resolveImageReference()` (`rekognitionProvider.ts:457-506`): own-store URLs (canonical `{s3CdnBaseUrl}/{bucket}/{key}`, path-style, and virtual-hosted against configured S3 endpoints) map to `Image.S3Object` with the real bucket/key; everything else is fetched through `fetchPinnedRemoteMedia` (SSRF-pinned, 5MB cap) and sent as `Image.Bytes`.
- Input preflight (`preflightS3Object`, `inputPreflightResult`): >5MB objects and non-JPEG/PNG payloads are refused **before** the API call with a classified `review` result (`modelVersion: 'input-preflight'`) — routed to human triage, not retried as provider errors. External fetches classify permanent input failures (`ssrf_blocked`, `content_too_large`, etc.) as `review` and transient ones as `failed`.
- `moderateText` returns `failed` without constructing any `Image` payload (`rekognitionProvider.ts:622-629`).
- S3Object access errors fall back to reading the object bytes and resubmitting as `Image.Bytes` (S3-compatible stores Rekognition cannot reach).
- Test seam `__setRekognitionSdkForTests` lets tests assert the serialized request shape without AWS credentials.

### B2 — listing text moderation fails open — FIXED
- `moderationService.ts:136-156`: new `listingTextGateAction()` — `rejected`→`block`, `review`/`failed`→`hold`, `approved`→`publish`. Single source of truth for all gate callers.
- `moderateListingText()` (`moderationService.ts:209-227`): one inline retry absorbs transient provider blips; a persistently failing provider surfaces `failed` → durable hold.
- `index.ts:16934-16968` (create): `block`→422 `MODERATION_REJECTED`; `hold` on a publish-target write lands `effectiveStatus='risk_pending'` — the existing operator-visible hold every public surface already excludes (feeds/search/bidding filter `status='active'`; `canListingTransition` blocks owner moves out of `risk_pending`; settlement rejects it).
- `index.ts:18726-18823` (edit): same gate on merged text — `block` rolls back + 422; `hold` rewrites/appends `status='risk_pending'` (including text-only edits on live listings) and cancels non-terminal live lots with `lot.cancelled` events, mirroring the risk-hold invariant.
- No new status value needed — reused the existing `risk_pending` hold; no migration.

### B3 — import DNS validation/connect TOCTOU — FIXED
`safeRemoteMediaFetch.ts` now hosts the single pinned transport `fetchPinnedRemoteMedia()`: DNS resolves once, blocklist-checked, and the TCP connection is pinned via an undici `Agent` `connect.lookup` override returning only the validated address set (rebinder cannot redirect the socket; hostname preserved for TLS SNI/Host). `remoteImport.ts` deleted its own resolve-then-reconnect fetch and delegates (`remoteImport.ts:443-488`), preserving the `SSRF_BLOCKED`/`REMOTE_FETCH_FAILED` error vocabulary for quarantine classification.

### B4 — read deadline cleared at headers — FIXED
One shared deadline (`timeoutMs`) covers DNS validation, every redirect hop, header wait, and the streaming body read (`safeRemoteMediaFetch.ts:397-570`). Mid-body abort cancels the reader and discards the partial buffer; Content-Length and streamed-byte caps enforced. `remoteImport.ts` collapses the legacy connect/read budgets into the single deadline (`connectTimeoutMs + readTimeoutMs`).

## Files changed (this package)

| File | Change |
|---|---|
| `backend/api/src/lib/safeRemoteMediaFetch.ts` | Added `fetchPinnedRemoteMedia` pinned transport (DNS pinning, shared deadline, redirect revalidation, bounded stream); exported `isLoopbackIp`/`isPrivateIp` |
| `backend/api/src/lib/media/remoteImport.ts` | Removed duplicated fetch/DNS/deadline internals; delegates to shared transport; re-exports IP predicates for `routes/bots.ts` |
| `backend/api/src/lib/moderation/rekognitionProvider.ts` | Real `DetectModerationLabels` contract (Bytes/S3Object), input preflight, S3 fallback, test seam |
| `backend/api/src/lib/moderation/moderationService.ts` | `listingTextGateAction`, transient retry in `moderateListingText` |
| `backend/api/src/index.ts` | Leased regions only: gate wiring on create (~16934-16968) and edit (~18726-18823) + import of `listingTextGateAction` |
| `backend/api/src/__tests__/moderationImportSafety.test.ts` | NEW — 25 regression tests (B1 request shape/preflight, B2 gate + wiring, B3 SSRF, B4 deadline/cap) |

## Tests

`npx vitest run src/__tests__/moderationImportSafety.test.ts` — **25/25 pass**. `src/__tests__/safeRemoteMediaFetch.test.ts` — 21/21 pass. `listingRiskEnforcement.test.ts` + `catalogImportHardening.test.ts` (node:test) — all pass.

Coverage: `Image.Bytes`/`S3Object` shape asserted on the captured command input (JSON contains no `"Url"`); GIF and >5MB inputs refused pre-call as classified `review`; `moderateText` builds no Image; gate map block/hold/publish; provider `failed` (post-retry) and `review` → hold; index.ts wiring pinned by source-level assertions (hold→`risk_pending` on both paths); private/loopback/metadata URLs refused pre-connect; redirect-to-private refused at hop 2; dispatcher pin asserted; mid-body stall aborts with partial data discarded; oversized declared and streamed bodies rejected.

## Typecheck

`npx tsc --noEmit` — clean for all files in scope. The only reported errors are in `src/routes/auctions.ts` (concurrent agent mid-edit; includes a syntax error at :430) and the downstream `src/index.ts:31005` missing-export error it causes — outside this package's scope and unrelated to these changes.

## Residual gaps for the parent agent (outside my ownership)

1. **`src/lib/listingPatch.ts:239-257`** (seller-hub bulk edit) — only `rejected` is enforced; `review`/`failed` proceed with a log line on **active** listings → residual fail-open on the batch-edit surface. Should reuse `listingTextGateAction` (hold → `risk_pending`).
2. **`src/index.ts:17790, 17851`** (listing Q&A question/answer) — outside leased regions; only `rejected` is checked, `review`/`failed` publish unmoderated public UGC.
3. **`src/workers/handlers/moderationTriageHandler.ts`** `downloadImage` — raw `fetch` without SSRF pinning. Deliberately left: URLs are own-store `media_assets` refs, and pinning would block internal MinIO/`localhost:9000` in dev. Placeholder heuristic already labeled honestly. Flag if hardening is desired.
4. No dedicated re-evaluation worker for `risk_pending` moderation holds — recovery runs through the existing operator risk-review release path; the inline retry covers transient provider failure.

No commits made.
