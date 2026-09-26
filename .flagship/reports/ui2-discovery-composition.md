# UI-2 — Discovery Composition Re-Author: Explore / Unified Discovery

Date: 2026-10 (session) · Surfaces: `UnifiedDiscoveryScreen`, `ExploreCollectionScreen`,
`DiscoveryFeedView`, `DiscoverySearchHeader`, `unifiedDiscoveryStyles`

Benchmark: Pinterest / Depop / Vinted explore — media-dominant, near-chromeless,
authored rhythm.

## Audit (thumbnail test, pre-change)

At 25% scale the surface read as **assembled chrome, not a designed surface**:

- **Two chrome rows before content** (~108pt): a `FlagshipHeader` with an empty
  title existing only to hold back + camera, then a second row containing a grey
  filled rounded search box (`AppSearchBar`'s `colors.surface` + `Radius.lg`
  container). The single loudest AI tell.
- **Hero editorial rendered as a 120pt banner card** — inset inside the grid's
  content padding, with an `EDITORIAL` eyebrow + title + byline label stack.
  Three labels on a short strip = label-everything disease.
- **Broken gutter grammar**: chips and rail content padded `Space.md` *inside*
  the grid's 13pt content inset → first chip sat at ~29pt while grid tiles sat
  at 16pt. The hero sat at 13pt. Three different left edges in one viewport.
- **Section rhythm**: `collectionsSection` had `paddingVertical: sm` only;
  tiles butted directly against the last header module; dead `feedLabel` /
  `searchingWrap` / header styles remained in the sheet.
- **ExploreCollection**: subtitle + "N items" as two stacked meta rows
  (restated-heading pattern), and a uniform 4-card skeleton that didn't match
  the masonry silhouette it was standing in for.

## Re-author

### `components/discovery/DiscoverySearchHeader.tsx` — one quiet row
- Deleted the `FlagshipHeader` (empty-title bar = dead chrome) and the grey
  search box. The header is now **a single ~44pt row**: back glyph
  (transparent 44pt hit area, `chevron-back` at 24pt via the semantic icon
  registry) + a single-line field.
- The field reuses `AppSearchBar` (keeps `accessibilityRole="search"`, clear
  button, camera affordance) but passes a flattening `containerStyle`
  (`transparent`, `borderRadius: 0`, `borderWidth: 0`, no padding) — the
  override is applied last in the component's style array, so the focus ring
  is suppressed too. The only boundary is a **1pt baseline**
  (`Stroke.standard`, `borderSubtle` → `textPrimary` on focus), matching the
  charter's stroke grammar for fields.
- Camera moved to the field's trailing edge via `AppSearchBar.onCameraPress`
  (Depop/Pinterest grammar); typing swaps it for the clear control — the
  component's established behavior, no behavior change.
- Focus state is tracked locally and forwarded to `onSearchFocusChange` —
  the baseline darkens honestly only while the field is live.
- `FlagshipScreen`'s existing scroll-driven hairline owns header/content
  separation once the feed moves; the resting header is chromeless.

### `components/discovery/unifiedDiscoveryStyles.ts`
- New export `DISCOVERY_GRID_INSET = Space.md − (Space.xs + 2) / 2` (= 13pt):
  the exact inset the grid applies around its content container, used as a
  negative margin so header modules can opt out of it.
- Replaced `headerWrap` / `headerSearchWrap` / `searchBar` with `headerRow`,
  `searchFieldWrap(+Focused)`, `searchField`. Deleted dead `searchingWrap`,
  `feedLabelWrap`, `feedLabel`, `heroEyebrow`.
- `heroWrap`: 120pt fixed-height strip → **`aspectRatio: 3/2` full-bleed
  media**; `heroTitle` keeps its scale (19pt bold over scrim), meta line is a
  single `author · readTime`; gradient height tightened to 55%.
- `sectionTitle` restyled to the real `TypographyV2.sectionTitle` token
  (17/24 semibold, −0.4 tracking) instead of `body+2 bold`.
