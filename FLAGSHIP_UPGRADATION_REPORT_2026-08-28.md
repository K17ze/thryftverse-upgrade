# ThryftVerse Frontend — Flagship Upgradation Report

**Date:** 2026-08-28
**Auditors:** 16 parallel subagents (12 surface audits + 4 web research) + static code analysis
**Scope:** Full `frontend/src` — 171 screens, 608 components, theme system, shared primitives
**Reference benchmarks:** Pinterest 2026, Instagram Aug-2026 refresh, Snapchat 2026, React Native flagship best practices 2026
**Design contract:** `Design.md` v1.5, `AGENTS.md` §4 anti-AI charter

---

## Executive Summary

ThryftVerse's frontend is **structurally mature** — it has a real design-token system, FlashList v2 masonry, Reanimated-driven motion, full state machines on most surfaces, and honest AI-trust signals. The architecture is closer to flagship than prototype.

However, the audit identified **systemic anti-AI-design tells** that prevent the app from reading as authored/crafted. These are not bugs — they are the "statistical mean" aesthetic that LLM-generated UI converges on. The fixes are mostly **compositional and token-discipline work**, not rewrites.

**Defect totals across 12 surface areas:**

| Severity | Count | Theme |
|----------|-------|-------|
| **P0** | 28 | Icon-as-illustration, card-on-card stacks, dead/duplicate primitives, broken dark-mode parity, fabricated media geometry |
| **P1** | 96 | Inconsistent sheet/row/button primitives, hardcoded colors bypassing theme, missing error states, symmetry-by-default, "Coming soon" slop |
| **P2** | 180+ | Magic numbers, hex-alpha fragility, stroke grammar drift, label-everything disease, skeleton/final geometry mismatch |

**The 5 highest-leverage fixes** (do these first):
1. Consolidate the **5 duplicate state components** into one `FlagshipState`.
2. Kill **icon-in-circle disease** across 20+ surfaces — adopt the transparent 44pt `iconTarget` pattern everywhere.
3. Replace **all `Alert.alert`** confirmations with one `ConfirmationSheet` primitive.
4. Migrate **all raw `TextInput`** to `AppInput` (4 surfaces violate this).
5. Remove **"Coming soon" placeholders** from AI Agents surface — show only what works.

---

## Part 1 — Cross-Cutting Anti-AI Tells (Systemic)

These defects appear across multiple surface areas and are the loudest "AI-generated" signals. Fixing them yields the largest perceived-quality jump.

### 1.1 Icon-as-Illustration Disease (P0, systemic)

**The tell:** Large Ionicons outline glyphs (32–56px) inside tinted circles/squares used as the *primary visual anchor* of a screen — onboarding slides, auth heroes, empty states, status heroes, brand marks.

**Affected surfaces (20+):**
- Auth: `OnboardingScreen`, `AgeVerificationScreen`, `BiometricLoginScreen`, `KYCVerificationScreen`, `BiometricGate`, `ForgotPasswordScreen`, `VerificationStatusScreen`, `SignupWallSheet`
- Settings: `ActiveSessionsScreen` (deviceIcon), `AboutScreen` (brandIcon), `AccountSecurityRecoveryScreen` (stepNumber), `DeleteAccountScreen` (warningIcon), `YourAlgorithmScreen` (emptyIconCircle), `PasswordStrengthBar` (checklistIcon)
- Profile: `BoardEmptyGraphic`
- Messaging: `ChatAgentPicker` (emptyIcon), `MarketplaceChatCard` (statusInlineIcon, systemEventIcon), `GroupChatInfoScreen` (addMembersIcon)
- AI Agents: `BotDirectoryScreen`, `CustomBotsScreen` (skeleton icons)
- Creator: `PosterStoryActivityScreen` (style-vote avatar placeholder)

**Why it reads as AI:** A media-first marketplace benchmarked against Pinterest/Instagram/Snapchat should use real imagery, authored illustration, or art-directed brand marks. `compass-outline` in a 10%-opacity red square is the canonical AI-onboarding pattern.

**Fix:**
- Onboarding → use real product screenshots (curated feed, co-ownership unit card, live auction countdown, seller listing flow).
- Auth heroes → replace with the user's avatar (biometric), an authored brand mark (age verification, splash), or typographic status treatment.
- Empty states → use `FlagshipState`'s slot-based icon (small, restrained) or a media-driven empty state.
- Status heroes → make the *status word* the dominant object, not a 32px icon.
- Brand mark → commission a real logo/wordmark; `storefront-outline` in a circle is placeholder-grade.

**Reference:** Instagram's Aug-2026 refresh explicitly engineers "tactile, analog photographic language" as anti-AI positioning. Pinterest uses "image is the headline; type and chrome serve the imagery."

### 1.2 Card-on-Card Composition (P0, systemic)

**The tell:** Nested surfaces — a bordered/filled card inside another bordered/filled card. At thumbnail scale this reads as stacked grey rectangles.

**Affected surfaces:**
- Settings: `DeleteAccountScreen` (warningHero + consequenceCard), `SavedAddressesScreen` (addressCard), `TwoFactorSetupScreen` (infoStack), `ActiveSessionsScreen` (trustSurface), `ConnectedAccountsSkeleton` (card skeleton vs flat final)
- Commerce: `OrderSupportScreen` (existingTicketCard, orderCard), `WriteReviewSkeleton` (card skeleton vs flat final), `BuyerProtectionSkeleton` (card skeleton vs flat final)
- Profile: `ProfileCompletenessIndicator` (bordered card), `SellerResponseComposer` (inputCard, guidanceBox), `LookPreviewCard` (bordered shell)
- Messaging: `MarketplaceChatCard` (offerBlock with nested filled sub-containers), `CommerceStateCard` (itemRow inside container), `ChatListingContextBar` (collapseBtn circle)
- Creator: `EditCollectionScreen` (5 shadowed cards stacked), `CreateCollectionScreen` (mixed card + flat + shadow), `StyleQuizScreen` (summaryCard)
- Sell: `EditListingScreen` (photoGuideCard)
- Support: `SupportTicketDetailScreen` (6 elevated cards — the worst offender)

**Fix:** Adopt the `SettingsSection` flat pattern as the default. Hairline separators, no fills, no shadows. Containment only for genuine state boundaries (modal vs canvas, selected vs unselected). One surface per viewport.

**Reference:** Pinterest: "No drop shadows on content, no decorative gradients, no atmospheric backgrounds." AGENTS.md §4: "No card-on-card composition. A nested surface requires a distinct interaction or state boundary."

