# 21 — Co-Own Live Trading Infrastructure: Principal-Engineer Research and Execution Plan

**Engineering decision document**
**Research cut-off:** 25 August 2026
**Audited baseline:** `f82f74a54be79a1721017380ddd5472d856f1679`
**Method:** end-to-end code-path audit plus August 2026 primary-source review
**Decision owners:** Markets Platform + Compliance + Finance + Mobile Platform
**Status:** **P0 correctness and regulatory gates precede any live-money claim**  

> This is an engineering assessment, not legal advice. The legal nature of a Co-Own interest, operator permissions, custody/safeguarding model, venue obligations and jurisdiction availability require written specialist approval before production trading.

## 1. Executive decision

The earlier report was wrong in one important respect: `TradeScreen` now **does fetch a real backend order book**, derives its visible depth from that response, and requests a server preview and reservation before confirmation. A stale comment inside `CoOwnTradeComposer` still calls those live-derived values illustrative. This is not merely a mock ticket; it is a partially integrated exchange path whose truth labels and safety invariants disagree.

The deep audit found five release-blocking defects:

1. **Protected-instant is contract-invalid.** The native app maps `protected_instant` to backend `orderType: 'market'` but also submits `limitPriceGbp`. The backend explicitly rejects a market order carrying that field. The default order type cannot complete its canonical request.
2. **Freshness is displayed but not enforced.** Submission checks that `serverTimestamp` exists, not that it falls within `stalenessThresholdSeconds`. Poll failures retain the last book indefinitely.
3. **The sequence is not a mutation sequence.** `MAX(coOwn_orders.id)` does not advance when an existing order is partially filled, cancelled or expired. `MAX(coOwn_trades.id)` covers executions, not all depth changes.
4. **Reservation ownership/idempotency are incomplete.** Reservation cancellation updates by ID and asset without owner binding. Creation accepts an idempotency key but does not use it.
5. **Order idempotency is not atomic with the order.** Matching commits before the idempotent response is stored. Failure in that gap can commit an order, return an error and leave a retry without a dedupe receipt.

The correct programme is not “add WebSockets.” First make command, identity, sequence and ledger invariants provable. Then add sequenced realtime delivery and operations.

## 2. Maturity scorecard

| Capability | Score | Evidence-based assessment |
|---|---:|---|
| Native discovery/detail | 3.5/5 | Mature asset, holding, rights and risk surfaces exist. |
| Order ticket | 2.5/5 | Live book consumed; default protected order contract fails. |
| Market-data integrity | 1.5/5 | Metadata exists; freshness, sequence and recovery are unsound. |
| Preview/reservation | 2/5 | Real server endpoints; dedupe, binding and ownership incomplete. |
| Matching | 2.5/5 | Price-ordered partial fills exist; formal rules/concurrency proof absent. |
| Settlement/holdings | 2.5/5 | Significant transfer and ledger primitives; reconciliation proof required. |
| Unknown outcome | 1.5/5 | Client retains a key; server has a post-commit gap and no lookup UX. |
| Compliance/controls | 2/5 | Eligibility, AML and halt concepts exist; perimeter and control plane block launch. |
| Operational resilience | 1/5 | No demonstrated impact tolerance, failover or disaster evidence. |
| Consumer UX | 2.5/5 | Restrained confirmation; terminology and failure truth need correction. |

**Overall live-money readiness: 1.9/5.** Credible market prototype; not an operable regulated market.

## 3. Exact code evidence

### 3.1 Route-to-command register

