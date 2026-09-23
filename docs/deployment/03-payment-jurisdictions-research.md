# 03 — Payment & Entity Jurisdictions: How Cross-Border Platforms Route Money Without One Regulator Stopping the World

> **Research question:** *How do cross-border financial platforms — retail brokers
> (Exness, FXCM/Stratos, IC Markets, XM, eToro, IBKR, Plus500), fintechs (Niyo,
> Wise, Revolut, Chime), and payment companies (Stripe, Adyen, Airwallex, Nium,
> Thunes, Rapyd) — structure legal entities, licences, banking partners and
> routing so operations span dozens of countries without a single regulator,
> bank or PSP becoming a kill-switch?*
>
> **Method:** live research (23 Sep 2026) over regulator registers (FCA, CySEC,
> FSCA, CMA Kenya, ASIC, CFTC, RBI, FinCEN, VARA), SEC/court filings, official
> licence pages and client agreements, plus secondary analysis. Evidence classes:
> **[PRIMARY]** regulator/court/filing, **[OFFICIAL]** company disclosure,
> **[SECONDARY]** press/analysis, **[FLAG]** unverified/conflicting.

---

## Part I — The entity-per-market model: retail brokers

### 1. Exness — the complete verified entity tree

**Group:** founded 2008, HQ Limassol; privately founder-owned — UK PSC register
shows **Petr Valov 50–75%, Igor Lychagov 25–50%** of Exness (UK) Ltd.
`Exness Group Holding Ltd` (Cyprus, reg. 31 Oct 2023) is the holdco — full
shareholding paywalled [FLAG]. [PRIMARY: Companies House PSC; companiesregistry.cy]

| Entity | Regulator / Licence | Role |
|---|---|---|
| **Exness (Cy) Ltd** | CySEC CIF **178/12** | EU-facing; **explicitly does NOT serve retail**; operates exness.eu |
| **Exness (UK) Ltd** | FCA FRN **730729** | UK-facing; **no retail**; exness.uk |
| **Exness (SC) Ltd** | Seychelles FSA **SD025** | **Primary global retail entity** — "selected jurisdictions outside the EEA" |
| **Exness (SC) Ltd — SA branch** | FSCA **ODP** authorisation; external co. 2019/061503/10 | Dual-licence hybrid: Seychelles entity + SA product authorisation; client agreement carries an SA-only Appendix A |
| **Exness ZA (Pty) Ltd** | FSCA FSP **51024** | Domestic SA entity — SA is served by *two layers* |
| **Exness B.V.** | Curaçao CBCS **0003LSI** | Offshore retail |
| **Exness (VG) Ltd** | BVI FSC **SIBA/L/20/1133** | Offshore retail |
| **Exness (MU) Ltd** | Mauritius FSC **GB20025294** | Investment dealer; "not currently providing retail services" |
| **Exness (KE) Ltd** | Kenya CMA non-dealing licence **162** | Kenyan retail — hard caps (1:400, no stop-out protection) |
| **Exness Limited Jordan Ltd** | JSC reg. **51905** | MENA hub |
| **Exness MENA Financial Brokers LLC** | UAE SCA **CP-0001100** | UAE licence (entity name per secondary — [FLAG]) |
| **Forexite Ltd** | Belize FSC **9110312** | Offshore |
| ~~Uruguay~~ | — | **[UNVERIFIED]** — no licensed entity exists; at most a dev office |

**Client routing is explicit at the domain level:** exness.com (offshore
entities) vs exness.eu vs exness.uk vs exness.ke vs exness.co.za — the URL
encodes the contracting entity. **US residents are excluded entirely.**
Compensation schemes (ICF €20k, FSCS £85k) attach to the *contracting entity*,
never the brand; offshore entities offer no statutory scheme but up to
"unlimited" leverage. [OFFICIAL: exness.com/regulation + per-entity agreements;
PRIMARY: CMA register, PAIA manual]

### 2. FXCM/Stratos — entity structure *and* the failure record

**Current tree:** Jefferies Financial Group (NYSE:JEF) → Stratos Group
International LLC → operating subs. [PRIMARY: Stratos Europe Pillar 3]

