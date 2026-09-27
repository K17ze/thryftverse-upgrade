# r5-fixA — Web auction winner-pay rewire (P0)

**Workstream:** auctions (web)
**Scope owned:** `web/src/lib/api/services/auctions.ts`, `web/src/lib/hooks/auction-queries.ts`, `web/src/components/auctions/**`
**Status:** FIXED — `npx tsc --noEmit` clean, `eslint` clean on touched files.

## Root cause (confirmed)

The winner "Pay £X" CTA in `BidPanel.tsx` ran `commerceService.createOrder` →
`POST /orders` against the auction's listing. Auction creation pauses that
listing (`backend/api/src/index.ts:37470-37479`, `status='paused',
pause_source='auction'`) and `POST /orders` hard-409s any non-active listing
(`index.ts:33078-33085`). Every winner-pay click therefore failed; the listing
only un-pauses on settle/cancel. The canonical endpoint — `POST
/auctions/:auctionId/payment` (`backend/api/src/routes/auctions.ts:800`) —
already provisions the commerce order + winner-bound payment intent itself and
is what native calls (`marketApi.ts:1322`, `useAuctionDetail.ts:494`).

## Changes

### `web/src/lib/api/services/auctions.ts`

- `newAttemptKey(prefix)` — extracted shared minter; `newBidAttemptKey` now
  delegates (identical output shape). Added `newAuctionPayAttemptKey()`
  (`web-auction-pay-<uuid>`) and `newSecondChanceAttemptKey(auctionId)`
  (`web-sc-<auctionId>-<uuid>`), honouring the route's `min(4).max(140)` schema.
- `payAuction(auctionId, { idempotencyKey, paymentMethodId? })` →
  `POST /auctions/:id/payment`. Returns normalised `AuctionPaymentResult`
  (`paymentStatus: 'pending'|'paid'|'failed'|'unpaid'`, `orderId`, `intent`
  handle incl. `nextActionUrl`/`clientSecret`, `auctionStatus`,
  `settlementState/Reason`). Ambiguous failures (network drop / 5xx, minus
  `OFFLINE_WRITE_NOT_SUBMITTED` — same `isAmbiguousFailure` rule bids use)
  reconcile through the authoritative status read before surfacing; a sustained
  unreadable state throws `AuctionPaymentError` with `outcomeUnknown` and the
  check-your-orders message — identical posture to `placeAuctionBid`.
- `fetchAuctionPaymentStatus(auctionId)` → `GET /auctions/:id/payment-status`
  (`skipDedup`). This is the only correct poll — the route self-heals a
  captured-but-unsettled intent (`settleAuctionWinForVerifiedIntent`,
  routes/auctions.ts:1576-1587), which a plain `GET /payments/intents/:id`
  does not do for the auction settle.
- `reconcileAuctionPayment` — bounded backoff poll (reuses `LOOKUP_*`
  budget). `unpaid` ⇒ provably nothing committed (original error stands);
  anything else ⇒ the committed state is returned verbatim.
- `waitForAuctionPayment(auctionId, { maxWaitMs, intervalMs, shouldContinue,
  onNextActionUrl })` — 90s/2s bounded settle poll mirroring the orders page;
  new provider next-action URLs are surfaced to the component via callback
  (service stays DOM-free). Never upgrades `pending` to success.
- `AuctionPaymentError` class (mirrors `BidError` shape).

### `web/src/components/auctions/BidPanel.tsx`

- `checkout()` live branch now calls `payWin()` → `payAuction` instead of
  `createOrder` + `createCommercePaymentIntent`. `commerceService` import
  removed.
- Outcome grammar mirrors `useAuctionDetail.handlePayNow` exactly:
  - `paid` → toast, key cleared, navigate to `/orders/<orderId>` when the
    server names it.
  - `failed` → terminal, key cleared, server's `failureMessage` verbatim.
  - `pending` → open `intent.nextActionUrl` in a new tab when present (web
    has no PaymentSheet — same posture as `orders/[id]` `payLiveOrder`), then
    `waitForAuctionPayment` polls the self-healing status route; still-pending
    keeps the key and either routes to the bound order page (which honestly
    renders the unpaid 'created' state and has a working re-attach Pay flow)
    or reports processing.
  - `unpaid` → "Payment didn't start — try again."
- **Idempotency defects fixed:**
  - `web-auction-…-Date.now()` per-click minting → `payAttemptKeyRef`
    (`useRef`), minted once per user-initiated attempt, cleared only on
    terminal paid/failed — retries replay the bound intent (native parity).
  - `web-sc-…-Date.now()` per-click in `answerSecondChance` →
    `secondChanceKeyRef`, cleared on success only (native parity).
  - `acceptHighestBid` sends no idempotency key on the wire
    (`POST /accept-highest-bid`, bodiless) — nothing to fix.
- CTA honesty:
  - `canCheckout` in live mode now gates on `paymentOpen`
    (`awaiting_payment | second_chance_offered | payment_expired` — the
    statuses the pay route accepts) instead of `listing != null` (the listing
    is paused by design; the endpoint provisions the order itself). Fixture
    path unchanged (`listing != null` still required — `recordOrder` writes
    against it).
  - New `paidOut` state (`serverLifecycle==='settled'` or
    `terminalReason 'settled'/'buy_now'`) → "Payment confirmed" + orders link
    instead of a dead Pay button.
  - Pay label in live mode is `Pay {formatPrice(auction.currentBid)}` — the
    backend captures exactly `current_bid_gbp` (fee carved out seller-side),
    so the old `payable.total` (hammer + protection + postage) overstated the
    charge. The fee caption is now fixture-only.
  - Invalidations: existing `refresh()` (`auction`, `auctions`,
    `auction-bids-all`) + `orders` on every outcome leg.

## Verified

- No other winner-pay path in `web/src` — `createOrder` remains only in
  `app/checkout/page.tsx` (legitimate listing checkout); `payAuction` and
  `/payment-status` only in the auctions service + BidPanel.
- `buyAuctionNow` untouched and unregressed.
- `npx tsc --noEmit` (web) — clean. `npx eslint` on touched files — clean.

## Notes for the parent agent

- **Buy-Now gap (out of my ownership, flagged):** the BidPanel Buy-Now CTA
  routes to `/checkout?item=<listingId>`. That page gates items on
  `listingCapabilities().canBuy`; a `pause_source='auction'` listing resolves
  to unpayable there, so web Buy-Now honestly degrades rather than
  double-committing — but the working `buyAuctionNow` service
  (`POST /auctions/:id/buy-now`, which handles the paused listing correctly)
  is not wired to any surface in `web/src`. Whoever owns the buy-now
  workstream should route the CTA through `buyAuctionNow` (native parity:
  BuyNowSheet), not `/checkout`.
- Winner-pay surfaces `AuctionPaymentError.outcomeUnknown` only as the toast
  message ("check your orders before trying again") — matching how BidPanel
  treats `BidError.outcomeUnknown` today.
- `intent.clientSecret` is returned owner-only but unused on web (no Stripe
  PaymentSheet surface) — capture needs either a bound instrument the server
  settles itself, or the hosted `nextActionUrl`. This matches the existing
  web order-pay posture; if web later gains Stripe.js confirmation, the
  handle is already in `AuctionPaymentResult.intent`.
