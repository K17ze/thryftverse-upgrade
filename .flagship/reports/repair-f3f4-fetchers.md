# Repair Report — F3/F4: Authenticated SSRF via Unpinned Remote-Media Fetchers

**Scope:** Security re-audit follow-up. Consolidate all remaining unpinned remote-media
fetches onto the shared pinned transport (`fetchPinnedRemoteMedia` in
`backend/api/src/lib/safeRemoteMediaFetch.ts`), close the receipt/URL binding gap in
creator-publication media coverage, and scope the legacy importer-extraction media-asset
read to the owning import item.

**Verdict:** FIXED. Every user-supplied remote URL in the audited paths now flows through
the pinned transport (single DNS resolve → blocklist check → connection pinned to the
validated address set → per-hop redirect revalidation → bounded body under one deadline).
The composition renderer additionally refuses to fetch any document URL that is not bound
to a media receipt, and coverage validation now proves document URL == receipt URL per
(layerId, role) binding.

## Per-file changes

### 1. `backend/api/src/lib/media/compositionRenderer.ts` (HIGH)

- Imported `fetchPinnedRemoteMedia` from `../safeRemoteMediaFetch.js`.
- `fetchSourceBuffer(url)` → `fetchSourceBuffer(url, allowedUrls, maxBytes)`:
  - **Receipt allowlist (fix c):** throws `fetch refused: document URL has no matching
    media receipt` before any network activity when the URL is not in the caller-supplied
    receipt set. Applies to `maskRef` (~L1285), secondary `mediaUri` (~L2868), gif
    `stillUrl` (~L2881), canvas image background (~L2826), and the video source (~L2130).
  - **Pinned transport (fix a):** the raw `fetch(url, { redirect: 'follow' })` (previously
    no DNS pinning, no byte cap, no timeout, blind redirect follow) is replaced by
    `fetchPinnedRemoteMedia`. Error semantics preserved: still throws `Error` with
    `fetch failed: HTTP <status>` for HTTP errors; other failures throw with the
    machine-readable code. All existing catch sites (mask apply, media layer, background
    fallback, video source) behave identically — warn + skip/fallback/null.
  - **Bounds:** new constants `SOURCE_IMAGE_MAX_BYTES` = 100 MB (image upload ceiling),
    `SOURCE_VIDEO_MAX_BYTES` = 500 MB (video upload ceiling, used only for the primary
    video source), `SOURCE_FETCH_TIMEOUT_MS` = 30 s shared whole-request deadline
    (previously unbounded).
- `RenderCompositionOptions.allowedSourceUrls?: ReadonlySet<string>` — receipt-bound URL
  set supplied by the publication flow. `renderComposition` builds
  `allowedUrls = allowedSourceUrls ∪ {sourceMediaUrl}`; when the option is omitted the set
  defaults to `{sourceMediaUrl}` only (fail closed for tests/direct callers).
- Threaded `allowedUrls` through `renderMediaLayer` (source + maskRef) and
  `renderVideoComposition` (video source; default `{sourceUrl}` when called directly).

### 2. `backend/api/src/services/creatorPublicationService.ts` (HIGH)

- `extractMediaReferences`: added the missing `gif` layer walk — `stillUrl` now emits a
  `MediaReference` with `field: 'stillUrl'`, `role: 'gif-still'`, and receipt evidence
  from `stillFinalizationId` / `stillMediaAssetId` (same naming convention as
  `mediaFinalizationId`, `thumbnailFinalizationId`, `snapshotMediaFinalizationId`).
- `validateMediaCoverage`: new check 4 — when a document ref carries a `uri` and a
  matching `expectedMedia` entry exists for its `(layerId, role)` key, the URI must equal
  `expected.suppliedUrl`, else `MEDIA_URL_MISMATCH`. Since `verifyMediaReceipt` proves
  `suppliedUrl` equals the finalized upload's `public_url`/`canonical_url`, this
  transitively binds every fetched URL to a verified receipt.
- Caller merge changed from union-by-key (which let a divergent `compositionDocument` URL
  hide behind the stored-document ref at the same key) to concatenating
  `docMediaRefs + compositionMediaRefs` — every ref is validated independently.
- `renderCompositionMedia` gained optional `allowedSourceUrls: ReadonlySet<string>`,
  forwarded to `renderComposition`. `renderPosterFrameCompositions` builds the set from
  its `expectedMedia` and passes it through; `publishCreatorDocumentTransaction` builds
  `receiptBoundUrls` from `command.expectedMedia[].suppliedUrl` for the look path. Renders
  still run before the verification transaction, but can now only fetch receipt-claimed
  URLs — and even those pass the pinned transport's SSRF checks; the transaction then
  rejects the publish if the claim doesn't match a real finalized upload.
- `__testables` extended with `extractMediaReferences` and `validateMediaCoverage`.

### 3. `backend/api/src/workers/handlers/importerExtractionHandler.ts` (MEDIUM)

- `downloadImage` → `fetchPinnedRemoteMedia({ url, maxBytes: MAX_IMAGE_BYTES (50 MB),
  timeoutMs: DOWNLOAD_TIMEOUT_MS (15 s) })`, `null` on any failure — byte cap, deadline,
  and nullable error semantics preserved.
- **IDOR fix:** `resolveMediaAssetUrl(mediaAssetId)` (global `media_assets` SELECT) →
  `resolveMediaAssetUrl(itemId, mediaAssetId)` bound through `catalog_import_media`
  (`m.import_item_id = $1 AND m.media_asset_id = $2`), mirroring
  `resolveBoundMediaAsset` in `extractionIntelligenceService.ts`. An asset not associated
  with the (route-verified, caller-owned) item resolves to `null` → honest empty
  extraction instead of reading another tenant's media.
