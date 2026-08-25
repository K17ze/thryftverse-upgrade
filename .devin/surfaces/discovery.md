# Discovery Surface Contract

> First surface in the Visual Flagship Convergence Loop (AGENTS.md §31). This contract is the active visual context for the Discovery implementation unit — not a department-wide research dump.

---

## Surface

**Name:** Discover / Explore
**Route:** SearchScreen → `discover` tab (`DiscoverScene` + `PinterestMasonryGrid`)
**Files:** `frontend/src/scenes/discovery/DiscoverScene.tsx`, `frontend/src/components/discover/PinterestMasonryGrid.tsx`, `frontend/src/contracts/discoveryFeedUnit.ts`, `frontend/src/utils/discoveryFeedAssembly.ts`

## User goal

A user opens Explore to **discover things they didn't know they wanted** — a visual, browsable garden of listings, looks, and creator moments, not a sorted catalogue.

## Current state (the structural problem)

The feed renders `listing → listing → listing → listing …` with variable heights. That is masonry **geometry**, not Pinterest's product **composition**. `PinterestMasonryGrid` accepts only `Listing[]` and forces `overrideItemLayout` to `span = 1` for every unit. The heterogeneous `DiscoveryFeedUnit` contract (listing / look / poster / editorial / recommendation_break) exists but is dead code — the renderer never consumes it. Additionally `DiscoverScene` wraps the FlashList in a `Reanimated.ScrollView`, contradicting the grid's own "FlashList owns scrolling — must NOT be wrapped in a ScrollView" invariant.

## Before→after visual delta

```text
Current: 2-column catalogue. Every unit is a listing. span = 1. Variable heights only.
         FlashList wrapped in a ScrollView (scrolling contradiction, broken virtualization).
Target:  visual-discovery canvas where listings are one feed-unit type among several.
         First viewport contains ≥2 strong media objects and no catalogue-card silhouette.
         Mixed feed-unit schema consumed by the renderer: listing, recommendation_break
         (now), look/poster/editorial (rendered when the backend sends them).
         1×1 and 2×1 spans used deliberately — landscape-media listings span both columns
         as hero units; recommendation breaks span full width as quiet eyebrows.
         FlashList owns scrolling (no enclosing ScrollView).
```

## Observable visual outcomes (testable, not "flagship")

- At 25% screenshot scale, media dominates the first viewport; no uniform catalogue-card silhouette.
- The first viewport shows ≥2 strong media objects.
- At least one full-width unit (hero listing or context break) breaks the 2-column rhythm within the first two viewports.
- Navigation chrome recedes in the squint test; colour comes from imagery, not grey panels.
- The next item peeks 80–140pt into the viewport (content density, not oversized chrome).
- Pull-to-refresh, pagination, and scroll-to-top still work (FlashList owns scrolling).
- Loading skeleton matches the final masonry silhouette (no layout shift).
- No fabricated editorial media — `recommendation_break` is a text eyebrow only; `editorial`/`look`/`poster` units render only when the backend sends valid data.

## Feed-unit model + span grammar

```text
listing                → span 1 (default) | span 2 (hero, when real media aspectRatio ≥ 1.2, throttled ≤1 per 8)
recommendation_break   → span = numColumns (full-width quiet eyebrow, no media)
editorial / look / poster → span = numColumns (full-width, rendered only from valid server data)
```

The renderer switches on `unit.type` and reads `unit.span`. The contract (`discoveryFeedUnit.ts`) is the single source of truth — the renderer no longer accepts a raw `Listing[]` only.

## States to cover

- loading (masonry skeleton matching final silhouette)
- populated (heterogeneous feed)
- empty (next action: Browse Categories)
- error (retry)
- offline (cached + banner, owned by SearchScreen)
- paginating (footer indicator)

## Out of scope (this iteration)

- Look / poster / editorial **data sources** — the renderer is wired for them, but the backend does not send them yet. They render `null` until valid server data arrives (truthful UI, AGENTS.md §11).
- PulseScene, LooksScene, BrowseScreen, CategoryDetailScreen, VisualSearchScreen — not this surface.
- The custom "T" RefreshIndicator is preserved (brand element); only its scroll source moves from the ScrollView to the FlashList.
