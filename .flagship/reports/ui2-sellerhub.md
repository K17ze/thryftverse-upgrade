# UI-2 — Seller Hub re-authoring (second pass)

**Date:** 2026-09-XX · **Surface:** `frontend/src/screens/SellerHubScreen.tsx` + `frontend/src/components/seller/*`
**Benchmark:** Vinted/Depop seller dashboards — operational clarity, minimal chrome, one dominant element.

## Audit — remaining AI tells found

| Tell | Where |
|---|---|
| Stacked rounded card | `SellerExecutiveHero` wrapped the payout in a `Radius.xl` bordered `surfaceElevated` panel — the classic "boxed stat" move. |
| Metric-grid silhouette | `SellerPillarTiles` rendered a 2+2 grey-tile grid duplicating navigation every module already exposed via "View all"/module press. |
| Duplicate info | "N to ship" rendered twice in the orders module (header badge *and* triage line). |
| Icon+label disease | Every section header carried a decorative glyph (package/tag/bookmark/shield/trending); every task row and empty state had a 30dp icon circle. |
| Fragmented financials | "How's business" was split across three boxes: hero (payout/escrow), analytics (net sales/sparkline), listings header ("£X listed"). |
| Label-everything | `SellerOpportunitiesModule` had title + explanatory subtitle duplicating what the card meta already says. |
| Pill chrome | "Transfer" was a filled `Radius.full` pill inside the panel. |

## New composition (reading order)

```
Seller Hub (header — title + back only, unchanged)
├─ Notices            away row / import banner (conditional, unchanged)
├─ MONEY BLOCK        — the one dominant element, flat canvas
│   ├─ "Available payout" + quiet "Transfer" text action
│   ├─ £ hero number (priceHero, AnimatedNumber, tabular-nums)
│   ├─ "£X in rolling reserve" (only when held)
│   ├─ hairline sub-metrics: In escrow | Next payout | Listed   ← merged listed value here
│   ├─ "Net sales · 30 days" + figure + trend + sparkline       ← daily breakdown, same block
│   └─ trust line: "97% positive · 41 sales · Ships in ~1 day"  ← block footer (unchanged)
├─ ACTION RADAR
│   ├─ "Orders" + "View all"  ·  "3 to ship · £212 at stake" (stated once)
│   ├─ 104dp media rail with SLA chips (unchanged — media is the surface)
│   └─ hairline task rows — NO icon circles; title + consequence | due label | chevron
├─ Listings · N active        rail (listed value removed — lives in money block)
├─ Standards · tier           one status line + appeal (one-liner preserved, icon dropped)
├─ Closet · N saved           rail
├─ Views, no sales yet        rail (title carries the mechanism; subtitle deleted)
└─ Wallet / Orders / Analytics / Closet   flat hairline destination rows (was 2+2 tiles)
[List new piece] — sticky dock (unchanged)
```

## What changed per file

- **`SellerExecutiveHero.tsx`** — re-authored. Card panel, status dot, metric icons and pill button removed. Flat canvas: label row → hero figure → conditional reserve footnote → hairline sub-metrics row (`In escrow`, `Next payout`, new `Listed` — via new `listedValueGbp` prop). Transfer is now a quiet text+forward action.
- **`SellerAnalyticsModule.tsx`** — re-authored. Icon+title header removed; now the second beat of the financial block: "Net sales · 30 days" label + forward affordance, subordinate `priceList` figure with trend at baseline, meta line, flat sparkline. `'Analytics'` retained in `accessibilityLabel`.
- **`SellerOrdersModule.tsx`** — header de-iconed; duplicated `pendingCount` removed (triage line is now the single statement of ship count + at-stake); task rows lost their icon circles (critical → `dangerText` title); empty/clear states are plain typographic rows. SLA rail logic untouched.
- **`SellerPillarTiles.tsx`** — re-authored from 2+2 tile grid to four hairline destination rows (label + trailing context + chevron). Orders row keeps the to-ship badge as trailing danger text; Wallet keeps the balance. Same props, same navigation handlers.
- **`SellerListingsModule.tsx`** — tag icons removed; `listedValueLabel` prop deleted (the figure moved to the hero sub-metrics — one financial story, no duplication).
- **`SellerClosetModule.tsx`** — bookmark icons removed; same grammar as listings.
- **`SellerStandardsModule.tsx`** — shield icons removed from both header paths; one status line + appeal form unchanged.
- **`SellerOpportunitiesModule.tsx`** — icon and explanatory subtitle removed; title now states the mechanism ("Views, no sales yet").
- **`SellerHubScreen.tsx`** — composition reordered money-first (dominant element above the fold), listed value routed to the hero, all fetches/statuses/retries/focus-revalidation untouched. 390 lines (< 400 budget).
- **Untouched:** `SellerTrustStrip`, `SellerHubDock`, `SellerHubGate`, `SellerHubNotices`, `SellerThumbRail`, `hubViewModels`, `useSellerHubTaskNavigation`, all services.

## Preserved

All data hooks/fetches (orders, listings, daily breakdown, standards, appeal submit), per-resource `ResourceStatus` state machine + `SyncRetryBanner` inline retries, pull-to-refresh + focus revalidation, loading/empty/error/partial states, accessibility labels/roles/haptics, dark mode (all color via `ThemeColors`), navigation handlers.

## Verification

- `npx tsc --noEmit` — clean (0 errors)
- `vitest run sellerAnalyticsAndHubUpgrade.test.ts sellerAwaySurfaces.test.tsx` — **52/52 pass**
- Line budgets: screen 390 < 400; tiles 152 < 200.
