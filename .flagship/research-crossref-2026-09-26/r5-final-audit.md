# R5 — Final adversarial audit (post-R4)

Fresh-context audit of the cumulative wave-3 + R3 + R4 diff. File:line evidence below.

## Confirmed findings

### P0 — Live auction winner could never pay (FIXED by R5-fixA)
`BidPanel.checkout()` called `POST /orders` on a listing the backend pauses at auction creation (`index.ts:37470-37479`) → guaranteed 409 `Listing cannot be purchased from status 'paused'` (`index.ts:33078-33085`). Canonical endpoint `POST /auctions/:auctionId/payment` (`routes/auctions.ts:800`, winner-restricted, bound-intent replay) was unwired; mobile uses `payAuction()` (`marketApi.ts:1322`). Also: `web-auction-…-Date.now()` keys minted per click meant retries never replayed.

### P0 — Withdraw surface fabricated money state in live mode (FIXED by R5-fixB)
`WithdrawView.commit()` minted a fake `PAYOUT-…` reference, debited the query-cache balance, toasted "Withdrawal requested — pending review", and rendered an unresolvable pending receipt — with zero DATA_MODE checks. `usePayoutAccounts` merged fixture `PAYOUT_ACCOUNTS`/`PAYOUT_REQUESTS` into a live user's destinations/history. Real endpoints existed unwired: `POST /users/:id/payout-accounts` (`index.ts:25760`), `POST /users/:id/payout-requests` (`index.ts:26939`).

### P1 — `placeCoOwnOrder` never sent idempotencyKey (FIXED — orchestrator)
Schema supports it (`routes/coOwn.ts:3582`, dedupe `ON CONFLICT (asset_id, actor_id, idempotency_key)` at 3665-3686, `GET …/orders/lookup-by-key/:key` at 4827). A retry after ambiguous failure could double-place a real 1ZE order. Fixed: key minted per confirm attempt in TradePanel, required at the service boundary (missing key fails closed).

### P1 — Seller-away gate leaked CTAs while trust fetch was in flight (FIXED — orchestrator)
`listingCapabilities` falls back to `listing.seller.holidayMode` when `sellerAvailability` is undefined — the listing payload never carries it, so away sellers' Buy/Offer CTAs rendered live during (or after failure of) the `GET /sellers/:id` fetch. Backend 409 still enforced. Fixed: `sellerTrustPending` renders a pending surface (skeleton/disabled) at BuyPanel, PdpBuyDock, and the checkout `?item=` loading gate. Failed reads remain fail-open (native parity; 409 is the enforcer).

## Verified clean (explicit, evidence-checked)
- Auction bid/buy-now: stable idempotency keys, ambiguous-failure classification, lookup-by-key reconciliation, outcomeUnknown UX. Partial unique index `orders.auction_id` guarantees one order per Buy-Now.
- Auction create: `reservePriceGbp` omitted in live (schema drops it); UI gates honestly.
- MyBids: `active`→"Active", `winning`→"You're winning"; ended reasons distinguished.
- Checkout `?item=`: real order + payment intent, stable per-attempt key, pending routes to order detail, seller-away gated.
- Chat: composer safety scan on every draft change (incl. quick-reply writes), role-aware copy, real send path + presigned uploads, report idempotency.
- Overlays: `document.body.style.overflow` only inside `lib/a11y/scrollLock.ts`; Sheet/PdpLightbox trap+restore; menus deliberate-vs-passive dismiss.
- Feed labels: "Best match" only with a query, "Most liked" otherwise; explanation sheet honesty tiers; intent actions hit real routes.
- Co-own reads/governance/syndicates: real vote POST + invalidate; syndicates gated live via SyndicateLiveNotice.
- Wallet reads: real snapshot + transactions + 1ZE position (null on failure); Convert hidden live.

## Footnotes (not counted)
- `setAuctionWatched` fire-and-forget `.catch(() => {})` — a failed live watch still toasts success (locally true). Minor.
- Backend bug filed (not web-owned): `auction_bids.idempotency_key` stored with `bid:`/`buy_now:` prefixes but `lookup-by-key` compares raw key — reconciliation degrades to `safe_to_retry`; dedupe still protects.
- Native parity gap found: `useAuctionDetail.ts:404` sends `maxBidGbp` to a schema that forbids it (native proxy is dead server-side too).
