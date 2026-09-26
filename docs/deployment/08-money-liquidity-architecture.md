# 08 — Money & Liquidity Architecture: FX Boundaries, Escrow Rails, and the Co-Own Liquidity Pool

> **Companion to DEPLOYMENT-EU.md.** Answers two deployment-level questions with
> live-verified evidence (2026-09-24): (1) where currency conversion actually
> happens when PSPs like Mangopay/Stripe/Adyen are the only fiat rails, and
> (2) how the liquidity pool for co-own (fractional) trades must be structured.
>
> **Doctrine:** external providers touch fiat only at two boundaries — *top-up
> (fiat → 1ze)* and *payout (1ze → fiat)*, plus card/escrow payments for direct
> purchases. Everything inside — wallet balances, escrow holds, co-own trades,
> DRIP, auctions — moves in **1ze units on our own ledger**. No external FX
> inside the app perimeter.

---

## 1. Can Stripe/Mangopay handle FXCM/Exness/Niyo-style back-connections?

**Short answer: you don't need them — and you can't use them anyway.**

Retail CFD brokers (Exness, FXCM/Stratos, IC Markets, XM, Plus500) are **trading
platforms for speculators**, not conversion plumbing:

- Their APIs are order/trade APIs for leveraged CFD positions, not payment
  conversion services.
- They cannot compliantly custody or convert *third-party marketplace funds* —
  their licences cover their own client trading book, not platform money flow.
- Niyo Global is a consumer forex-card fintech riding partner-bank rails (SBM/
  DCB) — also not a conversion provider for platforms.
- What our earlier research (`03-payment-jurisdictions.md`) actually showed is
  that these brokers run **entity-per-market structures** for *regulatory*
  reach — the pattern to copy is the entity layering, not the broker rail.

**Where conversion actually happens — inside the licensed PSP's own treasury:**

| Layer | Mechanism (verified 2026-09-24) |
|---|---|
| **Mangopay (LU/FR)** | **Native FX Conversions API** — `POST /conversions` between multi-currency wallets. Two modes: **Spot FX** (instant, one call) and **Guaranteed FX** (`POST /quotes` → rate locked for a duration → `POST /conversions` with QuoteId). Platform can take conversion fees; works on user wallets AND platform Client Wallets (Fees/Repudiation). |
| **Adyen (NL)** | Settlement in 150+ currencies; like-for-like or converted settlement; **Enterprise Funding** uses incoming pay-ins to directly fund outgoing payouts across currencies — internal netting. Local payout rails per currency; INR/BRL/MYR/MXN/AED are local-rail-only (no SWIFT). |
| **Nium (SG)** | Payout corridors to 190+ countries / 100 currencies — FX is executed inside the corridor at payout time; 100+ real-time corridors; just-in-time funding. |
| **Razorpay (IN)** | INR-denominated settlement; RazorpayX payouts in INR. |
| **Wise (UK)** | Platform API for cross-border payout + conversion at payout. |

So the "back connection" the question imagines **is the PSP's treasury desk** —
that's what a licensed e-money institution *is*. Optionally add a second
treasury provider (Nium, or Banking Circle/Currencycloud) purely for rate
arbitrage/fallback on exotic corridors — the same way the brokers diversify
banking partners.

### The conversion map

```
fiat IN    user pays INR/EUR/AED  → Stripe pay-in (primary) · Razorpay IN ·
           Tap GCC · Mollie EU — PSP treasury does any fiat→fiat at accept
     ↓
BOUNDARY 1  platform credits wallet: fiat pocket → 1ze units
            at fxEngine guaranteed-rate quote (already built — see §3)
     ↓
INTERNAL    everything in 1ze: escrow holds, co-own trades, DRIP,
            auction settlements, seller balances — zero external FX
     ↓
BOUNDARY 2  payout: 1ze → seller's currency
            Stripe Connect transfer+payout · RazorpayX INR · Nium corridor ·
            Wise payout — FX inside the PSP treasury at exit
```

This is exactly the user-stated model — providers exist only to **add 1ze**
and to **escrow/settle direct purchases** — and it is also how Vinted
(Mangopay) and eBay (Adyen) actually structure money flow.

