# Home V6 — Editorial Commerce Feed

> Audit date: 2026-08-15  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `12cf718d2f4f3c4547044b4e5efcf06890ea4cba`

## Keep Phase 5 identity floor

Do not regress to image-only cards.

Standard product tile keeps:
- media;
- identity;
- price;
- max one context fact.

## Phase 6 upgrade

The feed gains **authored interruptions**:
- Look;
- Poster;
- collection;
- drop;
- live event.

The interruptions come from real content semantics, not `every 7th item`.

## Image quality

Home grid must use physical-pixel target derivatives.

## Story/Poster lane

Current ~76×135 previews can become too small for expressive typography/content.

Test a more legible story presentation:
- slightly larger cards;
- edge-to-edge image;
- minimal avatar/identity;
while respecting viewport budget.

## Following

Relationship identity can be stronger.

## For You

Object identity stronger.

## Store content

A seller's Drop can appear as one editorial card, not five duplicated listing tiles.

## Long-press

- Similar
- Save
- Hide
- Share
- Report

## Acceptance

Five consecutive viewport screenshots should show:
- cultural rhythm;
- commerce readability;
- no module soup;
- no soft media.
