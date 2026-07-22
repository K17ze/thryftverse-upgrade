# 10 — Transaction Contracts & Release Gates

**Goal:** specify the transaction-engine contracts that must exist before any money moves. The visual foundation (Phases 0–2, read-only) is complete and safe. Live order submission, wallet reservation, settlement, redemption, club allocation, and corporate actions are **NO-GO** until this document is implemented and tested.

**Status:** visual foundation complete; transaction specification pending.

**Scope:** this document defines the canonical entities, state machines, ledger invariants, matching rules, settlement/finality, corporate actions, valuation provenance, eligibility gates, market-data recovery, club edge cases, operational controls, and the phase-by-phase go/no-go checklist.

**Constraint:** every rule here is backend-authoritative. The frontend renders the state the backend produces; it never invents transitions, balances, or finality. (`AGENTS.md` §11.)

---

## 1. Canonical entities and identifiers

Every entity has a **durable, globally unique identifier** that survives renames, UI changes, and migrations. Never join cash, holdings, or corporate actions on a user-editable slug.

| Entity | Identifier | Format | Notes |
|---|---|---|---|
| Underlying asset | `asset_id` | `AST-XXXXXXXX` | Physical/economic thing. Immutable once issued. |
| Issuance vehicle | `vehicle_id` | `VEH-XXXXXXXX` | Legal entity holding title. |
| Instrument series | `instrument_id` | `INS-XXXXXXXX` | Fungible unit class that trades. |
| Market | `market_id` | `MKT-XXXXXXXX` | One trading pair (`INS / 1ZE`). |
| Order | `order_id` | `ORD-XXXXXXXX` | User intent. |
| Trade/execution | `trade_id` | `EXE-XXXXXXXX` | Matched execution. |
| Settlement batch | `settle_batch_id` | `STL-XXXXXXXX` | DvP settlement. |
| Journal entry | `journal_id` | `JRN-XXXXXXXX` | Immutable ledger posting. |
| Transaction | `txn_id` | `TXN-XXXXXXXX` | Business transaction (may post multiple journal entries). |
| Corporate action | `ca_id` | `CA-XXXXXXXX` | Distribution, vote, split, buyback, liquidation. |
| Club | `club_id` | `CLB-XXXXXXXX` | Coordination group. |
| Club allocation | `alloc_id` | `ALC-XXXXXXXX` | Per-member allocation record. |
| Rights version | `rights_version` | `vN · YYYY-MM` | Disclosure version. |
| User | `user_id` | `USR-XXXXXXXX` | Identity-verified user. |

**Idempotency:** every financial command (order submit, cancel, redeem, deposit, corporate-action posting) carries a **client-supplied idempotency key**. The backend deduplicates on `(user_id, idempotency_key)`. A replayed command returns the original result, never a duplicate posting.

---

## 2. Order state machine

### 2.1 Canonical states

```text
draft → submitted → accepted → open → partial → filled
                                         │
                                         ├── cancel_pending → cancelled
                                         ├── replace_pending → open (new order_id)
                                         └── (market halt) → halted_open → [reopen or cancelled]

submitted → rejected          (validation fail)
accepted  → rejected          (pre-trade risk fail)
open      → expired           (GFD end-of-session / GTT timeout)
```

### 2.2 Permitted transitions (exhaustive)

| From | To | Trigger | Side effects |
|---|---|---|---|
| `draft` | `submitted` | User submits | Idempotency key consumed |
| `submitted` | `accepted` | Validation + eligibility + reservation pass | 1ZE/units reserved |
| `submitted` | `rejected` | Validation/eligibility/reservation fail | No reservation; reason recorded |
| `accepted` | `open` | Order enters book | — |
| `open` | `partial` | Match executes part | Partial fill recorded; residual remains open |
| `partial` | `partial` | Further match | Cumulative filled qty updated |
| `partial` | `filled` | Final match | Residual reservation released |
| `open` | `filled` | Full match | Reservation released |
| `open` | `cancel_pending` | User/system cancel | Book entry frozen; no new matches |
| `partial` | `cancel_pending` | User/system cancel | Book entry frozen |
| `cancel_pending` | `cancelled` | Cancel confirmed | Residual reservation released |
| `open`/`partial` | `expired` | Session end / GTT timeout | Residual reservation released |
| `open`/`partial` | `halted_open` | Market halt | No new matches; cancel still allowed |
| `halted_open` | `open` | Market reopen | Book reactivated |
| `halted_open` | `cancelled` | Cancel during halt | Reservation released |
| `open`/`partial` | `replace_pending` | Cancel/replace | Old frozen, new in `submitted` |
| `replace_pending` | `open` (new `order_id`) | Replace accepted | Old → `cancelled`; new reservation |
| `replace_pending` | `open` (old) | Replace rejected | Old reactivated; no change |

