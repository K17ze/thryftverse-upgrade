# ThryftVerse Co-own — Flagship Alternative-Asset Market Research and Implementation Blueprint

**Research cut-off:** 24 August 2026  
**Repository snapshot:** `ab0b99d8f8ea54c0f156fa4ae39b8c99fe6716ce`; audited against the current working tree  
**Scope:** issuer onboarding, asset admission, primary issuance, fractional ownership, secondary trading, settlement, custody, provenance, appraisal, distributions, governance, buyouts, recourse, tax records, compliance, market operations, mobile UX and service architecture  
**Status:** research and implementation blueprint; no product code was changed by this report  
**Policy:** `AGENTS.md`, `Design.md`, fail-closed trust, unknown-outcome safety and anti-AI design

> This report is product and engineering analysis, not legal advice. Before offering any real ownership or investment product, ThryftVerse needs written advice for each launch jurisdiction and a documented regulatory operating model.

---

## 0. Executive verdict

The Co-own department is not a blank prototype. It contains a wide and unusually thoughtful set of product surfaces: discovery, asset dossier, rights and risk panels, issuer verification, an order book, order preview/reservation, trade confirmation and receipt, portfolio, wallet safeguarding, buyouts, recourse, verification demands, distributions, corporate actions, voting, watchlists, alerts, recurring-order configuration and tax-document screens. The database migrations also show serious intent around idempotency, reservations, settlement, holdings, audit events, structured rights and custody evidence.

It is nevertheless **not a production market**. The current implementation is a sophisticated feature prototype whose most serious failures sit at the contract and authority layers:

1. the issuer client expects `assetId`, while the creation endpoint returns `asset.id`, so the issuance flow loses its newly created asset at runtime;
2. core asset/order/buyout mutations accept body-supplied principals without consistently binding them to the authenticated user;
3. new assets inherit `listing_tier = 'listed'`, while the intended preview-to-listed gate is not enforced by order entry;
4. no canonical issuer workflow was found for authoring and approving the rights and risk-disclosure rows required by promotion;
5. the trade ticket exposes `GFD` and `GTC90`, but duration never reaches the API or order schema;
6. price history and tax queries read `coown_executions`, a table no migration creates, while the canonical execution table is `coOwn_trades` with different columns;
7. governance voting queries non-canonical holding columns, so ownership eligibility can fail;
8. surveillance, self-trade prevention, issuer conflict controls, price bands, market halts, trade correction and operational case management are not complete enough for real money;
9. legal ownership, beneficial-interest rights, custody, insolvency treatment and transfer restrictions are not yet one enforceable, versioned asset-admission contract.

The right thesis is compelling:

> Build the trusted market for owning a legally defined economic interest in culturally meaningful, authenticated assets that are normally too expensive or operationally difficult to access.

The wrong thesis is “put collectibles on a trading app.” A flagship market is not created by candlestick charts, faster order entry or blockchain vocabulary. It is created by credible rights, controlled admission, truthful valuation, verifiable custody, deterministic settlement, orderly exits and patient liquidity.

### 0.1 Readiness scorecard

| Department | Current score | Evidence-based verdict |
|---|---:|---|
| Mobile surface breadth | 7/10 | Broad, authored components and state coverage exist |
| Information hierarchy | 6/10 | Good dossier primitives; several screens remain dense and finance-template-like |
| Issuer workflow | 2/10 | Broken create response, non-atomic onboarding, no full disclosure-authoring path |
| Rights/custody truth | 3/10 | Strong fields and panels, but evidence lifecycle and legal register are incomplete |
| Primary issuance | 3/10 | Inventory and settlement concepts exist; admission/subscription state machine does not |
| Secondary market mechanics | 4/10 | Price-time book and reservations exist; TIF, surveillance and market controls do not |
| Authentication/authorization | 2/10 | Body principal trust is a P0 money-surface defect |
| Settlement/ledger | 5/10 | Good DvP and audit intent; legal finality/reconciliation/exception operations need proof |
| Corporate actions | 3/10 | Read surfaces exist; issuer-to-payment lifecycle and voting query are incomplete |
| Compliance/market operations | 2/10 | Regulatory route, case tooling, monitoring and records are not launch-ready |
| Production readiness | 2/10 | Release must remain disabled until P0 correctness and legal gates close |

### 0.2 Final product position

Kalshi and Polymarket are useful only as examples of making a new market category legible: a clear object, a visible price, explicit settlement rules and a reason to return. They are **not** the legal, risk or interaction model for Co-own. ThryftVerse must avoid prediction-market or gambling-like psychology. The governing mental model is closer to a regulated fractional ownership venue plus custody and asset servicing.

The product should call the instrument what counsel determines it actually is: unit, beneficial interest, share, participation interest or contractual co-ownership right. “Token” may describe representation technology; it must not obscure the legal claim.

---

## 1. Research method and repository trace

The audit followed both directions:

```text
issuer intent → issuance UI → client contract → API → admission → asset register → inventory → market
buyer intent → dossier → eligibility → quote → reservation → order → match → DvP → holding → servicing → exit

database → ledger/holdings/trades → serializers → services → query cache → state → screen → route
legal right → evidence → backend row → disclosure projection → decision friction → order authorization
```

Primary current owners include:

| Area | Canonical implementation | Approx. lines | Observation |
|---|---|---:|---|
| Trade | `frontend/src/screens/TradeScreen.tsx` | 960 | Real preview/reservation flow; decorative duration control |
| Portfolio | `frontend/src/screens/PortfolioScreen.tsx` | 1,251 | Strong breadth; needs legally precise position semantics |
| Issuance | `frontend/src/screens/CreateSyndicateScreen.tsx` | 1,259 | Extensive form; broken response contract and non-atomic activation |
| Market hub | `frontend/src/screens/SyndicateHubScreen.tsx` | 1,234 | Rich shell; must avoid gamified trading pressure |
| Client API | `frontend/src/services/marketApi.ts` | 2,470 | Broad contracts; creation response mismatch proves drift |
| Backend | `backend/api/src/index.ts` | 44,944 | Money-critical Co-own logic is embedded in a risky monolith |

The audit also traced the migrations for asset/order/holding creation, idempotency, reservations, DvP settlement, ONEZE, unit caps, payment methods, rights, trust profiles, issuer verification, settlement disclosure, wallet safeguarding, listing tiers, audit events, structured rights, risk disclosures, recourse, distributions, corporate actions, watchlists and asset issues.

