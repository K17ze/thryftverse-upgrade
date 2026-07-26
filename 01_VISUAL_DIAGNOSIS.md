# 01 — VISUAL DIAGNOSIS

## Evidence

The supplied Android captures show the current Co-Own detail page in:

- top identity/value state;
- ownership and price-chart state;
- rights/valuation/risk state;
- full media hero state.

## Root problem

This is not a missing-feature problem. It is a composition problem.

The page contains many correct components, but they are arranged as independent boxes. The visual hierarchy repeatedly resets instead of carrying one continuous product narrative.

## P0 defects visible in the captures

### 1. Equal-width value strip fails on phone

The Market / Fundamental / Cash strip gives all three concepts identical width.

Consequences:

- bid and ask collide;
- labels and captions overlap;
- values wrap unpredictably;
- empty information occupies the same space as live information;
- the strongest market fact does not dominate.

A phone cannot present a trading summary as a three-column desktop table.

### 2. The product title is oversized and disconnected

The title becomes the entire second viewport after the hero.

Problems:

- title size competes with the product image;
- “CO-OWN · LISTING” adds another label without adding useful meaning;
- the Watch button floats as a separate card;
- issuer identity is delayed and repeated later;
- first actionable market context appears too late.

### 3. Price is repeated

`85.00 1ZE` appears in:

- the value strip;
- the ownership panel;
- the chart header;
- the sticky dock when trading is enabled.

Repeated hierarchy makes the page longer without making it clearer.

### 4. Ownership is rendered as an oversized accounting card

The current “Your stake” panel combines:

- market status;
- unit price;
- full supply ledger;
- allocation;
- viewer position;
- settlement mode;
- fee.

This creates a large generic grey box and a second nested grey box.

The most personal information—“you own 5 units / 5%”—is visually weaker than generic authorised/issued supply rows.

### 5. The chart contradicts its own unavailable state

The screen can show:

- `+0.0%`
- “Unable to load price data”

at the same time.

A missing market movement must not be converted to zero. No data is not flat performance.

### 6. Empty chart controls remain visible

When price history cannot load, the page still shows:

- 1D / 1W / 1M / ALL;
- volume;
- line/candle mode;
- large blank chart space.

Controls for unavailable content make the state feel broken rather than deliberate.

### 7. The persistent Rights incomplete dock dominates the page

The bottom warning:

- occupies a large permanent area;
- covers content;
- has no direct action;
- repeats the rights problem;
- looks like an oversized form validation message;
- becomes the most visible element on every scroll position.

A blocked transaction dock must explain the state and provide the next valid action.

### 8. Header and hero controls are visually heavy

The captures show:

- large rounded-square back/history controls in the collapsed header;
- multiple dark circular controls over media;
- a visible floating gear overlay;
- family/status pills;
- a separate Watch card.

There are too many visible containers around ordinary utility icons.

### 9. Issuer card lacks visual authority

When issuer data is weak or missing, the large issuer card becomes:

- a generic avatar;
- “Issuer”;
- “Co-Own issuer”;
- a message icon.

It consumes substantial height without adding confidence.

### 10. Risk disclosure is a long static block

Five large bullets inside another rounded card create legal-document density.

The full disclosure should exist, but the default detail flow should show:

- a compact risk summary;
- the most important distinction;
- an entry to the complete rights/risk sheet.

### 11. Buyout language is contradictory

The page can state that full-asset buyout is not supported while showing a “Buyout options” row.

Every exit route must be named according to what actually exists.

### 12. Excessive card repetition

Visible silhouettes include:

- value card;
- issuer card;
- ownership card;
- nested position card;
- chart card;
- risk card;
- rights row card;
- buyout row card;
- sticky warning card.

Flagship product pages use whitespace, dividers and grouped rhythm—not a rounded rectangle around every concept.

## Current code causes

The current implementation intentionally renders:

- `CoOwnValueStrip`
- `CoOwnIssuerCard`
- `CoOwnOwnershipPanel`
- `CoOwnPriceChart`
- `CoOwnRiskDisclosure`
- `CoOwnStickyActionDock`

as separate surfaces, each with its own border, radius, padding and heading.

`CommerceMediaStage` also exposes share, save and favourite as separate visible circular controls. Auction adds an additional Watch control. The result is control multiplication.

## Required transformation

Move from:

> media + title + card + strip + card + card + card + warning

to:

> media → identity → family transaction story → personal context → product evidence → confidence/disclosures → discovery → action dock
