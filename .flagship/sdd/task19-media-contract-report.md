# Task 19 — Media Pipeline → API Contract → Frontend Seam

**Status: DONE_WITH_CONCERNS**

The seam between backend `listing_images` records and frontend media consumers is
repaired end-to-end. Uploaded media is now orientation-correct, colour-managed,
placeholder-capable (real decodable BlurHash + LQIP), and exposed through a
canonical `media[]` contract that carries the derivative ladder. All legacy
`imageUrl` / `images` fields are preserved. No screen layout, navigation,
analytics, haptics, or `frontend/src/components/coown/` files were touched.

---

## 1. What was broken (audit findings)

| # | Defect | Root cause |
|---|--------|------------|
| 1 | Derivatives generated but never served | Listing reads selected only `image_url, sort_order`; `CachedImage.downscaleWidth` only rewrote a few CDN URL shapes |
| 2 | Wrong orientation / dimensions | `stripImageExif` re-encoded without `.rotate()`; dims measured pre-orientation |
| 3 | Colour shifts | JPEG re-encode dropped ICC profiles |
| 4 | Invalid placeholders | `sharpPipeline.ts` stored a SHA-256 hex string in `blurhash`; `listingPublication.ts` and `buildAuctionViewModel` dropped the field |

## 2. Canonical media contract

`backend/api/src/lib/media/listingMediaProjection.ts` — new shared helper
`loadListingMedia(db, listingIds)` (line 185) and `listingImageUrls` (line 279).
Each record emits:

```ts
{
  id, uri, url,                 // uri = canonical delivery URL; url = compat alias
  kind,                         // 'image' | 'video' | ...
  sortOrder,
  width, height,
  focalPoint: { x, y } | null,
  poster, posterVerifiedAt,     // video poster + verification timestamp
  blurhash,                     // real decodable BlurHash; legacy 32-char hex
                                //   SHA-256 placeholders are filtered to null
  lqip,                         // 20px blurred-JPEG data URI from media_assets.metadata
  derivatives: [{ url, width, height, format, variant }],
}
```

- Derivatives resolved via `media_bindings → media_assets → media_derivatives`
  with canonical-URL fallback for pre-lifecycle attachments.
- Missing lifecycle tables are caught → falls back to flat `listing_images` query.
- Empty input short-circuits without a query.

## 3. Backend changes

### `lib/media/sharpPipeline.ts`
- `.rotate()` applied before all processing (lines ~90, 170, 226) — EXIF
  orientation baked into pixels; dimensions measured post-rotation.
- ICC profile preserved through re-encode (`withMetadata`-safe path; pipeline
  keeps profile data rather than stripping it wholesale).
- Real BlurHash encoder implemented (`encodeBlurHash`, line 308; sRGB → linear,
  DC/AC DCT encoding, base-83). Replaces the SHA-256 pseudo-hash.

### `lib/media/pipeline.ts`
- Upload path now uses corrected orientation/dims; asset rows persist real
  blurhash + post-orientation geometry.

### Read-site coverage (`loadListingMedia` call sites)

| File | Lines | Surface |
|------|-------|---------|
| `index.ts` | 15572, 16109, 16599, 16728, 17075, 17491 | `/listings` list, detail, related, recommendations, continue-exploring, `/users/:id/listings` |
| `index.ts` | 33621 | auction detail `mediaItems` |
| `routes/feed.ts` | 233, 411, 612 | `/feed/home`, `/feed/trending`, `/feed/discover` |
| `routes/visualSearch.ts` | 436 | visual-search candidates |
| `routes/searchExtended.ts` | 178, 266 | extended FTS + ILIKE fallback (newly wired) |
| `routes/listings.ts` (dead mirror) | 301, 890, 1031, 1263, 3012, 3679, 3814, 4161, 4750 | mirrored for parity |

All sites keep emitting `imageUrl` + `images[]` alongside `media[]`.

### Attachment backfill (`POST /listing-images`)
- `index.ts` ~17599–17697, `routes/listingImages.ts` ~24–176,
  `routes/listings.ts` ~4824–4965:
  when the payload omits `blurhash`/`mediaWidth`/`mediaHeight`/focal data, the
  route backfills from the verified `media_assets` row
  (`payload.blurhash ?? verifiedUpload.asset_blurhash ?? null`, etc.).
  `media_bindings` creation for published assets is retained. Zod schemas accept
  `blurhash` (≤200 chars) and `posterUrl`.

### Intentionally left thin (documented, not a gap)
`routes/moodboards.ts`, `routes/recommendations.ts`, `routes/storefronts.ts`,
`routes/sellers.ts`, `routes/sellerHub.ts`, `routes/galleria.ts` emit scalar
`imageUrl`/`coverImageUrl` on non-card payloads (analytics rows, review refs,
featured strips, decision-service scoring). None read `listing_images`; none
ever emitted `images[]`. They can opt into `loadListingMedia` later — the
helper is additive.

## 4. Frontend changes

