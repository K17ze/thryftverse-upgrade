# ThryftVerse — CO-OWN & Auction UI/UX Upgrade Plan

## Executive Summary

Both the CO-OWN and Auction sections suffer from the same systemic inconsistencies found in Settings (per AGENTS.md audit): header fragmentation, card style drift, inline color constants, typography token abandonment, missing motion, and inconsistent use of design system primitives. This plan addresses all screens holistically while **preserving every existing feature**.

---

## 1. Current State Audit

### Screens Analyzed (14 total)

**Auction Section (4 screens):**
| Screen | Lines | Key Issues |
|--------|-------|------------|
| `AuctionsScreen.tsx` | 1,259 | Inline colors, custom cards, no unified header, mixed typography |
| `CreateAuctionScreen.tsx` | 555 | Inline colors, no AppCard usage, raw TextInput |
| `MyBidsScreen.tsx` | 75 | Completely empty — only EmptyState, no real bid history |
| `TradeHubScreen.tsx` | 631 | Actually the container; switches between Auctions & CO-OWN |

**CO-OWN Section (10 screens):**
| Screen | Lines | Key Issues |
|--------|-------|------------|
| `SyndicateScreen.tsx` | 1,781 | Massive file, inline colors, custom switcher, raw modal inputs |
| `CreateSyndicateScreen.tsx` | 569 | Inline colors, no AppCard/AppInput |
| `SyndicateHubScreen.tsx` | 692 | Inline colors (METRIC_BG, SORT_ACTIVE_BG), Image not CachedImage |
| `TradeScreen.tsx` | 489 | Inline colors, custom alert card, no AppCard for form |
| `AssetDetailScreen.tsx` | 702 | Inline colors, custom chart styling, raw Image |
| `BuyoutScreen.tsx` | 306 | Inline colors, flat layout, no card elevation |
| `SyndicateOrderHistoryScreen.tsx` | 852 | Inline chip colors, custom status styles not using AppStatusPill |
| `PortfolioScreen.tsx` | 538 | Inline colors (HERO_BG, HERO_BORDER), custom hero section |
| `AssetLeaderboardScreen.tsx` | 199 | Inline colors, custom section cards |
| `MarketLedgerScreen.tsx` | 604 | Inline colors, custom metric/row styles |

### Design System in Use (App-wide)
- **Colors**: `Colors.background`, `Colors.surface`, `Colors.surfaceAlt`, `Colors.brand`, `Colors.textPrimary/Secondary/Muted`, `Colors.border`, `Colors.danger`, `Colors.success`
- **Spacing**: `Space.xs/sm/md/lg/xl/xxl` (4px base grid)
- **Radius**: `Radius.sm/md/lg/xl/full` (4/8/12/16/999)
- **Elevation**: `Elevation.none/subtle/card/floating/modal`
- **Typography**: `Type.title/subtitle/body/price/caption/meta/priceLarge`
- **Components**: `AppButton`, `AppCard`, `AppInput`, `AppSegmentControl`, `AnimatedPressable`, `AppStatusPill`
- **Motion**: `Motion.list.enterDuration/staggerStep/maxStaggerItems`, `FadeInDown`

---

## 2. Critical Inconsistencies Found

### A. Header Pattern Fragmentation
Every subpage invents its own header:

| Screen | Back Button | Title Style | Right Action |
|--------|-------------|-------------|--------------|
| AuctionsScreen | None (in hub) | Custom hero card | None |
| CreateAuctionScreen | 44x44 close, no border | Custom text | Launch text button |
| MyBidsScreen | Plain arrow-back | Type.title (21px) | 40px spacer |
| SyndicateScreen | None (in hub) | Hero text (56px) | None |
| CreateSyndicateScreen | 44x44 close, no border | Custom text | Issue text button |
| AssetDetailScreen | 44x44 circle with border | 17px bold | Time icon button |
| TradeScreen | 44x44 circle with border | 17px bold | 40px spacer |
| BuyoutScreen | 40x40 circle with border | 17px bold | 40px spacer |
| PortfolioScreen | 40x40 circle with border | Type.title | Receipt icon |
| MarketLedgerScreen | 40x40 circle with border | 17px bold | None |
| SyndicateOrderHistory | 40x40 circle with border | 17px bold | None |
| AssetLeaderboardScreen | 40x40 circle with border | 17px bold | 40px spacer |