### Rail decision (2026-09-24): **Stripe-primary**

User decision recorded — Stripe is the primary money rail; Mangopay is an
optional EU e-wallet rail if real per-user IBAN e-wallets are needed later.
What Stripe covers vs what our ledger must own:

| Need | Stripe? | Where it actually lives |
|---|---|---|
| Card/wallet pay-ins worldwide | ✅ buyers from ~195 countries | Stripe PaymentIntents |
| Escrow hold → release | ✅ **separate charges & transfers** — charge on platform, transfer to seller post-delivery (the exact "ThryftVerse escrow" pattern) | Stripe Connect |
| Seller payouts | ✅ Connect accounts in ~90+ countries (AE, CY, GCC, most of EU/Asia; IN/BD/MY in preview) | Stripe Connect |
| Corridors Connect can't reach | ❌ | Nium (190+ country payouts) or Wise — adapter interface stays |
| Per-user multi-currency e-wallets | ❌ (Treasury is US-only) | **our own 1ze ledger** — already built |
| Wallet-to-wallet transfers | ❌ | internal 1ze ledger |
| User-facing FX conversions | ❌ no conversion API | `fxEngine.ts` + PSP settlement FX |
| Escrow accounting/hold metadata | ❌ | our ledger + PaymentIntent metadata |

**Platform-entity location matters more than buyer coverage.** Verified
Connect constraints:

- A platform domiciled in the **UAE can only onboard UAE-based connected
  accounts** and cannot use `on_behalf_of` — a Dubai-incorporated Stripe
  platform would break the global marketplace. **The Stripe platform entity
  must be the Cyprus (EEA) OpCo**, eligible for cross-border payouts to
  connected accounts across EEA/UK/US/CA/CH (+0.25% fee, free within EEA
  and UK↔EEA).
- `destination charges` and `separate charges and transfers` require
  platform + connected account in the same region unless cross-border
  payout eligibility applies — the EEA platform gives the widest reach.
- Sellers outside Connect's supported-country list get paid via the Nium
  corridor rail — `countryCapabilities.ts` already models per-channel
  gateway fallback.

Net: Stripe moves regulated money end-to-end (pay-in → platform balance →
Connect transfer → payout). Our ledger owns everything denominated in 1ze.
Client funds stay on Stripe's regulated rails, keeping ThryftVerse out of
the EMI-licensing path for payment flows.

---

## 2. What the codebase already has (verified)

| Primitive | File | Status |
|---|---|---|
| Fiat↔fiat rate resolution (direct/inverse/USD-cross, freshness-aware) | `lib/fxEngine.ts` | Built |
| Guaranteed-rate quotes (60s default / 3600s max TTL), atomic execution | `lib/fxEngine.ts` | Built — mirrors Mangopay Guaranteed FX exactly |
| Multi-currency wallet pockets | `wallet_currency_balances` + `lib/walletMoneyPath.ts` | Built |
| 1ze segmented wallet (purchased vs earned provenance) | `oneze_wallet_segments`, `coOwnSettlement.ts` | Built |
| Reservation-aware spendable (gross − open-order holds) | `computeSpendableOnezeUnits` | Built |
| Secondary-market lockup enforcement | `getCoOwnLockupState` / `assertCoOwnLockupPermitted` | Built |
| DRIP reinvestment purchases | `coOwnDripExecutionHandler` | Built |
| Reserve-ratio policy + attestation + auto-adjust | `ONEZE_*` env, `onezeGovernance.ts` | Built |
| Co-own order book (CLOB) | routes/coOwn + frontend CLOB ticks | Built |

The internal machinery is real. What's missing is **the liquidity layer** —
the thing that makes the CLOB actually clear in a thin market.

---

## 3. The Co-Own Liquidity Pool — evidence-based design

### 3.1 What the real world teaches (verified)

- **Rally** (the only surviving US fractional-collectibles platform): CLOB with
  **market hours only** (10:30–16:30 ET weekdays), post-only outside hours,
  **5-day minimum hold** before resale, trading halts on buyout offers,
  broker-dealer intermediation, and each asset wrapped in a **Series LLC
  securitized under SEC Reg A**.
