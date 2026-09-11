# Phase 2 — Profile Screen Deconstruction Report

## Summary

Monolithic screen deconstruction of `frontend/src/screens/MyProfileScreen.tsx`, extracting 4 inline render sections into domain-isolated components in `frontend/src/components/myprofile/`.

- **Original LOC:** 1,955
- **Final LOC:** 1,092 (44.1% reduction)
- **New components:** 5 files + 1 index barrel
- **tsc:** 0 errors
- **eslint:** 0 errors, 146 warnings (all pre-existing `i18next/no-literal-string` + `max-lines`)

---

## Extractions

### 1. ProfileHeaderHero (`ProfileHeaderHero.tsx`, 360 LOC)

**What was moved:** Cover media region (FlagshipProfileMedia + gradient fades), floating personalisation controls (settings/share), cover edit/retry/revert behavior with UploadProgressRing, and the collapsed scroll header. All 4 animated styles (`coverStyle`, `coverActionStyle`, `topUtilityStyle`, `headerOpacityStyle`) were moved inside the component and computed from the `scrollY` SharedValue prop.

**Props wired:**
- `coverMedia: string` — display cover URI
- `coverState: ProfileMediaState` — upload status, progress, error
- `avatarState: ProfileMediaState` — avatar upload status/progress (for FlagshipProfileMedia)
- `insetsTop: number` — safe area inset
- `scrollY: SharedValue<number>` — scroll position for animated styles
- `username: string` — collapsed header title
- `onSettings, onShare, onEditCover, onRetryCover, onRevertCover` — callbacks

**Styles moved:** `coverWrap`, `coverTopFade`, `coverBottomFade`, `coverActionLayer`, `topUtilityRow`, `topUtilityRight`, `topUtilityIconBtn`, `topUtilityVisible`, `coverEditTarget`, `coverEditVisible`, `coverFailure`, `coverFailureCopy`, `coverFailureText`, `coverFailureAction`, `coverFailureActionText`, `floatingHeader`, `floatingHeaderTitle`. Themed overrides from the `t` object (`coverWrap`, `coverFailureText`, `coverFailureActionText`, `floatingHeader`, `floatingHeaderTitle`, `topUtilityVisible`, `coverEditVisible`, `coverFailure`) were folded into `createStyles(colors)`.

