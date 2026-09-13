# Task 20 — Media Pipeline Frontend Components

**Status:** DONE_WITH_CONCERNS (minor — see "Concerns" §6)
**Branch:** `feat/product-detail-contract-media-device-closure`
**Typecheck:** `tsc --noEmit -p tsconfig.json` → **0 errors** (`frontend`, strict, `src/**/*.{ts,tsx}` covered)

## 1. `CachedImage.tsx` — `media[].derivatives` consumption

The derivative ladder was already wired into the source-URI policy by the
prior wave (`derivatives` prop, `ListingMediaDerivative`, lqip exclusion,
jpeg→webp→png→avif format rank). What changed now:

- Extracted the whole resolution policy into an exported pure function,
  `resolveCachedImageSourceUri(uri, { downscaleWidth, derivatives, cacheBuster })`,
  so the render path and prefetch schedulers share one source of truth for the
  delivery URI (which is also the expo-image disk-cache key).
  `frontend/src/components/CachedImage.tsx:113-211`
- Resolution order is unchanged: `derivatives[]` ladder (smallest rendition
  covering the dp→px-snapped bucket) → CDN-param fallback (Cloudinary /
  Imgix / Supabase / CloudFront) → raw URI.
- Tightened the "target exceeds the ladder" fallback: previously it took
  `candidates[candidates.length - 1]` (widest width, but the *worst* format
  rank at that width — avif). Now it picks the widest rendition at the most
  broadly decodable format (candidates are sorted width-asc then format-rank,
  so the first entry at max width is the preferred one).
- `downscaleWidth` remains the fallback path for media without derivatives.

## 2. `FlagshipImage.tsx` — deleted (verified dead code)

- Zero JSX usages; only referenced by its own barrel
  (`components/flagship/index.ts`) and a doc comment in `theme/mediaAssets.ts`.
- Deleted `frontend/src/components/flagship/FlagshipImage.tsx` and removed its
  two export lines from `frontend/src/components/flagship/index.ts`.
- Cascade: `theme/mediaAssets.ts` had exactly one importer — FlagshipImage.
  It was fully orphaned after the deletion (verified via repo-wide grep), so
  it was deleted too rather than left as dead policy code.
- Updated the stale doc references in
  `frontend/src/components/flagship/MEDIA_QA_MATRIX.md` to point at the live
  stack (`CachedImage` + `contracts/listingMedia.ts` + `utils/media.ts`).

## 3. `ui/MediaStage.tsx` — deleted (verified dead code)

- No file imports `MediaStage`, `MediaStageItem`, `MediaStageProps`,
  `MediaStageAspectRatio`, or `MediaStageOverlayControl` — nothing consumes
  the `components/ui` barrel for it (verified, including dynamic
  `require()`/`import()` and the structural-architecture test).
- Deleted `frontend/src/components/ui/MediaStage.tsx` and removed its two
  export lines from `frontend/src/components/ui/index.ts`.
- `CommerceMediaStage` remains the canonical paged media stage; nothing
  changed in its layout or behaviour.

## 4. `PinterestMasonryGrid.tsx` — prefetch cache-key fix

- Bug: `handlePrefetchViewableItemsChanged` prefetched raw URIs from
  `extractFeedUnitImageUri`, but listing tiles render through `CachedImage`
  with `downscaleWidth` + `media[].derivatives` — so the rendered source is a
  sized rendition/CDN-param URL and the warmed cache key was never read.
- Fix: new `resolveTilePrefetchUri` /
  `resolveListingTileSourceUri` helpers
  (`frontend/src/components/discover/PinterestMasonryGrid.tsx:88-135`) mirror
  `ProductDiscoveryTile`'s media resolution — `getListingCoverUri` for the
  cover image, the matching `media[]` record for its derivative ladder — and
  call the shared `resolveCachedImageSourceUri` with the same
  `downscaleWidth` the renderer uses (`colWidth` for single-column units,
  `colWidth * numColumns + gap` for hero/full-width listing units; legacy
  `Listing[]` path always `colWidth`).
- Non-listing units (look / poster / moodboard / editorial) render their URI
  verbatim via `ExpoImage`, so they keep the raw URI — already the correct key.
- Prefetch callback deps updated: `[items, colWidth, numColumns, gap]`.

## 5. `CommerceMediaStage.tsx` — placeholder `contentPosition`

- The video poster placeholder (`VideoPage`, `CommerceMediaStage.tsx:~498-523`)
  now applies `contentPosition` from `item.focalPoint`, so the poster crops the
  same way focal-aware surfaces render it — no focal-crop shift on crossfade.
- Root-cause fix applied one layer down as well: `CachedImage`'s LQIP
  `previewUri` image (`CachedImage.tsx:~415`) now passes
  `contentPosition={contentPosition}` — it previously rendered the preview
  centre-cropped while the full image used the focal crop, which is the
  actual crossfade-shift path for every image caller (MediaPage included).

## 6. `CachedImage.tsx` — video `contentFit` no longer hardcoded

- `resizeMode={ResizeMode.COVER}` → `resizeMode={videoResizeMode}`
  (`CachedImage.tsx:~437`). The media contract's `fit` already reaches
  `CachedImage` via the `contentFit` prop (e.g. `contentFit={item.fit ?? 'cover'}`
  in `MediaPage`), so a new `videoResizeMode` memo maps it to the compat
  `Video` shim's `ResizeMode`: `fill`→STRETCH, `contain`/`none`/`scale-down`
  →CONTAIN, `cover`/default→COVER. Callers that don't declare a fit keep the
  previous COVER behaviour — no visual change.

## Concerns

- **`theme/mediaAssets.ts` deleted** as a cascade of the `FlagshipImage`
  removal (its sole importer). It was verified to have zero remaining
  importers repo-wide, and the QA doc was updated. If the parent prefers to
  keep it as an aspirational policy registry, `git checkout
  frontend/src/theme/mediaAssets.ts` restores it with no compile impact.
- `resolveCachedImageSourceUri` uses `PixelRatio.get()` at call time, so
  prefetched keys on a device where DPR changes mid-session (rare) could
  diverge from rendered keys — same limitation the render path already had.
- Non-listing feed units have no derivative ladder in their contracts, so
  their prefetch still warms full-resolution URIs — unchanged behaviour,
  correct cache key.
- No `coown/` files touched; no navigation/analytics/haptics altered; no
  layout changes anywhere.

## Files changed

- `frontend/src/components/CachedImage.tsx` — shared resolver export, preview `contentPosition`, video `resizeMode` from `fit`
- `frontend/src/components/flagship/FlagshipImage.tsx` — deleted
- `frontend/src/components/flagship/index.ts` — removed dead exports
- `frontend/src/components/flagship/MEDIA_QA_MATRIX.md` — doc references updated to live stack
- `frontend/src/theme/mediaAssets.ts` — deleted (orphaned by FlagshipImage removal)
- `frontend/src/components/ui/MediaStage.tsx` — deleted
- `frontend/src/components/ui/index.ts` — removed dead exports
- `frontend/src/components/discover/PinterestMasonryGrid.tsx` — prefetch resolves rendered cache key
- `frontend/src/components/commerce/CommerceMediaStage.tsx` — video poster `contentPosition`
