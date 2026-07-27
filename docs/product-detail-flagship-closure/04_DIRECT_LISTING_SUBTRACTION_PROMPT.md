# Direct Listing Detail Subtraction Prompt

## Scope

Primary screen:

`frontend/src/screens/ItemDetailScreen.tsx`

Relevant components/services:

- shared commerce detail primitives;
- listing API contract;
- recommendation services;
- price alert API;
- Q&A;
- seller trust;
- engagement and analytics;
- `BottomSheet`;
- checkout and offer routes.

## Objective

Make Direct Listing the calmest and most editorial detail family.

The page should prioritise:

1. Media
2. Brand/title/price
3. Seller confidence
4. Purchase confidence
5. Item details
6. Compact social proof
7. Three discovery modules maximum
8. Buy/offer dock

## Mandatory frontend corrections

### 1. Remove fabricated people-interested count

Current defect:

`likes + current viewer saved boolean`

is displayed as “people interested.”

Required:

- never synthesize a people count;
- use literal `X likes` when only likes exist;
- use backend `wishlistCount` or `saveCount` when provided;
- omit the interest line when no authoritative aggregate exists.

### 2. Do not relabel likes as Demand

Current defect:

`Demand — X likes`

Required:

- label `Likes`;
- or remove this row from Price insight;
- only show `Demand` when the backend provides a defined demand metric.

### 3. Move sold comparables to an authoritative backend endpoint

Add:

```ts
interface ListingSoldComparables {
  listingId: string;
  category: string | null;
  brand: string | null;
  currency: string;
  sampleSize: number;
  minPrice: number | null;
  medianPrice: number | null;
  maxPrice: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  generatedAt: string;
}
```

The server must define comparison criteria.

Do not derive comparables from whichever listings happen to be loaded in client context.

### 4. Remove duplicate purchase-detail summary

Choose one:

Preferred:

- one compact purchase-confidence summary;
- one `View purchase details` disclosure opening a sheet.

Alternative:

- individual rows without a summary paragraph.

Do not show both.

### 5. Collapse Q&A

Default:

- question count;
- latest answered question;
- `View all questions`.

Open full Q&A in a sheet or dedicated view.

Do not render the entire Q&A module by default.

### 6. Reduce discovery to three modules maximum

Recommended order:

1. More from this seller / Bundle
2. Seen in Looks
3. Similar items

Do not simultaneously render:

- bundle;
- local similar grid;
- recommendation rails;
- continue-exploring grid;
- duplicate seller rail.

General discovery should load only after user action or at the end of a separate explore flow.

### 7. Replace the local overflow overlay

Use the canonical `BottomSheet`.

The sheet should contain:

- wishlist toggle;
- save to collection;
- report listing;
- copy/share link when appropriate.

Do not implement another absolute-positioned local sheet.

### 8. Use canonical production listing types

Remove dependency on types from mock-data modules.

All canonical screen types must come from:

- listing API contracts;
- shared domain models;
- product-detail view model.

### 9. Add authoritative engagement summary

Backend contract:

```ts
interface ListingEngagementSummary {
  likes: number;
  wishlistCount: number | null;
  collectionSaveCount: number | null;
  activeOfferCount: number | null;
  questionCount: number;
  answeredQuestionCount: number;
  generatedAt: string;
}
```

Render only fields that are available.

### 10. Preserve existing behaviour

Do not regress:

- Buy now;
- Make offer;
- Checkout;
- Manage listing;
- Save to collection;
- Wishlist;
- Follow;
- Message seller;
- Price alert;
- Size guide;
- Analytics;
- Fullscreen media;
- Sold/unavailable states.

## Visual direction

- Direct listing uses the least containment.
- Identity is flat.
- Seller row is quiet.
- Purchase confidence is concise.
- Description is editorial.
- Price insight appears only when authoritative.
- Lower discovery should not become an infinite home feed.

## Required tests

Add coverage for:

- no fabricated interested count;
- no Demand-from-likes label;
- server comparables contract;
- one purchase-detail presentation;
- collapsed Q&A;
- maximum three discovery groups;
- canonical BottomSheet;
- canonical listing types;
- engagement summary null handling.

## Commit

`feat(item-detail): subtract duplicate content and add authoritative insights`