**Problem**: No unified "Trade Sub-Screen Header" component. Users lose spatial consistency.

### B. Card / Surface Style Drift
- `AuctionsScreen` → custom `heroCard`, `launchRow`, `liveCard`, `upcomingCard`, `posterCard`
- `SyndicateScreen` → custom `metricCard`, `metricCardWide`, `issueRow`, `quickActionChip`
- `AssetDetailScreen` → custom chart container, order book cards
- `TradeScreen` → custom `PANEL_BG` alert card
- `PortfolioScreen` → custom `HERO_BG` hero section
- `MarketLedgerScreen` → custom metrics card, row cards
- `AssetLeaderboardScreen` → custom `sectionCard`

**Problem**: Every screen reinvents card surfaces. None consistently use `AppCard` with `variant='surface' | 'elevated'`.

### C. Input Style Fragmentation
- `AuctionsScreen` bid composer uses `AppInput` (good) but with custom `inputContainerStyle`
- `SyndicateScreen` units composer uses raw `TextInput` with custom `unitsInputWrap` styling
- `CreateAuctionScreen` uses raw `TextInput` for starting bid and buy now price
- `CreateSyndicateScreen` uses raw `TextInput` for total units and unit price

**Problem**: `AppInput` exists with borderRadius 10, `Colors.surface`, prefix/suffix support, but is inconsistently used.

### D. Hardcoded Theme-Aware Colors
Dozens of inline `IS_LIGHT ? ... : ...` color blocks:

| Screen | Inline Constant | Should Be |
|--------|-----------------|-----------|
| AuctionsScreen | `PANEL_BG = IS_LIGHT ? '#ffffff' : '#111111'` | `Colors.surface` |
| AuctionsScreen | `PANEL_SOFT_BG = IS_LIGHT ? '#f7f4ef' : '#161616'` | `Colors.surfaceAlt` |
| AuctionsScreen | `PANEL_BORDER = IS_LIGHT ? '#d8d1c6' : '#2f2f2f'` | `Colors.border` |
| SyndicateScreen | `PANEL_BG = IS_LIGHT ? '#ffffff' : '#111111'` | `Colors.surface` |
| SyndicateScreen | `PANEL_TINT_BG = IS_LIGHT ? '#ece4d8' : '#2f291f'` | `Colors.surfaceAlt` or custom token |
| CreateAuctionScreen | `PANEL_BG = IS_LIGHT ? '#ffffff' : '#121212'` | `Colors.surface` |
| TradeScreen | `PANEL_BG = IS_LIGHT ? '#ffffff' : '#111111'` | `Colors.surface` |
| AssetDetailScreen | `PANEL_BG = IS_LIGHT ? '#ffffff' : '#121212'` | `Colors.surface` |
| BuyoutScreen | `PANEL_BG = IS_LIGHT ? '#ffffff' : '#111111'` | `Colors.surface` |
| PortfolioScreen | `HERO_BG = IS_LIGHT ? '#f0ede7' : '#10161c'` | `Colors.surfaceAlt` |
| MarketLedgerScreen | `METRICS_CARD_BG = IS_LIGHT ? '#f0ede7' : '#0f151b'` | `Colors.surfaceAlt` |
| SyndicateHubScreen | `METRIC_BG = IS_LIGHT ? '#f0ede7' : '#10161c'` | `Colors.surfaceAlt` |
| AssetLeaderboardScreen | `PANEL_BG = IS_LIGHT ? '#ffffff' : '#111111'` | `Colors.surface` |

