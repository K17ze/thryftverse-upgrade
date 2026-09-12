# Task 12 (F08) — Visual-Search Facets: Retrieval-Scoped Contract Report

## Summary

The colour/style facet chips on `VisualSearchScreen` were candidate-local
post-filters: the backend ran visual search with no knowledge of the facet
selection, returned a recency-bounded candidate set, and the client then
text-matched the facet over *those rows only*. A facet could report "0
results" while matching listings existed outside the first 60 candidates.

Facets are now **retrieval parameters end-to-end**: the client sends
`facets: { color, style }` on `POST /visual-search`, the backend folds them
into the candidate `WHERE` clause before the candidate cap and similarity
ranking, and the response carries per-facet-value candidate counts plus a
total `matchCount`.

**Result: frontend `tsc --noEmit` → 0 errors. Backend `tsc --noEmit` → 0
errors. `visualSearchRoute.test.ts` → 12/12 pass.**

---

## What changed

### `backend/api/src/routes/visualSearch.ts`

- **Request schema**: added optional `facets: { color?, style? }`
  (`z.string().trim().min(1).max(60)` each) — no enum lock-in; matching is
  case-insensitive substring.
- **Retrieval-scoped filtering**: filter construction was split into
  `baseConditions`/`baseArgs` (category, brand, size, condition, price,
  query) and facet conditions. A selected facet appends
  `concat_ws(' ', l.title, l.description, l.brand, l.category) ILIKE $n`
  to the candidate query — the same honest text-matching semantics the
  client used (there is no `color`/`style` column on `listings`; the
  `color` field in `database-types.ts` is aspirational and no migration
  creates it), but now applied *inside* SQL so the candidate set itself
  is narrowed before `CANDIDATE_CAP` and before similarity scoring. The
  filter-only fallback re-query uses the same conditions, so facets hold
  there too.
- **Facet counts**: canonical vocabularies `COLOR_FACET_VALUES` /
  `STYLE_FACET_VALUES` (mirroring the frontend contract lists) are counted
  via one aggregate query per dimension using `COUNT(*) FILTER (WHERE …)`.
  Standard faceted-search scoping: colour counts are computed under every
  filter *except* the colour facet, style counts under every filter except
  the style facet — so selecting a value does not zero out its siblings.
  A third aggregate returns `matchCount` under the full scope. All three
  run via `Promise.all`, kicked off after the candidate fetch so they
  overlap image decode/scoring, and are best-effort (failure logs
  `visual_search.facet_count_failed` and omits `facets` — the search never
  fails on counting).
- **Response**: adds `facets: { colors: [{value,count}…], styles: […] }`
  and `matchCount: number`; request log now records `matchCount`,
  `colorFacet`, `styleFacet`.

### `frontend/src/services/listingsApi.ts`

- `visualSearch()` accepts `facets?: { color?: string; style?: string }`
  and forwards it in the POST body.
- `VisualSearchResult` gains `facets?: VisualSearchFacets` and
  `matchCount?: number`; new exported types `VisualSearchFacetBucket` /
  `VisualSearchFacets`.
