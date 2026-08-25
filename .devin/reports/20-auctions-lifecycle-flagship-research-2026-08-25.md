# 20 — Auctions Lifecycle: Principal Engineering Decision Record

**Engineering decision document**
**Research cut-off:** 25 August 2026
**Audited baseline:** `f82f74a54be79a1721017380ddd5472d856f1679`
**Decision owners:** Commerce Platform + Trust & Safety + Payments + Mobile Platform
**Status:** **P1 — advanced transactional core; lifecycle/operations closure still required**
**Recommended status:** **PARTIAL — LIFECYCLE OPERATIONS AND POLICY CLOSURE REQUIRED**

---

## 1. Executive verdict

Auctions are one of the strongest P1 departments. The backend supports discovery/home, creation, bid history, transactional bidding, buy-now, detail, watchlist and user activity. Bids and buy-now use atomic idempotency claims with `FOR UPDATE` row locks (`auctions.ts:1207–1212`, `auctions.ts:1643–1648`). The detail UI distinguishes ended from settled and treats server state as authoritative. The canonical lifecycle resolver (`auctions.ts:66–92`) derives state from timestamps and terminal fields, not from a mutable status string. This is beyond prototype quality.

However, deep code research reveals critical gaps that prevent production trust:

1. **P0 — Reserve price is not enforced at settlement.** The sweep at `index.ts:9380–9413` selects the highest bid and declares a winner without checking `reserve_price_gbp`. If a seller sets a reserve of £100 and the highest bid is £30, the auction settles with a £30 winner and the listing is marked `sold`. The canonical lifecycle has no `reserve_not_met` state.
2. **P0 — No proxy/automatic bidding.** Bids are direct increment bids — the user must manually raise each time. eBay's familiar model is proxy bidding (set maximum, system auto-increments). The UI and API don't state which model is in use, creating user confusion.
3. **P0 — No anti-sniping/extension policy.** Auctions have a hard close at `endsAt`. There is no bid extension rule. The policy is unstated in the UI.
4. **P0 — Settlement is immediate with no payment verification.** The sweep marks the listing as `sold` and posts ledger entries immediately upon end — before the winner pays. There is no `awaiting_payment`, `payment_expired`, or second-chance offer state. A winner who never pays has already caused the listing to be marked sold.
5. **P1 — No seller edit/cancellation policy after bids exist.** The `cancelled_at` field exists but there is no route or policy governing when a seller can cancel, what happens to existing bids, or whether bidders are notified.
6. **P1 — No realtime monotonic sequence.** Bid events don't carry an auction-scoped sequence number. Clients cannot detect gaps or recover from missed events.

Remaining work is systemic closure: proxy bidding policy, anti-sniping decision, scheduled transitions with payment verification, settlement/payment expiry, seller cancellation/revision rules, realtime sequencing, notification guarantees, dispute/fulfilment linkage, reconciliation and load/failure validation.

### 1.1 Maturity scorecard

| Capability | Score | Verdict |
|---|---:|---|
| Discovery/home feed | 3.5/5 | Live/upcoming/ended/closing-soon with parallel queries and category facets |
| Auction creation | 3.5/5 | Zod-validated, idempotency key, listing pause for double-exposure prevention |
| Bid placement | 3.5/5 | `FOR UPDATE` lock, idempotency claim, min-increment validation, AML/eligibility checks |
| Buy-now | 3.5/5 | Atomic winner declaration, listing status update, idempotency |
| Canonical lifecycle | 3.0/5 | Derives from timestamps/terminal fields; missing reserve-not-met and payment states |
| Reserve price enforcement | 0/5 | **Not enforced at settlement** — highest bid wins regardless of reserve |
| Proxy/automatic bidding | 0/5 | Not implemented — direct bids only |
| Anti-sniping/extension | 0/5 | Not implemented — hard close only |
| Settlement sweep | 2.5/5 | `FOR UPDATE SKIP LOCKED`, idempotent time-bucket job; settles without payment verification |
| Payment/checkout handoff | 0/5 | No payment deadline, expiry, or second-chance offer |
| Seller cancellation | 1.0/5 | `cancelled_at` field exists; no route, policy, or bidder notification |
| Realtime sequencing | 1.5/5 | Realtime events published; no monotonic sequence or gap recovery |
| Watchlist | 3.0/5 | Cursor pagination, optimistic toggle with rollback |
| Detail screen | 3.5/5 | Server-authoritative, refreshes before transaction, leading/outbid/won/lost states |
| Seller centre | 3.0/5 | Lifecycle views separated; attention priority deterministic |
| Observability/SLOs | 2.0/5 | Settlement metrics exist; no burst/load/abuse telemetry |
| **Overall** | **2.4/5** | **Strong transactional core, missing policy closure and payment lifecycle** |

