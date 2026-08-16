# Backend ↔ Frontend Contract Test Plan

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Shared schema

Choose:
- OpenAPI-generated types;
- Zod package shared through workspace;
- equivalent typed schema.

## Contract tests

### Listing
Backend example → frontend parser → presentation.

Test category cases:
- apparel with size;
- bag no size;
- brandless vintage;
- luxury evidence;
- auction;
- Co-Own.

### Notification
Backend event → frontend localized presentation.
Changing English copy cannot alter category.

### Conversation
Group summary contains participant display data and avatar/mosaic.

### Search
Facet keys are understood by frontend.
Unsupported sort rejected.

### Money
Fees/rates round-trip without float mismatch.

## Golden data

Commit JSON fixtures generated from schema examples.

## CI

Run:
- backend schema tests;
- frontend parser tests;
- integration seeded smoke.

## Breaking changes

CI rejects:
- removed required field;
- enum drift;
- incompatible nullability;
unless versioned migration exists.
