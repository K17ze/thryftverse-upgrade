# Seller Migration & Import Strategy

> Audit date: 2026-08-15  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `12cf718d2f4f3c4547044b4e5efcf06890ea4cba`

## Goal

Make moving an existing store **lower effort than maintaining the old workflow**.

## Import methods

Only use official/permitted integrations.

Potential:
- CSV inventory;
- bulk photo upload;
- catalogue API;
- eBay/API connectors where terms permit;
- Shopify/export integrations where appropriate;
- manual camera-roll batch intake.

Do not scrape social platforms or bypass platform terms.

## Smart intake

Batch source:
- group related photos;
- suggest cover;
- identify duplicate images;
- draft title/category;
- extract EXIF orientation only;
- prompt seller to confirm all commerce facts.

## Draft table

Seller sees:
- media;
- title;
- price;
- stock;
- status;
- missing evidence.

Bulk actions:
- set shipping;
- category;
- collection;
- publish.

## Existing social audience

Provide:
- share store link;
- share product link;
- export/share Poster;
- QR/store card.

The moat is not blocking cross-posting. It is making Thryftverse the source of truth for inventory and transactions.

## Seller onboarding

Ask:
- personal/business seller;
- categories;
- location;
- shipping region;
- payout;
- verification.

Do not begin with a 20-step compliance form unless required.
Use progressive activation gates.
