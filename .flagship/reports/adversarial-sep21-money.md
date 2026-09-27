# Adversarial Verification — Sep-21 Financial Findings (FIN-B … FIN-F)

**Scope:** Disprove-or-verify pass over the Sep-21 audit's five money-path findings
against the live production routes in `backend/api/src/`. Repair claims were not
taken at face value; every claim below was traced through the real code path.

- Repository: `C:/Users/User/Desktop/thryftverse-upgrade`
- HEAD at audit time: `b4cf0b53` (working tree carries the repair diff, uncommitted)
- Method: read-only source trace + test review; no source files were modified.

---

## Overall verdict: FAIL

| Area | Claim under test | Verdict |
|---|---|---|
| FIN-B | `coOwn_trade` contexts cannot authorize a second public P2P payment | **VERIFIED** — unconditional rejection before any debit |
| FIN-C | Auction payments use canonical commerce escrow, order binding, settlement, refund | **FAILED** — the resolved production rail parks the intent in `requires_confirmation` with no user-facing capture path (Finding 1) |
| FIN-D | Asset-row locking makes the counterparty scan safe; all order writers/expiry obey one lock order | **PARTIAL** — placement/DRIP/buyout/expiry-worker are consistent, but the user-cancel route inverts `sequence ↔ order` and can deadlock a matching placement (Finding 2); two pre-existing ×1000 reservation top-ups bypass the versioned quote (Finding 4) |
| FIN-E | Lockup policy is kind-aware (`primary`/`secondary`/`drip`); DRIP buys only primary issuance | **VERIFIED** |
| FIN-F | Shared four-gate eligibility policy used by manual placement and DRIP inside the effect transaction | **VERIFIED with residual** — policy is shared and correctly positioned, but halt/exit state can still flip between evaluation and commit (Finding 3) |

**Finding count:** 4 — **Worst severity:** HIGH

---

## Finding 1 — HIGH — FIN-C: auction winner payment is unpayable on the resolved `oneze_internal` rail

**Claim under test:** auction winner payment provisions a canonical order, mints a
provider intent through `POST /payments/intents`, binds `order_id`, and settles
through the canonical commerce escrow branch after a provider-verified capture.

**What the code actually does end-to-end:**

1. `POST /auctions/:auctionId/payment` provisions the order and reservation, then
   calls `createAuctionPaymentIntent` — an in-process `app.inject` of
   `POST /payments/intents` whose payload is `channel`, `money`,
   `idempotencyKey`, `instrumentId`, `metadata` — **no `orderId`, no `gatewayId`**
   (`backend/api/src/routes/auctions.ts:437-461`, call site `1229-1253`).
2. The canonical route resolves the gateway:
   `gatewayId = defaultGatewayForChannel('commerce', payload.gatewayId)` →
   `resolveChannelGateway(caps, 'commerce', undefined, fallback)`
   (`backend/api/src/index.ts:28967-28980`;
   `backend/api/src/lib/countryCapabilityPolicy.ts:37-54`).
   The capability default is `internalRailsByChannel['commerce'][0]`
   (`countryCapabilityPolicy.ts:65-72`), which is `'oneze_internal'` for **every**
   country template — it is listed first in each `gatewaysByChannel.commerce`
   (`backend/api/src/lib/countryCapabilities.ts:245, 293, 343, 392, 441, 492, 542`),
   split out as an internal rail (`countryCapabilities.ts:204-216, 796-808`), and
   internal rails bypass the `isGatewayConfigured` filter
   (`countryCapabilities.ts:819-825`). So in every environment, winner-pay mints a
   `oneze_internal` intent.
3. `createGatewayPaymentIntent` returns `initialStatus: 'requires_confirmation'`,
   `clientSecret: null` for `oneze_internal` (`index.ts:6561-6571`).
4. The synchronous internal-settlement branch requires
   `gatewayId === 'oneze_internal' && channel === 'commerce' && orderId`
   (`index.ts:29608`). `orderId` was not sent — the auction route binds
   `payment_intents.order_id` only **after** the intent exists
   (`auctions.ts:1318-1330`). The branch never runs.
