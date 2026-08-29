# ThryftVerse Frontend — Flagship Upgradation Report v2

**Date:** 2026-08-29
**Auditors:** 15 parallel subagents (11 surface audits + 4 web research) + static code analysis
**Scope:** Full `frontend/src` — 171 screens, 484 components, 1,380 .tsx/.ts files, platform/hooks/services/store/navigation architecture
**Reference benchmarks:** Pinterest 2026 (Gestalt system), Instagram Aug-2026 (sketchbook/tactile), Snapchat 2026 (camera-first discipline), React Native flagship best practices 2026 (New Architecture, Reanimated 4, FlashList v2)
**Design contract:** `Design.md` v1.5, `AGENTS.md` §4 anti-AI charter

---

## Executive Summary

ThryftVerse's frontend is **architecturally mature** — it has a real design-token system (`ThemeColors`, `Space`, `Radius`, `Stroke`, `Type`/`TypographyV2`), FlashList v2, Reanimated 3/4, full state machines on most surfaces, honest AI-trust signals, and a flagship screen/header primitive family. The platform layer (realtime, monitoring, payments, storage) is defensively engineered with graceful degradation.

However, the audit identified **systemic defects** across three dimensions:

1. **Anti-AI design tells** — patterns that make the app read as LLM-generated rather than human-authored
2. **Token discipline failures** — hardcoded colors, magic numbers, and dual token systems that bypass the design system
3. **Truthful-UI violations** — fabricated data, dead controls, broken contracts, and missing i18n

**Defect totals across 11 surface areas + theme system:**

| Severity | Count | Key Themes |
|----------|-------|------------|
| **P0** | 66+ | Fabricated data, dead controls, broken contracts, hardcoded English bypassing i18n, icon-as-illustration, broken bundle checkout, leaked developer annotations, no-op variant switches, stale module-load dimensions, theme-blind components |
| **P1** | 254+ | Inconsistent primitives (dual tool docks, dual token systems, dual toggle implementations, dual TypingIndicator, dual VoiceMessagePlayer), hardcoded colors bypassing theme, missing error states, card-on-card composition, icon-in-circle disease, hex-alpha fragility, arithmetic on design tokens, mutable global state |
| **P2** | 327+ | Magic numbers, stroke grammar drift, label-everything disease, skeleton/final geometry mismatch, dead code, DRY violations, accessibility hint gaps, deprecated shims, divergent type scales |

**The 10 highest-leverage fixes** (do these first):

1. **Kill icon-in-circle disease** across 30+ surfaces — adopt the transparent 44pt `iconTarget` pattern everywhere
2. **Consolidate dual primitives** — legacy `CreatorToolDock`→`ContextToolRail`, dual `OverflowItem`, dual `layerTypeLabel`, dual toggle implementations, dual `isVideoUrl`
3. **Migrate all hardcoded colors to theme tokens** — `#ff6b6b`, `#C9A46A`, `#3B82F6`, `#4CD964`, `#FF3B30`, `#fff`, `#000`, and 50+ rgba strings across poster/creator/orders surfaces
4. **Complete the `TypographyV2` migration** — 12 of 13 Co-Own screens and all 12 Co-Own components still use legacy `Type`/`Typography` tokens
5. **Remove all fabricated data** — `combinedShipping = 3.99`, `BUNDLE_TIERS`, "3x more likely" statistic, fabricated Apple Pay/Google Pay brand marks, `checkCoOwnEligibility` stub
6. **Wire all dead controls** — `InAppNotificationCenter` action handler, `liveShopping` toggle, `CoOwnReconciliationBanner isActive={false}`, `hasReview: false` hardcoded, `onActorPress` never wired
7. **Replace all `Alert.alert`** with `ConfirmationSheet` or inline confirmation — 6+ surfaces use system dialogs that break in-app flow
8. **Remove all leaked developer annotations** — `← information` in `CoOwnPositionCard`, raw `assetId.slice(0,20)…` in `DistributionHistoryScreen`, "Sponsor locked is not exposed by the backend" in `CoOwnSupplySheet`
9. **Fix all hardcoded English strings** — 30+ files in Orders/Fulfilment surface alone bypass `t()` i18n
10. **Split the God Store** — `useStore.ts` (2,492 lines) holds auth, commerce, chat, bots, preferences, and UI state with no slice boundaries

---

## Part 1 — Web Research Synthesis (August 2026)

### 1.1 Instagram — "Sketchbook" Metaphor

**Core principle:** Marketplace chrome as a restrained, tactile sketchbook. Instagram's Aug-2026 refresh explicitly engineers "tactile, analog photographic language" as anti-AI positioning.

**Transferable insights:**
- **Human hand visibility** — imperfection as authenticity; visible authorship signals
- **Brand retreats for content** — chrome should disappear behind media
- **Curation over chronology** — boards/collections, not feeds
- **Conversational surfaces** — UI that feels like a dialogue, not a dashboard
- **Physicality** — tactile textures, paper metaphors, material honesty

**ThryftVerse application:** The poster/creator surfaces should feel like a physical sketchbook — tactile, authored, with visible craft. The marketplace chrome should retreat behind real product imagery.

### 1.2 Pinterest — Gestalt Design System

**Core principle:** Restraint, tokenization, and the image as the headline. Pinterest's Gestalt system uses Style Dictionary for tokens, a 4px base spacing grid, and a two-radius shape vocabulary.

**Transferable insights:**
- **Warm-paper surfaces** — not cold grey; background colors that feel like paper
- **Humanist typefaces** — not geometric sans-serifs
- **Masonry with true aspect ratios** — natural media shapes, not forced squares
- **Blur-up loading** — `expo-image` with `ThumbHash` for progressive image loading
- **User-controlled AI transparency** — users can see and control AI recommendations
- **Shortest-column-first masonry algorithm** — optimal column balancing

**ThryftVerse application:** The discovery feed should use true masonry with natural aspect ratios. Background colors should feel warm and paper-like, not cold grey. AI transparency should be user-controllable.

### 1.3 Snapchat — Camera-First Discipline

**Core principle:** Discipline over complexity. One color, one geometry, one canvas. Spring physics, haptic confirmation, sub-300ms latency.

**Transferable insights:**
- **9:16 full-bleed canvas** — immersion, safe zones
- **Floating transparent tool rails** — not docked chrome
- **Physics-based motion** — spring animations, not timing curves
- **Haptic confirmation** — every meaningful action has haptic feedback
- **Gesture-native navigation** — hub-and-spoke swipe model
- **Strict anti-AI-generated content policies** — authenticity as a feature

**ThryftVerse application:** The creator/camera surfaces should use floating transparent tool rails (already partially implemented in `ContextToolRail`). Motion should be spring-based with haptic confirmation. The legacy `CreatorToolDock` with `LiquidGlassBackdrop` and `GradientRing` violates this principle.

### 1.4 React Native Flagship — New Architecture

**Core principle:** RN 0.84+, Hermes V1, Fabric, TurboModules, Reanimated 4, FlashList v2, `expo-image` with `ThumbHash`, WCAG 2.2 AA.

**Transferable insights:**
- **Reanimated 4** — declarative CSS animations, no more `useAnimatedStyle` boilerplate
- **FlashList v2** — recycling, estimated item sizes, masonry support
- **`expo-image` with `ThumbHash`** — blur-up progressive loading
- **`react-native-keyboard-controller`** — proper keyboard handling
- **Gesture Handler 3.x** — better gesture composition
- **WCAG 2.2 AA compliance** — 44pt hit targets, reduced motion, contrast ratios
- **Offline-first state management** — React Query for server state, Zustand for UI state

**ThryftVerse application:** Migrate to Reanimated 4 declarative animations. Use `expo-image` with `ThumbHash` for all image loading. Ensure FlashList v2 is used everywhere (Inventory screen still uses `ScrollView` + `.map()` for 200 items). Split the God Store into domain slices.

---

## Part 2 — Cross-Cutting Anti-AI Tells (Systemic)

These defects appear across multiple surface areas and are the loudest "AI-generated" signals.

### 2.1 Icon-in-Circle Disease (P0/P1, systemic — 30+ surfaces)

**The tell:** Large Ionicons outline glyphs (28–56px) inside tinted circles/squares used as decorative chrome — on banners, empty states, status heroes, sheet headers, stepper nodes, and onboarding slides.

