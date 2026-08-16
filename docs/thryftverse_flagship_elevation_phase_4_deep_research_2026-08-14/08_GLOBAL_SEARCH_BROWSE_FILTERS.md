# Global Search, browse and filters

## Code surfaces inspected / affected

- `frontend/src/screens/GlobalSearchScreen.tsx`
- `frontend/src/screens/BrowseScreen.tsx`
- `frontend/src/screens/FilterScreen.tsx`
- `frontend/src/components/ui/AppSearchBar.tsx`

## Current diagnosis


GlobalSearch has strong truth work: backend search, people scope, saved/recent searches, canonical categories, search-time ranking and no invented commerce facts.

The main Phase 4 issues are semantic:
- `TRENDING_CATEGORIES` is actually `CATEGORIES.slice(0, 8)`, not trend data.
- general search exposes `Ending soon` as a sort even when the user may not be searching auctions.
- sync/status components risk making backend health visually present in normal browsing.
- search, filtering and browse can still feel like separate routes rather than one intent.


## User psychology / product job


Search is a high-intent state. Users want:
1. acknowledgement of the query;
2. immediate plausible results;
3. easy refinement;
4. recovery if the wording was poor.

They do not want to understand which backend/search strategy is active.


## Flagship target composition


Idle:
- search;
- recent;
- saved searches;
- Browse categories;
- visual search;
- optional personalized suggestion group.

Typing:
- autocomplete/suggestions;
- recent matching terms.

Results:
- result grid/list;
- Items/People scope;
- filter/sort as one compact row;
- active tokens only when active.

No-result:
- spelling/broaden suggestions;
- category alternatives;
- clear query edit.


## Detailed implementation map


1. Rename fake “Trending categories” to `Browse categories` until a server trend signal exists.
2. Split sort availability by commerce family:
   - normal listings: Relevance, Newest, price.
   - auctions: Ending soon, most bids, etc.
3. Build `SearchFacetModel` from server-authoritative facets when available.
4. Maintain query + scope + filters in one route/state object.
5. Filter sheet applies without replacing the result universe.
6. Provide result-count preview only if the API can return it cheaply and truthfully.
7. Remove persistent SyncStatusPill from healthy state.
8. Visual search results should support:
   - select/reselect object/region;
   - “similar shape/style/color” refinement;
   - marketplace filters after visual retrieval.
9. Search history clear is available but not visually overprominent.
10. Saved-search affordance should appear only after a meaningful query/filter state.


## Micro-detail pass


- Search bar geometry does not change between idle and results.
- Filter chips use concise noun phrases.
- Avoid a row of 6+ chips; horizontal overflow with “Filters” summary.
- Sort is one control; do not duplicate as both chip and sheet section.
- People result rows are avatar/identity-first, flat.


## Acceptance / screenshot QA


Tests:
- typo;
- one-character query;
- 2+ character search;
- empty backend;
- offline cached;
- people;
- visual;
- filtered;
- saved search;
- price sort;
- auction query.

Pass:
- no fake “trending” label;
- no irrelevant sort option;
- no healthy-state infrastructure UI.


## Reference crosswalk


- Apple 2026: one primary search location; suggestions; scope/tokens within results.
- Depop 2026: relevance is the strongest search factor.
- Vinted 2026: query + expressed filters + ontology + image resemblance.
- Pinterest: visual object/region as query.