| Entity | Regulator | Notes |
|---|---|---|
| Stratos Markets Ltd | FCA **217689** | ex-Forex Capital Markets Ltd, renamed Sep 2023 |
| Stratos Europe Ltd (t/a FXCM EU, Tradu) | CySEC **392/20** | EEA passport **except Belgium**; Berlin branch does onboarding assistance only |
| Stratos Trading Pty Ltd | ASIC AFSL **309763** | ex-FXCM Australia |
| Stratos South Africa (Pty) Ltd | FSCA FSP **46534** | intermediary role [FLAG: restriction qualifier unverified] |
| Stratos Light Ltd | Israel ISA | operating subsidiary |
| **Stratos Global LLC** | **SVG — NONE** | FXCM's own words: "not required to hold any financial services license or authorization in St Vincent" — the **deliberately unregulated catch-all** |

**Failure history (the real lessons):**
1. **SNB de-peg (15 Jan 2015):** ~$225M client debit balances → capital breach
   in every jurisdiction simultaneously → $300M Leucadia rescue loan **secured
   on all subsidiary equity**. Entity structure does not protect against
   group-level capital failure. [PRIMARY: SEC 8-Ks; SECONDARY: Reuters]
2. **US expulsion (Feb 2017):** CFTC $7M penalty + registration bar for
   concealing its market-maker relationship while marketing "No Dealing Desk."
   The US client book was **sold as a portable asset** to GAIN Capital — losing
   your flagship jurisdiction ≠ death. [PRIMARY: CFTC order, SEC filings]
3. **Secured lender → owner:** Jefferies foreclosed on pledged equity
   (Sept 2023) and ended up owning 100% of the group — the 2015 rescue lender
   became the owner via the security package, not a purchase.
4. **Per-entity conduct risk is perpetual:** Dec 2025 ASIC DDO interim stop
   order against the Australian entity alone (TMD deficiency) while sister
   entities were unaffected. [PRIMARY: ASIC 25-295MR / 26-004MR]

### 3. The pattern generalized — IC Markets, XM, eToro, IBKR, Plus500

The industry-standard stack is now uniform: **one or two Tier-1 licences for
regulated-market credibility + an offshore catch-all (Seychelles/BVI/Bahamas/
SVG/Belize) for permissive terms + thin local entities only where law mandates
onshore presence.**

| Group | Tier-1 entities | Offshore catch-all | Forced-local entities |
|---|---|---|---|
| IC Markets | ASIC 335692, CySEC 362/18 | **Raw Trading Ltd** (FSA SD018, "IC Markets Global", 1:1000) | Kenya CMA 199 |
| XM / Trading Point | CySEC 120/10, FCA 705428, ASIC 443670, DFSA | **XM Global Ltd** (Belize), Tradexfin (FSA SD010 — ~99% Japanese traffic per FinTelegram) | US (Trading.com, CFTC) |
| eToro | CySEC 109/10, FCA 583263, **two AFSLs split by product type**, SEC BD + state MTLs | **eToro (Seychelles) Ltd** (SD076 — rest-of-world) | eToro USA LLC/Inc (crypto vs securities split) |
| IBKR | SEC/FINRA/CFTC + CBI/FCB/FCA per-market | **none — no offshore catch-all** | substantive licence in every major market |
| Plus500 | **14 licences** — one AU entity carries ASIC+FMA+FSCA | Plus500SEY (FSA) | NFA futures, MAS, ISA, DFSA/SCA |

**IBKR consolidation lesson:** post-Brexit EU clients were split across
Luxembourg/Ireland/Hungary entities, then **IBCE merged into IBIE (Aug 2024)** —
entity changes are documented, notified, regulator-supervised events that switch
the client's compensation scheme (Hungarian IPF → Irish ICCL). Never a silent
CRM edit. [PRIMARY: SEC exhibits, BVA notice]

### 4. Binance — the failure mode of jurisdictional arbitrage by opacity

- Jurisdiction-hopped China → Japan → "Malta" (MFSA publicly stated Feb 2020 it
  was **not** licensed) → CZ's "no headquarters" posture → Ireland registrations.