- Defense-in-depth: the extraction row lookup now also selects `item_id`; a job whose
  `itemId` doesn't match the run's owning item is logged + skipped.

### 4. `backend/api/src/lib/visualSimilarity.ts` (MEDIUM)

- `fetchImageBuffer` → `fetchPinnedRemoteMedia({ url, timeoutMs: FETCH_TIMEOUT_MS
  (4 s) })`, `null` on failure. Adds DNS pinning + 50 MB body bound (previously none).

### 5. `backend/api/src/lib/mediaEnhancementProvider.ts` (MEDIUM)

- `validateResultIsImage`: unpinned `HEAD` (header-only trust) → pinned GET via
  `fetchPinnedRemoteMedia` with `timeoutMs: this.timeoutMs`; accepts when the
  Content-Type header is an image type **or** the payload's magic bytes sniff to a known
  image format (strictly stronger than the old check).
- `stripExifGps`: unpinned GET → `fetchPinnedRemoteMedia({ url, timeoutMs: this.timeoutMs })`.
  Error mapping preserved: transport timeout → `TIMEOUT_AFTER_<ms>` → bare
  `exif_strip_failed`; other fetch failures → `exif_strip_failed:SOURCE_FETCH_FAILED:*`;
  non-image → `exif_strip_failed:SOURCE_NOT_IMAGE` (header or sniffed bytes may prove the
  image type).

### 6. `backend/api/src/routes/bots.ts` (MEDIUM)

- `verifyProviderKey`: the validated-but-unpinned `fetch(endpoint + '/models')` →
  `fetchPinnedRemoteMedia({ url, allowHttp: false, timeoutMs: 10_000, headers: {
  'User-Agent': 'ThryftVerse-Provider-Verify/1.0', Accept: 'application/json', ...headers } })`.
  The pre-flight `assertSafeCustomProviderBaseUrl` stays for friendly error messages; the
  pinned transport re-resolves + pins the connection, closing the DNS-TOCTOU window on a
  request that carries the user's API key. `http_error` maps to
  `Provider returned <status>: <message>`; JSON is parsed from the bounded body.

## Test results

- `npx tsc --noEmit` — clean (exit 0).
- `npx vitest run` on `compositionRenderer.test.ts` (73), `safeRemoteMediaFetch.test.ts`,
  `creatorPublicationRender.test.ts`, `visualSearchRoute.test.ts` — 141 passed, 0 failed.
- `compositionRenderer.test.ts` updated: `node:dns/promises` `lookup` mocked to a public
  IP in all six fetch-using `beforeEach` blocks (same pattern as
  `safeRemoteMediaFetch.test.ts`); the `globalThis.fetch` spy still supplies bodies.
- New `src/__tests__/mediaCoverageBinding.test.ts` (vitest, 7 tests): stillUrl walk,
  URL-match pass, `MEDIA_URL_MISMATCH` on substitution, unreceipted stillUrl
  `MEDIA_RECEIPT_MISSING`, divergent stored-vs-composition ref detection.
- `node --import tsx --test` on `bots.test.ts`, `creatorPublications.test.ts`,
  `catalogImportHardening.test.ts` — all pass (32 + 20 incl. shared run).

## Residuals / notes for the parent agent

1. **Gif `stillUrl` is now receipt-bound (behavioral change).** The frontend's
   `GifLayerPayloadSchema` has no `stillFinalizationId`/`stillMediaAssetId` fields and
   `mediaReferenceWalker.ts` emits no `gif-still` ref, so a composition carrying a
   `stillUrl` will now fail coverage with `MEDIA_RECEIPT_MISSING`/`MEDIA_URL_MISMATCH`
   (and even before the transaction the renderer refuses the fetch). Fail-closed per the
   audit, but clients must either upload the still through the normal finalization flow
   and attach `stillFinalizationId` + a `role: 'gif-still'` expectedMedia entry, or drop
   `stillUrl` before publish. The frontend walker should mirror the new `gif-still` ref
   when that lands.
2. `mediaEnhancementProvider.ts` still issues plain `fetch` calls to
   `${apiBaseUrl}/segment|image-editing|jobs/...` (POST/poll/cancel). `apiBaseUrl` is
   operator-configured (`PHOTOROOM_API_BASE`/default constant), not user input, and the
   pinned transport is GET-only — left as-is intentionally.
3. `verifyMediaReceipt`'s `suppliedUrl` acceptance is `public_url === suppliedUrl ||
   canonical_url === suppliedUrl`; coverage now requires `doc.uri === suppliedUrl`, so a
   document written against the *other* alias (e.g. canonical while suppliedUrl is public)
   would be rejected. The client builder sets `suppliedUrl = ref.uri` verbatim, so
   conforming clients are unaffected.
4. `routes/importerExtraction.ts` (deprecated route) still accepts a caller-supplied
   `mediaAssetId`, but the worker's read is now bound through `catalog_import_media`, so
   cross-tenant assets resolve to `null`. The route's own pre-check was left unchanged —
   the successor route (`extractionIntelligence.ts`) is the documented replacement.
5. Untouched per instructions: `routes/coOwn.ts`, `walletMoneyPath.ts`, `searchSync.ts`,
   `routes/v2.ts` payment regions, workflow files.