---

## 2. Precise code evidence register

All line numbers verified against `f82f74a54be79a1721017380ddd5472d856f1679`.

### 2.1 Canonical lifecycle resolver

| Evidence | Lines | Finding | Severity |
|---|---|---|---|
| `auctions.ts` | 38–43 | `CanonicalLifecycle = 'cancelled' \| 'settled' \| 'ended' \| 'live' \| 'upcoming'` — no `reserve_not_met`, `awaiting_payment`, `payment_expired` | **P0** |
| `auctions.ts` | 45–50 | `TerminalReason = 'cancelled' \| 'settled' \| 'buy_now' \| 'scheduled_end' \| null` — no `reserve_not_met` reason | **P0** |
| `auctions.ts` | 66–92 | `resolveCanonicalLifecycle` checks cancelled → settled → winner → endsAt → startsAt. No reserve check. | **P0** |

**Critical quote — missing reserve-not-met state (`auctions.ts:66–92`):**
```ts
function resolveCanonicalLifecycle(input: CanonicalLifecycleInput): CanonicalLifecycleResult {
  const now = (input.now ?? new Date()).getTime();
  const startsAt = new Date(input.startsAt).getTime();
  const endsAt = new Date(input.endsAt).getTime();

  if (input.cancelledAt) {
    return { lifecycle: 'cancelled', terminalReason: 'cancelled' };
  }
  if (input.settledAt) {
    return { lifecycle: 'settled', terminalReason: 'settled' };
  }
  if (input.winnerBidderId) {
    return { lifecycle: 'ended', terminalReason: 'buy_now' };
  }
  if (endsAt <= now) {
    return { lifecycle: 'ended', terminalReason: 'scheduled_end' };
  }
  if (startsAt > now) {
    return { lifecycle: 'upcoming', terminalReason: null };
  }
  return { lifecycle: 'live', terminalReason: null };
}
```
No reserve price input. No `reserve_not_met` state. The resolver cannot represent an auction that ended below reserve.

### 2.2 Settlement sweep — reserve price bypass

| Evidence | Lines | Finding | Severity |
|---|---|---|---|
| `index.ts` | 9349–9500 | `sweepExpiredAuctions` — selects expired auctions, finds highest bid, settles | Foundation |
| `index.ts` | 9355–9370 | Query: `WHERE a.ends_at <= NOW() AND (a.status <> 'ended' OR a.settled_at IS NULL) ORDER BY a.ends_at ASC FOR UPDATE SKIP LOCKED` | Foundation |
| `index.ts` | 9380–9394 | Winner selection: `SELECT id, bidder_id, amount_gbp FROM auction_bids WHERE auction_id = $1 ORDER BY amount_gbp DESC, created_at ASC, id ASC LIMIT 1` | Foundation |
| `index.ts` | 9401–9413 | `UPDATE auctions SET status='ended', settled_at=NOW(), winner_bid_id=$2, winner_bidder_id=$3` — **no reserve price check** | **P0** |
| `index.ts` | 9418–9424 | `UPDATE listings SET status='sold'` — listing marked sold even if bid is below reserve | **P0** |
| `index.ts` | 9434–9441 | `postAuctionSettlementLedgerEntries` — ledger entries posted before payment | **P0** |

**Critical quote — settlement without reserve check (`index.ts:9396–9413`):**
```ts
      const topBid = winner.rows[0];
      const winningBidGbp = topBid ? Number(topBid.amount_gbp) : 0;
      const platformFeeGbp = topBid ? calculateAuctionPlatformFeeGbp(winningBidGbp) : 0;
      const sellerNetGbp = topBid ? roundTo(Math.max(0, winningBidGbp - platformFeeGbp), 2) : 0;

      await client.query(
        `
          UPDATE auctions
          SET
            status = 'ended',
            settled_at = NOW(),
            winner_bid_id = $2,
            winner_bidder_id = $3,
            updated_at = NOW()
          WHERE id = $1
        `,
        [auction.id, topBid?.id ?? null, topBid?.bidder_id ?? null]
      );
```
The sweep takes the highest bid and immediately declares a winner. `reserve_price_gbp` is never checked. If a seller sets a reserve of £100 and the highest bid is £30, the auction settles with a £30 winner. The listing is marked `sold` (line 9421). Ledger entries are posted (line 9435). The seller's reserve protection is non-functional.

