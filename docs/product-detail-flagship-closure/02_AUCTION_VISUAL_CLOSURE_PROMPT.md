# Auction Detail Visual Closure Prompt

## Scope

Primary screen:

`frontend/src/screens/AuctionDetailScreen.tsx`

Relevant components and services include:

- shared commerce detail primitives;
- `AuctionStateBadge`;
- `AuctionCountdown`;
- `ReserveStatusBadge`;
- `BidSheet`;
- `BuyNowSheet`;
- auction market API types;
- auction result and fulfilment flows;
- recommendation and media components.

## Objective

Make Auction Detail the clearest and most focused of the three product families.

It must communicate, in order:

1. What is being auctioned?
2. What is the current actionable state?
3. What is the minimum next action?
4. How much time remains?
5. Am I leading, outbid, watching, selling, won or lost?
6. What happens next?

## Mandatory frontend corrections

### 1. Remove duplicated price hierarchy

Current defect:

- `CommerceDetailIdentity` receives `primaryValue={priceText}`;
- `CommerceDetailTransactionSurface` also receives `primaryValue={priceText}`.

Required:

- identity contains brand, title and condition only;
- transaction surface owns current bid / starting bid;
- sticky dock owns minimum next bid or action state.

Do not show the same current bid three times in the first two viewports.

### 2. Remove duplicated auction family/state treatment

Current defect:

- media contains `AuctionStateBadge`;
- identity contains `ProductFamilyBadge family="auction"`.

Required:

- retain one compact media overlay such as `Auction · Live`;
- remove the second identity family/state chip;
- do not add another badge elsewhere.

### 3. Consolidate bid history

Current defect:

- section title;
- disclosure row with the same label;
- three preview rows;
- “View all” link.

Choose one mobile pattern:

Preferred:

- section label `Bid activity`;
- latest bid row;
- bid count;
- one `View all bids` action.

Do not show both a disclosure row and a three-row preview.

### 4. Eliminate terminal-state duplication

Current defect:

- terminal result module appears in the body;
- terminal state appears again in the sticky dock.

Required:

- body owns detailed result;
- dock contains action only;
- or remove the body result and let the dock own the result.

Do not repeat `You won`, `Auction closed`, `Sold` or `Ended without bids` twice.

### 5. Create a coherent Item Details section

Wrap:

- description;
- category evidence;
- condition;
- authenticity;
- fulfilment summary;

inside one deliberate `Item details` section.

Do not leave description and evidence as independent unlabelled blocks.

### 6. Correct compact dock geometry

Current defect:

- secondary label can be `Buy Now · £X`;
- first button plus price cluster can overflow.

Required:

- button labels: `Place bid`, `Bid again`, `Increase bid`, `Buy now`;
- price stays above buttons or inside the transaction surface;
- compact widths may stack buttons or allow primary to consume full width;
- no truncated action labels.

### 7. Add proper multi-media support

Replace single `imageUrl` dependence with canonical media:

```ts
interface AuctionMediaItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  focalX: number | null;
  focalY: number | null;
  posterUrl: string | null;
  order: number;
}
```

Maintain `imageUrl` only as a temporary compatibility field.

The detail screen must render the canonical media array through `CommerceMediaStage`.

### 8. Complete winner/seller next-step truth

Add a backend-backed result/fulfilment contract:

```ts
interface AuctionFulfilmentSummary {
  orderId: string | null;
  paymentStatus:
    | 'not_started'
    | 'pending'
    | 'authorised'
    | 'paid'
    | 'failed'
    | 'refunded';
  fulfilmentStatus:
    | 'not_started'
    | 'awaiting_seller'
    | 'awaiting_buyer'
    | 'ready_to_ship'
    | 'shipped'
    | 'delivered'
    | 'completed'
    | 'cancelled';
  buyerNextAction: string | null;
  sellerNextAction: string | null;
}
```

Do not show “Fulfilment not yet available” as the final product state.

### 9. Reduce lower-page recommendation density

Maximum:

- one related-auctions rail;
- one Seen in Looks rail when genuine;
- no generic duplicate recommendation rails after that.

## Visual direction

- Current bid is the dominant number.
- Countdown is the second-most important fact.
- Reserve is quiet unless unmet.
- Viewer state is one calm line.
- Red only indicates outbid, error or genuine urgent final stage.
- Avoid generic finance-card aesthetics.
- Use tabular numerals.
- No aggressive pulsing.
- Respect reduced motion.

## Required tests

Add coverage for:

- identity has no price;
- identity has no second auction badge;
- bid history uses one presentation pattern;
- terminal state is not duplicated;
- compact dual-action layout;
- canonical media array;
- won/lost/seller/cancelled fulfilment states;
- server clock and bidding logic remain unchanged.

## Commit

`feat(auction-detail): complete flagship hierarchy and fulfilment closure`