### 2.3 Simultaneous cancel + fill (critical race)

This is the most common source of duplicate releases and negative balances. The rule:

1. Every match and every cancel carries a **monotonic event sequence** on the market.
2. The matching engine applies events in sequence order. If a fill event (`seq=N`) and a cancel event (`seq=N+1`) arrive for the same order:
   - The fill at `seq=N` is applied first — order becomes `partial` or `filled`.
   - The cancel at `seq=N+1` is then evaluated against the **post-fill** state.
   - If the order is already `filled`, the cancel is a **no-op** (returns `cancelled` with `filled_qty = order_qty`, no reservation release).
   - If the order is `partial`, the cancel releases only the **post-fill residual** reservation.
3. **Never** release more reservation than the remaining (unfilled) quantity. The invariant: `released_reservation ≤ remaining_reservation` at every transition.
4. The cancel response includes the `filled_qty` at the moment of cancel so the UI shows the truth.

### 2.4 Terminal states

`filled`, `cancelled`, `expired`, `rejected`. Terminal states are **immutable** — no further transitions. A `corrected` state (see §2.5) is a separate record referencing the original, not a mutation.

### 2.5 Trade correction

If a trade must be reversed (erroneous execution), it goes through a **correction record** (`trade_correction_id`) that posts compensating journal entries. The original `trade_id` is never mutated. The UI shows "Corrected" with a link to the correction record.

---

## 3. Trade / settlement state machine

### 3.1 Trade lifecycle

```text
matched → confirmed → settlement_pending → settled
                │              │
                │              ├── settlement_failed → [retry or reversed]
                └── broken     └── reversed
                                   └── corrected (compensating entries)
```

| From | To | Trigger | Side effects |
|---|---|---|---|
| `matched` | `confirmed` | Both sides' reservations confirmed | — |
| `confirmed` | `settlement_pending` | DvP batch opened | Units + 1ZE in transit |
| `settlement_pending` | `settled` | Both legs posted | Buyer: units `settled`; Seller: 1ZE `available` |
| `settlement_pending` | `settlement_failed` | One leg fails | Retry per §4.5 |
| `settlement_failed` | `reversed` | Retry exhausted | Both reservations released; trade `reversed` |
| `settled` | `corrected` | Erroneous trade reversal | Compensating entries; original immutable |

### 3.2 DvP ordering (delivery versus payment)

**Never** post only one leg. The settlement engine posts both legs in a **single journal transaction**:

```text
DR buyer 1ZE available   →  CR seller 1ZE available
DR seller units settled  →  CR buyer units settled
```

If either leg cannot post (e.g. insufficient reserved funds due to a reconciliation break), the **entire batch fails** and retries. A matching/DB failure cannot leave only one DvP leg (`09` Phase 3 exit gate).

### 3.3 UI finality distinction

The UI must distinguish:
- **Executed** — trade matched, not yet settled. Show "Executed · settling".
- **Settling** — DvP in progress. Show "Settling · ETA [time]".
- **Owned** — settled, legally/economically effective. Show "Owned" or "Settled".

A fill notification must **not** imply completed ownership. The portfolio shows settling units in the `pending_in` state, not `settled`.

---

## 4. Settlement and finality

### 4.1 Definitions

| Term | Definition |
|---|---|
| **Trade date (T)** | Date the match occurred. |
| **Settlement date (S)** | Date ownership becomes legally/economically effective. Default S = T+1, configurable per instrument. |
| **Proceeds spendable** | Seller's 1ZE moves from `unsettled_sale_proceeds` → `available` on settlement date, not trade date. |
| **Ownership effective** | Buyer's units move from `pending_in` → `settled` on settlement date. |
| **Finality** | After `settled`, reversals require a `corrected` record with compensating entries and four-eyes approval (§10). |

### 4.2 Partial settlement

If a trade settles in parts (e.g. multi-batch), each batch posts independently. The UI shows `settled_qty` and `pending_settlement_qty` separately. `settled_qty + pending_settlement_qty = executed_qty` (invariant).

### 4.3 Failed settlement

A settlement failure triggers:
1. Automatic retry per §4.5 (exponential backoff, max 3 attempts).
2. If retries exhausted → `reversed`; both reservations released; trade marked `reversed`; operations alerted.
3. The UI shows "Settlement failed · reversed" with the trade reference and a contact link.