Line count is not a defect by itself. A 44,944-line API owner is a material operational risk when identity binding, admission, matching, ledger posting and corporate actions need separate invariants and review ownership.

---

## 2. What Co-own is—and is not

### 2.1 Required legal/economic object

Every asset must resolve five distinct objects:

1. **Physical or contractual underlying** — the bag, watch, artwork, collectible, inventory pool or other admitted asset.
2. **Legal vehicle or agreement** — SPV, trust, nominee, tenancy arrangement, contractual participation or other approved wrapper.
3. **Authoritative ownership register** — who owns how many issued units and at which legal timestamp.
4. **Economic rights** — distributions, sale proceeds, voting, inspection, buyout and residual claims.
5. **Platform representation** — the mobile position and, optionally, a DLT token mirroring the legal register.

If these diverge, the app must fail closed. A database holding is not automatically a legal ownership interest; a DLT token is not automatically the authoritative register; custody of an item is not automatically bankruptcy-remote ownership.

### 2.2 Category boundaries

Do not launch as:

- a stock exchange without the licensing, controls and disclosures of one;
- a crypto exchange merely because interests are represented digitally;
- a gambling-like rapid-trading product;
- a warehouse marketplace where the legal claim is hidden behind “units”;
- an appraisal-guaranteed product whose displayed estimate looks like a promise of liquidity;
- a perpetual internal ledger that cannot be transferred, redeemed or reconciled with the legal register.

Do launch as a tightly scoped, counsel-approved market with a small asset taxonomy, explicit rights, named service providers, conservative liquidity promises and controlled operating hours.

### 2.3 DLT decision

Do not make blockchain a P0 dependency. Begin with a double-entry cash ledger, append-only ownership journal and legally authoritative register. Add permissioned or public-chain representation only where it improves settlement, transferability, auditability or ecosystem access and the legal/regulatory route supports it.

The FCA's April 2026 tokenised-fund guidance demonstrates that DLT can operate inside an existing regulatory framework; it does not make every tokenised real-world asset unregulated. IOSCO likewise describes tokenisation as growing but nascent and highlights interoperability and credible settlement assets as scaling constraints.[^fca-ps267][^iosco-tokenisation]

---

## 3. P0 code and contract defects

These are not roadmap ideas. They are blockers to using the current system with real users or money.

### 3.1 Issuance loses the created asset ID

`frontend/src/services/marketApi.ts:1806-1819` declares the creation response as:

```ts
{ ok: true; assetId: string }
```

`frontend/src/screens/CreateSyndicateScreen.tsx:221` therefore reads `result.assetId`. The endpoint at `backend/api/src/index.ts:38009-38028` returns:

```ts
{ ok: true, asset: { id, ... } }
```

The result is `undefined` state immediately after creation. Follow-up recourse and navigation can treat a successfully created asset as missing.

**Correction:** generate a shared schema/OpenAPI contract; make the endpoint return one canonical shape; add a contract test that executes the actual client decoder. Prefer `{ ok, asset, issuance }` because issuance status must be visible. Never maintain handwritten response interfaces independently of the backend.

### 3.2 Body-supplied identity can impersonate another user

The initial Co-own asset/order/buyout endpoints parse fields such as `issuerId`, `userId`, `bidderUserId` and `holderUserId`. Some later endpoints correctly use `request.authUser`, proving an authenticated principal is available, but the core flows do not consistently bind body principal to it.

Examples include asset creation at `backend/api/src/index.ts:37754`, buyout creation around `40132`, and buyout acceptance around `40397`. Order cancellation does perform explicit authenticated-user binding, which shows the intended pattern.

**Correction:** remove acting-user IDs from private command bodies. Derive the actor exclusively from the verified access token/session. A body may identify a recipient or counterparty only where the action semantics require it, with separate authorization. Add negative tests for cross-user create, reserve, order, cancel, buyout, accept, vote, recourse and issuer actions.

### 3.3 Preview/listed admission gate is bypassable

Migration `086_coown_rights_tbc_and_listing_tier.sql` says preview should be the default, but the actual column default is `listed`. Asset creation does not explicitly override it. Promotion checks rights/recourse, yet order preview and placement chiefly gate on openness and do not make `listing_tier`, disclosure publication and admission approval an authoritative precondition.

No complete issuer write/publish API was found for the structured rights and risk-disclosure rows the promotion gate expects. The app can therefore create an asset it cannot correctly prepare, while the database can place it in a tradable tier by default.

**Correction:** default every new instrument to `draft`; make database and service guards independently reject subscription/trading until `admission_status = active`; require a signed, versioned disclosure bundle and operator approval. `is_open` must be derived from market session + admission + halt + servicing state, not a free-standing truth flag.

### 3.4 Order duration is decorative

`CoOwnTradeComposer.tsx` and `TradeScreen.tsx` expose `GFD` and `GTC90`. The preview/reserve command built in `TradeScreen.tsx` contains no duration, and backend schemas contain no time-in-force or expiry semantics. Users are shown an order instruction that the market does not honor.

**Correction:** remove the control immediately or implement `timeInForce` end to end. Recommended initial set: `IOC` for marketable thin-book orders and `DAY` for resting limits. Add `GTC` only after order-expiry workers, cancellation notices, corporate-action invalidation and stale-price safeguards are operational. “90 days” must be a real `expires_at`, not copy.

### 3.5 Price history and tax read a table that does not exist

Price-history and tax endpoints around `backend/api/src/index.ts:13624-14065` query `coown_executions` with `price_gbp_minor`, `buyer_user_id`, `seller_user_id` and `executed_at`. No migration creates that table. Canonical settlement writes `coOwn_trades`, whose schema uses different names such as `buyer_id`, `seller_id`, `unit_price_gbp` and `created_at`.

**Correction:** establish one execution source of truth. Migrate or rewrite the consumers, then add database integration tests from trade settlement through chart/tax projection. Tax documents need lot accounting, fees, currency, corrections, cancellations and jurisdiction-specific policy—not just aggregate buys and sells.

### 3.6 Governance eligibility reads the wrong holding columns

The vote route near `backend/api/src/index.ts:13768` sums `units` for `holder_user_id`. Canonical holdings use `units_owned` and `user_id`. The route can reject a legitimate holder or fail at query time.

**Correction:** bind voting power to an immutable record date/snapshot, not the user's current live holding at vote time. The corporate action must identify asset, record time, eligible supply, quorum, threshold and rounding policy. Persist the snapshot hash and each ballot's evidenced voting power.

