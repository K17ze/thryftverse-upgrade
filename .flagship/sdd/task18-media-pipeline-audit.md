# Task 18 — Media Pipeline Audit (P1, large)

**Scope:** `CachedImage`, `FlagshipImage`, `MediaPreview`, `CommerceMediaStage`, `ImageViewer`, `ProductMediaGallery`, `SharedTransitionImage`, `FocalImage`, `imagePreloader` / `useSmartPrefetch`, `UploadManager` / `mediaUploadQueue` / `listingPublication`, `listingMediaGeometry`, `mediaAssets` (frontend) and the server-side `sharpPipeline` / `pipeline` / `ffprobe` / `listings` / `auctions` / `mediaAssets` routes they depend on.

**Reference:** `docs/research/flagship-uiux-upgrade-report-2026-09-11.md` §26 — "Media quality, delivery and visual completion".

**Audit type:** read-only. No files were modified.

---

## Verdict

The pipeline has good bones — a derivative ladder, LQIP, focal-point metadata, network-aware prefetch, resumable multipart upload, honest empty states — but the load-bearing seams are disconnected:

- The server generates responsive derivatives that **no API response ever returns**, so every client surface downloads the full canonical object. `CachedImage.downscaleWidth` only speaks Cloudinary/Imgix/Supabase/CloudFront URL dialects; the real media host (S3/MinIO behind `S3_CDN_BASE_URL`) matches none of them, so the prop is a silent no-op everywhere.
- The server **strips EXIF orientation without applying it**, so any upload path that skips the client-side resize ships rotated pixels.
- The `blurhash` contract is broken in three stacked places: the stored value is a SHA-256 hex (not a decodable BlurHash), the publish path never sends it, and the one adapter that receives it drops it.
- Media metadata (width, height, focal point, poster, kind, blurhash) is preserved on the auction path and **discarded on the direct-listing path** — the most common PDP.

**Total issues: 23** — 3 critical, 8 major, 12 minor.

---

## Critical

### C1 — Derivative ladder exists server-side but is never served; `downscaleWidth` is dead code

| | |
|---|---|
| **What** | `sharpPipeline.generateImageDerivatives` produces JPEG/WebP at [200, 400, 800, 1200, 2000]w + AVIF 800w + a 20px LQIP, uploaded to `derivatives/<assetId>/…` and recorded in `media_derivatives` with a `manifest.json`. No listing/feed/search/detail projection returns derivative URLs — `listings.ts` selects only `image_url, sort_order` (lines 873, 1020, 1258, 3015, 3689, 3830, 4182); `DiscoveryListingSummary`, `BackendListingRow` and `ProductMediaItem` carry no derivative/thumbnail fields. Meanwhile `CachedImage` tries to fake responsive sizing by string-replacing CDN params — but only for `cloudinary.com`, `imgix.net`, `supabase.co/storage`, `cloudfront.net` hosts. The real host is `S3_CDN_BASE_URL` (MinIO `http://10.0.2.2:9000` in dev; an S3-style URL in prod) — no regex matches, so **every tile, rail thumb and 40px gallery thumbnail downloads the full-size object**. Even if the CDN were `*.cloudfront.net`, a bare `?w=` query does nothing without a CloudFront Function — it would only fragment the cache key. |
| **Where** | `frontend/src/components/CachedImage.tsx:189-233`; `backend/api/src/lib/media/sharpPipeline.ts:36-166`; `backend/api/src/lib/media/pipeline.ts:252-311,665-679`; `backend/api/src/routes/mediaAssets.ts:413-446` (derivatives persisted); `frontend/src/contracts/DiscoveryListingSummary.ts` (no derivative fields). |
| **Severity** | **Critical** — this is the report's exact failure ("do not download a full-resolution original for every thumbnail"), and it silently defeats ~30 call sites that pass `downscaleWidth`. It also makes prefetch harmful (see M2). |
| **Fix** | Surface the derivative ladder through API projections (e.g. `media.derivatives[]` or a `srcset`-style array on `DiscoveryListingSummary`/`ProductMediaItem`), add a `resolveDerivative(uri, targetDp)` helper that maps to stored variants, and have `CachedImage` consume it instead of CDN string-munging. Keep `?w=` only as a Cloudinary/Imgix fallback. |