- **Masterworks**: same securitization model, 3–10 yr holds, secondary via ATS.
- **Sector mortality**: Otis wound down after Public acquisition; Collectable
  in Delaware litigation, no offerings since 2022; Rally itself carries a
  **going-concern warning**. *Thin liquidity killed the category — the order
  book alone is never enough.*
- **Market microstructure literature**: LOBs fail in thin markets; AMMs
  guarantee a quote but need inventory capital and bleed via LVR; **batch
  (call) auctions are the fairness-optimal middle ground for illiquid books.**

### 3.2 The five-layer pool

```
L1 PRIMARY ISSUANCE POOL          (exists)
   available_units per asset — platform/seller inventory.
   No counterparty needed; this IS the base liquidity.
            │
L2 SECONDARY CLOB + GUARDRAILS    (exists, needs hardening)
   Limit book per asset. Add:
   • minimum hold before resale (Rally: 5 business days)
   • price bands around reference price (circuit breakers,
     e.g. ±15%/session, wider bands halt to auction mode)
   • halt-on-buyout-offer (exists conceptually; wire it)
   • market-hours vs continuous — decide per asset class;
     thin books actually benefit from concentrated hours
            │
L3 PLATFORM MARKET-MAKER          (NEW — the actual "liquidity pool")
   A treasury wallet posting two-sided quotes within a band
   around the asset's reference price:
   • inventory: 1ze + asset units, seeded per asset
   • quotes: bid/ask at reference ± band (e.g. 2–8%),
     sized by per-asset allocation (cap ≤5% of float per asset)
   • earned spread funds the pool; losses bounded by cap
   • effectively a governed AMM executed through the CLOB —
     no new matching engine needed, just a quoting worker
            │
L4 BATCH (CALL) AUCTION FALLBACK  (NEW)
   When a book is empty/thin for N sessions: collect bids/asks
   over a window (e.g. weekly), clear at a single price.
   Maximizes matching, prevents phantom-liquidity UX.
            │
L5 BUYOUT / REDEMPTION BACKSTOP   (partially exists)
   Whole-asset buyout offers → pro-rata distribution to all
   holders; DRIP reinvestment already routes proceeds into
   new primary purchases. The terminal liquidity guarantee:
   no holder is permanently stuck.
```

### 3.3 Depth incentives

- **MM rebates**: quote-depth rewards in 1ze for resting liquidity near touch
  (exchange-style maker rebates), funded from trade fees.
- **Float gate**: secondary trading opens only when free float ≥ threshold
  (e.g. 15% of units) — dead books never launch, which is how Rally/Otis
  created graveyard books.
- **Fee asymmetry**: maker < taker fees; MM pool exempt from spread band
  limits only within its governed quote.

### 3.4 Pool balance-sheet mechanics

- Pool wallet is a **platform-owned wallet** (like Mangopay Client Wallet
  semantics): holds `oneze` inventory + unit positions per asset.
- Bounded risk: per-asset allocation cap, total-pool cap, daily VaR-style
  review in ops-console; pool P&L reconciles through `wallet_ledger` +
  `oneze_balance_origin_events` (already the canonical audit path).
- Attestation (`ONEZE_ATTESTATION_SIGNING_SECRET`) must account for
  pool-held units — the pool is inside the supply perimeter, not outside it.
- Reserve policy (`ONEZE_RESERVE_RATIO_MIN/MAX`) treats pool 1ze as platform
  float, not user liability — define this in `onezeGovernance` before launch.

### 3.5 The regulatory perimeter — admitted-security model

The product decision is settled: **co-own units are admitted traded
securities** — custodial fractional claims on real items held by the platform,
transferable on our order book, settled strictly in 1ze under app terms.
This is precisely the SEC's "custodial tokenized security" taxonomy (Jan 2026
Corp Fin/IM/T&M joint statement): a third party holds the underlying in
custody and the unit evidences the holder's ownership interest. The ledger
technology is irrelevant to the classification — off-chain records get the
same analysis as on-chain ones.

**Hard truths first:**

- **T&Cs cannot contract out of securities law.** "Only tradable in 1ze" is a
  valid *product* rule (private venues restrict participants and settlement
  assets all the time) but it does not change the instrument's legal status
  in any jurisdiction.
