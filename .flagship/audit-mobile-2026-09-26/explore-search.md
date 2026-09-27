# Audit — Explore / Search / Browse (mobile) — 2026-09-26

## Verdict
The department is well-plumbed — context-scoped filter buckets, request-epoch race handling, honest fallback/facet disclosure, real saved-search replay — but it trails the web surface on the exact grammar the brief calls out: no tolerant "did you mean" matcher, no zero-result recovery surface, no facet counts, and small 3-column result imagery where Depop/eBay use bigger media. Two defects cross the dishonest/dead-control line.

## Findings

### ESB-01 — Filter sheet "Open category tree" dead-ends (search context) and key-mismatches (category context) [P0]
- Screens: `frontend/src/screens/FilterScreen.tsx`, `frontend/src/screens/CategoryTreeScreen.tsx`
- Evidence: `FilterScreen.tsx:253` navigates `CategoryTree` with `categoryPrefix: categoryId === 'search' ? '' : categoryId`. `CategoryTreeScreen.tsx:33-47` builds `tree` keyed by `top.name` and tests `Boolean(tree[categoryPrefix])`. In search context the prefix is `''` → `tree['']` is undefined → the "Category unavailable" error screen renders every time (FilterScreen.tsx:250-264 shows the row in all contexts). In category context callers pass `category.id` (e.g. `CategoryDetailScreen.tsx:340`), which only resolves if `id === name` — fragile name-keyed lookup on an id param.
- Web parity: web `/categories` index + `RefinementRail` hideCategory logic never produces a dead category route.
- Competitor: eBay/Vinted category drill-down always resolves.
- Root cause: param contract drift — an id-or-name ambiguity plus an `''` sentinel nobody handles.
- Fix: hide the context-identity row in search context, or pass `null` and have CategoryTree render the full top-level directory; resolve nodes by `id` (with name fallback), not name-only.
- Acceptance: opening the filter sheet in search context shows no dead entry; tapping it in a category context lands on that category's tree for all taxonomy ids.

### ESB-02 — ExploreCollection 'auction' silently renders all listings [P0]
- Screens: `frontend/src/screens/ExploreCollectionScreen.tsx`
- Evidence: `ExploreCollectionScreen.tsx:111-113` — `case 'auction': // Auction filter not supported by current Listing model; show all`. A user opening an "Auctions" collection sees the entire unfiltered catalogue presented as auction inventory.
- Web parity: web has real auction surfaces (`web/src/components/auctions/*`).
- Competitor: eBay auction grammar — scoped results only.
- Root cause: placeholder branch shipped as real.
- Fix: fetch `auction=true` from `fetchFilteredListings` (or drop the entry point until the contract exists); never render the unscoped base list under an auction title.
- Acceptance: an auctions collection shows only auction listings or an honest empty/unsupported state.

### ESB-03 — No zero-result recovery surface [P1]
- Screens: `frontend/src/components/discovery/DiscoverySearchResultsView.tsx`
- Evidence: `DiscoverySearchResultsView.tsx:252-272` — zero results render a bare `FlagshipState` ("No items found" / "Back to discovery" or "Clear filters"). No suggested queries, no category escapes.
- Web parity: `web/src/components/search/SearchRecovery.tsx` replaces the results area with popular-search chips, busiest-category tiles with live counts, and a clear-filters escape (`SearchClient.tsx:163-168`).
- Competitor: eBay/Vinted always redirect a dead query into adjacent inventory.
- Root cause: recovery never ported to mobile.
- Fix: on `units.length===0 && !searchError`, render recovery content — trending searches (`fetchTrendingSearches`, already used at `SearchScreen.tsx:71`), top categories from `useTaxonomy`, and clear-filters CTA.
- Acceptance: a zero-hit query yields ≥1 actionable recovery path, not a dead end.

