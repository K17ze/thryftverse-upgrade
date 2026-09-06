# Surface contract — Seller Hub (Loop 1)

Owner: main agent. Status: ACTIVE CONVERGENCE. One surface only (§31).

## Benchmarks (quality bar, not appearance to copy)

- eBay seller hub 2026: money position first, dispatch queue second, everything
  else below fold. One dominant panel, flat rows, tabular figures.
- Cash App 2026: single balance hero, 3 actions, hairlines. No card farm.
- Charter budgets: ≤1 dominant non-media panel above fold; ≤2 radii/viewport;
  hairline separators; ≤3 type sizes first viewport; no card-on-card.

## Current composition (verified in code, 2026-09-06)

`SellerHubScreen` (358 lines, orchestrator OK) renders, in order:
1. `SellerPillarTiles` — 4 grey tiles (Wallet/Orders/Analytics/Closet),
   `Radius.lg` + `surfaceAlt`, Orders badge. No skeleton coverage (pop-in shift).
2. `SellerExecutiveHero` — money panel, `Radius.xl` + `surfaceElevated` + border.
   THE dominant panel. Correct.
3. `SellerOrdersModule` — unified radar already: media rail (72dp thumbs,
   `Radius.md`) + flat hairline task rows + stale-qualified "All clear". Correct.
4. `SellerAnalyticsModule` — below fold. Keep.
5. `SellerClosetModule` — buyer-domain saved/wishlist rail on a merchant
   surface. Reachable via Closet tab. Remove from Hub.
6. `SellerListingsModule` — own catalog rail. Keep.
7. Sticky dock: full-width `Radius.full` brand CTA + `Elevation.card`. Keep
   (single primary action), haptic medium (S2 deliberate creation entry).

Viewport radii today: lg + xl + md + full = FAIL (budget 2).
Grey containers above fold: 4 tiles + 1 money panel = FAIL (budget 1).
`SellerHubSkeleton` already describes the TARGET (hero + rows + flat metrics)
with no tiles — tiles are the bolt-on causing loading→final shift.

## Target delta (observable, testable)

- [ ] 0 grey tiles above fold. Money panel is the only dominant object at 25%.
- [ ] Radii in viewport: xl (money panel) + md (media thumbs) + full (CTA,
      badges only). No lg.
- [ ] Pending-to-ship count survives via Orders header ("N to ship"), not tile.
- [ ] Wallet entry via Transfer + hero; Analytics via module press; Closet via
      tab bar. No dead ends (verified: all routes typed, no chevron removed
      without destination).
- [ ] Haptics S0–S4: navigation rows/view-all/order/thumb presses silent
      (S0/S1 visual-only); Transfer light (deliberate money action); dock CTA
      medium (S2). No `haptics.tap()` on pure navigation.
- [ ] Skeleton matches final geometry (already does once tiles are gone).
- [ ] Screen stays <400 lines, orchestrator-only. `SellerPillarTiles.tsx` and
      `SellerClosetModule.tsx` deleted; `seller/index.ts` + composition test
      updated to the new contract.

## Data path (live, no mock)

`sellerHub.ts:/seller-hub/overview` (v2 aggregate: money/tasks/topTask/
inventory/businessPulse/freshness) → `fetchSellerHubOverview()` →
`SellerHubScreen.load()` (Promise.all: overview, seller orders ×6, own
listings ×6, daily 30d, import batches; per-fetch catch → null, never throw)
→ `hubViewModels` mappers → modules. Partial states: `importError` banner,
`tasksStale` qualifier, per-module null → honest empty/error.
NOTE: `routes/listings.ts:4577` holds a DEAD duplicate `/seller-hub/overview`
(`registerListingRoutes` never called in `index.ts`) — trap for future agents,
do not wire to it. Flagged for deletion outside this loop.

## Capture spec (ADB)

Emulator-5554 surface capture is wedged (screencap/screenrecord block;
shell OK). Until fixed: user captures on dev build at 390×844, light+dark:
(1) Hub top at rest, (2) scrolled to radar, before+after at equal scale.
Record: first-content Y, objects above fold, rounded-container count,
loading→final shift. No commit of captures.

## Done gate (§31.5 + §37.10 for money rows)

tsc 0 + hub tests green + side-by-side at equal scale + 1 rework iteration
+ human sign-off + live `/seller-hub/overview` rows recorded. Else
IMPLEMENTED — NATIVE DEVICE VALIDATION PENDING.
