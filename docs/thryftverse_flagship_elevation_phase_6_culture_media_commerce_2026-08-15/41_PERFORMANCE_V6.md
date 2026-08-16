# Performance Budget V6

> Audit date: 2026-08-15  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `12cf718d2f4f3c4547044b4e5efcf06890ea4cba`

## Why performance is part of status perception

A soft image, late frame, stutter or delayed keyboard makes an app feel lower tier instantly.

## Budgets

Measure on mid-range Android and current iPhone:
- app interactive;
- Home first image;
- search first result;
- product media;
- camera ready;
- editor ready;
- keyboard response;
- grid scroll;
- video start;
- pinch zoom high-res load.

## Media memory

DPR-aware does not mean always full-res.

Use:
- correct derivative;
- early resizing for grid;
- release video;
- cache budget.

Fullscreen zoom should avoid `enforceEarlyResizing` policies that limit detail.

## Creator

Direct manipulation should remain UI-thread where possible.

Do not run expensive alignment/serialization every frame.

## Upload

Editing continues while upload/processing occurs.

## Storefront

Large visual collections need pagination/virtualization.
