# Sell / Listing Creation V5

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Phase 5 focus

Data quality is now directly tied to Home/Search visual quality.

The seller flow is not just a form. It is the source of the marketplace’s visual dataset.

## Category-aware requirements

Current frontend `DisplayReadyListing` effectively expects universal:
- brand;
- size;
- condition;
- category;
etc.

This is too blunt.

Examples:
- vintage/handmade may be valid without brand;
- some categories have no size;
- other categories need dimensions instead.

Backend owns category schema.

## Listing contract

For each category define:
- required facts;
- recommended facts;
- evidence media prompts;
- search facets;
- Home identity strategy.

## Media

eBay supports many photos and a listing video; Vinted emphasizes real-item/flaw photos; Depop emphasizes accurate details/flaws.

Thryftverse:
- cover;
- additional views;
- flaw evidence;
- authenticity evidence where relevant;
- video.

## Intelligent assistance

Suggested price:
`Similar sold: £58–£74 · 18 items`

Suggested field:
inline.

Do not create separate AI card.

## Completeness

Replace generic quality percentage with unresolved actions.

Critical vs helpful.

## Backend validation

An active listing should not be discoverable if it lacks fields required for its category.

Do not let frontend silently filter it later.

## Draft

Cross-device server draft is ideal.
Local draft can exist for resilience but must sync/resolve explicitly.

## Acceptance

Every active backend listing has enough canonical data for:
- Home;
- Search;
- Product Detail;
without fixture enrichment.