### C2 — EXIF orientation is destroyed server-side; colour profile stripped from evidence photos

| | |
|---|---|
| **What** | `stripImageExif` re-encodes the source through sharp to remove EXIF — but never calls `.rotate()`, so the orientation flag is discarded while the pixels stay unrotated. `generateImageDerivatives` likewise resizes without `.rotate()`. `ffprobe`/`sharp.metadata()` record the *coded* (pre-rotation) width/height into `media_assets`, while the client sends picker dims (post-rotation) to `listing_images` — the two sources of truth can disagree and flip `mediaAspectRatio` portrait↔landscape. The re-encode is `jpeg({quality:95})` with no ICC preservation, so Display-P3 phone photos are recompressed and colour-shifted — a commerce-correctness issue ("preserve natural defects and colour evidence"). The listing sell flow is saved by client-side `resizeForUpload` (expo-image-manipulator applies orientation), but: (a) `mediaUploadQueue.ts:766-771` falls back to the original on resize failure, (b) creator `UploadManager`, `useProfileMediaUpload`, and `remoteImport`/catalog imports send originals straight to the stripping path. |
| **Where** | `backend/api/src/lib/media/sharpPipeline.ts:181-206` (no `.rotate()` before re-encode), `:56-166` (derivatives without rotation); `backend/api/src/lib/media/pipeline.ts:620-632`; `backend/api/src/lib/media/ffprobe.ts:186-187` (coded dims); `frontend/src/services/mediaUploadQueue.ts:743-772` (orientation-normalising resize + silent fallback). |
| **Severity** | **Critical** — wrong-orientation product photos are a correctness defect on every surface that consumes them, not a polish issue. |
| **Fix** | Add `.rotate()` (auto-orient) before both `stripImageExif`'s re-encode and `generateImageDerivatives`'s resizes; record dims from the rotated metadata; preserve ICC via `.keepIccProfile()`/`.withMetadata({ icc })` where feasible. Reconcile client dims (post-orientation) with server probe dims. |

### C3 — The `blurhash` contract is broken end-to-end (fake hash → never sent → dropped anyway)

| | |
|---|---|
| **What** | Three stacked failures. (a) `media_assets.blurhash` is populated by `computeBlurhashPlaceholder` — a SHA-256 hex slice of the LQIP buffer, **not a decodable BlurHash** — feeding it to `expo-image`'s `placeholder={{blurhash}}` cannot render. (b) `listing_images.blurhash` exists in the write schema (`listings.ts:4871`, `listingImages.ts:25`) and `createListingImageOnApi` accepts it, but `listingPublication.ts:274-285` never sends it — `ListingMediaDraftItem`/`UploadedMedia` have no field to carry it, and `finalizePresignedMedia` discards the pipeline's `lqip`/`blurhash` (mediaUpload.ts:410-417 returns only URL/finalizationId). (c) On the read side, `auctions.ts:2494` does project `blurhash` into `mediaItems`, but `buildAuctionViewModel` drops it in the adapter (`productDetailViewModel.ts:476-488` maps 9 fields, no `blurhash`). Net result: no surface ever renders a hash placeholder; everything is shimmer-on-`surfaceAlt`. |
| **Where** | `backend/api/src/lib/media/sharpPipeline.ts:149-154,213-216`; `frontend/src/services/listingPublication.ts:274-285`; `frontend/src/services/mediaUpload.ts:374-418`; `frontend/src/utils/mediaUploadAsset.ts:238-264`; `frontend/src/platform/product/productDetailViewModel.ts:476-488`. |
| **Severity** | **Critical** — "placeholder derived from the asset" is a named requirement; today it is unmet everywhere, and wiring it naively would break because the stored value isn't a BlurHash. |
| **Fix** | Emit a real BlurHash (or ThumbHash) at processing time — or repurpose the field honestly (store the LQIP data-URI and render it as `previewUri`). Then plumb it through: `media_assets → finalize receipt → ListingMediaDraftItem → createListingImageOnApi → listing_images → all read projections → adapters → CachedImage`. |

---

## Major

### M1 — Direct-listing media metadata is discarded in projection; media kind guessed by URL substring