### ESB-04 — No "did you mean" tolerant matching; fallback note lacks the corrected term [P1]
- Screens: `frontend/src/hooks/discovery/useDiscoverySearch.ts`, `frontend/src/components/discovery/DiscoverySearchResultsView.tsx`
- Evidence: mobile relies entirely on `result.fallback`/`retrievalMeta.fallbackReason` (useDiscoverySearch.ts:213-215) and prints the generic "No exact matches — showing similar items" (DiscoverySearchResultsView.tsx:139-141). No canonical correction is surfaced; client-filtered surfaces (Browse, CategoryDetail) have no tolerance layer at all — `CategoryDetailScreen.tsx:107-128` is literal token matching.
- Web parity: `web/src/components/search/searchMatch.ts` normalizes, per-token matches, and produces a corrected query (Levenshtein/bigram-Dice); `SearchClient.tsx:104-118` re-queries with the suggestion and renders "No results for “q” — showing <suggestion>" as a link.
- Competitor: eBay/Google-style did-you-mean is table stakes.
- Root cause: tolerant matcher never ported; backend fallback is binary with no suggestion payload.
- Fix: port `searchMatch.ts`-equivalent to `frontend/src/services/`; surface the corrected term tappable; add tolerant matching to client-side category/browse filtering.
- Acceptance: typo query "levis jaket" shows corrected results with "Showing Levi's jacket" affordance; client-filtered surfaces tolerate the same typos.

### ESB-05 — No facet counts in mobile refinement [P1]
- Screens: `frontend/src/screens/FilterScreen.tsx`, `frontend/src/components/filters/*`
- Evidence: brand (`FilterScreen.tsx:111-128`) and size (`130-138`) options carry no counts; the sheet shows only a footer result count, suppressed in search context (`242-246` "Filters apply to the current search").
- Web parity: `web/src/components/search/RefinementRail.tsx` renders true per-option counts from the current result set via `facetCounts.ts` ("what the grid would show on click, never a fabricated tally").
- Competitor: eBay refinement rail grammar.
- Root cause: no facet-count derivation on mobile.
- Fix: compute counts from the active listing snapshot per facet option; show `count` right-aligned in tabular figures on each option row.
- Acceptance: every selectable brand/size/condition option shows a true count; zero-count options hide or disable.

### ESB-06 — Results imagery too small; discovery density below Depop/eBay grammar [P1]
- Screens: `frontend/src/components/discovery/DiscoverySearchResultsView.tsx:281`, `frontend/src/hooks/browse/useBrowseGridDensity.ts:14`, `frontend/src/components/browse/BrowseResults.tsx:80`
- Evidence: search results hard-locked to `numColumns={3}`; Browse defaults to `'compact'` 3-column and `CategoryDetailScreen.tsx:421` also forces 3. Small thumbs are correct for dense browsing but wrong as the *default* on search/discovery where image is the decision unit.
- Web parity: web `useResultColumns` adapts column count to viewport with larger tiles.
- Competitor: eBay search redesign = larger images; Depop = bigger-image results.
- Root cause: compact density chosen as default; no per-surface image-size grammar.
- Fix: default search/discovery results to 2-column masonry; keep 3-col as an explicit density toggle.
- Acceptance: first viewport on a phone shows ≥2 full-width-ish media objects with legible price lines.

### ESB-07 — No conversational-search entry from the search surface [P2]
- Screens: `frontend/src/components/discovery/DiscoverySearchHeader.tsx`, `frontend/src/screens/ConversationalSearchScreen.tsx`
- Evidence: `ConversationalSearch` is only reachable via the command palette (`services/commandPaletteApi.ts:478`). No affordance on SearchScreen/UnifiedDiscovery.
- Web parity: `SearchClient.tsx:153-159` renders a "Refine in chat" link under the search field that hands the live `?q=` + facet params to `/search/chat`.
- Competitor: eBay conversational/intent search.
- Root cause: entry point never wired.
- Fix: add a quiet "Refine in chat" text action under the field that routes with the current query + active filter set.
- Acceptance: from a populated search, one tap opens ConversationalSearch seeded with the same query.