**Problem**: Theme switching is brittle; dark-mode refinements do not propagate.

### E. Typography Token Abandonment
Settings screens use raw font sizes and families instead of the `Type` scale:

| Usage | Current | Should Use |
|-------|---------|------------|
| Screen titles | `fontSize: 17, fontFamily: 'Inter_700Bold'` | `Type.subtitle` |
| Card titles | `fontSize: 16, fontFamily: 'Inter_700Bold'` | `Type.subtitle` |
| Section labels | `fontSize: 15, fontFamily: 'Inter_700Bold'` | `Type.subtitle` |
| Body/meta | `fontSize: 12, fontFamily: 'Inter_500Medium'` | `Type.caption` or `Type.meta` |
| Prices | `fontSize: 18, fontFamily: 'Inter_700Bold'` | `Type.priceLarge` |
| Metric labels | `fontSize: 11, fontFamily: 'Inter_500Medium'` | `Type.meta` |

### F. Missing Motion & Feedback
- No `Reanimated` entrance animations on: `CreateAuctionScreen`, `CreateSyndicateScreen`, `TradeScreen`, `BuyoutScreen`, `MyBidsScreen`
- `AuctionsScreen` list items have no entrance animation
- `SyndicateScreen` list items have no entrance animation (only the hub screen does)
- No haptic feedback on: bid submission, buy now, unit order submit, buyout initiate
- No loading skeletons for: bid composer submit state, buy now state

### G. Image Component Inconsistency
- `SyndicateHubScreen` uses raw `Image` instead of `CachedImage` for asset images
- `AssetDetailScreen` uses raw `Image` instead of `CachedImage` for hero image
- `PortfolioScreen` uses raw `Image` instead of `CachedImage` for holding images
- `AssetLeaderboardScreen` uses raw `Image` instead of `CachedImage`

### H. UX / Information Architecture Issues
1. **MyBidsScreen is completely empty** — just an EmptyState. No bid history, no integration with auction data.
2. **No search/filter in AuctionsScreen** — can't search live auctions.
3. **No search in SyndicateScreen** — can't search issued pools or holdings.
4. **CreateAuctionScreen listing picker** — horizontal FlashList with tiny cards, hard to browse.
5. **CreateSyndicateScreen listing picker** — same issue, tiny cards.
6. **TradeScreen compliance alert** — custom styled card, not using `AppStatusPill` or `AppCard`.
7. **AssetDetailScreen ownership list** — synthetic/mock owner accounts mixed with real data, confusing.
8. **SyndicateOrderHistoryScreen date filter chips** — custom styled, not using `AppSegmentControl`.

---

## 3. Upgrade Plan

### Phase 1 — Foundational Primitives (needed before any screen work)

#### 1.1 Create `TradeHeader` Component
A reusable header for all trade subpages (auction + co-own):
- Left: `AnimatedPressable` back/close button (44x44, `Radius.md`, `Colors.surface`)
- Center: Title using `Type.subtitle`
- Right: Optional action slot (text button, icon, or spacer)
- Uses `SafeAreaView` insets correctly
- Consistent with `SettingsHeader` pattern from Settings upgrade plan

**New file**: `frontend/src/components/trade/TradeHeader.tsx`

#### 1.2 Create `TradeCard` Wrapper
Standardized card for trade forms, metrics, and lists:
- Uses `AppCard` with `variant='surface'` or `'elevated'`
- Enforces `Radius.lg` (12px) consistently
- Supports `isFirst`/`isLast` divider logic
- Pre-built metric card layout (label + value vertical stack)

**New file**: `frontend/src/components/trade/TradeCard.tsx`

#### 1.3 Create `MetricGrid` Component
For dashboard-style metric rows (used in AuctionsScreen, SyndicateScreen, PortfolioScreen, MarketLedgerScreen):
- Accepts array of `{ label, value, tone?, icon? }`
- Auto-layout: 2-col, 3-col, or 4-col based on item count
- Uses `TradeCard` internally
- Entrance animation with staggered `FadeInDown`

