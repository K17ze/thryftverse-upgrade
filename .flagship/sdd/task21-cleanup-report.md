# Task 21 — Media Pipeline Minor Findings Cleanup

**Status:** DONE
**Date:** 2026-05-09
**Scope:** Remaining minor findings from the Task 19 (media contract) and Task 20 (media components) reviews.

---

## Fixes applied

### 1. Auction `fit` divergence — `frontend/src/platform/product/productDetailViewModel.ts:534`

Auction mediaItems without focal data previously emitted `fit: 'contain'` while every
other projection path left `fit` undefined (defaulting to `'cover'` at the render seam).
Changed to the spread pattern used by `mediaFromRecords`:

```ts
...(item.focalX != null && item.focalY != null ? { fit: 'cover' as const } : {}),
```

No visual change on the image path (`CommerceMediaStage` already defaults
`item.fit ?? 'cover'`); the video/poster path (`item.fit === 'cover' ? 'cover' : 'contain'`)
renders identically since `undefined` and `'contain'` both resolve to `'contain'` there.

### 2. `stripImageExif` format/Content-Type mismatch — `backend/api/src/lib/media/sharpPipeline.ts`

The fall-through `.jpeg()` re-encoded `image/gif`, `image/tiff`, `image/avif`, etc. and
`pipeline.ts:643` then re-put the object under the original `detectedContentType` — a
mislabelled object on the public URL. `image/jpeg` / `image/jpg` are now explicit
branches; any other unhandled content type returns `sourceBuffer` unchanged (the
pipeline's `cleanedBuffer !== sourceBuffer` gate then correctly skips the re-put) with
a `logger.warn` so the privacy no-op is observable.

### 3. `DERIVATIVES_QUERY` ordering — `backend/api/src/lib/media/listingMediaProjection.ts:165`

Added `ORDER BY media_asset_id, width ASC NULLS LAST` so the `derivatives` ladder is
deterministically ascending by variant width per asset, as the contract documents.
(`media_asset_id` first keeps each asset's rows contiguous; the grouping code already
buckets per asset.)

### 4. HEIC fallback retains EXIF/GPS — `backend/api/src/lib/media/sharpPipeline.ts`

The libheif-output-unavailable `catch` in `stripImageExif` was a silent privacy no-op.
It now logs a `logger.warn` with the error and normalized content type before returning
`sourceBuffer`. (JPEG re-encode fallback was rejected: it would change the wire format
while the object key extension / stored Content-Type remain `image/heic` — the same
mismatch class as finding 2.)

### 5. Dead-mirror drift — `backend/api/src/routes/listings.ts:3074`

`images: detailMedia.map((m) => m.uri)` dropped the `image_url` fallback that live
`index.ts:16169` applies via `listingImageUrls`. Now calls
`listingImageUrls(detailMedia, row.image_url)`; `listingImageUrls` added to the existing
`listingMediaProjection.js` import. Verified all other `listings.ts` call sites already
apply the equivalent `?? (row.image_url ? [row.image_url] : [])` fallback — this was
the only drifter.

### 6. `encodeBlurHash` component bounds — `backend/api/src/lib/media/sharpPipeline.ts`

The public export trusted `componentX`/`componentY`; out-of-range values overflowed the
single-digit Base83 size flag. Added `clampComponentCount` (truncates, clamps to
[1, 9], non-finite → 1) applied to `cx`/`cy` used by the factor loops and `sizeFlag`.

### 7. Dead branch — `frontend/src/components/discover/PinterestMasonryGrid.tsx`

Removed the unreachable `case 'listing'` in `extractFeedUnitImageUri` — the only call
site (`resolveTilePrefetchUri`) already routes listing units through
`resolveListingTileSourceUri` before invoking it. `ListingFeedUnit` import retained
(still used at lines 114 and 503).

---

## Verification

| Check | Result |
|---|---|
| `tsc --noEmit -p tsconfig.json` (backend/api) — "error TS" count | **0** |
| `tsc --noEmit -p tsconfig.json` (frontend) — "error TS" count | **0** |
| `npx vitest run src/__tests__/mediaContract.test.ts` | **8/8 passed** |

Note: verification ran under `backend/api` (the package containing `tsconfig.json`
and `node_modules`); `backend/` itself is a wrapper directory.

## Constraints honoured

- No visual layout changes — the auction `fit` change routes through the same
  `'cover'` default every other path already used.
- No new features; all edits are in-place minor fixes.
- `frontend/src/components/coown/` untouched.
- `SearchScreen.tsx` untouched (frontend tsc reports 0 errors — the parallel-work
  compile error appears resolved or outside this tsconfig's reach).

## Concerns

- **Unhandled-type EXIF retention (accepted trade-off):** GIF/TIFF/AVIF sources and
  HEIC-without-libheif now return `sourceBuffer` unchanged, meaning any embedded
  metadata survives to the public object. This is the fix the review prescribed
  (correctness of the stored object beats silently mislabelling it), and the new
  `logger.warn` makes each occurrence observable for follow-up. If privacy
  completeness is required for these formats, the next step is same-format encoders
  (`.avif()`, `.tiff()`) or a key/content-type migration — out of scope here.