### 2.3 Bid placement — direct bids only, no proxy

| Evidence | Lines | Finding | Severity |
|---|---|---|---|
| `auctions.ts` | 1118–1582 | `POST /auctions/:auctionId/bids` — accepts `amountGbp`, validates against `minimumNextBid` | Foundation |
| `auctions.ts` | 1268–1271 | `currentBid = Number(auction.current_bid_gbp); minIncrement = Number(auction.min_increment_gbp); amountGbp = roundTo(payload.amountGbp, 2); minimumNextBid = roundTo(currentBid + minIncrement, 2)` | Foundation |
| `auctions.ts` | 1286–1295 | `if (amountGbp < minimumNextBid)` — rejects below minimum | Foundation |
| — | — | No `maxBidGbp` field, no proxy bidding logic, no automatic increment | **P0** |

The bid schema accepts a single `amountGbp`. There is no `maxBidGbp` for proxy bidding. The user must manually place each bid at the exact amount they want to bid. eBay's familiar proxy model (set maximum, system auto-increments) is not implemented.

### 2.4 Idempotency and locking

| Evidence | Lines | Finding | Severity |
|---|---|---|---|
| `auctions.ts` | 94–165 | `claimIdempotency` / `storeIdempotencyResponse` — atomic claim with `ON CONFLICT` | Strong |
| `auctions.ts` | 1207–1212 | `SELECT ... FROM auctions WHERE id = $1 FOR UPDATE` — row lock during bid | Strong |
| `auctions.ts` | 1643–1648 | `SELECT ... FROM auctions WHERE id = $1 FOR UPDATE` — row lock during buy-now | Strong |
| `index.ts` | 9368 | `FOR UPDATE SKIP LOCKED` — sweep avoids contention | Strong |
| `lib/queues.ts` | 754–765 | `enqueueAuctionSweepJob` — time-bucket jobId for idempotent scheduling | Strong |

### 2.5 Payment and fulfilment gaps

| Evidence | Lines | Finding | Severity |
|---|---|---|---|
| `index.ts` | 9401–9413 | Settlement sets `settled_at = NOW()` immediately — no payment verification | **P0** |
| `index.ts` | 9418–9424 | Listing marked `sold` before payment — no `awaiting_payment` state | **P0** |
| `index.ts` | 9434–9441 | Ledger entries posted before payment — no payment intent creation | **P0** |
| `auctions.ts` | 2271 | Detail response: `fulfilment: null` — no fulfilment contract | P1 |
| — | — | No payment deadline, no payment expiry, no second-chance offer to next bidder | **P0** |

### 2.6 Seller cancellation

| Evidence | Lines | Finding | Severity |
|---|---|---|---|
| `auctions.ts` | 289, 297, 578 | Queries filter `WHERE a.cancelled_at IS NULL` — cancelled auctions excluded from discovery | Foundation |
| — | — | No `POST /auctions/:auctionId/cancel` route exists | **P1** |
| — | — | No policy for when seller can cancel (before bids? after bids? with penalty?) | **P1** |
| — | — | No bidder notification on cancellation | **P1** |

### 2.7 Frontend surfaces

| Evidence | Finding | Severity |
|---|---|---|
| `AuctionDetailScreen.tsx` | Refreshes before transaction; renders leading/outbid/won/lost/payment-required states | Strong |
| `CreateAuctionScreen.tsx` | Supplies stable idempotency key | Strong |
| `SellerAuctionCentreScreen.tsx` | Separates lifecycle views with deterministic attention priority | Strong |
| Watch toggle | Optimistic update with rollback | Strong |

---

## 3. End-to-end flow traces

### 3.1 Current bid flow

```text
POST /auctions/:auctionId/bids
  → claimIdempotency (auction_id, user_id, idempotency_key)    [auctions.ts:105-144]
  → BEGIN
  → SELECT auction FOR UPDATE                                   [auctions.ts:1207-1212]
  → validate: not seller, not cancelled, not settled, not won   [auctions.ts:1224-1246]
  → resolveCanonicalLifecycle → must be 'live'                  [auctions.ts:1248-1266]
  → validate: amountGbp >= minimumNextBid                       [auctions.ts:1286-1295]
  → evaluateMarketEligibility (AML/KYC)                         [auctions.ts:1297-1323]
  → evaluateAmlRisk                                             [auctions.ts:1325-1374]
  → INSERT auction_bids                                         [auctions.ts:~1375+]
  → UPDATE auctions SET current_bid_gbp, bid_count              [auctions.ts:~1375+]
  → notify previous top bidder (outbid)                         [auctions.ts:~1375+]
  → publishRealtimeEvent auction.bid_placed                     [auctions.ts:~1375+]
  → storeIdempotencyResponse                                    [auctions.ts:146-165]
  → COMMIT
```