**New file**: `frontend/src/components/trade/MetricGrid.tsx`

#### 1.4 Create `BidComposer` Component
Extract the bid composer modal from `AuctionsScreen`:
- Uses `AppInput` with prefix (currency)
- Bump chips using `AppButton variant='secondary' size='sm'`
- Submit/Cancel using `AppButton`
- Haptic feedback on submit
- Loading state during submission

**New file**: `frontend/src/components/trade/BidComposer.tsx`

#### 1.5 Create `UnitsComposer` Component
Extract the units composer modal from `SyndicateScreen`:
- Uses `AppInput` (not raw `TextInput`)
- Quick unit chips using `AppButton`
- Estimated spend/receive display
- PnL preview for sell mode
- Submit/Cancel using `AppButton`

**New file**: `frontend/src/components/trade/UnitsComposer.tsx`

#### 1.6 Create `AuctionCard` Component
Extract live auction card from `AuctionsScreen`:
- Hero image with `CachedImage`
- Countdown timer with live pulse indicator
- Current bid display
- Progress bar
- Action row: Bid / Buy Now / Watch buttons
- Uses `TradeCard` internally

**New file**: `frontend/src/components/trade/AuctionCard.tsx`

#### 1.7 Create `CoOwnAssetCard` Component
Extract asset card from `SyndicateScreen` / `SyndicateHubScreen`:
- Image with `CachedImage`
- Title + mover pill (`AppStatusPill`)
- Stats row: Share Price, Market Value, Open Value
- Issuer chip with avatar (navigates to profile)
- Message issuer button
- CTA row: Buy Units / Book Profit / Details
- Uses `TradeCard` internally

**New file**: `frontend/src/components/trade/CoOwnAssetCard.tsx`

#### 1.8 Create `OrderHistoryRow` Component
Extract row from `SyndicateOrderHistoryScreen` and `MarketLedgerScreen`:
- Side icon (buy/sell)
- Asset title + order type
- Price + quantity
- Status pill (`AppStatusPill`)
- Timestamp
- Uses consistent row styling

**New file**: `frontend/src/components/trade/OrderHistoryRow.tsx`

---

### Phase 2 — Auction Section Overhaul

#### 2.1 `AuctionsScreen` — Complete Rewrite
- Adopt `TradeHeader` (or hide if still inside TradeHub tab container)
- Replace custom `heroCard` with `MetricGrid` showing:
  - Live Auctions count
  - Total Bids Active
  - Your Watchlist count
- Replace custom `launchRow` with `AppButton variant='primary'` for "Create Auction"
- Replace custom `liveCard` with `AuctionCard` component
- Add `FadeInDown` entrance animation for each `AuctionCard`
- Add search bar at top (filter auctions by title)
- Replace poster ads section with cleaner horizontal scroll using `TradeCard variant='elevated'`
- Replace upcoming strip with cleaner cards using `TradeCard`
- Use `Colors.*` everywhere, remove all inline `IS_LIGHT` constants
- Use `Type.*` tokens for all text

#### 2.2 `CreateAuctionScreen` — Unification
- Adopt `TradeHeader` with "Launch Auction" title + close button
- Replace custom listing picker cards with `AppCard variant='elevated'` items
- Replace raw `TextInput` with `AppInput` for starting bid and buy now price
- Wrap form sections in `TradeCard`
- Add preview card using `TradeCard variant='elevated'` with `CachedImage`
- Add `FadeInDown` entrance animation for form sections
- Use `Colors.*` everywhere

#### 2.3 `MyBidsScreen` — Functional Implementation (NEW)
This screen is currently completely empty. It needs actual functionality:
- Adopt `TradeHeader`
- Fetch bid history from store/API
- Display bids using `OrderHistoryRow` component
- Filter by: Active, Won, Lost
- Show empty state when no bids
- Pull-to-refresh
- Tap to navigate to auction detail
- **This is a feature addition, not just a UI upgrade.**

