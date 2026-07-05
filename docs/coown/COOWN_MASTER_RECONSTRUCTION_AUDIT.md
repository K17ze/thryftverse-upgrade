# COOWN-MASTER — Reconstruction Audit & Rejection Rationale

## Why the previous Co-Own upgrade is rejected

The previous branch `master-coown-flagship-uiux-upgrade` (8 commits, SHA `bd95a27`)
performed a patch pass on the Co-Own department. It removed some truth defects,
retired `SyndicateScreen`, added two components (`CoOwnFeaturedHero`,
`CoOwnDiscoveryCard`), and staged a few flows. The result is **not** a flagship
product experience. This document records the specific rejection points that
this reconstruction must fix.

---

## Rejection Matrix

| # | Rejection Criterion | Current State | Evidence |
|---|---------------------|---------------|----------|
| 1 | Hub still feels like a finance dashboard | Sort options NEW / VALUE / MOVERS; shows `marketMovePct24h` | `SyndicateHubScreen.tsx` lines 31-35 |
| 2 | First viewport does not create product desire | Featured hero is a card with financial allocation bar, not an editorial marketplace destination | `CoOwnFeaturedHero.tsx` — card with border + shadow + allocation % |
| 3 | Cards feel generic or developer-made | `CoOwnDiscoveryCard` is a generic bordered card with status dot + allocation bar — same pattern for every context | `CoOwnDiscoveryCard.tsx` |
| 4 | Portfolio feels like discovery cards | Portfolio reuses `CoOwnDiscoveryCard` — no ownership identity, no Sell action visible | `PortfolioScreen.tsx` line 22 |
| 5 | Portfolio does raw market join at screen level | Fetches assets + holdings separately, merges in `useEffect` | `PortfolioScreen.tsx` lines 47-78 |
| 6 | Trade feels like a form/calculator | Form inputs with minimal visual composition, no skeleton, no sticky dock | `TradeScreen.tsx` |
| 7 | Create flow imports `Listing` from mockData | `import type { Listing } from '../data/mockData'` | `CreateSyndicateScreen.tsx` line 11 |
| 8 | Create flow has hardcoded MAX_UNITS | `const MAX_UNITS = 20` | `CreateSyndicateScreen.tsx` line 39 |
| 9 | Detail still feels like stacked panels | Order book, ownership distribution, product info stacked as cards | `AssetDetailScreen.tsx` |
| 10 | Detail has unused mockData import | `import { Listing } from '../data/mockData'` (unused) | `AssetDetailScreen.tsx` line 50 |
| 11 | Ledger feels like a metric dashboard | Summary card with Volume, Net cashflow, Realized P&L | `MarketLedgerScreen.tsx` lines 219-238 |
| 12 | Leaderboard feels speculative | "Top Movers" (24h price movement), "Top Market Value" | `AssetLeaderboardScreen.tsx` |
| 13 | Onboarding feels like generic explainer slides | 4 hardcoded generic slides (Fractional Ownership, Trade In Real Time, 1ze + Local Fiat, Compliance Controls) | `SyndicateOnboardingScreen.tsx` lines 28-49 |
| 14 | Buyout feels like a placeholder | "Buyout is not available yet" with future feature checklist | `BuyoutScreen.tsx` lines 145-165 |
| 15 | CoOwnIssue shows raw assetId UUID | `<Text>Asset: {assetId}</Text>` | `CoOwnIssueScreen.tsx` line 64 |
| 16 | CoOwn components are not theme-aware | Use static `Colors` from constants, not `useAppTheme().colors` | `CoOwnFeaturedHero.tsx`, `CoOwnDiscoveryCard.tsx` |
| 17 | No sticky action docks on Hub, Trade, Create, Portfolio | Submit buttons in scroll content | All screens except AssetDetail + TradeConfirm |
| 18 | Tests are source-string checks | 38 tests that `expect(src).toContain('string')` | `coownFlagshipUpgrade.test.ts` |
| 19 | No native screenshots | Marked "NATIVE VALIDATION PENDING" | Previous final report |
| 20 | Only 2 Co-Own components exist | `CoOwnFeaturedHero`, `CoOwnDiscoveryCard` — insufficient for distinct contexts | `components/coown/` |

