# 09 — Implementation Roadmap

**Goal:** phased rollout aligned with the source research §15–16, with exit gates. The rule: **truth lands before polish**. Phase 6 polish cannot substitute for Phase 2 truth.

**Source:** research §15 (phased reconstruction), §16 (controlled pilot), §17 (acceptance criteria).
**Constraint:** every phase touches canonical files only (`AGENTS.md` §7); no mock fallbacks in production (`AGENTS.md` §11); preserve working functionality (`AGENTS.md` §8).

---

## 0. Safe implementation boundary (audit verdict — conditional go)

The audit verdict is a **visual-foundation go** and a **transaction-engine no-go** until the accounting contradictions and state contracts are fixed. This boundary governs which phases may begin now and which must pause.

### Begin now (visual foundation — no money moves)

- Token and typography extensions (§02) — dark luxury shades, tabular numerals.
- `CoOwnNumericText` component — tabular, aligned, true minus.
- Exchange geometry and spacing (`ExchangeLayout`).
- Market-state badges (`CoOwnMarketStatusStrip`) — read-only display.
- Read-only Galleria discovery + asset dossier (`CoOwnAssetDossier`, `CoOwnVehicleCard`).
- Read-only value strip (`CoOwnValueStrip`) — shows "—" for missing facts.
- Read-only order book display (`CoOwnOrderBook`) — renders real book or "No open orders".
- Empty, stale, halted, restricted, thin, reconciliation states.
- Accessibility and responsive screen shells.
- Skeletons matching final geometry.

### Pause until blockers are corrected (transaction engine — money moves)

- **Wallet and redemption** — pause until Blocker 1 (nonnegative buckets, `withdrawable ≤ available ≤ settled_customer_claim`) is corrected in the backend ledger.
- **Live order submission** — pause until Blocker 2 (reservation = full max obligation via single `computeReservation`) + Blocker 4 (market-data sequencing) are corrected.
- **Reservations and partial fills** — pause until Blocker 2 + Blocker 3 (unit supply invariant) are corrected.
- **Portfolio accounting** — pause until Blocker 1 + Blocker 3 are corrected (positions need the supply invariant + balance invariant).
- **Club settlement** — pause until Blocker 6 (coordinated individual allocation model) is designed + legally approved.
- **Buyouts and corporate actions** — pause until the corporate-action engine + record-date snapshot exist.
- **Issuance activation** — pause until Blocker 5 (versioned accepted rights for all 13 rows) is complete; no live instrument with "Rights TBC".

### The 7 audit blockers — status tracking

| # | Blocker | Status | Blocks |
|---|---|---|---|
| 1 | Wallet math (nonnegative buckets, `withdrawable ≤ available ≤ settled_claim`) | Corrected in docs (§01, §05, §06) — backend must match | Wallet, redemption, portfolio |
| 2 | Order reservation = full max obligation via single `computeReservation` | Corrected in docs (§05) — backend must match | Live order submission, reservations, partial fills |
| 3 | Unit supply invariant (pending is state, not bucket) | Corrected in docs (§01) — backend must match | Portfolio accounting, reservations |
| 4 | Market-data sequencing (snapshot/event seq, timestamps, staleness, reconciliation) | Corrected in docs (§05) — backend must match | Live order book, order submission |
| 5 | Rights TBC only in prelaunch; live instruments need versioned accepted terms | Corrected in docs (§01, §03) — backend must enforce | Issuance activation, live trading |
| 6 | Club model = coordinated individual allocation, not opaque pooled | Corrected in docs (§09 Phase 5) — needs legal + backend | Club settlement |
| 7 | 1ZE as first-class product states, not "in-game currency" label | Corrected in docs (§09 §3) — needs regulatory counsel | All money-moving flows |

---

## 1. Correct UI progression order (audit)

Build the Co-Own journey in this order — financial truth must remain visible above decorative storytelling:

1. **Galleria** — cinematic discovery, curated collections, premium editorial imagery.
2. **Asset dossier** — provenance, custody, valuation, expenses, rights, risk.
3. **Market** — last execution, bid/ask, depth, NAV comparison, data freshness.
4. **Order ticket** — quantity, protected price, fees, reserved funds, estimated result.
5. **Execution receipt** — accepted, partial, filled, cancelled, rejected, settling.
6. **Position** — settled, reserved, pending units shown separately.
7. **Owner room** — distributions, votes, expenses, reports, corporate actions.
8. **Exit** — sell order, auction, RFQ, buyout, or redemption where applicable.

