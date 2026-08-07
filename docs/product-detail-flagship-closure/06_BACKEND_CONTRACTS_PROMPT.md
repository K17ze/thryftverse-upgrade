# Product Detail Backend Contract Closure Prompt

## Scope

Backend and shared API contracts required by:

- Co-Own Asset Detail;
- Auction Detail;
- Direct Listing Detail.

Do not redesign unrelated backend domains.

## Objective

Ensure every premium frontend claim is backed by a dedicated authoritative contract.

## P0 — Co-Own market snapshot

Add endpoint:

`GET /co-own/assets/:assetId/market-snapshot`

Response:

```ts
interface CoOwnMarketSnapshot {
  assetId: string;
  referenceUnitPriceGbp: number | null;
  lastExecutionPriceGbp: number | null;
  lastExecutionAt: string | null;
  change24hPct: number | null;
  volume24hGbp: number | null;
  tradeCount24h: number;
  bestBid: {
    unitPriceGbp: number;
    units: number;
  } | null;
  bestAsk: {
    unitPriceGbp: number;
    units: number;
  } | null;
  spreadGbp: number | null;
  asOf: string;
  sequence: number | null;
  state: 'live' | 'stale' | 'unavailable';
}
```

Rules:

- use settled executions for last trade, movement and volume;
- use executable open orders for best bid/ask;
- missing values remain null;
- never convert null to zero;
- include server timestamp;
- include stale/unavailable state.

## P0 — Co-Own fundamentals and supply

Add explicit nullable fields:

```ts
interface CoOwnFundamentals {
  navPerUnitGbp: number | null;
  navValuedAt: string | null;
  appraisalMethod: string | null;
  appraisalValuer: string | null;
  nextAppraisalAt: string | null;
  nextReportAt: string | null;
  nextDistributionAt: string | null;
  distributionStatus: 'scheduled' | 'not_scheduled' | 'unavailable';
}

interface CoOwnSupplyStructure {
  authorisedUnits: number | null;
  issuedUnits: number | null;
  publicFloatUnits: number | null;
  treasuryUnits: number | null;
  sponsorLockedUnits: number | null;
}
```

Do not infer these from available units.

## P0 — Auction media

Add canonical media records and return them in auction detail.

Maintain `imageUrl` temporarily for compatibility.

## P0 — Auction result and fulfilment

Add:

```ts
interface AuctionResultSummary {
  auctionId: string;
  winningBidGbp: number | null;
  winnerUserId: string | null;
  orderId: string | null;
  paymentStatus: string;
  fulfilmentStatus: string;
  buyerNextAction: string | null;
  sellerNextAction: string | null;
}
```

The frontend must not invent next steps.

## P1 — Direct listing engagement

Add:

```ts
interface ListingEngagementSummary {
  listingId: string;
  likes: number;
  wishlistCount: number | null;
  collectionSaveCount: number | null;
  activeOfferCount: number | null;
  questionCount: number;
  answeredQuestionCount: number;
  generatedAt: string;
}
```

## P1 — Sold comparables

Add authoritative sold-comparables endpoint with:

- defined matching rules;
- sample size;
- min/median/max;
- currency;
- date range;
- generated-at timestamp.

## P1 — Listing price history

Add real listing price events:

```ts
interface ListingPriceEvent {
  previousPrice: number;
  newPrice: number;
  currency: string;
  changedAt: string;
}
```

Do not derive history from only original price and current price.

## P1 — Q&A summary

Add compact summary endpoint:

- question count;
- answered count;
- latest answered question;
- latest answer;
- latest activity timestamp.

## Validation and persistence

Add:

- schema validation;
- integration tests;
- null-preservation tests;
- timestamp tests;
- authorization tests;
- concurrency tests for order-book snapshot where relevant;
- pagination where history can grow;
- indexes for settled executions and comparables queries.

## API compatibility

- do not remove existing fields in the same commit;
- add new fields/endpoints;
- migrate frontend;
- deprecate old fields in a later controlled pass.

## Required tests

- null remains null;
- zero remains legitimate zero;
- settled-only last trade;
- stale state;
- empty order book;
- auction winner and no-bid result;
- engagement counts;
- comparables sample and date range;
- no client-side fabrication required.

## Commit

`feat(api): add authoritative product-detail market and insight contracts`