### 4.4 Asset/unit delivery vs payment ordering

Delivery and payment are **atomic** within a batch. There is no "delivery first, payment later" or vice versa. Both legs post in the same journal transaction (§3.2).

### 4.5 Settlement retries and timeouts

```text
attempt 1: immediate
attempt 2: +30s
attempt 3: +2min
→ reversed (operations alerted)
```

Timeout per attempt: 10s. If the settlement engine is down, all `settlement_pending` trades remain pending with a "Settlement delayed" banner; no new matches until the engine recovers.

### 4.6 Daily reconciliation

- End-of-day reconciliation compares: issued units vs sum of all unit locations; 1ZE settled claim vs sum of all 1ZE buckets; open reservations vs sum of open order reservations.
- A mismatch triggers `reconciliation_state = 'break'`; affected money movement pauses; operations alerted.
- The UI shows "Reconciling" and disables order submission / redemption on affected instruments.

### 4.7 Permitted reversals

After finality (`settled`), reversals are permitted only via:
1. A `trade_correction` record with a documented reason.
2. Compensating journal entries (never mutation of the original).
3. Four-eyes approval (§10).
4. Immutable audit trail entry.

---

## 5. Double-entry ledger contract

### 5.1 Rules

1. **Immutable journal entries** — once posted, never mutated. Corrections via compensating entries only.
2. **Every debit balanced by a credit** — `sum(debits) = sum(credits)` per journal transaction.
3. **Reversals through compensating entries** — never delete or mutate an original entry.
4. **Globally unique transaction and journal IDs** — `txn_id` and `journal_id` are durable, never reused.
5. **Idempotency keys** for every financial command — `(user_id, idempotency_key)` deduplication.
6. **Currency and unit precision** — 1ZE: 2 decimal places (cents). Units: 0 decimal places (integer). FX rates: 6 decimal places.
7. **Explicit rounding mode** — banker's rounding (half-to-even) for all monetary calculations. The **remainder** (sub-cent) is attributed to the vehicle/treasury, never to the user.
8. **Ledger posting order** — reservation posts before match; match posts both DvP legs atomically; settlement posts on settlement date.
9. **Replay and reconciliation** — journal entries are replayable from an empty state to reproduce all balances. Reconciliation = replay + compare.

### 5.2 Invariants (enforced at every posting)

```text
sum(debits) = sum(redits)                    (per journal transaction)
available >= 0                               (1ZE, per user)
reservedForOrders >= 0                       (1ZE, per user)
redemptionInProgress >= 0                    (1ZE, per user)
otherHolds >= 0                              (1ZE, per user)
settledCustomerClaim = available + reservedForOrders + redemptionInProgress + otherHolds
withdrawable <= available
settled >= 0                                 (units, per user per instrument)
reservedForSale >= 0                         (units, per user per instrument)
issued_units = sum(all canonical unit locations)   (per instrument)
released_reservation <= remaining_reservation     (per order, at every transition)
settled_qty + unsettled_qty = executed_qty        (per trade)
```

### 5.3 Ledger accounts (canonical locations)

**1ZE ledger (per user):**
- `available` — spendable now.
- `reserved_for_orders` — locked for open buy orders.
- `redemption_in_progress` — locked for pending redemptions.
- `other_holds` — any other settled holds.
- `pending_deposit` — not yet settled (separate).
- `unsettled_sale_proceeds` — not yet settled (separate).

**Unit ledger (per user per instrument):**
- `settled_available` — settled, sellable.
- `reserved_for_sale` — reserved for open sell orders.
- `pending_transfer_in` — inbound, not yet settled.
- `pending_transfer_out` — outbound, not yet settled.

**Vehicle/unit supply ledger (per instrument):**
- `settled_owner_balances` — sum of all holders' settled units.
- `sponsor_locked` — locked, not tradeable.
- `treasury` — held by vehicle.
- `retired` — cancelled via corporate action.

Invariant: `settled_owner_balances + sponsor_locked + treasury + retired = issued_units` after every posting.

---

## 6. Matching-engine rules

### 6.1 Core principles