5. The winner-pay route then checks `intent.status === 'succeeded'` (auctions.ts:1429)
   — it is `requires_confirmation` — and returns `paymentStatus: 'pending'`
   (`1445-1453`). The comment at `1427-1428` ("a synchronously-settled gateway …
   can return 'succeeded' already") describes exactly the path that cannot fire.
6. **No user-facing path can drive the intent to `succeeded`:**
   - `POST /payments/intents/:id/confirm` caps the owner at `'processing'`;
     terminal statuses require admin, plus a maker-checker second approver in
     production (`index.ts:29866-29968`).
   - `oneze_internal` has no provider and no webhook; nothing calls the
     auction-settle hook (`index.ts:31451-31486`) for it.
   - `GET /auctions/:id/payment-status` self-heals only when the intent is
     already `'succeeded'` (`auctions.ts:1536-1547`).
   - A second `POST /payments/intents` with `orderId` fails
     `CHECKOUT_DETAILS_REQUIRED` (`index.ts:29072-29080`) because the auction
     order INSERT omits `shipping_quote_id` (`auctions.ts:1067-1090`).
   - No worker settles parked internal intents (sweep of `workers/handlers/*`).
7. **Consequence:** the auction wedges in `awaiting_payment`. The parked intent
   shields the order from expiry-cancel for 2 h
   (`commerceCheckoutLifecycle.ts:35-49`); after that the order can cancel, the
   sweep advances a second-chance offer
   (`workers/handlers/auctionSweepHandler.ts:465-490`), and the next bidder hits
   `LISTING_CHECKOUT_RESERVED` (`auctions.ts:1135-1146`) or the identical wall.
   Every bidder's payment attempt is unpayable through the intended flow; only an
   admin maker-checker `confirm` can settle, after which `payment-status`
   self-heals the auction row.
8. **Test masking:** `auctionPaymentSettlement.test.ts:55` hard-fails the real
   inject path ("inject must be stubbed via createAuctionPaymentIntent") and every
   case injects a stub that returns external rails (`mollie_eu` at :191) or
   pre-settled statuses — so no test exercises the production gateway resolution
   that selects `oneze_internal`.

**Reproduction sketch:**

1. Complete an auction; winner calls `POST /auctions/:id/payment` with any
   idempotency key.
2. Observe response `paymentStatus: 'pending'`, intent `gatewayId:
   'oneze_internal'`, `status: 'requires_confirmation'`, `clientSecret: null`.
3. Winner calls `POST /payments/intents/:id/confirm` → 403
   `TERMINAL_STATUS_REQUIRES_ADMIN` for `succeeded`, or transitions to
   `processing` — never `succeeded`.
4. Poll `GET /auctions/:id/payment-status` → `pending` forever; the order can
   only cancel after the 2 h parked shield lapses; the sweep offers the next
   bidder, whose attempt wedges identically.
5. Net effect: no auction sale can complete through the user-facing payment
   flow in production on the resolved default rail.

**Severity rationale:** HIGH rather than CRITICAL because no funds move — the
wallet is never debited and escrow is never entered, so there is no theft or
double-capture path. But the flagship auction payment path is non-functional
end-to-end; the "verified capture → canonical escrow settle" claim is unreachable
without manual admin intervention per payment.

**Fix direction:** either pass `orderId` through `createAuctionPaymentIntent` so
the canonical synchronous `oneze_internal` settle fires at intent creation (the
order is already provisioned before Phase C — `auctions.ts:1048-1134`), or add an
explicit internal-capture step after the binding write at `auctions.ts:1366`.

---

## Finding 2 — MEDIUM — FIN-D: order-cancel route inverts the `sequence ↔ order` lock order and deadlocks a matching placement

**Canonical lock order in placement** (`backend/api/src/routes/coOwn.ts`):

`coOwn_assets FOR UPDATE` (~3708) → all participant wallets in `wallets.id` order
via `lockCoOwnWalletsForUsers` (3868; helper `lib/coOwnSettlement.ts:147-178`) →
actor reservation `FOR UPDATE` (3870-3895) → policy eval (3933) →
`allocateMarketSequence` — upsert row-lock on `coown_market_sequences`
(4066; helper `302-317`) → order INSERT (4083) → inline expiry `UPDATE
coOwn_orders` (4138-4149) → resting-book scan `… FOR UPDATE` (4192-4212) → fills.

So placement acquires **sequence → order-rows**.

**The user-cancel route acquires order-row → sequence:**

- `POST /co-own/assets/:assetId/orders/:orderId/cancel` locks the order row
  `FOR UPDATE` (coOwn.ts:4893-4900), checks ownership/status/capability, then
  calls `allocateMarketSequence` (4927), then cancels (4929-4936) and releases
  the placed reservation (4937-4944). **It never takes the asset row lock.**

**Deadlock:** placement P on asset A holds `coown_market_sequences(A)` and blocks
in the `FOR UPDATE` book scan (4192-4212) on resting order O_c; cancel C holds
O_c (4897) and blocks on `coown_market_sequences(A)` (4927). Postgres raises
40P01 and aborts one transaction. The same inversion fires if C's order is in
P's inline-expiry update set (4138). The expiry worker is *not* part of the
cycle — it uses `FOR UPDATE SKIP LOCKED`
(`workers/handlers/coOwnOrderExpiryHandler.ts:56-72`) and never touches
`coown_market_sequences` or assets, so it only ever waits on reservation rows a
placement has not yet acquired (placement's reservation release at 4151-4159 runs
after its order-row update at 4138, the point where it would block).

**Reproduction sketch:**

1. User B has a resting sell order O on asset A (market `trading`).
2. Concurrently: (a) B calls `POST /co-own/assets/A/orders/O/cancel`;
   (b) buyer U calls `POST /co-own/assets/A/orders` for a matching buy.
3. If the placement reaches `allocateMarketSequence` before the cancel, and the
   cancel reaches the order lock first, each waits on the other's lock →
   `deadlock detected` → one request 500s.

**Impact:** liveness only — the aborted transaction rolls back atomically, so no
partial settlement or double-spend. But it is a residual ABBA deadlock in exactly
the class FIN-D claimed to eliminate, reachable by an ordinary user action
(cancelling while a match executes). Skipping the asset lock is itself tolerable
(cancel is shrink-only and guarded by the order-row lock + status check); the
sequence-order inversion is the defect.

**Fix direction:** either take the asset row lock (or the sequence) *before* the
order lock in the cancel route — matching placement's `asset → … → seq → orders`
order — or drop the `allocateMarketSequence` call from cancel (the sequence bump
exists for book-ordering telemetry; a cancelled row does not need a new sequence).

---

## Finding 3 — LOW — FIN-F: residual halt/exit TOCTOU inside the effect transaction

The shared four-gate policy (`backend/api/src/lib/coOwnEligibility.ts`) is
genuinely shared and correctly positioned: manual placement evaluates it inside
the transaction after reservation validation and before the order insert/fills
(`routes/coOwn.ts:3933-3938`, rollback at 3940); DRIP evaluates it inside its
effect transaction before the settlement-rate resolution and wallet debit
(`workers/handlers/coOwnDripExecutionHandler.ts:313-338`), with correct denial
handling (retryable marks for state-dependent denials, `retained-cash` for a
terminal exit action).

Residual: the evaluation is a point-in-time read.

- The reconciliation halt lives in Redis (`oneze:mint_burn_halted`) — a halt
  landing *after* the Redis read but *before* COMMIT cannot be observed;
  Redis cannot join the Postgres transaction.
- The active-exit gate reads `coOwn_corporate_actions` under READ COMMITTED; a
  concurrently-inserted `'announced'`/`'executing'` row that commits after the
  policy SELECT is invisible to it (a `FOR UPDATE` cannot lock a phantom row).

**Reproduction sketch:** begin a large placement; commit an `announced` exit
corporate action (or flip the Redis halt) between the policy evaluation at
coOwn.ts:3933 and the fill loop/commit — the fills settle post-transition.

**Severity rationale:** LOW — the window is milliseconds inside an already-locked
transaction, both callers re-check at the last responsible moment, and the repair
materially narrows what was previously a multi-request gap. Closing it fully
would require a DB-resident halt flag locked `FOR UPDATE` (or a serializable
retry loop) — worth noting because the repair claim asserts the TOCTOU is closed;
it is narrowed, not eliminated.

---

## Finding 4 — LOW — FIN-D/E adjacent: resting/incoming reservation top-ups still use raw ×1000, bypassing the versioned settlement quote

During fills, the placement route recomputes the resting order's required
reservation as `Math.ceil(… * 1000)` (`routes/coOwn.ts:4320-4321`) and tops up the
incoming order's reservation the same way (`4420-4421`). The authoritative GBP→1ZE
conversion elsewhere goes through the versioned `computeCoOwnSettlementUnits`
quote (e.g. `lib/coOwnTransfer.ts:198-220`; the initial reservation insert uses
it too). With GBP→USD ≠ 1 the ×1000 path **under-reserves** a resting buy's
continuing obligation: the wallet's unreserved balance can be spent elsewhere,
and a later matching sell placement then fails its spendable check inside
`applyCoOwnTransfer` and the *seller's* whole order rolls back with a 500.

**Reproduction sketch:** resting buy B is partially filled; the top-up at 4321
reserves milli-GBP ≈ 1ZE instead of the quoted GBP→USD-derived units; B's owner
spends the gap; a seller placement matching B throws an insufficient-balance
error mid-transaction.

**Severity rationale:** LOW — integrity-safe (the spendable check fails closed
and rolls back atomically; no double-spend), pre-existing (predates this repair
wave, introduced in `bcc47f88`), but it is a real consistency defect on the same
reservation ledger this audit verifies and it can deny service to a valid
counterparty order.

---

## Verified-claim detail (no findings)

### FIN-B — `coOwn_trade` cannot authorize a second P2P payment — VERIFIED

- The P2P route admits `coOwn_trade` in the context enum (`index.ts:22915-22929`)
  but `assertP2pTransferContextAuthorized` throws unconditionally for it —
  before the single-use check and before any ledger effect
  (`lib/walletMoneyPath.ts:631-694`, throw at 643-653). The message states the
  DvP rationale explicitly.
- Ordering: the route runs `evaluateP2pPolicyEligibility` (which calls the
  assert at `index.ts:3867`) before `recordIzeTransfer` (`index.ts:23129`) and
  before wallet locks (`index.ts:23178-23187`), all inside one transaction — a
  thrown context error rolls back with zero debits.
- Single entry point: `assertP2pTransferContextAuthorized` has exactly one
  production caller (the policy evaluation) and `recordIzeTransfer` one caller
  (the route). `marketplace_sale` is rejected at the route boundary with a
  pointer to the commerce flow (`index.ts:22929-22934`). `platform_reward`
  requires an admin caller (walletMoneyPath.ts:655-664) and every privileged
  context is single-use via a committed-transfer lookup (674-693) plus the
  stored-metadata index.
- Regression coverage: `walletMoneyPathReservations.test.ts:903` asserts a
  settled `coOwn_trade` is rejected before any debit.

### FIN-E — kind-aware lockup; DRIP buys only primary — VERIFIED

- `assertCoOwnLockupPermitted` gates **only** `'secondary'`
  (`lib/coOwnSettlement.ts:103-133`); `getCoOwnLockupState` resolves the
  effective end via `COALESCE(lockup_end_date, created_at + lockup_months)`
  (`59-90`).
- Route level: reserve gate `coOwnLockupCapabilityError` + `reserveBuyDrawsPrimary`
  (routes/coOwn.ts:3223-3227); place gate + `placeBuyDrawsPrimary` = buy with
  `available_units > 0` (3764-3769); during lockup/offering the resting book is
  not scanned at all (`secondaryMatchingOpen`, 3783/4162-4194) so a buy can only
  draw the primary pool.
- Backstop inside the settlement primitive: `applyCoOwnTransfer` derives
  `kind = enforceSellerHolding ? 'secondary' : 'primary'`
  (`lib/coOwnTransfer.ts:185-196`) — server-derived from counterparty
  provenance, so a holder→holder resale cannot masquerade as primary.
- DRIP passes `'drip'` (`coOwnDripExecutionHandler.ts:238`), settles against
  `seller_id = asset.issuer_id`, decrements `available_units`, and never touches
  the resting book.
- Buyout acceptance is double-covered: market status `paused` under lockup
  blocks the `buyout` capability, and its `applyCoOwnTransfer` runs with
  `enforceSellerHolding: true` → `'secondary'` → blocked.

### FIN-D — the parts that check out

- Placement locks `coOwn_assets FOR UPDATE` (~3708) **before** the unlocked
  participant-id scan (~3821) and wallet locking (3868); the scan's superset
  property holds because no order writer can appear without the asset lock.
- All wallets are locked once, in `wallets.id` order, before any
  reservation/holding/order row — matching `applyCoOwnTransfer`'s
  wallets→reservations→holdings order (`lib/coOwnTransfer.ts:222-229`).
- Buyout acceptance locks offer + asset in one `FOR UPDATE` join
  (coOwn.ts:5383-5399) before `applyCoOwnTransfer`.
- The expiry worker is shrink-only and `SKIP LOCKED`; its orders→reservations
  direction cannot cycle against placement (placement holds no `placed`
  reservation rows when it blocks on order rows).
- `userErasure` order updates (`lib/userErasure.ts:306-313`) can *block* a
  placement (never the reverse) — a stall, not a deadlock.

---

## Final verdict

```text
Verdict:        FAIL
Findings:       4
Worst severity: HIGH
```

- F1 HIGH — FIN-C: auction winner payment mints a `oneze_internal` intent in
  `requires_confirmation` that no user-facing path can capture; the canonical
  escrow settle is unreachable end-to-end on the resolved production rail.
- F2 MEDIUM — FIN-D: cancel route acquires order-row → market-sequence, inverted
  versus placement's sequence → order-row; concurrent cancel+match deadlocks
  (40P01).
- F3 LOW — FIN-F: halt/exit policy gates are evaluated once inside the
  transaction; a halt flip or exit insert between evaluation and commit is not
  re-checked (narrowed, not eliminated).
- F4 LOW — pre-existing ×1000 reservation top-ups (coOwn.ts:4321, 4421) bypass
  the versioned settlement quote and under-reserve resting buys.