---

### Phase 3 — CO-OWN Section Overhaul

#### 3.1 `SyndicateScreen` — Complete Rewrite
This is the largest file at 1,781 lines. Needs component extraction:
- Replace custom `heroHeader` (56px title) with `Type.title` and cleaner layout
- Replace metrics row with `MetricGrid` component
- Replace PnL row with `MetricGrid` (2-col)
- Replace custom `AppSegmentControl` usage... actually it already uses `AppSegmentControl` (good)
- Replace custom `issueRow` with `TradeCard` + `AppButton`
- Replace custom `quickActionsRow` with `AppButton` chips
- Replace asset cards with `CoOwnAssetCard` component
- Extract `UnitsComposer` modal
- Add `FadeInDown` entrance animation for asset cards
- Use `Colors.*` everywhere
- **Preserve all functionality**: ISSUED/HOLDINGS toggle, compliance checking, support chat, sync retry

#### 3.2 `CreateSyndicateScreen` — Unification
- Adopt `TradeHeader` with "Issue Co-Own" title
- Replace custom listing picker with `AppCard` items
- Replace raw `TextInput` with `AppInput` for total units and unit price
- Wrap form in `TradeCard`
- Add preview card using `TradeCard` with `CachedImage`
- Add `FadeInDown` entrance animations
- Use `Colors.*` everywhere
- **Preserve**: unit price validation, estimated value calculation, 1ze settlement preview

#### 3.3 `SyndicateHubScreen` — Unification
- Adopt `TradeHeader`
- Replace custom search bar with `AppInput` (search variant)
- Replace sort chips with `AppSegmentControl`
- Replace custom metric cards with `MetricGrid`
- Replace `Image` with `CachedImage` for all asset images
- Replace asset cards with `CoOwnAssetCard`
- Add `FadeInDown` entrance animations (already partially present)
- Use `Colors.*` everywhere
- **Preserve**: search, sort, message issuer, market value calculations

#### 3.4 `TradeScreen` — Unification
- Adopt `TradeHeader` with asset ID title
- Replace custom compliance alert card with `AppStatusPill` or `AppCard variant='tint'`
- Replace side selector with `AppSegmentControl`
- Replace raw inputs with `AppInput`
- Wrap form in `TradeCard`
- Add quote breakdown using `TradeCard`
- Add `FadeInDown` entrance animations
- Use `Colors.*` everywhere
- **Preserve**: limit/market order modes, compliance checking, fee calculation, quote building

#### 3.5 `AssetDetailScreen` — Unification
- Adopt `TradeHeader`
- Replace `Image` with `CachedImage` for hero
- Replace custom chart container with `TradeCard`
- Replace custom order book with styled rows inside `TradeCard`
- Replace ownership list with cleaner list inside `TradeCard`
- Replace custom issuer chip with reusable pattern
- Add `FadeInDown` entrance animations for sections
- Use `Colors.*` everywhere
- **Preserve**: chart ranges, price series, order book snapshot, ownership breakdown, buyout navigation

#### 3.6 `BuyoutScreen` — Unification
- Adopt `TradeHeader`
- Replace flat layout with `TradeCard` for ownership summary
- Add `CachedImage` for asset image
- Add `FadeInDown` entrance animations
- Use `Colors.*` everywhere
- **Preserve**: ownership calculation, buyout offer submission, AML handling

#### 3.7 `SyndicateOrderHistoryScreen` — Unification
- Adopt `TradeHeader`
- Replace custom filter chips with `AppSegmentControl`
- Replace date filter chips with `AppSegmentControl`
- Replace status chip styles with `AppStatusPill`
- Replace custom row cards with `OrderHistoryRow`
- Add `FadeInDown` entrance animations
- Use `Colors.*` everywhere
- **Preserve**: side/date/asset filters, remote pagination, local+remote merge