Pinterest and Instagram influence image composition, navigation economy, and interaction polish. They do **not** determine financial hierarchy. On Co-Own screens, financial truth remains visible above decorative storytelling.

---

## Phase 0 — Frontend truth scaffolding (no backend dependency) — SAFE NOW

**Goal:** make the UI able to render exchange-grade facts truthfully, failing closed where the backend does not yet provide them. This is the prerequisite for every later phase.

**Work:**
1. `coOwnModels.ts` — add `CoOwnMarketData`, `CoOwnValuation`, `CoOwnMarketState`, `CoOwn1ZeBalance`, `CoOwnPositionState` (§05 §3–4). Keep `CoOwnedAsset.currentPricePerShare` temporarily but stop rendering it.
2. `colors.ts` + `designTokens.ts` — add `MARKET_COLORS`, `DIRECTION_COLORS`, `DEPTH_COLORS`, `Numeric`, `ExchangeLayout` (§02).
3. `CoOwnNumericText` (§04 A11) — the single tabular-numeral text component. Migrate all 1ZE/unit/P&L rendering to it across Co-Own surfaces.
4. `CoOwnStateCanvas` — add `stale | halted | restricted | thin` variants (§04 B).
5. `CoOwnSkeletons` — add `CoOwnValueStripSkeleton`, `CoOwnOrderBookSkeleton`, `CoOwnWalletBreakdownSkeleton`, `CoOwnCandleChartSkeleton`; ensure all match final geometry (§07 §1.2).
6. Remove production mock fallbacks for books/prices/history — fail closed (§05 §5).

**Exit gate:** every Co-Own screen renders "—" / "Not yet available" for facts the backend doesn't expose; no fabricated books/prices; all numerals tabular; all new states have designed surfaces.

---

## Phase 1 — Instrument + market surfaces (frontend, backend-light)

**Goal:** the AssetDetail screen expresses the six canonical concepts (§01) using whatever the backend can truthfully provide.

**Work:**
1. `CoOwnMarketStatusStrip` (§04 A1) — mode/session/countdown/disclosure-version.
2. `CoOwnValueStrip` (§04 A2) — Market/Fundamental/Cash columns; missing values "—".
3. `CoOwnOwnershipPanel` upgrade (§04 B) — authorised/issued/float/locked/treasury + viewer settled/reserved/pending + labelled denominator.
4. `CoOwnVehicleCard` (§04 A6, in-place upgrade of `CoOwnIssuerCard`) — legal form/jurisdiction/operator/custodian/documents.
5. `CoOwnAssetDossier` (§04 A7) — provenance/condition/custody/insurance/appraisal.
6. `CoOwnRightsSheet` (§04 A8) — 13-row rights table modal.
7. `AssetDetailScreen` — compose the new hierarchy (§03 §2); sticky status strip; sticky dock with truthful disabled states.

**Exit gate:** AssetDetail shows all six concepts; missing facts are honestly "—"; rights sheet has an answer or "To be confirmed" for every row; dock disabled-with-reason for closed/halted/restricted.

---

## Phase 2 — Order book + price truth (backend dependency: book + executions)

**Goal:** the exchange primitives that make the numbers trustworthy.

**Work:**
1. `CoOwnOrderBook` (§04 A3) — 5/10/20 levels, depth bars, tap-to-fill, empty/halted/RFQ states.
2. `CoOwnPriceChart` upgrade (§04 B) — sparse-trade marks, last-age badge, volume toggle, textual summary for a11y.
3. `CoOwnCandleChart` (§04 A5) — skia candles, line/candle toggle, range chips, crosshair.
4. Price-truth rules (§05 §3) — last/bid/ask/mid/NAV/local-fiat all separate; no trade → no new last; 24h volume from executions only; spread + depth ±2%.
5. `SyndicateHubScreen` — Active tab with sortable market columns (§03 §1); `CoOwnMarketRowTile` (§04 A12).
6. `AssetLeaderboardScreen` — reframe to market-activity rankings (§03 §8).

**Exit gate:** order book renders real book; empty book shows "No open orders" (never fabricated); last price only updates on real execution; 24h change has timestamp + reference price; charts annotate gaps.

---

## Phase 3 — Order ticket + reservation + confirm (backend dependency: reservation + DvP)

**Goal:** the single highest-impact upgrade — checkout becomes an exchange ticket.

