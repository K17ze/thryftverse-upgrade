# UI-2 — Discovery spacing bleed (white-space fix)

**Scope:** Pinterest/Depop geometry for the discovery/explore surfaces.
**Date:** 2026-10 (this session)
**Verify:** `npx tsc --noEmit` clean; `vitest run discoverySurfaces visualRegressionPlan discoveryFeedDedup` → 133 passed / 2 skipped (pre-existing skips).

---

## Root cause

The masonry grid defaulted `horizontalPadding = Space.md` (16pt) with `gap = 6pt`.
FlashList content inset (`padding − gap/2` = 13pt) + per-cell `gap/2` (3pt) put the
**tile visual edge at 16pt from the screen edge — double the Pinterest margin (~8pt).**
Every header module then added its own `Space.md` padding on top of the same inset,
so chips, titles and rails landed even deeper. That stacked inset is the "white
spaces" the user kept seeing.

## Fix — one 8pt rail

New single source of truth in `unifiedDiscoveryStyles.ts`:

```ts
export const DISCOVERY_GRID_PADDING = Space.sm;            // 8pt tile edge
export const DISCOVERY_GRID_INSET = DISCOVERY_GRID_PADDING - (Space.xs + 2) / 2; // 5pt
```

Tile edge is now `5 (container) + 3 (cell) = 8pt` — Pinterest geometry. All
content rails on the discovery surface align to the same 8pt line (chips,
section titles, rail first card, meta lines, scope/filter rows).

## Changes by file

### `frontend/src/components/discovery/unifiedDiscoveryStyles.ts`
- Added `DISCOVERY_GRID_PADDING = Space.sm` (8pt) — single source for grid
  `horizontalPadding` and every discovery rail.
- `DISCOVERY_GRID_INSET` recomputed 13 → **5** (auto-propagates to
  `headerBleed` and `ExploreCollectionScreen.headerInfo`).
- `categoryBar`: `paddingVertical: xs` → `paddingTop: xs` only. The bar no
  longer owns a bottom gap — the next module's margin owns it (no stacked
  double-padding).
- `categoryBarContent`: `paddingHorizontal` 16 → `DISCOVERY_GRID_PADDING`;
  removed the redundant duplicate `paddingRight`.
- `sectionTitle`, `railContent`, `scopeBar`, `filterTrigger.paddingLeft`,
  `activeFiltersRow`, `peopleList`: 16 → `DISCOVERY_GRID_PADDING` (8pt rail).
- `resultsMetaWrap`: added `marginHorizontal: -DISCOVERY_GRID_INSET` +
  `paddingHorizontal: DISCOVERY_GRID_PADDING` — it renders inside the grid's
  list header, so it now bleeds out of the 5pt container inset and re-lands
  on the 8pt tile rail (was rendering at ~21pt, 13pt deeper than the tiles).
- `skeletonWrap`: `paddingTop: Space.sm` → removed (the skeleton's own
  category bar owns the top rhythm — killed a stacked band).
- `heroWrap.marginTop` (8), `collectionsSection.marginTop` (24),
  `feedStartSpace` (8): unchanged — already inside the target rhythm
  (chips→content ≤8pt, section breaks ≤24pt).
- `heroOverlay` keeps `Space.md` — that's *inside* the edge-to-edge media,
  deliberate internal padding, not a screen margin.

### `frontend/src/components/discover/PinterestMasonryGrid.tsx`
- `horizontalPadding` default `Space.md` → `DISCOVERY_GRID_PADDING` (8pt).
  Gap unchanged at 6pt. Imports the constant so the grid can never drift
  from the rails again.

### `frontend/src/components/skeletons/MasonrySkeleton.tsx`
- Defaults now mirror the grid: `horizontalPadding = DISCOVERY_GRID_PADDING`,
  `gap = Space.xs + 2` (was `Space.md` / `3` — skeleton was geometrically
  wrong even before this pass).
- **Hero is now edge-to-edge**: `screenWidth / 1.5` (3:2, matching
  `heroWrap`), `borderRadius: 0`, no horizontal inset — was a rounded inset
  card at 4:3. Title/meta echoed as overlay bars at the real scrim position
  (left `Space.md`, bottom `Space.smMd`) instead of a stray line below.
- Pill bar: `paddingHorizontal` → `DISCOVERY_GRID_PADDING`,
  `paddingVertical` sm → xs, pill height 24 → 28 (matches the real ~28pt
  chip chrome).