### 1.3 Duplicate Primitives (P0, systemic)

**The tell:** Multiple components implementing the same concept with different geometry/styling — no one owned the system.

| Concept | Duplicates | Fix |
|---------|-----------|-----|
| State component | `FlagshipState`, `EmptyState`, `AppEmptyState`, `AnimatedEmptyState`, `RetryState`, `AnimatedSuccessState` (6 total) | Keep `FlagshipState` only; add Lottie slot |
| Row primitive | `FlatRow`, `FlagshipNavigationRow` | Keep `FlatRow` (superset); delete `FlagshipNavigationRow` |
| Bottom sheet engine | `BottomSheet`, `BottomSheetPicker` | Rebuild picker on `BottomSheet` |
| Empty-state icon | 3 components with different default icons | One slot in `FlagshipState` |
| Tab rail | `ProfileTabRail`, `PublicProfileTabRail`, `MyProfileTabRail` (600+ duplicated lines) | One configurable component with `underlineColor` prop |
| Identity hero | `ProfileHero`, `MyProfileIdentityHero`, `PublicProfileIdentityHero`, `ProfileVisualHeader` (legacy) | One `ProfileIdentityHero` with `variant: 'self' \| 'public'` |
| Attachment sheet | `AttachmentMenu`, `AttachmentPickerSheet`, `ChatActionSheet` (3 different option sets, 3 animation systems) | One `ChatActionSheet` with merged options |
| Toast | `ToastContext` (global) + local toast in `AIAgentIntegrationScreen` | Use `useToast()` everywhere |
| Button | `AppButton` + local `PrimaryButton`/`SecondaryButton` in `AIAgentIntegrationScreen` + hand-rolled buttons in 6+ screens | Use `AppButton` everywhere |
| Time formatter | `formatRelativeTime`, `formatDate`, `toLocaleDateString` (3 implementations) | One `useRelativeTime` hook |
| Haptic primitive | `useHaptic()` hook + raw `haptics` util | Use `useHaptic()` everywhere |
| Bio text | `ProfileHero.BioText` (plain) + `MyProfileIdentityHero.BioText` (linkified) | One shared `BioText` component |
| Sold treatment | `ProfileShopTile` (gradient fade), `ShopRail` (full overlay), `ClosetBoardCard` (none) | One `SoldTreatment` utility |
| Confirmation | `Alert.alert` (8+ screens) + `ConfirmationSheet` (missing) | One `ConfirmationSheet` primitive |

**Reference:** AGENTS.md §4: "Inconsistent primitives — four different card radii, four different press feedbacks, four different sheet backgrounds. A senior SWE owns the system."

### 1.4 Symmetry-by-Default (P1, systemic)

**The tell:** Everything centered — wordmark, tagline, trust row, buttons, terms. No intentional asymmetry, no dominant object offset.

**Affected:** `AuthLandingScreen`, `OnboardingScreen`, `AgeVerificationScreen`, `BiometricLoginScreen`, `ForgotPasswordScreen` (success), `ResetPasswordScreen`, `AboutScreen`, `DeleteAccountScreen` (warning hero).

**Fix:** Break the default centering. Landing → offset hero, intentional alignment. Onboarding → editorial cropping, varied composition per slide. Auth → left-align form fields, dominant object offset.

**Reference:** AGENTS.md §4: "Everything centred, every section the same height, every gap identical. Real product surfaces have intentional asymmetry."

### 1.5 Label-Everything Disease (P1, systemic)

**The tell:** Uppercase eyebrows on every section, title + subtitle + per-row label + per-row description, redundant meta text.

**Affected:**
- `GalleriaScreen` (4 section eyebrows in one scroll)
- `ConversationalSearchScreen` (greeting + "Try one of these" + "Matched keywords" + "Refine")
- `ChatActionSheet` (title + subtitle + per-row label + per-row description)
- `CreateCollectionScreen` (NAME, DESCRIPTION, SELECT ITEMS uppercase labels)
- `EditCollectionScreen` ("Danger Zone" eyebrow)
- `ManageCollectionItemsScreen` (IN THIS COLLECTION, ADD FROM SAVED)
- `MoodboardHomeScreen` (YOUR MOODBOARDS, DISCOVER eyebrows)
- `CreatePosterHighlightScreen` (3 "Cover" restatements)
- `AIPreferencesScreen` (progress bar gamification + labels)
- `VerificationResponseScreen` (EVIDENCE PHOTOS, NOTES (OPTIONAL), EVIDENCE SUBMITTED)

**Fix:** Remove redundant labels. The content is the label. At most 2 eyebrows in a full scroll. Real apps say "Your items" and move on.

### 1.6 Hardcoded Colors Bypassing Theme (P1, systemic)

**The tell:** Raw hex/rgba values instead of `useAppTheme()` tokens, breaking dark-mode parity.

**Worst offenders:**
- `HeroCarousel.tsx` — entire module-scope `StyleSheet.create` with hardcoded `#fff`, `rgba(255,255,255,0.85)`, `rgba(0,0,0,0.75)`. Doesn't use `useAppTheme()` at all.
- `ShippingPickerSheet.tsx` — `#00000033` for handle and radio borders (invisible in dark mode)
- `LiveShoppingHomeScreen.tsx` — `#3B9EFF` for verified checkmark (raw hex, not in token system)
- `LiveStreamViewerScreen.tsx` — `rgba(0,0,0,0.35)`, `rgba(255,255,255,0.12)` for overlay chrome
- `ProfileVisualHeader.tsx`, `LookPreviewCard.tsx` — hardcoded `#fff` (breaks dark mode)
- `PosterHighlightViewerScreen.tsx` — `#000`, `#fff`, `rgba(255,255,255,...)` throughout
- `PinterestMasonryGrid.tsx`, `LooksTab.tsx` — `#FFFFFF` for scrim text (should be `colors.scrimTextPrimary`)

**Static grep findings:** 24 `: any` matches in screens, 53 in components. 608 files with `accessibilityLabel` (good). 5046 haptic matches (good adoption).

**Fix:** Migrate all hardcoded colors to theme tokens. For scrim-overlay text, use `colors.scrimTextPrimary`. Create a `withAlpha(color, opacity)` utility to replace fragile `${color}12` hex-append patterns.

### 1.7 "Coming Soon" Slop (P0, AI Agents surface)

**The tell:** Non-functional options exposed as working; placeholder badges cluttering real flows.