**Work:**
1. `TradeScreen` — new hierarchy (§05 §1): 1ZE-amount-first buy, protected instant / limit, avg fill + worst price + impact, reservation state, duration, post-trade preview.
2. `CoOwnTradeComposer` upgrade (§04 B) — becomes the quote block inside the ticket.
3. `CoOwnDepthPreview` (§04 A4) — mini depth strip in the ticket.
4. `TradeScreen` presentation — bottom sheet on mobile / side panel on tablet (§03 §12).
5. `TradeConfirmScreen` — full receipt (§05 §2): max reserved, plain language, local-fiat, warning, disclosure version, hold-to-submit above threshold.
6. `CoOwnTradeReceipt` upgrade (§04 B).
7. Thin-market action substitution (§05 §1) — Request quote / Join auction per market mode.
8. Reservation model (§05 §4) — `CoOwn1ZeBalance.reservedForOrders` + `CoOwnPositionState.reservedForSale` update on acceptance/cancel/fill.

**Exit gate (research §17.2):**
- Two simultaneous sells cannot spend the same unit.
- Two simultaneous buys cannot spend the same 1ZE.
- Partial fills release only the correct residual reservation.
- Cancel/replace preserves sequence + reservation integrity.
- Self-trades prevented.
- A matching/DB failure cannot leave only one DvP leg.
- Market halt blocks new matches while preserving cancel access.
- Book/trades/positions/receipts share deterministic sequence references.

---

## Phase 4 — Portfolio + Wallet + Ledger (backend dependency: positions + 1ZE ledger)

**Goal:** registrar-quality ownership service.

**Work:**
1. `PortfolioScreen` — hero + tiles + allocation bands + upcoming actions (§06 §1.2).
2. `CoOwnPositionCard` upgrade (§04 A10) — mark source/age, realised + unrealised split, premium of last/NAV, reserved/pending split, labelled denominator.
3. `WalletScreen` (new, §06 §2) — spendable-now hero + 6 sub-balances + safeguarding partner + add/redeem flows + immutable activity + statements.
4. `CoOwnWalletBreakdown` (§04 A9).
5. `CoOwnActivityRow` upgrade (§04 B) — execution reference, no user identity on public rows.
6. `MarketLedgerScreen` — upgraded summary with mark-used + window labels (§03 §7).
7. Add 1ZE / Redeem 1ZE flows (§06 §2.2–2.3) — separate, full disclosure, pending states.
8. Statements — PDF + CSV export.

**Exit gate (research §17.1, §17.3):**
- User can identify the exact instrument + rights they own.
- Ownership % derives from authoritative issued supply.
- Primary issue, NAV, bid, offer, last, local-fiat all distinct.
- Deposits/reservations/settlements/fees/redemptions balance.
- Available/reserved/pending/withdrawable independently explainable.
- 1ZE and local-fiat never silently substitute.
- Redemption shows amount/fee/rate/source/destination/timing.
- Reconciliation breaks stop affected money movement + alert operations.

---

## Phase 5 — Clubs + corporate actions (PAUSED — backend + legal dependency)

**Goal:** social discovery + coordinated allocations that settle into **individual positions**. The safest initial club model is **coordinated individual allocation** — not an opaque pooled position.

**Club model (audit blocker 6 — corrected):**
```text
club commitment
  → primary allocation
  → individually recorded positions  (each member holds their own units)
  → individual settlement and rights
```

Do **not** silently combine member balances into an opaque pooled position. Pooled or delegated structures require a separate ownership, governance, accounting and legal model. The initial model is coordination only — the club coordinates members who each hold their own units in their own position.

**Work:**
1. Club mandate + membership (coordination only).
2. Non-binding interest → funded commitment (individual 1ZE reservations).
3. Pro-rata / priority allocation → **individual position receipts** (not a pooled holding).
4. Each member's units settle into their own `CoOwnPositionState`.
5. Distributions (record-date snapshot per member, 1ZE posting, individual owner statement).
6. Votes / elections (per-member voting rights on their individually-held units).
7. Capital calls (per-member).
8. Tender / buyback (per-member).
9. Asset sale / liquidation (per-member waterfall).

**Exit gate (research §17.1):** entitlements reconcile at record date; every member can explain whether a club owns anything or merely coordinates members. **The answer must be: the club coordinates; each member owns their own units.** Pooled ownership requires a separate legal structure + counsel approval before any UI implies it.

---

## Phase 6 — Flagship presentation + service (continuous)

**Goal:** the polish that runs continuously but cannot substitute for earlier foundations.

