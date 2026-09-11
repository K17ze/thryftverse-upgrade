# Phase 2 — ItemDetailScreen Monolithic Deconstruction Report

## Summary

Extracted 4 inline render sections from `ItemDetailScreen.tsx` (originally 2,428 LOC) into domain-isolated components in `frontend/src/components/commerce/detail/`. The screen now acts as an orchestrator, delegating render sections to self-contained components that follow the established pattern (props interface, createStyles factory, useAppTheme, TypographyV2).

## Extractions

### 1. CommerceTrustDossier (lines 970–1086, ~117 LOC → 196 LOC component)

**What was moved:**
- The first-viewport seller trust row (`CommerceDetailSellerRow` call with rich variant)
- The inline trust-facts IIFE (seller rating, verification, response time, dispatch time, buyer protection fallback — up to 3 elevated facts as flat hairline-separated rows)

**Props wired:**
- `seller: SellerTrustSummary | null`
- `sellerStatsLine: string | undefined`
- `sellerVerified: boolean`
- `commerce: ListingCommerceContext`

**Styles moved to component's own `createStyles`:**
- `firstViewportSellerRow`
- `trustFactsSection`
- `trustFactRow`
- `trustFactDot`
- `trustFactText`

### 2. CommerceIdentityBlock (lines 868–968, ~101 LOC → 250 LOC component)

**What was moved:**
- The editorial identity chapter wrapper
- `CommerceDetailIdentity` call (family, tone, density, eyebrow, title, price, discount, secondary line, interest signal)
- The consolidated attribute row (condition chip with tap-to-open-definition, size/category text, social proof inline, size guide link)
- The izeText line (quiet 1ZE-equivalent value)

**Props wired:**
- `item: Listing`
- `displayTitle`, `formattedPrice`, `formattedOriginal`, `hasDiscount`, `discountPercent`
- `secondaryLine`, `interestSignal`, `priceIzeText`, `attributeLine`, `socialProofLine`
- `conditionMeta: { color: string; definition: string } | null`
- `isCompactScreen: boolean`
- `onConditionPress: () => void`, `onSizeGuidePress: () => void`

**Styles moved to component's own `createStyles`:**
- `editorialIdentityChapter`
- `attributeRow`
- `attributeLeftCluster`
- `conditionChip`
- `conditionChipText`
- `attributeText`
- `sizeGuideLink`
- `izeText`
- `socialProofInline`

**Styles retained in screen (still used by condition sheet and description section):**
- `conditionDot` (used in condition definition sheet)
- `quietTextTarget` (used in description "Read more" toggle)

### 3. CommerceMediaHero (lines 789–853, ~65 LOC → 139 LOC component)

**What was moved:**
- `CommerceMediaStage` call (images, category, paging/zoom/fullscreen, big heart animation, family badge overlay)
- `CommerceDetailMediaRail` call (Back, Share, Save right actions + overflow)

**Props wired:**
- `images`, `category`, `objectId`, `isFav`, `isSaved`, `isSold`, `topInset`
- `scrollY: SharedValue<number>` (stays in orchestrator, passed as prop)
- `onBack`, `onShare`, `onSave` (media stage save with auth), `onToggleFav`, `onDoubleTap`, `onZoomStart`
- `onOpenFullscreen`, `heightFraction`, `initialIndex`, `onActiveIndexChange`
- `bigHeartOpacity`, `bigHeartScale` (SharedValues, stay in orchestrator)
- `showThumbnailStrip`, `familyStateAccent`
- `onRailSave` (rail save without auth — different from media stage save)
- `onOverflow`

**Styles moved to component's own `createStyles`:**
- `familyBadgeOverlay`

### 4. CommerceActionDock (lines 1517–1723, ~207 LOC → 246 LOC component)

**What was moved:**
- The entire tier-aware sticky action dock IIFE
- Owner state (Manage listing)
- Sold state (Sold badge + "More like this")
- Unavailable state (reserved/paused/draft/missing_price/missing_seller/status_unknown)
- Tier-adaptive dock actions:
  - brokered: Enquire + Request viewing
  - specialist: Buy now + Enquire
  - authenticated_luxury: Buy now + Make offer
  - standard: Buy now + Make offer

