# W3-E Search/Browse/Filters/Visual+Conv Search — Implementation Report

**Date:** 2026-09-26 · **Dept:** search-browse-categories-filters-visual-conversational
**Status:** COMPLETE — all owned files clean under `npx tsc --noEmit` and `npx eslint`.
**Note:** a previous agent on this task completed most of the build before dying; this
pass audited every owned file, verified the wiring end-to-end, closed the last open gap
(did-you-mean surfaced inside SearchRecovery) and re-ran the gates.

---

## Task ledger

| # | Task | Status | Where |
|---|------|--------|-------|
| 1 | Facets → URL | **Done** — `useFacetParams` reads via `filtersFromParams` and writes via `writeFilterParams`; discrete toggles `router.push` (Back undoes a refinement), price-only edits `router.replace` (no per-keystroke history). q/sort/sub survive merges. The old `SEED_PARAM_KEYS` read-only seed was replaced by full two-way URL state. | `components/search/useFacetParams.ts`, `components/filters/filterTypes.ts:236-318`, consumed by `SearchClient`, `BrowseClient`, `CategoryClient` |
| 2 | Colour facet | **Done** — `colours: string[]` on `ListingFilters` backed by `COLOR_VOCAB`; strict text-mention rule (`listingColourNames`, boundary-checked aliases); honest relaxed-base counts via `colourFacets`; swatch-dot rows in rail + chips in sheet + removable chips on results; `?colour=` URL codec with canonical-name validation. | `filterTypes.ts:56-57,98-130,165-168`, `facetCounts.ts:183-206`, `RefinementRail.tsx:246-254`, `FilterSheet.tsx:328-342`, `RefinedResults.tsx:198-205` |
| 3 | Multi-select | **Done** — brand/size/category (and colour/condition) are `string[]` with union semantics in URL (`brand=a,b` — per-value encodeURIComponent so literal commas round-trip), rail checkboxes, sheet chips, active-filter chips fan out per value. `coerceFilters` absorbs the legacy scalar persisted shape for saved searches. | `filterTypes.ts:46-71,249-318,326-351`, `RefinementRail.tsx`, `FilterSheet.tsx`, `savedSearches.ts:44-71` |
| 4 | Member search honesty | **Done** — real `MemberResults` section powered by `useMemberDirectory` (fixture: USERS username match; live: usersService.searchUsers). Rendered as `preamble` inside populated results AND inside the exhausted recovery path (members can match when listings don't). Placeholder "items, brands, members" is now true. | `components/search/MemberResults.tsx` (new), `SearchClient.tsx:331,357` |
| 5 | Best-match scoring | **Done** — `matchListings` returns `scores: Map<id, number>`: field-tiered token hits (title 4 > brand 3.5 > detail 2.5 > synonym 1, prefix discounted) + bounded engagement signal (log likes/views, bump). `sortListings('relevance', …)` ranks on it; `?sort=` unchanged. | `searchMatch.ts:186-388`, `filterTypes.ts:180-227`, `SearchClient.tsx:353` |
| 6 | Scoped suggestions / weak did-you-mean / related / most-liked / sold | **Done** — `suggestQueries` emits verified "X in Women" scoped rows when a category facet is active; `matchListings` offers `suggestion` on weak sets (≤3 hits, correction strictly larger) rendered as a non-destructive "did you mean" link; `relatedSearches` row trails populated grids; `most-liked` sort added (mobile parity); `includeSold` toggle ("Show › Sold items") on both facet surfaces with honest count. | `searchMatch.ts:366-525`, `RefinedResults.tsx:328-350`, `SortDropdown.tsx`, `facetCounts.ts:208-218` |
| 7 | Visual search P2 | **Partial (in-scope part done)** — pasted-URL input + clipboard paste in dropzone; `pickImageUrl` fetches and runs the identical pipeline with an honest `unreachable` error kind; `?image=<url>` deep link consumed once on mount — this is the ready-made target for a per-tile "visually similar" affordance. The per-tile button itself lives on `components/cards/ProductTile.tsx`, outside this dept's ownership — handed to the cards/feed owner (see Concerns). | `VisualSearchDropzone.tsx`, `visual-search-queries.ts:296-340`, `VisualSearchClient.tsx:24-34`, `visualSearchTypes.ts:48,63-66` |
| 8 | Home/End keys | **Done** — suggestion listbox: arrows wrap, Home/End jump, PageUp/PageDown step 10; `SortDropdown` menu gained full APG travel (ArrowUp/Down opens + moves, focus follows `aria-activedescendant`→real focus, Escape/selection return focus to trigger). | `SearchClient.tsx:155-187`, `SortDropdown.tsx` |

## Changes made this pass

- `components/search/SearchRecovery.tsx` — new optional `suggestion` prop; renders a
  "Did you mean X?" offer as the leading recovery action when the canonical correction
  also missed (closes audit gap #12).
- `components/search/SearchClient.tsx` — passes `suggestion={suggestion}` into
  `SearchRecovery` (exhausted branch only fires when both raw and corrected sets are
  empty, so the offer is honest).

## Files changed overall (this task's diff, incl. previous agent's verified work)

- **New:** `components/search/useFacetParams.ts`, `components/search/MemberResults.tsx`, `components/filters/useMediaQuery.ts`
- **Deleted:** `components/filters/ResultsSurface.tsx`, `components/filters/SortMenu.tsx` (superseded by `RefinedResults`/`SortDropdown`; zero remaining references)
- **Rewritten/extended:** `filters/filterTypes.ts` (multi-select ListingFilters + colour + sold + URL codec + relevance sort + most-liked), `search/facetCounts.ts` (colour, sold, optionsWithSelected), `search/searchMatch.ts` (scoring, weak-set suggestion, relatedSearches, scoped suggestions), `search/RefinedResults.tsx` (controlled facets, chips, related row), `search/RefinementRail.tsx` + `filters/FilterSheet.tsx` (multi-select UI, colour group, sold toggle, honest counts), `search/SearchClient.tsx` (URL facets, members, autocomplete), `search/{SearchField,SearchLanding,SearchRecovery,SortDropdown,CategoryIndex,CategoryTile,BrowseClient,CategoryClient}.tsx`, `convsearch/{convSearchEngine.ts,ChatTurns.tsx}` (comma-list hand-off + intentFromParams seeding, 44px chip targets), `visualsearch/*` (URL input, paste, ?image= deep link, keyboard region nudge), `lib/hooks/visual-search-queries.ts` (pickImageUrl/urlLoading/unreachable), `lib/store/savedSearches.ts` (shared codec), `app/categories/page.tsx`

## Verification

- `cd web && npx tsc --noEmit` — **zero errors in owned files** (remaining errors are in other agents' mid-flight files: `app/collection/[id]`, `app/profile`, `app/seller-hub/listings`, `app/u/[username]`, `lib/hooks/collections-queries.ts` — not ours).
- `npx eslint` on all 34 owned/changed files — **clean**.
- No `any`, no fabricated counts, URL params round-trip through one codec shared by
  surfaces + saved searches + conv-search hand-off.

## Concerns / hand-offs

1. **Per-tile "visually similar" (task 7 tail):** the `?image=` deep-link target is built
   and verified, but the tile affordance belongs on `components/cards/ProductTile.tsx` —
   outside this dept's ownership (already modified by another agent). Cards/feed owner
   should add an affordance linking to `/search/visual?image=<cover url>`.
2. **Cross-agent tsc:** repo-wide `tsc --noEmit` currently fails on other agents' files
   (ShopRail casing, ListingStatus 'paused', CollectionPatch null) — expected mid-flight
   churn, none in our directories.
3. **Deliberate scope calls:** facet params use comma-joined multi-values (`brand=a,b`)
   which supersedes the legacy scalar seed shape — `filtersFromParams`/`coerceFilters`
   parse both. `runSearch` to a new query resets facets except an explicit category
   scope (Vinted grammar). Region-picker keyboard path moves the box; resizing remains
   pointer-only (audit LOW, deferred).
