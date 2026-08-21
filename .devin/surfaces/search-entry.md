# Search Entry Surface Contract

> Active contract for the focused text-search surface opened from Explore. This is one convergence-loop unit, not a search-department audit.

## Surface

**Name:** Focused search entry and live suggestions  
**Route:** Explore tab → `GlobalSearch` focused entry → `GlobalSearch` results  
**Canonical files:** `frontend/src/screens/GlobalSearchScreen.tsx`, `frontend/src/screens/BrowseScreen.tsx`, `frontend/src/services/feedApi.ts`, `frontend/src/services/listingsApi.ts`, `backend/api/src/index.ts`

## User goal

Find an item, brand, category, or person with minimal typing, then land on results that preserve the exact submitted intent.

## Current-state defect

The former focused state stacked recent-search pills, saved-search cards, and eight category cards. Typed suggestions appeared in a separate rounded, shadowed dropdown sourced from resident feed rows. Selecting a suggestion then handed the query to Browse, which could ignore the production search endpoint and filter only the device's partial feed cache.

## Before → after delta

```text
Before: floating Suggestions card + a second card/chip-heavy focus dashboard;
        suggestion quality depends on loaded feed rows;
        submit can land on different local-only results.
After:  one contained search field + flat 52–58pt intent rows;
        production autocomplete owns ranking with stale-safe debounce;
        account-scoped recents appear inline before typing;
        typed rows identify Brand / Category / Item without extra chrome;
        offline/index failure falls back truthfully to on-device matches;
        submit collapses focus into results on the same search owner;
        deep-linked Browse search also sends query + filters to the backend.
```

## Observable outcomes

- The focused viewport contains at most one persistent non-media container: the search field.
- Before typing, 4–6 useful flat rows are visible; no recent-search pills or category-card grid dominates the silhouette.
- At two characters, stale suggestions disappear immediately and loading rows match final suggestion geometry.
- The first row always offers the truthful broad action: `Search for “query”`.
- At most five ranked suggestions follow; each is typed as Brand, Category, Item, or Search.
- Category suggestions use category navigation, not free-text search.
- Search history is account-scoped, hydrates without an empty-state flash, and has a 44pt Clear action.
- Autocomplete failure preserves keyboard Search and labels on-device fallback honestly.
- Submit and suggestion selection collapse into results without changing screen or search owner.
- Deep-linked Browse search sends query and active filters to the backend rather than filtering a partial device cache.
- People search starts only after the People scope is selected and has loading, empty, error, and retry states.

## States

- recents hydrating
- focused empty with recents
- focused empty without recents
- suggesting/loading
- suggesting/populated
- suggesting/no close match
- suggesting/offline fallback
- item results loading/populated/empty/error/retry
- people loading/populated/empty/error/retry

## Benchmarks and design thinking

- Apple Search: inline recent and predictive suggestions, descriptive scope, privacy-safe clear history.
- Android SearchBar: explicit expanded state and a list of suggestions below the field.
- Pinterest: search is visually primary, while media/discovery remains the color source outside focused typing mode.

## Out of scope

- Conversational search redesign
- Visual-search matching model
- Server-driven trending-query editorial system
- Search result feed-unit redesign after the Browse handoff
