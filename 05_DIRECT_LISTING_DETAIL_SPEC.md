# 05 — DIRECT LISTING DETAIL RECONSTRUCTION

## Goal

Direct listing should become the calmest and most editorial family.

It should feel closer to a premium Depop/Vinted product page than a component showcase.

## Current structural risks

The current direct detail page renders many consecutive modules:

- identity;
- buyer protection;
- attribute chips;
- category evidence;
- description;
- posted date;
- commerce summary;
- authenticity card;
- price insight;
- sync banner;
- seller card;
- Q&A;
- bundle;
- similar grid;
- looks;
- recommendations;
- discovery grid.

Most features are valuable. The problem is that each can become a separate visible section, producing excessive page length and repeated headers/cards.

## Required mobile order

### 1. Media

- Shared media stage.
- Back, Share, Save/Favourite, Overflow.
- Combine collection/save semantics carefully:
  - heart = wishlist;
  - bookmark/collection belongs in overflow or a save sheet.
- Do not display both as equally dominant circular controls.

### 2. Identity

- brand;
- title;
- current price;
- original price/discount when real;
- one buyer-protection total line;
- compact interest signal;
- key attributes in one quiet row.

Do not make every attribute a filled pill.

### 3. Seller confidence

Move seller identity closer to the purchase decision.

Compact row:

- avatar;
- username;
- verification;
- rating/reviews;
- location or dispatch speed;
- Follow / Message as quiet actions.

Full seller card may expand from the row.

### 4. Purchase details

Group:

- shipping;
- buyer protection;
- returns;
- authenticity;
- payment context.

Use a compact summary plus disclosure sheet.

Do not render a separate bordered strip for every policy.

### 5. Product details

- description;
- condition;
- category evidence;
- measurements/specifications;
- posted date as low-priority metadata.

### 6. Price insight

Only render facts that are genuinely supported.

- price drop;
- sold comparables;
- alert;
- price history.

No fabricated history from current price plus original price.

No visual “market insight” block when the backend cannot support it.

### 7. Social proof and Q&A

- public Q&A remains;
- compact collapsed state by default;
- show count and latest answer;
- full discussion opens on demand.

### 8. Discovery

Order:

1. More from this seller;
2. Bundle opportunity;
3. Seen in Looks;
4. More like this;
5. Continue exploring.

Avoid rendering both a similar grid and multiple recommendation rails with overlapping inventory.

### 9. Sticky dock

Buyer:

- price;
- `Buy now`;
- `Make offer` if enabled.

Seller:

- `Manage listing`.

Sold/unavailable:

- factual state;
- one relevant next action.

## Existing files to reconstruct

- `frontend/src/screens/ItemDetailScreen.tsx`
- `frontend/src/components/product/ProductDetailHeader.tsx`
- `frontend/src/components/product/ProductIdentitySummary.tsx`
- `frontend/src/components/product/ProductAttributeChips.tsx`
- `frontend/src/components/product/ProductCommerceSummary.tsx`
- `frontend/src/components/product/BuyerProtectionStrip.tsx`
- `frontend/src/components/product/SellerTrustCard.tsx`
- `frontend/src/components/product/PriceInsightStrip.tsx`
- `frontend/src/components/product/ListingQA.tsx`
- `frontend/src/components/product/ProductActionBar.tsx`
- shared commerce detail primitives.

Do not degrade existing save, collection, offer, checkout, seller, Q&A, recommendation or analytics behaviour.
