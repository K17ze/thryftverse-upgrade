# W3-C — Web auctions & live-lot implementation report

**Status:** Implemented and verified (tsc clean in scope; eslint clean on all changed files).

## What shipped

### Proxy / max-bid (P0)
- `web/src/lib/api/services/auctions.ts` — `placeAuctionBid(auctionId, { amountGbp, maxBidGbp? })`; the proxy ceiling reaches `/auctions/:id/bids` (mirrors `PlaceAuctionBidInput` in `frontend/src/services/marketApi.ts`). `BidError` carries `minimumNextBidGbp`/`buyNowPriceGbp` structured details so rejections show the real reason.
- `web/src/lib/hooks/auction-queries.ts` — `usePlaceBid` takes `{ amount, maxBid? }`; `runtimeProxyMax` (session-scoped) records the viewer's ceiling on success only, and `viewerProxyMax()` exposes it to the panel.
- `web/src/components/auctions/BidPanel.tsx` — restrained "Set maximum bid" switch (mobile `BidSheet` grammar), optional ceiling field validated above the placed bid, confirm sheet states the exact amount plus a "Maximum bid" row and honest proxy copy, "You're leading · Automatic bidding to £X" state, toasts carry the server/fixture rejection verbatim.

### Reserve + ended grammar (P1)
- `web/src/lib/contracts/auction.ts` — `AuctionMarketItem` gained `reservePrice`, `minimumNextBid`, `serverLifecycle`, `terminalReason`, `paymentDeadlineAt`, `secondChanceOfferedTo`, `winnerBidderId`; `CreateAuctionInput.reservePrice`; `AuctionTerminalReason` union mirroring marketApi.
- `fixtures-auctions.ts` — `auctionOutcome()` resolves ended auctions to `sold | reserve_not_met | cancelled | payment_expired | no_bids`, server lifecycle/terminal reason authoritative over timestamp derivation; fixtures include a reserve-not-met run (a7, viewer top bidder), a cancelled mid-window run (a8, `terminalReason: 'cancelled'`, future `endsAt`), and live reserve-met/not-met examples; `minNextBid` honours a server floor; `myBidRows` only crowns 'won' when the outcome is genuinely `sold`.
- `BidPanel.tsx` `EndedState` — sold / reserve-not-met / cancelled / payment-expired / no-bids narratives, payment-deadline countdown (`paymentDeadlineAt` only — never invented), second-chance accept/decline against real endpoints when `secondChanceOfferedTo` addresses the viewer, seller "Accept highest bid" (live mode only — a fixture accept would fabricate a sale), server `winnerBidderId` authoritative over ledger derivation.
- `AuctionRows.tsx` — result rows say Reserve not met / Cancelled / Payment expired / No bids; "Hammer" only on real sales, "Highest bid" otherwise.
- `seller/sellerAuctionModel.ts` — only `outcome === 'sold'` counts as a sale; unsold rows lead with the honest reason.
- `app/auctions/create/page.tsx` — optional reserve price (toggle + £ input, validated ≥ starting bid and < buy-now), forwarded through `useCreateAuction` → `reservePriceGbp`.

### Countdown truth
- `AuctionCard.tsx` — live chips tick real `m:ss` under ten minutes ("Ends in 8:42") via `formatClock`; ended chips are outcome-aware (Cancelled / Reserve not met / Ended). `AuctionCountdownClock` keeps its minute-granularity `aria-live` region so screen readers aren't spammed per second.

### Fixture bid rejections
- `auction-queries.ts` `onMutate` throws the real reason — guest (`Sign in to place a bid`), seller self-bid, not-yet-live, ended (respecting anti-snipe extensions), below floor (server `minimumNextBid` quoted without a guessed rule), `maxBid < amount` — with rollback of `runtimeBidState`/`runtimeBids`/`runtimeEnds` snapshots intact. The panel toasts `error.message` verbatim.

### In-show lot auctions
- `services/live.ts` — real lot contract (`LiveLot`, `LiveLotStatus`), `fetchSessionLots` (`GET /streaming/sessions/:id/lots`), `fetchCurrentLot` (`GET /current-lot`), `placeStreamBid` (`POST /bids`, idempotent `clientBidId`), all mapped from the same backend shapes mobile uses; server `error` strings propagate.
- `components/live/useLiveLots.ts` — polled queue/current-lot board, live mode only.
- `components/live/LiveLotDock.tsx` — lot-on-the-table card (bid + enforced increment, reserve-not-met flag, "You're winning"), `closesAt` countdown rendered **only when the server sets one** (host-closed lots show no clock — the native honesty pattern), and an "Up next · Lot N" card from the actual scheduled queue. Wired into `LiveViewerOverlay` above the product rail; it renders nothing for fixture/demo sessions.

### Header copy (P0)
- `app/auctions/page.tsx` — "Six-hour windows" corrected to "3–24h windows · proxy bidding · anti-snipe in the last two minutes" (the real duration ladder is 3/6/12/24h).

## Files changed
- `web/src/lib/contracts/auction.ts`
- `web/src/lib/api/services/auctions.ts`
- `web/src/lib/api/services/live.ts`
- `web/src/lib/data/fixtures-auctions.ts`
- `web/src/lib/hooks/auction-queries.ts`
- `web/src/components/auctions/BidPanel.tsx`
- `web/src/components/auctions/AuctionCard.tsx`
- `web/src/components/auctions/AuctionRows.tsx`
- `web/src/components/auctions/MyBidRow.tsx`
- `web/src/components/auctions/seller/sellerAuctionModel.ts`
- `web/src/components/live/LiveLotDock.tsx` (new)
- `web/src/components/live/useLiveLots.ts` (new)
- `web/src/components/live/LiveViewerOverlay.tsx`
- `web/src/app/auctions/page.tsx`
- `web/src/app/auctions/create/page.tsx`

## Tests
`cd web && npx tsc --noEmit` — clean in scope; `npx eslint` on all 15 changed files — 0 problems.

## Concerns
- **Pre-existing tsc failures outside ownership** (untouched): `app/profile/page.tsx` + `app/u/[username]/page.tsx` (`ShopRail` casing/export), `lib/hooks/collections-queries.ts` (`CollectionPatch.description` nullability), `lib/hooks/seller-queries.ts` (`MY_LISTING_STATS` missing export). Whole-program `tsc` reports these; none involve auction/live files.
- **Notifications gap (ownership-blocked):** backend auction events already deep-link to `/auctions/[id]` via `mappers.ts:873`, but `mappers.ts:837` flattens `eventType.startsWith('auction')` → `system` and `NotificationKind` (in prohibited `domain.ts`) has no auction kinds. Proper outbid/ending/won rows need `domain.ts` + `mappers.ts` + `components/notifications/*` — all outside this task's file list. Documented, not fabricated.
- **Watcher counts:** the auction contract has no watcher field and none was synthesised — counts stay absent (honest omission).
- **Host lot management:** viewer-side queue/bid is live-wired; host endpoints (`scheduleLot`/`openLot`/`closeLot`/`cancelLot`/`settleLot`) exist in the native service but no web host UI consumes them — a follow-up for the `/livehost` console rather than dead service code here.
- **Web has no realtime channel:** the lot dock polls (2.5s current lot / 5s queue). If the backend exposes a WS/SSE channel for web, swap the pollers for push.
- **Fixture proxy ceiling is a declared preference,** not a simulated engine — the runtime has no rival bidders, so the ceiling never auto-fires; the UI labels it as the viewer's maximum, not a server-persisted agent.