- **The fake-affiliate problem:** Binance.US (BAM Trading Services, ~43 state
  MTLs) was presented as independent but was owned through a chain ending at
  CZ (81%), licensed Binance's matching engine, **custodied customer assets at
  Binance Holdings**, and Binance personnel reportedly controlled its bank
  accounts. [PRIMARY: Oregon DFCS order, SEC exhibits; SECONDARY: Reuters]
- **Resolution (21 Nov 2023):** guilty plea — unlicensed money transmission +
  AML failure + IEEPA violations; **$4.316B** total; **3-year independent
  compliance monitor** (5-year under FinCEN); CZ personally pleaded guilty,
  $50M fine, 4 months prison; Dubai VARA licence reportedly conditioned on **CZ
  ceding voting rights in the local entity**. [PRIMARY: DOJ, FinCEN, Treasury,
  VARA register]

**Lesson:** arbitrage by opacity fails the moment you touch the US financial
system — jurisdiction attaches via *currency and customers*, not incorporation
site. The end-state is not just a fine: a monitor inside your compliance stack
and forced divestiture of founder control at the entity level.

### 5. Client-routing mechanics — how the entity decision is actually made

- **Routing matrix:** onboarding captures *structured* country codes
  (residence, nationality, tax residence — never free text); a matrix maps
  `residence × client classification × requested products → contracting entity`,
  and downstream config (ToS version, leverage, compensation scheme, payment
  rails, data controller) follows from that assignment. Rules are owned by
  compliance, version-controlled, and **sales cannot move a client between
  entities without an approved process** — "or the routing matrix is
  decorative." [SECONDARY practitioner: ebsfintech.com]
- **Corroborating signals:** declared residence is checked against
  proof-of-address docs, funding-instrument country, and IP geolocation/VPN
  detection — mismatches raise manual tasks. [OFFICIAL: Sumsub docs]
- **FATCA/CRS self-certification** collects tax residency at onboarding —
  used both for reporting and US-person exclusion. [OFFICIAL: FXCM CRS FAQs]
- **Blocked lists are contractual:** eToro AUS T&Cs define "blocked countries"
  and reserve the right to change them; Exness discloses no-US service.
- **Per-entity ToS:** each entity publishes its own client agreement naming
  itself and licence number as counterparty; sub-layering exists (Exness SC's
  SA-only Appendix A — one entity, two regimes, conditional clauses).
- **Branches vs subsidiaries:** where subs are unnecessary, branches/rep
  offices assist onboarding but don't contract (Stratos Berlin Niederlassung;
  Wise Hungary; Exness SC's SA external-company branch holding the ODP licence
  while the Seychelles parent contracts).

---

## Part II — Rent-a-licence: partner-bank and BaaS models

### 1. Niyo Global — the partner-bank model in full detail

**Entity:** Niyo = consumer brand of Finnew Solutions Pvt. Ltd. (Bengaluru;
holding NiYO Inc., US; **no operations outside India**). ~$180M raised (Series C
$100M Accel+Lightrock Feb 2022; +$30M Multiples Jul 2022). Niyo Global
(zero-forex travel cards) is ~90% of the business. [SECONDARY: VCCircle, FE, ET]

**Partner-bank timeline — the concentration-risk record:**

| Period | Partner | Event |
|---|---|---|
| 2015/16→ | **YES Bank** | Prepaid instruments (Benefits, Bharat, early Global) |
| 2018 | **DCB Bank** | First Niyo Global *banking* partner — debit card |
| ~2019–20 | **IDFC FIRST** | Savings account (later discontinued — [FLAG] end date) |
| **Mar 2020** | YES Bank | **RBI moratorium** — prepaid forex cards across the industry stopped working, stranding travellers abroad. Single-partner concentration risk, proven. |
| Mar 2021 | **Equitas SFB** | NiyoX launch (savings+wealth, Visa) |
| 2021–22 | **SBM Bank India** | Niyo Global debit + credit cards |
| **Jan 2023** | SBM | **RBI ordered SBM to stop ALL LRS transactions immediately** ("material supervisory concerns") — **~half of Niyo's customers** on SBM cards lost international transactions for 15 months; FY24 hit; Niyo shifted issuance to DCB |
| Apr 2024 | SBM | LRS restriction lifted (per SBM/NSE intimation); RBI separately fined SBM ₹88.7L for processing LRS anyway |
| **1 Jun 2025** | Equitas | **Exit** — NiyoX/Niyo Global stopped servicing Equitas accounts; cards lost 0% markup (reverted to 1.5–3.5%); **Niyo explicitly "does not process closures" — the account legally belongs to the bank** |
| Now | **DCB + SBM** | IPO targeted H2 2026; acquired Kanji Forex (Aug 2024) |

