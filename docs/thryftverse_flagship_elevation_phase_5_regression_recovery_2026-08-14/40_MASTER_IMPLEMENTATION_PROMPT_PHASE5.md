# MASTER IMPLEMENTATION PROMPT — Phase 5

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

You are implementing **Thryftverse Phase 5: Regression Recovery + Visual/Data Parity + Role-Aware Flagship Reconstruction**.

## Mandatory baseline

Repository:
`K17ze/thryftverse-upgrade`

Branch:
`feat/product-detail-contract-media-device-closure`

Audit baseline:
`73be832f2522f828ba2adfe31756da7da2d6e1ca`

Read:
- `AGENTS.md`
- `Design.md`
- every Phase 5 document
- current source before editing.

## Mission

Correct Phase 4 visual regressions and move the application toward a genuinely human-authored 2026 flagship product without sacrificing the truthful architecture established in Phases 3/3.1/4.

## The central mistake to avoid

Do **not** treat:
- flatter;
- fewer cards;
- fewer labels;
as universal proxies for quality.

Choose presentation based on role.

## Hard constraints

1. No mass revert of Phase 4.
2. Do not regress Phase 3.1 agent security/consent.
3. No fake unavailable creator capability.
4. No synthetic Co-Own financial data.
5. No prose-based notification semantics after V2 migration.
6. No production domain types owned by mockData.
7. No fixture fallback in integration/production.
8. No inert visible affordance.
9. No “all tests pass” claim while required GitHub CI is red.
10. Native screenshot proof is mandatory.

## Execution

### Pass 1 — release truth
Fix Expo Doctor.
Capture missing baselines or explicitly keep release blocked.

### Pass 2 — presentation contracts
Move Listing/Conversation domain contracts out of mockData.
Implement canonical schema validation.
Implement truthful DataSource.

### Pass 3 — Home
Build role-specific HomeDiscoveryCard with:
media + identity + price + at most one context fact.
Do not restore metadata soup.

### Pass 4 — Notifications
Implement NotificationEventV2 end-to-end.
Remove title/body semantic inference.
Redesign to Needs Attention + chronological with one filter control.

### Pass 5 — Create Group
People-first selection.
Recent/suggested.
Selected avatars.
Real group photo pipeline or generated mosaic.
Canonical backend membership.

### Pass 6 — long-tail sweep
Complete doc 30 systematically.

### Pass 7 — category-aware listing completeness
Backend rejects/marks incomplete active listings based on category schema.
Frontend stops hiding valid brandless/sizeless categories.

### Pass 8 — department role audit
Review Product, Auction, Co-Own, Creator, Profile, Chat, Wallet and Seller using role matrix.

### Pass 9 — dual-mode screenshots
Fixture and integration seeded backend.
Compare geometry/quality.

## Every visual commit must report

- presentation role;
- user question;
- information added/removed;
- behavior preserved;
- fixture screenshot;
- integration screenshot;
- tests.

## Definition of done

Phase 5 is done only when the app feels equally intentional:
- with frontend-only schema-valid fixtures;
- with the real seeded backend;
- on native iOS;
- on native Android.

A pretty fixture mode is not production quality.
