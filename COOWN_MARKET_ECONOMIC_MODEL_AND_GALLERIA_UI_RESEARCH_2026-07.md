# Co-Own Exchange: Asset-Unit, 1ZE Settlement and Flagship Galleria Reconstruction

**Status:** Product, economic-model and interface specification  
**Prepared:** 16 July 2026  
**Scope:** ThryftVerse Co-Own department  
**Primary launch assumption:** United Kingdom  
**Decision horizon:** July 2026 flagship reconstruction  
**Important:** This is product and systems research, not legal, tax, accounting or investment advice. Regulated counsel, an authorised payments/e-money partner, an asset custodian and an appropriately authorised market operator must validate the operating model before live-money launch.

---

## 1. Executive correction

Co-Own should be modelled as an **exchange for finite units of legally defined real-asset interests**, with every order, execution, fee and settlement amount denominated in **1ZE**.

It is not primarily:

- a crowdfunding page;
- a social group-buy feature;
- a prediction contract;
- a decorative luxury marketplace;
- a wallet containing loosely connected points; or
- a game whose terminology changes the legal substance of redeemable money and ownership.

It should combine three product qualities:

1. **Galleria-quality discovery** — assets are presented with the editorial confidence, photography and restraint of a high-end auction catalogue.
2. **Exchange-quality execution** — buyers and sellers meet through explicit market rules, execution-derived prices, a real order book, atomic reservation and auditable settlement.
3. **Registrar-quality ownership service** — every issued unit, holder, transfer, distribution, vote, restriction and exit is reflected in an authoritative ownership ledger.

The useful Kalshi/Polymarket analogy is the interaction model: a clear instrument, visible price, order book and deterministic settlement. The contract is different. A Co-Own instrument represents a defined interest in an asset-holding structure; its value does not resolve to zero or one after an event.

The corrected product sentence is:

> **Discover exceptional assets, buy and sell verified ownership units in 1ZE, and receive the rights, distributions and exit proceeds defined for that instrument.**

### 1.1 The critical warning about 1ZE

Calling 1ZE an “in-game currency” does **not** create a safe regulatory bypass. If users can buy 1ZE with money, use it to acquire investment-like interests, transfer economic value, and redeem it to fiat, regulators and app stores can assess what it **does**, not what the UI calls it.

