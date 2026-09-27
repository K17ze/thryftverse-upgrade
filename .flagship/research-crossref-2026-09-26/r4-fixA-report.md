# r4-fixA — Auction bid idempotency + unknown-outcome reconciliation, buy-now contract, live-mode honesty gates, countdown grammar, scroll-lock migration

Workstream: auction money writes (bid / buy-now), create-page contract honesty,
bid confirmation disclosure, detail countdown parity, overlay scroll lock.
All findings re-verified against `backend/api/src` and `frontend/src` before
writing code. `tsc --noEmit` clean; eslint clean on every touched file.

## 1. [HIGH] `placeAuctionBid` — idempotency key + unknown-outcome reconciliation — FIXED

**Contract verification:**
- `backend/api/src/index.ts:37587-37595` — POST `/auctions/:auctionId/bids`
  Fastify body schema: `{ amountGbp, idempotencyKey? }` with
  **`additionalProperties: false`**.
- `index.ts:37613-37641` — the key is scoped `bid:<key>` and claimed
  atomically via `auction_transaction_idempotency`; a same-key + same-hash
  retry replays the original response (409 `IDEMPOTENCY_KEY_REUSED` on a
  different payload).
- `index.ts:37894-37898` — `auction_bids.idempotency_key` is written.
- `backend/api/src/routes/auctions.ts:572-619` — `GET
  /users/me/auction-bids/lookup-by-key/:idempotencyKey` exists: 200
  `{status:'acknowledged'}` / 404 `{status:'safe_to_retry'}`.
- Native port verified: `BidSheet.tsx:361-431` (per-attempt key +
  `useUnknownOutcomeReconciliation` polling, 8 attempts / 1.5s base /
  doubling to 10s cap) and `transactionSheetLogic.ts:241-248,419-437`
  (ambiguous = network failure, 5xx, or unclassified).

**Changes (`web/src/lib/api/services/auctions.ts`):**
- `newBidAttemptKey()` — one `web-bid-<uuid>` per user-initiated attempt
  (crypto.randomUUID with a time+random fallback). The key rides inside the
  POST body, so fetchJson's internal network retries re-send the *same* key
  and the server dedupe replays rather than double-commits.
- `lookupAuctionBidByIdempotencyKey(key)` → `acknowledged | safe_to_retry |
  processing` (404 → safe; any other error → processing). `skipDedup: true`
  so polls never collapse into a stale in-flight GET.
- `reconcileBidOutcome(key)` — module-level port of the native polling loop
  (8 attempts, 1.5s→10s backoff).
- `placeAuctionBid` now POSTs `{amountGbp, idempotencyKey}` only. On an
  ambiguous failure (network/timeout or 5xx) it reconciles before surfacing:
  acknowledged → resolves as success; safe_to_retry → original error;
  unresolved → `BidError` with `outcomeUnknown: true` and the honest copy
  "check My Bids before trying again". `BidError` gained `outcomeUnknown`.
- `isAmbiguousFailure` deliberately excludes `OFFLINE_WRITE_NOT_SUBMITTED` —
  the client-side offline guard never let the write leave, so it is
  provably uncommitted and stays a plain failure, not a 50s poll.

**Key-on-attempt wiring (`auction-queries.ts`, `BidPanel.tsx`):**
- `PlaceBidInput` gained `idempotencyKey?`; the live mutation falls back to
  `newBidAttemptKey()` if a caller omits it.
- `BidPanel` mints the key in `openConfirm` — one key per confirmation
  sheet, stable across retries of that attempt (native preserves the key
  across ambiguous retries; ours is preserved for the whole sheet lifetime,
  which is strictly safer).

**Verified contract correction (deviation from the finding's letter):** the
finding assumed `maxBidGbp` is a valid live field. It is not — the route
schema rejects it (`additionalProperties: false`) and the insert never
writes `is_proxy`/`max_bid_gbp`. Web proxy bids in live mode were therefore
already hard-400ing. `PlaceAuctionBidInput.maxBidGbp` was removed and the
live mutation no longer sends it; `maxBid` survives in `PlaceBidInput` as a
documented fixture-runtime preference only. The composer toggle is gated in
live mode (see §3b).

## 2. [HIGH] `buyAuctionNow` empty body — FIXED

**Contract verification:** `index.ts:38101-38104` — both `idempotencyKey`
(min 4, max 140) and `expectedPriceGbp` (positive) are **required**; an empty
body failed Zod parse. `expectedPriceGbp` guards drift (409
`BUY_NOW_PRICE_CHANGED` + `currentBuyNowPriceGbp`, `index.ts:38255-38265`).

**Change:** `buyAuctionNow(auctionId, input: BuyNowInput)` now sends
`{idempotencyKey, expectedPriceGbp}` and runs the same ambiguous-failure →
reconcile → outcomeUnknown posture (a buy-now commit also lands a keyed
`auction_bids` row, so the shared lookup resolves it). Note: no web caller
currently invokes `buyAuctionNow` — Buy Now routes to `/checkout` — the fix
keeps the exported contract truthful for whichever surface adopts it.

## 3. [MEDIUM] Reserve silently dropped in live mode — FIXED

**Contract verification:** `index.ts:37308-37316` — POST `/auctions` Zod
schema has no `reservePriceGbp`; non-strict `.object()` strips it silently.
**Change:**
- `CreateAuctionServiceInput` no longer declares `reservePriceGbp` (removed
  at the contract source); the live branch of `useCreateAuction` stops
  sending it. `minIncrementGbp` stays — the schema accepts it.
- `app/auctions/create/page.tsx` — in `DATA_MODE === 'live'` the reserve
  toggle renders disabled (`aria-disabled`, `cursor-not-allowed`) with
  honest inline copy: "Reserve pricing isn't supported on web yet — the
  auction sells to the highest bidder." Fixture mode untouched — the toggle,
  validation, and the fixture ended grammar (`fixtures-auctions.ts:377`)
  keep working.

## 4. [MEDIUM] Create footer fixture copy in live mode — FIXED

Footer is now DATA_MODE-aware: live → "The auction is created on the live
marketplace — the listing pauses while it runs." (pause verified:
`index.ts:37475-37479` sets `listings.status='paused'`); fixture keeps the
session-board disclaimer.