| Rule | Specification |
|---|---|
| **Price-time priority** | Best price first; at same price, earliest timestamp first. |
| **Auction uncrossing** | Single price auction: the uncrossing price maximises executable volume; all matching orders execute at the single uncrossing price. |
| **Market orders in illiquid instruments** | **Prohibited.** No uncapped market orders. Use "Protected instant" (marketable limit with visible protection price). If slippage would exceed visible depth, disable Protected instant and show "Use limit". |
| **Self-trade prevention** | A user's buy and sell for the same instrument cannot match. The newer order is cancelled (or the older, per configured policy). |
| **Minimum tick** | `tickSize` per instrument (e.g. 0.01 1ZE). Order prices must be tick-aligned. |
| **Minimum lot** | `lotSize` per instrument (e.g. 1 unit). Order quantities must be lot-aligned. |
| **Price collars** | Orders outside ±`priceBandPct` (e.g. ±10%) of the reference price are rejected pre-trade. |
| **Fat-finger protection** | Maximum order size (`maxOrderSize`) and maximum 1ZE notional (`maxNotional`) per order. Orders exceeding are rejected. |
| **Concentration limits** | No single order may consume more than `maxDepthPct` (e.g. 25%) of visible depth. |
| **Halt** | Market halt freezes new matches; cancels remain allowed. Reopening via call auction. |
| **Closing auction** | End-of-session closing auction if configured; produces `officialClose`. |
| **Trade cancellation/correction** | Only via `trade_correction` record with four-eyes approval (§2.5, §10). |
| **Partial-fill fee** | Fee computed on the **filled** quantity, not the ordered quantity. A partial fill posts fee only on the filled portion. |
| **Hidden/iceberg orders** | **Not supported** in the initial model. All orders are fully visible in the book. |
| **RFQ** | Supported in `rfq` market mode — request for quote to designated counterparties; not an order book match. |

### 6.2 Halt and reopening

```text
continuous → halted (reason) → [call_auction reopen] → continuous
                              └→ closed (if end of session)
```

During halt: no new matches; existing orders frozen (`halted_open`); cancels allowed. Reopening via call auction with a 2-minute indication period; uncrossing at the end.

---

## 7. Corporate actions

### 7.1 First-class lifecycle events

Every corporate action is a first-class timeline entry in the asset dossier and position screen.

| Event | UI label | Effect |
|---|---|---|
| Cash/1ZE distribution | "Distribution" | 1ZE credited to holders on payment date. |
| Asset operating expense | "Operating cost" | 1ZE debited from holders per unit. |
| Dilution / new issuance | "New issuance" | `authorised` and `issued` increase; pre-emption rights per terms. |
| Unit split | "Split" | Quantity increases, price decreases proportionally; `issued` unchanged in value. |
| Unit consolidation | "Consolidation" | Quantity decreases, price increases proportionally. |
| Buyback | "Buyback" | Vehicle offers to buy units; `treasury` increases. |
| Compulsory buyout | "Compulsory buyout" | Remaining holders must sell per terms; `treasury` increases. |
| Impairment / revaluation | "Revaluation" | NAV per unit updates; no ledger change unless realised. |
| Insurance proceeds | "Insurance proceeds" | 1ZE credited to holders if asset insured event. |
| Asset sale / liquidation | "Liquidation" | Asset sold; proceeds distributed per waterfall; instrument delisted. |
| Vote / consent | "Vote" | Voting event; no ledger change until resolution. |

### 7.2 Record date, ex-date, payment date

| Date | Definition | UI effect |
|---|---|---|
| **Record date** | Snapshot of holders eligible for the action. | "Record date: 30 Jul" |
| **Ex-date** | Date from which trades do not carry the entitlement. | "Ex-distribution: 28 Jul" — orders after this date are ex-entitlement. |
| **Payment date** | Date the 1ZE/units are posted. | "Payment: 05 Aug" |

### 7.3 Fractional-unit rounding

If a split or distribution produces fractional units, the fraction is **rounded down** (floor) to the nearest whole unit. The cash equivalent of the fraction is credited in 1ZE to the holder's `available` balance on the payment date. Rounding mode: floor for units, banker's rounding for the 1ZE cash equivalent.

### 7.4 Open orders during a corporate action

- On the ex-date, all open orders for the affected instrument are **cancelled** (reservation released) at the start of the session.
- Users are notified: "Your open orders were cancelled due to [event]. Please re-enter after reviewing the new terms."
- The book reopens after the event is processed.

### 7.5 Waterfall (liquidation)

```text
1. Senior secured creditors
2. Operating expenses and taxes
3. Unsecured creditors
4. Unit-holders (pro-rata per settled units)
```

The UI shows the waterfall as a labelled diagram in the liquidation corporate-action entry. Unit-holder proceeds are 1ZE credited on the payment date.

---

## 8. Valuation provenance

