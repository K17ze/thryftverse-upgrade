# Task E — Discovery media integrity (findings 18, 19, 20)

**Status:** DONE
**Date:** 2026-09-28
**Files owned:** `frontend/src/components/discover/PinterestMasonryGrid.tsx`, `frontend/src/__tests__/discoveryMediaStates.test.tsx` (new)

## What changed

### `frontend/src/components/discover/PinterestMasonryGrid.tsx`

**Finding 18 (P1) — consistent media loading/error contract for non-listing units.**

Added a file-local `DiscoveryMediaImage` component (new "DISCOVERY MEDIA" section, ~line 508) that wraps `ExpoImage` and owns the shared contract:

- **Missing/empty source** (`uri` undefined or whitespace, e.g. moodboard `imageUris[0]` when the collage is empty) → renders a muted fallback: the caller's muted `surfaceAlt` fill plus a small centered `image-outline` glyph in `colors.textMuted`. The glyph node is `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"` — decorative only; the tile's own accessible label already carries identity.
- **Decode/network failure** → `onError` records the *failed URI* (`failedUri` state). `failed = !hasSource || failedUri === uri`, so a FlashList-recycled cell that receives a new source recovers automatically — no stale failure state crosses recycled instances (the audit's "recycled-cell source changes" acceptance point).
- **No stock substitution, no error banner.** The tile frame, authored/measured aspect ratio, scrim gradient and textual overlay (title / creator / moodboard title) are owned by the tile and render identically in the failure state, so a failed tile keeps a coherent identity — the same behavioral contract listing tiles get from `CachedImage` → `ImageEmptyGraphic`, without forcing one card composition across types.
- Fallback carries `testID="discovery-media-fallback"` for tests/automation.

`LookDiscoveryTile`, `PosterDiscoveryTile` and `MoodboardDiscoveryTile` (including each collage cell) now render through `DiscoveryMediaImage`, preserving `recyclingKey`, `contentFit="cover"`, `cachePolicy="memory-disk"` and the measured-ratio `onLoad` callbacks. The `editorial` branch remains fail-closed (`null`) per the feed-unit contract — it renders no shell, so no failure treatment is needed there.

**Finding 19 (P2) — verification glyph contrast over media.**

Both Look and Poster `checkmark-circle` glyphs switched from `colors.brand` (near-black `#111111` in the light theme — invisible over the dark scrim) to `colors.mediaOverlayText` (`#FFFFFF` in both themes), with `textShadowColor: colors.mediaOverlayScrim` + 3pt radius as the controlled backing — the identical pattern the tile's `bag-handle-outline` glyph already uses. The server-derived verification conditions (`creator.verified === true`, `creator.isVerified === true`) are unchanged. Used the existing `mediaOverlay*` token family in `constants/colors.ts` — no new tokens.

**Finding 20 (P2) — reduced motion applied.**

`reducedMotionEnabled` is no longer discarded (`void` statement removed). It flows through `UnitRenderContext.reducedMotion` into each tile and into `DiscoveryMediaImage`, which renders `transition={reducedMotion ? 0 : 160}` — instant media swaps under reduced motion, unchanged 160ms crossfade otherwise. Listing tiles already get the same behavior inside `CachedImage` (`effectiveTransition = reducedMotionEnabled ? 0 : transition`), so the contract is now consistent across unit types. `useReducedMotion` remains referenced in the file (asserted by `flagshipProductionDetailPass.test.ts`).

### `frontend/src/__tests__/discoveryMediaStates.test.tsx` (new)

Renders the real `PinterestMasonryGrid` tree with FlashList / expo-image / expo-linear-gradient / ProductCard / CachedImage / theme / `useReducedMotion` mocked at the module boundary — same `vi.hoisted` harness + `react-test-renderer` + string-component convention as `discoveryFailureAttribution.test.tsx`. The theme mock returns the real `LIGHT_COLORS` so brand-vs-overlay-role assertions are meaningful. 9 tests:

- **Finding 18:** look cover error → fallback + title/creator context retained; poster cover error → same contract; moodboard per-cell failure (one of three cells falls back, rest + title intact); empty cover source → fallback not a blank image; recycled cell with new URI recovers.
- **Finding 19:** look + poster verification glyph color === `LIGHT_COLORS.mediaOverlayText` (and !== `LIGHT_COLORS.brand`), with `mediaOverlayScrim` shadow backing.
- **Finding 20:** all 5 media nodes render `transition={0}` under reduced motion; `transition={160}` under normal motion.

## Verification

- `npx vitest run src/__tests__/discoveryMediaStates.test.tsx` — **9/9 pass**.
- `npx vitest run` on `discoverySurfaces`, `discoveryFailureAttribution`, `discoveryFeedDedup`, `discoverySearchRequestIdentity`, `flagshipProductionDetailPass` — **41/41 pass** (the `useReducedMotion` source assertion still satisfied).
- `npx tsc --noEmit` — **zero errors in owned files**. The repo currently reports unrelated errors in files owned by other in-flight tasks: `CoOwnOrderBook.tsx` (Task A), `sellerAuctionRowDensity.test.tsx` (Task B), `AIAgentIntegrationScreen.tsx` (Task D). None touch `PinterestMasonryGrid.tsx` or the new test file.

## Concerns / notes for orchestrator

- **No shared-primitive change needed.** `CachedImage` already implements the reference contract (error → `ImageEmptyGraphic`, reduced-motion → instant); `DiscoveryMediaImage` deliberately mirrors it at tile scale (plain muted glyph rather than the full graphic, matching `ProductDiscoveryTile`'s own quiet missing-media cell) and lives inside the owned file per the task brief.
- `tsc --noEmit` is not repo-clean overall due to the other tasks' in-flight edits listed above — expected while waves run in parallel; re-verify after all waves land.
- Moodboard tiles render up to 3 independent media cells; each now fails independently (a single broken item image no longer blanks the whole collage into one undifferentiated fill).
