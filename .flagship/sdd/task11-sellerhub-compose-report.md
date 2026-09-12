# Task 11 — F09: SellerHubScreen Recomposition Report

## Status: DONE

## Defect
The Seller Hub rendered four decorative pillar tiles (Wallet / Orders / Analytics / Closet),
then the financial hero and trust strip, before the seller's actual work. The surface read
as a navigation dashboard; urgent operational work (unshipped orders, SLA risk, disputes,
payout holds, expiring items) was buried below the fold.

## Change Summary
**File edited:** `frontend/src/screens/SellerHubScreen.tsx` (only file touched).

Pure composition change — no component internals modified, no props added/removed, no
navigation, analytics (`track('seller_dashboard_viewed')`), or haptic call sites touched.
All data flow identical; `SyncRetryBanner` partial-failure rows preserved in place next to
the module they retry. No new surfaces, cards, pills, or gradients added.

## New Composition Order (was → is)

| # | Before | After |
|---|--------|-------|
| 0 | OfflineBanner + import-error notice | OfflineBanner + import-error notice (unchanged) |
| 1 | SellerPillarTiles (4 nav tiles) | **SellerOrdersModule** — Zone 1 · The work |
| 2 | SellerExecutiveHero (money panel) | **SellerExecutiveHero** — Zone 2 · The money |
| 3 | SellerTrustStrip | SellerTrustStrip (kept glued under money panel) |
| 4 | SellerOrdersModule | **SellerPillarTiles** — Zone 3 · Destinations (demoted) |
| 5 | SellerAnalyticsModule | SellerListingsModule (inventory destination) |
| 6 | SellerClosetModule | SellerAnalyticsModule (performance destination) |
| 7 | SellerListingsModule | SellerClosetModule (least operational destination) |
| 8 | SellerOpportunitiesModule | **SellerOpportunitiesModule** — Zone 4 · Growth (last; renders nothing when empty) |
| 9 | SellerHubDock (sticky) | SellerHubDock (sticky, unchanged) |

### Rationale
- **Top — urgent work first.** `SellerOrdersModule` is already the unified operational
  radar the charter calls for: triage line (`N to ship · £X at stake`), media rail of
  orders to dispatch with SLA chips (Overdue / Nh to ship), then flat hairline-separated
  task rows covering `respond_offer`, `listing_issue`, `payout_hold`, and
  `catalogue_awaiting` with due labels and consequence copy. Disputes/offers/payout
  actions all live in this queue — nothing new needed to be built.
- **Middle — money.** `SellerExecutiveHero` + `SellerTrustStrip` form the compact
  financial posture block (available payout, escrow, next payout, rolling reserve,
  Transfer action, evidenced reputation row). Per constraints, the component layout was
  not redesigned — it is repositioned.
- **Below — secondary destinations.** `SellerPillarTiles` was kept (the test contract
  requires it and it preserves four navigation routes) but demoted below the work and
  the money, where it now functions as the compact destinations grid. Listings,
  Analytics, and Closet follow as the deeper destination sections.
- **Bottom — growth.** `SellerOpportunitiesModule` (views-without-sales near-winners)
  is the education/growth surface and sits last; it self-hides when empty.

## First-viewport effect
Before: ~330px of nav tiles + money panel — zero actionable work visible.
After: Orders header, triage line, dispatch rail with SLA chips, and the first task
rows — the seller's next action is the first thing on screen, with money immediately
below.

## Verification Results

### tsc
```
node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json | grep -i SellerHub
```
Result: **no output** — zero TypeScript errors referencing SellerHubScreen.

### vitest
```
npx vitest run src/__tests__/sellerAnalyticsAndHubUpgrade.test.ts
```
Result: **42/42 passed** (1 file). Initial run failed once on the `< 400 lines`
orchestrator budget (404 lines after comment rewrite); comments were compressed and the
file now sits at **395 lines** — passing.

## Concerns
- `SellerPillarTiles` retains `marginTop: Space.md` (vs `Space.lg` on sibling modules),
  giving it slightly tighter separation under the trust strip. Intentionally left as-is
  per the no-component-redesign constraint; visually it reads as part of the destinations
  zone header.
- The Orders tile inside the demoted pillar grid duplicates the pending-orders badge
  already expressed by the Orders module above it. Acceptable — it is a persistent
  navigation affordance, and removing it would break the existing test contract.
- No snapshot/render-order test exists for the hub; ordering was verified by source
  inspection plus the file-content suite.
