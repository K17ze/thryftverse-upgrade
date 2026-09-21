# Repair R6 — Leaf Repair Report

Scope: review-backend P1-1 (non-public listings via `/search/semantic` + `/search/autocomplete`),
P1-3 (frontend notification contract for the five new backend event types), P2 (autocomplete
`retrievalMeta`/staleness disclosure). Resumed an interrupted pass — the prior pass had already
landed `search.ts` (+136) and `notificationsApi.ts` (+53); this pass verified, repaired the one
broken adjacent test, and ran the full verification loop.
Status: **complete** — typecheck clean on both packages, all focused + adjacent tests green.
Not committed.

---

## P1-1 — Non-public listings via semantic/autocomplete — VERIFIED LANDED

All three layers of the fix are in place:

- **`backend/api/src/routes/search.ts:719-737`** (`POST /search/semantic`): every returned id is
  now re-checked `WHERE id = ANY($1::text[]) AND status = 'active'` — unconditionally, anonymous
  viewers included (previously only `seller_id` was re-checked, and only when the viewer had block
  exclusions; hits whose row no longer existed were *served*). An id absent from `sellerById` is
  dropped, never rendered; the same lookup carries `seller_id` for the bidirectional block
  exclusion. Over-fetch raised to `min(limit + 50, 200)` unconditionally so the page stays full.
- **`backend/api/src/routes/search.ts:577-629`** (`GET /search/autocomplete`): suggestions are
  terms, not ids, so the route corroborates each suggestion against live rows — a suggestion is
  served only when at least one `status='active'` listing matches it via escaped-ILIKE across
  title/description/brand/category/size/condition (`unnest` + `EXISTS`, `ESCAPE '\'`, wildcards in
  suggestion text escaped). Over-fetches `min(limit*2, 40)` so dropped suggestions don't starve the
  response.
- **`backend/api/src/lib/vectorSearch.ts:205-217`**: the hybrid Meilisearch query itself is
  constrained to the active corpus — `buildMeiliFilter({ ...filters, status: 'active' })`, applied
  last so a caller-supplied filter can never widen past it. Verified `status` is a configured
  filterable attribute (`searchSync.ts:114-120`, applied identically to staged indexes on the
  blue/green path).
- Lexical `/search` legs were already safe (`search.ts:430-435` scope=all card query,
  `524-534` items leg — both `status = 'active'`, both drop-on-absent); the prior pass also
  tightened the items leg to always over-fetch and slice after filtering.

**Residual risk (owned elsewhere — `searchSync.ts` NOT edited per instructions):**
`syncSingleListing` (`searchSync.ts:318-329`) still indexes `draft`/`paused`/`risk_pending`
documents — only `deleted`/`sold` are removed. The serving-time nets now make this unreachable
through every public search route, and the hybrid query filters it server-side, but the index
corpus still diverges from the `status='active'` corpus the full sync and fallback priming use.
The fix is the other agent's scope; the read-side nets landed here keep the divergence non-public
even if it lands later or not at all.

## P1-3 (task P1-2) — Frontend notification contract — VERIFIED LANDED

- **`frontend/src/services/notificationsApi.ts`**: `NotificationEventType` union gained
  `order_delivery_failed`, `order_parcel_lost`, `order_parcel_damaged` (lines 16-18) and
  `coown_price_alert_triggered`, `coown_drip_receipt` (lines 60-61). `NotificationEventRegistry`
  entries: parcel failures at 481-501 (`commerce`/`important`, per-order aggregation + order
  objectRef — grouped directly after `order_dispatch_sla_breach`, next to the delivery events);
  co-own at 869-890 (`financial`/`important`, per-asset `coown_alert:`/`coown_drip:` aggregation —
  grouped with `coown_buyout_accepted`/`coown_verification_responded`).
- **`frontend/src/components/notifications/notificationViewModels.ts`**:
  `EVENT_TYPE_CARD_MAP` — parcel failures → `'order'` (113-115, beside `order_delivered`);
  co-own → `'order'` (157-158, beside the existing co-own mappings). `FILTER_EVENT_TYPES.order`
  now carries all five (452-454, 471-474) — co-own events live in the commerce/order bucket, which
  is the sensible grouping since no co-own filter exists and the existing co-own types already
  mapped there.