For the UK, issuing e-money or providing payment services can require FCA authorisation or registration; safeguarding, segregation and reconciliation duties can apply. Security tokens and e-money tokens can also sit inside existing regulatory perimeters. See the FCA’s current pages on [e-money and payment institutions](https://www.fca.org.uk/firms/electronic-money-payment-institutions), [safeguarding requirements](https://www.fca.org.uk/firms/emi-payment-institutions-safeguarding-requirements) and [cryptoassets](https://www.fca.org.uk/firms/cryptoassets).

The defensible design response is to:

- define 1ZE honestly as the platform’s single-platform settlement unit, without implying that the label creates a regulatory exemption;
- issue and redeem it through an authorised structure or partner;
- define each asset unit legally;
- operate or partner for any regulated trading-venue activity;
- show risk, liquidity and rights with Consumer Duty-level clarity; and
- keep entertainment mechanics out of execution, suitability and disclosure.

---

## 2. What the current code actually does

This audit is based on the current coown-master-complete-flagship-reconstruction branch at local HEAD 93bcbbd1f87e9a2d624bddd13515c1e3cfb24ec5.

The frontend stack is **not the fundamental blocker**. React, TypeScript and the existing service layer can produce a flagship exchange experience. The weak point is the domain and ledger model beneath the interface. Styling a weak ownership model would only make unproven claims look more convincing.

### 2.1 Existing strengths

The branch already contains useful foundations:

- buy and sell sides;
- market and limit orders;
- an order book and a price/time-like matching loop;
- partial fills;
- holdings and average entry price;
- wallet concepts including 1ZE, fiat and locked balances;
- primary supply and secondary seller flow;
- a trade composer with quantity, price, fee and estimated total;
- Co-Own asset, transaction and holding surfaces; and
- broader 1ZE mint/burn, reconciliation and payout concepts elsewhere in the backend.

These should be reorganised around a canonical instrument, cash ledger, unit ledger and settlement engine rather than discarded.

### 2.2 High-severity gaps

| Finding | Why it is unsafe or visually degrading | Required correction |
|---|---|---|
| One mutable CoOwnedAsset row mixes the physical asset, issuer, instrument, supply, market and price | The UI cannot truthfully distinguish appraisal, NAV, issue price and market price | Split the domain into UnderlyingAsset, IssuanceVehicle, InstrumentSeries, Market and Valuation |
| Creation is GBP/TVUSD-centric and caps supply at 20 units | Twenty display slices are not a cap table; fiat fields contradict the 1ZE exchange | Use arbitrary authorised/issued supply and make 1ZE the only quote/settlement asset |
| Matching transfers units but has no atomic cash-versus-unit settlement object | A match is not settlement; balances and ownership can diverge | Reserve both legs, create an idempotent settlement, then post cash and unit ledgers atomically |
| Seller units are checked but not reserved across all open orders | The same units can be offered more than once | Maintain available, reserved, pending and settled unit balances |
| Buyer funds are not exchange-grade order reservations | Orders can overcommit 1ZE | Reserve 1ZE at acceptance, release on cancel/expiry, settle execution plus fees |
| Post-fill code applies a synthetic price-impact formula | The app can display a price that no user paid | Last price, OHLC, volume and P&L must derive only from immutable executions |
| “24h” values are accumulated instead of windowed | It creates false market activity | Compute rolling windows from execution timestamps |
| Public holdings expose user identity and cost data | This is a privacy and security problem | Publish only consented identities and privacy-safe concentration bands |
| No clear cancel/replace, self-trade prevention or market-state controls | The venue is incomplete and manipulable | Add cancel/replace, expiry, STP, halts, auctions and surveillance events |
| Runtime mock fallbacks can fabricate assets, books and history | A production screen can look liquid when no market exists | Make mocks development-only and fail closed in production |
| The composer omits spread, estimated fill, impact and reservation state | It looks like checkout, not an exchange ticket | Reconstruct it as an order ticket with review and confirmation |

### 2.3 Code evidence from the audited branch

The findings above are directly visible in the current implementation:

| Code surface | Current evidence | Product implication |
|---|---|---|
| `frontend/src/data/coOwnModels.ts` | `CoOwnedAsset` stores seller, total/available shares, initial/current price, market cap and 24-hour activity in one display model | It cannot distinguish legal asset, issuing vehicle, instrument series, valuation source, market or official mark |
| `frontend/src/data/coOwnModels.ts` | `Wallet` exposes `izeBalance`, `fiatBalance` and one `lockedBalance` | It lacks the reservation, pending settlement, withdrawable and safeguarded sub-ledgers required for an exchange-grade 1ZE balance |
| `frontend/src/components/coown/CoOwnTradeComposer.tsx` | The composer presents units multiplied by a unit price, a fixed 1% fee, total and settlement label | It is a polished quote summary, but still lacks best bid/ask, spread, estimated average fill, worst price, impact, order duration and explicit reservation state |
| `backend/api/src/index.ts` — `POST /co-own/assets` | `totalUnits` is capped at 20 and the canonical fields are `unitPriceGbp`, `unitPriceStable` and `GBP/TVUSD/HYBRID` | The backend still models a small fraction pool settled around fiat/stable references, not a scalable asset-unit market quoted solely in 1ZE |
| `backend/api/src/index.ts` — `applyCoOwnTransfer` | It updates buyer/seller holdings and writes a trade, while the visible ledger posting covers the fee | The implementation does not post the principal 1ZE buyer debit and seller credit as the other atomic leg of delivery-versus-payment |
| `backend/api/src/index.ts` — order placement | A seller’s current holding is checked before insertion, but no persistent unit reservation is created for the resting order | Multiple open orders can collectively promise more units than the seller can deliver |
| `backend/api/src/index.ts` — order placement | No maximum 1ZE obligation is reserved before a buy order enters the book | The customer can create orders whose combined obligation exceeds spendable 1ZE |
| `backend/api/src/index.ts` — holdings endpoint | The asset-level endpoint returns `user_id`, units, average entry price and realised P&L | Cost data and identity are exposed beyond what a public market-data surface should reveal |
| `backend/api/src/index.ts` — post-fill asset update | A formula changes the displayed unit price from order size as a fraction of total supply | The official price can move even though no execution occurred at that synthetic value |

This is why the right reconstruction is not to restore removed decorative code. It is to preserve the improved component quality while replacing the ambiguous commercial model with truthful exchange primitives.

### 2.4 Root-cause conclusion

The visible quality problem is not “React looks cheap.” The interface lacks enough economic truth to create the quiet confidence of a serious exchange.

Flagship financial UI is produced by:

- coherent instrument identity;
- stable units and terminology;
- trustworthy numbers;
- visible market state;
- disciplined hierarchy;
- predictable interactions; and
- proof close to the decision.

The reconstruction must therefore be **model-first and component-system-first**, not a colour or gradient pass.

---

## 3. Canonical economic model

### 3.1 Separate six concepts currently conflated

#### A. Underlying asset

The physical or contractual asset: yacht, aircraft, classic vehicle, artwork, watch portfolio, property, revenue-producing equipment, or another counsel-approved asset class.

It has identity, condition, title, location, insurance, custody, appraisal and operating data.

#### B. Issuance vehicle

A legal entity or contractual structure that holds title or enforceable economic rights. Directly adding hundreds of users to the registered title of a yacht or property is usually operationally unsuitable. The vehicle provides title containment, liability ring-fencing, governance, recordkeeping, distributions, transfer rules and an exit waterfall.

The structure may still create a security, collective-investment or other regulated interest. Counsel must decide classification before interface copy says “own”.

#### C. Instrument series

The finite, fungible unit class users trade. Example:

~~~text
Ticker: MYA-01
Name: M/Y Aurelia 2026 Class A Units
Quote asset: 1ZE
Authorised units: 100,000
Issued units: 100,000
Public float: 70,000
Sponsor locked: 20,000
Liquidity/treasury reserve: 10,000
Voting: one vote per unit
Distribution: pro rata
Exit proceeds: pro rata after liabilities and reserves
~~~

If the units do not confer a beneficial or contractual interest in the asset vehicle, use “participation unit” or another counsel-approved term. Do not visually imply title that the contract does not provide.

#### D. Exchange market

The venue for one pair:

~~~text
MYA-01 / 1ZE
~~~

It defines tick size, lot size, trading session, order types, price bands, state, fees, eligibility, settlement and surveillance controls.

#### E. Position

The user’s settled beneficial balance and its operational states:

~~~text
settled ownership = available settled + reserved for sale

projected ownership
= settled ownership
 + pending incoming
 - pending outgoing
~~~

Reserving units for an order makes them unavailable to another order; it does not remove them from the user’s legal or beneficial position before settlement.

Position value is not legal NAV and not an unexecuted asking price.

#### F. 1ZE settlement balance

The user’s cash-like ledger balance:

~~~text
ledger claim
= available 1ZE
 + reserved for orders
 + pending deposit or credit
 + unsettled sale proceeds
 + redemption in progress
~~~

The headline spendable balance is `available 1ZE`; reservations and redemption requests reduce spendable 1ZE but remain explicitly reconcilable customer claims until executed or completed.

This separation is the heart of the product.

### 3.2 Authoritative supply equation

For every series:

~~~text
authorised units >= issued units

issued units
= investor settled units
 + investor pending units
 + sponsor locked units
 + treasury units
~~~

For trading:

~~~text
public float
= eligible settled units
- transfer-restricted units
- locked units
- treasury units not offered
~~~

The UI must distinguish authorised, issued, outstanding, public float, reserved in open sell orders, locked, treasury, cancelled/retired and fully diluted.

No transaction may create or destroy asset units except an authorised corporate action. The sum of the unit ledger must equal issued units after every posting.

### 3.3 Ownership percentage

For user u:

~~~text
ownership % = settled units held by u / outstanding units
~~~

For voting or distributions, the denominator may differ if the contract excludes treasury units or defines multiple classes. The UI must label the denominator.

### 3.4 Cap-table example

Assume:

- appraised asset value: 1,100,000 1ZE-equivalent;
- secured debt and purchase financing: 100,000;
- launch cash reserve: 50,000;
- acquisition, legal and setup liabilities: 50,000;
- equity NAV at issue: 1,000,000;
- issued units: 100,000;
- initial issue price: 10.00 1ZE.

Then:

~~~text
equity NAV
= asset fair value
- debt
+ vehicle cash
- accrued liabilities and exit reserves

NAV per unit = equity NAV / outstanding units
~~~

An investor buying 500 units at primary issue pays 5,000 1ZE plus the disclosed issue fee and owns 0.50% of outstanding units.

If the last secondary execution is 12.40 1ZE:

~~~text
market capitalisation = 12.40 × 100,000 = 1,240,000 1ZE
NAV premium = 12.40 / 10.00 - 1 = 24%
~~~

The product must show **market price** and **latest NAV per unit** separately. A 24% premium is not an appraisal gain.

### 3.5 Economic rights contract

Every instrument requires a human-readable rights summary backed by signed documents:

| Right or rule | Required answer |
|---|---|
| Legal holder | Who owns title to the physical asset? |
| Unit-holder interest | Share, beneficial interest, debt participation, revenue interest, or other? |
| Voting | What can holders vote on and at what threshold? |
| Income | Which net income is distributable and how often? |
| Costs | Who pays storage, crew, maintenance, tax, insurance and management? |
| Reserve | Minimum operating and emergency reserve? |
| Borrowing | Can the vehicle incur debt and within what cap? |
| Dilution | Can more units be issued, with what vote or pre-emption? |
| Transfer | Who is eligible to acquire units? |
| Use rights | Are access/usage rights attached or separately allocated? |
| Exit | Who can trigger a sale and how are proceeds distributed? |
| Default | What happens if costs exceed reserves? |
| Insolvency | Priority of claims and risk to unit holders? |

This rights contract is more important than a decorative ownership ring.

---

## 4. 1ZE: the single quote and settlement asset

### 4.1 Product rule

Every Co-Own instrument is quoted and settled in 1ZE:

~~~text
MYA-01 / 1ZE
ART-07 / 1ZE
VNT-22 / 1ZE
~~~

Local currency is never an alternative order currency. It is an **indicative display conversion**:

~~~text
12.40 1ZE
≈ £12.40
≈ €14.32
Rate source · timestamp · indicative only
~~~

The source, rate and as-of timestamp must travel with every conversion. Historical charts and tax statements must retain the conversion rate applicable to each event rather than recalculate history with today’s rate.

### 4.2 Recommended monetary design

For a UK MVP, the clearest product assumption is:

> **1 1ZE has a fixed redemption par of £1.00 before explicitly disclosed fees, subject to the authorised issuer/partner terms.**

That is a product recommendation, not a declaration that the current implementation is legally authorised.

A fixed par provides:

- one stable numeraire;
- understandable cost basis and P&L;
- no hidden token-price speculation inside every asset trade;
- simpler reconciliation;
- clearer local-currency display;
- clearer fee and withdrawal accounting; and
- better market surveillance.

If 1ZE floats against fiat, every user holds two risks: asset-unit price and token price. The interface would need dual-return attribution, token liquidity, FX spread, reserves and additional disclosures. That is the wrong launch complexity.

### 4.3 Deposit and redemption lifecycle

~~~text
Fiat deposit initiated
→ payment partner confirms cleared funds
→ safeguarded funds ledger increases
→ 1ZE credit is issued to pending
→ reconciliation passes
→ 1ZE becomes available
~~~

~~~text
Withdrawal requested
→ 1ZE moves from available to reserved
→ KYC/AML/risk checks
→ 1ZE is debited or burned
→ fiat payout instructed
→ payout confirmed
→ withdrawal marked settled
~~~

Chargebacks, reversals and failed payouts require explicit events. Never edit a balance directly.

### 4.4 Double-entry settlement

Example: a buyer acquires 100 units at 12.50 1ZE with a 0.5% buyer fee.

~~~text
gross execution value = 1,250.00 1ZE
buyer fee             =     6.25 1ZE
buyer total debit     = 1,256.25 1ZE
~~~

Cash ledger:

~~~text
Dr buyer reserved 1ZE            1,256.25
Cr seller available 1ZE          1,250.00
Cr platform fee revenue              6.25
~~~

Unit ledger:

~~~text
Dr seller reserved units           100
Cr buyer settled units             100
~~~

The two ledgers settle in one idempotent transaction. If either leg fails, neither leg posts.

### 4.5 Balance states

The API and UI must expose available, reserved-for-orders, pending-deposit, unsettled-proceeds, pending-withdrawal and total 1ZE. The word “balance” alone is insufficient.

### 4.6 Fees

Use one canonical fee engine. It may include payment-rail, FX, maker/taker, issue, vehicle management, custody, distribution withholding and withdrawal fees.

Every fee requires:

- rate and basis;
- minimum and maximum;
- payer and recipient;
- tax treatment;
- effective date; and
- order-review disclosure.

Do not bury annual vehicle costs because the trade ticket shows an execution fee.

### 4.7 App-store implication

Apple’s current [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) distinguish in-app digital content from physical goods and regulated financial/trading services. A redeemable settlement unit used for investment-like asset trading should not be designed as a cosmetic IAP workaround. App distribution needs a licensed-services and payments strategy, not only new naming.

---

## 5. Primary issuance: how a physical asset becomes exchange-tradable units

### 5.1 The unit must be a real, asset-specific instrument

One 1ZE is the settlement asset. One Co-Own unit is the ownership instrument. They are not the same thing.

For each listed asset, counsel must define exactly what a unit represents. Plausible structures include:

1. a share in an asset-specific company that owns the asset;
2. a beneficial interest in a trust or nominee structure;
3. a contractual revenue-and-residual-value participation right; or
4. a regulated fund or collective-investment unit.

For the intended stock-exchange-like experience, the cleanest product model is usually an **asset-specific vehicle with one standard unit class**, a verified cap table and a registrar. The vehicle owns the yacht, artwork, property or other underlying asset. The app trades units in that vehicle. The exact wrapper and user eligibility remain legal decisions.

Do not tell a user “you own 0.2% of this yacht” if the legal contract only grants a revenue share, a usage credit or an unsecured claim. The interface must derive its ownership sentence from the instrument contract, not from marketing copy.

The FCA’s current cryptoasset explanation is a useful substance test even if ThryftVerse does not use DLT: a digital instrument carrying ownership, repayment or profit rights can be a security token or other specified investment, while a token meeting the e-money definition is regulated as e-money. Technology and naming do not neutralise the rights. See [FCA: Cryptoassets—our work](https://www.fca.org.uk/firms/cryptoassets).

### 5.2 Issuance gates

An asset cannot move from a beautiful Galleria page directly into live trading. It must pass a deterministic issuance state machine:

~~~text
draft
  -> sponsor review
  -> identity and source-of-funds checks
  -> title, lien and authenticity verification
  -> independent valuation
  -> legal vehicle and instrument finalised
  -> insurance, custody and operating contract active
  -> disclosure pack approved
  -> primary book open
  -> minimum raise reached / failed
  -> asset acquired or transferred to vehicle
  -> units issued and registrar reconciled
  -> secondary market eligible
~~~

Every transition needs an actor, timestamp, evidence bundle and immutable audit event. A failed raise releases reserved 1ZE automatically; it must never produce units.

### 5.3 Capital stack and issuance equation

The offer document must reconcile to the last 1ZE:

~~~text
gross primary proceeds
  = public units x offer price
  + sponsor units x offer price

gross primary proceeds
  = asset purchase price
  + acquisition taxes and transaction costs
  + initial operating reserve
  + initial insurance/custody funding
  + disclosed issuance fee
  - any disclosed vendor financing
~~~

The unit supply must also reconcile:

~~~text
authorised units
  = issued public units
  + issued sponsor/issuer units
  + authorised but unissued units

issued units
  = settled holder units
  + reserved-for-open-sell-order units
  + treasury units
~~~

The sponsor cannot silently create more units, change the denominator or move asset liabilities off-screen. Any future issuance is a corporate action with disclosure, eligibility, voting and dilution treatment.

### 5.4 Primary subscription mechanics

The subscription experience should feel like a primary-market book, not a crowdfunding progress bar:

- show offer price in 1ZE and indicative local fiat;
- show minimum and maximum subscription;
- show units offered, subscribed, reserved and remaining;
- distinguish a non-binding indication from a funded order;
- reserve 1ZE when a funded subscription is accepted;
- allocate according to a disclosed rule if oversubscribed;
- settle units and 1ZE atomically only after all closing conditions pass;
- issue a contract note and ownership statement; and
- return unused or failed-subscription funds immediately to available 1ZE.

Allocation policies must be explicit: first-come, pro rata, auction, priority tier or sponsor discretion. Do not allow an “exclusive drop” aesthetic to hide an arbitrary allocation engine.

### 5.5 Asset due-diligence object

The product needs a structured evidence model, not a PDF dump. At minimum:

| Evidence | Required fields | User-facing status |
|---|---|---|
| Title and ownership | legal owner, registry, liens, verification date | Verified / exception |
| Valuation | valuer, method, date, range, conflicts | Current / stale |
| Condition | inspector, scope, defects, next inspection | Passed / remediation |
| Insurance | insurer, coverage, exclusions, renewal | Active / expiring |
| Custody or location | custodian/operator, location class, controls | Confirmed |
| Operating plan | revenue source, utilisation, fees, reserve policy | Approved |
| Legal instrument | rights, votes, restrictions, transfer rules | Executed |
| Sponsor | identity, retained interest, fees, conflicts | Verified |

These statuses should be generated from evidence and dates. They cannot be manually painted green by content editors.

---

## 6. Secondary exchange: the actual market engine

### 6.1 Exchange core, multiple honest market modes

Co-Own should have an exchange at its core, but an exchange is not synonymous with pretending every yacht has a liquid 24/7 order book.

Each instrument declares one market mode:

| Mode | Best use | Price formation |
|---|---|---|
| Continuous central limit order book | liquid, standardised units | price/time-priority executions |
| Scheduled call auction | thinly traded or newly issued units | one clearing price at auction time |
| Request for quote | large or unusual blocks | competitive dealer/member quotes |
| Negotiated block | eligible sophisticated users | disclosed off-book trade with controls |
| Halted | material information, broken market, corporate action | no matching |
| Closed | outside session or ineligible jurisdiction | no new orders |

This preserves the stock-exchange mental model while matching the actual liquidity of collectible and luxury assets.

### 6.2 Instrument market specification

Every live series needs:

- market symbol, such as `MY-ALTA-2026 / 1ZE`;
- instrument-series ID and legal vehicle ID;
- trading calendar and timezone;
- market mode and status;
- tick size and lot size;
- minimum and maximum order value;
- eligibility rules and transfer restrictions;
- price collars and volatility-interruption rules;
- fee schedule;
- settlement rule;
- disclosure version; and
- market-data entitlements.

The symbol is a label. IDs are the durable keys. Never join cash, holdings or corporate actions on a user-editable asset slug.

### 6.3 Order lifecycle

Use a full exchange lifecycle:

~~~text
draft
  -> validated
  -> rejected or accepted
  -> cash/units reserved
  -> open
  -> partially filled
  -> filled, cancelled, expired or suspended
  -> settlement posted
  -> contract note issued
~~~

Order events are append-only. The current state is a projection of those events. Cancel/replace creates an auditable amendment; it does not rewrite history.

Required order types for launch:

- limit buy and limit sell;
- marketable limit, presented to consumers as a protected “buy now/sell now” order;
- good-for-day and good-till-cancelled where appropriate; and
- immediate-or-cancel for advanced eligible users.

Avoid an uncapped market order in an illiquid asset. The simple button should generate a marketable limit with a visible maximum price or minimum proceeds.

### 6.4 Reservation before matching

The matching engine must not accept economic promises it cannot settle.

For a buy order:

~~~text
required reserve
  = limit price x open quantity
  + maximum applicable fees
  + any rounding buffer
~~~

Move that amount from available 1ZE to order-reserved 1ZE before the order becomes executable.

For a sell order, move the open quantity from available units to order-reserved units. A unit can be in at most one of these states: settled and available, reserved, pending transfer or retired.

Partial fills release excess reserves as the remaining exposure declines. Cancel, expiry and rejection release reserves idempotently.

This fixes the current branch’s highest-risk business-logic gap: an order book without authoritative cash and unit reservation can permit overspending, double-selling and failed settlement.

### 6.5 Matching and execution

For a continuous market:

1. rank orders by price, then acceptance time;
2. prevent self-trades according to the account/beneficial-owner policy;
3. execute at the resting order’s price unless the venue rule says otherwise;
4. create one immutable execution per match;
5. settle reserved 1ZE and units through delivery-versus-payment;
6. post fees through the same ledger transaction; and
7. emit market data only after the transaction commits.

Matching must be deterministic. Given the same ordered event stream, it should produce the same executions.

### 6.6 Price truth

The interface currently risks treating one mutable “current price” as valuation, quote and traded price. Replace it with separate facts:

- **last trade:** most recent eligible execution price and time;
- **best bid / best ask:** current executable top of book;
- **midpoint:** arithmetic midpoint when both sides exist;
- **indicative auction price:** current auction clearing estimate;
- **official close:** venue-defined session close;
- **reference NAV:** latest asset valuation less liabilities, divided by units;
- **local-fiat indication:** 1ZE value converted with source and timestamp.

No trade means no new last price. A model, editor, valuation update or random mock cannot create a market execution. If the last trade is old, show its age. If no bid or ask exists, show an em dash and “No current order,” not zero.

### 6.7 Market-data calculations

~~~text
spread_1ze = best_ask - best_bid

spread_bps = spread_1ze / midpoint x 10,000

turnover_24h = sum(execution_price x execution_quantity)

unit_market_cap = official_mark x issued_units

depth_within_2_percent = executable quantity inside +/- 2% of midpoint
~~~

Do not publish “market cap” without identifying the mark used. Do not count cancelled orders, deposits, primary issuance or internal ledger transfers as trading volume.

### 6.8 Market integrity controls

Before public trading, implement:

- self-trade prevention;
- duplicate and runaway-order checks;
- price and quantity collars;
- fat-finger review thresholds;
- wash-trading, spoofing and layering surveillance;
- account-linkage and beneficial-owner monitoring;
- suspicious-order and suspicious-transaction case management;
- material-information trading restrictions;
- volatility interruptions and manual halts;
- erroneous-trade policy;
- immutable operator actions; and
- venue-wide kill switch.

The FCA explicitly treats market integrity as a core objective and provides reporting routes for firms and trading venues. Product design should assume surveillance and investigation are first-class operations, not a later analytics feature. See [FCA: report suspected market abuse as a firm or trading venue](https://www.fca.org.uk/markets/market-abuse/how-report-suspected-market-abuse-firm-or-trading-venue).

### 6.9 Liquidity programme without fake activity

Early liquidity will be sparse. The answer is controlled market design:

- scheduled opening and closing auctions;
- one or more disclosed liquidity providers with maximum-spread/minimum-depth obligations;
- sponsor lockups and orderly-release schedules;
- RFQ for block interest;
- watchlists and price alerts;
- club-led demand discovery before an issue opens; and
- transparent “thin market” labels and last-trade age.

Never generate house trades, fake viewers, fake volume or fake scarcity. A premium market earns trust by showing when liquidity is absent.

---

## 7. Valuation, asset economics and owner returns

### 7.1 Keep valuation and market price distinct

The asset detail screen should carry a three-part value strip:

1. **Market:** last execution, bid, ask and liquidity;
2. **Fundamental:** latest reference NAV and valuation range; and
3. **Cash:** distributions paid and next expected reporting date.

Market price may trade above or below NAV. That gap is information, not an error to conceal.

### 7.2 Yacht or operating-asset model

For a revenue-producing yacht, a simplified annual vehicle model is:

~~~text
gross charter revenue
  - broker and booking commissions
  - crew and payroll
  - berth, fuel and logistics
  - insurance
  - routine maintenance
  - management fee
  - major-refit reserve
  - taxes and vehicle administration
  = distributable operating cash before debt

distributable operating cash before debt
  - interest and principal reserve
  - retained working capital
  = cash available for owner distribution
~~~

For a non-yielding collectible, expected return comes primarily from sale proceeds less storage, insurance, maintenance, transaction costs and taxes. The UI must not imply a yield where none is contractually generated.

### 7.3 Net asset value

~~~text
reference NAV
  = independent asset value
  + vehicle cash and receivables
  - debt
  - accrued expenses
  - expected disposal costs where policy requires

reference NAV per unit
  = reference NAV / issued participating units
~~~

Show valuation date, method, valuer, range and next scheduled update. A stale appraisal badge is more trustworthy than silently rolling a model forward.

### 7.4 Distribution mechanics

Distributions should arrive in 1ZE because it is the platform settlement asset. If the vehicle earns GBP, EUR or USD, the corporate-action record must show:

- source cash amount and currency;
- conversion source, rate and timestamp;
- FX and payment costs;
- distributable 1ZE;
- record date and payment date;
- eligible units;
- gross and net amount per unit; and
- tax or withholding treatment.

Use the registrar snapshot at the record date, not the current portfolio view. Post distributions through the ledger and issue an owner statement.

### 7.5 Performance presentation

Portfolio return should separate:

~~~text
unrealised market P&L
  = current mark value - cost basis of open units

realised trading P&L
  = sale proceeds - cost basis of sold units - trading fees

cash return
  = net distributions received

FX-reference movement
  = change caused only by converting 1ZE into the selected local display currency
~~~

Do not blend deposits, promotional 1ZE, rewards or referral bonuses into investment performance.

---

## 8. Corporate actions: ownership after the trade

An exchange is credible only if it handles the years after issuance. Build a corporate-action engine before the first live asset, even if launch uses only a subset.

### 8.1 Required action types

| Action | Economic effect | Minimum UI |
|---|---|---|
| Cash distribution | 1ZE paid per eligible unit | gross/net amount, dates, statement |
| Unit split or consolidation | changes unit count and unit price basis | before/after holdings and orders |
| New issuance or rights offer | may dilute existing holders | denominator, rights, deadlines |
| Buyback or tender | vehicle purchases units | price, allocation, residual units |
| Asset sale | converts underlying asset to cash | proposal, costs, net proceeds |
| Refinancing | changes debt and risk | new terms, effect on NAV/cash flow |
| Insurance claim | cash/replacement after loss | status, exclusions, expected recovery |
| Material maintenance event | uses reserves or creates call | budget, variance, voting treatment |
| Wind-down | retires instrument after final settlement | waterfall, final statement |
| Trading halt/resumption | pauses or reopens market | reason, timestamp, next review |

### 8.2 Event lifecycle

~~~text
announced
  -> terms verified
  -> market treatment applied
  -> election window open, if any
  -> record-date snapshot
  -> calculation approved
  -> ledger and registrar posting
  -> paid / completed
  -> reconciled
~~~

Open orders must receive deterministic treatment on splits, material disclosures and record dates. Usually they are cancelled or adjusted under a published rule; never leave the result to an operator’s memory.

### 8.3 Governance

Voting is not a decorative poll. A proposal needs:

- legal authority and proposer;
- affected series;
- full resolution and evidence pack;
- record date;
- eligible voting units and any excluded sponsor units;
- quorum and approval threshold;
- voting window and revocation rule;
- conflicts and recommendation;
- cryptographically or operationally auditable ballot receipt; and
- certified result with execution status.

The legal agreement decides which matters are votes and which are delegated to the operator. The app mirrors that contract.

---

## 9. Clubs: aggregate conviction, not ambiguous pooled money

### 9.1 Why clubs matter

The cold-start problem is not only lack of assets. It is fragmented demand. Clubs can collect attention, expertise and intended order size before a market opens, then coordinate participation after launch.

That makes clubs useful for:

- yacht, art, watch, property or collectible specialists;
- geographic or thematic cohorts;
- sponsor communities;
- professional or high-net-worth eligibility groups;
- primary-issue demand discovery; and
- block-liquidity and governance discussion.

### 9.2 Three club modes must remain separate

1. **Discovery club** — members follow assets, share analysis and declare non-binding interest. No pooled balance.
2. **Coordinated allocation club** — each member submits and settles their own order; the club may unlock a disclosed allocation or fee tier if aggregate conditions are met.
3. **Pooled mandate vehicle** — a legally constituted entity or managed structure owns units for members and has its own ledger, governance, eligibility and disclosures.

Do not let a social group silently become a pooled investment. Pooling contributions and exercising common discretion may change the legal analysis. The product must gate pooled mode behind a separately approved structure.

### 9.3 Recommended launch model

Launch discovery clubs and coordinated allocation clubs first. Each person keeps:

- their own KYC/eligibility status;
- their own 1ZE balance;
- their own order and contract note;
- their own units on the registrar; and
- their own tax and distribution statement.

The club supplies coordination, not custody.

### 9.4 Club demand book

Before primary issuance, members can submit a revocable indication:

~~~text
asset / series interest
target units or target 1ZE
acceptable price range
confidence level
expiry
visibility: private to venue / aggregate to club
~~~

Display aggregate interest only when it clears a privacy threshold. Label it “indicated interest,” never “committed capital.” At book open, invite each member to convert the indication into a funded subscription.

### 9.5 Club UI

A flagship club room needs:

- cinematic cover and concise mandate;
- verified host and moderation status;
- member count separated from eligible/funded participants;
- aggregate indicated demand by price band;
- watchlist and upcoming issue calendar;
- analyst notes with author and conflict labels;
- live holdings or performance only when methodology is defined;
- proposals and voting when legally applicable;
- member permissions and privacy controls; and
- a persistent “Your exposure” panel.

Avoid public wealth rankings, confetti, casino leaderboards and urgency copy. For high-value assets, discretion is part of luxury.

### 9.6 Club allocation

If a club earns a reserved primary allocation, use a disclosed rule such as:

~~~text
member allocation
  = min(member funded request,
        club allocation x member funded request / all funded requests)
~~~

Apply caps, rounding and residual-lot rules deterministically. Publish the rule before funded orders are accepted.

---

## 10. How to convince users: replace claims with a proof stack

Users will not be persuaded by “democratising luxury” alone. They must be able to answer seven questions without contacting support.

### 10.1 The seven proofs

1. **What do I legally own?** Instrument type, rights, restrictions and vehicle.
2. **Does the vehicle own the asset?** Title, registry, custody and lien evidence.
3. **Who priced it?** Valuer, method, range, date and conflicts.
4. **Where is my money?** Available, reserved and pending 1ZE; safeguarding explanation.
5. **How is price formed?** Real bids, asks and executions; NAV shown separately.
6. **How do I earn or exit?** Distribution policy, market mode, spread, depth and sale/wind-down rules.
7. **What happens when something goes wrong?** Insurance, reserves, complaints, default and recovery waterfall.

Build every asset page around these proofs. A verified badge without drill-down evidence is not enough.

### 10.2 Plain-language ownership sentence

At the top of every order review, generate a sentence like:

> You are buying 40 Class A units in TV Asset 024 Ltd. After settlement you will hold 0.40% of the 10,000 issued participating units. These units provide the economic and voting rights described in Instrument Terms v3; they do not give you personal possession or unrestricted use of the yacht.

That sentence is more valuable than a gold border. It connects the quantity, denominator, legal entity and real limitation.

### 10.3 First-trade education

Before the first funded order, require a short comprehension sequence:

- 1ZE is the settlement balance, not the asset unit;
- the local-currency amount is indicative;
- price can move and liquidity can disappear;
- a physical asset is held through a legal instrument;
- distributions are not guaranteed; and
- redemption of 1ZE and sale of asset units are separate actions.

Use scenario questions rather than a checkbox. If the user fails, explain and retry. This aligns with the FCA’s emphasis that the [Consumer Duty](https://www.fca.org.uk/firms/consumer-duty) requires firms in scope to put customer needs first and support consumer understanding.

### 10.4 Language system

Use:

- “Buy 20 units at up to 12.60 1ZE”;
- “Estimated average fill”;
- “Only 38 units are offered within 2%”;
- “Reference NAV, updated 3 July”;
- “Last trade 18 days ago”;
- “Your 1ZE is reserved while this order is open”; and
- “Indicative GBP value · rate as of 14:32 BST.”

Avoid:

- “guaranteed ownership growth”;
- “instant liquidity”;
- “bank-grade” without a defined control;
- “asset-backed” without naming holder and claim;
- “exclusive opportunity” as a risk substitute;
- “only X left” when units are also offered elsewhere; and
- “cash balance” for 1ZE unless the legal and safeguarding model supports that description.

### 10.5 Trust centre

Create a persistent Trust Centre containing:

- legal entities and regulatory status;
- safeguarding/custody structure;
- asset admission standard;
- market rules and fee book;
- conflicts policy;
- valuation policy;
- market-surveillance and halt policy;
- complaints and redress path;
- incident history and status page;
- proof-of-reserves or reconciliation reporting where applicable; and
- plain-language risk library.

If 1ZE constitutes e-money or the platform provides payment services, authorisation/partnership and safeguarding are operational requirements. The FCA states that payment/e-money issuance may require authorisation or registration and that relevant customer funds must be protected; its updated safeguarding regime includes reconciliation, reporting and resolution-pack duties. See [FCA: Electronic money and payment institutions](https://www.fca.org.uk/firms/electronic-money-payment-institutions) and [FCA: Safeguarding requirements](https://www.fca.org.uk/firms/emi-payment-institutions-safeguarding-requirements).

---

## 11. Product architecture: Galleria above, exchange beneath

### 11.1 Primary navigation

Use five durable destinations:

1. **Galleria** — editorial discovery and asset worlds;
2. **Markets** — quotes, order books, auctions and orders;
3. **Portfolio** — positions, P&L, income and documents;
4. **Wallet** — 1ZE deposit, reservation, redemption and activity; and
5. **Clubs** — specialist communities and coordinated demand.

Search is global. Notifications open a unified activity centre. Profile and compliance live under the account avatar, not as a competing primary market tab.

### 11.2 Galleria home

The Galleria should feel like entering a private viewing, not opening a broker terminal:

- one full-bleed editorial hero with asset film or high-resolution still;
- a restrained title, location, thesis and live market state;
- curated rooms such as “Mediterranean Charter”, “Post-war Masters” or “Design Icons”;
- edge-to-edge image-led collections with minimal chrome;
- small, precise market facts below the imagery;
- saved rooms and private previews; and
- no dense chart wall on first contact.

Tapping an asset transitions from editorial mode into the asset dossier. The brand can be cinematic while the data stays sober.

### 11.3 Asset dossier

Recommended vertical structure:

1. immersive hero media, asset name, registry/location and watch control;
2. market header: last, bid, ask, spread, market state and last-trade age;
3. primary action rail: Buy units / Sell units;
4. “What one unit represents” ownership statement;
5. price history with Market / NAV / Distributions toggles;
6. order-book or auction depth;
7. ownership and supply: issued, treasury, sponsor, public float;
8. cash-flow and valuation summary;
9. proof stack: title, custody, insurance, valuation and operator;
10. documents and versioned disclosures;
11. club discussion and analyst notes; and
12. events, governance and corporate actions.

Keep trade actions sticky, but never cover disclosures or the device safe area.

### 11.4 Market screen

Markets serves users who arrive to trade rather than browse. It needs:

- search by asset, symbol, category and vehicle;
- tabs for Active, Auctions, New issues and Watchlist;
- sortable last price, 24-hour change, spread, depth and last-trade age;
- clear market status chips;
- compact image thumbnails that retain the Galleria identity;
- session/auction countdowns that are factual, not gamified; and
- advanced filters for asset class, currency reference, yield type, liquidity and eligibility.

A percentage change without a timestamp and prior reference price is not allowed.

### 11.5 Order composer

Use a bottom sheet on mobile and a side panel on larger screens. Its hierarchy:

1. Buy / Sell segmented control;
2. available 1ZE or sellable units;
3. quantity input with lot step;
4. Protected instant / Limit selection;
5. limit price or protection price;
6. estimated average fill and worst price;
7. order-book depth/price-impact preview;
8. order duration;
9. gross, each fee and total;
10. post-trade units and ownership percentage; and
11. review button.

For a thin market, replace a misleading one-tap Buy with “Request quote” or “Join auction.” The market mode, not visual preference, selects the action.

### 11.6 Review and confirmation

The review screen must show:

- plain-language ownership sentence;
- order type and cancellation rule;
- maximum 1ZE reserved;
- indicative local-fiat reference with source/time;
- expected units, average price and price impact;
- all one-off and ongoing fees;
- market and liquidity warning specific to this instrument;
- disclosure version accepted; and
- hold-to-submit or equally deliberate confirmation for high-value orders.

Confirmation uses a restrained state transition: Submitted, Partially filled, Filled or Pending auction. Do not celebrate an unfilled order as a completed investment.

### 11.7 Portfolio

Portfolio opens with 1ZE total value and an indicative local reference. It separates:

- positions at market mark;
- 1ZE available, reserved and pending;
- cost basis;
- realised and unrealised P&L;
- distributions;
- asset-class and issuer concentration;
- liquidity bands; and
- upcoming corporate actions.

Each position row shows unit count, ownership percentage, mark source and mark age. A portfolio based on stale or indicative prices needs a visible data-quality note.

### 11.8 Wallet

The wallet is a regulated-feeling cash ledger, not a game-store inventory:

- large available 1ZE;
- reserved, pending and withdrawable sub-balances;
- Add 1ZE and Redeem 1ZE as separate flows;
- bank/payment source status;
- local-fiat estimate and FX/source timestamp;
- immutable activity with references;
- downloadable statements; and
- safeguarding and redemption information.

Do not sell decorative 1ZE bundles beside investment balances. Promotional credits, if any, need a different non-redeemable ledger and must not be spendable as investment consideration without legal approval.

### 11.9 Accessibility and responsive behaviour

Flagship quality includes:

- 44 by 44 point minimum touch targets;
- visible keyboard focus and full keyboard order entry on web;
- screen-reader names for symbols, prices and chart summaries;
- no red/green-only market states;
- Dynamic Type/text zoom without clipped prices;
- reduced-motion mode;
- locale-aware numbers while keeping 1ZE canonical;
- safe-area-aware sticky actions; and
- tablet/two-column layouts rather than stretched mobile cards.

### 11.10 Visual language

Keep the current restrained palette. Do not solve luxury with champagne gold.

Recommended system:

- near-black and warm off-white foundations;
- graphite surfaces with one-pixel tonal borders;
- one cool functional accent for action and focus;
- semantic positive, negative, warning and halted colours used sparingly;
- editorial photography as the source of richness;
- 12/16/24/32 spacing rhythm;
- three radius families only: controls, cards, media;
- one icon family at consistent optical weight;
- tabular numerals for prices and quantity; and
- calm 160–240 ms transitions with meaningful state continuity.

Luxury comes from proportion, media art direction, typography, precision and silence. The exchange earns authority through alignment, density control and exact states.

### 11.11 Minute-detail quality bar

- Align decimals and units; never let “1ZE” jump horizontally between rows.
- Use true minus signs and locale-aware grouping.
- Reserve layout width for status changes to prevent shifting.
- Show skeletons matching final geometry; avoid generic spinners over empty black space.
- Preserve image focal points with asset-specific crops.
- Use hairlines only at device-pixel-safe widths.
- Distinguish disabled, loading, pressed, selected and reserved states.
- Put timestamps beside data, not in an information tooltip only.
- Keep destructive/cancel actions reachable but visually secondary.
- Haptic feedback belongs on order acceptance or failure, not every tab change.
- Error text explains recovery: required 1ZE, required units, next available action.
- Never use a green “verified” aesthetic for an expired document.

## 12. What to borrow from exchanges and prediction markets

The closest precedent is not one product. Thryftverse needs a deliberate combination of four systems:

| Reference model | What it is good at | What Co-Own should borrow | What Co-Own must not imply |
|---|---|---|---|
| Stock exchange | stable instrument identity, order priority, auctions, post-trade records, corporate actions and surveillance | instrument series, central limit order books where liquidity permits, deterministic matching, DvP, official market states and audit history | that every alternative asset is continuously liquid or equivalent to a listed equity |
| Kalshi-style event exchange | bounded contracts, explicit market rules, visible bids/offers and deterministic settlement | precise market specifications, order review, reservations, position history and clear resolution states | that an asset unit is a bet, probability or cash-settled event contract |
| Polymarket-style market experience | immediate positions, wallet-connected settlement and legible market activity | compact position feedback, transparent open orders and fast settlement status | that wallet UX, decentralisation language or token naming removes financial regulation |
| Luxury marketplace or auction house | desire, provenance, editorial storytelling, specialist curation and private-client service | Galleria discovery, cinematic media, condition and provenance dossiers, concierge/RFQ paths | that a beautiful listing page is sufficient evidence of ownership, fair value or liquidity |

The product thesis should therefore be:

> A curated alternative-asset exchange with an editorial Galleria front end, asset-specific ownership instruments and 1ZE settlement.

It should not be described as “Polymarket for yachts.” That phrase is mechanically incomplete and introduces the wrong consumer expectation.

## 13. Canonical backend and data architecture

### 13.1 Required entities

The current Co-Owned Asset object is carrying too many responsibilities. Replace it with an explicit domain model:

| Entity | Purpose | Important fields |
|---|---|---|
| Asset | physical/economic underlying | asset ID, type, jurisdiction, title holder, custody, documents, valuation and lifecycle state |
| Issuance vehicle | legal wrapper holding or contracting around the asset | vehicle ID, legal form, jurisdiction, operator, bank/custodian, documents and status |
| Instrument series | the finite ownership/economic units that trade | instrument ID, vehicle ID, rights version, issued units, unit precision, issue price, restrictions and status |
| Unit position | authoritative ownership balance per account and instrument | settled, reserved, pending-in and pending-out units |
| Unit movement | immutable unit-ledger entry | debit account, credit account, quantity, cause, execution/action reference and timestamp |
| 1ZE account | authoritative monetary balance | available, reserved, pending, withdrawable and safeguarded classification |
| 1ZE ledger entry | immutable double-entry cash movement | debit, credit, amount, currency, reference, status and idempotency key |
| Market | trading configuration for one instrument | market mode, tick size, lot size, price bands, session, halt state and disclosure version |
| Order | customer instruction | side, type, limit, quantity, remaining, time-in-force, status and reservation references |
| Execution | immutable match | maker order, taker order, quantity, price, fees, sequence number and timestamps |
| Corporate action | an ownership lifecycle event | type, record date, election window, entitlement rule, payment and status |
| Club | social/demand coordination object | owner, membership, mandate mode, target, commitments and allocation status |
| Document version | evidence and disclosure record | hash, version, effective date, expiry, reviewer and visibility |

The asset is not the instrument. The instrument is not the market. The market is not the last trade. The last trade is not NAV. These boundaries are the architectural heart of the reconstruction.

### 13.2 Unit-ledger states

Every position should expose four mutually reconciling quantities:

    settled ownership = settled available + reserved to sell

    projected ownership = settled ownership + pending in - pending out

Use pending states only when a real settlement or corporate-action process exists. Do not use them to mask database uncertainty.

For each instrument:

    sum of settled customer and treasury positions = issued units

Burned or cancelled units must sit in an explicit retired balance, not disappear from history.

### 13.3 1ZE-ledger states

The monetary ledger should distinguish:

- safeguarded customer money or equivalent regulated customer claim;
- platform operating cash;
- fee revenue;
- issuer proceeds;
- pending deposit;
- available customer balance;
- reserved order balance;
- unsettled sale proceeds;
- withdrawable balance;
- redemption in progress; and
- promotional, non-redeemable credit if the business ever uses it.

Promotional credit must never be silently merged into redeemable 1ZE. A single wallet number can be visually simple while the ledger remains precise.

### 13.4 Atomic order and settlement command

For a buy order:

1. authenticate the account and trading eligibility;
2. verify instrument, disclosure and market version;
3. validate tick, lot, price band and order limits;
4. calculate the maximum 1ZE obligation including fees;
5. reserve that amount in the 1ZE ledger;
6. write the order with an idempotency key;
7. pass the order to the deterministic sequencer;
8. create executions against eligible opposite orders;
9. in one settlement transaction, move units seller-to-buyer and 1ZE buyer-to-seller/platform-fee accounts;
10. release unused reservations;
11. publish ordered market-data events; and
12. send an execution receipt containing the exact rights/disclosure version.

For a sell order, reserve units before the order can enter the book. This closes the current double-sell exposure.

No execution should exist without both ledger legs. No ledger movement should reference a nonexistent execution. A job that retries must return the same result for the same idempotency key.

### 13.5 Matching-engine rules

The first production rule set should be intentionally narrow:

- price-time priority;
- limit and marketable-limit orders;
- good-for-session and immediate-or-cancel;
- no hidden orders at launch;
- no leverage, short selling or derivatives;
- self-trade prevention;
- maximum order value and position concentration controls;
- collar checks against the last reliable reference;
- volatility interruption and call auction;
- cancel-on-disconnect for professional liquidity providers only; and
- deterministic sequence IDs for all order-book events.

Do not expose a generic “market order” on a thin book without a maximum price or slippage guard. In the mobile UI, present it as “Buy up to” or “Sell no lower than” and show the worst permitted outcome.

### 13.6 Minimum API surface

Recommended domain endpoints:

- GET /v1/instruments and GET /v1/instruments/{id};
- GET /v1/instruments/{id}/rights;
- GET /v1/instruments/{id}/documents;
- GET /v1/markets/{id}/summary;
- GET /v1/markets/{id}/book;
- GET /v1/markets/{id}/trades;
- POST /v1/orders/preview;
- POST /v1/orders;
- DELETE /v1/orders/{id};
- POST /v1/orders/{id}/replace;
- GET /v1/orders and GET /v1/executions;
- GET /v1/positions;
- GET /v1/wallet;
- POST /v1/wallet/deposits;
- POST /v1/wallet/redemptions;
- GET /v1/ledger/activity;
- GET /v1/corporate-actions;
- POST /v1/corporate-actions/{id}/elections;
- GET /v1/clubs and POST /v1/clubs/{id}/commitments; and
- GET /v1/statements/{period}.

Every money-moving POST needs idempotency, explicit preview, versioned terms, immutable receipts and trace IDs.

### 13.7 Non-negotiable invariants

Continuously test and reconcile:

- issued units equal all authoritative positions plus explicitly retired units;
- available plus reserved plus pending balances reconcile to the total;
- neither 1ZE nor unit balances become negative;
- every transaction balances debits and credits by ledger asset;
- every execution has one buyer unit credit, one seller unit debit and matching 1ZE settlement legs;
- open sell quantity never exceeds reserved units;
- open buy obligation never exceeds reserved 1ZE;
- the best bid is lower than the best offer outside an auction/crossing process;
- last-traded price changes only after a real execution;
- indicative local fiat never enters the matching or ledger calculation;
- an expired or superseded disclosure cannot be accepted for a new order; and
- an identical idempotency key cannot create a second order, deposit or redemption.

### 13.8 Privacy and operational controls

Current holdings must not be exposed through public asset endpoints. Publish aggregate holder count and concentration bands only after privacy review. Individual positions belong behind account authorization.

Operations need:

- maker-checker approval for issuance and corporate actions;
- reconciliation dashboards for 1ZE, units, payment partners and custody;
- exception queues with ageing;
- immutable staff action logs;
- role separation between listing, valuation, market operations and treasury;
- market-surveillance cases;
- incident kill switches scoped by instrument, market and payment rail; and
- tested recovery-time and recovery-point objectives.

## 14. Migration from the current implementation

### 14.1 Current-to-target mapping

| Current field or behaviour | Target treatment |
|---|---|
| CoOwnedAsset.totalShares | migrate to InstrumentSeries.issuedUnits after reconciliation |
| availableShares | derive from treasury/issuer positions and active reservations; do not store as free-floating truth |
| initialPricePerShare | store as issue price with issue event and timestamp |
| currentPricePerShare | replace with market summary containing last execution, bid, ask, NAV and mark provenance |
| marketCap | calculate from chosen mark × issued units and label the mark basis |
| priceChange24h | calculate from actual executions; return unavailable when no valid comparison exists |
| volume24h | calculate from executions only |
| wallet.izeBalance | split into available, reserved, pending and withdrawable ledger balances |
| lockedBalance | replace with typed reservations linked to orders, withdrawals or compliance holds |
| generic transaction currency union | keep 1ZE as the Co-Own trading ledger; treat local fiat as funding/redemption rail and reference display |
| direct buy/sell mutation | replace with preview, reservation, order, execution and atomic settlement |
| synthetic or mock market values | remove from production paths; isolate fixtures behind development-only boundaries |

### 14.2 Safe migration sequence

1. Freeze the meaning of existing fields and document every writer.
2. Create instrument IDs and issuance records for all existing Co-Own assets.
3. Reconstruct each user's unit balance from source transactions.
4. Reconcile reconstructed balances to issued supply; stop if they differ.
5. Create opening unit-ledger entries and signed migration manifests.
6. Split 1ZE balances into available/reserved/pending with opening double-entry records.
7. Run the old and new read models in shadow mode.
8. Compare balances, portfolio values and order previews across a defined period.
9. disable legacy mutation endpoints;
10. open the new market in cancel-only/read-only mode;
11. use a call auction for the first price discovery; and
12. enable normal sessions only after reconciliation and operational sign-off.

Do not migrate by copying current mutable totals into the new schema and calling them a ledger.

### 14.3 Stack conclusion

The present web stack can render a flagship exchange and support a production-quality flow. The low-quality or weak feeling is not caused by React, TypeScript or responsive web technology.

The real constraints are:

- domain objects that collapse asset, security and market;
- synthetic price data;
- missing authoritative ledgers;
- insufficient reservation and settlement semantics;
- broad mock fallbacks;
- no dedicated market-state design; and
- inconsistent component primitives.

A native shell may improve camera, biometrics, push, haptics and very high-frequency gesture quality. It will not repair weak ownership or exchange logic. Fix the financial domain first, then decide whether selected flows deserve native implementation.

## 15. Co-Own business model and market economics

### 15.1 Revenue model

Use transparent fees aligned to real work:

| Revenue line | Who pays | Trigger | Design rule |
|---|---|---|---|
| origination/listing | issuer or asset sponsor | asset passes diligence and issuance completes | never sell approval; rejected assets remain rejected |
| primary issuance | issuer or subscriber, disclosed | units are allocated | show the exact 1ZE fee before commitment |
| secondary execution | buyer and/or seller | real execution only | no fee on unfilled or cancelled quantity |
| vehicle administration | instrument vehicle/owners | scheduled service period | disclose in the rights document and NAV bridge |
| custody/insurance/pass-through | vehicle/owners | actual third-party service | separate pass-through cost from Thryftverse margin |
| redemption/payment | wallet user | actual funding or withdrawal | disclose FX source, spread and fixed fee |
| concierge/RFQ | requesting party | specialist transaction completes | separate from public book pricing |
| data/professional tools | professional participant | subscription | never sell non-public customer order data |

Avoid hidden spread capture. If Thryftverse or an affiliate acts as principal or liquidity provider, identify that conflict on the order review and trade receipt.

### 15.2 Unit economics

Track one instrument cohort from origination to retirement:

    primary revenue
  + secondary execution revenue
  + administration and concierge revenue
  - KYC/KYB and payment cost
  - custody, insurance and asset administration cost
  - market operations and surveillance cost
  - support, disputes and remediation
  - expected fraud/default loss
  = instrument contribution margin

For secondary trading:

    execution revenue = executed 1ZE notional × disclosed fee rate

Do not forecast revenue from displayed order volume or club commitments. Only executed and settled notional is economically real.

### 15.3 Liquidity budget

Liquidity is a product cost, not an automatic network effect. Budget separately for:

- opening-auction facilitation;
- regulated market-making or liquidity-provider incentives where permitted;
- inventory risk;
- data and surveillance;
- issuer-sponsored liquidity with conflict disclosure;
- periodic auctions for thin instruments; and
- owner redemption/buyback facilities where the instrument contract genuinely supports them.

Incentives should reward quoted depth, spread quality and time at market, subject to anti-wash controls. Paying for raw trade count invites manipulation.

### 15.4 Asset eligibility score

Before an asset reaches the Galleria, score:

- title and legal enforceability;
- custody/possession certainty;
- valuation confidence;
- insurance availability;
- ongoing cash-flow visibility;
- operating complexity;
- maintenance reserve sufficiency;
- transfer restrictions;
- expected holder base;
- expected trading frequency;
- credible exit path; and
- reputational/financial-crime risk.

The first cohort should favour assets with simple custody, clear comparable values and low operating complexity. A superyacht is visually powerful but financially difficult: flag state, maritime liens, maintenance, charter operations, crew, insurance and location all complicate ownership. Use yachts as a later flagship category unless a specialist operator and legal/custody stack are already secured.

### 15.5 Platform-level risk limits

At launch:

- no margin or leverage;
- no short selling;
- no customer-to-customer credit;
- no instant redemption against unsettled sale proceeds;
- instrument and issuer concentration caps;
- velocity limits for deposit, trade and redemption;
- enhanced checks for unusually large or rapid flows;
- cooling-off/comprehension gates where required;
- transparent withdrawal holds based on objective risk reasons; and
- an escalation path for vulnerable customers and complaints.

## 16. Delivery roadmap: exchange foundation first

This is not a feature roadmap in which the exchange appears at the end. The exchange, ledgers and legal instrument are the foundation; the visible richness is layered on top.

### Phase 0 — perimeter and product constitution

Decide before implementation:

- launch jurisdictions;
- first asset class;
- legal ownership vehicle and holder rights;
- whether units are shares, notes, beneficial interests or another instrument;
- whether any arrangement is a collective investment scheme or alternative investment fund;
- venue, brokerage, custody, payment/e-money and financial-promotion permissions;
- who safeguards customer money;
- who holds the underlying;
- 1ZE legal nature and redemption promise;
- tax reporting; and
- insolvency treatment of both units and 1ZE.

Output: signed legal perimeter memo, regulated-partner architecture, rights term sheet and customer-funds flow.

### Phase 1 — canonical ledgers and exchange kernel

Build:

- instrument series and rights versions;
- unit and 1ZE double-entry ledgers;
- reservation service;
- idempotent commands;
- deterministic order sequencer;
- price-time matching;
- atomic DvP;
- market states and call auction;
- real execution-derived market data;
- reconciliation and operations console; and
- immutable receipts.

Exit gate: adversarial invariant tests, zero unreconciled balances, recovery drill and independent security review.

### Phase 2 — primary issuance and asset dossier

Build:

- issuer onboarding;
- KYB, beneficial-owner and sanctions checks;
- diligence workflow;
- document versioning;
- subscription/commitment and allocation;
- cooling-off or cancellation rules where applicable;
- opening-auction preparation;
- owner register/nominee integration; and
- cinematic dossier media.

Exit gate: one instrument can be legally issued, allocated, reconciled and opened for trading without manual database edits.

### Phase 3 — secondary market and portfolio

Build:

- book/auction/RFQ mode selection;
- order preview and review;
- partial fills, cancel and replace;
- position and cost-basis accounting;
- realised/unrealised P&L;
- statements;
- surveillance;
- halts and corporate-action suspension; and
- professional liquidity controls.

Exit gate: complete trade lifecycle passes under concurrency, failure injection, market halt and payment outage.

### Phase 4 — clubs and corporate actions

Start with social discovery and coordinated allocations that settle into individual positions. Add pooled or delegated models only after separate legal approval.

Build:

- club mandate and membership;
- non-binding interest;
- funded commitment;
- pro-rata/priority allocation;
- member position receipts;
- distributions;
- votes/elections;
- capital calls;
- tender/buyback; and
- asset sale/liquidation.

Exit gate: entitlements reconcile at record date and every member can explain whether a club owns anything or merely coordinates members.

### Phase 5 — flagship presentation and service

Polish:

- Galleria art direction;
- dossier storytelling;
- market micro-interactions;
- portfolio explanations;
- concierge/RFQ;
- responsive tablet layouts;
- accessibility;
- premium statements;
- support and dispute experiences; and
- reduced-motion/offline/error states.

This polish should run continuously, but it cannot substitute for the earlier foundations.

### Controlled pilot

Launch with:

- one jurisdiction;
- one simple asset class;
- one instrument template;
- a small verified cohort;
- primary issuance plus scheduled call auctions;
- conservative position limits;
- manual operations oversight backed by automated ledgers;
- no leverage;
- no public promise of continuous liquidity; and
- pre-agreed incident and wind-down procedures.

Expand only after measured evidence of reconciliation, comprehension, fair execution and reliable redemption.

## 17. Acceptance criteria and quality gates

### 17.1 Economic correctness

- A user can identify the exact instrument and rights they own.
- Ownership percentage derives from authoritative issued supply.
- Primary issue, NAV, bid, offer, last execution and local-fiat estimate remain distinct.
- Distributions use record-date positions and reconcile exactly.
- Corporate actions never rely on a mutable current-holder snapshot.
- Portfolio P&L separates cash flows, trading gains and distributions.

### 17.2 Exchange correctness

- Two simultaneous sells cannot spend the same unit.
- Two simultaneous buys cannot spend the same 1ZE.
- Partial fills release only the correct residual reservation.
- Cancel/replace preserves sequence and reservation integrity.
- Self-trades are prevented or handled by an approved policy.
- A matching or database failure cannot leave only one DvP leg.
- Market halt blocks new matches while preserving cancel access as policy specifies.
- Book, trades, positions and receipts share deterministic sequence references.

### 17.3 Wallet correctness

- Deposits, reservations, settlements, fees and redemptions balance.
- Available, reserved, pending and withdrawable are independently explainable.
- 1ZE and local-fiat reference never silently substitute for one another.
- Redemption shows amount, fee, rate/source, destination and expected timing.
- Reconciliation breaks stop affected money movement and alert operations.

### 17.4 User-comprehension gate

Before first order, a user must correctly answer:

1. What do I own?
2. What does 1ZE represent?
3. Can the unit price fall?
4. Is there guaranteed liquidity?
5. Who holds the underlying asset?
6. How do distributions and costs work?
7. What happens if the asset is sold or the platform fails?

Failure should lead to explanation and re-attempt, not a dark-pattern dismissal.

### 17.5 Visual and interaction gate

- Every screen has one clear primary action.
- Every market value has a type and timestamp.
- Empty, loading, stale, halted, restricted, failed and offline states are designed.
- Order controls remain usable at 200% text zoom.
- Interactive targets meet platform minimums.
- Charts have textual summaries and do not imply continuity where observations are sparse.
- Destructive actions require clear confirmation but no manipulative friction.
- Skeletons preserve final layout.
- Image loading never move-shifts order controls.
- Price changes are subtle and accessible; no casino-like flashes, confetti or urgency theatre.

### 17.6 Performance targets

Set and measure device-class budgets rather than claiming “instant”:

- input response under 100 ms for local interaction;
- order preview p95 under 500 ms under normal operating conditions;
- acknowledgement p95 under 750 ms excluding explicit auction timing;
- visible market-data staleness indicator before the data can become misleading;
- stable 60 fps for core scroll and sheet transitions on supported devices;
- no cumulative layout shift around price, wallet or order controls; and
- graceful degradation on slow networks with no duplicate submission.

### 17.7 Security and resilience gate

- threat model covers account takeover, payment fraud, ledger manipulation, insider misuse and market abuse;
- privileged actions require strong authentication and maker-checker where appropriate;
- secrets and signing keys are segregated;
- customer and market logs are tamper-evident;
- reconciliation and recovery are tested from backups;
- incident communications are designed in product; and
- a wind-down test shows how users access 1ZE claims, statements and ownership records.

## 18. Metrics that reveal whether the market is working

### Trust and comprehension

- disclosure completion and comprehension pass rate;
- support contacts per first order;
- percentage of users who can distinguish NAV from last price;
- redemption success and time-to-funds;
- complaints by instrument and journey; and
- expired-document exposure incidents.

### Market quality

- quoted spread by instrument and session;
- depth within one, two and five percent;
- order-to-execution rate;
- median and tail time-to-fill;
- auction participation and uncrossed imbalance;
- cancellation rate;
- price impact by order size;
- stale-price duration;
- concentration of volume by participant;
- self-trade/wash alerts;
- halt frequency; and
- execution-to-ledger reconciliation breaks.

### Ownership and asset health

- issued versus reconciled units;
- holder concentration;
- distribution coverage;
- reserve sufficiency;
- appraisal age;
- variance of operating cost versus budget;
- delinquent capital calls;
- insurance/custody exceptions; and
- time to execute an asset-level exit.

### Funnel and club quality

- dossier-to-rights-document engagement;
- rights-document-to-watchlist;
- watchlist-to-funded 1ZE;
- funded-to-first-order;
- preview abandonment by reason;
- club interest-to-funded commitment;
- allocation fairness complaints; and
- repeat participation without incentive dependence.

Do not optimise raw trading frequency as the headline metric. For illiquid assets, fair access, reliable ownership, healthy liquidity and successful exits matter more than casino-like activity.

## 19. Product decisions that cannot remain ambiguous

The team must record a single accountable answer for each:

1. What exact legal claim does one unit confer?
2. Does each asset have its own vehicle?
3. Who is the legal holder of the underlying?
4. Is Thryftverse principal, agent, venue, arranger, custodian, operator or a combination?
5. What exactly is 1ZE, who issues it and what backs redemption?
6. Is one 1ZE fixed to one unit of a fiat currency or floating?
7. Where are customer funds safeguarded?
8. Which market mode applies to each liquidity tier?
9. Who can provide liquidity and how are conflicts disclosed?
10. How are valuations commissioned and challenged?
11. What costs are charged at asset, vehicle, market and wallet level?
12. What happens on platform, issuer, custodian or asset-operator failure?
13. How can an owner exit when no buyer exists?
14. Which decisions can owners vote on?
15. What can a club do before it becomes a pooled or managed arrangement?
16. Which customer segments and jurisdictions are excluded at launch?

If these answers are absent, visual polish will make the risk harder to see; it will not make the product flagship.

## 20. Final recommendation

Reconstruct Co-Own around three explicit layers:

1. **Galleria** — curated desire, provenance, discovery and trust.
2. **Exchange** — instrument identity, market rules, orders, auctions/RFQ, executions and surveillance.
3. **Clearing ownership layer** — authoritative unit ledger, 1ZE ledger, DvP, distributions, governance, redemption and records.

The user's conceptual correction is right: this should feel and function much closer to a stock exchange than a shared-shopping feature. The crucial refinement is that 1ZE is the common settlement currency, while ownership lives in finite asset-specific units. A customer buys 37 units of Yacht Series Y-01 for 4,995 1ZE; they do not buy a generic percentage stored on a listing row.

The immediate build priority is therefore:

- settle the legal instrument and 1ZE perimeter;
- create separate authoritative ledgers;
- implement reservation, deterministic matching and atomic DvP;
- migrate existing positions by reconciliation;
- launch primary issuance and scheduled auctions for one simple cohort;
- add corporate actions and club allocations; and
- present the system through a calm, image-led Galleria with exchange-grade detail beneath it.

Do not rely on “in-game currency” wording. A redeemable 1ZE used to buy and sell economically meaningful asset ownership can still fall within payments, e-money, cryptoasset, securities, trading-venue, collective-investment, promotion, AML and consumer-protection rules depending on its legal design and jurisdiction. Substance, rights and flows determine the perimeter.

## 21. Official research sources

The regulatory notes in this report are product-risk guidance, not a legal opinion. Obtain jurisdiction-specific advice before issuing 1ZE, taking customer money, marketing units or operating a market.

- [FCA — Electronic money and payment institutions](https://www.fca.org.uk/firms/electronic-money-payment-institutions)
- [FCA — Safeguarding requirements for payment and e-money institutions](https://www.fca.org.uk/firms/emi-payment-institutions-safeguarding-requirements)
- [FCA — Cryptoassets: regulation and security/e-money token perimeter](https://www.fca.org.uk/firms/cryptoassets)
- [FCA — Consumer Duty](https://www.fca.org.uk/firms/consumer-duty)
- [FCA — InvestSmart consumer-risk guidance](https://www.fca.org.uk/investsmart)
- [FCA — Market abuse and reporting suspected abuse](https://www.fca.org.uk/markets/market-abuse/how-report-suspected-market-abuse-firm-or-trading-venue)
- [FCA Handbook — MAR 5: Multilateral trading facilities](https://www.handbook.fca.org.uk/handbook/MAR/5/)
- [UK legislation — Financial Services and Markets Act 2000, section 235: collective investment schemes](https://www.legislation.gov.uk/ukpga/2000/8/section/235)
- [Bank of England and FCA — Digital Securities Sandbox](https://www.bankofengland.co.uk/financial-stability/digital-securities-sandbox)
- [CFTC — Polymarket enforcement order, illustrating that interface/technology does not remove market-law obligations](https://www.cftc.gov/PressRoom/PressReleases/8478-22)
- [Apple — App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

---

Report basis: repository branch coown-master-complete-flagship-reconstruction at commit 93bcbbd1f87e9a2d624bddd13515c1e3cfb24ec5, inspected 16 July 2026. Reference screenshots supplied by the user were used as visual-quality benchmarks; their commercial and regulatory mechanics were not assumed from appearance alone.