### 3.7 Issuance is not one atomic state machine

`CreateSyndicateScreen` creates the asset and subsequently signs recourse. If the second step fails, the system can leave a partially configured instrument and a paused underlying listing. Retries have no issuance-level idempotency contract.

**Correction:** use one `issuance_application` aggregate with idempotent commands and explicit states. Do not create live market inventory from a mobile form submission.

```text
draft
→ evidence_pending
→ diligence_in_review
→ changes_requested
→ legal_ready
→ funding_preview
→ subscription_open
→ funded | failed
→ secondary_market_eligible
→ active
→ suspended | winding_down
→ redeemed
```

Each transition requires a policy decision and audit event. Mobile navigation reflects state; it does not manufacture it.

---

## 4. Current strengths to preserve

The upgrade should not discard the work that is already directionally strong:

- idempotency and reservation migrations show the correct concern for duplicate money commands;
- settlement code attempts coupled cash, fee, holding and trade updates;
- unknown-outcome UI and reconciliation components exist;
- trust, rights, risk, recourse and custody are visible product concepts rather than hidden legal links;
- issuer verification and audit-event tables create a base for evidenced trust;
- buyout offers recognize that thin-market assets need exits beyond an order book;
- distribution and corporate-action surfaces acknowledge ongoing asset servicing;
- the mobile components include skeleton, offline, receipt and reconciliation treatments;
- production mock use is gated rather than silently treated as live data.

The target is to turn these from parallel features into one lifecycle contract.

---

## 5. Required end-to-end market lifecycle

### 5.1 Admission and issuance

```text
issuer identity and authority
→ underlying eligibility
→ title/provenance/authenticity evidence
→ custody intake and condition report
→ independent valuation with date/method/conflicts
→ legal wrapper and rights schedule
→ fees, conflicts and risk disclosure
→ operator/compliance approval
→ subscription document and funding target
→ safeguarded funds reservation
→ close/fail allocation
→ authoritative register issuance
→ secondary-market eligibility decision
```

### 5.2 Ownership and trading

```text
asset dossier
→ user eligibility/appropriateness
→ side-specific quote and depth
→ fee + slippage + liquidity disclosure
→ reservation
→ authenticated idempotent order
→ surveillance checks
→ deterministic match
→ DvP and legal-register update
→ contract note/receipt
→ portfolio, tax lots and notifications
```

### 5.3 Servicing and exit

```text
custody and appraisal refresh
→ income/expense event
→ disclosure/corporate action
→ record-date entitlement snapshot
→ vote/consent where required
→ distribution or capital call
→ buyout/redemption/underlying sale
→ final proceeds and tax records
→ register close and archival retention
```

Every arrow needs a durable command, policy check, audit record, retry behavior and operational owner.

---

## 6. Party-by-party product completeness

### 6.1 Issuer/seller side

An issuer needs more than a long form. The flagship workflow is an evidence workspace:

| Need | Current direction | Required upgrade |
|---|---|---|
| Eligibility | Underlying listing and issuer ID exist | Asset-class admission rules, sanctions/source-of-funds checks, authority evidence |
| Legal wrapper | Vehicle fields exist | Counsel-approved templates, executed documents, versioning and immutable evidence receipts |
| Provenance/authenticity | Trust fields exist | Evidence uploads, expert identity, chain of custody, conflicts, expiry/reverification |
| Valuation | Value/date/valuer fields exist | Method, range, assumptions, comparable evidence, fees, conflicts and independent approval |
| Rights | Structured read model exists | Issuer authoring, legal review, versioned publication, investor acceptance and change control |
| Risks | Disclosure table exists | Asset-specific authoring, approval, comprehension checkpoints and immutable accepted version |
| Economics | Unit count/price exist | Cap table preview, dilution policy, reserve/soft cap, fee waterfall, issuer proceeds and expenses |
| Launch | Create + recourse steps exist | Atomic application, operator approval, staged subscription and allocation |
| Servicing | Some corporate-action reads exist | Issuer operations for distributions, expenses, votes, appraisal/custody updates and incidents |
| Exit | Buyout/recourse exist | Sale mandate, reserve policy, conflict handling, tender/vote, settlement and wind-down |

The mobile issuer dashboard should answer: **what is blocked, who owns the next action, what evidence is expiring, and what holders must be told?** It should not look like a generic seven-step wizard after submission.

### 6.2 Buyer side

The buyer needs a decision surface, not a hype feed:

- legal claim in one sentence, with expandable exact rights;
- named custodian, location, insurance scope and evidence freshness;
- appraisal range, method, date and conflict disclosure—not a single authoritative-looking price;
- market price vs latest valuation vs net asset estimate clearly separated;
- circulating/treasury/locked supply and holder concentration;
- depth, spread, recent genuine executions and a “may not sell quickly” treatment;
- total fees in pounds and percentage before confirmation;
- expected settlement and when legal ownership changes;
- distribution history, expenses, arrears and next record date;
- transfer restrictions, eligibility, tax caveats and wind-down policy;
- downside and no-liquidity scenarios using plain amounts;
- explicit acknowledgement of the current disclosure version.

Never display unverified custody, insurance, appraisal, issuer status or buyer protection as a default badge. Null means no render; pending means pending; expired means an action and a restriction.

### 6.3 Current holder/seller side

A holder needs:

- available, reserved, pending-settlement and locked units separated;
- cost basis, realised/unrealised result and fees with calculation policy;
- sellable depth and price-impact scenarios;
- truthful order state, queue time and expiry;
- transfer restrictions and reasons;
- corporate-action inbox and record-date eligibility;
- buyout/tender choices with remaining time and consequences;
- distribution ledger and tax documents;
- incident/verification/recourse actions;
- exit alternatives if the secondary book has no bid.

The screen must never imply “cash balance” before settlement finality or “ownership” before the legal register update succeeds.

### 6.4 Operator, custodian, appraiser and compliance

A market cannot be operated from consumer screens. Build separate least-privilege workspaces for:

- admission review and four-eyes approval;
- custody intake, movement, inspection, insurance and incident evidence;
- appraisal assignment, independence/conflict declaration and approval;
- disclosure/legal-document review and version publication;
- payment and ownership reconciliation;
- market surveillance, alerts, cases, sanctions and decisions;
- halts, resumptions, trade corrections and participant restrictions;
- corporate-action setup, approval, entitlement generation and payment release;
- complaints, vulnerable-customer support, data requests and audit export.