**Affected surfaces (30+):**
- **Orders:** `EtaBanner` (28px cube-in-circle), `InspectionBanner` (36px checkmark-in-circle), `OrderStatusStepper` (5× icon-in-circle nodes), `ReviewPromptSheet` (40px star-in-circle), `AddCardSheet` (48px card-in-circle), `CheckoutPaymentSelector` (36px icon-in-rounded-square per row), `OrdersEmptyGraphic` (72px receipt-in-circle)
- **Creator:** Legacy `ToolButton` (icon-in-circle with `GradientRing`), `ControlsRail` (labels on every icon)
- **Co-Own:** `CoOwnPortfolioStorytelling` (Unicode ▲/▼ instead of Ionicons), `DistributionHistoryScreen` (36px repeat-icon-in-circle), `AssetLeaderboardScreen` (sectionIcon chrome)
- **Notifications:** `InAppNotificationCenter` (action button with icon), various notification row leading slots
- **Support:** `SupportTicketDetailScreen` (closed status uses error-tone icon)
- **Misc:** `OutfitBuilderScreen` (hardcoded background palette), `OnezeCoinIcon` (hardcoded gradient)

**Why it reads as AI:** Flagship apps (Instagram, Snapchat, Pinterest, Cash App) use transparent 44pt hit targets with 20–24pt glyphs. Icon-in-circle is the canonical AI-onboarding pattern. The circle adds no information — it's decorative chrome.

**Fix:** Adopt the `ContextToolRail`/`CreatorToolButton` pattern: transparent 44pt target, 20–24pt glyph, optional flat backplate at 12% opacity only for selection state. Remove all decorative circles. For empty states, use `FlagshipState`'s slot-based icon (small, restrained) or media-driven empty states.

### 2.2 Card-on-Card Composition (P1, systemic — 15+ surfaces)

**The tell:** Nested surfaces — a bordered/filled card inside another bordered/filled card, or multiple `ElevatedSurface` panels stacked vertically. At thumbnail scale this reads as stacked grey rectangles.

**Affected surfaces:**
- **Orders:** `OrderReceiptScreen` (receipt card + "What happens next" sub-card), `OrderSupportScreen` (5 `ElevatedSurface` panels), `ReviewPromptSheet` (item card inside sheet), `AddCardSheet` (boundary card inside sheet), `BundleBagScreen` (every item is a bordered card)
- **Support:** `SupportTicketDetailScreen` (4+ `ElevatedSurface` panels stacked)
- **Seller:** `SellerVerificationScreen` (card-wrapped demand items), `MyListingsScreen` (StatCard 2×2 grid), `MyOrdersScreen` (`ElevatedSurface` on search bar)
- **Co-Own:** `PortfolioScreen` (4-tile summary stats), `MarketLedgerScreen` (summary card), `CoOwnLedgerSummary` (4-item horizontal stat bar)
- **Creator:** Legacy `CreatorToolDock` (`LiquidGlassBackdrop`)

**Fix:** Adopt the `SettingsSection` flat pattern as default. Hairline separators, no fills, no shadows. Containment only for genuine state boundaries (modal vs canvas, selected vs unselected). One surface per viewport. Replace `StatCard` grids with `FlagshipMetricLine` rows.

### 2.3 Inconsistent Primitives (P1, systemic — 12+ instances)

**The tell:** Multiple components implementing the same concept with different geometry/styling — no one owned the system.

**Affected instances:**
- **Tool dock systems:** Legacy `CreatorToolDock`→`dock/ToolButton` (with `GradientRing`, `LiquidGlassBackdrop`) vs new `ContextToolRail`→`CreatorToolButton` (transparent, flat backplate)
- **OverflowItem:** `studio/OverflowMenu.tsx` vs `poster/PosterComposerParts.tsx` — different props, styles, behavior
- **layerTypeLabel:** `PosterComposerScreen.tsx` vs `LookComposerScreen.tsx` — identical logic, different labels for same types
- **Toggle implementations:** `DistributionHistoryScreen` uses RN `Switch` vs `CoOwnPriceAlertsScreen` uses custom hand-built toggle
- **Bottom sheets:** `ShippingPickerSheet` uses raw `Modal` vs `SmartSellCard` uses `Pressable` overlay vs `ContextMenu` uses spring-entrance
- **isVideoUrl:** Duplicated in `PosterHighlightViewerScreen` vs `utils/posterPhysics`
- **CellActionSheet vs ContextMenu:** `MultiPhotoCollage` duplicates `ContextMenu` pattern
- **formatHour:** Duplicated in `NotificationPreferencesScreen` vs `PushNotificationsScreen`
- **DISPOSITION_LABELS:** Duplicated in `SupportTicketDetailScreen` vs `SupportCaseDetailScreen` with different wording
- **Header primitives:** 4 of 10 seller screens use different headers (`SafeAreaView`+custom, `TradeHeader`, `ScreenHeader`, `FlagshipHeader`)
- **Token systems:** Legacy `Type`/`Typography` vs `TypographyV2`/`FontFamily` — 12 of 13 Co-Own screens use legacy
- **Sentry entry points:** `lib/sentry.ts` vs `platform/monitoring/sentry.ts` — potential duplicate

**Fix:** Consolidate to one primitive per concept. Delete legacy implementations. Create shared modules for cross-screen utilities.

### 2.4 Hardcoded Colors Bypassing Theme (P0/P1, systemic — 60+ instances)

**The tell:** Raw hex colors, rgba strings, and iOS system colors used directly in styles instead of `ThemeColors` tokens. Breaks light/dark parity and theme switching.

**Affected surfaces:**
- **Creator:** `PosterComposerParts.tsx` (`#ff6b6b` × 5, `#C9A46A`), `PosterStickerLayer.tsx` (`#3B82F6` × 4, `#FFFFFF` × 2, 8 rgba strings), `StickerInteractionPanel.tsx` (`#4CD964`, `#FF3B30`, `rgba(20,20,20,0.95)`)
- **Poster:** `PosterViewerScreen.tsx` (entire screen hardcoded for dark mode — static `StyleSheet.create`), `PosterHighlightViewerScreen.tsx` (all colors hardcoded), `TemplatePicker.tsx` (dark-only drawer), `PosterArchiveScreen.tsx` (iOS system green)
- **Orders:** 10+ files with `${colors.success}08` hex-alpha concatenation
- **Co-Own:** `CoOwnPositionCard.tsx` (`← information` leaked annotation), `CoOwnSupplySheet.tsx` (developer-facing note text)
- **Misc:** `OutfitBuilderScreen.tsx` (`BG_COLORS` array of 8 raw hex), `OnezeCoinIcon.tsx` (gradient `['#f4d27b', '#c68a2d']`)
- **Seller:** `MyListingsScreen.tsx` (`statusColor + '20'` hex-alpha concatenation)

**Fix:** Replace all hardcoded colors with `ThemeColors` tokens. Add gold gradient colors, pastel options, and coin gradient to `ThemeColors`. Use a proper alpha-blend utility instead of hex-string concatenation. Convert `PosterViewerScreen` from static `StyleSheet.create` to `useMemo(() => createStyles(colors), [colors])`.

### 2.5 Label-Everything Disease (P1, systemic — 20+ surfaces)

**The tell:** Every row has an eyebrow, a title, a subtitle, a caption, a badge. Section headers with all-caps eyebrows above titles. Labels that merely name an obvious object.

**Affected surfaces:**
- **Creator:** `ControlsRail` (labels on flash/flip icons — the icon IS the label)
- **Co-Own:** `SyndicateHubScreen` (sectionEyebrow: "MARKET HIGHLIGHTS", "YOUR PORTFOLIO", "MARKETPLACE"), `CoOwnTrustPanel` (all-uppercase item labels)
- **Orders:** `OrderDetailScreen` ("Timeline" label on a self-evident timeline), `CheckoutSelectionRow` (uppercase eyebrow on every row), `OrderSupportScreen` ("REASON", "DETAILS" uppercase labels)
- **Support:** `SupportCaseDetailScreen` (6 uppercase eyebrows: "PRIORITY", "OPENED", "UPDATED", "REQUESTED OUTCOME", "RESOLUTION", "RELATED")
- **Seller:** `SellerAnalyticsScreen` (`sparkles` novelty icon for section header)

