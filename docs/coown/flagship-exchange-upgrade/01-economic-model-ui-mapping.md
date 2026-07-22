# 01 — Economic Model → UI Mapping

**Goal:** make every canonical economic concept from the source research §3 visible, distinguishable and truthful in the interface. The current single `CoOwnedAsset` display model conflates six concepts; the UI must separate them even where the backend migration is phased.

**Canonical source:** `COOWN_MARKET_ECONOMIC_MODEL_AND_GALLERIA_UI_RESEARCH_2026-07.md` §3 (six concepts), §3.2 (supply equation), §3.3 (ownership %), §3.4 (cap-table example), §3.5 (rights contract).

---

## 1. The six concepts and where they appear in the UI

| # | Concept | What it is | UI surfaces that must express it | Current code gap |
|---|---|---|---|---|
| A | **Underlying asset** | Physical/economic thing: yacht, watch, art. Identity, condition, title, custody, insurance, appraisal. | AssetDetail hero, dossier, provenance, condition report, custody/insurance strip, appraisal card. | `CoOwnedAsset.title` + `image` + `authPhotos` only — no condition, custody, insurance, appraisal fields. |
| B | **Issuance vehicle** | Legal entity holding title/enforceable rights. Vehicle ID, legal form, jurisdiction, operator, custodian. | `CoOwnIssuerCard` must become a **Vehicle card**: legal form, jurisdiction, operator, custodian, documents. | `CoOwnIssuerCard` shows `issuerName`, `verificationLevel`, `jurisdiction` only — no vehicle, custodian, documents. |
| C | **Instrument series** | Finite fungible unit class that trades. Ticker, quote asset (1ZE), authorised/issued/float, sponsor locked, treasury, voting, distribution, exit. | `CoOwnOwnershipPanel` must show **authorised / issued / public float / sponsor locked / treasury** separately, plus rights-version badge. | `CoOwnOwnershipPanel` shows `totalUnits` / `availableUnits` / `allocatedPct` only — no authorised/issued/float/locked/treasury split, no rights version. |
| D | **Exchange market** | Venue for one pair (`MYA-01 / 1ZE`). Tick, lot, session, order types, price bands, state, fees, eligibility, settlement. | **Market-status strip** (new) on AssetDetail + Trade: mode (Continuous/Call auction/RFQ/Closed), session countdown, halt state, tick/lot, disclosure version. | No market entity at all in the UI. `status: 'offering'|'active'|'buyout_pending'|'delisted'` is an asset lifecycle, not a market state. |
| E | **Position** | User's settled beneficial balance + operational states (settled available, reserved for sale, pending in/out). | `CoOwnPositionCard` + Portfolio rows must show **settled / reserved / pending-in / pending-out**, ownership % against **outstanding** (labelled denominator). | `ShareHolding.sharesOwned` is a single number — no reserved/pending split. `percentageOfTotal` denominator is unlabelled. |
| F | **1ZE settlement balance** | Cash-like ledger: available, reserved for orders, pending deposit, unsettled sale proceeds, redemption in progress, safeguarded. | Wallet hero + breakdown: **available / reserved / pending / withdrawable / safeguarded** as independently explainable sub-balances. | `Wallet.izeBalance` + `fiatBalance` + one `lockedBalance` — no reservation/pending/withdrawable/safeguarded split. |

**Rule:** a screen may not display a number that the model behind it cannot truthfully produce. During the phased backend migration, the UI must **fail closed** (show "—" / "Not available") for any concept the backend does not yet expose — never fabricate. (`AGENTS.md` §11.)

---

## 2. The four prices that must never be conflated

Source research §3.4 and §6.6 are explicit. The current `CoOwnedAsset.currentPricePerShare` is one mutable field used as quote, valuation and traded price — this is the single most dangerous UI conflation.