### 8.1 Every displayed valuation exposes

| Field | UI label | Example |
|---|---|---|
| Method | "Method" | "Comparable sales" / "Income approach" / "Cost approach" |
| Independent or sponsor-provided | "Status" | "Independent" / "Sponsor-provided" |
| Valuer identity | "Valuer" | "[Valuer name]" |
| Effective date | "Effective date" | "02 Jul 2026" |
| Next review date | "Next review" | "Q4 2026" |
| Gross asset value | "Gross asset value" | "1,000,000 1ZE" |
| Liabilities and operating costs | "Liabilities" | "−150,000 1ZE" |
| Net asset value | "NAV" | "850,000 1ZE" |
| NAV per unit | "NAV/unit" | "10.00 1ZE" |
| FX source and timestamp | "FX" | "1ZE/GBP 0.95 · [partner] · 14:02" |
| Confidence / appraisal range | "Range" | "9.50 – 10.50 1ZE" |
| Difference: appraisal vs last trade | "Premium/Discount" | "Last 12.40 · +24.0% vs NAV" |

### 8.2 Hard rule

**Never visually present appraisal value as an executable market price.** The NAV is always labelled "NAV" with a method and date. The last trade is always labelled "Last" with an age. They are never the same number, never the same colour, never interchangeable. A premium/discount line is always shown when both exist (source §3.4).

---

## 9. Eligibility — evaluated more than once

### 9.1 Check points

Eligibility is checked at **every** of these points, not just once:

| Check point | What is checked | Failure behaviour |
|---|---|---|
| Viewing an instrument | Jurisdiction, identity verification | Show "Not available in your region" / "Verify identity"; hide trade actions |
| Opening the order ticket | + instrument eligibility, accreditation, accepted rights version | Disable ticket with reason |
| Immediately before submission | + current sanctions screening, concentration limits | Reject with reason; no reservation |
| Before settlement | + re-check jurisdiction and sanctions | If failed, trade goes to `settlement_failed` → `reversed` |
| Before redemption/transfer | + jurisdiction, sanctions, redemption restrictions | Block with reason |

### 9.2 Mid-life eligibility change

If geography, verification, sanctions screening, concentration limits, or accepted terms **change while an order is open**:

1. The order is **suspended** (`halted_open`-equivalent) — no new matches.
2. The user is notified: "Your order is under review due to [eligibility change]."
3. Operations review within 1 business day.
4. If eligibility is restored → order reactivated. If not → order `cancelled`, reservation released.

### 9.3 Rights version change

If the rights version is updated while a user has an open order:
1. The order is **suspended**.
2. The user must accept the new rights version to reactivate.
3. If not accepted within the session → order `cancelled` at session end.

---

## 10. Market-data recovery

### 10.1 Snapshot-plus-delta handshake

1. Client connects → requests snapshot (full book + market data with `snapshotSequence`).
2. Server sends snapshot + the `lastEventSequence` that produced it.
3. Client subscribes to delta stream from `lastEventSequence + 1`.
4. Deltas carry `eventSequence` (monotonic).

### 10.2 Sequence-gap recovery

If the client detects a gap (`eventSequence` jumps), it:
1. Flags the current view as "potentially stale".
2. Requests a fresh snapshot.
3. Replaces the view atomically (no partial render of mixed old/new data).

### 10.3 Duplicate-event handling

If a delta with `eventSequence` ≤ the last applied sequence arrives, it is **discarded** as a duplicate. No re-application.

### 10.4 Heartbeat timeout

- Server sends a heartbeat every 5s.
- If no heartbeat for 15s → client flags "Data stale" and shows the last reliable snapshot with a timestamp.
- Reconnection attempts every 3s, up to 5 attempts, then exponential backoff.

### 10.5 Clock-skew rules

- Client clock is never trusted for sequencing. `serverTimestamp` is authoritative.
- `dataAgeSeconds` is computed as `now_server - serverTimestamp`, not `now_client - serverTimestamp`.
- If client/server skew > 30s, the client syncs to server time for display purposes (timestamps shown in server time, labelled with timezone).

### 10.6 Cache TTL

- Market data snapshot: TTL = `stalenessThresholdSeconds` (e.g. 30s for live, 300s for closed market).
- After TTL, the UI shows "Data stale" and attempts reconnection.
- Order book: no cache — always live or "stale" if disconnected.

### 10.7 Reconnection behaviour

On reconnect:
1. Request fresh snapshot.
2. Atomically replace the view.
3. Clear "stale" badge.
4. Resume delta stream.