| Layer | Canonical implementation | Actual behaviour | Finding |
|---|---|---|---|
| Ticket | `frontend/src/screens/TradeScreen.tsx` | Fetches asset, holdings and order book; polls each 10s; calls preview then reserve. | Poll errors retain stale data; age unused. |
| Composer | `frontend/src/components/coown/CoOwnTradeComposer.tsx` | Renders live-derived depth/fill, local reservation and post-position estimates. | Copy still says “illustrative — not live.” |
| Confirmation | `frontend/src/screens/TradeConfirmScreen.tsx` | Counts expiry, generates one key per mount and submits order. | Market+limit contradiction; ambiguity shown as generic engine failure. |
| API client | `frontend/src/services/marketApi.ts` | Typed book, preview, reserve, submit, cancel and settlement calls. | Dev fallback cannot submit, which is good; command model still invalid. |
| Book | `backend/api/src/index.ts` → `GET /co-own/assets/:assetId/orderbook` | Aggregates bid/ask levels and returns timestamp/sequence/reconciliation. | Separate READ COMMITTED statements are not one atomic snapshot. |
| Preview | `POST .../orders/preview` | Walks opposite orders and primary issuance; returns eligibility and 15s validity. | Not bound to book sequence, policy or fee version. |
| Reservation | `POST .../orders/reserve` | Locks asset/wallet/holding and creates a 60s obligation. | Supplied key ignored; owner not required by cancellation. |
| Order | `POST .../orders` | Locks rows, matches, transfers, updates orders/asset and publishes events. | Dedupe response saved after economic commit. |
| Cancel order | `POST .../orders/:orderId/cancel` | Owner-checks order and releases placed reserve. | Stronger than reservation cancellation. |
| Realtime | `publishRealtimeEvent(co-own.asset:*)` | Emits sequenced order/trade events after commit. | Native ticket only polls; event sequence is not the book sequence. |

### 3.2 Top-down user path

```text
Asset detail
  → Trade(assetId, side)
  → asset + personal holding + book snapshot
  → local protected price/impact
  → server preview
  → server reservation
  → TradeConfirm(route snapshot)
  → idempotent order command
  → matching + transfer + projections
  → hub/activity/receipt
```

The default path breaks at the order command: `protected_instant` is sent as `market` plus `limitPriceGbp`.

### 3.3 Bottom-up truth path

```text
coOwn_orders + coOwn_trades + coOwn_holdings + wallet/ledger
  → orderbook/execution/holding projections
  → marketApi contracts
  → TradeScreen snapshot and preview
  → TradeConfirm command
  → transaction + post-commit events
```

There is no single market epoch carried snapshot → preview → reservation → order. DB IDs, timestamps, expiries and route parameters are separate truth clocks.

## 4. State-machine audit

### 4.1 Current client state

```text
loading
  ├─ success → ready(live | fallback | reconciling)
  └─ failure → error/retry

ready(live)
  → local quote
  → previewing
  → reserving
  → confirmation
  → submitting
  ├─ definitive success → hub
  ├─ definitive rejection → ticket
  └─ transport failure → generic error; retry possible
```

Missing states:

- `live_fresh`, `live_aging`, `stale`, `sequence_gap`, `halted`;
- `preview_changed`, `reservation_expired`, `submission_unknown`;
- `partial_and_resting`, `partial_then_cancelled`, `settlement_failed`;
- foreground freshness revalidation.

### 4.2 Required command state

```text
draft
  → preview_requested(command_hash, book_sequence)
  → previewed(preview_id, expires_at, fee_version, policy_version)
  → reserved(reservation_id, obligation, expires_at)
  → submit_pending(idempotency_key)
  ├─ acknowledged(order_id)
  ├─ rejected(reason)
  └─ unknown
       → lookup by idempotency key
       → acknowledged | safe_to_retry | processing
```

No success state exists before acknowledgement. “Executed” and “settled” remain distinct even if current DvP is atomic.

## 5. P0 defect dossier

### P0.1 — protected-instant contract contradiction

- `TradeScreen.tsx`: `protected_instant` → `orderMode: 'market'`, while computing a protection price.
- `TradeConfirmScreen.tsx:145–146`: always sends `orderType: orderMode` (which is `'market'`) **and** `limitPriceGbp` together.
- Backend schema rejects `limitPriceGbp` for `market` orders.
- **Verified:** `TradeConfirmScreen.tsx:145` — `orderType: orderMode` and `:146` — `limitPriceGbp` are both submitted in the same `submitOrder` call.

Use a direct instruction:

```ts
type OrderInstruction =
  | { type: 'protected_market'; side: 'buy'; maxPriceGbp: DecimalString }
  | { type: 'protected_market'; side: 'sell'; minPriceGbp: DecimalString }
  | { type: 'limit'; side: Side; limitPriceGbp: DecimalString; timeInForce: 'DAY' | 'GTC_90D' };
```

If the matcher cannot honour protection, remove the order type. Never degrade to unprotected market.

### P0.2 — stale data can enable submission

**Verified:** `TradeScreen.tsx:239–241`:
```ts
  const marketIsAuthoritative = orderBook?.source === 'live'
    && orderBook.reconciliationState === 'reconciled'
    && Boolean(orderBook.serverTimestamp);
```
`marketIsAuthoritative` requires live source, reconciled state and **any** timestamp — not that the timestamp falls within `stalenessThresholdSeconds`. The threshold returned by the server is unused. Poll errors retain the last book indefinitely. `TradeScreen.tsx:252` checks `!orderBook.serverTimestamp` but never checks age.