No operator should directly edit balances or holdings. Corrections are compensating journal entries with reason, approver and evidence.

---

## 7. Regulatory and operating-model gate

### 7.1 Decide the instrument before designing the market

For each asset class and jurisdiction, counsel must answer:

1. What legal instrument does one unit represent?
2. Is it a specified investment, transferable security, collective investment interest, cryptoasset, contractual co-ownership right or something else?
3. Who is issuer, operator, custodian, registrar, venue, broker/arranger and payment service provider?
4. Which activities require authorization, exemptions, appointed representatives or regulated partners?
5. Can retail clients participate? Under what categorisation, appropriateness, promotion and disclosure requirements?
6. Can interests be transferred off-platform? Who remains the legal registrar?
7. What insolvency remoteness exists if ThryftVerse, issuer, custodian or payment partner fails?
8. How are client money/assets safeguarded and reconciled?
9. Which market-abuse, transaction-reporting, tax and record-retention rules apply?
10. What happens to the underlying and investor records during wind-down?

The 2026 UK rules distinguish tokenised specified investments from other cryptoassets; digital representation does not erase the underlying perimeter. The UK Digital Securities Sandbox is a live regulated route for testing issuance, trading and settlement—not a permissionless production shortcut.[^fca-ps267][^fca-tokenisation-vision]

### 7.2 Geographic launch recommendation

Do not implement a global `countryEnabled` boolean. Use policy-as-data:

```text
jurisdiction
× customer category
× instrument class
× activity (view / subscribe / buy / sell / transfer / vote)
× distribution channel
× provider/permission coverage
× effective date
```

The authorization service returns an evidenced decision with policy version and reasons. UI consumes the decision; it does not recreate regulatory logic.

### 7.3 Product friction is a feature

FCA good-practice material emphasizes clear risk warnings, cooling-off where applicable, categorisation, appropriateness, record keeping and asset due diligence. Those rules may not map identically to the final legal classification, but they establish an excellent product baseline for a risky novel market.[^fca-backend-promotions]

Build:

- a calm eligibility journey before the first direct offer;
- asset-specific knowledge checks that assess, not coach;
- a personalized warning using real user/position amounts;
- a review screen that explains fees, illiquidity and loss scenarios;
- a second confirmation only when it adds comprehension, not ritual;
- accessible receipts and a permanent disclosure archive.

Avoid bonuses, confetti, streaks, urgency copy, “top trader” rankings, loss-chasing prompts and price-flash animation. FCA research with more than 9,000 participants found that push notifications and prize mechanics increased trading and risk-taking; these patterns are inconsistent with ThryftVerse's desired trust position.[^fca-dep]

---

## 8. Target domain and data architecture

### 8.1 Aggregates

Split the market into explicit aggregates instead of continuing to expand one endpoint monolith:

```text
Admission        IssuanceApplication, EvidenceItem, ReviewDecision
Instrument       Instrument, RightsVersion, DisclosureVersion, SupplyEvent
Custody          CustodyAccount, CustodyEvent, ConditionReport, InsuranceEvidence
Valuation        ValuationReport, ValuerMandate, ComparableEvidence
PrimaryMarket    Offering, Subscription, Allocation, FundingReservation
SecondaryMarket  Order, Execution, MarketSession, Halt, TradeCorrection
Ledger           CashAccount, OwnershipAccount, JournalEntry, Settlement
Servicing        CorporateAction, Entitlement, Ballot, Distribution, TaxLot
Compliance       EligibilityDecision, AppropriatenessAttempt, SurveillanceAlert, Case
Operations       ReconciliationRun, Exception, ProviderIncident, WindDownPlan
```

### 8.2 Authoritative tables

Minimum target additions/refactors:

```sql
issuance_applications(
  id, issuer_user_id, underlying_listing_id, instrument_class,
  status, jurisdiction_policy_version, idempotency_key,
  revision, submitted_at, approved_at, rejected_at
)

instrument_versions(
  instrument_id, version, legal_name, legal_vehicle_id,
  total_authorised_units, issued_units, unit_precision,
  rights_version_id, disclosure_version_id,
  effective_at, superseded_at, document_hash
)

evidence_items(
  id, subject_type, subject_id, evidence_type, media_asset_id,
  issuer, issued_at, expires_at, verification_status,
  verified_by, verified_at, content_hash, rejection_reason
)

market_admission(
  instrument_id, status, venue_policy_version,
  primary_enabled, secondary_enabled, transfer_enabled,
  halt_reason, approved_by, approved_at
)

orders(
  id, instrument_id, owner_user_id, side, order_type, time_in_force,
  limit_price_minor, original_units, remaining_units,
  status, sequence_no, idempotency_key, expires_at,
  eligibility_decision_id, created_at, closed_at
)

executions(
  id, instrument_id, buy_order_id, sell_order_id,
  buyer_user_id, seller_user_id, units, price_minor, fee_minor,
  match_sequence_no, status, executed_at, corrected_by_execution_id
)

ownership_journal(
  id, instrument_id, account_id, direction, units,
  source_type, source_id, effective_at, legal_finality_at,
  idempotency_key, sequence_no, reversal_of
)

entitlement_snapshots(
  id, corporate_action_id, instrument_id, record_at,
  eligible_supply, snapshot_hash, status, approved_at
)
```

Use integer minor currency units and an explicit unit precision. Never mix floating GBP values with minor-unit tax or chart calculations. Every versioned document stores a content hash and effective window.

### 8.3 Invariants enforced in the database and domain service

- issued units equal balances plus treasury/locked/reserved partitions;
- no account balance becomes negative;
- a trade cannot settle without reserved cash and reserved units;
- each idempotency key maps to one canonical result and payload hash;
- an inactive/suspended instrument rejects new orders at multiple layers;
- self-trades are prohibited or handled under a documented prevention policy;
- price and quantity conform to instrument tick/lot rules;
- expired disclosures/evidence can automatically restrict admission;
- rights changes create a new version and cannot mutate holder history;
- entitlement snapshots are immutable after approval;
- corrections reverse and replace; they never rewrite journal history;
- every trust claim references approved, unexpired evidence.

### 8.4 API command model

Use commands rather than broad CRUD mutations:

```text
POST /issuance-applications
POST /issuance-applications/:id/evidence
POST /issuance-applications/:id/submit
POST /issuance-applications/:id/reviews
POST /issuance-applications/:id/approve

POST /offerings/:id/open
POST /offerings/:id/subscriptions/preview
POST /offerings/:id/subscriptions
POST /offerings/:id/close
POST /offerings/:id/allocate

POST /instruments/:id/orders/preview
POST /instruments/:id/orders/reservations
POST /instruments/:id/orders
POST /orders/:id/cancel
POST /orders/:id/replace

POST /corporate-actions
POST /corporate-actions/:id/approve
POST /corporate-actions/:id/snapshot
POST /corporate-actions/:id/pay

POST /operations/markets/:id/halt
POST /operations/markets/:id/resume
POST /operations/executions/:id/correct
```

All money, ownership, issuance and corporate-action commands require authentication, authorization, idempotency, optimistic concurrency where relevant, audit context and an unknown-outcome query endpoint.

---

## 9. Primary issuance design

### 9.1 Do not mix asset admission and instant listing

The issuer first creates an application, not an asset available for trade. Operator approval materializes a versioned instrument. Opening an offering is a separate approved action. Enabling secondary transfers is another decision after issuance and any required seasoning/settlement.

### 9.2 Offering mechanics

Define per offering:

- hard cap, optional soft cap and minimum subscription;
- opening/closing times and extension/cancellation policy;
- fixed price, auction or bookbuild method;
- over-subscription allocation rule;
- issuer retention/lock-up;
- fees and expenses;
- payment reservation/collection timing;
- failure/refund policy;
- cooling-off/withdrawal rule where applicable;
- legal issuance and ownership finality timestamp.

Do not create holdings when the user taps “invest.” Create a subscription and reserve safeguarded funds. Allocate once. Then atomically journal cash, fees, issuer proceeds and ownership when the offering closes successfully.

### 9.3 Asset taxonomy

Start with one or two asset classes that can share legal, custody and valuation operations. A luxury bag, artwork, wine case and revenue-share contract do not have the same storage, decay, insurance, valuation, cash-flow or transfer risks.

Each asset-class policy defines required evidence, appraisal freshness, inspection frequency, custody constraints, insurance minimums, eligible jurisdictions, maximum offering size, transfer rules and exit method.

---

## 10. Secondary-market microstructure

### 10.1 Initial market model

For illiquid alternative assets, continuous stock-like trading can manufacture a false sense of liquidity. Recommended launch progression:

1. **Periodic call auction** at scheduled times for price discovery and concentrated liquidity.
2. **Request for quote / bulletin interest** for very thin assets, if the operator or approved liquidity providers can respond truthfully.
3. **Continuous limit order book** only for instruments meeting depth, holder count, concentration and operational thresholds.

The user sees the actual session model: “Next matching window Tuesday 16:00,” not a dormant live chart.

### 10.2 Required controls

- deterministic price-time or auction allocation with a monotonic sequence;
- real time-in-force and expiry workers;
- cancel/replace with reserved-balance updates;
- self-trade prevention by person/account/beneficial owner;
- wash/manipulation and issuer-affiliate surveillance;
- per-instrument tick size, lot size, price collar and max order/position policy;
- volatility/operational halts and controlled reopening;
- stale appraisal and stale market-data warnings;
- fat-finger review thresholds;
- trade correction/bust workflow;
- market data sequence, freshness and recovery;
- participant restriction and sanctions controls;
- immutable order/execution/audit retention.

Kalshi's regulated venue status and public materials are useful here only for the operational lesson: a market needs impartial access rules, real-time monitoring, suspicious-behavior detection and enforceable manipulation controls. A novel UI is not a market-control system.[^cftc-kalshi][^cftc-surveillance]

### 10.3 Liquidity without deception

Build a liquidity quality score from evidenced inputs:

- executable bid/ask depth at defined price bands;
- spread;
- distinct beneficial owners;
- order concentration;
- execution frequency;
- cancellation ratio;
- age of last genuine execution;
- estimated time/discount to exit;
- market-maker dependency.

Use it to set the market model and warnings, not as a shiny badge. Never show `+12%` from one tiny affiliate trade as if it were robust asset performance.

---

## 11. Settlement, custody and reconciliation

### 11.1 Delivery versus payment

The current reservation and settlement direction is sound, but “DvP” is not just a transaction block. Define:

- what cash claim is reserved and who safeguards it;
- what ownership interest is reserved and which register is authoritative;
- the exact event that creates legal finality;
- what happens if payment provider, register or notification succeeds while another times out;
- which party bears loss during an exception;
- how reversals/corrections work without rewriting history;
- how clients withdraw cash or transfer interests during provider outage/wind-down.

BIS 2025–2026 work highlights atomic DvP, credible settlement money, interoperability, robust governance and legal finality as core benefits and conditions of tokenised systems. ONEZE or any internal balance is not a credible settlement asset merely because it has a token-like name.[^bis-2025][^bis-2026]

### 11.2 Three-way daily reconciliation

At minimum reconcile:

```text
payment/safeguarding provider cash
↔ internal double-entry cash ledger
↔ client available/reserved/pending projections

custodian/registrar ownership record
↔ append-only ownership journal
↔ aggregate holdings projection

issued supply
↔ holder + treasury + locked + reserved units
```

Reconciliation produces signed run records, break items, severity, assignee, age, evidence and resolution. A break can automatically restrict withdrawals, trading or the affected instrument according to policy. Operators need a dashboard and pager; users need a truthful incident state.

### 11.3 Custody evidence lifecycle

Custody fields are insufficient without events:

```text
intake → authenticated → condition captured → sealed/stored
→ periodic inspection → movement/loan/maintenance
→ incident/claim → sale/release → archive
```

Each event records custodian actor, timestamp, location, evidence hashes, before/after condition, approvals and insurer notification where relevant. Public users receive a privacy-safe projection and evidence freshness, not warehouse secrets.

### 11.4 Valuation truth

Store valuation as a report, not overwriteable asset metadata:

- point estimate and defensible range;
- currency and valuation date;
- method and assumptions;
- comparable/reference evidence;
- condition basis;
- liquidity/forced-sale qualification;
- appraiser identity, credential and conflict statement;
- reviewer and approval;
- expiry/supersession;
- content hash and document receipt.

The product always separates appraisal, last execution, best bid/ask and issuer offering price.

---

## 12. Corporate actions, distributions, governance and tax

### 12.1 Corporate-action state machine

```text
draft → evidence_attached → approved → announced
→ record_date_locked → entitlements_generated
→ election/vote_open → election/vote_closed
→ payable/executable → settled
→ reconciled → archived
```

