# UI Discovery Grid — Flagship Upgrade Report

**Scope:** discovery/explore product grid + suggestion chips (Pinterest/Depop benchmark).
**Agent slice:** masonry grid, browse results wrapper, discovery tile, chip-row sections.

---

## What was already true (kept, not rebuilt)

- `PinterestMasonryGrid` is already a **true staggered masonry**: FlashList v2 `masonry` mode measures real per-item heights; columns are independent. No uniform-row bug existed.
- **Real aspect-ratio data already flows end-to-end**: `Listing.mediaAspectRatio` / `mediaWidth`/`mediaHeight` → `resolveListingMediaAspectRatio()` → `ListingFeedUnit.aspectRatio` → tile `aspectRatio` style. Hero span logic (`HERO_ASPECT_THRESHOLD = 1.2`, `HERO_MIN_GAP = 8`) is intact and untouched.
- **Focal crops already correct**: `primaryMedia.focalPoint ?? getCategoryFocalPoint(category)` → `CachedImage` → ExpoImage `contentPosition`. No blind centre-crop letterboxing.
- `getItemType` (`type:span`), `overrideItemLayout` span clamping, `recyclingKey` media keys, and the derivative-ladder prefetch path were already correct — all preserved.
- `gridDensity 'compact'` 3-col mode in `BrowseResults` preserved verbatim.

## Changes made

### `frontend/src/components/discover/PinterestMasonryGrid.tsx`
- Default `gap` `Space.sm` (8) → `Space.xs + 2` (**6pt**) — tighter Pinterest/Depop gutter. Affects every caller using the default (UnifiedDiscovery feed, ExploreCollection, search results, CategoryDetail, VisualSearch, DiscoverScene). Callers passing explicit gaps (BrowseResults: 3 / 6) unchanged.
- Moodboard unit wrapper `paddingBottom: Space.md` → `ctx.gap` — vertical rhythm now owned by the grid gutter, not per-unit padding.

### `frontend/src/components/ProductCard.tsx` (`ProductDiscoveryTile` — the grid's cell)
- Metadata reordered **price-first** (Depop pattern): disclosure → **price** → title. Was: title → price.
- Price weight `regular` → **`FontFamily.semibold`** — the one element allowed to carry weight under the media.
- Info block breathing: `paddingTop` 4 → 6, `gap` 0 → 1.
- No other card chrome added; tile remains media edge-to-edge, `Radius.lg` media, transparent save hit-target with text-shadow scrim, single `Sold` state badge.

### `frontend/src/components/discovery/unifiedDiscoveryStyles.ts` + `DiscoveryFeedView.tsx` (UnifiedDiscoveryScreen chip row)
- Chips: `paddingHorizontal` 16 → 12 (`Space.smMd`), `paddingVertical` 8 → 6 → **~28pt tall** (was ~30–40 with font scaling).
- Chip text: meta 11 → **caption 12/16 medium**.
- **Removed `categoryPillPersonalized`** (grey `surfaceAlt` fill + heavier border on unselected personalised chips). Personalisation is now signalled only by the 5pt brand dot; unselected chips are hairline-only, selected chip is the sole dark fill — per the reference grammar.
- Single horizontal `ScrollView` row preserved; scope tabs + filter trigger rows were already quiet text-tab grammar (no pills) — untouched.

### `frontend/src/components/browse/BrowseResults.tsx`
- Loading skeleton gutter now mirrors the live grid (`compact ? 6 : 3`) — eliminates skeleton→content geometry shift in compact mode.

## Verification

- `npx tsc --noEmit` — **0 errors in owned files**. Two pre-existing errors in `src/components/profile/MyProfileIdentityHero.tsx` (`editHit`, `metaLine` style keys) belong to a concurrently modified file owned by the profile slice — not introduced by this change.
- `vitest run` on discovery/browse suite: **43/43 pass** — `browseFilterContexts`, `discoveryFailureAttribution`, `discoveryFeedDedup`, `discoverySearchRequestIdentity`, `discoverySurfaces`.

## Residuals / handoffs

1. **Aspect-ratio data coverage** — when backend rows lack `mediaAspectRatio`/`mediaWidth`/`mediaHeight`, tiles fall back to 3:4 portrait (honest fallback, never fabricated). Feed uniformity on such data is a **data-coverage gap**, not a layout defect; masonry staggers correctly wherever real ratios exist (search results already prefer `item.aspectRatio`/`mediaWidth`/`mediaHeight` when the API sends them).
2. **`scenes/discovery/DiscoverScene.tsx`** owns a second chip bar (`DiscoverCategoryBar`) with `minHeight: 36` pills + `pillPersonalized` grey fill — the same oversized-blob grammar, outside this slice's file ownership. Recommend the Discover-scene owner apply the same compact grammar (~28pt, hairline-only unselected, dot-only personalisation).
3. **`MasonrySkeleton` pill placeholders** render 24pt tall vs. the new ~28pt chips — minor silhouette delta on the loading frame (skeleton file outside owned slice).
4. `ExploreCollectionScreen.tsx` has **no chip row** (header + grid only) — nothing to fix there; it inherits the tighter 6pt grid gutter automatically.
