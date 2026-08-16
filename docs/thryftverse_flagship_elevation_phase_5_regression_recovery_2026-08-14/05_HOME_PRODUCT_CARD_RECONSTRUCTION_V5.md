# Home Product Card Reconstruction V5

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Current regression

Home’s custom tile intentionally removed title/brand and seller avatar to maximize media.
The resulting object can be visually attractive but commercially anonymous.

The Phase 4 repair then reduced the only strong commerce signal — price — further.

## New principle

> **Home is not Pinterest with prices. It is visual commerce.**

Use Pinterest for media rhythm, Depop/Vinted/eBay for commerce recognizability.

## `HomeDiscoveryCard`

At rest:

```text
┌─────────────────┐
│                 │
│      MEDIA      │
│             ♡   │  save may be transient/quiet
└─────────────────┘
Acne Studios scarf
£86
```

Optional third line:
`Your size` / `Price dropped` / `Ends in 12m`

Not:
seller avatar + verified + condition + likes + size simultaneously.

## Identity source precedence

Prefer structured:
1. `brand + productType`
2. clean listing title
3. category-specific fallback

Never use:
`Untitled listing`

for an active marketplace card.

## Price

Put price **below media** for ordinary Home commerce tiles unless overlay is needed for an editorial role.

Benefits:
- no scrim dependency;
- consistent readability;
- more marketplace identity;
- less “image wallpaper” feeling.

Overlay price may remain for:
- live auction;
- video/editorial;
- intentionally cinematic role.

## Card variants

Do not build one universal ProductCard.

- `HomeDiscoveryCard`
- `SearchResultCard`
- `SavedItemCard`
- `RecommendationCard`
- `SellerInventoryRow`
- `AuctionTile`
- `CoOwnInstrumentTile`

Share media primitives and tokens, not entire visual grammar.

## Seller identity

Show in Home only when:
- user follows seller;
- seller/creator identity explains recommendation;
- content is a Look/Poster;
- editorial curation.

## Favorite

If always visible:
- no giant white disk;
- accessible 44pt hit area with small visible glyph;
- adaptive image scrim if required.

Alternatively expose on:
- long press;
- quick overlay;
while maintaining easy save.

## Media ratios

Use source dimensions and role.
Avoid a feed where all cards become same 4:5 rectangle.

Deterministically cap extremes.

## Typography

Identity:
- 13–15sp/pt class;
- medium/semibold only if needed;
- max 2 lines, prefer 1.

Price:
- 14–16;
- semibold/tabular where useful.

Metadata:
- 11–13;
- secondary.

## Skeleton

Skeleton must include:
- media rectangle;
- identity line;
- price line.

A skeleton that only blocks media hides density regressions.

## State tests

- missing brand;
- long title;
- zero seller avatar;
- price drop;
- auction result accidentally appearing;
- video;
- portrait;
- square;
- low-resolution;
- unavailable.

## Acceptance

On five seconds of Home scrolling, a tester must be able to answer:
- “what kinds of products did you see?”
- “roughly what did they cost?”
without opening a card.

That is the difference between **visual shopping** and a bland image wall.