Required invariant:

```text
client_now - serverTimestamp <= min(serverThreshold, clientPolicyThreshold)
AND snapshot sequence is contiguous
AND foreground revalidation succeeded
```

Disable at aging threshold and re-preview on sequence change.

### P0.3 — sequence cannot identify depth changes

`MAX(order.id)` stays constant on cancel, partial fill and expiry. Create a per-asset `market_sequence` allocated transactionally for **every** public book mutation. Snapshot and deltas share it.

### P0.4 — atomic-snapshot comment exceeds isolation semantics

Bid, ask and sequence are separate statements in default READ COMMITTED. Use one statement, REPEATABLE READ, or a materialized projection read with its committed sequence.

### P0.5 — reservation cancellation is not actor-bound

`DELETE /orders/reserve/:reservationId` updates by ID/asset/status only. Bind to `request.authUser.userId`; remove user-selected identity from all private commands.

### P0.6 — reservation idempotency is decorative

The schema accepts a key but performs no lookup, hash comparison or durable response. Retry may expire a valid first reservation and create another. Add unique actor/operation/key, request hash and replay response.

### P0.7 — order receipt and order commit separately

Matching commits before `saveCoOwnOrderIdempotentResponse`. A failure in between creates an ambiguous committed order without dedupe. Commit command receipt, order, executions, journal and outbox in one transaction; reconstruct response from order ID.

### P0.8 — numeric representation is unsafe for obligations

Client/server use JavaScript `number` and repeated rounding. Use integer minor units or decimal strings with explicit scale across preview, reserve, fee, execution and ledger.

### P0.9 — legal/regulatory perimeter blocks production

Obtain written classification for interest/rights, collective-investment/security/crypto implications, venue/broker/custody/safeguarding roles, financial promotions, appropriateness, best execution, surveillance, jurisdiction, age, insolvency and segregation.

## 6. Market microstructure decisions

| Rule | Required decision | Current ambiguity |
|---|---|---|
| Priority | Price-time with deterministic tie-break | SQL suggests it; policy absent. |
| Protected instant | Ceiling/floor; remainder cancels | Contract currently contradicts itself. |
| Limit duration | DAY timezone and GTC90 expiry | UI types exist; backend proof needed. |
| Self trade | Reject newest/cancel resting/decrement policy | No explicit STP found. |
| Tick/lot | Per-asset constraints | “Positive decimal/integer units” is insufficient. |
| Primary issuance | How issuer inventory competes/discloses | Appended after secondary book. |
| Fees | Maker/taker/issuer/platform version | UI presents fixed 1%. |
| Halt | Which commands/settlements continue | Current halt derives from 1ZE reconciliation. |
| Bust/correction | Authority, journal method and customer recourse | Reversal shapes exist; operations unproven. |
| Corporate action | Cancel/adjust/freeze resting orders | Routes exist; coupling unspecified. |

## 7. Target architecture

```text
Native Market Client
  ├─ fresh snapshot + contiguous public deltas
  ├─ owner-only order stream
  └─ idempotent commands + unknown-result lookup

Order Gateway
  ├─ auth/device/rate policy
  ├─ jurisdiction/KYC/appropriateness
  ├─ decimal normalization
  └─ atomic command idempotency

Risk + Reservation
  ├─ wallet/unit obligations
  ├─ concentration/limits
  └─ expiring reservation token

Matching Domain
  ├─ per-asset sequence
  ├─ formal price/time/STP/TIF
  └─ immutable order/execution events

Settlement + Ledger
  ├─ DvP journal
  ├─ projections
  └─ reconciliation/exception queue

Control Plane
  ├─ halt/kill switch
  ├─ surveillance
  ├─ correction/incident workflow
  └─ immutable operator audit
```

Extract from `index.ts` only after characterization tests:

- `domains/coown/orders.ts`
- `domains/coown/matching.ts`
- `domains/coown/reservations.ts`
- `domains/coown/marketData.ts`
- `domains/coown/settlement.ts`
- `domains/coown/compliance.ts`
- thin `routes/coown/*`

## 8. Proposed contracts

### 8.1 Market snapshot