### 3.2 Current settlement flow

```text
sweepExpiredAuctions (every 30s)                                [index.ts:9349]
  → BEGIN
  → SELECT expired auctions FOR UPDATE SKIP LOCKED              [index.ts:9355-9370]
  → for each auction:
    → SELECT highest bid                                        [index.ts:9381-9394]
    → UPDATE auctions SET settled_at=NOW(), winner_bidder_id    [index.ts:9401-9413]
      ⚠ no reserve price check
    → UPDATE listings SET status='sold'                         [index.ts:9418-9424]
      ⚠ before payment
    → postAuctionSettlementLedgerEntries                        [index.ts:9434-9441]
      ⚠ before payment
    → publishRealtimeEvent auction.settled                      [index.ts:9444-9457]
    → queueUserNotification (winner + seller)                   [index.ts:9459-9487]
  → COMMIT                                                      [index.ts:9490]
```

### 3.3 Target settlement flow

```text
auction ends (endsAt reached)
  → sweep marks auction 'ended' (not 'settled')
  → if highest bid >= reserve_price:
    → set winner_bidder_id, status='awaiting_payment'
    → create payment intent with deadline (e.g. 72h)
    → notify winner: "You won. Pay by [deadline]."
    → if paid: settle, mark listing sold, post ledger, create order
    → if expired: offer second-chance to next bidder OR relist
  → if highest bid < reserve_price:
    → status='reserve_not_met'
    → reactivate listing
    → notify seller: "Reserve not met. Relist or accept highest bid?"
    → notify bidders: "Auction ended. Reserve not met."
```

---

## 4. August 2026 benchmark research

### 4.1 eBay proxy bidding and auction mechanics