### 10.8 Last reliable price vs live price

- **Live price** — the current `last` from the active delta stream.
- **Last reliable price** — the most recent `last` from a reconciled snapshot, with a timestamp. Used when the stream is disconnected.
- The UI labels them: "Last 12.40 · live" vs "Last 12.40 · 3m ago (disconnected)".

### 10.9 Charts and unreconciled data

Charts may **not** render unreconciled data. If `reconciliationState !== 'reconciled'`, the chart shows the last reconciled point with a "Reconciling" annotation and freezes the line until reconciliation completes. No extrapolation, no interpolation across a reconciliation break.

### 10.10 Reconciliation break — read-only stale view

On a reconciliation break, the UI **retains a read-only stale view** with a timestamp ("Last reliable: 14:02 · 3m ago") instead of blanking the market. Order submission is disabled; cancels remain allowed. This matches the audit requirement: "retain a read-only stale view with a timestamp instead of blanking the entire market."

---

## 11. Club allocation edge cases

The individually-recorded model is the foundation (§09 Phase 5). Detail:

| Edge case | Rule |
|---|---|
| **Over-subscribed** | Pro-rata allocation based on funded commitment vs total commitment. |
| **Under-subscribed / failed close** | If minimum close threshold not met → all commitments released; no allocation; "Club did not close" notification. |
| **Pro-rata rounding** | Floor to nearest whole unit. Cash equivalent of fraction credited in 1ZE. |
| **Minimum viable allocation** | If a member's pro-rata allocation < `minAllocation` units → they receive cash equivalent in 1ZE instead of units (or the club does not close for them). |
| **Commitment withdrawal window** | Members may withdraw non-binding interest until the funded-commitment deadline. After funding, commitment is binding. |
| **Payment failure** | If a member's 1ZE reservation fails → their allocation is reduced or cancelled; remaining members' allocations may increase pro-rata. |
| **Partial allocation** | If the club receives partial allocation from the issuer → pro-rata to members; unallocated commitments released. |
| **Unused reservation release** | After allocation, unused 1ZE reservations are released to members' `available`. |
| **Individual tax/disclosure records** | Each member receives their own position receipt, tax lot, and disclosure acceptance record. |
| **Member privacy** | Members see only their own allocation; no visibility into other members' identities or amounts (privacy-safe concentration bands only). |
| **Voting rights** | Each member holds voting rights on their individually-recorded units. The club does not vote as a block unless explicitly delegated (separate legal structure). |
| **Exit with no secondary liquidity** | A member may sell their individually-held units on the secondary market (if open) or request redemption per the instrument's exit terms. The club does not guarantee liquidity. |

**Hard rule:** avoid showing a pooled "club owns 20%" position unless a genuinely separate pooled legal structure exists. The UI shows "5 members each hold [X] units" or "You hold [X] units (allocated via [club])" — never an opaque pooled balance.

---

## 12. Operational controls

### 12.1 Internal surfaces and rules

| Control | Rule |
|---|---|
| **Four-eyes approval** | Required for: issuance activation, corporate actions, trade corrections, manual reconciliation adjustments, trading suspensions. |
| **Role separation** | The user who initiates a financial action cannot be the same user who approves it. Roles: ops_initiator, ops_approver, ops_reconciler, ops_admin. |
| **Asset onboarding review** | New asset → vehicle → instrument → market onboarding requires four-eyes approval and a completed rights matrix (all 13 rows answered). |
| **Trading suspension** | Operations may suspend trading on an instrument or market; recorded with reason; users notified; existing orders `halted_open`. |
| **Manual reconciliation** | Operations may trigger manual reconciliation; recorded; results logged. |
| **Trade correction** | Only via `trade_correction` record with four-eyes approval and documented reason. |
| **Incident management** | Incidents logged with severity, owner, status, and resolution. Affected users notified. |
| **Immutable admin audit trail** | Every administrative action is logged immutably: who, what, when, why, approver. |
| **RTO/RPO** | Recovery Time Objective: 4 hours. Recovery Point Objective: 0 (no data loss; ledger is append-only and replicated). |
| **Monitoring and alerting** | Reconciliation breaks, settlement failures, eligibility failures, and heartbeat timeouts trigger alerts to on-call operations. |
| **UI safeguards** | Admin surfaces are separate from user surfaces; no admin action is possible from the user app. |

### 12.2 Visual/UI safeguards