```json
{
  "assetId": "asset_…",
  "sequence": "9812",
  "generatedAt": "2026-08-25T12:00:00.000Z",
  "freshForMs": 5000,
  "state": "open",
  "bids": [{ "priceGbp": "48.2500", "units": 12, "orderCount": 3 }],
  "asks": [{ "priceGbp": "49.0000", "units": 8, "orderCount": 2 }],
  "truncated": { "bids": false, "asks": false }
}
```

Sequence remains a string to prevent JavaScript integer loss.

### 8.2 Preview receipt

```json
{
  "previewId": "prv_…",
  "commandHash": "sha256:…",
  "bookSequence": "9812",
  "policyVersion": "eligibility-17",
  "feeScheduleVersion": "fees-4",
  "expiresAt": "…",
  "estimatedFill": { "units": 4, "averagePriceGbp": "49.1250", "worstPriceGbp": "49.2500" },
  "unfilledUnits": 1,
  "totalDebit1zeMinor": "198450",
  "eligibility": { "allowed": true, "reasonCode": null }
}
```

### 8.3 Order command

```json
{
  "idempotencyKey": "uuid",
  "previewId": "prv_…",
  "reservationId": "res_…",
  "instruction": { "type": "protected_market", "side": "buy", "units": 5, "maxPriceGbp": "49.2500" }
}
```

Identity comes from the token, never body `userId`.

### 8.4 Unknown-result lookup

```text
GET /co-own/orders/by-idempotency-key/{key}
→ 200 acknowledged
→ 202 processing
→ 404 safe_to_retry only when gateway proves no acceptance
```

## 9. Storage and event ownership

```text
coown_order_commands(actor_id, idempotency_key, request_hash, status,
                     order_id, response_code, created_at, completed_at)
coown_market_sequences(asset_id, next_sequence)
coown_order_events(event_id, asset_id, sequence, order_id, event_type,
                   actor_id, payload, occurred_at)
coown_execution_events(execution_id, asset_id, sequence, buy_order_id,
                       sell_order_id, units, price_minor, fee_version, occurred_at)
ledger_journal / ledger_postings
market_data_outbox(sequence, event_id, published_at)
```

Projections are rebuildable. Journal and immutable events are never rewritten by support tooling.

## 10. Threat model

| Threat | Required control |
|---|---|
| Actor swaps `userId` | Token-derived actor; strip body identity. |
| Reservation theft/cancel | Owner-bound opaque ID, rate limit and audit. |
| Timeout duplicates order | Atomic command receipt and lookup endpoint. |
| Key replay with new payload | Request hash and 409 conflict. |
| Stale-book order | Sequence/freshness gate and preview binding. |
| Self/wash trading | STP plus linked-account/device/payment surveillance. |
| Spoofing/layering | Order/trade/cancel ratios and short-lived-depth alerts. |
| Client price tamper | Server decimal policy and non-authoritative UI estimate. |
| Operator abuse | Scoped RBAC, four-eyes, reason/case ID, immutable audit. |
| Public PII leak | Aggregated levels; private owner stream only. |

## 11. Psychology and anti-AI design

### User job

“Help me understand the exact obligation and downside before submission, then reliably tell me what happened.” The job is not making trading exciting.

### First viewport

One decision object: asset identity/status → buy/sell/quantity → protected/limit price → total obligation and balance → one `Review order` action. Depth, rights and settlement sit below or under one disclosure. Do not build an equal KPI-card grid.

### Truth language

| State | Copy |
|---|---|
| Fresh | “Live · updated 2s ago” |
| Aging | “Updating market…”; submit disabled |
| Preview | “Estimate valid for 12s” |
| Reserved | “198.45 1ZE reserved until 12:01” |
| Open | “Order placed · 5 units remaining” |
| Partial | “3 of 5 filled · 2 still open” |
| Filled | “5 units filled” |
| Settled | “Cash and units settled” |
| Unknown | “Result not confirmed. Check order before trying again.” |

No confetti, flashing price colour, streaks, “hot” assets, loss-chasing prompts or celebratory execution copy. FCA evidence makes restraint a consumer-protection control.

### Accessibility

- Announce expiry at meaningful thresholds, not every second.
- Tabular figures must survive Dynamic Type.
- Never communicate buy/sell or loss/gain only by colour.
- Hold-to-submit needs an equivalent accessible alternative.
- Screen-reader order: identity → instruction → obligation → risk → action.
- Reduced motion removes interpolation, never state.

## 12. SLOs, observability and resilience