**Work:**
1. Galleria art direction — per-asset focal-point crops, cinematic media (§03, §08).
2. Market micro-interactions — restrained motion (§07 §2).
3. Portfolio explanations — data-quality notes, premium-of-last/NAV storytelling.
4. Concierge / RFQ path — for thin markets + private-client service.
5. Responsive tablet layouts — two-column, not stretched mobile cards (§11.9).
6. Accessibility — full §07 §3 gate.
7. Premium statements — PDF design.
8. Support + dispute experiences.
9. Reduced-motion / offline / error states — final pass.

**Exit gate (research §17.5, §17.6):** every screen has one clear primary action; every market value has type + timestamp; all states designed; 200% text zoom verified; performance budgets measured on device.

---

## Controlled pilot (research §16)

Launch with:
- one jurisdiction (UK);
- one simple asset class;
- one instrument template;
- a small verified cohort;
- primary issuance + scheduled call auctions;
- conservative position limits;
- manual operations oversight backed by automated ledgers;
- no leverage;
- no public promise of continuous liquidity;
- pre-agreed incident + wind-down procedures.

Expand only after measured evidence of reconciliation, comprehension, fair execution + reliable redemption.

---

## Sequencing rules

1. **Phase 0 before Phase 2/3/4** — the UI must be able to render truthfully before it can render real data. **Phase 0 is safe now.**
2. **Phase 1 safe now** (read-only instrument + market surfaces) — no money moves.
3. **Phase 2 safe now** (read-only order book + price truth) — no money moves.
4. **Phase 3 PAUSED** (order ticket + reservation + confirm) — money moves; requires Blockers 2, 4, 5 corrected in backend.
5. **Phase 4 PAUSED** (portfolio + wallet + ledger) — money moves; requires Blockers 1, 3 corrected in backend.
6. **Phase 5 PAUSED** (clubs + corporate actions) — requires Blocker 6 + legal approval.
7. **Phase 6 continuous** — but never as a substitute for Phase 0–4 truth.

---

## 1ZE as first-class product states (audit blocker 7)

A currency name or game-style presentation does **not** itself create a legal exemption when 1ZE is purchasable, redeemable, and used to acquire fractional economic interests. Do not rely on the "in-game currency" label. Model these as **first-class product states** in the UI:

| State | UI treatment |
|---|---|
| **Jurisdiction eligibility** | User's jurisdiction checked before any 1ZE flow; ineligible → "Not available in your region" with explanation. |
| **Identity verification** | KYC/AML status gate before first 1ZE purchase or order; unverified → "Verify identity to continue" with flow link. |
| **Instrument eligibility** | Per-instrument eligibility (accreditation, residency, transfer restrictions); ineligible → dock disabled with reason. |
| **Disclosure acceptance** | Versioned rights document accepted before first order on each instrument; unaccepted → "Review rights v2 to trade". |
| **Custody state** | Underlying asset custody status (custodian, location, insured); shown in dossier; exception → "Custody exception" badge. |
| **Safeguarding state** | 1ZE safeguarding partner + reconciliation state; break → "Reconciling" + money movement paused. |
| **Redemption restrictions** | Redemption eligibility, timing, fees, destination; restricted → "Redemption restricted: [reason]". |

The exact regulatory classification of 1ZE (e-money, payment instrument, security token, other) needs **specialist financial-regulatory counsel** before launch. The UI must not imply a classification that counsel has not confirmed. Until then, 1ZE is labelled honestly as "the platform's settlement unit" without claiming an exemption.

---

## User-comprehension gate (research §17.4)

Before first order, a user must correctly answer:
1. What do I own?
2. What does 1ZE represent?
3. Can the unit price fall?
4. Is there guaranteed liquidity?
5. Who holds the underlying asset?
6. How do distributions + costs work?
7. What happens if the asset is sold or the platform fails?

Failure → explanation + re-attempt, not a dark-pattern dismissal. This gate is part of Phase 3 (order ticket) + Phase 4 (wallet onboarding).

---

## Decisions that cannot remain ambiguous (research §19)

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
15. What can a club do before it becomes a pooled/managed arrangement?
16. Which customer segments + jurisdictions are excluded at launch?

If these answers are absent, visual polish makes the risk harder to see. The UI must not paper over unanswered questions with confident copy (source §19).

---

## Final acceptance (research §17.7)

- Threat model covers account takeover, payment fraud, ledger manipulation, insider misuse, market abuse.
- Privileged actions require strong auth + maker-checker.
- Secrets/signing keys segregated.
- Customer + market logs tamper-evident.
- Reconciliation + recovery tested from backups.
- Incident communications designed in product.
- A wind-down test shows how users access 1ZE claims, statements + ownership records.