**UploadProgressRing integration:** PRESERVED. The exact integration is intact inside the component:
```tsx
<UploadProgressRing
  progress={coverState.progress}
  active={coverState.status === 'uploading'}
  size={28}
/>
```
Imported from `../flagship/FlagshipProfileMedia` (not the `../flagship` barrel, which doesn't re-export it).

### 2. CompletionGrowthPanel (`CompletionGrowthPanel.tsx`, 259 LOC)

**What was moved:** The completion progress card (title, percent, progress bar, CTA) and the growth tasks section (first listing, audience growth). The conditional divider between sections is also handled inside.

**Props wired:**
- `showCompletionPrompt, showGrowthPrompt: boolean` — visibility flags
- `completionPercent, completionDone, completionTotal: number` — progress data
- `completionCtaLabel: string` — CTA text
- `completionCtaFocus?: 'avatar' | 'cover'` — EditProfile focus
- `showFirstListingGrowth, showAudienceGrowth: boolean` — growth task visibility
- `onDismissCompletion, onDismissGrowth` — dismiss callbacks
- `onCompleteProfile, onListFirstItem, onGrowAudience` — action callbacks

**Styles moved:** `profileStatusPanel`, `profileStatusDivider`, `completionSection`, `completionHead`, `completionHeadText`, `completionTitle`, `completionPercent`, `completionDismiss`, `completionTrack`, `completionFill`, `completionCta`, `completionCtaText`, `growthSection`, `growthHead`, `growthTitle`, `growthRow`, `growthRowLast`, `growthRowText`, `growthRowTitle`, `growthRowSub`. Themed overrides folded into `createStyles(colors)`. The inline `{ backgroundColor: \`${colors.textMuted}14\` }` on the dismiss button was also folded in.

### 3. ClosetGrid (`ClosetGrid.tsx`, 189 LOC)

**What was moved:** The listings tab body — grid header with count, reorder-mode toggle (Edit/Done), view-all action, FlashList, and the empty state with start-selling and import-listings CTAs.

**Props wired:**
- `listings: Listing[]` — owned listings
- `reorderMode, isSaving: boolean` — reorder state
- `reducedMotion: boolean` — for FadeIn entering animation
- `onToggleReorder, onViewAll, onStartSelling, onImport` — callbacks
- `renderItem` — listing item renderer (passed from screen, uses screen-level styles/dependencies)

**Styles moved:** `gridHeader`, `gridHeaderCount`, `gridHeaderAction`, `listingsEmpty`, `listingsEmptyTitle`, `listingsEmptyBody`, `listingsEmptyCta`, `listingsEmptyCtaText`, `listingsEmptyImportLink`, `listingsEmptyImportText`. Themed overrides folded in. The inline `{ color: colors.brand }` on the import text was also folded in.

### 4. StorefrontTabs (`StorefrontTabs.tsx`, 262 LOC) + StorefrontAboutTab (`StorefrontAboutTab.tsx`, 231 LOC)

**What was moved:** The tab rail (MyProfileTabRail), tab content wrapper (with onLayout), and all 4 tab bodies. The About tab was extracted into its own `StorefrontAboutTab` component because the combined size would have exceeded 250 LOC. The looks and reviews tabs remain inline in StorefrontTabs (they are ~40 LOC each).

**StorefrontTabs props wired:**
- Tab rail: `tabs`, `activeKey`, `onTabChange`, `onTabContentLayout`
- Listings tab: passes through to ClosetGrid
- Looks tab: `looks`, `looksLoading`, `looksError`, `onRetryLooks`, `onCreateLook`, `looksNavigation`
- About tab: passes through to StorefrontAboutTab
- Reviews tab: `reviewSummary`, `reviewCount`, `reviewsLoading`, `reviewsError`, `reviews`, `onRefetchReviews`, `onOpenReviewer`, `onOpenListing`

**StorefrontAboutTab props wired:**
- `coOwnHoldings: CoOwnHoldingPreview[]` — portfolio preview data
- `website: string | null`
- `sellerTrust: SellerTrustSummary | null | undefined`
- `reducedMotion: boolean`
- `onViewPortfolio: () => void`

**Styles moved (About tab):** `portfolioPreview`, `portfolioHeader`, `portfolioLabel`, `portfolioHoldings`, `portfolioHoldingCard`, `portfolioHoldingImage`, `portfolioHoldingInfo`, `portfolioHoldingTitle`, `portfolioHoldingUnits`, `aboutContainer`, `aboutSectionTitle`, `aboutRow`, `aboutRowLast`, `aboutLabel`, `aboutValue`, `aboutEmpty`. Themed overrides folded in.

---

## Screen Cleanup

### Removed imports (no longer used after extraction):
- `ActivityIndicator`, `useAnimatedStyle`, `interpolate`, `Extrapolation`, `FadeIn` from reanimated
- `LinearGradient`, `FlagshipProfileMedia`, `UploadProgressRing`, `isVideoUri`
- `LookPreviewCard`, `ProfileLooksGrid`, `MyProfileTabRail`, `ReviewSummaryBlock`, `ProfileReviewRow`
- `SkeletonLoader`, `FlashList`
- `Control` from designTokens (only used by moved styles)

### Removed `t` themed overrides (29 properties moved to components):
All color overrides for cover, floating header, grid header, listings empty, about, portfolio, completion, and growth sections.

### Removed `styles` entries (493 lines of styles moved to components):
All cover, floating header, cover edit/failure, grid header, listings empty, portfolio, about, completion, and growth styles. The screen retains only: `container`, `scrollContent`, grid card/item/reorder styles (used by `renderListingItem`), and pre-existing dead-code styles (stats, trust badges, hero price).

### Removed animated styles (48 lines):
`coverStyle`, `coverActionStyle`, `topUtilityStyle`, `headerOpacityStyle` — all recomputed inside ProfileHeaderHero from the `scrollY` SharedValue.

---

## Verification

- **tsc --noEmit:** 0 errors
- **eslint:** 0 errors, 146 warnings (all pre-existing `i18next/no-literal-string` + `max-lines`)
- **UploadProgressRing:** Preserved intact inside ProfileHeaderHero with exact same props
- **Visual layout:** No changes — pure structural extraction
- **No files touched in `components/coown/` or `screens/AssetDetailScreen.tsx`**

---

## Concerns

1. **`renderListingItem` remains in the screen.** The listing item renderer uses many screen-level dependencies (navigation, reorder state, pin/feature callbacks, formatFromFiat, themed overrides). It's passed as a `renderItem` prop to ClosetGrid. The styles it uses (`gridCard`, `gridImageWrap`, `pinnedBadge`, `soldOverlay`, `reorderOverlay`, `rankBadge`, etc.) remain in the screen's `styles` object. This is intentional — extracting the item renderer would require passing 10+ callbacks and would not improve isolation.

2. **Pre-existing dead styles retained.** The screen's `styles` object still contains unused styles (`statsRow`, `statCell`, `trustBadgesScroll`, `heroPriceGradient`, etc.) that were dead before this extraction. These were left untouched to avoid scope creep.

3. **Pre-existing unused imports retained.** `ScrollView` and `Share` from react-native were unused before this extraction and remain unused. Left untouched to avoid scope creep.

4. **`max-lines` eslint warning persists.** The screen is 1,092 LOC (eslint counts 949 non-blank/non-comment). The 800-line limit was already exceeded before extraction (1,955 lines). Further reduction would require extracting the `renderListingItem` callback and the remaining state/effect logic.