Candidate objectives require capacity testing and approved impact tolerances:

| Service | SLI | Candidate objective |
|---|---|---:|
| Book | successful fresh responses | 99.95% monthly |
| Book age | p99 visible age while open | <5s |
| Command | p99 definitive acknowledgement | <1.5s |
| Dedupe | duplicate economic orders/key | 0 |
| Sequence | unrecovered gaps | 0 |
| Reconciliation | unexplained money/unit imbalance | 0 |
| Halt | command rejection after halt | <2s |
| Unknown | p99 resolution | <30s |

Instrument snapshot age, gaps, preview drift, reservation replay/expiry, dedupe conflict/failure, order/fill/cancel ratios, ledger imbalance, outbox lag, unknown-outcome rate and halt propagation by client version.

## 13. Implementation programme

### Phase 0 — freeze claims and prove invariants

1. Keep live money disabled outside an approved sandbox.
2. Add a contract test reproducing protected-instant failure.
3. Write the authoritative transition and microstructure tables.
4. Produce regulatory/jurisdiction/responsibility matrices.
5. Reconcile seeded orders, reservations, wallets and holdings.

### Phase 1 — command safety

1. Add `protected_market` or remove it.
2. Token-derive actors on all private commands.
3. Owner-bind reservation cancellation.
4. Make reservation/order idempotency atomic.
5. Add check-by-key unknown recovery.
6. Normalize monetary units.

### Phase 2 — market-data correctness

1. Allocate per-asset mutation sequence.
2. Build repeatable snapshot plus contiguous deltas.
3. Enforce age/sequence/foreground revalidation.
4. Consume realtime with snapshot recovery.
5. Correct stale “illustrative” copy while retaining estimate language.

### Phase 3 — matching and settlement proof

1. Formalize priority, TIF, STP, issuer inventory, halts and actions.
2. Extract a deterministic matching core; property-test it.
3. Atomically commit journal, execution, command receipt and outbox.
4. Build reconciliation/exception/correction operations.

### Phase 4 — controlled launch

Paper environment → adversarial/chaos/DR testing → restricted cohort/jurisdictions/limits → independent approvals → progressive rollout with automated halt and rollback.

## 14. Migration and rollback

- Introduce versioned Co-Own v2 contracts; do not silently change old semantics.
- Dual-write sequence/outbox while v1 is read-only.
- Backfill only facts with authoritative correlation; never invent command keys.
- Ship client support before enforcing preview tokens.
- Server flags: `coown_v2_read`, `coown_v2_preview`, `coown_v2_orders`, `coown_realtime_deltas` by jurisdiction/app version.
- Rollback disables new commands but preserves cancel, lookup, statements and support.
- Never roll back ledger history; use compensating entries.

## 15. Test and release gates

### Required scenarios

- protected instant, limit, expired preview, insufficient reserve;
- same key/same request replay; same key/different request conflict;
- timeout before acceptance, during commit and after commit;
- owner/non-owner reserve and order cancellation;
- app background beyond freshness;
- stale snapshot, skipped/duplicate/out-of-order delta;
- partial fill then cancel/halt/expiry;
- fee/policy change between preview and submit.

### Invariants

- money and units conserved;
- no negative wallet/holding;
- fills never exceed order;
- price-time priority deterministic;
- one economic command per key;
- every book mutation advances sequence once;
- rebuilt projection equals live projection.

### Launch gates

- zero unexplained reconciliation imbalance through sustained soak;
- zero duplicate commands under injected timeouts;
- halt within approved impact tolerance;
- 100% gap recovery in chaos suite;
- no mock source enables submit in release;
- consumer comprehension and vulnerable-user testing complete;
- legal, compliance, safeguarding, security, finance and operations sign-off.

## 16. Non-goals and owner decisions

Non-goals: increasing trading frequency; advanced orders before invariants; onboarding-only risk; client-calculated custody/liquidity/P&L claims; calling a DB matcher a regulated venue without approval.

| Decision | Accountable owner |
|---|---|
| Product/perimeter/jurisdictions | General Counsel + Compliance |
| Venue/execution/custody model | COO + Compliance + Finance |
| Microstructure | Head of Markets + Principal Backend |
| Ledger/reconciliation | Finance Controller + Principal Payments |
| Consumer-risk UX | Product + Compliance + Research |
| Impact tolerance/kill switch | Executive Risk + SRE |

## 17. August 2026 primary-source benchmark

These constrain design but do not establish applicability without classification.

