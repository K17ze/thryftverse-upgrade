# Task 7 — UnifiedDiscoveryScreen P1 defect fixes (F06 scope reset, F07 fabricated values)

**Status:** DONE_WITH_CONCERNS
**Date:** 2026 (current session)
**Scope:** `frontend/src/screens/UnifiedDiscoveryScreen.tsx` + minimal type-chain fixes in the search-result pipeline.

---

## 1. What was changed

### F06 — Search scope resets while typing

**File:** `frontend/src/screens/UnifiedDiscoveryScreen.tsx`

- Removed `setSearchScope('items')` from the query-change debounce effect (was line ~212). Scope is now exclusively user-controlled via the scope tabs (`onScopeChange={setSearchScope}`, unchanged at the `SearchResultsView` call site).
- Added `searchScope` to the effect's dependency array and added an early return for the People scope:

  ```tsx
  // Scope is user-controlled — this effect must never override an explicit
  // Items/People selection. When the People scope is active, the
  // people-search effect below owns the query; item results stay cached so
  // toggling back to Items is instant.
  if (searchScope !== 'items') {
    setIsSearching(false);
    return;
  }
  ```

- Effect deps: `[normalizedQuery, searchScope, searchRetryCount]` (was `[normalizedQuery, searchRetryCount]`).

**How scope preservation works:**
- Typing/editing the query while `searchScope === 'people'` no longer calls `setSearchScope('items')` — the selection is preserved.
- When People scope is active, the items effect skips `searchListingsFromApi` entirely (no wasted fetch); the existing separate people-search effect (lines ~258–273, deps `[normalizedQuery, searchScope]`) already owns the query and calls `searchUsers(normalizedQuery, 20)` — it never resets scope, so no change was needed there.
- Switching scope back to Items re-runs the items effect (scope in deps), sets `isSearching`, and refetches for the current query after the 300ms debounce (constant `SEARCH_DEBOUNCE_MS = 180` — actual timer unchanged; the people effect uses its existing 300ms timer — both preserved).
- Item results are intentionally kept cached while People scope is active, so toggling back shows previous results immediately while a fresh fetch runs (stale-while-revalidate).
- Cleanup (`cancelled = true; clearTimeout(timer)`) cancels any in-flight items fetch when scope flips to People mid-debounce.

### F07 — Search adapters fabricate zero values

**File:** `frontend/src/screens/UnifiedDiscoveryScreen.tsx` (adapter in the debounce effect)

```tsx
// before
price: Number(item.priceGbp ?? 0),
likes: 0,

// after
price: typeof item.priceGbp === 'number' && Number.isFinite(item.priceGbp)
  ? item.priceGbp
  : null,
likes: null,
```

- `price`: `null` when the search row has no usable price — never a fabricated £0. `Number.isFinite` also guards non-finite numbers.
- `likes`: `null` — the `/search/listings` response carries no engagement counts, so `null` ("unknown") replaces the factual-looking `0` ("nobody liked it"). The discovery tile does not render a likes line anyway, so there is no visual change.
- `condition: null` kept as-is (honest null per brief).

**Type chain (minimal):**

1. `frontend/src/contracts/DiscoveryListingSummary.ts`
   - `DiscoveryListingSummary.price`: `number` → `number | null`
   - `DiscoveryListingSummary.likes`: `number` → `number | null`
   - `ListingLike.price`: `number` → `number | null`
   - `ListingLike.likes`: `number` → `number | null`
   - `mapListingToDiscoverySummary`: `price: source.price ?? null`, `likes: source.likes ?? null` (normalizes `undefined` → `null`)
   - Doc comments updated (removed the incorrect "price is always present" invariant; documented that `null` means "omit, don't fabricate £0").

2. `frontend/src/services/feedApi.ts`
   - `SearchApiResult.items[].priceGbp`: `number` → `number | null` — the search index can legitimately return rows without a price; the contract is now honest. Only consumers are `UnifiedDiscoveryScreen` (fixed) and `useGlobalSearch` (still compiles — its `Number(item.priceGbp ?? 0)` accepts `number | null`).