#### 3.8 `PortfolioScreen` — Unification
- Adopt `TradeHeader`
- Replace custom hero section with `MetricGrid`
- Replace `Image` with `CachedImage` for holdings
- Replace holding cards with `CoOwnAssetCard` (compact variant)
- Add portfolio allocation bars using `TradeCard`
- Add `FadeInDown` entrance animations
- Use `Colors.*` everywhere
- **Preserve**: holdings value, unrealized/realized PnL, issuer messaging

#### 3.9 `AssetLeaderboardScreen` — Unification
- Adopt `TradeHeader`
- Replace custom section cards with `TradeCard`
- Replace `Image` with `CachedImage`
- Add `FadeInDown` entrance animations (already partially present)
- Use `Colors.*` everywhere

#### 3.10 `MarketLedgerScreen` — Unification
- Adopt `TradeHeader`
- Replace custom metrics cards with `MetricGrid`
- Replace custom filter chips with `AppSegmentControl`
- Replace custom row cards with `OrderHistoryRow`
- Add `FadeInDown` entrance animations
- Use `Colors.*` everywhere
- **Preserve**: channel filters, remote pagination, cashflow calculations

---

### Phase 4 — TradeHubScreen Container Upgrade

#### 4.1 Tab Switcher Refinement
- Keep animated tab indicator (already good)
- Replace custom tab button styling with `AppSegmentControl` (fullWidth)
- Add haptic feedback on tab switch
- Use `Colors.*` everywhere (already mostly compliant)

#### 4.2 Quick Actions Refinement
- Replace custom quick action buttons with `AppButton variant='secondary' size='sm'`
- Use consistent icon sizing
- Add `FadeInDown` entrance for quick actions

#### 4.3 Market Snapshot Refinement
- Replace custom market snapshot text with `MetricGrid` mini variant
- Add animated counter for live numbers (already uses `AnimatedCounter`)

---

### Phase 5 — Accessibility & Polish

#### 5.1 Accessibility Audit
- Ensure every `AuctionCard` and `CoOwnAssetCard` has `accessibilityLabel`, `accessibilityRole`, `accessibilityHint`
- Ensure toggle actions announce state changes
- Ensure focus order is logical (top-to-bottom, left-to-right)
- Ensure bid/units composer modals trap focus

#### 5.2 Loading & Empty States
- Add `SkeletonLoader` to async sections (auctions list, asset list, order history)
- Ensure `EmptyState` component is used consistently with proper icons
- Add loading state to `MyBidsScreen`

#### 5.3 Scroll Behavior
- Add `useAnimatedScrollHandler` to headers for subtle opacity/elevation change on scroll
- Consistent with HomeScreen / MyProfileScreen patterns

#### 5.4 Haptic & Toast Feedback
- Light haptic on every card press
- Medium haptic on bid/unit submit
- Heavy haptic on buyout initiate
- Toast on all success/error states (already mostly present)

---

## 4. Files to Create / Modify

### New Components
| File | Purpose |
|------|---------|
| `frontend/src/components/trade/TradeHeader.tsx` | Unified header for all trade subpages |
| `frontend/src/components/trade/TradeCard.tsx` | Standardized card wrapper for trade content |
| `frontend/src/components/trade/MetricGrid.tsx` | Dashboard metric grid with auto-layout |
| `frontend/src/components/trade/BidComposer.tsx` | Extracted bid composer modal |
| `frontend/src/components/trade/UnitsComposer.tsx` | Extracted units order composer modal |
| `frontend/src/components/trade/AuctionCard.tsx` | Live auction card |
| `frontend/src/components/trade/CoOwnAssetCard.tsx` | Co-own asset card |
| `frontend/src/components/trade/OrderHistoryRow.tsx` | Order/history list row |

### Modified Screens (Auction)
| File | Changes |
|------|---------|
| `frontend/src/screens/AuctionsScreen.tsx` | Full rewrite with new components |
| `frontend/src/screens/CreateAuctionScreen.tsx` | Unify with TradeHeader, TradeCard, AppInput |
| `frontend/src/screens/MyBidsScreen.tsx` | Implement actual bid history |
| `frontend/src/screens/TradeHubScreen.tsx` | Refine quick actions, tabs |