### 17.1 FCA trading-app and gamification research

| Source | Finding | ThryftVerse application |
|---|---|---|
| [FCA — Gaming trading; updated 3 June 2026](https://www.fca.org.uk/publications/research-articles-fca-research/gaming-trading-how-trading-apps-could-be-engaging-consumers-worse) | Gamification can drive poor outcomes; Consumer Duty calls out harmful "sludge" design | No confetti, flashing prices, streaks, leaderboards or loss-chasing prompts |
| [FCA — Multi-firm review of trading apps](https://www.fca.org.uk/publications/multi-firm-reviews/trading-apps-high-level-observations) | 17 firms offer fractional shares; firms are both manufacturers and distributors under Consumer Duty | Co-Own must classify its fractional model and meet manufacturer/distributor obligations |
| [FCA — Trading-app experiment (Hayes et al.)](https://www.fca.org.uk/publication/research-notes/research-note-digital-engagement-practices-trading-apps-experiment.pdf) | Push notifications increased trades by 11%; points & prize draw by 12%. DEPs increased risky-investment proportion by 6-8% | Notification frequency and any gamification features require Consumer Duty assessment |
| [FCA — Expectations for fractional shares](https://www.fca.org.uk/firms/fractional-shares) | "Firms offering fractional shares must act in good faith, avoid causing foreseeable harm, and enable and support consumers to pursue their financial objectives." | Co-Own classification, disclosure, and consumer protection must meet this standard |
| [FCA — Operational resilience insights, 2026](https://www.fca.org.uk/publications/good-and-poor-practice/operational-resilience-insights-observations-one-year) | Post-31 March 2025: firms must have completed mapping and testing to remain within impact tolerances for each important business service | Co-Own trading is an "important business service" requiring impact tolerance, mapping and scenario testing |
| [FCA Handbook COBS 11/11.2A](https://handbook.fca.org.uk/handbook/cobs11) | Execution-policy, monitoring and demonstration benchmark | Best execution policy and monitoring where applicable |
| [FCA Handbook SYSC 15A.2](https://handbook.fca.org.uk/handbook/sysc15a/sysc15as2?timeline=true) | Impact-tolerance requirements | Important business service impact tolerances |
| [SEC — Rule 605 execution-quality FAQ](https://www.sec.gov/rules-regulations/staff-guidance/trading-markets-frequently-asked-questions/frequently-asked-questions-rule-605-regulation-nms) | Execution-quality disclosure benchmark | Useful disclosure benchmark; applicability not assumed |
| [UK Government — 2026 cryptoassets perimeter policy note](https://www.gov.uk/government/publications/policy-note-draft-statutory-instrument-amending-the-cryptoasset-regulations/draft-statutory-instrument-amending-the-financial-services-and-markets-act-2000-cryptoassets-regulations-2026-policy-note) | Classification must use final current rules | Co-Own classification must use current UK financial services regulations |

### 17.2 Key FCA findings for Co-Own

The FCA's multi-firm review found that 17 firms currently offer fractional shares, and that firms are "likely to be both manufacturers of a trading app product and distributors of investment products." Under Consumer Duty, this means Co-Own must:

1. **Classify the fractional interest** — is it a collective investment, a security, a cryptoasset, or something else? The legal nature determines all obligations.
2. **Meet manufacturer/distributor obligations** — the firm creating the Co-Own product and the firm distributing it (potentially the same entity) both have Consumer Duty obligations.
3. **Avoid gamification** — the FCA's experiment proved that push notifications and prize draws increase trade frequency by 11-12% and increase risky-investment proportion by 6-8%. Co-Own must not use these practices.
4. **Demonstrate operational resilience** — post-March 2025, firms must have completed mapping and testing for important business services. Co-Own trading is such a service.
5. **Provide appropriate disclosure** — consumers must understand the risks, the nature of the interest, and the protections (or lack thereof) available.

## 18. Final assessment

**PARTIAL — P0 MONEY-SAFETY, MARKET-DATA AND REGULATORY BLOCKERS.**

The system is much deeper than the old report acknowledged: live book, preview, reservation, matching, holdings, settlement and realtime primitives exist. The conclusion is nevertheless stricter. The default command is invalid, freshness and sequence do not uphold their promise, reservation security/idempotency is incomplete, and the dedupe receipt is not atomic with the economic command. No live-money rollout should proceed until those invariants and operational/regulatory responsibilities are demonstrably closed.