**Affected:**
- `AIAgentIntegrationScreen` — 4 provider chips (OpenAI/Anthropic/Gemini/Custom) but only OpenAI enabled; 3 show "Soon". Duplicated in device-local keys section.
- `BotBuilderScreen` — "Planned capabilities" section with wall of "Coming soon" badges + lock icons + section header hint. Triple-redundant labeling.

**Fix:** Show only what works. Gate the whole provider step until other providers ship. Remove planned-capabilities section or move behind a "Roadmap" disclosure.

**Reference:** AGENTS.md §4: "Options that don't work" is an AI-slop tell.

### 1.8 Missing Error States (P1, systemic)

**The tell:** Load failures silently swallowed; user sees empty state when it's actually a network error.

**Affected:**
- `ResolutionCentreScreen` — `loadSupportTicketsFromApi().catch(() => {})` silently swallows
- `BotDirectoryScreen` — `loadBotsFromApi().finally(() => setIsLoading(false))` swallows rejections
- `CustomBotsScreen` — same pattern
- `ChatTransactionStrip` — silent failure, strip just disappears
- `SearchAutocomplete` — error from hook captured but never rendered
- `LiveStreamSellerScreen` — all lot action catch blocks empty with `// Service error`

**Gold standard:** `AgentLedgerScreen` — loading skeleton, error+retry, empty, populated, pull-to-refresh. Model all other screens on this.

**Fix:** Add error flag + `FlagshipState variant="error"` with retry. Never swallow errors silently. For live auction seller actions, show toast on failure (trust crisis if silent).

### 1.9 Reduced-Motion Not Gated (P1, systemic)

**The tell:** `useReducedMotion` is read but not applied to gate animations.

**Affected:**
- `GalleriaCollectionDetailScreen` — parallax animations not gated
- `HeroCarousel` — auto-play not gated
- `AttachmentPickerSheet` — `useReducedMotion` imported but never used
- `AttachmentMenu`, `MessageContextMenu` — legacy `Animated` API, no reduced-motion support at all
- `AnimatedHeart` — 12-particle burst on every like (excessive motion)

**Fix:** Gate all motion with `reducedMotion`. Replace `AnimatedHeart` particle burst with single scale pop (Instagram/Pinterest pattern). Standardize on Reanimated 4 — remove legacy `Animated` usage.

**Reference:** Expo animation skill: "Reduced motion ships WITH the animation, not as a follow-up."

### 1.10 Stroke Grammar Drift (P2, systemic)

**The tell:** The token system defines `Stroke.hairline` (0.5), `Stroke.standard` (1), `Stroke.emphasis` (2). Components use 6 different values: `StyleSheet.hairlineWidth`, `0.5`, `1`, `1.5`, `2`, `4`.

**Affected:** `Toast` (4px), `AnimatedBadge` (1.5px), `BottomSheetPicker` (0.5px raw), `ScrollToBottomFAB` (0.5px), `SyncRetryBanner` (1px raw), many more.

**Fix:** Enforce the 3-value stroke grammar. Replace all raw values with tokens.

---

## Part 2 — Surface-by-Surface Top Fixes

### 2.1 Discovery & Home

| # | Priority | Fix | File |
|---|----------|-----|------|
| 1 | P0 | Re-author `HeroCarousel` with theme tokens, empty state, reduced-motion auto-play gate | `HeroCarousel.tsx` |
| 2 | P1 | Fix back button inset (`paddingTop: insets.top`) + gate parallax with reducedMotion | `GalleriaCollectionDetailScreen.tsx` |
| 3 | P1 | Replace hardcoded `fontSize: 12/10/11`, `#FFFFFF`, `gap: 2/3` with tokens in tile overlays | `PinterestMasonryGrid.tsx`, `LooksTab.tsx` |
| 4 | P2 | Add `estimatedItemSize` to all FlashList masonry instances | 4 files |
| 5 | P2 | Fix trending icon color (`colors.danger` → `colors.brand`) | `SearchAutocomplete.tsx` |

### 2.2 Profile & Storefront

| # | Priority | Fix | File |
|---|----------|-----|------|
| 1 | P1 | Consolidate 3 tab rail components into one configurable component | `ProfileTabRail`, `PublicProfileTabRail`, `MyProfileTabRail` |
| 2 | P1 | Migrate `ProfileVisualHeader` and `LookPreviewCard` to `useAppTheme()` (breaks dark mode) | 2 files |
| 3 | P1 | Replace `SellerResponseComposer` raw `Modal` with `NativeSheet` | `SellerResponseComposer.tsx` |
| 4 | P1 | Unify bio truncation/linkification across `ProfileHero` and `MyProfileIdentityHero` | 2 files |
| 5 | P1 | Remove `ProfileCompletenessIndicator` bordered card; increase bar height 2px→4-6px | `ProfileCompletenessIndicator.tsx` |

### 2.3 Product Detail & Commerce

| # | Priority | Fix | File |
|---|----------|-----|------|
| 1 | P1 | Fix 1ZE/fiat display divergence in checkout button | `CheckoutScreen.tsx` |
| 2 | P1 | Compact trust facts on `isCompactScreen` so price+action+trust fit first viewport | `ItemDetailScreen.tsx` |
| 3 | P1 | Differentiate Apple Pay/Google Pay from card Pay (pass payment method type) | `CheckoutScreen.tsx` |
| 4 | P1 | Reuse `CommerceMediaStage` in `ManageListingScreen`; remove always-on `heroOverlay` | `ManageListingScreen.tsx` |
| 5 | P1 | Migrate `CheckoutScreen` and `BidSheet` themed proxy objects to `createStyles(colors)` | 2 files |

### 2.4 Messaging & Chat

| # | Priority | Fix | File |
|---|----------|-----|------|
| 1 | P0 | Consolidate 3 attachment systems into one `ChatActionSheet` with merged options | 3 files |
| 2 | P0 | Add confirmation sheets for "Delete for me", "Leave group", bulk message deletion | `GroupChatInfoScreen.tsx`, `ChatScreen.tsx` |
| 3 | P1 | Add error+retry to `ChatTransactionStrip` (currently silently disappears) | `ChatTransactionStrip.tsx` |
| 4 | P1 | Standardize all sheets on Reanimated; remove legacy `Animated` from `AttachmentMenu`, `MessageContextMenu` | 2 files |
| 5 | P1 | Virtualize `GroupMembersScreen` member list with FlashList | `GroupMembersScreen.tsx` |

### 2.5 Auth & Onboarding

