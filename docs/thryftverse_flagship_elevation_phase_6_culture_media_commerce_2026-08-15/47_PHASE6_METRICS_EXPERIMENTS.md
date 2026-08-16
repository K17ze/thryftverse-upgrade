# Phase 6 Metrics & Experiments

> Audit date: 2026-08-15  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `12cf718d2f4f3c4547044b4e5efcf06890ea4cba`

# Cultural quality cannot be measured by conversion alone

Use multiple dimensions.

## Media
- save/open rate by media resolution role;
- zoom usage;
- image load errors;
- blur complaints;
- upload abandonment.

## Creator
- camera→first edit time;
- first text time;
- Poster completion;
- Look completion;
- media-source swaps;
- advanced-panel usage;
- creator publish;
- viewer replies/product taps.

## Store
- store follows;
- collection opens;
- product taps from Look/Poster;
- enquiries;
- repeat buyer;
- seller share rate.

## High-value
- authentication completion;
- evidence request;
- viewing request;
- qualified lead;
- offer;
- inspection;
- close.

## Experiments

### Creator continuity
A/B:
route-separated camera→studio vs one session.

Primary:
time to first edit, completion, perceived simplicity.

### Typography
Current fake Inter presets vs real small art-directed pack.

Human qualitative review is required; click rate alone is insufficient.

### Home image DPR
current logical-width request vs device-pixel-aware.

Measure:
load time + quality ratings + bytes.

### Storefront
plain profile shop vs collection/drop-led storefront.

Measure:
store follow, product depth, conversion.

## Guardrails
- accessibility;
- data use;
- latency;
- fraud;
- refund;
- moderation;
- seller support burden.