- **Honest-empty fix**: the wrapper previously set
  `error: 'No listings match your photo filters yet.'` whenever
  `items` was empty. The screen maps `error + empty` to the
  "Couldn't load results" *error* state — so a legitimately zero-match
  facet scope would have rendered as a connection error. `error` is now
  set only when `payload.ok === false`, matching the
  `fetchFilteredListings` contract ("a successful empty response is an
  empty state, not a transport error").

### `frontend/src/screens/VisualSearchScreen.tsx`

- `buildFilterPayload` now emits `facets` from `selectedColor` /
  `selectedStyle` (deps updated); facets ride the same request as every
  other filter when the user taps Apply filters / refresh / retake.
- Removed the client-side post-filter block over `apiResult.listings`
  (old lines ~297-312). Empty results now mean "no listings match this
  facet scope" and render the existing `No matches found` empty state
  with the `Clear filters` CTA — honest, and reachable.
- New `facetCounts` state (`{ colors, styles }` records keyed by facet
  value) populated from `apiResult.facets`; cleared to `null` on the
  offline/error catch and on `handleRemoveImage` so chips never show
  fabricated or stale numbers.
- Facet chips display the server count inline when known
  (`Red · 12`, same pill/text style — no layout change) and announce it
  via `accessibilityLabel` (`Filter by Red, 12 items`), consistent with
  the existing category-rail pattern.
- Offline/cached fallback (`filterCachedListings`) intentionally retains
  client-side facet matching — the cached list is the entire dataset
  available offline, so filtering it is retrieval-scoped for that source.
- `handleRemoveImage` now also resets `selectedColor`/`selectedStyle`
  (previously they survived "start over" — a pre-existing inconsistency
  made visible by the facet fix).

### `backend/api/src/__tests__/visualSearchRoute.test.ts`

- **Pre-existing harness bug fixed**: `createMockApp` exposed
  `get handler()` which threw at destructure time
  (`const { app, handler } = createMockApp()` runs the getter before
  `registerVisualSearchRoutes`). The whole suite was failing 9/9 at HEAD.
  `handler` is now a stable function that delegates to the captured route
  handler at invocation time — all 9 existing tests pass unchanged.
- **New "Retrieval-scoped facets (F08)" describe block (3 tests)**:
  - facet selections appear as `ILIKE` conditions + bound `%value%` args
    in the candidate SQL (not a post-filter);
  - response carries `facets.colors` (10 buckets), `facets.styles`
    (8 buckets) and `matchCount`;
  - each dimension's count scope excludes its own facet but includes the
    other (colour scope args = `['%Vintage%', …10 vocab]`; style scope =
    `['%Red%', …8 vocab]`).

---

## How facets are now retrieval-scoped

```
chip select → Apply → buildFilterPayload { facets:{color,style} }
  → POST /visual-search
  → zod schema → WHERE … AND concat_ws(title,description,brand,category)
                 ILIKE '%facet%'
  → candidate set narrowed in SQL (before CANDIDATE_CAP=60 and ranking)
  → colour/style counts + matchCount aggregated in parallel
  → response { items, facets, matchCount }
  → chips show server counts; empty scope → honest "No matches found"
```

## Constraints respected

- No visual layout change: same rails/pills; counts render inside the
  existing pill text. No new components, no new screens.
- No new features: facet values, chip rails, apply/clear flow unchanged.
- `frontend/src/components/coown/` untouched.
- Navigation, analytics (`visual_search.*` log lines extended, not
  removed), haptics, request sequencing (sequence counter + AbortController)
  all preserved.

## Concerns

1. **Facet matching is honest text matching, not image analysis.** Colour
   facets match the word "red" in title/description/brand/category — a
   listing of a red item whose copy never says "red" won't match. This is
   the same semantics as before (now honestly scoped server-side); true
   colour-attribute matching would need a `listings.color` column populated
   at listing time — out of scope for this contract fix.
2. **Vocabulary duplication.** `COLOR_FACET_VALUES`/`STYLE_FACET_VALUES`
   on the backend mirror `COLOR_FACETS`/`STYLE_FACETS` on the frontend;
   there is no shared package between the two, so the lists are the
   contract and are commented as such on both sides.
3. **Three extra aggregate queries per request.** Single-table `COUNT`
   aggregates, run in parallel with image scoring and best-effort guarded.
   On a very large `listings` table the `ILIKE` facet counts are not
   index-assisted — acceptable at current scale, worth revisiting if
   visual-search QPS grows.
4. **Test suite was broken at baseline** (eager getter — all 9 tests
   failing before this change). Fixed the harness so the suite actually
   runs; flagging in case the failing suite was masking other intent.
5. Cached-fallback note: when the API returns an honestly-empty facet
   scope but cached listings contain matches, the screen still shows the
   cached results labelled `partial` ("Some results from your saved
   data") — pre-existing fallback contract, kept deliberately.
