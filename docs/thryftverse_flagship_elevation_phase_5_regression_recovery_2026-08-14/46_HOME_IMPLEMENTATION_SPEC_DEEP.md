# Home V5 — Deep Implementation Specification

> Audit date: 2026-08-14  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Purpose

This document is intentionally implementation-heavy because the Home regression is not solvable by changing one font size. It is a **presentation-model problem**.

The current Home implementation has two different ideas of a product card:
- a richer generic `ProductCardV2`;
- a custom Home/Explore grid tile optimized around media and a very small amount of metadata.

That split is acceptable only if each component has a clearly named role and both consume the same normalized product truth.

## 1. Introduce a presentation model

Do not pass the broad domain Listing object directly into a Home card.

```ts
export interface HomeDiscoveryItemVM {
  id: string;
  media: {
    uri: string;
    kind: 'image' | 'video';
    width?: number;
    height?: number;
    posterUri?: string;
    focalPoint?: { x: number; y: number };
  };

  identity: {
    primary: string;
    secondary?: string;
  };

  price: {
    currentMinor: number;
    originalMinor?: number;
    currency: string;
  };

  context?:
    | { kind: 'price_drop'; text: string }
    | { kind: 'size_match'; text: string }
    | { kind: 'followed_seller'; text: string; avatarUrl?: string }
    | { kind: 'ending_soon'; text: string }
    | { kind: 'reason'; text: string };

  badges: Array<'boosted' | 'authenticated'>;
  saved: boolean;
  route: ProductRoute;
}
```

The view model decides what is useful to display. It does not invent missing facts.

## 2. Identity synthesis belongs in a normalizer

Do not create title fallbacks inside JSX.

Category-aware examples:

### Apparel with brand
`Acne Studios wool scarf`

### Brandless vintage
`Vintage leather shoulder bag`

### Sneakers
`Nike Air Max 95`

### Fragrance
`Maison Francis Kurkdjian Baccarat Rouge 540`

### Unknown brand but valid category
Use structured product/category facts, never `Unknown`.

If no honest identity can be produced, the listing should be flagged upstream rather than silently becoming an anonymous active item.

## 3. Home layout variants

### Standard two-column
Use for ordinary products.

```
MEDIA
identity
price
context? 
```

### Tall visual
Same data contract, taller media.
Do not use additional metadata just because tile is taller.

### Followed seller
Show seller identity because the feed scope is relationship-driven.

### Live auction
Use timer/current-bid overlay because it is role-specific.

### Look/Poster
Do not force commerce card underneath. Creator identity and format behavior are separate.

## 4. Media ratio algorithm

The feed should not be random.

```ts
function clampDiscoveryAspectRatio(source?: number) {
  if (!source) return DEFAULT;
  return clamp(source, MIN_DISCOVERY_RATIO, MAX_DISCOVERY_RATIO);
}
```

Recommend visually testing a range roughly equivalent to:
- landscape minimum;
- square;
- portrait;
- tall portrait.

Do not let one extreme panoramic image produce a tiny unusable cell.

## 5. Masonry height stability

The height is known before image decode using:
- server width/height;
- normalized ratio;
- fallback category ratio.

If backend media dimensions are missing, collect the deficiency in telemetry.

Do not wait for `onLoad` then resize the cell.

## 6. Price placement decision

For standard Home commerce:
prefer below-image price.

Advantages:
- no gradient needed;
- price is always legible;
- card becomes recognizably commerce;
- image remains clean;
- backend sparse identity issues are easier to notice during QA.

Keep overlay price for:
- auction/live role;
- editorial media where separate line would damage composition.

## 7. Save action

Visible glyph can sit over media, but hit target remains >= platform requirement.

States:
- unsaved;
- saving optimistic;
- saved;
- failure rollback.

No success toast for routine saves.

## 8. Price drop

Only render if backend supplies current and comparison basis truthfully.

Use:
`£86  £110`
then optional `Price dropped`.

Do not calculate percentage from ambiguous original/retail price unless semantics are clear.

## 9. Boosted/promoted

If the marketplace has promoted listings:
label truthfully and consistently.
The label should not look like a recommendation-quality badge.

## 10. Accessibility

Card accessible label:
`Acne Studios wool scarf, 86 pounds. Price dropped.`

Separate Save action remains independently accessible.

Do not expose decorative media labels.

## 11. Full-stack data parity

Run the exact same `toHomeDiscoveryItemVM` on:
- fixture DTO;
- integration DTO;
- production DTO.

There is no `if (isMock) richerTitle`.

## 12. Telemetry

Measure:
- card open;
- save;
- long press;
- media failure;
- anonymous-identity fallback;
- missing-dimension fallback;
- card type.

Important production quality signals:
- percentage of active Home items needing identity fallback;
- percentage missing media dimensions;
- percentage with only one media;
- percentage filtered by client completeness.

If any of these are high, fix data ingestion/backend listing quality rather than decorate UI.

## 13. Scroll art direction

Review ten consecutive rows.

Reject:
- five consecutive near-identical portrait ratios;
- two large interruptions adjacent;
- too many dark images clustered if re-ranking/display system can avoid visual monotony without violating relevance;
- repeated same seller context;
- repeated same editorial format.

Do not reorder merely by color for aesthetics unless product explicitly chooses visual diversity as a ranking feature. Instead use permitted display treatment and semantic interruptions.

## 14. Empty and sparse feed

If recommendations are sparse:
- continue with truthful general inventory;
- explain personalization only where needed;
- no giant “nothing here” if marketplace has available inventory.

If Following is empty:
show:
`Follow sellers and creators to see their new items here`
with an action to discover people.

Do not inject fabricated followed sellers.

## 15. Performance contract

At p95:
- first meaningful media should render rapidly from cache/network;
- no re-layout after image decode;
- no more than one auto-playing video;
- prefetch next visible window;
- cancel offscreen video work.

## 16. PR acceptance proof

A Home-card PR must include:
1. screenshot of 20 fixture records;
2. screenshot of same screen against integration seed;
3. long-title example;
4. brandless example;
5. missing seller avatar;
6. price drop;
7. auction tile;
8. video;
9. dark mode;
10. small Android.

The reviewer should compare commerce recognition, not pixel identity.
