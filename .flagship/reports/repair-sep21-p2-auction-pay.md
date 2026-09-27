# Repair Report — SEP21 P2: Auction Winner Payment Flow

**Report date:** 2026-09-21
**Branch:** `feat/product-detail-contract-media-device-closure`
**Scope:** `ThryftVerse-Validation-and-Upgrade-Report-2026-09-21.md` §4.1, §4.9, Appendix B findings `SEP21-FIN-A` and `SEP21-FIN-C`.

---

## Status: DONE

| Finding | Severity | Result |
|---|---|---|
| `SEP21-FIN-A` — auction winner payment never confirms the Stripe PaymentIntent | High | **Fixed** — auction flow now presents the canonical Stripe PaymentSheet (shared service) before authoritative settlement polling. |
| `SEP21-FIN-C` — auction capture bypasses canonical commerce settlement (no `order_id`, after-the-fact paid order, immediate seller release, IZE/GBP currency mismatch) | High | **Fixed** — the canonical pending order + auction-source checkout reservation are provisioned before mint; the intent binds `order_id`; verified captures settle through `settlePaymentIntent`'s commerce branch (order `created`→`paid` → escrow hold → fulfilment → protection-hold release). |

---

## Root cause

### SEP21-FIN-A
`useAuctionDetail.handlePayNow` received a minted PaymentIntent (`clientSecret`) and jumped straight to `waitForPaymentIntentSettlement`. That poller can only *observe* state (and open a hosted next-action URL) — it cannot collect a payment method or confirm the intent. A Stripe PaymentIntent minted with `automatic_payment_methods` and no confirmation sits in `requires_payment_method`/`requires_confirmation` indefinitely, so the poll could never observe a transition. PaymentSheet presentation — the step that actually confirms the intent — existed only inside `useCheckoutPaymentFlow`.

### SEP21-FIN-C
The winner-pay route minted the intent with `channel: 'commerce'` but **no `order_id`**, so the canonical settlement branch (`nextStatus === 'succeeded' && channel === 'commerce' && order_id`) never ran. `settleAuctionWinForVerifiedIntent` then inserted a `paid` order after the fact and called `postAuctionSettlementLedgerEntries`, which (a) debited the *entire* winning bid out of escrow into seller/platform legs at payment time — seller funds were withdrawable before delivery, leaving nothing held for a refund or dispute — and (b) wrote GBP-defaulted ledger entries into a seller `ize_wallet` account denominated IZE, an account/entry currency split.

---

## Changes

### Backend — `backend/api/src/routes/auctions.ts`

1. **Phase A2 — canonical order + reservation provisioning (before mint).**
   When a new provider attempt will be minted (no live intent, or the stored
   intent is `failed`/`cancelled`), inside the auction `FOR UPDATE` lock the
   route now:
   - Finds every order this win has produced (first attempts claim
     `orders.auction_id`; retries are found through `payment_intents.order_id`
     binding since the partial unique index `orders_auction_unique_idx`
     permits exactly one claimant).
   - Reuses a still-`created` order owned by the payable winner instead of
     stacking dead rows.
   - Retires every other order: `created` ones through
     `cancelOrderOnReservationExpiry` (in-flight intents shield them → 409
     `ORDER_IN_FLIGHT`); terminal ones get drifted-active reservations
     cancelled so the listing-level active-reservation unique index can
     never block the winner's row.
   - Inserts the pending order `status='created'` with the canonical money
     split — `total_gbp = winningBid`, `buyer_protection_fee_gbp = platformFee`
     (3%), `subtotal_gbp = sellerNet`, `postage_fee_gbp = 0` — plus the
     winner's default address, `payment_method_id`, `checkout_expires_at`
     (auction `payment_deadline_at` with a 48h floor) and a
     `quote_snapshot` marked `source='auction_win'`.
   - Upserts the `listing_checkout_reservations` row (`source='auction'`,
     `status='active'`) the `orders` status trigger requires for a
     `created`→`paid` transition; a listing-level unique violation surfaces
     as retryable 409 `LISTING_CHECKOUT_RESERVED`.