- `skeletonWrap` horizontal padding removed — `MasonrySkeleton` owns its own
  padding so the loading frame lands on the same gutter as the render.
- New `headerBleed`, `feedStartSpace` (8pt between last module and tiles).

### `components/discovery/DiscoveryFeedView.tsx` — authored header stack
- The whole `listHeader` now sits inside `styles.headerBleed`
  (`marginHorizontal: −DISCOVERY_GRID_INSET`): **media bleeds to the screen
  edge; every text/chip/rail element keeps `Space.md` content padding and
  therefore lands on the identical 16pt gutter as the tiles.** One constant,
  one gutter grammar.
- Rhythm: chips (~36pt row) → `Space.sm` → hero media → `Space.lg` →
  collections rail → `Space.sm` → grid. Consistent Space-token cadence.
- Hero: the `EDITORIAL` eyebrow is gone — media + title + byline only.
  Extracted one shared `heroMedia` element consumed by both the interactive
  (`Pressable` → `GalleriaEditorial`) and non-interactive wrappers, so the
  two FRESH-08 paths can never drift.
- "Curated collections" kept as the single quiet header marking the
  content-type change (cards carry theme/title/curator — nothing else is
  labelled), capped at `MAX_FONT_SCALE.heading`.
- All state machinery untouched: `renderModuleRetry`, stale-module
  attribution, offline suppression, `showError`/`showEmpty`/
  `showFilteredEmpty`, skeleton, `RefreshControl`, save/long-press callbacks.

### `screens/ExploreCollectionScreen.tsx`
- Content header collapsed to **one meta line**: `{subtitle} · {N} items`,
  `textMuted`, utility font-scale cap, aligned to the tile gutter via the
  same `DISCOVERY_GRID_INSET` bleed.
- Loading state re-authored: the uniform 4×180pt card grid (wrong
  silhouette, wrong radius) is now a **2-column varied-height masonry
  skeleton** (`SKELETON_HEIGHTS`, `Radius.lg` tiles, single text line,
  `GRID_GAP` matching the grid's default gap) — no loading→final geometry
  shift (AGENTS.md §14).
- Fetch/filter/save/refresh/analytics logic unchanged; `isSyncing`/
  `isFetching` gate and empty state intact.

### `screens/UnifiedDiscoveryScreen.tsx`
- No edits required — it is a pure orchestrator and the
  `DiscoverySearchHeader` props contract is unchanged (query, submit, back,
  visual-search, focus callback). Composition changes landed entirely in the
  owned component/style layer.

## Verification

- `npx tsc --noEmit` — clean (0 errors).
- `npx vitest run discoverySurfaces visualRegressionPlan
  discoveryFailureAttribution stateTruthfulnessRepairs` — **169 passing**
  (2 skipped: baseline-gated `runIf` screenshot assertions, expected until
  baselines are captured on device).
- ESLint on touched files: 0 errors; warnings are pre-existing
  `i18next/no-literal-string` / a11y-hint debt (the codebase's literal-string
  convention is unchanged — no new i18n keys introduced, none needed).

## Thumbnail test, post-change

Header = one 44pt row of type on canvas → chips → edge-to-edge 3:2 editorial
media → self-describing collection rail → masonry. One dominant object per
band, one gutter (16pt), hairline-only field boundary. The surface now reads
as composed media with quiet utility, not stacked chrome.

## Flags for follow-up

- `MasonrySkeleton`'s hero row is still a rounded inset card while the real
  hero is now sharp full-bleed — a minor skeleton/render silhouette delta
  (component owned by the grid/tile lane, not touched here).
- `assembleDiscoveryFeed` is invoked with `numColumns=2` while
  `DiscoveryFeedView` renders the grid at `numColumns={3}` — span semantics
  for woven modules are owned by the grid/assembly lane; flagged, not
  changed.
- `DiscoveryCollectionRailCard` internals (180×240 card, three text lines on
  scrim) are outside this lane's ownership; the rail's spacing/gutter is now
  consistent around it.