| | |
|---|---|
| **What** | `listing_images` stores `media_type`, `poster_url`, `blurhash`, `focal_x/y`, `media_width/height`, but every list/detail query selects only `image_url, sort_order` (+ first-image geometry). `BackendListingRow.images` is `string[]`; `collectMedia` (listingMapper.ts:120-133) flattens to URIs; `mediaFromUris` (productDetailViewModel.ts:246-254) guesses `kind` via extension regex + `uri.includes('video')` — a substring match that false-positives on any path containing "video". The auction path proves the richer contract exists and works; the direct path (most listings) gets none of it. `CommerceMediaStage`'s own docblock says "media kind is never guessed from a URL" — the direct adapter does exactly that. |
| **Where** | `backend/api/src/routes/listings.ts:873,1020,1258,3015,3689,3830,4182` vs `auctions.ts:2455-2500`; `frontend/src/services/listingMapper.ts:120-133`; `frontend/src/platform/product/productDetailViewModel.ts:246-254,403,582`. |
| **Severity** | **Major** — PDP hero geometry, posters, focal crops and honest video badges are all missing for the dominant listing family. |
| **Fix** | Extend the `listing_images` selects to return the full media row (or a `media[]` array), widen `BackendListingRow`/`Listing` to carry per-item media objects, and replace `mediaFromUris` with a real mapper. Keep `mediaFromUris` only for genuinely untyped callers. |

### M2 — Prefetch warms a different cache key than the displayed URL

| | |
|---|---|
| **What** | `preloadCriticalImages`, `useSmartPrefetch`, and the adjacent-item prefetch in `CommerceMediaStage`/`MediaStage`/`LookMediaCarousel` all call `Image.prefetch(rawUri)`. `CachedImage` renders `sourceUri` — the raw URI with CDN resize params appended when `downscaleWidth` is set. Different URL → different cache entry → the prefetch is useless *and* the displayed derivative is fetched separately. Because C1 makes `sourceUri === uri` today, the bug is latent — but the moment derivatives are real, every prefetch call site double-downloads. Even today, prefetching pulls full-res originals for grid tiles on Wi-Fi. |
| **Where** | `frontend/src/utils/imagePreloader.ts:86-121`; `frontend/src/hooks/useSmartPrefetch.ts:87-99`; `frontend/src/components/commerce/CommerceMediaStage.tsx:833-846`; `frontend/src/components/ui/MediaStage.tsx:594-596`; `frontend/src/components/look/LookMediaCarousel.tsx:794`; `frontend/src/components/discover/PinterestMasonryGrid.tsx:280-286`; `frontend/src/screens/HomeScreen.tsx:602`. |
| **Severity** | **Major** — wasted bandwidth now, actively broken prefetch after C1 is fixed. |
| **Fix** | Centralise URL resolution: expose `resolveDisplayUri(uri, dp)` used by both `CachedImage` and every prefetch call site, so prefetched and rendered cache keys are identical. |

### M3 — Placeholder/preview geometry diverges from final image under focal points

| | |
|---|---|
| **What** | The report warns that placeholder fit can differ from image fit. `CachedImage` applies `contentPosition` to the final `ExpoImage` (line 363) but not to the `previewUri` placeholder (lines 317-330); `FlagshipImage` does the same for its blurhash placeholder (lines 269-275 vs 294-295). On focal-point crops the placeholder shows the centre crop, then visibly shifts to the focal crop on crossfade — the "delayed decode shifts the image" symptom. |
| **Where** | `frontend/src/components/CachedImage.tsx:317-330` vs `:363`; `frontend/src/components/flagship/FlagshipImage.tsx:269-275` vs `:295`. |
| **Severity** | **Major** — focal points are applied in `CommerceMediaStage` (category defaults) and on auction items, so the shift is user-visible on real surfaces. |
| **Fix** | Pass `contentPosition` to placeholder/preview `ExpoImage`s wherever the final image has one. |

### M4 — Video `contentFit` is silently ignored in `CachedImage`/`MediaPreview`