2. **Phase D — order binding on the intent.** The post-mint binding write
   now runs in its own transaction setting **both**
   `payment_intents.metadata` (unchanged server-owned binding keys —
   migration-334 unique-live-intent invariant untouched) **and**
   `payment_intents.order_id`, plus `orders.payment_intent_id` back-binding
   (shields the order from expiry cancels via `hasInFlightPaymentIntent`)
   and a `payment.required` order event. If the order left `created` between
   Phase A and the bind, the fresh intent is retired
   (`AUCTION_ORDER_NOT_PAYABLE`) rather than allowed to capture against a
   dead order.

3. **`settleAuctionWinForVerifiedIntent` — canonical order resolution.**
   The intent SELECT now carries `order_id`. When bound, the helper requires
   the order to already be `paid` — the canonical commerce branch of
   `settlePaymentIntent()` runs earlier in the same capture transaction —
   otherwise it returns `skipped: order_not_payable:<status>` and the
   captured funds go to reconciliation (never settled). A bound paid order
   returns `settled` with **no order insert and no auction ledger legs**.
   Order resolution prefers `payment_intents.order_id`, falls back to the
   `auction_id` claimant.

4. **Legacy fallback (compatibility only).** Pre-binding intents
   (`order_id IS NULL`) still settle via the helper: it inserts the paid
   order (`auction_id` claimed only when free; `subtotal=sellerNet`,
   `fee=platformFee`, `total=winningBid`) and posts the corrected ledger —
   kept solely so already-minted in-flight intents remain settleable.

### Backend — `backend/api/src/lib/workerRuntime.ts`

`postAuctionSettlementLedgerEntries` rewritten as a currency-correct,
escrow-held compatibility path:
- Removed the seller `ize_wallet` account entirely — every account and
  entry posts GBP (account `buyer_spend`, `escrow_liability`,
  `platform_revenue`; explicit `currency: 'GBP'` on every entry).
- Posts only buyer→escrow and the escrow→platform_revenue fee carve-out.
  **No seller-payable leg at capture** — seller-net stays held in escrow
  until `releaseCommerceOrderEscrowToSeller` runs at delivery/protection
  release, so a refund or dispute before delivery can never race an
  already-released payout.
- `sourceId` now keys on the **order id** (`input.orderId`), matching the
  canonical refund-reversal / escrow-release lookups that scan
  `source_id = orderId`.

### Backend — `backend/api/src/index.ts` (surgical, inside the canonical settle branch ~7460)

The `UPDATE orders SET status='paid' WHERE id=$1 AND status='created'`
statement now requires an **active reservation for auction-win orders**
(`orders.auction_id IS NOT NULL` or `quote_snapshot->>'source' =
'auction_win'`). A reservation-less auction order no-ops into the existing
orphan branch (`flagOrphanedCommercePayment` + `reconciliation_breaks` +
ops alert) instead of aborting the whole settlement transaction on the
trigger's `LISTING_CHECKOUT_RESERVATION_MISSING` raise. Non-auction orders
keep the previous trigger-enforced behavior unchanged.

The verified-webhook auction settle call (~31475) needed no change:
`settlePaymentIntent` already runs inside the webhook transaction before
`settleAuctionWinForVerifiedIntent`, so the order transition, escrow
ledger and auction settle commit atomically.

### Frontend — `frontend/src/services/paymentSheetFlow.ts` (new)

Shared PaymentSheet orchestration used by both flows — no divergent
implementation:
- `fetchPaymentIntentSheetConfig(intentId)` → `POST
  /v2/payments/intents/:intentId/sheet` (existing endpoint; validates
  ownership, `stripe_americas` gateway, live client secret, non-terminal
  status, and Stripe customer binding; returns `customerId` +
  `customerSessionClientSecret` + publishable key + merchant/currency).
- `presentStripePaymentSheet(sheet, { onSheetPresenting })` →
  `configureStripeMobile` → `initPaymentSheet` (identical parameters to
  canonical checkout: merchant name, customer id, customer-session secret,
  intent client secret, `getStripeReturnUrl()`, delayed methods off,
  Apple/Google Pay gating) → `onSheetPresenting` hook →
  `presentPaymentSheet`. Returns `'completed' | 'cancelled'`; throws on
  init/presentation failure so callers surface a retryable error and never
  claim success.