---

## Reconstruction Scope

### Screens to rebuild (12)

1. `SyndicateHubScreen.tsx` — premium market programme
2. `AssetDetailScreen.tsx` — flagship product ownership page
3. `TradeScreen.tsx` — trustworthy transaction flow
4. `TradeConfirmScreen.tsx` — receipt-style review
5. `CreateSyndicateScreen.tsx` — issuer studio (remove mockData)
6. `PortfolioScreen.tsx` — ownership surface (not discovery)
7. `SyndicateOrderHistoryScreen.tsx` — human-readable timeline
8. `BuyoutScreen.tsx` — honest premium unavailable state
9. `SyndicateOnboardingScreen.tsx` — Co-Own specific education
10. `CoOwnIssueScreen.tsx` — contextual support entry
11. `MarketLedgerScreen.tsx` — understandable market activity
12. `AssetLeaderboardScreen.tsx` — non-speculative rankings

### Components to create (17)

1. `CoOwnMarketHeader.tsx` — editorial Co-Own header
2. `CoOwnFeaturedAsset.tsx` — large featured asset module
3. `CoOwnAssetTile.tsx` — discovery grid tile
4. `CoOwnPositionCard.tsx` — portfolio position card
5. `CoOwnPositionActionSheet.tsx` — position action sheet
6. `CoOwnOwnershipPanel.tsx` — ownership summary panel
7. `CoOwnIssuerCard.tsx` — issuer identity card
8. `CoOwnTrustPanel.tsx` — trust/authenticity panel
9. `CoOwnRiskDisclosure.tsx` — risk disclosure block
10. `CoOwnStickyActionDock.tsx` — sticky CTA dock
11. `CoOwnTradeComposer.tsx` — trade composition UI
12. `CoOwnTradeReceipt.tsx` — receipt-style trade summary
13. `CoOwnIssueStudioStep.tsx` — issuer studio step wrapper
14. `CoOwnActivityRow.tsx` — activity timeline row
15. `CoOwnLedgerSummary.tsx` — ledger summary (non-speculative)
16. `CoOwnEducationCard.tsx` — education module
17. `CoOwnSkeletons.tsx` — Co-Own skeleton loaders
18. `CoOwnStateCanvas.tsx` — Co-Own state wrapper

### Service adapter to create

- `fetchCoOwnPortfolioPositions()` — portfolio-specific DTO adapter

### What is preserved

- Route names and navigation contracts
- Backend API integrations (`marketApi.ts`)
- Authentication logic
- Design tokens (`Space`, `Radius`, `Type`, `Typography`, `Elevation`)
- Theme system (`ThemeContext`)
- Flagship primitives (`FlagshipScreen`, `FlagshipHeader`, `FlagshipStickyFooter`)

---

## Design Direction

Co-Own is a **premium shared-ownership marketplace** for desirable physical items.

### Emotional hierarchy

1. The item is desirable
2. The media is beautiful and product-truthful
3. The issuer feels trustworthy
4. Ownership is simple to understand
5. Unit price and availability are clear
6. The next action is obvious
7. Risks and limitations are honest
8. Transaction results are durable and understandable

### Visual language

- Media-first, not metric-first
- Flat editorial sections, not stacked heavy cards
- Strong sticky actions, not buried submit buttons
- Theme-aware colors everywhere (no static `Colors`)
- Polished skeletons that resemble final layout
- Beautiful empty states with purpose
- No finance dashboard language (movers, value, volume)
- No speculative P&L leaderboards

---

## Starting State

| Field | Value |
|-------|-------|
| Base branch | `master-coown-flagship-uiux-upgrade` |
| Base SHA | `eae922f` |
| New branch | `coown-master-complete-flagship-reconstruction` |
| Date | 2026-07-04 |