| Price | Source | Where it shows | Label |
|---|---|---|---|
| **Last trade** | Most recent eligible execution price + time | AssetDetail hero, Market row, Portfolio mark | "Last" + timestamp/age |
| **Best bid / Best ask** | Top of executable book | AssetDetail value strip, Order ticket header | "Bid" / "Ask" with size |
| **Midpoint** | (best_bid + best_ask) / 2 when both exist | Order ticket impact preview | "Mid" |
| **Reference NAV per unit** | (asset fair value + vehicle cash − debt − accrued) / issued units | AssetDetail **Fundamental** strip, Portfolio mark-source toggle | "NAV" + valuation date/method/valuer |
| **Issue price** | Primary offering price | Primary-issue screen only | "Issue price" |
| **Local-fiat indication** | 1ZE → GBP/EUR/USD via disclosed source + timestamp | Wallet, Order ticket review, Portfolio hero (secondary) | "≈ £X" + source/time |

**UI rules:**
- No trade → no new last price. Show last trade **age** ("Last trade 3d ago"). If no bid or ask, show an em dash and "No current order" — **never zero**.
- Market cap must identify the mark used (`last × issued` vs `NAV × issued`). Label explicitly.
- A 24% premium of last over NAV is **information**, not an error to conceal. Show both.
- Percentage change requires a timestamp and a prior reference price. A percentage without both is prohibited (source §11.4).

---

## 3. Supply equation the UI must render — one canonical invariant

For every series (source §3.2, corrected per audit):

```text
authorised units ≥ issued units

issued units =
  settled_owner_balances      (all holders' settled units)
  + sponsor_locked_units      (locked, not tradeable)
  + treasury_units            (held by vehicle, not offered)

public float =
  settled_owner_balances
  − transfer_restricted_units
  − sponsor_locked_units
  − treasury_units_not_offered
```

**Critical invariant:** "investor pending" is **not** a supply bucket. Reservations and in-flight transfers are **states attached to existing issued units**, not new units. Every unit has exactly one canonical ledger location at every moment:

```text
unit state ∈ { settled_available, reserved_for_sale, pending_transfer_in, pending_transfer_out, sponsor_locked, treasury, retired }
```

The sum of all unit states equals `issued_units` after every posting. A pending transfer moves a unit from `settled_available` (seller) → `pending_transfer_out` (seller) → `settled_available` (buyer). It does not create or destroy units. No transaction may create or destroy asset units except an authorised corporate action.

**`CoOwnOwnershipPanel` target layout** (replace the current total/available/allocated trio):

```text
Status pill:  [Continuous] [Call auction 14:00] [Halted] [Closed] [RFQ]

INSTRUMENT
  Ticker            MYA-01
  Quote             1ZE
  Rights version    v2 · Jul 2026

SUPPLY
  Authorised        100,000
  Issued            100,000
  Public float      70,000
  Sponsor locked    20,000   (release schedule ↗)
  Treasury          10,000

YOUR POSITION  (only if viewer holds)
  Settled           500
  Reserved for sale 0
  Pending in        0
  Ownership         0.50% of outstanding (100,000)
```

The denominator label ("of outstanding 100,000") is mandatory — voting/distribution denominators may differ if the contract excludes treasury (source §3.3).

---

## 4. Rights contract → a readable surface

Source §3.5 requires a human-readable rights summary backed by signed documents. The UI surface is a **Rights sheet** (modal, pushed from AssetDetail) — not a wall of legal text on the detail screen.

**Live-instrument rule (audit blocker 5):** before an instrument becomes tradable, users must receive **versioned, accepted terms** covering all rows below. "To be confirmed" is acceptable **only in a prelaunch preview** (instrument not yet live). A live market instrument must never show "Rights TBC" — if any row lacks an answer, the instrument cannot be tradable. The UI must block trading (dock disabled with "Rights incomplete — not yet tradable") until all rows are answered and the disclosure version is accepted.

Required rows (every one must have an answer for live instruments; "To be confirmed" only for prelaunch preview):