[PRIMARY/OFFICIAL: RBI press releases, SBM/Niyo official statements, YES Bank
T&Cs; SECONDARY: Livemint, FE, Inc42]

**The mechanics:** the partner bank is the regulated entity — customer opens a
real bank account (KYC via app), the **bank issues the Visa card**, international
spends are **LRS remittances reported by the bank** (bank enforces the $250k/FY
cap + TCS). Niyo is technology/marketing only, holds **zero custody**. Revenue
is FX-rate spread + international MDR/interchange share — "zero markup" is a
marketing frame, not a cost absence.

**Lesson:** multi-bank redundancy is survival — Niyo survived YES Bank (2020),
SBM (2023–24, 50% of book), and Equitas (2025) precisely because it ran 3–5
partners simultaneously. Each failure still hit users directly. **Minimum
viable resilience = 2+ partner banks per product.**

### 2. The Indian regulatory frame (why there's no "neobank licence")

- **No neobank licence exists.** DBU guidelines (Apr 2022) apply only to
  domestic scheduled commercial banks. Fintech paths: partner-bank, PPI/PA
  licence, or **merger** — slice merged into North East SFB (Oct 2023 RBI NOC)
  after buying ~5%; bespoke and regulator-driven. [OFFICIAL: RBI]
- **PA-PG regime:** non-bank payment aggregators need RBI authorisation (PSS
  Act); net-worth ₹15→25 Cr; **funds must sit in escrow at scheduled commercial
  banks** — PAs can't hold float; PGs are "technology providers"; **e-commerce
  marketplaces running PA activity had to hive it off into a separate
  authorised entity** (clause 3.6). Authorisation turns on "**the role of the
  intermediary in handling of funds**." [OFFICIAL: RBI Master Directions]
- **Razorpay precedent:** in-principle Jul 2022 → **final PA authorisation
  19 Dec 2023** — and was **barred from onboarding new merchants for ~17
  months** during review. A licensing bottleneck can freeze growth.
- **Jupiter/Fi** are legally the bank's "Mobile Banking Service Provider" /
  outsourcing partner (Federal Bank T&Cs) — deposits DICGC-insured ₹5L.
  **FamPay** = IDFC FIRST co-branded PPI marketer, not issuer. **Open** = ICICI
  "connected banking" → pivoted to 40-bank corporate layer.

### 3. US BaaS — Chime's ceiling and Synapse's collapse

- **Chime**: canonical sponsor-bank fintech — "not a bank; banking services by
  The Bancorp Bank / Stride Bank." **Sept 2026: Chime agreed to acquire Stride
  Bank for $590M** — CEO Britt: partner model created "redundant steps." **Even
  the biggest BaaS success concluded the model has a scale ceiling.**
  [PRIMARY: businesswire; SECONDARY: bankingdive]
- **Middleware models:** Unit (fintech contracts directly with bank), Synapse
  (middleware contracts in own name + keeps the ledger — the fatal variant),
  Stripe Treasury (partner banks embedded via Connect).
- **Railsr (2023):** FCA onboarding restriction + Bank of Lithuania restriction
  on PayrNet → administration → **sold for £414,000**; ~4M end users / ~$650M
  at risk. [SECONDARY + Gazette]