- Every status has **colour + shape + text** (never colour alone).
- Monetary values use **tabular numerals** (`Numeric.*`).
- **1ZE first**, local-currency estimate second, including FX timestamp.
- **Delayed, simulated, and stale prices** are explicitly labelled.
- **Skeletons match final geometry** (no layout shift on load).
- Every screen specifies **offline, empty, restricted, halted, stale, failed, and retry** states (§07).

---

## 13. Accessibility and visual acceptance criteria

| Criterion | Gate |
|---|---|
| Dynamic Type / font scaling | Verified at 200% zoom; no truncation of monetary values. |
| Reduced motion | All motion has a reduced-motion fallback; verified. |
| Screen readers | Every interactive element has `accessibilityLabel`; every status has text; verified with VoiceOver/TalkBack. |
| Keyboard navigation | All actions reachable via keyboard; focus order logical. |
| 200% zoom | No horizontal scroll; no overlapping elements. |
| Golden screenshot regression | Tests for: small iPhone (SE/mini), large iPhone (Pro Max), Android (Pixel), tablet (iPad). |
| Layout shift | CLS < 0.1 on all Co-Own screens. |
| Dropped frames | < 5% frames dropped during scroll on mid-range device. |
| Image decode | Hero image decode < 200ms on mid-range device. |
| Order ticket response | Ticket estimate computation < 100ms; Review button enabled/disabled < 50ms. |

---

## 14. Phase-by-phase go/no-go checklist

### Phase 0 — Frontend truth scaffolding — **GO**
- [ ] Tokens + typography extensions implemented (dark luxury shades).
- [ ] `CoOwnNumericText` implemented; all 1ZE/unit/P&L rendering migrated.
- [ ] Exchange geometry + spacing tokens.
- [ ] Market-state badges (colour + shape + text).
- [ ] Skeletons match final geometry.
- [ ] Fail-closed for missing facts (no fabrication).
- [ ] All new states have designed surfaces.
- [ ] Accessibility: 200% zoom, reduced motion, screen reader labels verified.

### Phase 1 — Instrument + market surfaces (read-only) — **GO**
- [ ] `CoOwnMarketStatusStrip` (mode/session/countdown/disclosure).
- [ ] `CoOwnValueStrip` (Market/Fundamental/Cash; missing = "—").
- [ ] `CoOwnOwnershipPanel` upgraded (authorised/issued/float/locked/treasury).
- [ ] `CoOwnVehicleCard` (legal form/jurisdiction/operator/custodian).
- [ ] `CoOwnAssetDossier` (provenance/condition/custody/insurance/appraisal).
- [ ] `CoOwnRightsSheet` (13 rows; "TBC" only for prelaunch).
- [ ] AssetDetail composes new hierarchy; dock disabled-with-reason.
- [ ] Golden screenshot regression tests pass on 4 device widths.

### Phase 2 — Order book + price truth (read-only) — **GO**
- [ ] `CoOwnOrderBook` renders real book or "No open orders".
- [ ] `CoOwnPriceChart` upgraded (sparse-trade marks, last-age badge).
- [ ] `CoOwnCandleChart` (skia candles, line/candle toggle).
- [ ] Price-truth rules: last/bid/ask/mid/NAV/local-fiat all separate.
- [ ] Market-data sequencing fields present (snapshot/event seq, staleness).
- [ ] No trade → no new last; no fabricated books.
- [ ] 24h change has timestamp + reference price.
- [ ] Charts annotate gaps; no unreconciled data rendered.

### Phase 2.5 — Order-ticket UI with mocked/simulated data — **GO**
- [ ] `CoOwnTradeComposer` upgraded to collapsed-default + expandable-details ticket.
- [ ] Estimated fill, worst price, depth impact, reservation displayed.
- [ ] Thin-market action substitution (Request quote / Join auction).
- [ ] All values clearly labelled "Simulated" or "Mock".
- [ ] No live order submission; no real reservation.

### Phase 3 — Live order submission + reservation + confirm — **NO-GO until:**
- [ ] Order state machine implemented and tested (§2).
- [ ] `computeReservation()` implemented; full max obligation; single source.
- [ ] Cancel + fill race handling tested (§2.3).
- [ ] Double-entry ledger implemented with all invariants (§5).
- [ ] Matching engine rules implemented and tested (§6).
- [ ] Self-trade prevention tested.
- [ ] Price collars and fat-finger protection tested.
- [ ] Idempotency keys on all financial commands.
- [ ] Eligibility checked at all 5 points (§9).
- [ ] Rights version accepted before first order; "TBC" blocks trading.
- [ ] TradeConfirmScreen receipt shows full detail; hold-to-submit above threshold.
- [ ] Two simultaneous sells cannot spend the same unit.
- [ ] Two simultaneous buys cannot spend the same 1ZE.
- [ ] Partial fills release only the correct residual reservation.
- [ ] A matching/DB failure cannot leave only one DvP leg.