Corrections create a linked amended event. Announcement and user notifications reference the same version.

### 12.2 Distributions

An operator needs to ingest underlying income/sale proceeds, expenses, tax withholding and reserve deductions. Generate entitlements from the approved record-date snapshot, pay through the ledger with idempotency, reconcile the provider and issue a statement. DRIP enrollment alone is not DRIP: an execution worker must perform a legally permitted reinvestment, price it, allocate units, handle residual cash and produce records.

### 12.3 Governance

Voting must define:

- which decisions holders control versus issuer/operator/custodian;
- record date and immutable voting-power snapshot;
- quorum, threshold, abstention and rounding;
- conflicts and related-party exclusions;
- revocation/change policy;
- result certification and challenge period;
- action required after passage.

Do not market governance as ownership if all important decisions remain unilateral.

### 12.4 Tax records

Build a tax-lot engine before promising tax documents:

- acquisition lots and allocations;
- fees added/deducted by jurisdiction policy;
- disposals and elected cost-basis method;
- distributions by character;
- withholding;
- transfers, gifts, corrections and buyouts;
- original currency and FX source;
- immutable contract notes and annual statements.

The app should state jurisdiction and tax-year coverage. “Tax summary” is not “official tax form.”

---

## 13. Mobile UX, psychology and anti-AI design

### 13.1 Product silhouette

Co-own should feel like a calm ownership dossier with a market attached, not a crypto exchange reskinned with luxury images.

First viewport of an asset:

```text
dominant underlying media
identity + current market state
one truthful value relationship (not four competing percentages)
one primary action appropriate to eligibility/session
rights/custody/liquidity summary beginning below
```

Do not place trust, risk, issuer, rights, fees, custody and appraisal into seven equal rounded cards. Use flat sections, hairlines, strong typography and progressive disclosure. Real evidence and media are the visual color.

### 13.2 Decision architecture

The decision order is:

1. What exactly do I own?
2. Who holds the underlying and can I verify it?
3. What can change my rights or value?
4. How was this price/valuation formed?
5. Can I exit, when, and at what likely cost?
6. What will I pay now and later?
7. What happens if issuer/platform/custodian fails?
8. Am I eligible and is this appropriate for me?
9. Only then: buy/sell instruction.

This order reduces ambiguity before it introduces action.

### 13.3 Motion and feedback

- no confetti or celebratory haptics after an investment/trade;
- no flashing green/red full surfaces;
- price changes crossfade or tick once and remain screen-reader understandable;
- order status motion expresses a real transition: reserved, received, partial, filled, settled;
- unknown outcome uses warning treatment and “Check result,” never a success tick;
- Reduce Motion removes spatial travel without hiding state;
- pushes are service/decision notifications, not “this asset is moving—trade now.”

### 13.4 State completeness

Every Co-own surface needs loading, populated, empty, filtered-empty, offline, stale, partial, permission/eligibility denied, suspended instrument, market closed, halted, submitting, unknown outcome, settled, corrected and provider-incident states where relevant.

Skeletons must match final geometry. A stale appraisal is not silently hidden: show the date, why it matters and whether trading is restricted. A thin book is not an empty generic card: explain the session/RFQ/exit mechanism.

### 13.5 Accessibility

- 44pt hit areas with transparent ordinary icon targets;
- no color-only profit/loss or order-side meaning;
- announce price with currency, direction and timestamp—not raw abbreviations;
- order book has a linear accessible summary and not chart-only depth;
- large text preserves price, quantity, fee and action separation;
- every swipe/drag/chart exploration has a tap or list alternative;
- confirmation screen order follows the economic decision order;
- PDFs/disclosures have accessible HTML equivalents where possible.

---

## 14. Service architecture and stack plan

### 14.1 Extract the money domain from the 44,944-line API owner

Do not jump directly to many network microservices. First build modular boundaries in one deployable service with database transactions intact:

```text
modules/coown/
  admission/
  instruments/
  issuance/
  order-entry/
  matching/
  settlement/
  ownership-ledger/
  custody/
  valuation/
  servicing/
  compliance/
  operations/
  projections/
```

Each module has schemas, commands, policies, repositories and tests. HTTP handlers adapt transport only. After load, regulatory and team boundaries become clear, matching/market-data and surveillance can split into dedicated services.

### 14.2 Recommended additions

| Need | Recommendation | Reason |
|---|---|---|
| API contracts | OpenAPI/JSON Schema generated from a canonical typed schema | Prevent the current `assetId` vs `asset.id` drift |
| Durable workflows | Temporal or equivalent durable workflow engine | Issuance, corporate actions, reconciliation and provider callbacks span hours/days |
| Event transport | Transactional outbox first; Kafka/Redpanda when scale requires | Avoid dual-write loss; replay projections and surveillance |
| Database | PostgreSQL with serializable/locked money operations | Strong constraints and auditability; already aligned with the repo |
| Cache | Redis only for ephemeral locks/rate/session/market views | Never make it the ownership or cash source of truth |
| Object evidence | Versioned encrypted object storage + content hashes | Legal, custody, appraisal and statement evidence |
| Identity/KYC | Regulated provider adapters behind one case model | Avoid provider-specific truth leaking into product semantics |
| Payments/safeguarding | Licensed provider/partner with webhook reconciliation | Internal balances alone are insufficient |
| Observability | OpenTelemetry traces, metrics, immutable audit sink | Correlate order → execution → settlement → notification |
| Analytics | Privacy-separated warehouse/read model | Product analytics must not query money tables directly |
| Market surveillance | Rules engine + case tooling; specialized vendor when regulated scale justifies | Real-time and post-trade manipulation monitoring |

### 14.3 When Rust/Go is justified

TypeScript is sufficient for admission, dossier, workflow and low-throughput transactional commands when engineered carefully. A Rust or Go matching/market-data service becomes justified when deterministic sequencing, sustained throughput, latency isolation and independent operational certification are real requirements. A language rewrite does not solve authorization, legal finality or bad schema contracts.

### 14.4 Security

- derive principals from verified access tokens; do not accept authority from bodies;
- ABAC for instrument/jurisdiction/role plus least privilege;
- four-eyes approval for admission, halts, evidence approval and trade correction;
- hardware-backed/operator phishing-resistant MFA;
- encryption and field-level protection for sensitive identity/evidence;
- signed provider webhooks with replay protection;
- secret rotation and isolated production roles;
- rate/abuse controls on order entry and account recovery;
- immutable security and market audit trails;
- dependency/SBOM/scanning and tested backup restoration;
- insider-dealing controls, staff account restrictions and surveillance.