**Props wired:**
- `item: Listing`, `capabilities: ListingCapabilities`, `commerce: ListingCommerceContext`
- `formattedPrice`, `formattedOriginal`, `hasDiscount`
- `onManageListing`, `onBrowseSimilar`, `onBuyNow`, `onMakeOffer`, `onEnquire`, `onRequestViewing`

**Navigation/auth/analytics/haptic calls passed as callbacks from orchestrator:**
- `onManageListing`: `navigation.navigate('ManageListing', { itemId: item.id })`
- `onBrowseSimilar`: `navigation.navigate('MainTabs', { screen: 'Explore' })`
- `onBuyNow`: `requireAuth('purchase')` + `ProductAnalytics.checkoutStart` + `haptic.medium()` + `navigation.navigate('Checkout', ...)`
- `onMakeOffer`: `requireAuth('purchase')` + `ProductAnalytics.offerStart` + `setMakeOfferVisible(true)`

**Styles moved to component's own `createStyles`:**
- `dockStateBadge`

## Index Update

`frontend/src/components/commerce/detail/index.ts` updated to export all 4 new components with their props types.

## Unused Imports Removed from ItemDetailScreen.tsx

- `ProductFamilyBadge` (now used via CommerceMediaHero)
- `CommerceMediaStage` (now used via CommerceMediaHero)
- `CommerceDetailMediaRail` (now used via CommerceMediaHero)
- `CommerceDetailIdentity` (now used via CommerceIdentityBlock)
- `CommerceDetailSellerRow` (now used via CommerceTrustDossier)
- `CommerceDetailStateDock` (now used via CommerceActionDock)

## Final LOC

| File | LOC |
|------|-----|
| `ItemDetailScreen.tsx` (before) | 2,428 |
| `ItemDetailScreen.tsx` (after) | 1,826 |
| `CommerceTrustDossier.tsx` | 196 |
| `CommerceIdentityBlock.tsx` | 250 |
| `CommerceMediaHero.tsx` | 139 |
| `CommerceActionDock.tsx` | 246 |
| **Net reduction** | **602 lines** |

The screen did not reach the <350 LOC target. The remaining 1,826 lines include many other sections not part of this extraction task (description, seller info card, more from seller rail, shipping & returns, price history, questions, related items, seen in looks, sync retry, purchase details sheet, QA sheet, overflow sheet, make offer sheet, condition info sheet, dismiss gesture, pagination dots). Further extractions of these sections would be needed to reach the <350 LOC target.

## tsc Result

```
node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
```
**Result: Exit code 0 — no errors**

## Lint Result

```
node ./node_modules/eslint/bin/eslint.js src/screens/ItemDetailScreen.tsx src/components/commerce/detail/CommerceTrustDossier.tsx src/components/commerce/detail/CommerceIdentityBlock.tsx src/components/commerce/detail/CommerceMediaHero.tsx src/components/commerce/detail/CommerceActionDock.tsx --max-warnings=999
```
**Result: 0 errors, 249 warnings (all pre-existing accessibility/i18n warnings)**

## Concerns

1. **LOC target not met.** The screen is 1,826 LOC, well above the <350 LOC target. The 4 extractions removed 602 lines, but the screen still contains many inline sections (description, seller info, rails, sheets, gesture handling) that would need further extraction to reach the target. This task scoped only 4 extractions.

2. **Shared style duplication.** `conditionDot` and `quietTextTarget` are defined in both the screen's `StyleSheet.create` and `CommerceIdentityBlock`'s `createStyles`. This is intentional — the screen still uses these styles in the condition definition sheet and description "Read more" toggle respectively. Each component is self-contained per the established pattern.

3. **`familyStateAccent` is always null.** The `familyStateAccent` value in the screen is hardcoded to `null` (line 666 in the original). The `CommerceMediaHero` component receives it as a prop and conditionally renders the family badge overlay. Since it's always null, the overlay never renders. This is preserved as-is per the "no behavior change" constraint.