- **1ze becomes a second regulated surface.** Settling security trades in a
  platform-issued unit weakens 1ze's Limited Network Exclusion argument
  (§3.5.2) — the LNE contemplates instruments redeemable for *goods and
  services in a commercial network*, not a settlement rail for financial
  instruments. Expect a competent authority to ask exactly this.
- **NFT-framing changes nothing.** ESMA's MiCA/financial-instrument guidance
  and the SEC both treat fractionalized asset-backed units by substance, not
  label.

#### 3.5.1 The compliant venue paths (verified 2026-09-24)

| Path | Mechanism | Precedent | Cost/time |
|---|---|---|---|
| **A — Licensed venue partner (recommended launch path)** | Co-own units issued/traded under a partner's licence; our app is the UX + asset pipeline, their venue is the regulated book | **Assetera (AT)** — MiFID II licence, offers "compliant umbrella" for issuers, B2B API, secondary buy/sell, retail+professional; **Swarm Markets** (DE, BaFin); **21X** (DE — first EU DLT Pilot Regime licence, Dec 2024; CLOB + appointed market maker Tradevest + defined trading hours + atomic settlement — *our exact L2+L3 shape, licensed*) | Weeks–months; revenue share |
| **B — Own MiFID investment-firm / MTF authorization** | ThryftVerse entity becomes the venue | The 12–18 month answer | €500K+ capital + compliance build |
| **C — DLT migration + DLT Pilot venue** | Move unit registry to chain, list on 21X-class venue | 21X on Polygon | Requires real DLT — our ledger is Postgres; strategic option, not launch path |

**Recommendation:** Path A at launch — co-own trades route under a licensed
venue's umbrella (Assetera-class) or we contract as their tied agent; our
CLOB remains the UX surface, their licence carries the regulated function.
Path B becomes the graduation step when co-own GMV justifies it. Document the
choice in `decisions.md` — it determines which ledger fields need
venue-facing reporting.

#### 3.5.2 1ze's own regulatory status

- **Commerce use** (buy/sell goods, escrow): candidate for PSD2 **Limited
  Network Exclusion** (Art 3(k)) — BUT must **notify the competent authority
  once transaction volume exceeds €1M/12mo** (FCA direction; EBA GL-2022-02
  tightened the criteria). File the notification, don't assume exemption.
- **Co-own settlement use:** pushes 1ze toward e-money/payment-service
  analysis. Two honest mitigations: (a) settle user-facing money in Mangopay
  e-wallets (real EMI e-money with IBANs) and keep 1ze as the ledger
  unit-of-account over that rail — the regulated money never leaves the EMI;
  (b) obtain counsel opinion on whether 1ze-denominated security settlement
  is sustainable under LNE — treat (a) as the default.
- **If 1ze ever becomes crypto-formatted:** MiCA e-money-token analysis
  applies (redeemable fiat-referencing transferable token = EMT licence
  territory). Keep it a database unit — cheaper and cleaner.

#### 3.5.3 Legal machinery the build needs (mapped to `07-legal-machinery.md`)

- **Custody:** per-asset segregated custody record (Rally Series-LLC analog —
  one logical SPV/asset in our data model: custodied item ↔ unit register ↔
  insurance/valuation records). The item must be legally held apart from
  platform operating assets — insolvency separation.
- **Investor layer:** KYC (iDenfy — already selected), MiFID **appropriateness
  assessment** before first co-own trade (complex product), key-information
  disclosure per asset (risks, fees, custody, exit mechanics), order +
  transaction record retention (MiFID-grade), **market-abuse surveillance**
  (MAR: wash-trading/self-trading detection in the CLOB — required anyway for
  a real order book), transaction reporting (handled by venue partner under
  Path A).
- **Cluster gating:** `countryCapabilities.ts` cluster-level co-own
  feature flag — EU enabled via venue partner; **US excluded** (Reg A is a
  separate program); IN pending counsel; GCC pending counsel.

#### 3.5.4 Entity structure & licence map (verified 2026-09-24)