### Phase 4 — Portfolio + Wallet + Ledger — **NO-GO until:**
- [ ] Wallet ledger: nonnegative buckets; `withdrawable ≤ available ≤ settled_customer_claim`.
- [ ] Pending deposits/proceeds in separate section; not in settled claim.
- [ ] Position ledger: settled/reserved/pending split; supply invariant holds.
- [ ] Settlement and finality implemented (§4); T+1 default.
- [ ] DvP atomic; no single-leg posting.
- [ ] Partial and failed settlement handled.
- [ ] Daily reconciliation implemented; break pauses money movement.
- [ ] Valuation provenance: method/valuer/date/range always shown (§8).
- [ ] Premium of last/NAV always shown when both exist.
- [ ] Add 1ZE / Redeem 1ZE separate flows with full disclosure.
- [ ] Redemption capped to `withdrawable`; shows fee/rate/source/destination/ETA.
- [ ] Statements (PDF + CSV) available.
- [ ] Reconciliation break shows honest "temporarily unavailable".

### Phase 5 — Clubs + Corporate Actions — **NO-GO until:**
- [ ] Club model = coordinated individual allocation; no opaque pooled.
- [ ] All club edge cases handled (§11).
- [ ] Corporate-action engine: all event types (§7).
- [ ] Record date / ex-date / payment date handled.
- [ ] Open orders cancelled on ex-date; users notified.
- [ ] Fractional-unit rounding (floor for units, banker's for cash).
- [ ] Liquidation waterfall implemented.
- [ ] Four-eyes approval for all corporate actions.
- [ ] Legal approval for club structure (counsel sign-off).
- [ ] Entitlements reconcile at record date.

### Phase 6 — Flagship presentation — **GO (continuous)**
- [ ] Galleria art direction (per-asset focal-point crops).
- [ ] Restrained motion (160–240ms).
- [ ] Portfolio explanations (data-quality notes, premium storytelling).
- [ ] Concierge / RFQ path.
- [ ] Responsive tablet layouts (two-column).
- [ ] Full accessibility gate (§13).
- [ ] Premium statements (PDF design).
- [ ] Support + dispute experiences.
- [ ] Reduced-motion / offline / error states final pass.

---

## 15. Final release classification

| Classification | Status |
|---|---|
| **Read-only Galleria, dossier, market views, visual foundation** | **GO** — subject to accessibility and screenshot-regression testing (§13). |
| **Order-ticket UI using mocked or clearly simulated data** | **GO** — all simulated values labelled. |
| **Live order submission, wallet reservation, settlement, redemption, club allocation, corporate actions** | **NO-GO** — until the transaction contracts in this document are specified, implemented, and tested. |
| **Public wording that 1ZE or "in-game currency" bypasses financial regulation** | **NO-GO** — product classification depends on economic substance and jurisdiction, not the UI label. Specialist financial-regulatory counsel required before launch. |

---

## 16. Decisions that cannot remain ambiguous (research §19, updated)

Before live-money launch, the team must record a single accountable answer for each:

1. What exact legal claim does one unit confer?
2. Does each asset have its own vehicle?
3. Who is the legal holder of the underlying?
4. Is Thryftverse principal/agent/venue/arranger/custodian/operator/combination?
5. What exactly is 1ZE, who issues it, what backs redemption?
6. Is 1ZE fixed to a fiat unit or floating?
7. Where are customer funds safeguarded?
8. Which market mode applies to each liquidity tier?
9. Who can provide liquidity + how are conflicts disclosed?
10. How are valuations commissioned + challenged?
11. What costs are charged at asset/vehicle/market/wallet level?
12. What happens on platform/issuer/custodian/operator failure?
13. How can an owner exit when no buyer exists?
14. Which decisions can owners vote on?
15. What is the regulatory classification of 1ZE (e-money / payment instrument / security token / other)?
16. Which jurisdictions are eligible at launch?
17. What is the settlement cycle (T+1 / T+2 / other)?
18. What is the maximum order size and concentration limit per instrument?
19. What is the reconciliation schedule and escalation path?
20. What is the RTO/RPO, and is it tested quarterly?

Each answer must be signed off by the accountable person and, where it involves legal or regulatory classification, by specialist counsel.