| # | Priority | Fix | File |
|---|----------|-----|------|
| 1 | P0 | Collapse `LoginScreen` tertiary auth methods behind "More sign-in options" disclosure | `LoginScreen.tsx` |
| 2 | P0 | Replace icon-as-illustration with real product imagery on onboarding; authored brand marks on auth | 8 files |
| 3 | P0 | Replace raw `TextInput` in `VerificationScreen`/`VerificationResponseScreen` with `AppInput` | 2 files |
| 4 | P1 | Introduce authored brand mark on `AuthLandingScreen`; break default centering | `AuthLandingScreen.tsx` |
| 5 | P1 | Enforce two-radius budget; standardize primary button radius to `Radius.full` | All auth screens |

### 2.6 Settings & Account & Utility

| # | Priority | Fix | File |
|---|----------|-----|------|
| 1 | P0 | Remove icon-in-circle disease across all custom rows; use 44pt transparent `iconTarget` | 7 files |
| 2 | P0 | Flatten card-wrapped content on utility surfaces (trustSurface, warningHero, addressCard, infoStack) | 5 files |
| 3 | P0 | Fix `AddressFormScreen` form fields (add border, `colors.input` background, focus state) | `AddressFormScreen.tsx` |
| 4 | P0 | Remove gamification progress bars from `AIPreferencesScreen`, `InviteFriendsScreen` | 2 files |
| 5 | P1 | Remove `SettingsCard.glass` variant; audit `SettingsCard` usage (may be dead code) | `SettingsCard.tsx` |

### 2.7 AI Agents & Bots

| # | Priority | Fix | File |
|---|----------|-----|------|
| 1 | P0 | Remove "Coming soon" provider chips and planned-capability badges | `AIAgentIntegrationScreen`, `BotBuilderScreen` |
| 2 | P0 | Fix `handleRemoveTopic` to use real topic ID (currently fabricates ID, may silently no-op) | `FeedExplanationSheet.tsx` |
| 3 | P1 | Consolidate button + toast primitives; replace local `PrimaryButton`/`SecondaryButton` with `AppButton` | `AIAgentIntegrationScreen.tsx` |
| 4 | P1 | Fix icon grammar: chevrons → `-outline`; unify confidence dot size; fix radio dot radius → `Radius.full` | 3 files |
| 5 | P1 | Add error+retry states to `BotDirectory` and `CustomBots` (mirror `AgentLedger`) | 2 files |

### 2.8 Creator, Posters & Looks

| # | Priority | Fix | File |
|---|----------|-----|------|
| 1 | P0 | Fix `PosterArchiveScreen` card aspect ratio (16:9 → 9:16 for portrait posters) | `PosterArchiveScreen.tsx` |
| 2 | P1 | Re-author `MoodboardEditorScreen` to full-screen canvas (currently 70/30 split — prohibited pattern) | `MoodboardEditorScreen.tsx` |
| 3 | P1 | Ship `ConfirmationSheet` primitive; migrate 8 screens from `Alert.alert` | 8 files |
| 4 | P1 | Flatten `EditCollectionScreen` and `CreateCollectionScreen` card stacks | 2 files |
| 5 | P1 | Fix skeleton aspect ratios to match final layouts (LookDetail, PosterViewer, Board) | 3 files |

### 2.9 Sell & Create & Listing

| # | Priority | Fix | File |
|---|----------|-----|------|
| 1 | P1 | Replace hardcoded `#00000033` in `ShippingPickerSheet` with `colors.border` | `ShippingPickerSheet.tsx` |
| 2 | P1 | Use `formatFromFiat` instead of hardcoded `£` in `ImportListingTile` and `ListingPreviewCard` | 2 files |
| 3 | P1 | Remove `<Confetti />` from success screens (anti-AI motion tell) | `SuccessScreen`, `ListingSuccessScreen` |
| 4 | P1 | Reduce `ListingPreviewScreen` hero from 65% to ~50% screen height | `ListingPreviewScreen.tsx` |
| 5 | P1 | Flatten `StyleQuizScreen` summary card to hairline-separated rows | `StyleQuizScreen.tsx` |

### 2.10 Notifications, Support & Live Shopping

| # | Priority | Fix | File |
|---|----------|-----|------|
| 1 | P0 | Flatten `SupportTicketDetailScreen` 6 elevated cards to hairline-separated rows | `SupportTicketDetailScreen.tsx` |
| 2 | P0 | Fix `LiveStreamViewerScreen` retry to re-subscribe to real-time events | `LiveStreamViewerScreen.tsx` |
| 3 | P0 | Add error state to `ResolutionCentreScreen` (currently silently swallows) | `ResolutionCentreScreen.tsx` |
| 4 | P1 | Fix chat text colors in `LiveStreamViewerScreen` (`textPrimary` → `scrimTextPrimary`) | `LiveStreamViewerScreen.tsx` |
| 5 | P1 | Fix "Closed" status tone across support screens (`error` → `neutral`) | 2 files |

### 2.11 Wallet & Co-Own

*(Covered by Commerce + Settings surface audits — no standalone wallet audit was dispatched. Key findings: `WalletConvertScreen` has 13 accessibilityLabels (good); `CoOwnWalletBreakdown` uses consistent token patterns.)*

### 2.12 Shared Primitives, Components, Animations & Theme

| # | Priority | Fix | File |
|---|----------|-----|------|
| 1 | P0 | Consolidate to one state component (`FlagshipState`); delete 5 duplicates | 6 files |
| 2 | P0 | Remove all `any` types (`AppButton`, `CachedImage`, `FlatRow`, `ThemeContext`) | 4 files |
| 3 | P0 | Delete `BottomSheetPicker` engine; rebuild on `BottomSheet` | `BottomSheetPicker.tsx` |
| 4 | P0 | Fix `Text.tsx` dead wrappers (Title1/2/3 identical); fix `BodyEmphasis` wrong token (20px→15px) | `Text.tsx` |
| 5 | P1 | Make `colors.ts` immutable; fix `gradients.ts` static-export staleness | `colors.ts`, `gradients.ts` |

---

## Part 3 — Theme System Defects

### 3.1 Triple Typography System (P1)

`Type` (semantic), `TypeStyles` (deprecated TextStyle), `Typography` (re-export) all coexist. Components import a mix. `TypeStyles.hero`, `TypeStyles.heroDisplay`, `TypeStyles.giantDisplay` are fabricated legacy variants with no semantic home.

**Fix:** Delete `Typography` re-export and `TypeStyles`. Migrate all imports to `Type` + `FontFamily` directly.

### 3.2 Mutable Global Color State (P1)

`colors.ts` exports `let Colors` and `let ActiveTheme` — mutable globals that break React reactivity. `gradients.ts` static exports capture these at module load and go stale on theme switch.