### ESB-08 — CategoryTreeScreen duplicates its own sections and lacks a11y labels [P2]
- Screens: `frontend/src/screens/CategoryTreeScreen.tsx`
- Evidence: the same `sections` render twice — once as `VisualCategoryTile` grid (`:103-117`) and again as `DiscoverySectionHeader` rows with sub-pills (`:120-152`) — duplicate/restated headings (anti-AI §15). Back (`:55`,`:83`), "View All" (`:91`) and error CTA (`:63`) `AnimatedPressable`s have no `accessibilityLabel`. `viewAllRow` (`:181-190`) is a full-bleed `Radius.xl` brand slab — a dominant non-media panel above the fold, exceeding the surface budget; tiles carry a `${n} subcategories` subtitle (`:108`) — label-everything.
- Web parity: `web/src/app/categories`/`CategoryIndex` shows one hierarchy, not two.
- Competitor: Vinted category tree = one list, progressive disclosure.
- Fix: pick one presentation (media tiles OR section rows with sub-pills); drop subtitles; add a11y labels; demote "View All" to a text/hairline row.
- Acceptance: each subcategory appears once per viewport; all controls announce roles/labels.

### ESB-09 — CategoryDetail sort menu reflows content; inconsistent sort primitive [P2]
- Screens: `frontend/src/screens/CategoryDetailScreen.tsx:380-402` vs `frontend/src/screens/BrowseScreen.tsx:164-184` (`BrowseSortMenu` anchored overlay).
- Evidence: CategoryDetail renders the sort menu inline in layout flow, pushing the masonry grid down on open — layout shift and a second sort-menu implementation.
- Fix: reuse the anchored-overlay sort pattern from Browse (or extract a shared SortMenu component).
- Acceptance: opening sort does not move the grid; one sort-menu primitive exists.

### ESB-10 — SavedSearchesScreen uses raw Ionicons + bordered pill tabs [P2]
- Screens: `frontend/src/screens/SavedSearchesScreen.tsx`
- Evidence: direct `Ionicons` throughout (`:11`,`:307`,`:331-335`,`:363-375`) instead of `AppIcon`; tab pills (`:132-143`) are bordered surface boxes vs the one-chip grammar used elsewhere. Content replay itself is strong (see non-findings).
- Fix: swap to `AppIcon`/`IconSize`; restyle tabs to the house segmented/underline grammar.
- Acceptance: no `Ionicons` import in the screen; tabs match `DiscoveryModeNav` idiom.

### ESB-11 — Price filter is static numeric inputs only [P3]
- Screens: `frontend/src/components/filters/FilterPriceRange.tsx`
- Evidence: paired `TextInput`s (`:37-60`); no slider/distribution feedback. Parity with web (also min/max fields) but below eBay's interactive price-filter grammar; mobile could lead with a dual-thumb slider + live result count.
- Fix: add a range slider bound to the min/max fields, driven by the snapshot's price distribution.
- Acceptance: dragging updates results count live; inputs remain accessible.

## Non-findings (verified good)
- Saved-search replay: `SavedSearchesScreen.tsx:87-104` replays the entire stored filter set (brands, sizes, condition, sort, price bounds, category) into the destination context bucket; alerts toggle/remove roll back honestly with error alerts; "New" tab + per-search new-match badges + `lastCheckedAt` relative times are real (useSavedSearchAlerts).
- Honest fallback disclosure: `useDiscoverySearch.ts:213-215` only claims "similar items" on a real backend `fallback`/`retrievalMeta` flag.
- Race discipline: search epoch (`useDiscoverySearch.ts:119-161`) and visual-search sequence+AbortController (`useVisualSearchResults.ts:50-69,135-136`) correctly drop stale responses; page-2 failure is a bottom retry strip, not a full-screen error (`DiscoverySearchResultsView.tsx:297-317`).
- Honest counts: result count shows `n+` while more pages may exist (`DiscoverySearchResultsView.tsx:143-149`); FilterScreen suppresses the count in search context rather than overstating it (`FilterScreen.tsx:240-246`); visual-search facet counts travel only with the API's own candidate set (`useVisualSearchResults.ts:139-173`).
- Honest AI disclosure: ConversationalSearch labels "matched keywords" not AI (`ConversationalSearchScreen.tsx:1-20,274-301`); VisualSearch labels "heuristic, not AI" (`useVisualSearchResults.ts:254-266`).
- Price validation: inverted min/max blocked inline with an honest Apply label (`FilterScreen.tsx:167-175,374`).
- Skeleton-not-spinner loading states across search, browse, category, explore-collection.
