# Task 2A Report — Focal-point-aware previews (FocalImage)

Status: DONE
Branch: feat/product-detail-contract-media-device-closure (HEAD 03153b2 at start; not committed)

## What shipped

| File | Change |
|---|---|
| `frontend/src/components/media/FocalImage.tsx` | NEW — cover-fit primitive that pans the image so a normalized focal point survives the crop |
| `frontend/src/components/listing/ListingMediaStudio.tsx` | Cover + thumb `ExpoImage` → `FocalImage` (net-neutral); `onTransformItem` extended additively with `focalPoint?`; crop sheet wired with `focalPoint` + `onFocalPointChange`; removed now-unused `expo-image` import |
| `frontend/src/components/SortablePhotoStrip.tsx` | Additive optional `focalPoints?: Record<string, {x,y}>` prop; default (non-`renderItem`) image path → `FocalImage`; removed unused `expo-image` import |
| `frontend/src/utils/mediaUploadAsset.ts` | Additive `focalPoint?: { x: number; y: number }` on `ListingMediaDraftItem` |
| `frontend/src/screens/SellScreen.tsx` | Handler-signature touch only: captures the 3rd contract arg and stores it on the draft item (see "Host storage" below) |
| `frontend/src/screens/EditListingScreen.tsx` | Handler-signature touch only: `handleTransformItem` accepts + stores `focalPoint`, and only resets upload state when the URI actually changed |

Not touched: `CreatorCropSheet.tsx` (parallel task), `mediaTransforms.ts`, services, hooks, UploadManager.

## FocalImage design

- Container measured via `onLayout`; natural size via `ExpoImage.loadAsync(uri)` (expo-image-idiomatic; `ImageRef.width/height`). `loadAsync` shares expo-image's loader cache, so no double decode for URIs already rendered.
- Cover scale = `max(cw/iw, ch/ih)`; image rendered absolutely at scaled size, centered via `left/top`, panned via `transform: [{translateX}, {translateY}]` — identical math to the Skia path in `CreatorCanvas.tsx` (~1658-1669): `translate = (0.5 - focal) * overflow`.
- Memoized by `[containerSize, naturalSize, focalPoint]` (`naturalSize` is uri-derived); component wrapped in `React.memo` so upload-progress ticks in the studio don't re-render images.
- No re-render loops: `onLayout` and the size effect bail out on identical values; stale `loadAsync` results discarded via a cancelled flag.
- Until the natural size resolves (or if it fails), it renders centered `contentFit="cover"` — i.e. exactly today's rendering, no placeholders, no loading chrome.
- Videos untouched (Video element kept in studio cover + strip; poster-frame focal is Wave 2C).

## Verification reasoning (brief §Verification.2)

Let `scale = max(cw/iw, ch/ih)`, `scaledW = iw·scale`, `overflowX = scaledW − cw ≥ 0` (≥ 0 by construction of cover), same for Y. Centered placement puts the image's left edge at `−overflowX/2`; the focal translate is applied on top.

1. **focal (0.5, 0.5) === current cover.** `translate = (0.5−0.5)·overflow = 0` → image centered at exact cover scale → identical crop region and pixel output to `contentFit="cover"` (same decoded bitmap, same scale, same centering; only fp-level sub-pixel differences from computing `iw·scale`).
2. **focal (0, 0) anchors top-left.** `translateX = +overflowX/2`, `translateY = +overflowY/2` → left edge lands at `−overflowX/2 + overflowX/2 = 0`, top at `0` → the image's top-left corner is pinned to the container's top-left; all overflow crops off the right/bottom.
3. **focal (1, 1) anchors bottom-right.** `translate = −overflow/2` on both axes → left edge at `−overflowX`, so the right edge lands exactly at `cw` (bottom at `ch`) → bottom-right pinned; overflow crops off the left/top.
4. **No gaps at any aspect ratio.** For `focal ∈ [0,1]`, `translate ∈ [−overflow/2, +overflow/2]`, which is precisely the range where the image's left edge stays within `[−overflowX, 0]` — the image always covers the container. Defensive clamps: focal is clamped to `[0,1]` (`clamp01`, non-finite → center) and the translate is clamped to `±overflow/2` (`clampTranslate`, non-finite → 0), so out-of-range/NaN focal data can never open a gap. Degenerate inputs (zero container or natural dimension) fall back to plain centered cover.

## Focal threading through the host contract