**Fix:** Replace `export let Colors` with `getColors()` or remove the global. All non-component consumers should receive colors via parameters.

### 3.3 `any` in Production Primitives (P0)

- `AppButton` L48: `colors: any` → `ThemeColors`
- `CachedImage` L248: `e?: any` → typed load event
- `FlatRow` L110: `style?: any` → `StyleProp<ViewStyle>`
- `ThemeContext` L96–98: `RAW_DARK_COLORS as ThemeColors` → `satisfies ThemeColors`

**Fix:** Remove all `any`. Use `satisfies` for structural verification.

### 3.4 Focus Color Inconsistency (P1)

`AppInput` uses `colors.brand` for focus border. `AppSearchBar` uses `colors.textSecondary`. Two input primitives, two focus colors in the same viewport.

**Fix:** Standardize on `colors.brand` for all input focus states.

### 3.5 CTA Background Inconsistency (P1)

`AppButton` primary uses `colors.brand`. `EmptyState` CTA, `AnimatedEmptyState` CTA, `RetryState` retry button, `ReportScreen` submit all use `colors.textPrimary`. Two different "primary action" colors.

**Fix:** Standardize on `colors.brand` for all primary actions.

---

## Part 4 — Performance Defects

### 4.1 Missing `estimatedItemSize` on FlashList Masonry (Medium)

All FlashList masonry instances omit `estimatedItemSize`: `GalleriaScreen`, `PinterestMasonryGrid`, `LooksTab`, `ConversationalSearchScreen`.

**Fix:** Add `estimatedItemSize={250}` (average tile height) for optimal first-pass layout.

### 4.2 Module-Level `Dimensions.get()` (P1)

`ProfileLooksGrid`, `ClosetBoardCard`, `ProfileVisualHeader`, `LiveStreamViewerScreen`, `LiveStreamSellerScreen`, `FilterScreen` all call `Dimensions.get('window')` at module load. Caches screen width permanently — orientation/split-view changes not reflected.

**Fix:** Replace with `useWindowDimensions()` hook.

### 4.3 Non-Virtualized Lists (P1)

- `GroupMembersScreen` — `filteredMembers.map()` inside `ScrollView` (100+ members = jank)
- `CreateGroupChatScreen` — selected participants list not virtualized

**Fix:** Replace with `FlashList`.

### 4.4 Wasteful API Calls (P2)

`ChatTransactionStrip` fetches 20 orders then filters client-side for 1 matching `listingId`. Should use a dedicated endpoint or server-side filter.

### 4.5 O(n) Per Keystroke (P2)

`GlobalSearchScreen.localSearchSuggestions` iterates all listings on every character with no debounce.

**Fix:** Debounce the suggestion computation or limit to first N matches.

---

## Part 5 — Accessibility Defects

### 5.1 Touch Targets Below 44pt (P1)

- `SavedSearchesScreen` action buttons (~28pt, no `hitSlop`)
- `SettingsSignOutRow` (50pt, below 56pt spec)
- `RadioButton` (22pt visible, no 44pt wrapper)
- `PosterArchiveScreen` delete button (16pt icon, `hitSlop={8}` = 32pt total < 44pt)

**Fix:** Enforce 44pt minimum via `Control.hit` token. Add `hitSlop` where visible chrome is smaller.

### 5.2 Missing Accessibility Labels (P2)

608 files have `accessibilityLabel` (good adoption), but several interactive elements lack labels:
- `FlagshipHeader` back button with `title=""` (no accessible name)
- Inline `<Text onPress>` links (press target is only the text, not 44pt)

### 5.3 `aria-hidden` on Ionicons (P2)

`FilterScreen` sets `aria-hidden={true}` on Ionicons — React Native Ionicons use `accessibilityLabel`, not `aria-hidden`. May not work as expected.

**Fix:** Use `accessibilityRole="image"` with empty label, or wrap in `<View accessibilityElementsHidden>`.

---

## Part 6 — Research-Backed Upgrade Recommendations

Synthesized from Pinterest 2026, Instagram Aug-2026, Snapchat 2026, and React Native flagship best practices 2026.

### 6.1 Visual Identity (Escape the AI-Default Look)

| Principle | Current State | Target |
|-----------|--------------|--------|
| Primary color | In AI-blue range risk | Distinctive primary outside blue-purple range |
| Typography | Inter + Playfair (good pairing) | Add display cut for hero tiers; negative tracking at display sizes |
| Layout | Symmetry-by-default on auth/utility | Asymmetric sections, broken grids, deliberate imbalance |
| Shape vocabulary | 3+ radii per viewport | Two-radius system (16/32/pill, nothing between) — Pinterest pattern |
| Shadows | On every surface (cards, knobs, toggles) | No shadows on content; only modal scrim — Pinterest pattern |
| Craft signals | Missing focus/selection/reduced-motion | Custom focus-visible ring, custom selection states, reduced-motion shipped with every animation |

### 6.2 Media Treatment (Pinterest Gate)

| Principle | Current State | Target |
|-----------|--------------|--------|
| Aspect ratios | `PosterArchiveScreen` crops 9:16 → 16:9 (fabricated geometry) | Preserve natural aspect ratios — "content has no fixed aspect ratio" |
| Image loading | `CachedImage` with shimmer (good) | Add ThumbHash placeholders, `recyclingKey`, prefetch, `memory-disk` cache |
| Masonry | FlashList v2 (good) | Add `estimatedItemSize`, aspect-ratio-reserved heights from API metadata |
| Focal points | `contentFit="cover"` with no focal-point logic | Pass `focusPoint`/`contentPosition` for art-directed crops |

### 6.3 Motion Language (Instagram Gate)

| Principle | Current State | Target |
|-----------|--------------|--------|
| Animation system | Mixed legacy `Animated` + Reanimated | Reanimated 4 only; CSS Transitions for state-driven (80%), worklets for gesture (20%) |
| Press feedback | `AnimatedPressable` with scale (good) | Add platform-specific haptics via `expo-haptics`; state-layer press feedback |
| Reduced motion | Inconsistently gated | Ship with every animation, not as follow-up |
| Excessive motion | `AnimatedHeart` 12-particle burst | Single scale pop (Instagram/Pinterest pattern) |
| Confetti | On success screens | Remove — anti-AI motion tell |

### 6.4 State Coverage (Flagship Gate)