3. `frontend/src/components/ProductCard.tsx` — `ProductDiscoveryTileBase` (`item: Listing | DiscoveryListingSummary`)
   - New `priceLabel` derivation: `item.price != null && Number.isFinite(item.price) ? formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' }) : null`.
   - Price `<Text>` is omitted when `priceLabel` is `null` (tile shows media + title only — per brief, omission is an accepted handling; consistent with the tile's metadata budget).
   - Accessibility label uses `priceLabel ?? 'price unavailable'` — same honest wording already used by `ItemDetailScreen` (line ~551), so screen readers never hear a fabricated amount.

**How null price/likes are handled downstream:**
- `ProductDiscoveryTile` — omits the price line, a11y label says "price unavailable". (`Listing` from `domain` keeps `price: number`, so legacy grid paths render unchanged.)
- `ItemDetailScreen` — already handles `price === null` (`'Price unavailable'`, lines 545–563) since `services/listingsApi.Listing.price` was already `number | null`; `buildCapabilities` already maps `price === null` → `unavailableReason: 'missing_price'` (fail-closed).
- `likes: null` — no consumer reads `DiscoveryListingSummary.likes` for rendering; verified by grep.
- `DiscoverScene.tsx` — untouched; it feeds `domain.Listing[]` (price: number) through `assembleDiscoveryFeed` → `buildListingFeedUnit`, which still type-checks against the widened `ListingLike`.
- `useShareListing` has its own structural `ListingLike` (`price: number`) — it is defined but never called by any screen/component, so no breakage.

---

## 2. Verification

### tsc

Command run from `frontend/`:
```
node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
```

**Result for touched files: 0 errors.** `grep -E "UnifiedDiscovery|DiscoverScene|DiscoveryListingSummary|discoveryFeedUnit|ProductCard|PinterestMasonryGrid|useShareListing|feedApi|listingMapper"` over tsc output → no matches.

**Whole-project tsc exit = 2 with 6 pre-existing errors, ALL in files untouched by this change:**

| File | Error | Provenance |
|---|---|---|
| `src/components/groupchat/GroupMemberRow.tsx` | TS2307 `Cannot find module '../Avatar'`; 2× TS2551 `semiBold` → `semibold` | Directory is **untracked** (`??` in git status) — concurrent in-flight work |
| `src/components/groupchat/GroupMembersDirectory.tsx` | TS2551 `semiBold` → `semibold` | Same untracked directory |
| `src/screens/GroupChatInfoScreen.tsx` | TS2322 `mediaType` undefined mismatch | Heavily rewritten by concurrent work (2035-line diff vs HEAD) |
| `src/screens/LiveShoppingHomeScreen.tsx` | TS2345 event-name literal | Same — 1077-line concurrent rewrite |

None of these files import the discovery contracts, `feedApi`, or `ProductCard`; the errors are self-contained type mismatches introduced by parallel in-flight edits. (Note: an earlier baseline run in this session reported 0 errors — the untracked `groupchat/` files appear to have landed between runs. Either way they are provably unrelated to this diff.)

### Tests

`Get-ChildItem -Recurse -Filter "*discovery*"` under `frontend/src/__tests__/` → `discoverySurfaces.test.ts`. It exercises `feedApi.searchListingsFromApi` (mock `priceGbp: 45` numbers — still valid under `number | null`) and asserts no `UnifiedDiscoveryScreen` adapter behaviour. `visualRegressionPlan.test.ts` / `e2eSmokePlan.test.ts` only assert the screen file and baselines exist. No test updates needed. Tests were not executed (typecheck + manual trace only).

---

## 3. Concerns / notes for the parent agent

1. **Pre-existing tsc errors (6) in concurrent work** — `groupchat/` (untracked), `GroupChatInfoScreen.tsx`, `LiveShoppingHomeScreen.tsx`. Not mine, but they will fail a whole-project `tsc` gate until whoever owns those files fixes them.
2. **`useGlobalSearch.ts` has the identical F06 + F07 defects** (`setSearchScope('items')` on query change at line ~86; `price: Number(item.priceGbp ?? 0)`, `likes: 0` at ~123–124). It appears to be dead code (no importer found in `src/`), so it was left untouched per scope constraints — flagging for a follow-up fix or deletion.
3. **`useShareListing`** is dead code (no call sites). Its structural `ListingLike.price: number` would reject a `DiscoveryListingSummary` now that price is nullable — if it's ever wired up, share copy needs a null-price path.
4. **`category: item.category ?? ''`** in the adapter still maps a missing category to `''` (required by `ListingLike.category: string`). Not part of the flagged defects; noting for completeness since it's a milder fabrication (empty string, not a fake value).
5. No visual layout changes; no new features; no `components/coown/` files touched; navigation/analytics/haptics/state handling preserved; both debounce timers (180ms items constant, 300ms people) unchanged.