---

## 15. Market integrity and operations

### 15.1 Surveillance scenarios

At launch monitor at least:

- self-trading and common-beneficial-owner crosses;
- wash cycles and rapid reversals;
- marking the close/last price;
- spoofing/layering and high cancel ratios;
- issuer/affiliate activity around appraisal, disclosure or buyout events;
- concentrated accounts controlling both sides;
- account takeover/order anomalies;
- suspicious funding/withdrawal patterns;
- trading while in possession of restricted non-public asset information.

Alerts create cases with evidence, investigator actions, disposition and review. Automated flags must not automatically accuse or block without policy; high-risk rules can pause and escalate.

### 15.2 Market rulebook

Publish a versioned rulebook covering participant access, orders, matching, cancellations, corrections, halts, prohibited conduct, surveillance, fees, complaints, conflicts, defaults, custody, servicing, wind-down and rule changes. The app links the effective version accepted for each action.

### 15.3 SLOs and operational measures

Track:

- accepted order latency and reject reasons;
- duplicate/idempotency conflict rate;
- reservation leaks and expiry lag;
- match-to-settlement time;
- unknown-outcome rate and resolution time;
- cash/ownership reconciliation breaks and age;
- market-data sequence gaps/staleness;
- custody/appraisal evidence expiry;
- corporate-action entitlement/payment exceptions;
- surveillance alert/case SLA;
- complaints and vulnerable-customer outcomes;
- withdrawal/transfer completion and failures.

Business metrics never override safety. Volume is not a quality metric if generated by manipulative UX or affiliate/self trades.

---

## 16. Prioritized implementation roadmap

### Phase 0 — stop-ship truth lockdown (P0)

1. Feature-flag all real-money/real-ownership Co-own commands off in production.
2. Fix the asset creation response contract with shared schema generation and integration test.
3. Bind every Co-own mutation to `request.authUser`; add object-level authorization tests.
4. Change new instruments to `draft`; enforce admission at DB/domain/API/order-entry layers.
5. Remove GFD/GTC90 UI or implement real TIF and expiry.
6. Replace `coown_executions` consumers with the canonical execution model.
7. Fix governance holding columns and introduce record-date snapshots.
8. Add one issuance-level idempotent state machine; creation is not activation.
9. Inventory every route/query/migration contract and run against a migrated database.

**Exit:** no principal can be spoofed, no draft can trade, no visible instruction is ignored, and all live endpoints execute on the canonical schema.

### Phase 1 — legal, evidence and admission foundation (P0/P1)

1. Obtain jurisdiction/instrument legal classification and operating-partner design.
2. Build issuance application/evidence/review aggregates.
3. Build rights/disclosure authoring, approval, version acceptance and expiry.
4. Build custody and appraisal evidence lifecycles.
5. Implement policy-as-data eligibility and asset admission.
6. Build operator workspaces and four-eyes controls.

**Exit:** every visible trust/ownership statement is backed by an approved current record and the launch perimeter is documented.

### Phase 2 — primary market (P1)

1. Offering and subscription state machine.
2. Safeguarded funding reservation and unknown-outcome recovery.
3. Minimum/maximum/oversubscription/allocation policy.
4. Atomic issuance into authoritative register and ledger.
5. Contract notes, statements, withdrawal/refund and failed-offering flow.

**Exit:** one end-to-end issuance can be reconciled from provider cash through legal ownership.

### Phase 3 — controlled secondary market (P1/P2)

1. Choose periodic auction/RFQ/continuous model by liquidity policy.
2. Canonical order/execution schemas, sequencing, TIF and cancel/replace.
3. Self-trade prevention, limits, collars, halts and reopen.
4. Surveillance and case operations.
5. DvP, corrections, contract notes and market-data recovery.

**Exit:** the venue operates orderly sessions and survives failure injection without inventing balances or outcomes.

### Phase 4 — servicing and mature ownership (P2)

1. Corporate-action authoring and approval.
2. Immutable record-date snapshots, elections/votes and certification.
3. Distribution/expense/withholding/DRIP execution.
4. Tax lots and statements.
5. Buyout, sale, redemption and wind-down.

**Exit:** ownership remains correct and useful after the purchase moment.

### Phase 5 — flagship product convergence (P2)

1. Rewrite dossier and trade hierarchy around claim/custody/liquidity/fees.
2. Remove equal-card finance-dashboard composition.
3. Complete all stale/offline/halt/partial/unknown/corrected states.
4. Accessibility, large-text and screen-reader closure.
5. Physical-device EAS audit and quantitative performance budgets.

**Exit:** visual quality is calm, authored and truthful; native behavior matches the market contract.

### Phase 6 — optional DLT/interoperability (P3)

1. Define the legal authoritative register and token/register reconciliation.
2. Enter the appropriate sandbox/regulated-partner route where useful.
3. Add allowlisted transfer, corporate-action and recovery controls.
4. Prove DvP/legal finality and operational wind-down.

**Exit:** DLT removes a measured operational constraint rather than adding speculative branding.

---

## 17. Acceptance gates and evaluation program

### 17.1 Contract and authorization

- client/server schemas generated from one source;
- every mutation tested with missing auth, wrong user, wrong role, wrong instrument and replay;
- no body field can grant authority;
- schema compatibility tested against a fully migrated database;
- no endpoint references nonexistent tables/columns.

### 17.2 Money and ownership

- property-based tests preserve cash and unit invariants;
- concurrent order/reservation/cancel/fill tests;
- duplicate webhook/command tests;
- process kill at every settlement boundary;
- provider timeout before/after commit produces unknown outcome, never fake success;
- reconciliation detects every injected cash, holding and supply break;
- correction/reversal leaves immutable trace.

### 17.3 Market integrity

- self-trade, wash, spoof/layer, marking and affiliate-event scenarios;
- order sequencing determinism;
- halt/reopen and stale market-data behavior;
- auction tie/allocation rules;
- case evidence completeness and operator permissions.

### 17.4 Legal/product truth

- each badge/claim traces to evidence and version;
- expired/revoked evidence fails closed;
- disclosure version accepted is reconstructable for every order;
- ownership and insolvency language approved by counsel;
- wind-down rehearsal can return cash/records and preserve holder claims.

### 17.5 Mobile/native