| Right | UI label |
|---|---|
| Legal holder of underlying | "Title holder" |
| Unit-holder interest | "Your interest" |
| Voting | "Voting rights" |
| Income | "Distributions" |
| Costs | "Operating costs" |
| Reserve | "Reserve" |
| Borrowing | "Borrowing" |
| Dilution | "Dilution / pre-emption" |
| Transfer | "Transfer eligibility" |
| Use rights | "Use / access rights" |
| Exit | "Exit & proceeds" |
| Default | "If costs exceed reserves" |
| Insolvency | "Insolvency priority" |

Each row expands to a short plain-language answer + a "View document" link to the signed PDF. A disclosure-version badge (`v2 · Jul 2026`) must be visible on AssetDetail and accepted in TradeConfirm (source §11.6).

---

## 5. Position value vs NAV vs market price

Source §3.4: position value is **not** legal NAV and **not** an unexecuted asking price. The Portfolio position row must show:

```text
Units (settled)        500
Ownership              0.50% of outstanding
Mark source            Last trade · 12.40 1ZE · 3h ago
Mark value             6,200 1ZE  (≈ £5,890)
Cost basis             5,000 1ZE  (avg 10.00)
Unrealised P&L         +1,200 1ZE  (+24.0%)
NAV per unit           10.00 1ZE  (valued 02 Jul · independent)
Premium of last/NAV    +24.0%  ← information, not a gain
```

The "Premium of last/NAV" line is the single most important truth-telling element in the portfolio. It stops users reading a market premium as an appraisal gain.

---

## 6. 1ZE balance sub-ledgers the wallet must show — nonnegative buckets

Source §3.1.F, corrected per audit (blocker 1). The previous example was financially impossible: spendable (12,400) exceeded total claim (10,020). The wallet contract uses **nonnegative buckets** with a strict invariant:

```text
settled_customer_claim =
  available
  + reserved_for_orders
  + redemption_pending
  + other_holds

invariant:  withdrawable ≤ available ≤ settled_customer_claim
```

Pending deposits and unsettled sale proceeds are **separate** until they legally and operationally become settled funds. They do not add to `available` or `settled_customer_claim` until settled.

**Wallet display:**

```text
SETTLED CLAIM (safeguarded at [partner])
  Available              12,400.00     ← spendable now (hero)
  Reserved for orders     1,200.00     (2 open buy orders)
  Redemption pending      2,000.00     (to GBP · ETA 18:00)
  Other holds                 0.00
  ─────────────────────────────────
  Settled customer claim 15,600.00

PENDING (not yet settled — separate)
  Pending deposit          500.00     (settling 14:00)
  Unsettled sale proceeds  320.00     (T+1)

WITHDRAWABLE
  Available              12,400.00     (capped to available, not claim)
```

**Rules:**
- **Spendable now** = `available` — the headline hero.
- **Settled customer claim** = `available + reserved + redemption + other_holds` — the reconcilable safeguarded claim.
- **Pending** (deposits, unsettled proceeds) shown in a **separate section** — never added to `available` or `settled_claim` until settled.
- **Withdrawable** ≤ `available` ≤ `settled_customer_claim` — enforced at the model layer, never violated in the UI.
- **Safeguarding partner** attribution is mandatory when present (source §1.1, §11.8).
- No sub-balance may ever be negative.

---

## 7. Migration discipline (do not fake the model in the UI)

The backend will not expose all six concepts on day one. The UI migration rule:

1. **Phase 1 (now):** render what the backend truthfully provides; show "—" / "Not yet available" / "Pending backend" for the rest. No mock fallbacks in production (source §2.2, `AGENTS.md` §11).
2. **Phase 2:** backend exposes Instrument + Market + reservation states → UI lights up those surfaces.
3. **Phase 3:** backend exposes NAV + rights + distributions → UI lights up Fundamental strip, Rights sheet, distribution history.
4. **Phase 4+:** clubs, corporate actions, concierge.

A beautiful panel with fabricated numbers is worse than an honest "—" — it makes the risk harder to see (source §19).