- `inAppNotificationsApi.ts` prefix fallback untouched — nothing dropped before, now typed.

## P2 — Autocomplete `retrievalMeta`/staleness

- `retrievalMeta` + `serveMode` now attached to `/search/autocomplete` (`search.ts:619-629`) —
  a degraded/fallback-served autocomplete is disclosed (`backend: 'in_memory'` +
  `serveMode: 'cold_start'`), parity with every other search route. Pinned by test.
- **Staleness (`lastSyncedAt`): NOT added — not trivially addable from leaf scope.** No
  corpus-age timestamp is tracked anywhere: `RetrievalInfo` (`searchAdapter.ts:39-58`) has no
  staleness field, the fallback mirror records no priming timestamp, and a per-request proxy
  (e.g. MAX over corroborated rows) would fabricate a signal. Adding an honest one requires
  `searchAdapter.ts`/`searchIndex.ts` bookkeeping — flagged for a follow-up owner.

## Tests (FAIL on pre-fix behaviour)

- **`backend/api/src/__tests__/searchPublicVisibility.test.ts`** (new, prior pass, 6 tests —
  node:test dialect): semantic drops a non-active indexed hit even for anonymous viewers and
  asserts the re-check SQL carries `status = 'active'`; active hits still served; block exclusion
  still applies after the re-check; autocomplete drops a term corroborated only by non-active
  listings, serves corroborated terms with `retrievalMeta`/`serveMode`, and asserts the
  corroboration SQL is scoped to `l.status = 'active'`. Every assertion fails on the old code —
  the re-check and corroboration queries did not exist.
- **`frontend/src/__tests__/notificationEventContract.test.ts`** (new, prior pass, 21 tests —
  vitest): each of the five types resolves a registry entry (not `generic`), correct semantic
  role/attention/aggregation key, typed card (`'order'`, not `generic`), and membership in the
  `order` filter bucket. Fails wholesale on the old contract — the types weren't in the union.

## Test repair this pass

- **`backend/api/src/__tests__/searchScoped.test.ts`** — the unconditional status re-check broke
  `default scope=items keeps the legacy items payload` (its fake DB returned nothing for the
  re-check, so the seeded listing was correctly dropped). Added an `isListingRecheckQuery` matcher
  and corroborated `lst_v1` as active in that test — the assertion target (legacy payload shape)
  is unchanged.

## Verification

- `cd backend/api && node --import tsx --test src/__tests__/searchPublicVisibility.test.ts` — **6/6**.
- `node --import tsx --test` on `searchScoped`, `searchAdapterDegradation`,
  `retrievalSourceContract`, `searchReindexLease`, `searchCache` — **67/67 pass** (includes the
  repaired scoped test).
- `cd backend/api && npx vitest run vectorSearchIntegration` — **17/17** (vitest-dialect file;
  `node --test` is the wrong runner for it — the repo's `run-unit-tests.mjs` classifies by import).
- `cd frontend && npx vitest run notificationEventContract notificationRouting` — **51/51**.
- `npx tsc --noEmit` in `backend/api` and `frontend` — **both clean**.

## Files touched (this pass)

| File | Change |
|---|---|
| `backend/api/src/__tests__/searchScoped.test.ts` | `isListingRecheckQuery` matcher + active-row corroboration in the default items-scope test |

Prior pass (verified, not re-edited): `backend/api/src/routes/search.ts`,
`backend/api/src/lib/vectorSearch.ts`, `frontend/src/services/notificationsApi.ts`,
`frontend/src/components/notifications/notificationViewModels.ts`,
`backend/api/src/__tests__/searchPublicVisibility.test.ts` (new),
`frontend/src/__tests__/notificationEventContract.test.ts` (new).

Nothing committed. `.flagship` canonical files untouched. `searchSync.ts` not edited
(other agent's scope — residual risk noted above).