- **Synapse (2024) — the definitive cautionary tale:** Ch. 11 filed 22 Apr
  2024; >100,000 end users frozen; **~$219M frozen, ~$65–95M shortfall** —
  the middleware's ledger and the banks' FBO records **could not be
  reconciled; no one could determine where the money went**. Yotta: banks held
  $109M on 11 Apr → ledgers showed $1.4M a month later; one user with $41,543
  received **$1.49**. "FDIC insured" marketing proved meaningless — pass-through
  insurance applies on *bank* failure with *accurate records*; a middleware
  bankruptcy triggers no payout. Regulatory response: Fed cease-and-desist vs
  Evolve (Jun 2024); **FDIC rule requiring banks to maintain end-user
  beneficial-owner records + reconcile daily** (NPRM Sep 2024); CFPB judgment
  (Aug 2025) unlocking ~$118.9M victim compensation. [PRIMARY: CFPB order,
  trustee reports, FDIC, Fed; SECONDARY: CNBC, American Banker]

**Design law from Synapse:** (1) the ledger of record must sit at the regulated
entity or be reconciled daily against it; (2) pooled FBO + single middleware
ledger = catastrophic SPOF; (3) prefer models where the licensed platform
itself holds funds or the bank holds individual accounts, not omnibus pools.

### 4. Cross-border payout rails — correspondent vs local

- **SWIFT/correspondent**: messaging network; settlement through nostro chains —
  universal, slow, opaque.
- **Local rails**: provider holds pre-funded float in each market and pays via
  domestic systems (ACH/FedNow, SEPA Inst, FPS, Pix, SPEI, UPI/IMPS) —
  **money never crosses a border at payout time**.

**Licensed payout networks (one contract → 100+ countries):**

| Provider | Coverage | Licences |
|---|---|---|
| **Wise Platform** | 160+ countries, 40+ currencies; 77% <20s | **80 licences**, direct scheme access in 8 markets; clients Monzo→Morgan Stanley |
| **Airwallex** | 200+ countries, local clearing 120+ | **60+ licences**; $130B+ annualized volume |
| **Nium** | 190+ countries, 100+ currencies | **80+ licences/40+ jurisdictions** (EU/UK EMI, 30 US MTLs) — explicitly: "we provide infrastructure, not your regulatory authorization" |
| **Rapyd** | 190+ countries payouts | local acquiring UK/EU/LatAm/SG/HK/IL |
| **Thunes** | 140 countries, 220 methods | ~50 licences ("Fortress Compliance") |

### 5. Marketplace payment models — who holds funds and who owes tax

**Stripe Connect liability split:**

| | Standard | Express | Custom |
|---|---|---|---|
| Fraud/dispute liability | Connected acct (direct charges); **platform** (destination charges) | Platform | Platform |
| Onboarding/KYC | Stripe | Stripe | Platform |

With Express/Custom + destination charges the platform is effectively in the
funds flow and carries negative-balance liability. [PRIMARY: Stripe docs]

**Adyen for Platforms / Mangopay / Tipalti / Trolley:** sub-merchant onboarding
+ splits + held funds + payouts running on **Adyen's own bank licences**
(EU/UK/US — the platform never holds funds); Mangopay = EU EMI wallet-model
(escrow/holding wallets per seller — Vinted uses it); Tipalti = MTLs in every
US state + UK/EU EMI + OFAC screening + tax-form e-filing.

**Tax/reporting floor — the platform owns this regardless of structure:**
US marketplace facilitator sales-tax collection (all sales-tax states, ~$100k
nexus); EU **DAC7** seller verification + annual reporting (31 Jan) — applies
to non-EU operators too; EU VAT deemed-supplier for ≤€150 imports/non-EU
sellers; India **s.52 GST TCS 0.5%** + **s.194-O TDS 0.1%** + mandatory ECO
registration regardless of turnover. Detail and sources in
[`07-legal-machinery.md`](./07-legal-machinery.md) §7.

### 6. MoR — useful, but not for marketplaces

Merchant of Record = legal seller (double sale: seller→MoR→customer); assumes
tax/remittance, chargebacks, refunds. Pricing converged ~5%+$0.50 (Paddle,
Lemon Squeezy); **Stripe Managed Payments** ≈ +3.5% on top of processing.
**Critical limitation: MoR refuses marketplaces/C2C** — Paddle's acceptable-use
explicitly excludes third-party sellers. In C2C each seller is their own MoR;
the governing frameworks are facilitator/DAC7/deemed-supplier, and the correct
instrument is Connect/Adyen/Mangopay sub-merchant flows. [SECONDARY/OFFICIAL]

