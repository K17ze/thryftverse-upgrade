# r6-fixC — PDP live-mode fixture evidence leak (P0)

**Workstream:** PDP market evidence + discovery rails (web)
**Scope owned:** `web/src/components/pdp/PdpMarket.tsx`, `BuyPanel.tsx`,
`PdpRails.tsx`, `web/src/app/item/[id]/page.tsx`, +
`web/src/lib/hooks/pdp-market-queries.ts` (new hook file — created by the
previous agent mid-task, rewritten here; its 3 TS errors flagged by
r6-fixA are resolved)
**Status:** FIXED — `npx tsc --noEmit` clean repo-wide; `npx eslint` clean on
all five owned files.

## Verdict on audit premise — corrected

The audit brief guessed the backend "likely" has no real source and expected
hide-in-live. **All three real endpoints exist and the mobile app already
consumes them**, so the correct fix was wiring, not hiding:

- `GET /listings/:id/sold-comparables` (`backend/api/src/index.ts:17787`) —
  aggregates real completed orders (`status IN
  paid|shipped|delivered|completed`, same category, brand-exact when set):
  `{ sampleSize, minPrice, medianPrice, maxPrice, dateFrom, dateTo }`.
  **Aggregate only — no per-item comp cards.**
- `GET /listings/:id/price-history` (`index.ts:17847`) — real rows from
  `listing_price_events`, written on every server-side price change
  (`lib/listingPatch.ts:374`, `index.ts:17350`, `19188`), newest first.
- `GET /listings/:id/related` (`index.ts:18175`) — real active listings
  matched on category/brand, reach-filtered (`reachExcludedSql` — suspended
  sellers excluded). Web service wrapper `fetchRelatedListings` already
  existed but was unused (`web/src/lib/api/services/listings.ts:177`).

Mobile parity: `frontend/src/services/listingsApi.ts:668-680`,
`hooks/itemDetail/useItemDetailData.ts:97-98` read the same two endpoints.

## Confirmed defects (all verified present before fix)

- **A** — `PdpMarket.tsx:41-42` called `priceHistoryFor`/`soldComparablesFor`
  ungated: live listings rendered fixture comps as "N similar sold £X–£Y"
  plus a "Similar sold items" strip of non-existent products.
- **B** — `BuyPanel.tsx` signalLine mixed real `views`/`likes` with the
  fixture `soldComparablesFor` count.
- **C** — `item/[id]/page.tsx:60` scored fixture `ALL_LISTINGS` via
  `similarListings`; live PDPs deep-linked fixture ids → live 404s.

## Changes

### `web/src/lib/hooks/pdp-market-queries.ts` (new, owned)

- `usePdpMarketEvidence(listing)` → `{ priceEvents, soldComps, isLoading }`.
  Live: two React Query reads (`['listing-price-history', id]`,
  `['listing-sold-comps', id]`, `enabled: DATA_MODE === 'live' && !!id`,
  `staleTime: 60s`) via `fetchJson`. Wire rows are validated — non-finite
  prices dropped, comps with `sampleSize <= 0` or null bounds → `null`.
  Fixture: synchronous `priceHistoryFor`/`soldComparablesFor` derivation
  (`useMemo`). Failed/empty live reads yield no evidence — no fallback
  fabrication.
- `SoldCompsEvidence = { count, minPrice, maxPrice, items? }` — `items`
  (per-sale comp cards) is populated **fixture-mode only**, because the
  live endpoint publishes aggregates; a live card strip would fabricate
  individual sales.
- `usePdpSimilarListings(listing, limit)` → `{ items, isLoading }`. Live:
  `fetchRelatedListings` under `['related-listings', id]`; fixture:
  `similarListings` scorer unchanged.

### `web/src/components/pdp/PdpMarket.tsx`

- Consumes `usePdpMarketEvidence`; fixture imports dropped.
- "N similar sold £min–£max" row now renders the real aggregate in live
  (same `>= 2` threshold as mobile `itemDetailDerived`), the per-item
  range in fixture.
- "Similar sold items" strip gated on `soldComps.items` — fixture-only by
  construction; in live the range row stands alone (honest absence).
- Price rows hardened for multi-event live histories: "Listed at" uses the
  **oldest** event's `previousPrice` (endpoint orders DESC); "Reduced"
  counts real reductions only (`once`/`N times · −X%`, total drop vs list
  price) — a server-recorded price *rise* produces a "Listed at" row and
  no fabricated reduction badge. Fixture single-event output unchanged.
- New live loading state — skeleton rows (`aria-busy`) while evidence is
  in flight; self-omit rule unchanged (`null` when no rows at all).

### `web/src/components/pdp/BuyPanel.tsx`

- `soldComparablesFor` import removed; `usePdpMarketEvidence(listing)`
  supplies the count (shares PdpMarket's cache keys — one fetch serves
  both). Clause pushed only when `soldComps.count >= 2`; views/likes
  clauses untouched (real per mappers). Fixture mode identical copy.

### `web/src/components/pdp/PdpRails.tsx`

- New `similarLoading` prop — the similar band renders a skeleton tile
  strip while the live related read is in flight instead of silently
  appearing late; an empty live result omits the band honestly.
- `similarTitle` doc updated: heading derives from whichever signal
  dominates the *returned* set (works for both live `/related` and
  fixture-scorer output).

### `web/src/app/item/[id]/page.tsx`

- `similarListings` fixture import dropped; `usePdpSimilarListings(listing)`
  wired to `PdpRails` (`similarItems` + `similarLoading`). Hook call is
  unconditional and `enabled`-gated on `listing?.id`.

## Verify

```text
cd web && npx tsc --noEmit            → clean (0 errors)
npx eslint <5 owned files>            → clean (0 findings)
```

## Cross-cutting flags (outside ownership)

1. **`web/src/app/auctions/[id]/page.tsx:50`** — auction PDP still feeds
   `similarListings` (fixture scorer) into its rail in live mode; same
   fixture-id deep-link → live-404 defect class. Needs the same
   `usePdpSimilarListings` wiring by whoever owns that file.
2. **`backend/api/src/index.ts:18175` `/listings/:id/related` quality** —
   ignores the `limit` query param (hardcoded `LIMIT 8`), and when the
   source listing's brand is NULL the predicate `brand ILIKE '%%'` matches
   *any* branded listing, so a brand-less listing can get a loosely-related
   rail. Results are real listings (no 404 risk), but "similar" is weak
   for null-brand/null-category rows — backend owner may want
   category-required matching.
3. **`useSellerListings` (`lib/hooks/queries.ts:41`)** — no `enabled` gate;
   `item/[id]/page.tsx` passes `listing?.sellerId ?? ''`, so one
   `GET /users//listings` fires before the listing resolves in live mode.
   Harmless (key changes to the real id, erroring query discarded) but a
   wasted request — candidate for `enabled: !!sellerId`.
4. **Aggregate-only live comps** — if product wants the per-item "Similar
   sold items" strip in live mode, `/sold-comparables` must publish sale
   rows (id/title/image/soldPrice/soldAt); current contract is stats-only.
   The UI is already shaped to absorb it via `SoldCompsEvidence.items`.
5. **Both market queries fire from `BuyPanel` and `PdpMarket`** — deduped
   by shared query keys, but the fetch now starts at buy-panel mount
   (above the fold). Intentional — the signal line needs the count; cost
   is two light GETs per PDP view.