| Principle | Current State | Target |
|-----------|--------------|--------|
| State machine | `loading` boolean on some screens | Explicit state machine: idle/typing/submitting/queued/streaming/failed/complete/reviewed |
| Skeletons | Some mismatch final geometry | Skeleton parity — match shape and varied heights (masonry) |
| Error states | Silently swallowed on 6+ screens | Actionable error: retry, stop, partial-content preservation |
| Empty states | Icon-in-circle on some surfaces | Designed empty state with illustration + clear next action |
| Offline | Online-only on some surfaces | Offline-first (WatermelonDB); persist unfinished work |

### 6.5 Design Token Architecture (2026 Consensus)

| Principle | Current State | Target |
|-----------|--------------|--------|
| Token layers | Mixed `Type`/`TypeStyles`/`Typography` | Three-layer: primitive → semantic → component recipes |
| Theme switching | Mutable global `Colors` | Zero-JS-re-render where possible; `ThemeProvider` + `useTheme` |
| Dark mode | Hardcoded colors break parity | Designed dark palette (not inverted); high-contrast + font-scale tiers |
| CI enforcement | None | Figma-to-code 1:1 contract; auto-update `theme.ts` from design tokens |
| Alpha colors | `${color}12` hex-append (fragile) | `withAlpha(color, opacity)` utility |

### 6.6 Navigation & Gestures (Snapchat Gate)

| Principle | Current State | Target |
|-----------|--------------|--------|
| Gestures | Tap = click on most surfaces | `react-native-gesture-handler`: swipe-to-delete with resistance, pinch, drag |
| Screen transitions | Generic/default | Native-feeling transitions, shared-element hero animations |
| Thumb zone | Primary actions not always in lower thumb-reach | Primary actions in lower thumb-reach zone |
| Confirmation | `Alert.alert` (8+ screens) | `ConfirmationSheet` bottom sheet with snap points |

### 6.7 Keyboard Handling

| Principle | Current State | Target |
|-----------|--------------|--------|
| Keyboard avoidance | `KeyboardAvoidingView` on several screens | `react-native-keyboard-controller` with `KeyboardProvider` at root |
| Dismiss | Inconsistent tap-outside behavior | Dismiss-on-tap-outside + scroll-to-focused-input |
| Animation | JS-thread jank on some surfaces | Reanimated worklet on UI thread |

---

## Part 7 — Implementation Priority

### Phase 1: Foundation (1-2 weeks)
1. Consolidate state components → one `FlagshipState`
2. Remove all `any` types in production primitives
3. Fix `Text.tsx` dead wrappers + `BodyEmphasis` wrong token
4. Delete `BottomSheetPicker` engine; rebuild on `BottomSheet`
5. Make `colors.ts` immutable; fix `gradients.ts` staleness
6. Create `withAlpha()` utility; replace hex-append patterns
7. Create `ConfirmationSheet` primitive; migrate `Alert.alert` call sites

### Phase 2: Anti-AI Tells (2-3 weeks)
1. Kill icon-in-circle disease across 20+ surfaces
2. Flatten card-on-card composition on all utility surfaces
3. Replace icon-as-illustration with real imagery on onboarding/auth
4. Remove "Coming soon" slop from AI Agents surface
5. Break symmetry-by-default on auth/landing surfaces
6. Remove label-everything eyebrows (max 2 per scroll)
7. Remove confetti from success screens

### Phase 3: Theme & Token Discipline (1-2 weeks)
1. Migrate all hardcoded colors to theme tokens
2. Enforce two-radius budget per viewport
3. Enforce three-value stroke grammar
4. Standardize focus color (`colors.brand`) and CTA color (`colors.brand`)
5. Delete `Typography` re-export and `TypeStyles`
6. Fix skeleton/final geometry mismatches

### Phase 4: State Coverage (1-2 weeks)
1. Add error+retry states to 6+ screens that silently swallow
2. Replace `loading` booleans with explicit state machines
3. Add `estimatedItemSize` to all FlashList masonry instances
4. Replace module-level `Dimensions.get()` with `useWindowDimensions()`
5. Virtualize non-virtualized lists (`GroupMembersScreen`, etc.)

### Phase 5: Motion & Accessibility (1 week)
1. Gate all motion with `reducedMotion`
2. Standardize on Reanimated 4; remove legacy `Animated`
3. Replace `AnimatedHeart` particle burst with single scale pop
4. Enforce 44pt touch targets via `Control.hit`
5. Add missing accessibility labels

### Phase 6: Surface Polish (2-3 weeks)
1. Re-author `HeroCarousel` with theme tokens
2. Re-author `MoodboardEditorScreen` to full-screen canvas
3. Fix `PosterArchiveScreen` card aspect ratio (9:16)
4. Fix `LiveStreamViewerScreen` retry to re-subscribe
5. Flatten `SupportTicketDetailScreen` 6 cards
6. Consolidate 3 attachment systems into one
7. Migrate raw `TextInput` to `AppInput` (4 surfaces)

---

## Part 8 — Verification Gates

After implementation, verify against these gates:

### Anti-AI Thumbnail Test
At 25% scale, no viewport should read as:
- A vertical stack of identical grey rectangles
- Centered text with no dominant object
- A row of identical icon-in-circle elements
- A grid of uniform-height skeleton cards

### Token Compliance
- Zero hardcoded hex colors (grep for `#[0-9A-Fa-f]{3,8}` in `.tsx` files)
- Zero `: any` in production primitives
- Zero `${color}12` hex-append patterns
- Zero module-level `Dimensions.get()`
- Zero raw `TextInput` outside `AppInput`/`DebouncedTextInput`

### State Coverage
Every async surface has: loading skeleton (matching final geometry), error+retry, empty (designed), offline, populated.

### Accessibility
- 44pt minimum touch targets
- `accessibilityLabel` on every interactive element
- `reducedMotion` gates every animation
- Dynamic Type/SP scaling supported

### Performance
- FlashList with `estimatedItemSize` on all masonry
- `useWindowDimensions` instead of module-level `Dimensions.get`
- Reanimated 4 only (no legacy `Animated`)
- `expo-image` with `memory-disk` cache, `recyclingKey`, ThumbHash

---

## Appendix A — Static Audit Summary

| Metric | Count | Notes |
|--------|-------|-------|
| Screens | 171 | `frontend/src/screens/` |
| Components with `accessibilityLabel` | 608 | Good adoption |
| Haptic matches | 5046 | Excellent adoption |
| `: any` in screens | 24 | Should be 0 |
| `: any` in components | 53 | Should be 0 |
| `KeyboardAvoidingView` usage | Several screens | Migrate to `react-native-keyboard-controller` |

## Appendix B — Research Sources

