# Co-Own Asset Detail Premium Compression Prompt

## Scope

Primary screen:

`frontend/src/screens/AssetDetailScreen.tsx`

Relevant components and services:

- `CoOwnPriceChart`
- `CoOwnCandleChart`
- `CoOwnAssetDossier`
- `CoOwnTrustPanel`
- `CoOwnRiskDisclosure`
- `CoOwnSupplySheet`
- `CoOwnRightsSheet`
- `CoOwnOverflowSheet`
- market API and Co-Own backend serializers
- Co-Own holdings/order-book/history services

## Objective

Turn the current improved Co-Own page into a premium product-ownership surface rather than a complete investment portal displayed in one long scroll.

Default page order:

1. Media
2. Identity and issuer
3. Market snapshot
4. Viewer position or availability
5. Compact price history
6. Asset summary
7. Rights summary
8. One related-assets rail
9. Sticky trade dock

Move complete supply, order book, dossier and risk data into sheets or expanded disclosures.

## Mandatory frontend corrections

### 1. Replace the compact-phone three-column fundamentals strip

Current defect:

- NAV;
- Distribution;
- Next report;

use three equal columns.

Required phone layout:

```text
NAV / unit                 Not available
Reporting                  Next report · Not scheduled
Distribution               Not scheduled
```

Alternative:

- one `Fundamentals` disclosure row opening a sheet.

Tablet may use columns only when each column has sufficient width.

### 2. Stop labelling reference price as Last trade without proof

Current defect:

`asset.unitPriceGbp` is displayed as `Last trade`.

Required:

- consume a dedicated market snapshot;
- show `Last settled trade` only when the backend provides it;
- otherwise use `Reference unit price`;
- include `asOf`, stale state and source truth.

### 3. Add authoritative market snapshot endpoint

Implement:

```ts
interface CoOwnMarketSnapshot {
  lastExecutionPriceGbp: number | null;
  lastExecutionAt: string | null;
  change24hPct: number | null;
  volume24hGbp: number | null;
  tradeCount24h: number;
  bestBid: CoOwnBookLevel | null;
  bestAsk: CoOwnBookLevel | null;
  spreadGbp: number | null;
  asOf: string;
  sequence: number | null;
  state: 'live' | 'stale' | 'unavailable';
}
```

The backend must derive these from settled executions and executable order-book state.

The client must render:

- live;
- stale;
- unavailable;

without converting missing values to zero.

### 4. Hide candle mode without real candle data

Current defect:

`CoOwnCandleChart` receives `candles={[]}`.

Required:

- only expose the line/candle toggle when real OHLC candles exist;
- add backend candle endpoint or remove candle mode;
- do not pass an empty candle component merely to satisfy a layout path.

### 5. Collapse the asset dossier

Default summary: maximum five decision facts.

Suggested facts:

- Authenticity
- Condition
- Storage
- Insurance
- Latest appraisal

Then:

`View full asset dossier`

The complete sheet may include:

- provenance;
- inspection report;
- custody/storage provider;
- policy reference;
- appraisal method;
- valuation range;
- valuer;
- next appraisal.

Do not render `—` rows. Omit missing rows.

### 6. Correct supply semantics

Do not infer:

- treasury units;
- authorised units;
- issued units;
- public float;
- sponsor locked.

Add explicit nullable backend fields.

Until available:

- use `Available units`;
- use `Allocated units`;
- use `Holder count`;
- omit treasury language.

### 7. Correct holder action priority

For a holder:

- primary: `Sell`;
- secondary: `Buy more`.

For a non-holder:

- primary: `Buy units`.

For fully allocated:

- offer one real next action:
  - `View order book`;
  - `Watch asset`;
  - `Place limit order` when supported.

### 8. Compress rights and risks

Default:

- critical ownership distinction;
- completion state;
- `Review rights`;
- first two risks;
- `View all risks`.

Do not repeat the same ownership warning in multiple components.

### 9. Limit discovery

Use one related-assets rail.

Do not render all returned generic recommendation sections.

### 10. Make the price chart truly responsive

Remove fixed chart coordinate width.

Use:

- measured layout width;
- responsive SVG viewBox;
- or a chart library configuration tied to the actual container width.

Test 320, 360, 390 and 430 widths.

## Visual direction

- Product image remains dominant.
- Market surface is precise and calm.
- Use deep neutral, navy, green and red only for factual states.
- No crypto-exchange visual noise.
- No dense multi-column phone dashboards.
- No repeated price.
- No card inside card.
- All numeric values use tabular numerals.

## Required tests

Add coverage for:

- reference price vs settled last trade;
- market snapshot live/stale/unavailable;
- no candle toggle without data;
- no inferred treasury label;
- holder Sell primary;
- fully allocated next action;
- compact fundamentals layout;
- omitted missing dossier rows;
- one discovery rail maximum;
- responsive chart width.

## Commit

`feat(coown-detail): compress asset ownership experience and add market truth`
