# 06 — Portfolio & Wallet Upgrade

**Goal:** registrar-quality ownership service. Portfolio shows authoritative positions with mark source/age, realised/unrealised split, and the truth-telling premium-of-last/NAV line. Wallet shows the 1ZE sub-balances as independently explainable claims, not a game-store inventory.

**Source:** research §3.1.E–F (position + 1ZE balance), §7 (valuation & returns), §11.7–11.8 (portfolio + wallet), §17.1/17.3 (correctness gates).
**Files:** `frontend/src/screens/PortfolioScreen.tsx`, `frontend/src/components/coown/CoOwnPositionCard.tsx`, `frontend/src/data/coOwnModels.ts`, new `frontend/src/screens/WalletScreen.tsx`, new `frontend/src/components/coown/CoOwnWalletBreakdown.tsx`.

---

## 1. Portfolio — position row truth

### 1.1 The position row (upgrade `CoOwnPositionCard`)

Source §11.7 + §3.4. The current row shows units, ownership %, current value, avg entry, unrealised P&L. The gaps: no mark source, no mark age, no realised P&L on the row, no premium-of-last/NAV, no reserved/pending split, unlabelled denominator.

**Target row:**

```text
┌──────────────────────────────────────────────┐
│ [image]  MYA-01 · M/Y Aurelia 2026 Class A   │
│          Yacht · [Continuous]                │
│                                              │
│   Units (settled)        500                 │
│   Reserved for sale        0                 │
│   Pending in              0                 │
│   Ownership             0.50% of outstanding │
│                          (100,000)           │
│                                              │
│   Mark           Last 12.40 · 3h ago         │
│   Mark value      6,200.00 1ZE  (≈ £5,890)   │
│   Cost basis      5,000.00 1ZE  (avg 10.00)  │
│   Unrealised      +1,200.00 1ZE  (+24.0%) ▲  │
│   Realised          +45.00 1ZE               │
│   NAV/unit         10.00 (02 Jul · indep.)   │
│   Premium last/NAV +24.0%   ← information    │
│                                              │
│   [██████░░░░░░] 0.50% of your portfolio     │
│                                              │
│   [Buy more]  [Sell]  [Details]              │
└──────────────────────────────────────────────┘
```

**Rules:**
- **Mark source + age** always visible ("Last 12.40 · 3h ago"). A stale mark (>24h) gets a "Stale mark" badge and the row uses a muted mark colour.
- **Ownership denominator** is labelled ("of outstanding 100,000"). If the contract excludes treasury for voting, show a second labelled line for voting % (source §3.3).
- **Premium of last/NAV** is the truth-telling line — always shown when both last and NAV exist. It stops users reading a market premium as an appraisal gain (source §3.4).
- **Realised P&L** shown on the row (separate from unrealised) — source §7.5.
- **Reserved/pending split** shown so the user sees their operational position, not just a single number (source §3.1.E).
- **Local-fiat indication** secondary, with source/time.
- **Buy more / Sell** disabled truthfully: Sell disabled if `settled − reserved = 0`; show reason "No sellable units".
- **Details** → `AssetDetail` or a position detail sheet with full ledger.

### 1.2 Portfolio hero

```text
PORTFOLIO
  18,420.00 1ZE   (≈ £17,480 · source [partner] · 14:02)
  +320.00 1ZE today  (+1.77%) ▲   as of 14:02

  ┌──────────┬──────────┬──────────┬──────────┐
  │ Total    │ Unreal.  │ Realised │ Distrib. │
  │ return   │ P&L      │ P&L      │ received │
  │ +2,420   │ +1,820   │ +600     │ +180     │
  │ +15.1%   │          │          │          │
  └──────────┴──────────┴──────────┴──────────┘

  Data quality: marks from last trade · 1 position stale > 24h

  ALLOCATION
  By class:  Yacht 60% · Watch 25% · Art 15%
  By issuer: [privacy-safe concentration bands, not named holders]

  UPCOMING  (only when present)
  · MYA-01 distribution · record 30 Jul · pay 05 Aug
  · MYA-01 vote · 12 Aug · agenda: refit reserve
```

**Rules:**
- Hero value in `Numeric.display` (tabular).
- Today's change with timestamp.
- Data-quality note only when true (stale marks present).
- Allocation by class + by issuer concentration **bands** (e.g. "Top holder 12–15%") — never named holders on a public surface (source §2.2 privacy).
- Upcoming corporate actions only when present; hide the section otherwise (no empty "No upcoming" placeholder noise).

### 1.3 Performance presentation (source §7.5)

Separate:
```text
unrealised P&L = (mark − avg cost) × settled units
realised P&L   = sum(sell proceeds − avg cost × sold units)
distributions  = sum(cash distributions received in 1ZE)
total return   = unrealised + realised + distributions − fees
```
Do not blend them into one "P&L" number. The portfolio summary tiles show each separately.

---

## 2. Wallet — 1ZE settlement balance

### 2.1 The wallet screen (new `WalletScreen`)

Source §11.8. Currently the wallet lives inside profile/settings. Create a dedicated canonical `WalletScreen` (this is a missing screen, not a duplicate — `AGENTS.md` §7 permits new screens when no canonical exists).

**Hierarchy (corrected per audit — nonnegative buckets, strict invariant):**