### Pinterest 2026
- Gestalt design system v177.0.13 (Jan 2026)
- Pin Sans typography, 14 type roles
- Two-radius shape vocabulary (16/32/pill)
- Warm-cream neutrals (`#fbfbf9`, `#f6f6f3`, `#33332e`)
- Single-accent voltage (Pinterest Red `#e60023` used only for CTA/tab/wordmark)
- Masonry: shortest-column-first, 8px gutters, natural aspect ratios
- Motion: blur-up, shimmer, animated glow (image-led, not playful)

### Instagram Aug-2026 Refresh
- First major refresh in 10 years (Aug 2026)
- Tactile/analog language: contact sheets, registration marks, annotations
- Three typefaces: Instagram Sans, Instagram Pen (handwriting), Instagram Mono
- Grid change: 1:1 → 3:4 vertical thumbnails (early 2025, dominant 2026)
- Grid reordering (June 8, 2026): long-press → drag
- Motion: physics-based, echoes human imperfection
- Anti-AI positioning: "quiet confidence, warmth of something crafted with care"

### Snapchat 2026
- Camera-first architecture (camera is home screen)
- Gesture-native IA (swipe radial nav)
- Single 9:16 full-bleed canvas (1080×1920)
- Floating transparent tool rail on RIGHT edge
- Magnetic carousel for filters/lenses
- One electrifying yellow (`#FFFC00`) + one action blue (`#0096E5`)
- Status color semantics (red/purple/blue/hollow = unopened/opened × snap-with-audio/chat)
- Springy micro-interactions (scale-on-press 0.95–0.97)

### React Native Flagship 2026
- New Architecture (JSI/Fabric/TurboModules) is default
- Reanimated 4 stable (July 2025); Reanimated 3 no longer maintained
- CSS Transitions/Animations for 80% of animations; worklets for 20%
- FlashList over FlatList (consistently outperforms)
- expo-image with `memory-disk` cache, ThumbHash, `recyclingKey`
- Three-layer token system: primitive → semantic → component recipes
- State machines over `loading` booleans
- 44pt touch targets, WCAG 2.2 from first wireframe
- `react-native-keyboard-controller` for keyboard-following UI
- Offline-first (WatermelonDB)

---

## Conclusion

ThryftVerse's frontend has strong architectural foundations. The path to flagship is primarily about **discipline** — enforcing the existing token system, consolidating duplicate primitives, and eliminating the compositional patterns that read as AI-generated. The highest-leverage work is:

1. **Own the system** — one state component, one row primitive, one sheet engine, one button, one toast, one confirmation pattern.
2. **Kill the AI tells** — icon-in-circle, card-on-card, symmetry-by-default, label-everything, "Coming soon" slop.
3. **Enforce token compliance** — zero hardcoded colors, zero `any`, zero magic numbers.
4. **Cover all states** — error+retry on every async surface, skeleton parity with final geometry.
5. **Gate all motion** — reduced-motion ships with every animation, not as a follow-up.

The result will be an app that reads as **authored and crafted**, not assembled — the opposite of the AI-generated aesthetic that dominates 2026 mobile UI.

---

## Appendix C — Auction & Co-Own Financial Surface Audit

Audited 35 files (`AuctionCountdown`, `AuctionStickyBidDock`, `AuctionPriceBlock`, `AuctionGridCard`, `AuctionRunwayCard`, `AuctionCountdownBar`, `AuctionValueLockup`, `AuctionStateBadge`, `AuctionAttentionStrip`, `AuctionTerminalResult`, `AuctionPostEndBanners`, `ReserveStatusBadge`, `BidComposer`, `MarketBookRow`, `OrderHistoryRow`, `UnitsComposer`, `TradeCard`, `MetricGrid`, `CoOwnOrderBook`, `CoOwnTradeComposer`, `CoOwnRiskDisclosure`, `CoOwnPositionCard`, `CoOwnPriceChart`, `CoOwnStickyActionDock`, `CoOwnTradeReceipt`, `CoOwnDepthPreview`, `CoOwnMarketHeader`, `CoOwnValueStrip`, `HoldToSubmitButton`, `CoOwnNumericText`, `AuctionDetailScreen`, `AuctionHomeScreen`, `TradeConfirmScreen`, `TradeScreen`, `AssetDetailScreen`).

### P0 Defects (Financial Safety / Truthfulness)

| # | File | Defect |
|---|------|--------|
| 1 | `TradeConfirmScreen.tsx` L86 | `requireHold = netValue > 5000` — only 5,000 1ZE threshold implemented; documented 5% public-float threshold missing. Financial safety gap. |
| 2 | `TradeConfirmScreen.tsx` L257 | `quantity > 0 ? format1ze(totalValue / quantity) : format1ze(0)` — shows "0.00 1ZE" when quantity is 0. Fabricated financial value. |
| 3 | `BidComposer.tsx` L46-54 | No `KeyboardAvoidingView` — keyboard covers input + actions on small devices. Same in `UnitsComposer.tsx` L56-64. |
| 4 | `AuctionTerminalResult.tsx` L84-93 | "Discover similar" link touch target ~36pt — below 44pt minimum. |
| 5 | `CoOwnPositionCard.tsx` L292, L302, L314 | `stopPropagation` on inner `Pressable.onPress` — fragile gesture boundary pattern. |

### P1 Defects (Systemic Cross-Cutting)

| # | Pattern | Files |
|---|---------|-------|
| CC-1 | Hex alpha append `${color}XX` — fragile if color is 8-digit hex | 8+ components |
| CC-2 | `borderWidth: 1` instead of `StyleSheet.hairlineWidth` | 6 components |
| CC-3 | Raw `toFixed` instead of `CoOwnNumericText` — bypasses tabular-nums + true minus | 8+ call sites |
| CC-4 | `fontVariant: ['tabular-nums'] as any` cast | 3 files |
| CC-5 | Ellipsis `…` vs `...` inconsistency | 3 files |
| CC-6 | Missing keyboard avoiding behavior in bottom-sheet composers | 2 files |

### Top 10 Priority Fixes (Auction & Co-Own)