**First, the honest constraint: licences follow the investor, not the
incorporation.** Registering in a lightly-regulated jurisdiction does not
exempt the platform from the securities/payments law of the countries where
users sit. "Less regulated" buys tax and holding-company efficiency — it
does not buy freedom from MiFID, PSD2, SCA, or DFSA. Cyprus itself is not
"light" regulation — it is full MiFID II; it is simply the fastest and
cheapest EU passport. Structure accordingly:

```
Dubai HoldCo (UAE)                    ← tax residency, HQ, MENA ops
  └─ Cyprus OpCo (CySEC CIF)          ← regulated EU entity: runs co-own venue,
       │                                Stripe platform account, LNE notifications
       ├─ Stripe platform (EEA)         ← Connect cross-border eligible
       ├─ EU cluster ops (OVH Paris)
       └─ passports: MiFID services → all EU/EEA
  └─ Future: IN entity or partner     ← Razorpay rails + DPDP data
  └─ US: excluded (no entity needed)  ← doctrine
```

**Licence matrix by activity:**

| Activity | Regulator / instrument | Cost & capital | Notes |
|---|---|---|---|
| Marketplace pay-ins + escrow holds | **None for us** — Stripe Connect holds client funds | — | Stripe is the licensed party; we are a commercial agent. If we ever hold client funds on our own books → EMI licence per region |
| 1ze top-up (closed loop, commerce) | EU: PSD2 LNE — notify NCA when >€1M/12mo | notification only | EBA GL-2022-02 criteria apply |
| 1ze issued from UAE entity | CBUAE SVF licence — **single-purpose SVF exempt** (closed loop only usable on ThryftVerse) | exempt if truly closed-loop | Keep 1ze non-redeemable-for-fiat to stay inside the exemption |
| Co-own secondary trading (EU users) | **CySEC CIF** — Cat B €750K initial capital (MTF/OTF + dealing on own account — required since our MM pool trades as principal) or Cat A €75–100K (agency-only, no MM principal) | €7K application; €5–10K/yr + turnover fee; ~6–9mo | **This is the licence.** Cat B needed the moment L3 MM pool trades own inventory. Passports to all EU/EEA |
| Co-own via partner umbrella (interim) | Partner's licence (Assetera AT MiFID II) | rev share | Launch while CIF application pending — gap list item 0 |
| UAE/GCC users trading co-own | SCA (onshore) / DFSA (DIFC) securities-venue analysis | heavy | **Exclude or restrict GCC co-own until scoped** — Dubai incorporation does not auto-authorize a trading venue |
| Virtual assets (only if 1ze goes on-chain) | Dubai VARA VASP licence | heavy | Keep 1ze a DB unit → VARA not applicable |
| IN users (payments) | Razorpay as licensed PA; PPI partner if 1ze sold for INR | partner rails | IN co-own excluded pending counsel |
| AML/CFT everywhere licensed | EU AMLD (Cyprus: MLRO + program), UAE goAML | program cost | Non-optional once any licence exists |

**Sequence:** incorporate Dubai HoldCo + Cyprus OpCo → open Stripe platform
on the Cyprus entity → co-own launches under partner umbrella (or stays
primary-issuance-only) → file CIF Cat B application → self-operate MTF once
granted.

### 3.6 Gap list (build order)

| # | Item | Depends |
|---|---|---|
| 0 | **Venue-path decision (Path A partner vs Path B licence) + counsel engagement** | gates everything below |
| 0a | **Entity setup: Dubai HoldCo + Cyprus OpCo; Stripe platform on Cyprus entity** (UAE platform = UAE-only Connect accounts — verified) | legal + Stripe onboarding |
| 0b | Per-asset custody record model (SPV-equivalent: item ↔ unit register ↔ insurance/valuation) | data model |
| 0c | Appropriateness test + key-information disclosure per asset | counsel |
| 0d | Market-abuse surveillance (wash/self-trade detection on CLOB) | none — build with 1 |
| 1 | Min-hold-before-resale + price bands on CLOB | none — small, do first |
| 2 | Halt-on-buyout-offer flow | L5 distribution math |
| 3 | MM pool wallet + quoting worker (reference ± band, caps) | L1/L2 stable + venue decision |
| 4 | Batch auction clearing for empty books | 3 |
| 5 | Buyout pro-rata distribution path | governance sign-off |
| 6 | Cluster gate: co-own flag per cluster (EU via partner, US off, IN/GCC pending) | 0 |
| 7 | MM rebate program | post-launch metric on book depth |
| 8 | PSD2 LNE notification (>€1M/yr volume) + 1ze-settlement counsel opinion | counsel |