**Fix:** Remove eyebrows where the content is self-evident. Use sentence case, not uppercase. Let the object be the label. A timeline doesn't need a "Timeline" label. A radio selector doesn't need a "REASON" eyebrow.

### 2.6 Fabricated Data & Dead Controls (P0, systemic — 12+ instances)

**The tell:** Controls that appear functional but do nothing, data that is fabricated client-side, and developer annotations leaked into production UI.

**Affected instances:**
- **BundleBagScreen:** `combinedShipping = 3.99` fabricated, `BUNDLE_TIERS` hardcoded, bundle checkout navigates to single-item checkout
- **MakeOfferScreen:** "3x more likely to be accepted" — unevidenced statistic
- **CheckoutPaymentSelector:** Fabricated `'Pay'`/`'G'` wallet brand marks
- **NotificationPreferencesScreen:** `liveShopping` toggle never persisted
- **InAppNotificationCenter:** `handleAction` is a no-op — action button does nothing
- **OrderDetailScreen:** `hasReview: false` hardcoded — review state never wired
- **CoOwnPositionCard:** `← information` leaked developer annotation
- **DistributionHistoryScreen:** Raw `assetId.slice(0, 20)…` shown to users
- **CoOwnSupplySheet:** "Sponsor locked is not exposed by the backend" developer note
- **CoOwnReconciliationBanner:** `isActive={false}` hardcoded in 2 screens
- **checkCoOwnEligibility:** Always returns `{ ok: true }` — compliance never enforced
- **FeedExplanationSheet:** Fabricated topic ID for removal — broken UI→API contract
- **HelpSupportScreen:** All 5 category shortcuts use `{ kind: 'general' }` — categories are decorative

**Fix:** Remove all fabricated data. Wire all dead controls or remove them. Replace developer annotations with user-friendly text. Enforce compliance checks. Implement action routing for in-app notifications.

### 2.7 Hardcoded English Bypassing i18n (P0, systemic — 30+ files)

**The tell:** English strings hardcoded in JSX/Alert.alert/toast instead of using `t()` i18n function. Some files mix `t()` calls with hardcoded English, creating inconsistent locale behavior.

**Affected surfaces:**
- **Orders:** `OrderDetailScreen.tsx` (Alert.alert strings), `OrderReceiptScreen.tsx` (all strings hardcoded, `t` variable shadows i18n import), `OrderSupportScreen.tsx` (ALL_SUPPORT_TOPICS, EVIDENCE_GUIDANCE), `WriteReviewScreen.tsx` (RATING_LABELS, all strings), `BuyerProtectionScreen.tsx` (Alert.alert, all UI strings), `PostageScreen.tsx` (mixed), `MakeOfferScreen.tsx` (review overlay strings), `BundleBagScreen.tsx` (toast strings)
- **Orders components:** `DispatchCountdown`, `EscrowBanner`, `EtaBanner`, `OrderActionsSheet`, `OrderCounterpartySection`, `OrderLedgerRow`, `OrderStatusStepper`, `OrdersFilterSheet`, `OrdersTabRail`, `OrderSupportSection`, `ReviewPromptSheet`, `ShipmentDetails`, `TransactionBreakdown`, `OrdersEmptyGraphic`
- **Checkout:** `AddAddressSheet`, `AddCardSheet`, `CheckoutPaymentSelector`
- **Support:** `HelpSupportScreen` (search starts chat instead of showing articles), `SupportCaseDetailScreen` (`'en-GB'` locale hardcoded)
- **Notifications:** Various notification row components

**Fix:** Replace all hardcoded English with `t()` i18n calls. Use device locale instead of hardcoded `'en-GB'`. Rename `t` themed object in `OrderReceiptScreen` to `themed` to avoid shadowing.

### 2.8 Hex-Alpha Concatenation (P1, systemic — 15+ files)

**The tell:** `${colors.success}08`, `${colors.brand}15`, `${colors.warning}25` — appending hex alpha to a color string that may be `rgba()` in some themes, producing invalid color strings.

**Affected files:** `OrderDetailScreen`, `EscrowBanner`, `EtaBanner`, `InspectionBanner`, `OrderStatusStepper`, `ReviewPromptSheet`, `MyListingsScreen`, `SellerTrustBadge`, `SustainabilityTags`, `CoOwnPriceAlertsScreen`, `PosterStoryActivityScreen`, `InAppNotificationBanner`

**Fix:** Create a proper alpha-blend utility function or add `*Subtle` tokens to `ThemeColors` (`successSubtle`, `brandSubtle`, `warningSubtle`, `dangerSubtle`).

---

## Part 3 — Surface-by-Surface Audit Findings

### 3.1 Catalog Import Surface

**Files audited:** Catalog import flow screens and components

**P0 defects:**
- Duplicate primary actions in the import flow
- Silent dropping of available sources
- Incorrect filtering in "all" tabs
- Silent item dropping on approval