| | |
|---|---|
| **What** | `CachedImage.tsx:340` hardcodes `resizeMode={ResizeMode.COVER}` for video sources regardless of the `contentFit` prop. `MediaPreview` forwards `contentFit` and documents it as meaningful; for a video URI it does nothing. `CommerceMediaStage`'s `VideoPage` honours `item.fit` (contain vs cover), so a video can letterbox on PDP but crop in a card that asked for `contain`. |
| **Where** | `frontend/src/components/CachedImage.tsx:336-349`; `frontend/src/components/MediaPreview.tsx:92`; `frontend/src/components/commerce/CommerceMediaStage.tsx:490`. |
| **Severity** | **Major** — an explicit prop that is silently dropped is a contract lie; evidence/contain surfaces would crop video content. |
| **Fix** | Map `contentFit` to `ResizeMode` for the video path (same switch already used for `nativeResizeMode`). |

### M5 — Downscale caps contradict zoom depth on PDP and fullscreen viewer

| | |
|---|---|
| **What** | `CommerceMediaStage` `MediaPage` passes `downscaleWidth={width}` (screen dp → ~1440px bucket at 3×) while pinch zoom goes to 4× — needs ~4× that resolution to stay sharp. `FullscreenMediaViewer` passes `downscaleWidth={Math.round(width*2)}` against a 3–4× zoom target. The component docs even say "leave undefined for detail/gallery surfaces that need full resolution" — the PDP passes it anyway. |
| **Where** | `frontend/src/components/commerce/CommerceMediaStage.tsx:239,252`; `frontend/src/components/product/FullscreenMediaViewer.tsx:199`. |
| **Severity** | **Major (latent)** — invisible while C1 makes downscale a no-op; becomes visible softness on zoom the moment derivatives actually resolve. |
| **Fix** | Either drop `downscaleWidth` on zoomable surfaces, or escalate the request when `isZoomed` (fetch a 2048/2560 variant on first pinch). |

### M6 — `FlagshipImage` is dead code; the real pipeline lacks its guarantees

| | |
|---|---|
| **What** | `FlagshipImage` implements the category-aware ratio/focal policy, retry, corrupt-media state, and sensitive-media blur — and is imported by **no screen** (only the flagship barrel, docs, and `DesignReviewScreen`). `CachedImage` — the component in ~193 files — has no retry, no content-warning path, and no category system. Two parallel media systems exist; the better one ships nowhere. `components/ui/MediaStage.tsx` is likewise an unimported duplicate of `CommerceMediaStage`. |
| **Where** | `frontend/src/components/flagship/FlagshipImage.tsx`; `frontend/src/components/flagship/index.ts`; `frontend/src/components/ui/MediaStage.tsx`. |
| **Severity** | **Major** — duplicated primitives are an anti-AI tell and a maintenance hazard; retry/corrupt/content-warning coverage exists but is unreachable. |
| **Fix** | Converge on one component: either fold FlagshipImage's state machine into `CachedImage` or adopt `FlagshipImage` behind `MediaPreview`. Delete the unused `ui/MediaStage`. |

### M7 — `listingMediaGeometry` collapses extreme aspect ratios into a portrait frame

| | |
|---|---|
| **What** | `normalizeAspectRatio` bounds ratios to [0.55, 1.8]; anything outside — a 3:1 panorama, an extreme tall crop — returns `null` and falls back to `DEFAULT_LISTING_MEDIA_ASPECT_RATIO` (3:4 portrait). A wide panorama gets a **portrait** tile with blind `cover` crop — worse than letterboxing, and the opposite of "truthful" geometry. There is no contain/letterbox path for discovery tiles. |
| **Where** | `frontend/src/utils/listingMediaGeometry.ts:14-27,45-67`; `frontend/src/theme/designTokens.ts:501-507` (portrait = 3/4 while `mediaAssets.product` = 4/5 — two different canonical portrait ratios). |
| **Severity** | **Major** — the report calls out extreme panoramas for separate review; the current behaviour renders them badly and misleadingly. |
| **Fix** | For out-of-range ratios, keep the real ratio with `contain` (letterbox on a neutral matte) or clamp the frame while preserving fit metadata — never silently reframe a panorama as portrait. Also reconcile the 3:4 vs 4:5 token split. |

### M8 — Parallel legacy viewers bypass the pipeline entirely

