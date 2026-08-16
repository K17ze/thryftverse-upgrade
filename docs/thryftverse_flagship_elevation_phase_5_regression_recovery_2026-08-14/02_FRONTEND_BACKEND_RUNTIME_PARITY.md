# Frontend-only vs Full-stack Runtime Parity

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Root cause confirmed in current source

`runtimeFlags.ts` supports:
- `fixture-design`
- `integration-truth`
- `production`

Development defaults to `fixture-design`.

`BackendDataContext.tsx`:
1. fetches real API listings;
2. if valid rows arrive, uses them;
3. if API is unavailable/empty and fixture use is allowed, substitutes enriched fixture listings.

So these are not merely different server environments. They are **different visual datasets**.

## Why this is dangerous

The UI can be tuned against fixture records that have:
- attractive media;
- full title;
- brand;
- seller identity;
- price;
- condition;
- complete dimensions;

while production rows may have sparse/missing attributes.

This creates:
- different card height;
- different text density;
- missing media;
- empty rails;
- hidden records;
- recommendations with fewer usable items;
- a perceived “quality regression” only when the backend is live.

## Architectural flaw

Domain type `Listing` is still imported from `data/mockData` by production-facing layers.

Mock/fixture modules must not own domain types.

## Required architecture

```text
backend schema
      ↓
generated/shared DTO
      ↓
frontend domain normalizer
      ↓
category-aware PresentationListing
      ↓
screen-specific view model
      ↓
component

fixture generator
      ↓
same generated/shared DTO
      ↓
same normalizer
      ↓
same view model
```

No alternate “pretty fixture object” type.

## Runtime modes

### fixture-design
Purpose: deterministic visual lab.

Must:
- identify itself truthfully as fixture;
- validate every record against current backend schema;
- exercise missing/edge states deliberately;
- never silently appear as API.

### integration-truth
Purpose: frontend + real backend.

No mock fallback after successful connection.
If data is empty, show the real empty state.

### production
No fixture imports or runtime fallback.

## Data source diagnostic

Change:
`source: 'api'`

to:

```ts
type DataSource =
  | 'api'
  | 'fixture'
  | 'cache'
  | 'offline-cache';
```

Expose only in developer diagnostics.

## Dual-mode visual gate

For every golden route:
1. fixture screenshot;
2. integration screenshot with seeded backend;
3. geometry diff;
4. human visual review.

Expected:
- content differs;
- hierarchy and quality do not.

## Backend seed catalogue

Create production-shaped seed scenarios:
- ideal listing;
- brandless valid vintage;
- category without size;
- one-image listing;
- 8-image + video listing;
- missing optional seller avatar;
- luxury authenticated;
- flawed used item;
- sold;
- reserved;
- auction;
- Co-Own.

This replaces “happy fixture only” design QA.