### Frontend — `frontend/src/hooks/checkout/useCheckoutPaymentFlow.ts`

The card-sheet block now delegates to `presentStripePaymentSheet`; the
`authenticating` stage + `payment_submitted` funnel step moved into the
`onSheetPresenting` hook. Cancel → `idle`, error → throw: behavior is
unchanged. The platform-pay tender path is untouched.

### Frontend — `frontend/src/hooks/useAuctionDetail.ts`

`handlePayNow` now:
1. Creates/reuses the intent via `payAuction` (stable idempotency key —
   unchanged).
2. Handles `paid`/`failed` terminal states immediately — unchanged.
3. For pending intents, fetches the PaymentSheet config and presents the
   sheet. `PAYMENT_SHEET_UNAVAILABLE` / `PAYMENT_INTENT_FINAL` responses
   fall through to polling (non-Stripe rails, intents that raced terminal).
4. Sheet dismissal returns honestly to unpaid ("Payment not completed —
   your win is still reserved") — the live intent and idempotency key are
   kept so the next tap re-opens the sheet.
5. Polls `waitForPaymentIntentSettlement` **only after** the sheet
   confirms — settlement success still derives exclusively from the
   provider-verified intent status.

---

## Verification

| Command | Result |
|---|---|
| `cd backend/api && npx tsc --noEmit` | Clean |
| `cd frontend && npx tsc --noEmit` | Clean |
| `tsx --test --test-force-exit src/__tests__/auctionPaymentSettlement.test.ts` | **26/26 pass** (5 new SEP21-FIN-C tests) |
| `tsx --test --test-force-exit auctionConvergence + auctionLifecycleClosure + auctionTransactionIntegrity` | **107/107 pass** |
| `tsx --test --test-force-exit paymentP0Gates + refundAfterPayout + checkoutMoneyPathGuards` | **64/64 pass** |
| `npx vitest run src/__tests__/paymentSheetFlow.test.ts` | **8/8 pass** (new) |
| `npx vitest run` auction suites (auctionDetailFlagshipClosure, auctionLifecyclePresentation, auctionUpgrade, sellerAuctionState, vq10a19AuctionIzeDisplay, vq10aAuctionDetail) | **221/221 pass** |

### New/extended regression coverage

- Order exists **before** capture and the minted intent binds `order_id`
  (route-level assertions on `INSERT INTO orders` 'created',
  `listing_checkout_reservations` `source='auction'`, binding UPDATE
  `order_id`, `orders.payment_intent_id` back-bind).
- Captured auction payment with bound paid order → settles through the
  canonical order with **zero** auction ledger legs and **no** order insert.
- Bound order not `paid` → `order_not_payable` skip, auction not settled.
- Legacy unbound capture → GBP-consistent accounts/entries, no `ize_wallet`,
  no seller-payable leg (escrow held), `sourceId` keyed on the order.
- Retry reuses the pending order and re-arms its reservation; a second
  order never double-claims `orders.auction_id`.
- Frontend: sheet config endpoint, canonical init parameters, honest
  `cancelled` outcome, init/present failures throw (never success),
  `onSheetPresenting` ordering, plus source-contract assertions that
  `useAuctionDetail` presents the shared sheet before polling and that
  checkout contains no private `initPaymentSheet` call.

## Notes / residual constraints

- No real Stripe/Postgres deployment was exercised (no Docker/psql in this
  environment) — coverage is fake-client SQL inspection and unit-level
  orchestration, matching the suite's existing style.
- PaymentSheet requires the `stripe_americas` rail and the canonical
  route's Stripe-customer binding; both hold for auction intents minted
  through `POST /payments/intents` (`getOrCreateStripeCustomer` attaches
  the customer for `stripe_americas`). Non-Stripe rails keep the existing
  hosted-next-action polling path.
- A stale `created` auction order left by a crashed attempt is reclaimed
  by the next winner-pay (reuse) or by the existing checkout-expiry
  sweeper.
- Migration 305 pause provenance means a cancelled auction order never
  un-pauses the auction listing (`pause_source='auction'` survives);
  trigger-driven reservation cancel keeps the listing held.