### Modified Screens (CO-OWN)
| File | Changes |
|------|---------|
| `frontend/src/screens/SyndicateScreen.tsx` | Extract components, full rewrite |
| `frontend/src/screens/CreateSyndicateScreen.tsx` | Unify with TradeHeader, TradeCard, AppInput |
| `frontend/src/screens/SyndicateHubScreen.tsx` | Unify with new components |
| `frontend/src/screens/TradeScreen.tsx` | Unify with TradeHeader, TradeCard, AppInput |
| `frontend/src/screens/AssetDetailScreen.tsx` | Unify with TradeHeader, CachedImage, TradeCard |
| `frontend/src/screens/BuyoutScreen.tsx` | Unify with TradeHeader, TradeCard |
| `frontend/src/screens/SyndicateOrderHistoryScreen.tsx` | Use OrderHistoryRow, AppSegmentControl |
| `frontend/src/screens/PortfolioScreen.tsx` | Unify with MetricGrid, CoOwnAssetCard |
| `frontend/src/screens/AssetLeaderboardScreen.tsx` | Unify with TradeCard, CachedImage |
| `frontend/src/screens/MarketLedgerScreen.tsx` | Unify with MetricGrid, OrderHistoryRow |

---

## 5. Feature Preservation Checklist

### Auction Features (ALL preserved)
- [ ] Auction creation flow (listing selection, start window, starting bid, buy now)
- [ ] Live auction listing with countdown timer
- [ ] Bid composer with bump chips (+1%, +3%, +5%)
- [ ] Buy Now functionality
- [ ] Watch/unwatch auctions
- [ ] Upcoming auctions horizontal strip
- [ ] Poster ads for upcoming auctions
- [ ] Auction countdown/progress bar
- [ ] Sync status pill + retry banner
- [ ] Pull-to-refresh
- [ ] Empty state when no auctions
- [ ] AML alert handling on bid
- [ ] Navigation to ItemDetail, Checkout
- [ ] Integration with CurrencyContext

### CO-OWN Features (ALL preserved)
- [ ] Co-Own creation flow (listing selection, total units, unit price)
- [ ] ISSUED / HOLDINGS view toggle
- [ ] Units composer (buy/sell with quick chips)
- [ ] Market metrics (issued pools, issued value, your value)
- [ ] PnL tracking (unrealized + realized)
- [ ] Compliance checking display
- [ ] Sync status + retry banner
- [ ] Quick actions (Portfolio, Orders, Leaderboard)
- [ ] Support chat integration
- [ ] Asset detail with chart, order book, ownership breakdown
- [ ] Trade screen with limit/market orders
- [ ] Buyout offer submission
- [ ] Order history with side/date/asset filters
- [ ] Portfolio with allocation visualization
- [ ] Asset leaderboard (movers, value, holders)
- [ ] Market ledger with cashflow tracking
- [ ] Issuer profile navigation
- [ ] Message issuer functionality
- [ ] AML alert handling on orders
- [ ] 1ze settlement display
- [ ] Integration with CurrencyContext, goldRates

---

## 6. Success Criteria

1. All trade subpages use the same `TradeHeader`, `TradeCard`, and input primitives.
2. No inline `IS_LIGHT ? ... : ...` color constants remain in any trade screen.
3. All typography uses `Type` or `Typography` design tokens.
4. All interactive elements provide haptic feedback.
5. All list entrances use `Reanimated` staggered `FadeInDown`.
6. `Image` is replaced with `CachedImage` everywhere in trade screens.
7. `MyBidsScreen` shows actual bid history, not just an empty state.
8. Accessibility labels/hints pass a screen-reader walkthrough.
9. Every existing feature from the preservation checklist still works.
10. Total lines of screen code reduced by 30-40% through component extraction.
