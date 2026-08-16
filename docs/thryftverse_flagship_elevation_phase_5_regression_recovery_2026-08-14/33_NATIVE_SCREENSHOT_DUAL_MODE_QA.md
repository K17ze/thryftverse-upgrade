# Native Screenshot QA — Fixture + Backend Dual Mode

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Current blocker

The current visual golden test fails intentionally because iOS and Android baseline directories are missing.

That is not an “expected pass”.
It is an open release blocker.

## Phase 5 baseline matrix

For each key route capture:

### Mode A
fixture-design, schema-valid deterministic dataset.

### Mode B
integration-truth, seeded backend dataset.

## Platforms

- current iPhone compact;
- current large iPhone;
- small Android ~360dp;
- Pixel-class Android;
- medium/large adaptive target for key screens.

## Themes/states

- light/dark;
- large text;
- reduced motion where relevant;
- key empty/error states.

## High-priority routes

- Home;
- Search;
- Notifications;
- Create Group;
- Group Info;
- Product;
- Sell;
- Auction;
- Co-Own;
- Profile;
- Inbox/Chat;
- Creator;
- Wallet;
- Settings.

## Review rubric / 24

2 points each:
- dominant object;
- information floor;
- hierarchy;
- content/chrome;
- typography;
- media crop;
- action clarity;
- role-appropriate containment;
- state truth;
- platform fidelity;
- accessibility;
- dataset parity.

Key route must score >=20/24.

## Parity failure examples

Fixture:
beautiful title + brand + seller.
Backend:
blank title or generic category.

That is a contract failure, not a “different screenshot”.

## Baseline ownership

Baselines are reviewed artifacts.
Do not auto-update in CI.