| | |
|---|---|
| **What** | `ImageViewer` (used by `ListingMediaHero` and `ListingPreviewScreen` — the sell-flow preview) renders raw RN `Image` via `SharedTransitionImage`: no cache policy, no blurhash/preview, no error or empty state (empty `images` renders a blank fixed-height area), and `useNativeControls` video chrome — exactly what `MediaPreview` was built to avoid. `ProductMediaGallery` hero pages use the same `SharedTransitionImage` (no `recyclingKey`, no cache control) plus native video controls; it appears unexported to screens but remains in `product/index.ts`. |
| **Where** | `frontend/src/components/ImageViewer.tsx:145-170`; `frontend/src/components/SharedTransitionImage.tsx` (thin `Reanimated.Image` wrapper); `frontend/src/components/product/ProductMediaGallery.tsx:158-184`; `frontend/src/components/listing/ListingMediaHero.tsx:76`; `frontend/src/screens/ListingPreviewScreen.tsx`. |
| **Severity** | **Major** — a shipping sell-preview surface sits outside every guarantee the pipeline provides (placeholder, missing-media honesty, recycled identity). |
| **Fix** | Route `ListingMediaHero`/`ListingPreviewScreen` through `CachedImage`/`MediaPreview` (with `sharedTransitionTag` for the hero handoff); retire `ImageViewer`, `SharedTransitionImage` and `ProductMediaGallery`. |

---

## Minor

| # | Issue | Where | Fix |
|---|-------|-------|-----|
| m1 | Metered detection is CELLULAR-only; iOS Low Data Mode on Wi-Fi / Android Data Saver are invisible to `expo-network`, so non-critical prefetch still runs on constrained Wi-Fi. | `utils/imagePreloader.ts:56-63`; `hooks/useMeteredConnection.ts:42-44` | Document as a known limit; consider a user-visible Data Saver toggle that forces `networkAwarenessEnabled` semantics. |
| m2 | `CachedImage` has no retry — a failed tile stays in `ImageEmptyGraphic` state until remount. `FlagshipImage` has retry but is unused (M6). | `CachedImage.tsx:260-266,297-302` | Add a retry affordance (or at least remount-on-visibility-change) to `CachedImage`. |
| m3 | `content://` sources bypass `expo-image` entirely (`useNativeImage`), losing blurhash, `recyclingKey`, `enforceEarlyResizing` and the fade — inconsistent placeholder identity on local-asset surfaces. | `CachedImage.tsx:171,350-357` | Acceptable today; note that local previews lose placeholder parity. |
| m4 | `FocalImage` calls `ExpoImage.loadAsync(uri)` to learn natural size — a second fetch of the full asset just for dimensions, then renders it again; no `downscaleWidth`. | `components/media/FocalImage.tsx:96-109` | Use `onLoad` source dims from the rendered image instead of a pre-fetch. |
| m5 | `resolveFileSize` docstring says it "returns 1" when size is undeterminable — the code throws instead. Stale doc. | `creator/core/upload/UploadManager.ts:844-874` | Fix the docstring. |
| m6 | `checkStalledJobs` emits `jobFailed` for a non-terminal `stalled` state — subscribers may label a recoverable stall as a failure. | `UploadManager.ts:940-960` | Emit a dedicated `jobStalled` event. |
| m7 | `MediaPreview` documents `downscaleWidth` as "pixels"; `CachedImage` requires logical dp and multiplies by `PixelRatio` internally. A caller reading the MediaPreview doc could double-apply DPR. | `MediaPreview.tsx:36-41` vs `CachedImage.tsx:59-76` | Align docstrings; all current call sites pass dp. |
| m8 | `FlagshipImage`: `revealed` isn't reset if `contentWarning` changes post-mount; `aspectRatio` override is unclamped (no min/max like `listingMediaGeometry`). | `FlagshipImage.tsx:142,133` | Reset `revealed` on `contentWarning` change; clamp override ratio. |
| m9 | `CommerceMediaStage` `heroHeight` derives from `mediaItems[0]` only — mixed-orientation galleries force later pages into the first image's frame; a landscape photo in a portrait-authored listing crops heavily. | `CommerceMediaStage.tsx:848-858` | Per-page height is expensive; at minimum keep `item.fit='contain'` for mismatched aspects instead of focal-cropping them. |
| m10 | White-on-white / dark-garment legibility: media containers have no hairline edge treatment — a white garment on `colors.surfaceAlt` (light) or a black garment on dark `surfaceAlt` merges into the canvas; the empty/loading state and the loaded image share the same backdrop, so the moment of reveal can be invisible. | `CachedImage.tsx:289,307` (`backgroundColor: colors.surface/surfaceAlt`, no border) | A hairline `colors.borderSubtle` stroke on media frames, or a neutral matte for `contain` content. |
| m11 | `previewUri`/poster images are fetched at full resolution — posters are typically full-size frame grabs; no `downscaleWidth` is applied to the preview layer. | `CachedImage.tsx:317-330` | Apply the same derivative resolution to `previewUri`. |
| m12 | Double crossfade: expo-image `transition` and the manual `imageOpacity` wrapper both fade on load — harmless but duplicated motion logic. | `CachedImage.tsx:251-258,364` | Keep one fade source (prefer the shared-value wrapper for reduced-motion control). |