| Source | Finding | ThryftVerse application |
|---|---|---|
| [eBay — how bidding works](https://www.ebay.com/help/buying/bidding/bidding-works?id=4003) | eBay uses proxy (automatic) bidding. User sets maximum; system bids in increments up to that cap. User pays only enough to beat the next-highest bid. | Implement proxy bidding with `maxBidGbp`; auto-increment to minimum needed |
| [CLOSO — eBay Bidding Explained](https://closo.co/blogs/platform-specific-guides/ebay-bidding) | "eBay bidding runs on a proxy system, not a live auction floor." Bid increments on sliding scale (~$1 under $25, $5+ at hundreds). | Implement sliding-scale increments; proxy bidding is the familiar model |
| [eBay — reserve-price rules](https://www.ebay.com/help/default/default/setting-reserve-price?id=4143) | Reserve price is hidden; auction closes without a winner if reserve is not met. | **Critical: ThryftVerse's sweep does not check reserve — P0 defect** |
| [BeanHawk — How to Cancel a Bid on eBay](https://beanhawk.com/guides/how-to-cancel-bid-ebay) | "A bid on eBay is a binding commitment to buy, not a bookmark." Retraction only for valid reasons. Sellers can cancel bids before auction ends. | Define bid retraction and seller cancellation policies |

### 4.2 Auction architecture at scale

| Source | Finding | ThryftVerse application |
|---|---|---|
| [HLD Handbook — Online Auction Design](https://hld.handbook.academy/curriculum/case-studies/online-auction/) | "An online auction compresses all its contention into the final 30 seconds." Redis Lua CAS for atomic bids at 100K+ ops/sec. Proxy bidding with deterministic tie-breaking by timestamp. Sniping extension: bid in last 30 seconds extends by 30 seconds, capped at 10 extensions. | Consider anti-sniping extension; deterministic tie-breaking (already have `created_at ASC, id ASC`); plan for burst load at auction close |
| [RiftCompare — eBay Bidding Strategies](https://riftcompare.com/blog/ebay-bidding-strategies) | "eBay's hard close: auctions end at a fixed time regardless of last-second activity. That single rule is what makes sniping viable." | Decide and state the anti-sniping policy explicitly in the UI |

### 4.3 eBay Inventory API

| Source | Finding | ThryftVerse application |
|---|---|---|
| [eBay Inventory API](https://developer.ebay.com/api-docs/sell/inventory/static/overview.html) | Fixed-price and auction offers coexist on the same inventory item. | ThryftVerse already pauses listings during auctions (`auctions.ts:1019–1028`); ensure reactivation on all terminal paths |

---

## 5. Capability, state and ownership matrix

| Concern | Current owner | Current truth | Target owner |
|---|---|---|---|
| Lifecycle state | `resolveCanonicalLifecycle` (`auctions.ts:66–92`) | 5 states; missing reserve-not-met and payment states | Extended resolver with 12+ states |
| Reserve enforcement | none | **Not enforced** | Settlement sweep with reserve check |
| Bid model | direct increment | Direct only; no proxy | Proxy bidding with maxBid |
| Anti-sniping | none | Hard close only | Configurable extension policy |
| Settlement | `sweepExpiredAuctions` (`index.ts:9349–9500`) | Immediate, no payment | Payment-gated settlement |
| Payment handoff | none | Absent | Payment intent + deadline + expiry |
| Second-chance | none | Absent | Next-bidder offer on payment expiry |
| Seller cancellation | `cancelled_at` field only | No route/policy | Cancellation route with bidder notification |
| Realtime | `publishRealtimeEvent` | No sequence number | Monotonic sequence + gap recovery |
| Order/fulfilment | `fulfilment: null` (`auctions.ts:2271`) | Not wired | Order creation on payment confirmation |
| Seller payout | `postAuctionSettlementLedgerEntries` | Immediate, before payment | Payout hold after fulfilment confirmation |
| Abuse prevention | AML/eligibility checks | Pre-trade only | Shill bidding detection, collusion, payment abuse |

---

## 6. User psychology, JTBD and trust

Bidding uses loss aversion and urgency; design must reduce manipulation, not amplify it.

### 6.1 Jobs

1. "Set my maximum and let the system bid for me." (proxy bidding)
2. "Know the current price, minimum next bid, and bid rule together."
3. "Trust that my reserve price will be honored."
4. "Know the auction won't be sniped without warning."
5. "Pay for what I won without losing it to a race condition."
6. "Know if the seller cancelled and why."

### 6.2 Trust failures to prevent

- Reserve price silently ignored at settlement (`index.ts:9401–9413`).
- Listing marked `sold` before winner pays (`index.ts:9418–9424`).
- No proxy bidding — user must manually re-bid every time they're outbid.
- No anti-sniping policy stated — user doesn't know if late bids extend the clock.
- Seller cancels auction after bids exist without notifying bidders.
- Realtime gap causes client to show stale "leading" state.
- Pulsing timers, fake viewer counts, confetti and "someone is about to bid" theatre.

---

## 7. Strict anti-AI flagship UX specification

### 7.1 Auction detail — first viewport

```text
Vintage Leather Jacket

Current bid              £42.00
Minimum next bid         £43.00
Reserve not met          [if applicable]

Ends in                  2h 14m
Bid rule                 Direct bidding · No extension
                         [or] Proxy bidding · 30s extension

[Place bid]              [Buy now £80]

Your max                 £60.00     [if proxy bidding]
```

- Show current price, minimum next bid, server countdown and bid rule together.
- Reserve status is shown as "Reserve not met" or hidden if no reserve — never "Reserve met" unless authoritatively true.
- Bid rule (direct/proxy, extension policy) is stated before the user bids, not discovered after.
- No pulsing timers, fake viewer counts, confetti or "someone is about to bid" theatre.
- Leading/outbid status is evidence-backed and updated accessibly without excessive announcements.
- Winner state leads with required payment/fulfilment action; celebration is subordinate.

### 7.2 Seller centre — priority

```text
Needs attention
  2 awaiting payment     [deadline: 48h]
  1 reserve not met      [relist or accept?]

Live
  Vintage Leather Jacket  18 bids  2h 14m left

Ended
  Ceramic Vase            Settled  £120
```

- Seller centre prioritizes auctions needing action, not equal status cards.
- Payment deadline countdown is shown for awaiting-payment auctions.
- Reserve-not-met auctions prompt seller decision: relist or accept highest bid.

### 7.3 Motion/accessibility

- Countdown updates without animation; reduced motion shows static time.
- Bid confirmation states show exact amount and binding consequence.
- Outbid notification is a single haptic, not repeated alerts.
- Screen-reader live regions announce price changes and state transitions.
- Large Text preserves bid input, countdown and status readability.

---

## 8. Target state architecture

### 8.1 Extended lifecycle states

```text
draft → scheduled → live → extended → ended
  ↓                        ↓
  cancelled              ended
                           ↓
                    reserve_not_met → relisted | seller_accepted
                           ↓
                    awaiting_payment → paid → settling → settled
                           ↓                    ↓
                    payment_expired         failed
                           ↓
                    second_chance_offered → awaiting_payment
```

### 8.2 Extended canonical resolver

```ts
type CanonicalLifecycle =
  | 'draft' | 'scheduled' | 'live' | 'extended'
  | 'ended' | 'reserve_not_met' | 'awaiting_payment'
  | 'payment_expired' | 'paid' | 'settling' | 'settled'
  | 'cancelled' | 'failed';

type TerminalReason =
  | 'cancelled' | 'settled' | 'buy_now' | 'scheduled_end'
  | 'reserve_not_met' | 'payment_expired' | 'second_chance'
  | 'seller_accepted_below_reserve' | null;
```

### 8.3 Target command flow

```text
auction command
  → auth + policy + idempotency
  → lock auction and relevant bid/order rows
  → validate server clock/state
  → append bid/transition/settlement record
  → update canonical snapshot
  → commit
  → outbox notification/realtime/analytics
  → reconciliation sweep
```

All display surfaces consume the same `effectiveState`, `viewerState`, reserve state, server time and next required action contract.

---

## 9. Proxy bidding design

### 9.1 Contract

```ts
interface ProxyBid {
  auctionId: string;
  maxBidGbp: number;      // user's true maximum
  clientMessageId: string; // idempotency
}

// System auto-increments up to maxBidGbp:
// currentBid + minIncrement, capped at maxBidGbp
// If another proxy exists, raise to their maxBid + minIncrement, capped at this maxBid
// Deterministic tie-break: earlier created_at wins
```

### 9.2 State machine

```text
proxy_bid_placed(maxBidGbp)
  → evaluate against current highest proxy
  → if this maxBid > existing maxBid:
    → new currentBid = min(this.maxBid, existing.maxBid + minIncrement)
    → this user is leading
  → if this maxBid <= existing maxBid:
    → currentBid = this.maxBid + minIncrement (if <= existing maxBid)
    → existing user remains leading
  → store proxy bid record (maxBidGbp is private)
  → publish currentBid update (never reveal maxBidGbp)
```

---

## 10. Anti-sniping/extension policy

### 10.1 Configurable per auction

```ts
interface AntiSnipingPolicy {
  enabled: boolean;
  extensionSeconds: number;  // e.g. 30
  maxExtensions: number;     // e.g. 10
}
```

- Default: bid in last N seconds extends `endsAt` by extensionSeconds, capped at maxExtensions.
- Policy is stated in the UI before bidding.
- Extension updates `endsAt` atomically within the bid transaction.

---

## 11. Payment and fulfilment handoff

### 11.1 Target flow

```text
auction ended (highest bid >= reserve)
  → status = 'awaiting_payment'
  → create payment intent with deadline (e.g. 72h)
  → notify winner: "Pay by [deadline] or lose the item"
  → if paid:
    → status = 'paid' → 'settling'
    → create order, reserve inventory
    → post ledger entries (now backed by payment)
    → mark listing 'sold'
    → status = 'settled'
    → schedule seller payout hold
  → if payment expired:
    → status = 'payment_expired'
    → offer second-chance to next highest bidder
    → if accepted: → 'awaiting_payment' (new deadline)
    → if declined or no next bidder: reactivate listing
```

### 11.2 Key invariants

- Listing is NOT marked `sold` until payment is confirmed.
- Ledger entries are NOT posted until payment is confirmed.
- Seller payout has a hold period after fulfilment confirmation.
- Second-chance offer has its own payment deadline.
- All transitions are audit-attributable (actor, source, reason, timestamp).

---

## 12. Security, privacy and threat analysis

| Threat/failure | Current exposure | Required control |
|---|---|---|
| Reserve bypass | `index.ts:9401–9413` — no reserve check | Check reserve before declaring winner |
| Premature sale | `index.ts:9418–9424` — listing sold before payment | Payment-gated settlement |
| Shill bidding | No detection | Graph-based fraud classifier, seller-bid relationship analysis |
| Collusion | No detection | Bid pattern analysis, account risk scoring |
| Payment abuse | No payment lifecycle | Payment intent, deadline, retry, failed payment handling |
| Seller cancellation abuse | No policy | Cancellation window, bidder notification, audit trail |
| Realtime gap | No sequence number | Monotonic auction sequence + gap recovery |
| Double-settle | `FOR UPDATE SKIP LOCKED` mitigates | Lease-protected sweep with dedup |
| Burst load at close | No load testing | Burst/load tests on closing auctions |
| Bid retractions | No policy | Define valid retraction reasons and timing rules |

---

## 13. SLOs, SLIs and observability

| Journey | SLI | Target |
|---|---|---:|
| Bid acceptance | concurrent bids → deterministic ordering | 100% |
| Bid idempotency | duplicate bids for same key | 0 |
| Settlement correctness | reserve-not-met auctions incorrectly settled | **0** |
| Payment deadline | winner pays within deadline | ≥95% |
| Second-chance acceptance | expired → next bidder accepts | measurable |
| Sweep catch-up | downtime → missed auctions caught up p99 | ≤5 min |
| Realtime delivery | bid event → client p95 | ≤2 s |
| Realtime gap recovery | missed event → snapshot refetch p99 | ≤10 s |
| Order/fulfilment | settled → order created | 100% |
| Seller payout | fulfilment confirmed → payout initiated p99 | ≤24h |

Metrics: bid count by auction, bid latency, settlement outcome (sold/reserve_not_met/no_bids), payment status distribution, second-chance acceptance rate, sweep duration, realtime gap count, shill bidding alerts. Never log bid amounts with user identifiers in analytics.

---

## 14. Migration, flags, compatibility and rollback

### Flags

```text
auction_reserve_enforcement_v1
auction_proxy_bidding_v1
auction_anti_sniping_v1
auction_payment_lifecycle_v1
auction_second_chance_v1
auction_seller_cancellation_v1
auction_realtime_sequence_v1
```

### Phase 0 — immediate correctness

1. **Add reserve price check to settlement sweep** (`index.ts:9401–9413`): if `topBid.amount_gbp < auction.reserve_price_gbp`, set status to `reserve_not_met`, reactivate listing, do NOT set winner.
2. **Stop marking listing `sold` before payment** (`index.ts:9418–9424`): introduce `awaiting_payment` state.
3. **Stop posting ledger entries before payment** (`index.ts:9434–9441`): defer to payment confirmation.
4. Publish the transition table and invariants in code/tests.

### Phase 1 — payment lifecycle

1. Payment intent creation on auction end with deadline.
2. Payment confirmation → settlement → order creation.
3. Payment expiry → second-chance offer or relist.
4. Seller payout hold after fulfilment.

### Phase 2 — bidding policy

1. Proxy bidding with `maxBidGbp` and auto-increment.
2. Anti-sniping extension (configurable per auction).
3. Bid retraction policy with valid reasons and timing rules.

### Phase 3 — seller operations and realtime

1. Seller cancellation route with policy and bidder notification.
2. Seller revision constraints after bids exist.
3. Monotonic auction sequence and gap recovery.
4. Burst/load tests on closing auctions.

### Phase 4 — abuse and support

1. Shill bidding detection, collusion, payment abuse controls.
2. Immutable support timeline and dispute evidence.
3. Account-risk-based bid blocking.

Rollback: reserve enforcement can be rolled back by reverting the sweep check, but never roll back a settled auction. Payment lifecycle rollback must preserve already-paid auctions. Proxy bidding rollback must preserve existing proxy bids until they expire or the auction ends.

---

## 15. File/owner/dependency map

| Work | Canonical files | Owner/dependency |
|---|---|---|
| Reserve enforcement | `index.ts` (lines 9380–9413), `auctions.ts` (lines 66–92) | Commerce Platform |
| Payment lifecycle | `index.ts` (lines 9401–9441), new payment intent routes | Commerce + Payments |
| Proxy bidding | `auctions.ts` (lines 1118–1582), `chatApi.ts` equivalent, migrations | Commerce Platform |
| Anti-sniping | `auctions.ts` bid handler, `auctions.ts:66–92` resolver | Commerce Platform |
| Second-chance | `index.ts` sweep, new route | Commerce Platform |
| Seller cancellation | new route in `auctions.ts`, notification service | Commerce + Trust & Safety |
| Realtime sequence | `lib/realtime.js`, `auctions.ts` bid handler, frontend | Platform/Mobile |
| Order/fulfilment | `auctions.ts:2271` (fulfilment: null), order service | Commerce + Fulfilment |
| Abuse detection | new shill bidding classifier, AML integration | Trust & Safety |
| Load testing | test infrastructure | Platform/SRE |

---

## 16. Test and release gates

- No accepted bid below authoritative minimum or outside live state.
- Concurrent bids produce deterministic ordering and one winner.
- Idempotent retry returns the original response; changed payload is rejected.
- **Reserve-not-met auctions are NOT settled with a winner.**
- **Listing is NOT marked sold before payment confirmation.**
- **Ledger entries are NOT posted before payment confirmation.**
- Payment deadline expiry triggers second-chance or relist.
- Second-chance offer has its own payment deadline.
- Worker restart/downtime cannot double-settle or miss terminal auctions.
- Realtime gap triggers snapshot recovery before claiming leader state.
- Winner/payment/order/payout reconciliation has zero unexplained mismatches.
- All bid/cancel/reserve changes are audit-attributable.
- Proxy bidding auto-increments correctly with deterministic tie-breaking.
- Anti-sniping extension updates `endsAt` atomically and caps at maxExtensions.
- Seller cancellation notifies all affected bidders.
- Countdown, large text, reduced motion and screen-reader live regions pass on device.
- Burst/load tests on closing auctions pass without double-bids or settlement errors.

---

## 17. Explicit non-goals

- Pulsing timers, fake viewer counts, confetti or "someone is about to bid" theatre.
- AI-generated bid recommendations or send-time optimization.
- Guaranteed real-time delivery (socket events are best-effort; server acceptance is the receipt).
- Redesigning the transactional core — it is strong; extend it, don't replace it.
- Auctioning digital assets before the fulfilment/order pipeline is wired.

---

## 18. Decisions requiring product, legal/trust and operations input

1. **Proxy bidding vs direct bidding** — eBay's familiar model is proxy; direct is simpler. Decide and state in UI.
2. **Anti-sniping policy** — hard close (eBay) or extension (Catawiki)? Default and per-auction override?
3. **Reserve price visibility** — hidden (eBay) or shown as "Reserve not met" indicator?
4. **Payment deadline** — 48h, 72h, 7 days? Configurable by seller?
5. **Second-chance offer** — automatic to next bidder or seller-discretion?
6. **Seller cancellation window** — before bids? after bids with penalty? never after reserve met?
7. **Bid retraction** — allowed? under what conditions? timing restrictions?
8. **Seller payout hold** — how long after fulfilment confirmation?
9. **Shill bidding detection** — automated? manual review? what thresholds?

---

## 19. Priority decision summary

| Priority | Decision |
|---:|---|
| **P0** | Enforce reserve price at settlement (`index.ts:9401–9413`) — highest bid below reserve must NOT settle with a winner |
| **P0** | Stop marking listing `sold` before payment (`index.ts:9418–9424`) — introduce `awaiting_payment` state |
| **P0** | Stop posting ledger entries before payment (`index.ts:9434–9441`) — defer to payment confirmation |
| **P0** | Add payment deadline, expiry, and second-chance offer lifecycle |
| **P0** | Decide and implement proxy bidding or explicitly state direct-only in UI |
| **P1** | Add anti-sniping/extension policy (configurable per auction) |
| **P1** | Add seller cancellation route with policy and bidder notification |
| **P1** | Add realtime monotonic sequence and gap recovery |
| **P1** | Add shill bidding/collusion detection and burst load testing |

---

## 20. Final assessment

**PARTIAL — LIFECYCLE OPERATIONS AND POLICY CLOSURE REQUIRED.** The auction system has a strong transactional core: `FOR UPDATE` row locks, atomic idempotency claims, `FOR UPDATE SKIP LOCKED` sweep, canonical lifecycle resolver, AML/eligibility checks, and server-authoritative detail UI. But the settlement sweep at `index.ts:9380–9413` declares a winner based solely on highest bid without checking `reserve_price_gbp` — a seller who sets a £100 reserve and gets a £30 bid will see their item sold for £30. The listing is marked `sold` and ledger entries are posted before the winner pays, meaning a non-paying winner has already consumed the listing. There is no proxy bidding, no anti-sniping policy, no payment deadline, no second-chance offer, and no seller cancellation route. Preserve the current authoritative/idempotent core; finish reserve enforcement, payment lifecycle, proxy bidding, and settlement reconciliation rather than redesigning the surface in isolation.