### 7. The licence map — what custody triggers

**Universal trigger: holding or moving other people's money.** Every regime
(US state MTLs — 49 states on NMLS, 2–4 years full map; EU EMI passports 27
states; India PA/PPI escrow rules; SG MPI; UAE SVF/RPSP) fires on custody, not
software. **Design rule: never hold customer funds; route through licensed
partners.**

| Jurisdiction | Licence | Efficiency |
|---|---|---|
| US | FinCEN MSB + **state MTLs** (no federal licence) | Worst — 49-state patchwork |
| EU | **EMI/PI** | Best — one authorisation passports 27/30 states |
| UK | EMI/API | Post-Brexit doesn't passport — dual licence needed |
| India | PPI / PA | Escrow with scheduled banks; marketplaces must hive off PA |
| Singapore | SPI/MPI | MPI S$250k capital, broad scope |
| UAE | SVF + RPSP (CBUAE) / FSRA / DFSA | free-zone licences for international books |

**Practical implication:** a marketplace that (a) never takes funds into its
own accounts and (b) uses licensed entities for every regulated step can serve
100+ countries with zero licences of its own — but is exposed to partner
failure, hence Synapse-style daily reconciliation + multi-partner redundancy.

### 8. Wise and Revolut — the two ladders worth copying (eventually)

- **Wise (licence-maximalist):** 80+ licences → direct scheme membership (BoE
  RTGS/FPS since Apr 2018 — first non-bank; Pix via Brazilian payment
  institution licence; Zengin — first non-bank; Australia PPF ADI). Licences
  *remove intermediaries entirely*. 2025–26: Jersey holdco (Wise Group plc) →
  primary Nasdaq listing. [OFFICIAL/PRIMARY]
- **Revolut (regulate-up ladder):** EMI (2015) → Lithuania specialised bank
  (Dec 2018, fastest passporting jurisdiction) → full ECB banking licence
  (Dec 2021, 30 EEA states) → UK bank licence w/ restrictions (Jul 2024) →
  **restrictions lifted Mar 2026** → Mexico full bank (first outside Europe,
  early 2026) → US de novo national charter application filed **10 Mar 2026**.
  Each rung removes partner-bank dependence. [PRIMARY: OCC, CNBV; SECONDARY]

**Sequence implication for ThryftVerse:** partner/rented rails now →
EMI-or-equivalent in one credible home jurisdiction when volume justifies →
local entities only where forced (India PA, US MTLs) → banking licence last.

---

## Part III — Synthesis: the payment layer is a routing table

1. **The payment layer is a routing table of entities and licensed rails, not
   one merchant account.** Entity assignment is a compliance-controlled
   deterministic function of verified residence, corroborated by IP/device/
   funding-instrument signals.
2. **Three viable postures:** licence-maximalist (Wise/IBKR), passporting-
   minimalist (Adyen — requires bank status), tiered arbitrage (Exness/XM —
   flagship licences for credibility + offshore catch-all). Binance is the
   failure mode of arbitrage-by-opacity.
3. **Compensation/protection attaches to the contracting entity, never the
   brand** — disclose per-entity, not per-brand.
4. **Partner redundancy is survival, not luxury** — Niyo's three partner
   failures and Razorpay's 17-month onboarding freeze are the price of single
   points.
5. **Custody is the licence trigger** — keep ThryftVerse out of the funds flow
   (Connect-style destination charges still put you *in* the liability flow —
   note the distinction between custody and liability).
6. **Reconcile like Synapse is watching** — any intermediary ledger touching
   balances must be independently reconciled daily; this is now literally the
   FDIC direction for FBO structures.
7. **The platform owns the tax/reporting floor no matter what** — facilitator,
   DAC7, deemed-supplier, TCS/TDS cannot be delegated to a payout vendor.

**Unverified/flagged:** Exness Uruguay entity (none found); XM Belize licence
number (conflicting values); Stratos ZA "intermediary-only" qualifier; Exness
MENA entity name; full Exness Group Holding shareholding (paywalled); exact
US–Australia CLOUD entry-into-force (see 07); IDFC FIRST wind-down date.