- Contract extended additively: `onTransformItem?(itemId, transformedUri, focalPoint?)`. Existing 2-arg host handlers remain type-compatible.
- **Focal-only updates** (crop sheet's `onFocalPointChange`) are persisted through the same contract by passing the item's **current local `uri`** as `transformedUri` — a deliberate no-op for the URI so hosts never re-queue an upload for a focal tap. (Passing `getDisplayUri` would have been wrong: for uploaded items that is the remote `publicUrl`, which would overwrite the local `uri` and break the `file://`/`content://` edit guard.)
- **Crop completion** carries `coverItem.focalPoint` as the third argument, so a focal set (or re-normalized) earlier in the same sheet session rides along with the new URI.

### Host storage

- **EditListingScreen** (owns `mediaItems` directly): handler now takes the third arg and stores it on the draft item. It also gained a uri-change guard: upload state (`publicUrl`/`status: 'draft'`) is only reset when `transformedUri !== m.uri`, so focal-only taps no longer mark an uploaded item as needing re-upload. Real crops always produce a new `manipulateAsync` URI, so existing crop behavior is unchanged.
- **SellScreen** (handler lives in `useSellScreenActions`, a hooks file outside this task's scope, typed `(itemId, transformedUri)`): per the brief's fallback ("store focal on the draft item inside ListingMediaStudio's parent via the existing handler"), the screen destructures `setMediaDraftItems` from the data hook and wraps the handler — `handleTransformItemWithFocal` calls the hook handler for the URI swap (preserving its `photos` sync) and stores `focalPoint` on the draft item. No other SellScreen changes. Note: the Sell flow's hook handler still resets `status`/`publicUrl` on the same-URI focal call; this is harmless there because uploads run at publish time (no eager queue to re-trigger).

### Focal survival across crop/rotate — verification result

`CreatorCropSheet` keeps `focalPoint` as a controlled prop and emits normalized display-space coordinates (`locationX/displayW`, `locationY/displayH`; its preview frame matches the image aspect exactly, so display-normalized === image-normalized). **However, the sheet does NOT re-normalize the focal point when a crop completes** — `handleCrop` emits only `(uri, width, height)` and never touches focal. So a focal set on the pre-crop image is stored against the post-crop image and can point at the wrong region (it stays a valid 0-1 point, so the preview never breaks — it just may not match user intent).

Re-normalization requires the sheet's `cropRect` + rotation/flip state, i.e. it belongs inside `CreatorCropSheet` (compute `newFocal = ((focal·oldSize − cropOrigin − rotation/flip mapping) / cropSize)` and emit via `onFocalPointChange` before/with `onCropComplete`). That file is owned by the parallel task, so this was **not** attempted here. The wiring in this task is compatible with that fix: because `handleFocalChange` persists every emitted point and `handleCropComplete` forwards the item's current focal, a sheet-side re-normalization will flow through with zero further changes. Until then: focal set without cropping persists correctly; focal set and then cropped in one session can land off-target (user can re-tap focal; documented as a known gap for the sheet owner).

## SortablePhotoStrip extension choice

Chose **`focalPoints?: Record<string, {x, y}>` keyed by itemId** over a parallel array: the strip already carries `itemIds`, a Record is index-shift-proof during drag reorder, and lookup at the `SortableItem` boundary is one expression (`focalPoints?.[ids[index] ?? photo]`). Consumers without focal data are unaffected (default center). Note: the strip's default image path is currently only reachable when `renderItem` is not provided (ListingMediaStudio always provides it); the swap keeps the default path focal-capable for future callers. The previous `enforceEarlyResizing` hint on that path is not exposed by `FocalImage`'s API — no live consumer regresses.

## Verification results

1. `npm run typecheck` — **pass (exit 0)**. One transient error in `CreatorCropSheet.tsx` (`SimultaneousGesture.enabled`) appeared mid-run — concurrent task's file; gone on retry after ~60s.
2. Scoped eslint on all 6 touched files — **0 errors**. 212 warnings, all pre-existing repo-wide classes (`i18next/no-literal-string`, `react-native-a11y/has-accessibility-hint`, `max-lines`, unused-var warnings in untouched lines). FocalImage's 3 warnings are the same literal-string/a11y-hint classes the replaced `ExpoImage` call sites already carried; a new unused-`useMemo` import warning was caught and fixed during the run.
3. `npm test` (vitest) — **7 failed | 1729 passed | 2 skipped (84 files)** — exactly the stated baseline. Failures are pre-existing and unrelated: `groupChatInfoUpgrade` source-copy assertions (favourites copy) and `pricingDisplayModes` inline snapshot (currency rounding copy). Nothing touches media/listing surfaces.

## Known limitations / handoff notes

- Focal re-normalization after crop is a `CreatorCropSheet` responsibility (parallel task) — see above; this task's contract wiring already supports it.
- Focal point is presentation-only for now: it lives on `ListingMediaDraftItem` and is not sent to the backend with the upload (no service/queue changes allowed here). If the listing detail/gallery surfaces should honor focal on remote items, the field needs to ride along in the media attach contract (Wave 2 scope).
- `FocalImage` renders centered cover for one frame before `loadAsync` resolves; for non-center focals there is a single-frame settle. Chosen over blank-flash alternatives; center-focal (the default) is pixel-identical from frame one.

---

# Fix Round 2 — adversarial review findings

Scope honored: only `ListingMediaStudio.tsx` + `EditListingScreen.tsx` touched. `mediaUploadQueue.ts` / `mediaUpload.ts` / `xhrUploadTransport.ts` / `CreatorCropSheet.tsx` untouched (read-only inspection of the first two).

## P0-2 — stale-state cover URI sent to `patchListingOnApi` (EditListingScreen)

Root cause confirmed: `setMediaItems(...)` at ~570 syncs `publicUrl` from the queue results, but `handleSave`'s closure still holds the pre-upload `mediaItems`, so `mediaItems[0]?.publicUrl || mediaItems[0]?.uri` resolved to a local `file://` URI for a freshly-uploaded cover and was sent as `imageUrl` to `patchListingOnApi`.

Fix (minimal, at the ~650 patch site): the cover's URL is now derived from the queue result — `uploadedItems.find((q) => q.id === coverItem.id)?.publicUrl` first (the queue items captured after `await queue.run()` are the freshest truth), then the item's state `publicUrl`, then `uri`. Reuses the `coverItem` const already declared for `coverMediaId`; no other lines in the save flow changed.

- Cover is a newly-uploaded local item → queue `publicUrl` (correct remote URL).
- Cover is remote → not in `uploadedItems` → falls through to state `publicUrl` (the remote URL, previous behavior preserved).
- Residual edge (unchanged semantics): a local cover whose queue item uploaded without a `finalizationId` is excluded from `uploadedItems` by the existing filter — but that same filter already skips its attachment creation, so the save is broken at that point regardless; the `uri` fallback keeps the field non-empty as before.

## P1-7 — stale render-time focal overwrote the sheet's fresher emission (ListingMediaStudio)

`handleCropComplete` no longer passes a focal argument: `onTransformItem(coverItem.id, newUri)` only. Ordering verified against the current sheet contract: `CreatorCropSheet` emits `onFocalPointChange` synchronously on every focal tap, and `onCropComplete` fires only after the (async) `manipulateAsync` resolves — so the last focal emission always precedes crop completion, and both hosts retain the persisted focal when the third argument is absent (EditListing's handler spreads focal only when provided; SellScreen's wrapper patches only when provided). Even if a future sheet emitted `onFocalPointChange` synchronously immediately before `onCropComplete`, the two functional state updaters compose in order and the fresh focal survives — which is exactly the overwrite the old render-time-capture argument caused.

## P1-12 — upload queue never reset (EditListingScreen)

Checked the queue instance first: `useRef(new MediaUploadQueue())` — one instance per screen mount, and `reset()` (mediaUploadQueue.ts ~313) clears items, aborts in-flight work, emits, and flushes the (now per-instance-keyed) persisted snapshot — so reset-on-done is safe and correct for hygiene.

- `uploadQueueRef.current.reset()` added after `patchListingOnApi` succeeds (before `setSaveStage('completed')`). Deliberately NOT in the catch path: on `failed_recoverable` the queue must keep its failed items so the studio's Retry affordance keeps working.
- Added to the subscribe effect's unmount cleanup (alongside the existing `unsub()`), so the snapshot dies with the screen and cannot contaminate a later edit flow.

## P1-13 — iOS library URIs (ph:// / assets-library://) could not be cropped (ListingMediaStudio)

- Guard widened: `canEditCover` now accepts `file://`, `content://`, `ph://`, `assets-library://` via two module-level scheme regexes (`MANIPULABLE_URI`, `LIBRARY_URI`); remote `http(s)` items stay locked.
- `resolveCropSourceUri(uri)` (module scope): library URIs are copied to a temp `file://` in `FileSystem.cacheDirectory` via `expo-file-system/legacy` `copyAsync` (import style follows `services/mediaUpload.ts`; temp-file naming follows the `profileMediaAsset.ts` convention). `file://`/`content://` pass through untouched. On copy failure it returns the original URI — the sheet's own `getSize` failure toast becomes the error surface instead of a silent no-op, with no new deps.
- The sheet now opens on a `cropSheetUri` state (replaces the boolean `cropSheetOpen`): the resolved temp file for library URIs, the display URI otherwise. The transform result still replaces the item URI through the existing contract, so the temp copy is only ever the manipulator's input.
- One hardening the widening required: `isVideoUri('ph://…')` returns false (no extension to sniff), so the guard additionally checks the draft item's authoritative `coverItem.kind !== 'video'` — otherwise a library video cover could now reach the crop sheet. No behavior change for previously-passing items.

## Verification (fix round 2)

1. `npm run typecheck` — **pass (exit 0)**.
2. Scoped eslint on both touched files — **0 errors** (112 warnings, all pre-existing classes; none on the new code).
3. `npm test` — **7 failed | 1730 passed | 2 skipped** — same 7 pre-existing unrelated failures (`groupChatInfoParity` copy assertions ×6, `pricingDisplayModes` snapshot ×1). Nothing in media/listing surfaces.

Note: a concurrent agent added `VideoPosterThumb` (expo-image poster for video thumbs) to ListingMediaStudio mid-round; left fully intact, and the previously-removed `ExpoImage` import is legitimately used again — not re-removed.

