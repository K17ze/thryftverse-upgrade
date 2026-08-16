# Product Detail — Category-Adaptive Composition

> Audit date: 2026-08-15  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `12cf718d2f4f3c4547044b4e5efcf06890ea4cba`

## Shared shell

Every detail still shares:
- media;
- identity;
- seller;
- price/terms;
- trust;
- action;
- detail;
- continuation.

## Category modules

The page composes category-specific evidence.

### Apparel
size, fit, condition, material.

### Bag
size/material, authenticity/condition.

### Watch
reference/set/service/authentication.

### Car
spec/service/history/inspection.

### Yacht
spec/broker/docs/viewing.

### Art
provenance/condition/logistics.

## Rule

Do not create separate apps.

Use a schema-driven section system where category capabilities decide modules.

## First viewport

High-value objects may show:
- category-specific trust status
close to price,
but should never replace the emotional media stage.

## Primary CTA adapts

- Buy
- Make offer
- Bid
- Enquire
- Request viewing
- Review trade
depending on product family.

## Acceptance

A seller of a watch should never see irrelevant clothing-size UI.
A buyer of a yacht should never see a generic parcel-shipping card.
