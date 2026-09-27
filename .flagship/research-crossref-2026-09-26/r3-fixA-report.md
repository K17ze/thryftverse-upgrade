# R3 Fix-A Report — honesty defects, wave-3 review

Status: **done — all 8 fixes landed, `tsc --noEmit` clean, `eslint` clean on every changed file.**

## Fixes

### 1. P0 — Offer-to-likers live fabrication → wired to the real endpoint
The backend route exists: `POST /listings/:listingId/offers-to-likers`
(`backend/api/src/routes/listingOffers.ts:1497`), mirrored by mobile
`sendOfferToLikersOnApi` (`frontend/src/services/listingOffersApi.ts:257`).

- `web/src/lib/api/services/commerce.ts` — added `sendOfferToLikers(input)`
  (`SendOfferToLikersInput` / `OfferToLikersResult`, same field contract as
  mobile: `offerPriceGbp` canonical, `discountPercent` informational,
  `expiryHours`, `includeFreeShipping`, `idempotencyKey`). The `ok:false`
  envelope rejects via `ApiRequestError` — no soft success.
- `web/src/components/pdp/OfferToLikers.tsx` — `handleSend` now branches on
  `DATA_MODE`. Live: mints a `likeroffer_*` batch idempotency key held in a
  ref across retries (cleared on success, per-listing reset — mobile
  `offerBatchKeyRef` parity), posts the send, and:
  - `created > 0` → records the sent banner with the **real** recipient
    count (`result.created`, not the button's liker count) + success toast.
  - `created === 0` → closes the sheet with an honest info toast
    ("No likers could receive this offer" — mobile `offerToLikersNone`)
    and records no sent state.
  - error → error toast, batch key retained so a retry replays the same
    idempotency key; no sent state, sheet stays open.
  Fixture mode keeps `recordLikerOffer` — a real session-local write, the
  same model as `recordSentOffer` elsewhere in the PDP.
- `web/src/components/pdp/OfferToLikersSheet.tsx` — added a `sending` prop:
  the Send button disables and reads "Sending…" while the live write is in
  flight (double-submit guard, mobile `offerSending` parity).

### 2. P0/P1 — Fixture carrier fabrication removed
- `web/src/lib/commerce/offerAcceptance.ts` (~line 87) — session-created
  orders now write `carrier: null, service: null` into `ORDER_DETAILS`.
  `orders/[id]/page.tsx` already renders null gracefully (Postage row drops
  the carrier suffix; `OrderTrackingSection` only shows carrier under a real
  `trackingNumber`; `OrderTimeline` shows "Awaiting dispatch").
- ⚠️ **Concern (out-of-scope file):** `fixtures-commerce.ts` re-fabricates
  the same carrier downstream — `commerceOrderDetailFor` line ~998-999
  (`enr.carrier ?? base?.carrier ?? 'Royal Mail'` / `'Tracked 48'`),
  `orderDetailFor` line ~311-312, and the checkout `ORDER_DETAILS` write at
  ~383-384. My fix removes the lie at the accept-offer write site, but the
  resolvers will still print "Royal Mail · Tracked 48" for orders with no
  carrier on record until those `?? 'Royal Mail'`/`'Tracked 48'` fallbacks
  are replaced with null pass-through. Owner of fixtures-commerce.ts should
  follow up.

### 3. Soft-failure `ok:false` — `respondToOffer` rejects
- `web/src/lib/api/services/commerce.ts` — both the `counter` branch and the
  `accept`/`decline`/`cancel` branch now type the response envelope
  (`{ ok?, error? }`) and throw `ApiRequestError` when `ok === false`.
  All callers (`app/offers/page.tsx`, `useChatOffers.ts`,
  `useWithdrawListingOffer`) already have `.catch` paths that revert the
  optimistic row and show the error toast.
- `chat.ts deleteChatMessage` — **already fixed** by a concurrent change
  before my edit landed: it now assigns the payload and throws on
  `!payload.ok` (`web/src/lib/api/services/chat.ts:268-279`). No edit made.

### 4. Dispatch SLA honesty — `BuyPanel.tsx` ~570
Committed copy ("Dispatches within N days") now renders only when
`listing.dispatchSlaDays` is a real contract number > 0. When the field is
absent the line reads "Typically dispatches in 3 days" (platform default —
a norm, not the seller's promise). Singular "day" preserved for the
contract path.

### 5. `FeedExplanationSheet` mislabel fixed
`decision_service_unavailable` no longer masquerades as "Listing quality".
It maps to **"Standard catalogue order — personalisation unavailable"**
(the code is emitted by the fallback heuristic serve, backend
`recommendations.ts:352`, paired with the real `listing_quality` code).
`SERVE_MODE_NOTE.degraded_baseline` already backs the same story in the
sheet footer.

### 6. Explore "Show less" no-op fixed
`app/explore/page.tsx` now pipes visible units through `rankFeedUnits` with
`downweightedKeys` — matching facet keys demote to the tail of the listing
slots exactly like home. Boosts are deliberately not applied (`likedIds`/
`followingIds` empty): explore advertises itself as non-personalised
catalogue order, so only the user's own down-weights adjust it.

### 7. MyBids `bidState:'active'` → honest label
The wire union (`MyAuctionBidApi.bidState` = `'active' | 'leading' | 'outbid'
| 'won' | 'lost'`) distinguishes `active` from `leading`; mobile labels it
"Active" (hammer icon). Changes:
- `web/src/lib/contracts/auction.ts` — `MyBidStatus` gains `'active'`
  (additive; doc notes it must never collapse into 'winning').
- `web/src/lib/hooks/auction-queries.ts` — `MyBidsBoard` gains an `active`
  bucket; mapping is now explicit: `leading → 'winning'`, `active →
  'active'`, and any other/future wire value lands on `'active'` instead of
  claiming a lead.
- `web/src/components/auctions/MyBidRow.tsx` — `STATUS` gains
  `active: { label: 'Active', icon: 'auction', tone: 'text-brand' }`
  (native parity; forced edit since the Record is exhaustive over the
  union).
- `web/src/app/auctions/my-bids/page.tsx` — `board.active` rows join the
  Active tab after outbid and winning.
Note: backend `index.ts:39166-39177` currently always overwrites the
`'active'` default, so the state is defensive — but the label is now honest
if it ever ships.

### 8. ChatPanel edit-window lower bound
`ChatPanel.tsx` line ~591 (now ~644): the editable predicate requires
`age >= 0 && age < MESSAGE_EDIT_WINDOW_MS` — a future-dated timestamp can
no longer slip in as editable. Single-line change; nothing else touched.

## Files changed
- `web/src/lib/api/services/commerce.ts` — `respondToOffer` envelope
  validation + new `sendOfferToLikers`
- `web/src/components/pdp/OfferToLikers.tsx` — live send wiring
- `web/src/components/pdp/OfferToLikersSheet.tsx` — `sending` prop
- `web/src/lib/commerce/offerAcceptance.ts` — carrier/service → null
- `web/src/components/pdp/BuyPanel.tsx` — SLA copy split
- `web/src/components/feed/FeedExplanationSheet.tsx` — reason-code label
- `web/src/app/explore/page.tsx` — downweight demotion
- `web/src/lib/contracts/auction.ts` — `MyBidStatus` + `'active'`
- `web/src/lib/hooks/auction-queries.ts` — `active` bucket + honest mapping
- `web/src/components/auctions/MyBidRow.tsx` — `Active` row label
- `web/src/app/auctions/my-bids/page.tsx` — include `board.active` in tab
- `web/src/components/inbox/ChatPanel.tsx` — edit-window `>= 0` bound

Not changed (already correct / out of scope): `chat.ts` (ok:false guard
already present), `offerRules.ts`, `listings.ts`, `dispatch.ts`,
`fixtures.ts` (liker-offer session store reused as the honest sent-state
view model in both modes).

## Test result
`cd web && npx tsc --noEmit` → **0 errors**; `npx eslint` on all 12 changed
files → **0 errors, 0 warnings**.

## Concerns for the parent agent
1. **fixtures-commerce.ts carrier fallbacks still fabricate** (item 2
   above) — the accept-offer write is honest now, but
   `commerceOrderDetailFor`/`orderDetailFor`/checkout-order-creation
   still inject 'Royal Mail'/'Tracked 48' when nothing is on record.
   Owned by another workstream; needs a follow-up to pass `null` through.
2. I extended `contracts/auction.ts` and `MyBidRow.tsx` — nominally
   another agent's auction files — because the honest `'active'` mapping
   is impossible without the union member and the exhaustive Record entry.
   Both changes are additive/one-line; flag for merge awareness.
3. Offer-to-likers sent-state in live mode is session-local
   (`SENT_LIKER_OFFERS` map) — the backend exposes no "did I already send
   a batch" read, so a reload re-offers the affordance. Same honesty model
   as mobile (which likewise has no persisted read); not a regression.
