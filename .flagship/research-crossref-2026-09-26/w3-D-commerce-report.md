# W3-D — Commerce implementation report

## Status

**Done (with pre-existing, out-of-scope compile failures elsewhere in the tree).**

The PDP now renders contract-backed delivery cost, ETA window, dispatch SLA
and returns lines; offers carry the one-active-offer guard plus the −40%
floor; Q&A reads and writes the real API in live mode; the lightbox zoom is
genuine magnification with pan + keyboard; live unpaid orders get a real
"Pay now" path via payment-intent re-attach.

## What changed

### Delivery & returns truth (P0)

- `web/src/lib/contracts/domain.ts` — additive optional fields on `Listing`:
  `shippingPrice`, `estimatedDeliveryStart/End`, `returnPolicy`
  (new `ListingReturnPolicy`), `dispatchSlaDays`; plus `moderationState` on
  `ListingQuestion` / `ListingQuestionAnswer` for author-visible quarantine.
- `web/src/lib/api/mappers.ts` — `BackendListingRow` accepts the flat +
  snake_case aliases; `normalizeReturnPolicy` + ISO-date guards; the listing
  mapper populates the new fields when present.
- `web/src/lib/api/services/listings.ts` — `fetchListingById` now merges the
  `/listings/:id` `commerce` block (`shippingPrice`, ETAs, `returnPolicy`,
  `shippingMethod`/`shippingPayer` fallback, `dispatchSlaDays`, and
  `priceWithProtection` = `itemPrice + buyerProtectionFee` — verified against
  the backend's `estimatedTotal` construction at `index.ts:17616-17621`).
- `web/src/components/pdp/BuyPanel.tsx` — the shipping line is now the
  mobile `ShippingReturnsInfo` block: `Free postage` / `£X postage`,
  `Arrives 28 – 30 Sep` style ETA (range, single-bound, stale-suppressed),
  `Dispatches within N days`, and the returns line with conditions —
  each with honest fallbacks when the contract is silent.
- `web/src/lib/data/fixtures-commerce.ts` — `LISTING_DELIVERY` overlay gives
  fixture listings realistic delivery facts (mixed postage prices, ETAs,
  14-day/7-day/no-returns, one seller-covered parcel, one express seller
  SLA); uncovered listings exercise the fallbacks.

### Dispatch certainty (P1)

- `web/src/lib/commerce/dispatch.ts` — corrected `DISPATCH_SLA_DAYS` 2 → **3**
  and "working days" → calendar "days" to match the backend truth
  (`config.dispatchSlaDefaultDays`, default 3; SLA measured as
  `paid_at + slaDays × 24h`). All surfaces reading the constant now agree
  with the order rights snapshot.
- PDP `BuyPanel` renders "Dispatches within N days" (listing SLA wins,
  platform default otherwise); `/checkout` renders the same line next to
  the Pay button (max SLA across parcels).

### Offer rules (P1)

- `web/src/lib/commerce/offerRules.ts` (new) — `MAX_OFFER_DISCOUNT_PCT = 40`
  and `minOfferAmount`. No server/native floor constant exists; this is the
  marketplace-standard −40% client-side floor, stated in the sheet copy.
  Counters are exempt (negotiation is then between the parties/server).
- `OfferSheet` — live below-floor hint + submit-time error with the minimum
  amount; "Offers can be up to 40% below asking" copy in first-offer mode.
- `web/src/lib/hooks/pdp-queries.ts` (new) — `useMyListingOffer` reads
  `GET /users/me/offers` (live) / `OFFERS` (fixture) and finds the viewer's
  live pending/countered, unexpired offer; `useWithdrawListingOffer` calls
  `POST /offers/:id/cancel` (live) / `cancelOffer` (fixture).
- `BuyPanel` swaps "Make an offer" for a standing-offer row
  ("Your offer · £X", status line, Offers link, Withdraw). `PdpBuyDock`
  swaps "Offer" for the standing amount routing to `/offers`. Offer
  sends invalidate the guard so the UI reflects the new active offer.

### Q&A persistence (P1)

- `web/src/lib/api/services/listings.ts` — added `postListingQuestion`
  (POST `/listings/:id/questions`) and `answerListingQuestion`
  (POST `.../questions/:id/answer`); fixed `fetchListingQuestions` row
  mapping to the real wire names (`text`, `askerName`, nested `answer`
  object) and mapped `quarantined` → `pending_review`.
- `ListingQA` — now backed by `useListingQuestions`; live mode only ever
  renders persisted rows. Ask composer hides for the seller (backend 403),
  guests still route to auth, held questions/answers get an
  "Under review — only you can see this" marker, and errors show the
  server's message. Loading skeleton + error/retry states added.
  Fixture mode keeps `LISTING_QA` session-local writes.

### Zoom honesty (P1)

- `PdpLightbox` — real 2.5× magnification: click/wheel/`+`/`Z` zooms
  anchored at the pointer/center, drag pans with clamped bounds, arrow keys
  pan while zoomed, `−`/`0`/Escape/click returns to fit; zoom button in the
  chrome is `aria-pressed`; dialog label announces zoom state; zoom resets
  on page change; paging controls hide while zoomed. The `cursor-zoom-in`
  affordance now matches actual behavior.

### Live unpaid-order pay path (P2)

- `web/src/app/orders/[id]/page.tsx` — the live suppression is removed.
  "Pay now" now runs `POST /payments/intents` with a stable idempotency key
  (`web-order-pay-<orderId>`) — which re-serves the order's bound intent or
  mints a fresh one — opens `nextActionUrl` for SCA in a new tab, and polls
  `GET /payments/intents/:id` for up to 90s; succeeded → invalidates
  `['orders']`; failed/cancelled → server's `failureMessage`; still-open →
  honest "still processing" state. Errors (e.g. `CHECKOUT_DETAILS_REQUIRED`)
  surface via `parseApiError`.

## Files changed

- `web/src/lib/contracts/domain.ts`
- `web/src/lib/api/mappers.ts`
- `web/src/lib/api/services/listings.ts`
- `web/src/lib/commerce/dispatch.ts`
- `web/src/lib/commerce/offerRules.ts` (new)
- `web/src/lib/data/fixtures-commerce.ts`
- `web/src/lib/hooks/pdp-queries.ts` (new)
- `web/src/components/pdp/BuyPanel.tsx`
- `web/src/components/pdp/PdpBuyDock.tsx`
- `web/src/components/pdp/OfferSheet.tsx`
- `web/src/components/pdp/ListingQA.tsx`
- `web/src/components/pdp/PdpLightbox.tsx`
- `web/src/app/orders/[id]/page.tsx`
- `web/src/app/checkout/page.tsx`
- `web/src/components/checkout/OrderSummary.tsx` (comment only)

## Tests

- `npx eslint` on all 15 changed files — **clean**.
- `npx tsc --noEmit` — **my changed files produce zero errors**; the
  project-wide run still reports 5 errors, all pre-existing in other
  agents' in-flight WIP outside this scope:
  - `app/profile/page.tsx` + `app/u/[username]/page.tsx` — `ShopRail.tsx`
    vs `shopRail.ts` filename-casing collision + missing export
    (profile-track WIP).
  - `lib/hooks/collections-queries.ts:125` — `CollectionPatch.description`
    `string|null` vs `string|undefined` (collections WIP).
  - `lib/hooks/seller-queries.ts:45` — now fixed via an additive
    `MY_LISTING_STATS` re-export in `fixtures-commerce.ts` (the import it
    was already written to use).

## Concerns

- **Payment rails unchanged.** Backend exposes `GET /payments/apms/available`
  (PayPal/iDEAL/Bancontact/UPI, provider-config gated) and
  `GET /payments/bnpl/available` (Klarna/Clearpay/Affirm), and native offers
  Apple Pay via Stripe PaymentSheet on iOS — but `POST /payments/intents`
  accepts only `instrumentId`/`gatewayId` (saved instruments), and the web
  `PaymentMethod` contract is `card | bank_account`. No web-renderable APM
  flow exists, so no new rails were added — a PayPal/Apple Pay button would
  have been a dead control. Wiring them needs Stripe.js Payment Request /
  APM redirect support in the intent contract first.
- **Live PDP delivery facts are partial today.** The `/listings/:id`
  commerce block currently returns `shippingPrice`, ETAs and
  `dispatchSlaDays` unset — the PDP renders the honest fallbacks
  ("Postage calculated at checkout", platform dispatch default, the
  server-provided return-policy summary). When the backend populates those
  fields the UI picks them up with no further changes.
- **Offer floor is client-side only.** No server-side −40% bound was found;
  the server still owns the real accept/reject decision. If a server floor
  lands later, `offerRules.ts` should be driven from it.
- **`respondToOffer(offerId, 'cancel')` permission assumed** for buyer-side
  withdraw (buyer cancels own pending/countered offer); if the backend
  scopes `cancel` differently, the withdraw error path already surfaces it.
- **Pre-existing tsc failures** in profile/collections WIP files (listed
  above) remain — not introduced or fixed here (outside ownership).