1. **P0:** Implement 5% public-float threshold for hold-to-submit (`TradeConfirmScreen` L86).
2. **P0:** Add `KeyboardAvoidingView` to `BidComposer` and `UnitsComposer`.
3. **P0:** Fix "0.00 1ZE" fabrication when quantity is 0 (`TradeConfirmScreen` L257).
4. **P0:** Fix touch target on "Discover similar" link (`AuctionTerminalResult` L84-93).
5. **P1:** Create `withAlpha()` utility; replace hex-alpha append pattern (CC-1).
6. **P1:** Route all Co-Own numeric displays through `CoOwnNumericText` (CC-3).
7. **P1:** Standardize `StyleSheet.hairlineWidth` for all borders (CC-2).
8. **P1:** Fix `CoOwnValueStrip` local fiat showing "0.00" when `last` is null (L290) — violates "no zeros" principle.
9. **P1:** Fix `HoldToSubmitButton` progress animation — scale-from-center doesn't communicate hold progress; use clockwise or edge-fill.
10. **P1:** Fix `CoOwnPriceChart` O(n²) sparse mark calculation (L450-464).

### Upgrade Recommendations (Auction & Co-Own)

- Create `theme/colorUtils.ts` with `withAlpha()`, `mix()`, `validateHex()`.
- Export shared `TABULAR_NUMS` constant to eliminate `as any` casts.
- Create `KeyboardAwareBottomSheet` primitive to replace manual overlay pattern.
- Replace 10s order-book polling with WebSocket subscription.
- Fetch fee rate from backend instead of hardcoded `"Fee (1%)"`.
- Implement `AuctionCountdown` `urgent` stage (< 15m) for three-level urgency gradient.
- Consolidate `AuctionTerminalResult` three identical title styles into one.

---

## Appendix D — Wallet & Payments Surface Audit

Audited 12 files (`WalletScreen`, `PaymentsScreen`, `WithdrawScreen`, `WalletConvertScreen`, `WalletHistoryScreen`, `AddBankAccountScreen`, `BalanceHistoryScreen`, `SellerEarningsScreen`, `AddMoneySheet`, `WalletTransactionHistory`, `CoOwnNumericText`, `MetricGrid`).

### P0 Defects (Correctness / Truthfulness)

| # | File | Defect |
|---|------|--------|
| 1 | `AddBankAccountScreen.tsx` L113 | `const userId = currentUser?.id ?? 'u1'` — fabricates user ID on null. Saves bank account against fake user. Real correctness bug. |
| 2 | `BalanceHistoryScreen.tsx` L134-138 | `netFlow` computed on partial data (first 50 txns). Hero labeled "Net flow" with no scope qualifier — misleading. |
| 3 | 8 of 12 files | No internationalization. `WithdrawScreen`, `WalletConvertScreen`, `WalletHistoryScreen`, `AddBankAccountScreen`, `BalanceHistoryScreen`, `SellerEarningsScreen`, `AddMoneySheet`, `WalletTransactionHistory` — ~60+ hardcoded English strings each. `t` imported but unused. |

### P1 Defects (Systemic)

| # | Pattern | Files |
|---|---------|-------|
| 1 | Magic arithmetic on tokens: `Type.priceHero.size + 28`, `Space.xxl * 3 + ...`, `Space.lg + 4` | Withdraw, Convert |
| 2 | `CoOwnNumericText` under-adopted — raw `Text` + manual `tabular-nums` instead | 6 screens |
| 3 | 1ZE precision drift: 2dp hero vs 3dp ledger | WalletScreen vs WalletTransactionHistory |
| 4 | Biometric gate inconsistency: Wallet/Payments/Withdraw gate; AddBankAccount/SellerEarnings don't | 2 screens |
| 5 | Decorative tinted disc behind icon (successIconCircle, sourceIcon, receiptIcon, summaryChip) | 4 instances |
| 6 | Radius budget violations: `Radius.full`, `Space.lg + 4`, `Radius.lg`, `Radius.md` in one viewport | Multiple |
| 7 | `AddBankAccountScreen` fields have no visible input boundary — don't read as editable | AddBankAccount |
| 8 | `BalanceHistoryScreen` net-flow hero: color-only direction encoding (no ▲/▼ glyph) | BalanceHistory |
| 9 | Duplicate headings: "Transaction ledger" header + "TRANSACTION LEDGER" body | BalanceHistory |
| 10 | `AddMoneySheet` fiat-balance path confirms without exact fee (card path shows live quote) | AddMoneySheet |
| 11 | `WithdrawScreen` `unknown_outcome` step: no escape affordance (back is no-op, no timeout) | Withdraw |
| 12 | `WithdrawScreen` confirm: hardcoded `Fee: 0` shown as `£0.00` — reads as placeholder | Withdraw |
| 13 | `WalletConvertScreen` verbose jargon copy: "1ZE is burned at par..." — "burned" is technical jargon | WalletConvert |
| 14 | `MetricGrid` generic dashboard silhouette — row of identical grey cards, fails thumbnail test | MetricGrid |
| 15 | `SellerEarningsScreen` "Seller balance" chip inside "Sale proceeds" card — label-everything disease | SellerEarnings |

### Top 5 Priority Fixes (Wallet & Payments)

1. **Internationalize the 8 hardcoded files.** Highest-impact, highest-breadth defect — half the wallet surface is untranslatable.
2. **Fix `AddBankAccountScreen` correctness + form-field spec.** Remove `?? 'u1'` fabricated-user fallback; add visible 1pt input boundary; add field-level validation; add biometric gate; wire `returnKeyType="next"`.
3. **Fix `BalanceHistoryScreen` truthfulness + direction encoding.** Label net-flow scope or compute server-side; add ▲/▼ glyph; remove duplicate "TRANSACTION LEDGER" label; route through `CoOwnNumericText`.
4. **Re-author `MetricGrid` away from grey-card grid.** Flatten to single panel with hairline dividers; use `CoOwnNumericText`; let one metric dominate.
5. **Replace magic arithmetic with named tokens; enforce radius budget.** Introduce `Radius.btn` / `Radius.input` / `Radius.panel` / `Type.amountInput` tokens.

### Upgrade Recommendations (Wallet & Payments)

- Adopt `CoOwnNumericText` as single numeric renderer across all wallet surfaces; enforce shared 1ZE precision constant.
- Extract "tinted disc behind success icon" into one reviewed component or remove.
- Add escape affordance to `WithdrawScreen` `unknown_outcome` step.
- Replace `Fee: £0.00` with "No fee" copy from `t()` key.
- Trim `WalletConvertScreen` review-hint paragraph to one line; replace "burned" with "converted".
- Remove `SellerEarningsScreen` "Seller balance" chip; flatten `emptySchedule` from card to hairline row.
- Replace `AddBankAccountScreen` "bank-level encryption" banner with substantiated signal (PCI-DSS provider link).
- Derive separator indent from layout instead of `marginLeft: 52` magic number.

---

*Generated with [Devin](https://devin.ai) — 18 parallel subagents (12 surface + 4 research + 2 financial) + static analysis*