```text
WALLET
  Spendable now
  12,400.00 1ZE   (≈ £11,750 · source [partner] · 14:02)

  SETTLED CLAIM  (safeguarded at [partner])
    Available              12,400.00     ← spendable now
    Reserved for orders     1,200.00     (2 open buy orders)
    Redemption pending      2,000.00     (to GBP · ETA 18:00)
    Other holds                 0.00
    ─────────────────────────────────
    Settled customer claim 15,600.00

  PENDING  (not yet settled — separate section)
    Pending deposit          500.00     (settling 14:00)
    Unsettled sale proceeds  320.00     (T+1)

  WITHDRAWABLE
    12,400.00   (capped to available)

  [  Add 1ZE  ]   [  Redeem 1ZE  ]   ← separate flows, never combined

  BANK / PAYMENT SOURCE
  · Barclays ****1234 · verified
  · Add payment source

  ACTIVITY
  · 14:02  Trade fill · BUY MYA-01 500 @ 12.40  · −6,282.20  · ref EX-8842
  · 13:50  Order reserved · BUY MYA-01           · −6,282.20  · ref OR-2204
  · 11:30  Deposit · Barclays                    · +5,000.00  · ref DP-1190
  · 09:15  Distribution · MYA-01 Q2              · +45.00     · ref CA-0073
  [ filter: All · Trades · Deposits · Redemptions · Distributions ]

  STATEMENTS
  · Download statement (PDF) · Jul 2026
  · Export CSV · YTD

  SAFEGUARDING & REDEMPTION
  Customer 1ZE is safeguarded at [partner]. Redemption to GBP
  typically settles same business day for amounts under £X;
  larger amounts settle T+1. See safeguarding policy.
```

**Rules (audit blocker 1 — corrected):**
- **Spendable now** = `available` — the headline hero.
- **Settled customer claim** = `available + reservedForOrders + redemptionInProgress + otherHolds` — nonnegative buckets, all ≥ 0.
- **Pending** (deposits, unsettled proceeds) in a **separate section** — never added to `available` or `settled_claim` until legally and operationally settled.
- **Strict invariant:** `withdrawable ≤ available ≤ settledCustomerClaim`. Enforced at the model layer, never violated in the UI.
- **No sub-balance may ever be negative.** The previous example showed negative reserved/redemption rows summing to a total below spendable — that was financially impossible and is corrected.
- **Safeguarding partner** attribution is mandatory when present (source §1.1, §11.8).
- **Add 1ZE / Redeem 1ZE** are separate flows — never a single "transfer" that hides the directional risk.
- **Activity rows** are immutable with references (order id, execution id, corporate-action id). No user identity on public rows.
- **Statements** are downloadable (PDF) + exportable (CSV).
- **Safeguarding & redemption info** is plain language, not buried in settings.

### 2.2 Add 1ZE flow

- Select payment source (bank/card/wire).
- Enter 1ZE amount (or fiat amount with 1ZE equivalent shown).
- Show: source, amount, fee (if any), 1ZE to credit, ETA, safeguarding note.
- Confirm → pending deposit row appears in wallet with ETA.
- No "instant success" if the deposit is still settling (source §11).

### 2.3 Redeem 1ZE flow

- Enter 1ZE amount (capped to `withdrawable`, not `available` — redemption cannot pull reserved funds).
- Select destination (bank).
- Show: 1ZE debited, fee, FX rate + source + timestamp, fiat to receive, ETA.
- Confirm → redemption-in-progress row with ETA + destination + rate.
- On completion → activity row with reference.

### 2.4 Promotional credits (source §11.8)

If promotional/non-redeemable 1ZE ever exists, it must be a **separate ledger** with its own balance line, clearly labelled "Promotional · non-redeemable · not spendable as investment consideration without legal approval". Never blend it into `available`.

---

## 3. State coverage (portfolio + wallet)

| State | Portfolio | Wallet |
|---|---|---|
| Loading | `CoOwnPortfolioSkeleton` (match hero + tiles + list) | `CoOwnWalletBreakdownSkeleton` (match hero + breakdown + activity) |
| Empty | "You don't own any units yet" + Browse CTA | "Add 1ZE to start trading" + Add CTA |
| Stale marks | Per-row "Last 3d ago" + portfolio data-quality note | n/a |
| Reconciliation break | "Positions temporarily unavailable — reconciling" + contact | "Balance temporarily unavailable — reconciling" + contact; never show a possibly-wrong balance as correct |
| Error / offline | Cached positions with staleness; RetryState | Cached balance with staleness; RetryState |
| Restricted jurisdiction | Positions visible; trade actions disabled | Deposits allowed; trading-use note |

---

## 4. Acceptance gate (portfolio + wallet)

- [ ] Every position row shows mark source + age, ownership with labelled denominator, realised + unrealised split, premium of last/NAV.
- [ ] Portfolio hero shows total in 1ZE + today's change with timestamp + local-fiat with source/time.
- [ ] Allocation shows class + issuer concentration bands (no named holders).
- [ ] Wallet hero is "Spendable now" (`available`); settled claim shows nonnegative buckets (available + reserved + redemption + other_holds); pending in separate section.
- [ ] Strict invariant enforced: `withdrawable ≤ available ≤ settledCustomerClaim`; no sub-balance ever negative.
- [ ] Add 1ZE and Redeem 1ZE are separate flows with full disclosure (fee, rate, ETA, safeguarding).
- [ ] Activity rows are immutable with references; no user identity on public rows.
- [ ] Statements downloadable (PDF + CSV).
- [ ] Reconciliation break shows honest "temporarily unavailable" — never a possibly-wrong balance.
- [ ] Promotional credits (if any) in a separate labelled ledger.
- [ ] All numerals via `CoOwnNumericText` (tabular, aligned, true minus).