### 3.7 Env vars to add

```bash
# ── Stripe (primary rail) ───────────────────────────────
STRIPE_PLATFORM_ENTITY=cy       # platform account domiciled on Cyprus OpCo
STRIPE_CONNECT_MODE=express     # express | custom
STRIPE_ESCROW_CHARGE_TYPE=separate_charges_and_transfers

# ── Mangopay (optional EU e-wallet rail) ────────────────
MANGOPAY_CLIENT_ID=
MANGOPAY_API_KEY=
MANGOPAY_WEBHOOK_SECRET=        # if signed events used

# ── Co-Own liquidity pool ────────────────────────────────
COOWN_MM_ENABLED=false          # dark-launch off; enable per asset class
COOWN_MM_SPREAD_BPS=400         # total band half-width vs reference
COOWN_MM_MAX_FLOAT_PCT=5        # per-asset inventory cap
COOWN_MIN_HOLD_HOURS=120        # resale hold (Rally: 5 business days)
COOWN_PRICE_BAND_BPS=1500       # session circuit breaker
COOWN_BATCH_AUCTION_ENABLED=true
COOWN_BATCH_AUCTION_INTERVAL_MS=604800000  # weekly
COOWN_MIN_FLOAT_PCT=15          # float gate to open secondary
```

---

## 4. Bottom line

- **Stripe-primary rail confirmed** — Connect separate-charges-and-transfers
  is the escrow pattern; platform domiciled on the **Cyprus OpCo** (a UAE
  platform is restricted to UAE-only connected accounts); Nium covers
  corridors Connect can't reach; our 1ze ledger + `fxEngine.ts` own the
  wallet/FX layer Stripe lacks.
- **Entity structure: Dubai HoldCo + Cyprus OpCo (CySEC CIF).** Licences
  follow the *investor's* location — incorporation only buys tax/holding
  efficiency. Cat B (€750K, MTF + own-account dealing) is needed once the MM
  pool trades as principal; partner umbrella (Assetera) covers the interim.
- **FX back-connections are unnecessary** — PSP treasuries (Stripe
  settlement FX, Mangopay Conversions, Nium corridors) are the licensed
  layer; FXCM/Exness/Niyo are trading brokers and consumer forex cards —
  wrong layer, wrong licence.
- **Your stated model is correct and Vinted/eBay-shaped:** PSPs only add 1ze
  and settle escrow/card; all internal value is 1ze; conversion only at
  boundaries.
- **The liquidity pool is a five-layer system** — primary issuance → guarded
  CLOB → platform market-maker → batch auctions → buyout backstop — not a
  single pool of money. The graveyard lesson from Rally/Otis/Collectable:
  order books alone die in thin markets; guaranteed quotes (L3) + guaranteed
  exit (L5) are what keep fractional markets alive.
- **Co-own is an admitted custodial security** — settle the venue question
  first (Assetera-class licensed umbrella at launch, own MiFID authorisation
  at scale), keep 1ze's regulated money inside an EMI wallet rail, file the
  PSD2 LNE notification, and cluster-gate the feature. The 21X venue proves
  the CLOB+market-maker+trading-hours model is licenceable — our design is
  shaped correctly; it just needs a licensed wrapper.

*Evidence: `.flagship/research-ledger-2026-09-24-deployment-infra.md` waves
3–6; Stripe Connect docs (platform-country restrictions, cross-border
payouts, charge types); Mangopay FX docs; Adyen platforms docs; CySEC
CIF/IFR-IFD capital requirements; CBUAE SVF + RPSCS regulations; VARA
licence scope; rallyrd.com trading FAQ; CySEC C659; ESMA fractional-share
statement; SEC tokenized-securities statement (Jan 2026); arXiv
market-microstructure literature on LOB-vs-AMM-vs-batch for thin markets.*