- EAS builds on physical iOS/Android low/mid/high devices;
- 2.0 font scale, screen readers, Reduce Motion and high contrast;
- slow/offline/interrupted network, process death and low storage;
- chart/order-book performance with production-scale data;
- no sticky bar occlusion or oversized empty filter sheets;
- thumbnail and squint tests against supplied references and the anti-AI charter.

### 17.6 Launch criteria

Do not label the market production-ready until:

- P0 code defects are closed and integration-tested;
- legal/regulatory operating model and partners are approved;
- admission and evidence lifecycle is live;
- safeguarded cash and authoritative ownership reconcile;
- one primary issue and one full exit are run in a controlled pilot;
- market surveillance and incident operations are staffed;
- native and accessibility audits pass;
- independent security, financial-control and legal reviews close critical findings.

---

## 18. Research synthesis

### 18.1 What current institutional research changes

- **FCA PS26/7 (April 2026):** tokenisation can modernize funds inside existing rules and with an authoritative unitholder register; technology does not replace governance.[^fca-ps267]
- **FCA/Bank UK vision (2026):** the Digital Securities Sandbox is the controlled route for live testing of issuance, trading and settlement; use regulatory infrastructure rather than improvising it.[^fca-tokenisation-vision]
- **IOSCO (November 2025):** adoption remains nascent; interoperability and credible settlement assets constrain scale, while investor protection and market integrity remain central.[^iosco-tokenisation]
- **BIS (2025–2026):** tokenisation's strongest case is contingent/atomic execution such as DvP, with sound money, governance, interoperability and legal finality.[^bis-2025][^bis-2026]
- **ESMA (June 2025):** DLT market infrastructure still requires exemptions, compensatory measures and risk-based thresholds; pilot regimes protect market integrity, not bypass it.[^esma-dlt]
- **FINRA (June 2025):** fractional access brings limitations in transferability, order handling, hours and voting; Co-own must explain its own exact limitations rather than borrow “fractional shares” familiarity.[^finra-fractional]
- **FCA behavioral research (updated June 2026):** engagement mechanics can increase frequency and risk, especially for vulnerable cohorts; anti-gamification is a safety requirement.[^fca-dep]

### 18.2 Flagship benchmark

Flagship quality is reached when a holder can answer, from backend evidence rather than marketing copy:

> What do I legally own? Who holds the underlying? How was it valued? What can change? Can I sell? What will it cost? When is settlement final? What happens if a party fails?

And the operator can answer:

> Who was authorized? Which policy and disclosure version applied? Which orders matched? Where are cash, units and the underlying? Which exception or suspicious behavior requires action?

Until both answers are deterministic and reconstructable, more charts, tokens, animations or asset categories increase risk faster than quality.

---

## 19. Primary sources

All sources were checked against material available on 24 August 2026. Product/legal implementation requires jurisdiction-specific professional advice and current rulebooks.

[^fca-ps267]: UK Financial Conduct Authority, [PS26/7: Progressing fund tokenisation](https://www.fca.org.uk/publications/policy-statements/ps26-7-progressing-fund-tokenisation), 30 April 2026.
[^fca-tokenisation-vision]: UK Financial Conduct Authority, [The future of tokenisation — a joint vision from the authorities for UK wholesale markets](https://www.fca.org.uk/publications/calls-input/future-tokenisation-joint-vision-authorities-uk-wholesale-markets), 2026.
[^fca-backend-promotions]: UK Financial Conduct Authority, [Assessing firms' compliance with back-end cryptoasset financial promotions rules](https://www.fca.org.uk/publications/good-and-poor-practice/assessing-compliance-back-end-cryptoasset-financial-promotions-rules), updated 6 February 2026.
[^fca-dep]: UK Financial Conduct Authority, [Digital engagement practices: a trading apps experiment](https://www.fca.org.uk/publications/fca-research/research-note-digital-engagement-practices-trading-apps-experiment), updated 3 June 2026.
[^iosco-tokenisation]: IOSCO, [Final Report on Financial Asset Tokenization](https://www.iosco.org/news/pdf/IOSCONEWS778.pdf), 11 November 2025.
[^bis-2025]: Bank for International Settlements, [The next-generation monetary and financial system](https://www.bis.org/publ/arpdf/ar2025e3.htm), 24 June 2025.
[^bis-2026]: Bank for International Settlements, [BIS Annual Economic Report 2026](https://www.bis.org/publ/arpdf/ar2026e.pdf), 2026.
[^esma-dlt]: European Securities and Markets Authority, [ESMA suggests amendments to the DLT Pilot Regime to make it permanent](https://www.esma.europa.eu/press-news/esma-news/esma-suggests-amendments-dlt-pilot-regime-make-it-permanent), 25 June 2025.
[^finra-fractional]: FINRA, [Investing in Fractional Shares](https://www.finra.org/investors/insights/investing-fractional-shares), 26 June 2025.
[^cftc-kalshi]: US Commodity Futures Trading Commission, [Kalshi designated contract market filing](https://www.cftc.gov/IndustryOversight/IndustryFilings/TradingOrganizations/42993).
[^cftc-surveillance]: US Commodity Futures Trading Commission, [Kalshi filing describing real-time monitoring, automated surveillance and suspicious-behavior detection](https://www.cftc.gov/filings/ptc/ptc0602265036.pdf), 2 June 2026.

Additional useful official context:

- FCA, [Fund tokenisation](https://www.fca.org.uk/firms/cryptoassets-our-work/fund-tokenisation), updated 6 February 2026.
- FCA, [Multi-firm review of trading apps: high-level observations](https://www.fca.org.uk/publications/multi-firm-reviews/trading-apps-high-level-observations).
- FINRA, [Alternative and Emerging Products](https://www.finra.org/investors/investing/investment-products/alternative-and-emerging-products).
- FINRA, [Risk, including liquidity and concentration risk](https://www.finra.org/investors/investing/investing-basics/risk).
- ESMA, [DLT Pilot Regime](https://www.esma.europa.eu/mt/node/207362).

---

## 20. Final recommendation

Do not expand asset categories, add chain integrations or polish the trading shell first. Execute the sequence:

> contract/auth truth → draft/admission gate → legal rights/evidence → primary issuance → reconciled ownership → controlled market structure → surveillance/operations → servicing/exit → native visual convergence → optional DLT

This converts Co-own from a wide prototype into a defensible alternative-asset market. The strongest competitive advantage will not be that ThryftVerse makes an illiquid object look like a stock. It will be that the product makes a complex ownership claim unusually understandable, evidenced, serviceable and safe.