### `frontend/src/components/browse/BrowseResults.tsx`
- `horizontalPadding={Space.md}` → `DISCOVERY_GRID_PADDING` on both the grid
  and the skeleton (unified on the constant).
- **Killed double padding**: skeleton was wrapped in
  `styles.loadingStateWrap` (`paddingHorizontal: Space.md` + row/wrap
  layout) around `MasonrySkeleton`'s own padding — a stacked 16pt+ inset on
  the loading frame. Replaced with a plain `flex: 1` wrapper.

### Verified, no change needed
- `DiscoveryFeedView.tsx` — all spacing is style-driven; the grid uses the
  new default; skeleton call picks up the new defaults. Zero edits.
- `DiscoveryCollectionRailCard.tsx` — `marginRight: Space.sm` (8pt) is
  consistent with the new rail; first-card alignment is owned by
  `railContent` (now 8pt). Zero edits.

## Resulting rhythm (unified discovery surface)

```
search header → 4pt → chips (28pt) → 8pt → hero edge-to-edge 3:2
hero → 24pt → "Curated collections" (8pt rail) → rail (first card at 8pt)
last module → 8pt → tiles at 8pt edge / 6pt gutter
```

## Remaining white bands — outside my ownership (for parent agent)

1. **`DiscoverScene.tsx` `DiscoverCategoryBar`** — renders inside the grid's
   content inset but its `scrollContent` keeps `paddingHorizontal: Space.md`
   with no bleed margin → pills land at **21pt vs tiles at 8pt** (13pt left
   band). Fix: add `marginHorizontal: -DISCOVERY_GRID_INSET` to `bar` and
   change `scrollContent.paddingHorizontal` to `DISCOVERY_GRID_PADDING`
   (same pattern as `resultsMetaWrap`). This is the most visible remaining
   band on the Discover tab.
2. **`ExploreCollectionScreen.tsx` `headerInfo`** — bleeds correctly via
   `-DISCOVERY_GRID_INSET` but re-pads `Space.md` → meta text at 16pt vs
   8pt tiles. Change `paddingHorizontal` to `DISCOVERY_GRID_PADDING`.
3. **`VisualSearchResults.tsx:144`** — still passes explicit
   `horizontalPadding={Space.md}` → tiles at 16pt on that surface, now
   inconsistent with every other grid. Change to `DISCOVERY_GRID_PADDING`
   (or drop the prop).
4. **`CategoryDetailScreen.tsx`** — `categoryRail`/`filterRow` pad
   `Space.md` while the grid below is now at 8pt (chip/filter rows sit 8pt
   deeper than tiles). Lower priority — a category landing surface, not the
   main discovery feed — but the same rail constant applies.
5. `FlagshipScreen.scrollContent`/`content` `paddingTop: Space.sm` — **not**
   a defect here: `UnifiedDiscoveryScreen` and `ExploreCollectionScreen`
   already pass `contentStyle={{ paddingTop: 0, paddingHorizontal: 0 }}`.

## Anti-AI check

No spacing was zeroed indiscriminately. Kept: 8pt module→tiles beat,
24pt section breaks, 16pt in-media text padding, 44pt hit targets, hairline
dividers. Killed only: the doubled 16pt edge margin, stacked bottom padding
under the chip bar, the skeleton wrapper's extra inset, and rails that sat
deeper than the tile edge.

## Parent-agent sweep (post-agent fixes)

Closed the 4 leftover surfaces the agent flagged:
- `DiscoverScene.tsx` — `DiscoverCategoryBar` now bleeds `-DISCOVERY_GRID_INSET` and pads `DISCOVERY_GRID_PADDING` (pills were at 21pt vs 8pt tiles)
- `ExploreCollectionScreen.tsx` — `headerInfo` re-pads `DISCOVERY_GRID_PADDING` (was `Space.md`)
- `VisualSearchResults.tsx` — `horizontalPadding={Space.md}` → `DISCOVERY_GRID_PADDING`
- `CategoryDetailScreen.tsx` — summary/categoryRail/filterRow/sortMenu/loadingGrid all → `DISCOVERY_GRID_PADDING`

Verified: `tsc --noEmit` clean; vitest 137 passed / 2 skipped; `git diff --check` clean; zero remaining `horizontalPadding=` overrides in src.
