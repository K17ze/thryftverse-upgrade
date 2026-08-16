# Phase 5 Execution Roadmap

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## WP0 — freeze Phase 3.1 and Phase 4 good work

Do not mass-revert.

Capture current source/screens.

## WP1 — make CI truth green

- Expo dependency alignment.
- screenshot baseline infrastructure.

Do not postpone release truth.

## WP2 — runtime/data parity

- move domain types out of mockData;
- canonical listing schema;
- truthful DataSource;
- category-aware completeness;
- fixture generator/validator;
- integration seed.

## WP3 — Home regression recovery

- role-specific card;
- identity floor;
- feed rhythm;
- dual-mode screenshot.

## WP4 — Notifications

- NotificationEventV2 backend/frontend;
- attention hierarchy;
- filter reconstruction;
- migration away from prose parsing.

## WP5 — Create Group + group management

- people-first picker;
- recents/suggested;
- real avatar or mosaic;
- group role/membership semantics;
- participant summaries.

## WP6 — micro-flow sweep

Use doc 30.
Do not skip because major screens look good.

## WP7 — Search/Sell data feedback loop

Make seller fields feed Search/Home/Detail reliably.

## WP8 — department visual roles

Product, Auction, Co-Own, Creator, Profile, Chat, Wallet, Seller.

No global transformation commit.

## WP9 — backend presentation contracts

Notification, listing, conversation, seller summaries.

## WP10 — dual-mode native QA

Fixture + integration.
iOS + Android.

## Commit policy

Each WP:
- max coherent scope;
- before/after screenshot;
- behavioral invariants;
- backend contract change;
- tests.

Do not title a commit “flagship polish” without a precise user contract.