**P1 defects:**
- `FadeInUp.springify().duration()` anti-pattern (spring + duration don't compose)
- No empty state for zero sources
- `fetch` with `{ uri }` body on Android (may fail)
- Inconsistent button radii
- Duplicated `BackButton` and `ReceiptRow` components
- Bureaucratic uppercase labels

**Anti-AI tells:** Card-on-flat-list, symmetry-by-default, label-everything disease, duplicate headings, dead/no-op controls

### 3.2 Creator Frontend Surface

**Files audited:** 40+ components across poster editor, camera capture, creative tools, look composer, timeline, drawing workspace, color picker, dock surfaces

**P0 defects (5):**
1. **Dual competing tool dock systems** — `CreatorToolDock` (legacy, with `GradientRing` + `LiquidGlassBackdrop`) vs `ContextToolRail` (new, transparent). Both imported and used.
2. **Hardcoded `#ff6b6b` danger color** in `PosterComposerParts.tsx` (5 instances) — bypasses `colors.danger`
3. **Hardcoded `#C9A46A` antique gold** in `PosterComposerParts.tsx` opacity bar — bypasses `colors.antiqueGold`
4. **Stale documentation** — `GalleryCarousel` comment says 64×64 but code uses 44×44
5. **Stale documentation** — `ShutterButton` JSDoc says 80pt but code uses 78pt

**P1 defects (10):**
1. `FrameTray` video info label is a dead-end state ("future update" with no action)
2. `CreatorToolDock` uses `LiquidGlassBackdrop` — decorative chrome
3. `dock/ToolButton` uses `GradientRing` — decorative chrome
4. `OverflowMenu` duplicates `OverflowItem` from `PosterComposerParts`
5. `layerTypeLabel` duplicated across Poster and Look composers with different labels
6. `SlideUpSurface` magic number `300` for translateY
7. `CreatorCamera` imports `ControlsRail` but doesn't use it in render
8. `DrawingWorkspace` `CANVAS_TOP_OFFSET = 120` magic number
9. `EffectPreviewRail` `e.absoluteX - 0` redundant dead code
10. `TimelineTrack` `widthSV` shared value set but never read in a worklet

**Anti-AI tells (7):** Icon-in-circle (legacy ToolButton), decorative chrome (GradientRing), glass effects (LiquidGlassBackdrop), label-everything (ControlsRail), verbose explanatory copy (FrameTray), inconsistent primitives (dual systems), symmetry-by-default (OverflowMenu)

**Top fixes:**
1. Eliminate legacy tool dock system — delete `CreatorToolDock`, `dock/ToolButton`, `dock/Tooltip`, `GradientRing`
2. Replace all hardcoded colors with theme tokens
3. Consolidate `OverflowItem` and `layerTypeLabel` into shared modules

### 3.3 Seller Hub & Listings Management Surface

**Files audited:** 21 files (10 screens + 11 components)

**P0 defects (3):**
1. **`formatMoney` typo** — `izeFractionDigits` should be `minimumFractionDigits` in `SellerHubScreen.tsx` lines 100, 102. Silently produces incorrect output.
2. **`StatCard` 2×2 grid** in `MyListingsScreen.tsx` — classic generic dashboard silhouette. Thumbnail test fails: four identical grey squares.
3. **`ScrollView` + `.map()` for 200 listings** in `InventoryManagementScreen.tsx` — should use `FlashList` for recycling. Severe memory/performance issue.

**P1 defects (11):**
1. Period change triggers full skeleton flash (SellerAnalyticsScreen)
2. Wrong analytics tracking event — `seller_dashboard_viewed` instead of `seller_analytics_viewed`
3. `SellerAuctionCentreScreen` doesn't use `FlagshipScreen`/`FlagshipHeader`
4. Header title "Seller Centre" doesn't match route `SellerAuctionCentre`
5. `Alert.alert` for dispatch confirmation breaks native flow (SellerFulfilmentScreen)
6. `renderManualForm` not memoized (SellerFulfilmentScreen)
7. Card-wrapped demand items violate flat canvas principle (SellerVerificationScreen)
8. `summaryBanner` is a centered card — generic dashboard silhouette (SellerVerificationScreen)
9. `quickActionsRow` has 4 secondary actions — violates restraint (MyListingsScreen)
10. `ElevatedSurface` for search input — decorative chrome (MyOrdersScreen)
11. Uses `ScreenHeader` instead of `FlagshipHeader` (MyOrdersScreen)

**Cross-cutting:** 4 of 10 screens use different header primitives. Hex-alpha concatenation in 3+ files. Magic number subtractions (`Type.meta.size - 1`) in 2+ files.

**Top fixes:**
1. Fix `izeFractionDigits` → `minimumFractionDigits` (P0, breaks formatting)
2. Replace `StatCard` 2×2 grid with `FlagshipMetricLine` rows (P0)
3. Replace `ScrollView` + `.map()` with `FlashList` in `InventoryList` (P0)

### 3.4 Co-Own Extended Surface

**Files audited:** 25 files (13 screens + 12 components)

**P0 defects (3):**
1. **`← information` leaked developer annotation** in `CoOwnPositionCard.tsx` line 253 — visible in production UI
2. **Raw `assetId.slice(0, 20)…` displayed to users** in `DistributionHistoryScreen.tsx` line 200 — users see truncated UUIDs
3. **`asset: any` type** in `BuyoutScreen.tsx` line 42 — `React.useState<any>(null)` bypasses type safety

**P1 defects (73 total across 25 files):**
- **Dual token system** — 12 of 13 screens and all 12 components use legacy `Type`/`Typography` tokens. Only `PortfolioScreen` partially uses `TypographyV2`.
- **`CoOwnReconciliationBanner isActive={false}`** — hardcoded in 2 screens (dead control)
- **Hardcoded pixel values** — pervasive: `gap: 2/3/4/5/6`, `size: 5/6/7`, `lineHeight: 20`, `letterSpacing: -0.2/-0.3`, `borderWidth: 1`, `maxHeight: 300`, `fontSize: 10`
- **Generic dashboard silhouette** — 3-4 stat horizontal bar in 4 screens
- **Inconsistent toggle implementations** — `Switch` vs custom toggle
- **Developer-facing text in production** — 3 instances
- **`AssetDueDiligenceScreen` doesn't use `FlagshipScreen`/`FlagshipHeader`**
- **Unicode `▲`/`▼` glyphs** in `CoOwnPortfolioStorytelling` — breaks one-icon-family rule
- **`adjustsFontSizeToFit`** in `AssetLeaderboardScreen` — prototype-level pattern
- **`navigation: any`** in `VerificationResponseScreen` — bypasses type safety
- **Hardcoded `1200ms` delay** before `navigation.goBack()` in `VerificationResponseScreen`
- **Error fallback navigates away** in `CoOwnIssueScreen` — form data lost on submission failure

**Top fixes:**
1. Remove `← information` annotation from `CoOwnPositionCard` (P0)
2. Replace raw `assetId` display with asset titles in `DistributionHistoryScreen` (P0)
3. Type `asset` state in `BuyoutScreen` — replace `any` with `MarketCoOwnAsset | null` (P0)
4. Migrate all 25 files from legacy `Type`/`Typography` to `TypographyV2`/`FontFamily` (P1, systemic)
5. Replace all hardcoded pixel values with design tokens (P1, systemic)

### 3.5 Orders, Fulfilment & Post-Purchase Surface

**Files audited:** 38 files (8 screens + 30 components)

**P0 defects (15+):**
1. **`BundleBagScreen` fabricated shipping cost** — `combinedShipping = 3.99` hardcoded
2. **`BundleBagScreen` broken bundle checkout** — navigates to single-item checkout for first item only
3. **`BundleBagScreen` hardcoded `BUNDLE_TIERS`** — discount tiers fabricated client-side
4. **`MakeOfferScreen` fabricated "3x more likely" statistic** — unevidenced claim
5. **`MakeOfferScreen` dead ternary branch** — both paths produce identical output
6. **`CheckoutPaymentSelector` fabricated brand marks** — `'Pay'`/`'G'` for Apple Pay/Google Pay
7. **`OrderReceiptScreen` `t` variable shadows i18n import** — will break localization
8. **`OrderDetailScreen` hardcoded English in `Alert.alert`** — bypasses i18n
9. **`OrderDetailScreen` `hasReview: false` hardcoded** — review state never wired
10. **`OrderDetailScreen` `(backendOrder as any)?.inspectionDeadlineAt`** — fabricated data path
11. **`OrderSupportScreen` 5 `ElevatedSurface` panels** — card-on-card, violates surface budget
12. **`OrdersEmptyGraphic` legacy `Colors` import** — won't respond to theme changes
13. **`WriteReviewScreen` hardcoded `'en-GB'` locale** — not locale-aware
14. **`BuyerProtectionScreen` `Alert.alert` with hardcoded English** — no i18n
15. **`PostageScreen` hardcoded English "from"/"tracking"** — bypasses i18n

**P1 defects (20+):**
- Icon-in-circle in 8+ components (`EtaBanner`, `InspectionBanner`, `OrderStatusStepper`, `ReviewPromptSheet`, `AddCardSheet`, `CheckoutPaymentSelector`, `OrdersEmptyGraphic`, `BuyerProtectionScreen`)
- Card-on-card in 5+ screens
- Hex-alpha concatenation in 10+ files
- ~400 lines of dead duplicated styles in `OrderDetailScreen.tsx`
- `Alert.alert` used for dispatch confirmation (SellerFulfilmentScreen)
- Missing pressed states on `InspectionBanner` buttons
- `DispatchCountdown` ticks every second (should be 60s when > 1 hour)
- `OrderDetailSkeleton` doesn't match final layout (stepper vs timeline)
- `AddAddressSheet` saves locally fabricated address on backend failure
- `CheckoutPaymentSelector` `fontSize: 10` — below 12px minimum

**Top fixes:**
1. Remove fabricated `combinedShipping`, `BUNDLE_TIERS`, and fix bundle checkout (P0)
2. Remove fabricated "3x more likely" statistic (P0)
3. Replace fabricated wallet brand marks with official assets or text labels (P0)
4. Rename `t` to `themed` in `OrderReceiptScreen` (P0)
5. Wire `hasReview` to actual review state (P0)
6. Remove ~400 lines of dead styles in `OrderDetailScreen` (P1)
7. Remove icon-in-circle from all 8+ order components (P1)

### 3.6 Poster System Surface

**Files audited:** 20 files (5 screens + 15 components)

**P0 defects (7):**
1. **`MultiPhotoCollage` dead code in `handleCellAction`** — double `onPhotosChange` call causes race condition
2. **`MultiPhotoCollage` drag-to-reorder never fires** — `handleDragTo` defined but `CollageCell` never calls it
3. **`PosterProgressSegments` step pulse animation broken** — `withSpring` overwrites cancel the pulse; should use `withSequence`
4. **`PosterProgressSegments` `handleTrackLayout` on every segment** — works by accident, not design
5. **`PosterViewerScreen` static `StyleSheet.create`** — doesn't respond to theme changes
6. **`PosterViewerScreen` sticker vote closure bug** — `activeInteractionSticker.id` captured at render time may be stale
7. **`PosterStickerLayer` `listing` sticker rendering bug** — `snapshotImageUrl` never actually rendered

**P1 defects (15+):**
- Hardcoded `#3B82F6` selection blue in `PosterStickerLayer` (4 instances)
- Hardcoded `#4CD964`/`#FF3B30` iOS system colors in `StickerInteractionPanel`
- `TemplatePicker` dark-only drawer — ignores light mode
- `DraggableText` `setInterval` typewriter — causes per-character re-renders
- `FontColorPicker` dead Skia code path — `skiaAvailable` computed but never used
- `createStyles(colors: any)` in 4 files — loses theme type safety
- `PosterHighlightsRail` `ACTIVE_GRADIENT` identical to `INSTAGRAM_GRADIENT` — duplicate constant
- Hit target violations: `colorOrb` 32pt, `toggleBtn`/`alignBtn`/`sizeBtn` 36pt, `deleteLayerBtn` 22pt
- `PosterStoryActivityScreen` fragile duck-typing in `renderActivityItem`
- `PosterStoryActivityScreen` summary card — 5 equal-weight columns (dashboard silhouette)

**Top fixes:**
1. Fix `MultiPhotoCollage` dead code and implement drag-to-reorder (P0)
2. Fix `PosterProgressSegments` pulse animation with `withSequence` (P0)
3. Convert `PosterViewerScreen` to `useMemo(() => createStyles(colors), [colors])` (P0)
4. Fix sticker vote closure bug with ref (P0)
5. Replace all hardcoded `#3B82F6`, `#4CD964`, `#FF3B30` with theme tokens (P1)
6. Replace `setInterval` typewriter with Reanimated shared value (P1)
7. Replace `CellActionSheet` with shared `ContextMenu` (P1)

### 3.7 Platform, Hooks, Services & Navigation

**Files audited:** 60+ files across platform, hooks, services, store, context, lib, navigation

**Critical (1):**
- **God Store anti-pattern** — `useStore.ts` (2,492 lines) holds auth, wishlist, collections, auctions, co-own trading, chat, bots, support tickets, preferences, quick replies, profile media, outfits, and UI state. No slice boundaries. Full conversation history persisted to MMKV on every message append.

**High (5):**
1. **Realtime topic unsubscribe leak** — no reference counting; first component to unmount kills subscription for all listeners
2. **RealtimeProvider polls auth state every 5 seconds** — SecureStore read every 5s for entire app lifecycle
3. **`checkCoOwnEligibility` is a stub** — always returns `{ ok: true }`; compliance never enforced
4. **Duplicate Sentry entry points** — `lib/sentry.ts` vs `platform/monitoring/sentry.ts`
5. **`useInboxMessageEvent` subscribes to all conversation topics** — 100+ topic subscriptions for active sellers

**Medium (10):**
- RUM dashboard stub implementations (3 of 5 metrics are no-ops)
- `frameTracker` uses O(n) `Array.shift()` in 60fps hot loop
- `useHaptic` reduced-motion gate has startup race
- `AppErrorBoundary` uses `captureMessage` for user feedback (pollutes Sentry issue stream)
- `offlineQueue` dead-letter queue invisible and unpersisted
- Telemetry PII scrubbing overly broad (scrubs `'name'` key) and shallow (no nested check)
- `TabScrollContext` calls `useReducedMotion` but doesn't use it
- Store persist migration `delete` leaves object hole
- Stripe return URL may not match linking configuration
- `usePerformanceMonitor` evaluates sampling at module load

**Top fixes:**
1. Split God Store into domain slices (`authStore`, `chatStore`, `commerceStore`, `preferencesStore`, `uiStore`)
2. Add reference counting to `RealtimeClient` topic management
3. Replace 5-second auth polling with subscription/event emitter
4. Enforce `checkCoOwnEligibility` compliance checks
5. Consolidate Sentry entry points
6. Use circular buffer for `frameTracker` window trimming

### 3.8 Messaging Extended Surface

**Files audited:** 39 files (11 screens + 28 components)

**P0 defects (7):**
1. **`ChatCard.tsx` variant switch is a no-op** — all three variants (`surface`, `elevated`, `tint`) return identical styles. The `variant` prop is fabricated API.
2. **Dead `VoiceMessagePlayer.tsx` (root)** — legacy JS-thread `Animated` duplicate of `chat/VoiceMessageBubble.tsx` (Reanimated UI-thread). Uses `useNativeDriver: false`, requires `waveform: number[]` with no fallback, `borderRadius: Radius.xl + 4` magic offset.
3. **Duplicate `TypingIndicator` components** — `components/TypingIndicator.tsx` (translateY bounce, 8px dots) vs `components/chat/TypingIndicator.tsx` (opacity+scale, 7px dots). Two animation languages for the same concept.
4. **~270 lines of dead styles in `InboxScreen.tsx`** (lines 1004–1177) — orphaned from pre-`InboxConversationRow` era.
5. **Stroke grammar violations** — `borderWidth: 0.5` in `EmojiReactionsBar`, `LinkPreviewCard`, `ScrollToBottomFAB`. Design.md mandates hairline/1pt/2pt only.
6. **`SharedConversationMediaScreen` video tiles never show real thumbnails** — always render a `videocam` icon placeholder. Placeholder-grade media treatment.
7. **No virtualization in Archived/Muted conversation screens** — `.map()` inside plain `View` renders all rows at once.

**P1 defects (16+):**
- `MessageBubble.tsx` `createStyles = (colors: any)` — loses theme type safety
- `MessageBubble.tsx` `aspectRatio: 1.1` — not in design spec (should be 4:5 or native)
- `MessageBubble.tsx` `borderStyle: 'dashed'` on draft bubbles — decorative chrome
- `NewMessageScreen.tsx` `handleStartAgentChat` fabricates demo conversation with `as any` — verbose LLM-explanatory copy
- `NewMessageScreen.tsx` legacy `Colors` import mixed with `useAppTheme`
- `ConnectionListScreen.tsx` raw `Pressable` instead of `AnimatedPressable` — inconsistent press feedback
- `ChatInfoSection.tsx` `.toUpperCase()` on all section titles — bureaucratic uppercase
- `AttachmentReviewSheet.tsx` `Dimensions.get('window')` at module scope — stale on rotation
- `MessageStatusIndicator.tsx` duplicates inline status rendering in `MessageBubble` — different icon names
- `InboxScreen.tsx` `AnimatedFlashList` created inside render — should be module-level
- `InboxScreen.tsx` `listRef` typed as `any`
- `GroupAvatarMosaic.tsx` magic `2` corner radius, `emptyCell` uses `colors.border`
- `ChatMessageRow.tsx` `linkPreviewWrap` maxWidth `'78%'` vs `MessageBubble` `'75%'` — inconsistent
- `VoiceTranscriptionPanel.tsx` polling interval `3000` magic number
- `SwipeableMessage.tsx` `actionIcon` is icon-in-circle — decorative chrome for gesture
- `PulseDot.tsx` dead component — named "Pulse" but doesn't animate, not imported anywhere

**Top fixes:**
1. Delete dead `VoiceMessagePlayer.tsx` (root) — `chat/VoiceMessageBubble.tsx` is canonical (P0)
2. Fix `ChatCard.tsx` variant switch or remove the `variant` prop (P0)
3. Consolidate duplicate `TypingIndicator` into one canonical component (P0)
4. Delete ~270 lines of dead styles in `InboxScreen.tsx` (P0)
5. Fix all `borderWidth: 0.5` → `StyleSheet.hairlineWidth` (P0)
6. Load real video thumbnails in `SharedConversationMediaScreen` (P0)
7. Add `FlashList` virtualization to Archived/Muted screens (P0)

### 3.9 Commerce Detail, Look & Profile Components

**Files audited:** 44 files (14 commerce detail + 9 look + 21 profile)

**P0 defects (5):**
1. **`CommerceRelatedRail.tsx` `izeText`/`sizeText` typo** — `izeText` (line 16) is consumed at line 91 but `sizeText` (line 27) is the correct field. Size metadata silently dropped.
2. **`ProfileVisualHeader.tsx` uses legacy `Colors`/`ActiveTheme`** — component is theme-blind, won't respond to theme changes.
3. **`LookMediaCarousel.tsx` `handleSingleTap` is a no-op** — fullscreen viewer not wired, tapping a look image does nothing.
4. **`LookMediaComposer.tsx` misleading "Tap the dot to set label" hint** — no input field in the tag editor; tapping the dot just toggles active state.
5. **`MyProfileIdentityHero.tsx` `onPressListings`/`onPressLooks` dead props** — declared in interface but never destructured or used.

**P1 defects (40+):**
- **Arithmetic on design tokens** — `Space.xs / 2`, `Space.sm + 2`, `Type.meta.size - 1`, `Type.display.size + 2` found in 28 of 44 files
- **Hex alpha appending** — `${colors.brand}10` in `SellerStandardsBadges`, `VerificationBadge`, `ProfileReviews`
- **Hardcoded RGBA/hex colors** — `CommerceDetailMediaRail` (`#fff`), `LookMasonryTile` (rgba), `LookMediaCarousel` (rgba), `ProfileVisualHeader` (`#fff`), `BoardEmptyGraphic` (rgba), `LookPreviewCard` (`#fff`, rgba)
- **`borderWidth: 1` instead of `StyleSheet.hairlineWidth`** — `LookCommentsSheet`, `ProfileVisualHeader`, `LookPreviewCard`, `ProfileLooksGrid`
- **Icon-in-circle** — `ProfileStates` (back button in overlay square), `BoardEmptyGraphic` (icon ring), `PublicProfileActionRow` (bordered icon buttons), `EditTab` (quiz icon wrap), `EditorialSection` (search button)
- **Card-on-card** — `LookPreviewCard` (card → action bar), `OutfitPieceEditor` (pieceCard → linkedListing), `ProfileVisualHeader` (root card → all contents)
- **Inconsistent cover height** — 160 (ProfileHero), 168 (ProfileStates), 180 (ProfileVisualHeader) — three different values
- **Inconsistent avatar border width** — 3 (ProfileHero, PublicProfileIdentityHero, MyProfileIdentityHero), 4 (ProfileVisualHeader)
- **Inconsistent sold treatment** — quiet bottom fade (ProfileShopTile) vs full overlay (ShopRail)
- **Inconsistent back button** — transparent 44pt (CommerceDetailHeader) vs 36pt overlay square (ProfileStates) vs 44pt overlay circle (ProfileVisualHeader)
- **`LookMasonryGrid.tsx` no-op ternary** — `numColumns === 3 ? 2 : 2` always produces 2
- **`ProfileSkeleton.tsx` skeleton doesn't match final layout** — 3 columns vs 2 columns in `ProfileLooksGrid`

**Top fixes:**
1. Fix `izeText`/`sizeText` typo in `CommerceRelatedRail` (P0 — data loss)
2. Migrate `ProfileVisualHeader` to `useAppTheme()` (P0 — theme-blind)
3. Wire `LookMediaCarousel` single-tap to fullscreen viewer (P0)
4. Fix misleading "Tap the dot to set label" hint in `LookMediaComposer` (P0)
5. Remove or wire `onPressListings`/`onPressLooks` dead props in `MyProfileIdentityHero` (P0)
6. Standardize cover height, avatar border, sold treatment, and back button across all profile components (P1)
7. Replace all hardcoded colors with theme tokens (P1)

### 3.10 Search, Browse & Filter Surface

**Files audited:** 24 files (7 screens + 17 components)

**P0 defects (10):**
1. **`CategoryTreeScreen.tsx` hardcoded 'Women' fallback** (line 42) — unknown prefixes silently show Women's categories
2. **`CategoryTreeScreen.tsx` empty `subs` array** (line 37) — "0 subcategories" always displayed, subcategory pills never render
3. **`GlobalSearchScreen.tsx` fabricated `+ 40` magic number** in masonry column balancing (line 641)
4. **`GlobalSearchScreen.tsx` third masonry implementation** — manual two-column alongside `PinterestMasonryGrid` and FlashList masonry
5. **`FilterScreen.tsx` accessibility label "Rate" on size filter chip** (line 722) — copy-paste error
6. **`SearchScreen.tsx` autocomplete overlay covers the search bar** (lines 159-164) — broken interaction
7. **`CategoryDetailScreen.tsx` "Recommended" sort is just "most liked"** (line 137) — untruthful labeling
8. **`SearchEmptyGraphic.tsx` legacy `Colors`/`ActiveTheme`** — theme-blind component
9. **`PulseTab.tsx` vs `EditTab.tsx` inconsistent price-drop sorting** — EditTab sorts by percentage, PulseTab doesn't
10. **`VisualSearchScreen.tsx` "coming soon" in save toast** (line 386) — violates AGENTS.md §11

**P1 defects (20+):**
- Module-load `Dimensions.get('window')` in 6 files — stale on rotation
- Hardcoded font sizes in 8+ files — not from `Type` tokens
- Icon-in-circle in 5+ components — `SearchEmptyGraphic`, `VisualSearchScreen`, `EditorialSection`, `EditTab`, `PeopleResultRow`
- `SearchAutocomplete.tsx` trending-up icon uses `colors.danger` (red) — semantically wrong for positive momentum
- `SearchAutocomplete.tsx` no `.catch()` on autocomplete fetch — loading state stays true on rejection
- `GlobalSearchScreen.tsx` `inputRef = useRef<any>(null)` — type safety
- `GlobalSearchScreen.tsx` `trendingSearches` are category names mislabeled as trending
- `FilterScreen.tsx` `Dimensions.get('window')` at module load — sheet geometry stale on rotation
- `EditTab.tsx` hardcoded style quiz pills — fabricated data
- `PulseTab.tsx` ~60 lines of dead styles (lines 407-465)
- `LooksTab.tsx` and `PulseTab.tsx` `fontSize: 10` countdown text — below 11px minimum
- `DiscoverySectionHeader.tsx` `Type.priceList.size` (20px) for section title — too loud, should be quieter than content
- `EditorialSection.tsx` `searchBtn` icon-in-circle with `surfaceAlt` background

**Top fixes:**
1. Fix `CategoryTreeScreen` hardcoded 'Women' fallback → show empty/error state (P0)
2. Fix `CategoryTreeScreen` empty `subs` array → populate or remove UI (P0)
3. Consolidate three masonry implementations → one `PinterestMasonryGrid` (P0)
4. Fix `FilterScreen` accessibility label "Rate" → proper size filter label (P0)
5. Fix `SearchScreen` autocomplete overlay positioning (P0)
6. Fix `CategoryDetailScreen` "Recommended" sort labeling (P0)
7. Migrate `SearchEmptyGraphic` to `useAppTheme()` (P0)
8. Fix inconsistent price-drop sorting between tabs (P0)
9. Remove "coming soon" from `VisualSearchScreen` save toast (P0)
10. Replace all `Dimensions.get('window')` with `useWindowDimensions()` (P1)

### 3.11 Theme System & Shared Primitives

**Files audited:** 20 files (theme system + shared UI primitives + flagship components)

**P0/P1 defects (12):**
1. **`constants/colors.ts` mutable `ActiveTheme`/`Colors` exports** — any module can mutate them; `refreshThemeFromRuntime` doesn't trigger React re-renders. Components using `Colors` directly are stale.
2. **`theme/designTokens.ts` `CommonStyles.card` bundles `Elevation.card` shadow** — encourages "shadow on every card," directly contradicting the file's own anti-AI header.
3. **`theme/designTokens.ts` `Type` and `Elevation` typed as `Record<string, TypeStyle>`** — loses specific key typing; `Type.nonexistent` compiles.
4. **`theme/designTokens.ts` deprecated `TypeStyles` has divergent values from `Type`** — two competing type scales.
5. **`theme/gradients.ts` static exports stale after theme switch** — `Gradients`, `Glass`, `Glow` computed at module load from `Colors`.
6. **`theme/gradients.ts` hardcoded gradient colors** — `#E06666`, `#3A7D4E`, `rgba(255,77,77,0.20)` not derived from theme.
7. **`theme/ThemeContext.tsx` `as ThemeColors` casts without runtime validation** — missing color keys won't be caught.
8. **`theme/ThemeContext.tsx` initial theme flash** — initializes to `'dark'`, then changes after async preference load.
9. **`FlagshipDangerZone.tsx` hex alpha concatenation** — `${colors.danger}30` when `colors.dangerBorder` token exists.
10. **`FlagshipProfileMedia.tsx` reads mutable `ActiveTheme` global** — won't re-render on theme change.
11. **`FlagshipProductCard.tsx` hardcoded `lineHeight` + raw `Pressable`** — diverges from type system, no canonical press feedback.
12. **`BottomSheet.tsx` module-level `Dimensions.get('window')`** — stale on rotation.

**Top fixes:**
1. Freeze `Colors`/`ActiveTheme` or wrap in reactive store (P1)
2. Remove/rename `CommonStyles.card` → `CommonStyles.elevatedCard` (P1)
3. Delete `TypeStyles` or make strict mirror of `Type` (P1)
4. Derive `Gradients.danger`/`success` from theme colors (P1)
5. Replace `as ThemeColors` casts with proper type checking (P1)
6. Replace `FlagshipDangerZone` hex alpha with `colors.dangerBorder` token (P1)
7. Replace `FlagshipProfileMedia` `ActiveTheme` with `useAppTheme()` (P1)
8. Replace `FlagshipProductCard` hardcoded `lineHeight` with `Type.*.lineHeight` tokens (P1)
9. Replace `BottomSheet` module-level `Dimensions.get` with `useWindowDimensions()` (P1)

### 3.12 Notifications, Support & Miscellaneous

**Files audited:** 30 files (12 notifications + 8 support + 10 misc)

**P0 defects (6):**
1. **`InAppNotificationCenter` dead action handler** — `handleAction` is a no-op; action button does nothing
2. **`NotificationPreferencesScreen` fabricated `liveShopping` toggle** — never persisted, does nothing
3. **`SupportTicketDetailScreen` "Closed" status uses error tone** — red tone for normal terminal state
4. **`OutfitBuilderScreen` hardcoded background color palette** — 8 raw hex colors, dark mode parity broken
5. **`OnezeCoinIcon` hardcoded gradient colors** — `['#f4d27b', '#c68a2d']` bypass theme
6. **`HelpSupportScreen` search results start conversations** — tapping article starts chat instead of showing article

**P1 defects (16):**
- `SocialNotificationRow` `onActorPress` never wired — avatar not tappable
- `PushNotificationsScreen` stale `enabledCount` in toggle
- `EmailNotificationsScreen` race condition in optimistic toggle
- `SupportConversationScreen` timing hack for auto-scroll (setTimeout)
- `SupportConversationScreen` FlashList recycling hazard with pending message status
- `SupportCaseDetailScreen` incorrect type cast for listing context links
- `SupportTicketDetailScreen` card-on-card (4+ ElevatedSurface panels)
- `OrderSupportScreen` form fields not disabled after submission
- `FeedExplanationSheet` fabricated topic ID for removal
- `AudiencePreferenceGrid` percentage width + gap may overflow
- `HelpSupportScreen` all 5 category shortcuts identical (`{ kind: 'general' }`)
- `NotificationsScreen` silent pagination failure
- `NotificationsScreen` duplicated refresh logic
- `LookDetailScreen` division by zero risk for hero height
- `OutfitBuilderScreen` `Alert.alert` for success feedback
- `InAppNotificationBanner` hardcoded opacity values

**Top fixes:**
1. Implement action routing in `InAppNotificationCenter` or remove action buttons (P0)
2. Remove or persist `liveShopping` toggle (P0)
3. Change `closed` status tone from `'error'` to `'neutral'` (P0)
4. Move `BG_COLORS` and `OnezeCoinIcon` gradient to `ThemeColors` (P0)
5. Fix `HelpSupportScreen` search to show articles, not start chats (P1)
6. Wire `onActorPress` in `SocialNotificationRow` (P1)
7. Flatten `SupportTicketDetailScreen` composition (P1)

---

## Part 4 — Design System Recommendations

Based on the `ui-ux-pro-max` skill output and web research synthesis:

### 4.1 Color Palette

**Current state:** The app has a `ThemeColors` system with light/dark variants, but many surfaces bypass it with hardcoded values.

**Recommendations:**
- Add `successSubtle`, `brandSubtle`, `warningSubtle`, `dangerSubtle` tokens to replace hex-alpha concatenation
- Add `coinGradientStart`, `coinGradientEnd` for `OnezeCoinIcon`
- Add `pastelOptions` array for `TextEditSheet`
- Add warm-paper surface tones (Pinterest-inspired) — `surfaceWarm`, `surfacePaper`
- Ensure all proposed-semantic keys (`social`, `discovery`, `antiqueGold`) exist on `ThemeColors` or add fallback handling

### 4.2 Typography

**Current state:** Dual system — legacy `Type`/`Typography` vs `TypographyV2`/`FontFamily`. 12 of 13 Co-Own screens use legacy.

**Recommendations:**
- Complete the `TypographyV2` migration across all surfaces
- Remove `Type.meta.size - 1`, `Type.meta.size - 2`, `Type.body.size + 2` arithmetic — add proper tokens
- Add `Type.aggregated` token for notification aggregated text
- Add `Type.amount` token for financial amount display
- Use humanist typefaces (Pinterest-inspired) — consider Rubik/Nunito Sans as the `FontFamily`

### 4.3 Spacing

**Current state:** `Space` token system exists but is frequently bypassed with magic numbers and fractional arithmetic (`Space.xs / 2`, `Space.sm + 2`).

**Recommendations:**
- Add `Space.xxs` (2pt) if needed, or eliminate all `Space.xs / 2` usage
- Eliminate all `Space.token + N` arithmetic — create named tokens for needed values
- Adopt Pinterest's 4px base spacing grid

### 4.4 Radius

**Current state:** `Radius` token system exists but is violated by `RadiusRoleValue` misuse and inconsistent application.

**Recommendations:**
- Enforce two-radius shape vocabulary per viewport (Pinterest-inspired)
- Fix `AuctionFieldsSection` `togglePill` using `RadiusRoleValue.mediaThumbnail` for a control
- Fix `PaymentStateBanner` using `RadiusRoleValue.mediaThumbnail` for a banner
- Fix `PackageContents` thumbnail using `Radius.sm` instead of `Radius.md`
- Fix `ListingPreviewCard` avatar using `Radius.md` instead of `Radius.full`
- Fix `MyBidsScreen` `bidAgainBtn` using `colors.danger` for a positive action

### 4.5 Stroke

**Current state:** `Stroke` token system exists but `borderWidth: 1` is used instead of `Stroke.standard` in 10+ files.

**Recommendations:**
- Replace all `borderWidth: 1` with `Stroke.standard`
- Replace all `borderWidth: 1.5` with `Stroke.emphasis` (2pt)
- Enforce stroke grammar: hairline separators, 1pt fields, 2pt focus/selection only

### 4.6 Motion

**Current state:** Reanimated 3/4 with `Motion` config tokens. Some surfaces use `FadeInUp.springify().duration()` anti-pattern.

**Recommendations:**
- Fix `FadeInUp.springify().duration()` — spring + duration don't compose
- Fix `PosterProgressSegments` pulse — use `withSequence`, not sequential `withSpring` assignments
- Replace `DraggableText` `setInterval` typewriter with Reanimated shared value
- Adopt spring physics everywhere (Snapchat-inspired) — remove timing-based animations where springs are more appropriate
- Ensure reduced-motion support on all animated surfaces

---

## Part 5 — Priority Action Plan

### Phase 1: Critical Fixes (P0 — do immediately)

| # | Fix | Surface | Impact |
|---|-----|---------|--------|
| 1 | Fix `formatMoney` typo (`izeFractionDigits` → `minimumFractionDigits`) | Seller Hub | Breaks price formatting |
| 2 | Replace `ScrollView` + `.map()` with `FlashList` for 200 listings | Inventory | Severe performance |
| 3 | Remove fabricated `combinedShipping`, `BUNDLE_TIERS`, fix bundle checkout | Bundle Bag | Broken functionality |
| 4 | Remove fabricated "3x more likely" statistic | Make Offer | Truthful UI violation |
| 5 | Replace fabricated Apple Pay/Google Pay brand marks | Checkout | Misrepresents brands |
| 6 | Rename `t` to `themed` in `OrderReceiptScreen` | Orders | Will break i18n |
| 7 | Wire `hasReview` to actual review state | Order Detail | Review never shows |
| 8 | Implement `InAppNotificationCenter` action routing | Notifications | Dead control |
| 9 | Remove or persist `liveShopping` toggle | Notifications | Fabricated control |
| 10 | Change `closed` status tone from error to neutral | Support | Misleading alarm |
| 11 | Remove `← information` leaked annotation | Co-Own | Developer text in UI |
| 12 | Replace raw `assetId` display with asset titles | Co-Own | Users see UUIDs |
| 13 | Type `asset` state in `BuyoutScreen` (remove `any`) | Co-Own | Type safety |
| 14 | Fix `MultiPhotoCollage` dead code and drag-to-reorder | Poster | Race condition + dead gesture |
| 15 | Fix `PosterProgressSegments` pulse animation | Poster | Animation never fires |
| 16 | Convert `PosterViewerScreen` to theme-responsive styles | Poster | No theme switching |
| 17 | Fix sticker vote closure bug | Poster | Vote goes to wrong sticker |
| 18 | Move `BG_COLORS` and `OnezeCoinIcon` gradient to theme | Misc | Dark mode parity |
| 19 | Fix `HelpSupportScreen` search to show articles | Support | Broken interaction |
| 20 | Enforce `checkCoOwnEligibility` compliance | Platform | Regulatory defect |

### Phase 2: Systemic Fixes (P1 — do next sprint)

| # | Fix | Scope | Impact |
|---|-----|-------|--------|
| 1 | Kill icon-in-circle disease — adopt transparent 44pt `iconTarget` | 30+ surfaces | Largest anti-AI tell |
| 2 | Eliminate legacy CreatorToolDock system | Creator | 3 anti-AI tells |
| 3 | Complete `TypographyV2` migration | Co-Own (25 files) | Dual token system |
| 4 | Replace all hardcoded colors with theme tokens | 60+ instances | Light/dark parity |
| 5 | Replace all `Alert.alert` with `ConfirmationSheet` | 6+ surfaces | Native flow breaks |
| 6 | Replace all hardcoded English with `t()` i18n | 30+ files | Localization |
| 7 | Replace hex-alpha concatenation with `*Subtle` tokens | 15+ files | Invalid colors |
| 8 | Consolidate duplicate primitives | 12+ instances | Inconsistent system |
| 9 | Flatten card-on-card composition | 15+ surfaces | Surface budget |
| 10 | Remove label-everything eyebrows | 20+ surfaces | Anti-AI tell |
| 11 | Split God Store into domain slices | Platform | Architecture |
| 12 | Add reference counting to realtime topics | Platform | Silent data loss |
| 13 | Replace 5-second auth polling with subscription | Platform | Wasteful polling |
| 14 | Remove ~400 lines dead styles in `OrderDetailScreen` | Orders | Code health |
| 15 | Fix `StatCard` 2×2 grid → `FlagshipMetricLine` rows | Seller Hub | Dashboard silhouette |

### Phase 3: Polish (P2 — ongoing)

- Replace all magic numbers with design tokens
- Fix stroke grammar violations (`borderWidth: 1` → `Stroke.standard`)
- Fix radius role misuse
- Add missing `accessibilityHint` props
- Fix skeleton/final layout mismatches
- Remove dead code and unused imports
- Consolidate DRY violations
- Fix hit target violations (increase `hitSlop` or visible size)
- Add reduced-motion support to all animated surfaces
- Fix `frameTracker` O(n) `Array.shift()` with circular buffer
- Fix telemetry PII scrubbing (nested check, narrower key matching)
- Persist `offlineQueue` dead-letter queue

---

## Part 6 — Reference Benchmark Summary

### Pinterest 2026 (Gestalt)
- **Tokenization:** Style Dictionary, 4px base, two-radius vocabulary
- **Masonry:** True aspect ratios, shortest-column-first, blur-up loading
- **Surfaces:** Warm-paper, humanist typefaces, no drop shadows on content
- **AI:** User-controlled transparency, curated boards over feeds

### Instagram Aug-2026 (Sketchbook)
- **Metaphor:** Tactile, analog, photographic — anti-AI positioning
- **Authorship:** Human hand visible, imperfection as authenticity
- **Chrome:** Brand retreats for content, conversational surfaces
- **Curation:** Boards over chronology

### Snapchat 2026 (Camera-First)
- **Discipline:** One color, one geometry, one canvas
- **Motion:** Spring physics, haptic confirmation, sub-300ms latency
- **Navigation:** Gesture-native, hub-and-spoke swipe
- **Chrome:** Floating transparent tool rails, not docked

### React Native Flagship 2026
- **Architecture:** RN 0.84+, Hermes V1, Fabric, TurboModules
- **Animation:** Reanimated 4 declarative CSS animations
- **Lists:** FlashList v2 with recycling and masonry
- **Images:** `expo-image` with `ThumbHash` blur-up loading
- **Accessibility:** WCAG 2.2 AA, 44pt hit targets, reduced motion
- **State:** Offline-first, React Query for server state, Zustand slices for UI state

---

## Appendix A — Complete Defect Inventory by Surface

| Surface | P0 | P1 | P2 | Total |
|---------|----|----|-----|-------|
| Catalog Import | 4 | 6 | 5+ | 15+ |
| Creator Frontend | 5 | 10 | 8 | 23 |
| Seller Hub & Listings | 3 | 11 | 30+ | 44+ |
| Co-Own Extended | 3 | 73 | 48 | 124 |
| Orders, Fulfilment & Post-Purchase | 15+ | 20+ | 30+ | 65+ |
| Poster System | 7 | 15+ | 20+ | 42+ |
| Platform, Hooks, Services & Nav | 1 (C) + 5 (H) | 10 (M) | 8 (L) | 24 |
| Messaging Extended | 7 | 16+ | 25+ | 48+ |
| Commerce Detail, Look & Profile | 5 | 40+ | 30+ | 75+ |
| Search, Browse & Filter | 10 | 20+ | 30+ | 60+ |
| Theme System & Shared Primitives | 0 | 12 | 55+ | 67+ |
| Notifications, Support & Misc | 6 | 16 | 38 | 60 |
| **Total** | **66+** | **254+** | **327+** | **647+** |

*All 11 surface audits complete. 4 web research subagents complete. Static code analysis complete.*

---

## Appendix B — Files Requiring Immediate Attention

### P0 — Broken Functionality
- `src/screens/seller/SellerHubScreen.tsx` — `formatMoney` typo
- `src/screens/seller/InventoryManagementScreen.tsx` — ScrollView for 200 items
- `src/screens/BundleBagScreen.tsx` — fabricated data + broken checkout
- `src/screens/MakeOfferScreen.tsx` — fabricated statistic
- `src/components/checkout/CheckoutPaymentSelector.tsx` — fabricated brand marks
- `src/screens/OrderReceiptScreen.tsx` — `t` shadows i18n
- `src/screens/OrderDetailScreen.tsx` — `hasReview: false` hardcoded
- `src/platform/realtime/useRealtimeEvent.ts` — topic unsubscribe leak
- `src/store/useStore.ts` — `checkCoOwnEligibility` stub + God Store
- `src/screens/creator/poster/MultiPhotoCollage.tsx` — dead code + race condition

### P0 — Anti-AI / Truthful UI
- `src/components/creator/CreatorToolDock.tsx` — legacy system to delete
- `src/components/creator/dock/ToolButton.tsx` — GradientRing + icon-in-circle
- `src/screens/OrderSupportScreen.tsx` — 5 ElevatedSurface panels
- `src/components/seller/MyListingsScreen.tsx` — StatCard 2×2 grid
- `src/screens/OutfitBuilderScreen.tsx` — hardcoded BG_COLORS
- `src/components/OnezeCoinIcon.tsx` — hardcoded gradient
- `src/screens/SupportTicketDetailScreen.tsx` — error tone for closed status
- `src/platform/notifications/InAppNotificationCenter.tsx` — dead action handler

### P0 — Leaked Developer Text
- `src/components/co-own/CoOwnPositionCard.tsx` — `← information`
- `src/screens/co-own/DistributionHistoryScreen.tsx` — raw `assetId.slice(0,20)…`
- `src/components/co-own/CoOwnSupplySheet.tsx` — "Sponsor locked is not exposed by the backend"

---

*Report generated by 15 parallel audit subagents + 4 web research subagents + static code analysis. Design contract: `Design.md` v1.5, `AGENTS.md` §4. Reference benchmarks: Pinterest 2026, Instagram Aug-2026, Snapchat 2026, React Native flagship 2026.*