---

## What is already correct (do not regress)

- **Recycled identity reset** — `CachedImage` resets `loaded`/`failed`/`imageOpacity`/`previewOpacity` on `uri`/`previewUri` change (`CachedImage.tsx:131-136`) and sets `recyclingKey={sourceUri}` on expo-image (`:370`); `FlagshipImage` uses `key` + `recyclingKey` with a retry token (`:291-299`). Old-listing flash on recycled tiles is handled.
- **Honest missing media** — `!uri` and failed loads render `ImageEmptyGraphic` (gradient + icon + label), not a grey box; `CommerceMediaStage` shows "No photos yet" / "Photo unavailable" + retry. Restrained and truthful.
- **Real file size + real byte progress on upload** — `resolveFileSize` throws rather than fabricating; `xhrPutFile` reports actual bytes; multipart is genuinely resumable (ETag parts survive restarts); idempotent `queueUpload`; connectivity gate requeues instead of failing; stall detection exists.
- **Network-aware prefetch gating** — non-critical prefetch skips on cellular (`imagePreloader`, `useSmartPrefetch`); adjacent-page prefetch in `CommerceMediaStage` fetches posters not whole videos.
- **Focal-point infrastructure** — `getCategoryFocalPoint` (category-sensitive crops), `FocalImage` (draft preview honours crop-sheet focal math), `contentPosition` wiring, auction focal metadata end-to-end.
- **Memory budget levers** — `enforceEarlyResizing` + `allowDownscaling` on the main decode path; `memory-disk` cache policy throughout.
- **Video lifecycle** — `MediaPreview`/`CachedImage` never autoplay (`shouldPlay` default false), videos pause when offscreen/backgrounded in `VideoPage`/`FullscreenVideoPage`, poster frame shown until first playing event.

---

## Top 3 issues

1. **C1 — Derivatives generated but never served; `downscaleWidth` is dead code against the real S3/MinIO host.** Every thumbnail everywhere pulls the full object. The fix is contract-level: project `media_derivatives` and consume them.
2. **C2 — EXIF orientation stripped without rotation; ICC dropped.** Any non-resized upload path (creator, catalog import, resize-fallback) ships rotated, colour-shifted pixels and swapped dims.
3. **C3 — `blurhash` is a SHA-256 fingerprint, never sent by the publisher, and dropped by the only adapter that could receive it.** No surface can ever render a real hash placeholder.

## Recommended next action

Fix the **contract seam** before touching any component: add a `media[]` projection (uri, kind, width, height, focal, poster, blurhash-or-lqip, `derivatives[]`) to `listing_images` reads and `DiscoveryListingSummary`/`ProductMediaItem`, add `.rotate()` + ICC preservation to `sharpPipeline`, and emit a real BlurHash at processing time. Only then adjust `CachedImage` to consume `derivatives[]` (shared `resolveDisplayUri` used by prefetch too) and align placeholder `contentPosition`. Component-level fixes (M3–M8) are cheap once the data actually reaches them.

---

*Audit performed against the working tree; findings cite file:line at time of writing. No files modified.*