## 5. [MEDIUM] Binding-bid disclosure + proxy CTA — FIXED

`BidPanel.tsx` confirm sheet now shows the native commitment block verbatim
(`BidSheet.tsx:714-737`) above the confirm button — three icon rows
(info/clock/lock): "Bids are binding once accepted." / "If you win, payment
is due promptly after the auction ends." / "You cannot cancel a bid after
it is submitted." The CTA flips to "Place proxy bid · £X" when a max is set
(fixture mode only now — see §3b).

## 6. [LOW] Countdown grammar + urgency — FIXED

`AuctionCountdown.tsx`: ported `formatCountdownSentence`
(`auctionDetailLogic.ts:1203` — "2d 5h" / "2h 14m" / "12m 08s", zero-padded
seconds). `AuctionCountdownClock` now renders "Ends in …" / "Starts in …"
sentence grammar instead of "2:14:09 left", and turns `text-danger-text`
when a live auction is under 60 minutes (native threshold,
`AuctionCountdownBar.tsx:26`). The polite sr-only live region still updates
at minute granularity. Card chip (`AuctionCountdownChip`) untouched — it
already used sentence labels + urgency tones.

## 7. [scroll lock] `LiveViewerOverlay` — FIXED

Replaced the direct `document.body.style.overflow` write/restore with the
shared refcounted `lockBodyScroll()` (`web/src/lib/a11y/scrollLock.ts`), the
same pattern `Sheet.tsx:71` and `PdpLightbox.tsx:139` already use. Stacked
overlays can no longer unlock the body out from under each other.

## Files changed

- `web/src/lib/api/services/auctions.ts` — BidError.outcomeUnknown,
  newBidAttemptKey, lookup + reconcileBidOutcome, rewritten
  placeAuctionBid/buyAuctionNow, CreateAuctionServiceInput de-reserved.
- `web/src/lib/hooks/auction-queries.ts` — PlaceBidInput.idempotencyKey,
  live bid POST sends key only, live create drops reservePriceGbp,
  proxy-ceiling comment corrected.
- `web/src/components/auctions/BidPanel.tsx` — per-attempt key, disclosure
  block, proxy CTA, live-mode proxy gate.
- `web/src/app/auctions/create/page.tsx` — live reserve gate + honest copy,
  DATA_MODE-aware footer.
- `web/src/components/auctions/AuctionCountdown.tsx` — sentence grammar +
  <60min danger tone.
- `web/src/components/live/LiveViewerOverlay.tsx` — lockBodyScroll migration.

## Verification

- `npx tsc --noEmit` — clean (exit 0).
- `npx eslint` on all touched files with `--max-warnings 0` — clean.

## Flags for follow-up owners (outside my ownership)

- **Backend lookup-vs-storage key mismatch:** bid rows store the *scoped*
  key (`bid:<raw>` at `index.ts:37898`, `buy_now:<raw>` at `index.ts:38359`)
  but `routes/auctions.ts:596` queries `idempotency_key = <raw>`. As written
  the lookup endpoint can never match a committed bid — it will always
  report `safe_to_retry`. Web implements to the documented contract
  (raw key), same as native; the backend should either store the raw key in
  `auction_bids.idempotency_key` or scope the lookup query. Until then,
  reconciliation resolves timeouts as "safe to retry" and the dedupe claim
  remains the real double-submit guard.
- **Native proxy bids also 400 on live:** `useAuctionDetail.ts:404` POSTs
  `maxBidGbp` against a schema that forbids it — native's "Set maximum bid"
  is as dead server-side as web's was. Worth a native/backend alignment
  ticket: either implement proxy columns+schema or gate the native toggle.
- `createAuction` supports an optional `idempotencyKey` server-side
  (`index.ts:37315`) — web doesn't send one yet (not in scope; create is a
  low-frequency seller action, but a future pass could key it).
