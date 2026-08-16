# Auction V5 — Preserve Architecture, Restore Visual Tension

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Current foundation is strong

Keep canonical browse/filter state.

## Phase 5 role

Auction is `liveMarket`, not generic commerce-discovery.

Flattening should not remove:
- countdown;
- current bid;
- viewer state.

## Home

Live tile:
- media;
- title;
- current bid;
- countdown;
- optional `Leading/Outbid`.

Upcoming:
schedule-oriented.

Results:
ledger-oriented.

Watching:
attention-oriented.

## Filter

One filter control.
Lifecycle scope is not duplicated inside filter.

## Detail

Time → price → my state → action.

## Avoid blandness

A live auction should be visually more urgent than a Home listing because the domain is different.

Use semantic emphasis:
- final 10 minutes;
- outbid;
- leading.

Not decorative pulsing for hours.

## Backend truth

Server clock and lifecycle remain authoritative.
Stale/resync state must not show a falsely precise timer.

## Small flows

Audit:
- watch;
- pre-bid;
- bid confirmation;
- bid failure;
- buy now;
- outbid notification;
- won order;
- seller auction creation/edit;
- result detail.

## Acceptance

The user can recognize an auction tile as live without reading a family badge.