| File | Change |
|------|--------|
| `contracts/listingMedia.ts` (new) | `ListingMediaRecord`, derivative/focal types |
| `services/listingsApi.ts` | `Listing`/`ListingApiItem` gain `media?: ListingMediaRecord[]` |
| `services/marketApi.ts` | `AuctionMediaItem` gains `id/blurhash/focalX/focalY/posterUrl/order/dims` |
| `services/listingMapper.ts` | maps `media[]` → domain records; falls back to `images`/`imageUrl` |
| `contracts/DiscoveryListingSummary.ts`, `contracts/discoveryFeedUnit.ts`, `domain/listing.ts` | `media` field added |
| `platform/product/productDetailViewModel.ts` | `mediaFromRecords` (line ~270) prefers `media[]`; blurhash/LQIP/derivatives flow into `ProductMediaItem`; `fit` left undefined unless focalPoint exists → `CommerceMediaStage` keeps its `'cover'` default (no visual change); `buildAuctionViewModel` passes `blurhash` (line ~535) |
| `utils/auctionDetailLogic.ts` | blurhash preserved through auction detail mapping (line ~1274) |
| `services/listingPublication.ts` | blurhash/dims passthrough at lines ~104–106, ~290; processor-measured dims preferred over client-declared |
| `hooks/sell/useListingPublishPipeline.ts`, `services/mediaUpload.ts`, `services/mediaUploadQueue.ts`, `utils/mediaUploadAsset.ts` | carry blurhash/focal/dims/finalizationId through the upload → publish chain |
| `components/ProductCard.tsx` | `downscaleWidth` now reaches `CachedImage` on both card paths (lines ~204, ~337, ~685) — small tiles no longer pull originals where CDN transform applies |
| `components/commerce/CommerceMediaStage.tsx` | blurhash + derivatives forwarded to `CachedImage`; LQIP used as `previewUri` only when no blurhash; video poster kept |
| `components/CachedImage.tsx` | consumes blurhash/previewUri/focal/downscaleWidth (already supported; prop wiring completed) |
| `screens/EditListingScreen.tsx` | remote media IDs, kind, ordering/removal manifests preserved; videos not silently classed as images |
| `__tests__/product01UnifiedDetailContract.test.ts` | updated for canonical-media path (44 tests) |

## 5. Verification

| Check | Result |
|-------|--------|
| Backend `tsc --noEmit` | **0 errors** |
| Frontend `tsc --noEmit` | **1 error, unrelated** — `SearchScreen.tsx(194,30)` references `TypographyV2.labelStrong`, a role that does not exist. This file is modified by parallel in-flight work (trending-searches feature); not touched by this task. All media-contract files compile clean. |
| `mediaContract.test.ts` (new, focused) | **8/8 pass** — real BlurHash format/decodability, orientation, projection shape, legacy-hex filtering |
| Backend suite (6 configured files, 121 tests) | 114 pass / **7 fail, all unrelated**: 2× `safeRemoteMediaFetch` IPv6 cases (`::1`, `fe80::1` — real-network/env dependent, pre-existing), 5× `vectorSearchIntegration` embedder-readiness cases (needs live settings endpoint; env-dependent). `visualSearchRoute`, `compositionRenderer`, `creatorPublicationRender`, `mediaContract` all green. |
| Frontend focused suite | **134 pass / 0 fail** — `product01UnifiedDetailContract` (44), `commerceDetailFamilyArtDirection` (31), `auctionDetailFlagshipClosure` (25), `backendContractsFlagshipClosure` (17), `backendListingMapperRuntime` (17) |

## 6. Concerns

1. **Pre-existing test failures (documented, not fixed):** 2 IPv6 SSRF cases and
   5 embedder-readiness cases fail without the expected environment. Neither
   touches the media pipeline; fixing them is out of scope.
2. **Parallel working-tree changes:** `SearchScreen.tsx`, `feedApi.ts`,
   `searchCache.ts`, `SearchAutocomplete.tsx`, `FilterScreen.tsx`,
   `PulseTab.tsx`, `UnifiedDiscoveryScreen.tsx`, `mediaUploadQueue.ts` (partial)
   carry in-flight trending-searches/discovery work plus the
   `TypographyV2.labelStrong` compile error above. Left untouched.
3. **Thin-payload surfaces** (storefront featured, seller analytics, moodboards,
   recommendation scoring) still emit scalar `imageUrl` only — intentional;
   `media[]` is opt-in via the shared helper.
4. **`CachedImage.downscaleWidth` URL transforms** cover Cloudinary, Imgix,
   Supabase Storage, and the CloudFront query convention. Origins outside those
   providers still receive full-size URLs for non-`media[]` paths; consumers on
   `media[].derivatives` get the real ladder regardless of provider.
5. **Legacy blurhash data:** rows written by the old SHA-256 path have their
   pseudo-hash filtered to `null` at the projection seam (honest "no
   placeholder" instead of an undecodable string). Re-processing or re-upload
   backfills real values.
6. **Git state:** several backend files (`index.ts`, `feed.ts`,
   `visualSearch.ts`, `listingImages.ts`, `listingMediaProjection.ts`) were
   already swept into commit `bd34987d` during the session; the remainder of the
   diff is uncommitted working-tree change.

## 7. Changed files (this task)

**Backend:** `lib/media/sharpPipeline.ts`, `lib/media/pipeline.ts`,
`lib/media/listingMediaProjection.ts` (new), `index.ts`, `routes/feed.ts`,
`routes/visualSearch.ts`, `routes/searchExtended.ts`, `routes/listings.ts`,
`routes/listingImages.ts`, `vitest.config.ts` (added `mediaContract.test.ts`),
`__tests__/mediaContract.test.ts` (new).

**Frontend:** `contracts/listingMedia.ts` (new),
`contracts/DiscoveryListingSummary.ts`, `contracts/discoveryFeedUnit.ts`,
`domain/listing.ts`, `services/listingsApi.ts`, `services/marketApi.ts`,
`services/listingMapper.ts`, `services/listingPublication.ts`,
`services/mediaUpload.ts`, `utils/mediaUploadAsset.ts`,
`utils/auctionDetailLogic.ts`,
`platform/product/productDetailViewModel.ts`,
`hooks/sell/useListingPublishPipeline.ts`, `components/CachedImage.tsx`,
`components/ProductCard.tsx`, `components/commerce/CommerceMediaStage.tsx`,
`screens/EditListingScreen.tsx`,
`__tests__/product01UnifiedDetailContract.test.ts`.
