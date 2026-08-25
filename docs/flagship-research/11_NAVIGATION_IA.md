# 11 — Navigation & Information Architecture

**Department:** App navigator, tab navigator, linking, information architecture, deep linking, navigation types.
**Source files audited:** `frontend/App.tsx`, `frontend/src/navigation/AppNavigator.tsx`, `frontend/src/navigation/TabNavigator.tsx`, `frontend/src/navigation/linking.ts`, `frontend/src/navigation/openProfile.ts`, `frontend/src/navigation/types.ts`, `frontend/src/components/ui/ScreenHeader.tsx`.
**Charter references:** §4 (Push to Maximum Quality), §6 (Scope & Proportionality), §11 (Truthful UI), §12 (Navigation Quality).

---

## 1. 2026 Competitor Benchmark

The 2026 navigation landscape has converged on a small set of principles that the flagship apps now treat as table stakes. ThryftVerse should be measured against them, not against its own previous iteration.

### Instagram — the Liquid Glass pivot and the center-slot war

Instagram's March 2026 redesign is the most documented navigation shift of the year. The bottom bar moved from the classic Home / Search / Reels / Shop / Profile arrangement to **Home, Reels, DMs, Search, Profile**, with the Create button relocated to the top-left corner and Reels promoted to the center slot. The center position is no longer an action button — it is now the product's primary consumption surface. Simultaneously, Instagram rolled out Apple's **Liquid Glass** treatment to the navigation bar: a translucent, pill-shaped floating container that hovers above the bottom edge, shrinks on scroll, and lets content pass behind it. The backlash was immediate — users complained that the shrink-on-scroll behaviour caused accidental taps and that the bar's translucency hurt legibility over busy media backgrounds. The lesson for ThryftVerse is twofold: (1) the center slot is the most valuable real estate in the app and should be reserved for the single action the user performs most, and (2) Liquid Glass is a material, not a solution — applying blur without solving legibility and tap-target integrity creates net-negative UX.

### Pinterest — progressive disclosure and the hidden bar

Pinterest's 2026 mobile app uses a four-tab bottom bar (Home, Search, Notifications, Profile) with a center Create/Snap action. The bar hides on downward scroll and reappears on upward scroll, maximising media canvas. Search was promoted into the main bar, replacing the older hamburger-overflow pattern. Pinterest's IA is deliberately shallow at the top — the home feed absorbs the "Following" tab and topic carousels as horizontal sub-feeds rather than as separate top-level destinations. The takeaway: **absorb sibling feeds into a primary surface rather than multiplying tabs.** Pinterest also learned the hard way that icon-only tabs (no labels) destroy discoverability — they added labels back after the 2017-era label-less experiment generated sustained confusion. ThryftVerse currently runs `tabBarShowLabel: false` (`TabNavigator.tsx:220`); this is the same anti-pattern Pinterest abandoned.

### Snapchat — the three-tab simplification

Snapchat's "Simple Snapchat" redesign collapsed five tabs (Map, Chat, Camera, Stories, Spotlight) into **three**: Chat (absorbing Map and Stories), Camera (center, enlarged), and Spotlight/For-You. The center camera button was enlarged based on Fitts's Law — a bigger target in the thumb-optimal center position reduces acquisition time and error rate. The redesign explicitly acknowledged that five tabs diluted the camera, which is Snapchat's core action. The principle: **the number of tabs should equal the number of genuinely primary destinations, not the number of features the org wants to surface.**

### eBay — ecommerce's four-to-five tab discipline

eBay's mobile app holds to a disciplined four-to-five tab bar (Home, Search, Cart/Deals, Activity, Profile). The center slot is reserved for the highest-intent commercial action. Deep category trees are pushed into a dedicated category hub screen, not crammed into the bar. eBay's 2026 component work on the Menu primitive (evo-web issue #481) reinforces a key boundary: **a menu is for context-specific actions, not for primary navigation.** ThryftVerse's current Create "tab" is an action masquerading as a navigation destination — the codebase already acknowledges this (`TabNavigator.tsx:286-308`, `listeners: { tabPress: e => e.preventDefault() }`), but the IA still allocates it a full tab slot.

### The thumb zone — the non-negotiable ergonomic constraint

Steven Hoober's research, reaffirmed in 2026 Timothy Graf analyses, shows that 75% of users hold their phone one-handed and that the comfortable thumb zone covers ~48% of the screen, concentrated in the lower-center. The center-bottom position is the single most reachable point for both left- and right-handed users. The far-left and far-right tabs require thumb extension on large phones. This is why the center slot is reserved for the primary action (Snapchat camera, Instagram Reels, ThryftVerse Create). The 2026 consensus: **3–5 tabs, center slot = primary action, 44pt minimum targets, labels visible, gesture nav as a supplement not a replacement.**

---

## 2. Psychology & Principles

### Wayfinding and the stable-nav contract

Navigation is wayfinding. The user forms a spatial mental model of the app on first use and relies on that model being stable on every subsequent session. When the tab bar moves, hides unpredictably, or changes its item set, the user must rebuild the model — this is extraneous cognitive load spent on the interface rather than the task. The 2026 Timothy Graf measurement-led methodology states it plainly: "Navigation controls should appear in the same position across every page and every state of the application. When the tab bar, hamburger menu trigger, or back button moves, users must re-establish their mental model." The corollary for ThryftVerse: the tab bar must be positionally stable, and any hide-on-scroll behaviour must be deterministic (downward scroll hides, upward scroll reveals — never random).

### Cognitive load and the 7±2 rule

Miller's 7±2 working memory limit is the structural reason every platform guideline caps bottom navigation at 3–5 items. Android's Material 3 spec explicitly states the navigation bar holds "three to five navigation destinations across the same hierarchy level." Beyond five, the user must scan rather than recognise, and scan time grows with item count. ThryftVerse's current five-tab bar (Home, Explore, Create, Inbox, Profile) sits at the upper bound — but one of those five (Create) is not a destination at all, it is an action. The effective destination count is four, which is healthy. The problem is not tab count per se; it is that the tab bar's IA does not match the app's actual information architecture, and the stack above the tabs carries ~150 routes with no intermediate grouping.

### Habit formation via stable navigation

Habits form through cue–routine–reward loops with stable cues. The tab bar is the cue. If the user learns that "the second icon from the left is Explore," that knowledge must hold tomorrow. Instagram's March 2026 redesign broke this contract by moving Create to the top-left and swapping Reels into center — users reported disorientation for weeks. ThryftVerse should treat tab reordering as a last resort, justified only by usage data showing the current order is materially wrong.

### Recognition over recall

Icons without labels force recall (what does this glyph mean?); icons with labels enable recognition (I can read "Explore"). Pinterest's label-less experiment and subsequent reversal is the canonical case study. ThryftVerse's `tabBarShowLabel: false` (`TabNavigator.tsx:220`) forces recall for every tab. The `tabBarAccessibilityLabel` props compensate for screen readers but not for sighted users. This is a direct violation of the recognition-over-recall principle and should be corrected.

### The thumb zone as an IA constraint, not a convenience

The thumb zone is not a styling preference — it is a physical constraint that shapes IA. When primary actions sit outside the comfortable zone, the user spends cognitive resources on reach rather than task. The 2026 guidance: bottom 40% of the screen is the easy zone; the center-bottom is the optimal point; top corners are the hard zone and should hold only low-frequency actions (settings, overflow). ThryftVerse's Create button at 52pt hit area in the center slot (`TabNavigator.tsx:36-37`) is correctly placed. The problem is that many stack screens push their primary actions into top-right header buttons, which are in the hard-to-reach zone on large phones.

---

## 3. Current ThryftVerse Audit

### 3.1 The root stack is a 150-route monolith

`AppNavigator.tsx` registers **163 `Stack.Screen` entries** (line count via grep) in a single flat `createNativeStackNavigator<RootStackParamList>()`. `types.ts` declares **~150 top-level routes** in `RootStackParamList` (lines 92–435), plus 5 tab routes in `TabParamList` (lines 437–443). There is no intermediate grouping — no sub-stacks for Marketplace, Co-Own, Chat, Creator, Settings, or Wallet. Every screen is a sibling of every other screen at the root level. This has concrete consequences:

- **Deep linking is sparse.** `linking.ts` maps only **~34 routes** to public URL paths (grep count of `: '` in `linking.ts`). Of ~150 stack routes, roughly 116 are not deep-linkable. The `linking.ts` header comment (lines 31–34) acknowledges this: "Screens that are intentionally omitted from this map (auth, creation flows, settings sub-screens, etc.) are not reachable via public deep links." But the omission set is far larger than the comment implies — major surfaces like `SellerHub`, `InventoryManagement`, `Galleria`, `MoodboardHome`, `LiveShopping`, `YourAlgorithm`, and the entire Settings subtree are absent from the linking config.
- **Stack depth is unbounded.** Because every screen is a root sibling, a user can navigate Home → CategoryDetail → Browse → ItemDetail → Chat → UserProfile → Followers → … with no structural reset. The native-stack preserves the full back stack, so deep task-switching produces back stacks 8–10 screens deep. There is no `popToTop` discipline on tab switches.
- **Type safety is maintained but IA is not.** `types.ts` is well-typed (every route has a param shape), but the type system encodes a flat list, not a hierarchy. The `RootStackParamList` is a 343-line flat object literal.

### 3.2 The tab bar is chrome-heavy and label-less

`TabNavigator.tsx` configures the tab bar with:
- `tabBarShowLabel: false` (line 220) — forces recall, violates recognition-over-recall.
- `LiquidGlassBackdrop` with intensity 70–90 (lines 238–243) — applies iOS 26 Liquid Glass blur. This is the same treatment Instagram shipped and received backlash for. The blur is aesthetic, not functional, and risks legibility issues over busy media feeds.
- `position: 'absolute'` with `height: NAV_HEIGHT + insets.bottom` (lines 228–233) — the bar floats over content. There is no hide-on-scroll behaviour (`tabBarHideOnKeyboard: true` is the only hide trigger, line 221). The bar is always visible, which is good for wayfinding stability but means it occludes ~84pt of content at all times.
- 24pt icons (line 59) inside 28pt wraps (lines 352–358) — the visible glyph is 24pt, the wrap is 28pt, and the hit area is the default tab-item hit area. The `tabBarItemStyle` (lines 347–351) sets `paddingVertical: 0` but does not enforce a 44pt minimum target. The actual touch target depends on the navigator's default layout, which may be less than 44pt on the outer tabs.

### 3.3 The center Create action is well-placed but IA-confused

The Create button (`TabNavigator.tsx:286-309`) is the strongest part of the current implementation:
- It uses a custom `CreateTabButton` with spring-based press feedback (lines 130–172).
- 52pt hit area, 40pt visible control (lines 36–37) — correctly separates hit area from visible shape per §4.
- `accessibilityState={{ selected: false }}` (line 164) — correctly reports it as an action, not a destination.
- `listeners: { tabPress: e => e.preventDefault() }` (lines 304–308) — prevents the navigator from switching to the placeholder `View` component.

The IA confusion is that Create occupies a full tab slot in `TabParamList` (`types.ts:440`) and in the tab navigator's layout, but it is not a destination. This means the tab bar visually has 5 slots but functionally has 4 destinations + 1 action. The `linking.ts` config correctly marks it `Create: undefined` (line 51). The deeper issue: the Create action opens `CreatorStudio` as a modal (`TabNavigator.tsx:209-213`), but there are **three separate create entry routes** in the stack — `CreateCamera`, `CreatePoster`, `CreateLook`, and `CreatorStudio` — plus the `CreatePosterRedirect` and `CreateLookRedirect` wrappers. The create flow's IA is fragmented across multiple routes that should be consolidated.

### 3.4 No shared header primitive — 59 inline back buttons

`ScreenHeader.tsx` exists (`components/ui/ScreenHeader.tsx`, 128 lines) with four variants (`standard`, `large`, `minimal`, `modal`), proper 44pt back-button hit area (`Control.hit`, line 97), and accessibility labels. **It is used by zero screens** (grep for `ScreenHeader` in `src/screens` returns 0 matches). Instead, screens build their own headers inline — there are **59 inline back-button implementations** (`chevron-back` / `arrow-back` grep in `src/screens`) and **298 `navigation.goBack()` calls**. This means:
- Header height, padding, back-button position, title alignment, and right-action slot vary screen-to-screen.
- The back button's hit area is not consistently 44pt — each inline implementation picks its own size.
- The `ScreenHeader` primitive's `variant` system, subtitle support, and right-action slot are wasted.
- §4's "coherent action placement" and "consistent alignment" bars are not met at the navigation-chrome layer.

This is the single highest-leverage defect in the navigation department: a shared primitive exists but is unused, so every screen compensates independently.

### 3.5 Gesture navigation is partial

`AppNavigator.tsx` sets `gestureEnabled: true` on both push and modal screen options (lines 29, 37), which preserves iOS swipe-back. However:
- There is no swipe-between-tabs gesture. Users must tap the tab bar to switch tabs; there is no horizontal swipe to move between Home / Explore / Inbox / Profile.
- The `transparentSheetScreenOptions` (lines 42–48) sets `gestureEnabled: false` and `animation: 'none'` — the Filter sheet has no gesture dismiss, which is a UX regression versus a native bottom sheet.
- The `GestureHandlerRootView` is installed at the App root (`App.tsx:482`), so the infrastructure exists — it is just not used for tab-level or sheet-level gestures.

### 3.6 Deep linking coverage gaps and the profile normalisation

`openProfile.ts` is a well-designed normalisation layer (lines 34–45): it prevents the identity-contamination bug where `UserProfile` could swap to owner data by redirecting self-navigation to the `MyProfile` tab. This is a genuine IA correctness win. However:
- The `linking.ts` config does not include `MyProfile` / `Profile` as a deep-linkable destination for the public profile path — `UserProfile` is mapped to `user/:userId` (line 78), but there is no `me` path that resolves to the Profile tab for the signed-in user. A `thryftverse://me` link would not work.
- The `filter` function (line 41) excludes group-invite URLs from React Navigation and handles them manually in `App.tsx` (lines 280–384). This is correct but means the invite flow lives outside the typed navigation system — it uses `navigationRef.navigate('Chat', ...)` directly, bypassing the param-list types.
- `MoodboardEditor` and `GalleriaCollectionDetail` are mapped in `linking.ts` (lines 100, 103) but their parent surfaces (`MoodboardHome`, `Galleria`) are not — a user deep-linking to a moodboard lands on the editor with no way to get back to the moodboard home.

### 3.7 The command palette is a parallel navigation system

`AppNavigator.tsx` renders a global `CommandPalette` (line 360) and a dev-only `CommandPaletteTrigger` FAB (lines 372–386). The `screenListeners.focus` callback (lines 108–123) registers recently visited screens for the palette's "Recent" section. This is a power-user navigation layer that sits on top of the tab/stack system. It is well-built but introduces a second mental model: the user can navigate via tabs (visual, spatial) or via the palette (textual, temporal). The palette should complement, not compensate for, weak IA — if the tab/stack IA were clearer, the palette's role would narrow to power-user acceleration rather than serving as a workaround for discoverability gaps.

---

## 4. Micro Improvements

These are low-risk, high-visibility changes that do not alter the IA structure:

1. **Restore tab labels.** Set `tabBarShowLabel: true` with a compact 10pt label below each icon (`TabNavigator.tsx:220`). Use the existing `Typography.family.medium` at 10pt. This single change converts recall to recognition and aligns with Pinterest's post-experiment convention. Keep labels for the 4 destination tabs; the Create action button remains label-less (it is an action, not a destination).

2. **Enforce 44pt minimum touch targets on all tab items.** The current `tabBarItemStyle` (`TabNavigator.tsx:347-351`) sets `paddingVertical: 0` without a minimum height. Add `minHeight: 44` to `tabBarItemStyle` and verify the outer tabs meet the 44pt target on common device widths. The Create button already exceeds this (52pt).

3. **Add deterministic hide-on-scroll for the tab bar.** Implement a scroll-direction listener that hides the bar on downward scroll and reveals it on upward scroll, matching Pinterest and Instagram 2026 behaviour. Use Reanimated's `useAnimatedStyle` to translate the bar below the screen edge. Respect `useMotionConfig` for reduced-motion users (instant show/hide instead of slide). This reclaims ~84pt of content canvas on long feeds without sacrificing wayfinding stability.

4. **Adopt `ScreenHeader` as the canonical header primitive.** Migrate the 59 inline back-button implementations to use `ScreenHeader` from `components/ui/ScreenHeader.tsx`. Start with the highest-traffic screens (ItemDetail, CategoryDetail, Chat, UserProfile, Settings, Wallet). This enforces consistent 44pt back-button hit area, consistent title alignment, and a consistent right-action slot. The primitive already supports the four variants needed.

5. **Add swipe-between-tabs gesture.** Wrap the tab navigator's screen content in a horizontal pan gesture that calls `navigation.navigate('MainTabs', { screen: adjacentTab })` on swipe completion. This gives thumb-zone users a gesture alternative to tapping the far-left or far-right tab. Keep the tab bar visible during the gesture so the user sees the active tab change.

6. **Enable gesture dismiss on the Filter sheet.** Change `transparentSheetScreenOptions` (`AppNavigator.tsx:42-48`) from `gestureEnabled: false` to `gestureEnabled: true`, and replace `animation: 'none'` with a slide-up animation. This restores the native bottom-sheet dismiss expectation.

7. **Expand deep-link coverage for major surfaces.** Add linking paths for `SellerHub` (`seller`), `Galleria` (`galleria`), `MoodboardHome` (`moodboards`), `LiveShopping` (`live`), `YourAlgorithm` (`algorithm`), and the Settings subtree (`settings/*`). This closes the gap where ~116 of ~150 routes are not deep-linkable.

8. **Add `popToTop` on tab re-tap.** When the user taps the already-active tab, pop the current tab's stack to the root. This is standard Instagram/Pinterest behaviour and prevents deep back-stack accumulation. Implement via the `tabPress` listener in `TabNavigator.tsx:248-263`.

---

## 5. Macro Improvements

### 5.1 IA restructure — group the 150-route monolith into domain sub-stacks

The root stack should be restructured from a flat 150-route list into a small set of domain sub-stacks, each owned by a clear information domain:

```
RootStack
├── AuthStack        (AgeVerification, Onboarding, AuthLanding, Login, SignUp, ForgotPassword)
├── MainTabs         (Home, Explore, Inbox, Profile + center Create action)
├── MarketplaceStack (CategoryDetail, Browse, ItemDetail, Closet, CollectionDetail, CategoryTree, Filter, GlobalSearch)
├── AuctionStack     (AuctionHome, Auctions, AuctionDetail, CreateAuction, MyBids, SellerAuctionCentre)
├── CoOwnStack       (CoOwnHub, AssetDetail, AssetDueDiligence, Trade, Portfolio, Buyout, CorporateActionDetail, ...)
├── ChatStack        (Chat, Inbox, CreateGroupChat, GroupChat, GroupChatInfo, GroupMembers, BotDirectory, ...)
├── CreatorStack     (CreatorStudio, CreatorDraftList, OutfitBuilder, LookDetail, CreateCamera, CreateLook, CreatePoster, ...)
├── WalletStack      (Wallet, SellerEarnings, WalletConvert, WalletActivity, Withdraw, BalanceHistory, AddBankAccount, MyOrders, OrderDetail)
├── SellerStack      (SellerHub, Sell, MyListings, InventoryManagement, SellerAnalytics, SellerFulfilment, BulkListing, ...)
├── SettingsStack    (Settings, AccountSettings, PrivacySettings, ChatSettings, NotificationPreferences, ...)
└── ModalStack       (PosterViewer, CreatePosterHighlight, Report, WriteReview, ListingPreview, TradeConfirm, ...)
```

Each sub-stack is a `createNativeStackNavigator` with its own param list. The root stack holds only the sub-stack navigators and the few genuinely global modal routes. This reduces the root stack from ~150 siblings to ~11, makes the IA legible in the type system, and enables per-domain deep-link prefixes (e.g. `thryftverse://marketplace/product/:itemId`, `thryftverse://co-own/asset/:assetId`).

**Risk:** This is a large refactor that touches `types.ts`, `AppNavigator.tsx`, `linking.ts`, and every `navigation.navigate()` call that crosses domain boundaries. It must be rolled out incrementally — extract one sub-stack at a time, preserving all existing `navigate()` calls via compatibility aliases. The `openProfile.ts` normalisation pattern is the model: extract a boundary, preserve the call surface.

### 5.2 Tab system — formalise the 4-destination + 1-action model

The current tab bar has 5 slots but only 4 destinations. Formalise this:
- **TabParamList** should declare 4 destinations: `Home`, `Explore`, `Inbox`, `Profile`. Remove `Create` from `TabParamList` — it is not a destination.
- The Create action should be rendered as a custom element overlaid on the tab bar center, not as a `Tab.Screen`. This eliminates the `e.preventDefault()` hack (`TabNavigator.tsx:304-308`) and the placeholder `View` component (line 288).
- The tab bar's visual layout becomes 4 equal-width destination slots with a center action button that sits between slots 2 and 3, visually elevated. This matches Snapchat's 2026 three-tab + center-camera model and Instagram's center-slot pattern.

### 5.3 Header primitive — make `ScreenHeader` the enforced standard

The `ScreenHeader` component already supports the needed variants. To make it the enforced standard:
- Add a `useScreenHeader` hook or a `ScreenHeaderConfig` context that lets screens declare their header declaratively (title, variant, right-action, back-behaviour) without rendering the header JSX inline.
- Add a `large` variant for discovery surfaces (Home, Explore, Galleria) with a scroll-collapsing behaviour that shrinks the large title to the standard height on scroll, matching iOS 26 large-title convention.
- Add a `modal` variant with a close (X) button instead of a back chevron, for modal-presented screens.
- Enforce usage via an ESLint rule or a render audit that flags inline `chevron-back` usage outside `ScreenHeader`.

### 5.4 Gesture language — define and document the app's gesture vocabulary

Establish a written gesture vocabulary so all screens use gestures consistently:
- **Edge swipe (left edge):** back navigation (already enabled via `gestureEnabled: true`).
- **Horizontal swipe on tab content:** switch between adjacent tabs.
- **Swipe down on modal/sheet:** dismiss (restore for Filter sheet, enable for all bottom sheets).
- **Long press on tab icon:** show tab-specific quick actions (e.g. long-press Explore → recent searches).
- **Pull down on feed:** refresh.
- **Swipe up on Create button:** open Create mode selector (Look / Poster / Visual Search) — currently only long-press is wired.

All gestures must have a tappable alternative per the 2026 accessibility consensus (UXPin, Mobile App Wiki). Reduced-motion users get instant transitions instead of animated slides.

### 5.5 Deep linking — universal coverage and typed path contracts

- **Achieve universal deep-link coverage** for every public-facing route. Every screen that a user could reach via a shared link, notification, or external referral should have a path in `linking.ts`. The current ~34/150 coverage should move to ~120/150 (the remaining ~30 are internal-only flows: auth, creation intermediates, dev tools).
- **Add a `me` deep link** that resolves to the Profile tab for the signed-in user, complementing the `user/:userId` path for public profiles. The `openProfile.ts` normalisation should be extended to the linking layer so `thryftverse://me` and `thryftverse://user/<own-id>` both land on the Profile tab.
- **Add deferred deep linking** for first-launch users. When a user installs the app from a deep link, the link should be preserved through onboarding/auth and resolved after login. The current `App.tsx` invite-token handling (lines 280–384) is the pattern — generalise it to all deep links.
- **Type the path contracts.** Generate `linking.ts` path mappings from `types.ts` so a route cannot be added without a linking decision. A build-time check should flag routes that are in `RootStackParamList` but not in `linking.ts` (with an explicit `// internal` annotation for the exception list).

---

## 6. Flagship Acceptance Criteria

A flagship navigation system for ThryftVerse must satisfy all of the following:

1. **Tab bar:** 4 destination tabs + 1 center Create action. Labels visible on all 4 destinations. 44pt minimum touch target on every tab item. Center Create button at 52pt hit area, 40pt visible control, spring press feedback, accessibility state `selected: false`.
2. **Tab bar material:** Liquid Glass blur with a legible fallback (solid surface) when blur is unavailable or when content behind the bar would harm legibility. Deterministic hide-on-scroll with reduced-motion fallback.
3. **Stack structure:** Root stack holds ≤12 navigators (sub-stacks + MainTabs + global modals). No flat 150-route monolith. Each sub-stack has its own typed param list.
4. **Header primitive:** `ScreenHeader` is the canonical header. Zero inline `chevron-back` implementations outside the primitive. Four variants (`standard`, `large`, `minimal`, `modal`) with scroll-collapsing large title and close-button modal variant. 44pt back-button hit area enforced.
5. **Gesture language:** Edge-swipe back (enabled), horizontal swipe between tabs, swipe-down dismiss on all sheets, long-press tab quick actions. Every gesture has a tappable alternative. Reduced-motion respected on all transitions.
6. **Deep linking:** ≥120 of ~150 routes have public URL paths. `me` path resolves to Profile tab. Deferred deep linking preserves the link through onboarding/auth. Path mappings are generated/validated against `types.ts` at build time.
7. **Profile normalisation:** `openProfile` handles self-vs-other routing at both the navigation and linking layers. No path exists for `UserProfile` to mount with owner data.
8. **Back-stack discipline:** Tab re-tap performs `popToTabRoot`. Cross-domain navigation resets the source tab's stack to root on return. Maximum practical back-stack depth is 5–6 screens.
9. **State coverage:** Loading, empty, error, offline, and permission-denied states are designed for every tab destination. The tab bar itself has a stable state across all of these (it never disappears except via deterministic scroll-hide).
10. **Truthful UI (§11):** Every tab leads to a real destination. The Create action performs a real action. No tab or header control produces "Coming soon" or dead-end navigation.

---

## 7. Priority & Sequencing

### Phase 1 — Quick wins (1–2 days, no IA change)
1. Restore tab labels (`tabBarShowLabel: true`, 10pt label).
2. Enforce 44pt minimum touch targets on tab items.
3. Enable gesture dismiss on Filter sheet.
4. Add `popToTop` on tab re-tap.
5. Adopt `ScreenHeader` on the top 10 highest-traffic screens.

### Phase 2 — Tab system formalisation (2–3 days)
1. Remove `Create` from `TabParamList`; render it as an overlay action button.
2. Add deterministic hide-on-scroll with reduced-motion fallback.
3. Add swipe-between-tabs gesture.
4. Add Liquid Glass legibility fallback.

### Phase 3 — Header primitive rollout (3–5 days)
1. Migrate all 59 inline back-button screens to `ScreenHeader`.
2. Add `large` variant with scroll-collapsing title.
3. Add `modal` variant with close button.
4. Add ESLint/render audit for inline header usage.

### Phase 4 — Deep linking expansion (2–3 days)
1. Add linking paths for all major surfaces (SellerHub, Galleria, MoodboardHome, LiveShopping, YourAlgorithm, Settings subtree).
2. Add `me` deep link with `openProfile` normalisation at the linking layer.
3. Implement deferred deep linking for first-launch users.
4. Add build-time validation of `linking.ts` against `types.ts`.

### Phase 5 — IA restructure (5–10 days, highest risk, highest leverage)
1. Extract `MarketplaceStack` first (highest traffic domain).
2. Extract `ChatStack`, `WalletStack`, `SettingsStack` (well-bounded domains).
3. Extract `CoOwnStack`, `AuctionStack`, `CreatorStack`, `SellerStack`.
4. Update `linking.ts` to use nested path prefixes per sub-stack.
5. Add compatibility aliases for all cross-domain `navigate()` calls.
6. Verify back-stack depth is bounded after restructure.

### Phase 6 — Gesture vocabulary documentation (1 day)
1. Write the gesture vocabulary doc.
2. Audit all screens for gesture consistency.
3. Ensure every gesture has a tappable alternative.

**Sequencing rationale:** Phases 1–2 deliver visible quality improvements with minimal risk and should ship first. Phase 3 is mechanical but high-volume. Phase 4 is independent and can run in parallel with Phase 3. Phase 5 is the structural refactor — it depends on Phases 1–4 being stable (header primitive adopted, tab system formalised, linking expanded) so the restructure does not destabilise in-flight work. Phase 6 is documentation that codifies the final state.

---

*Research sources: PiunikaWeb (Instagram Liquid Glass, Feb 2026), Social Media Today (Instagram Reels emphasis), Storrito (Instagram March 2026 redesign analysis), GB News (Instagram iOS user backlash), Search Engine Journal (Pinterest mobile refresh), WERSM (Pinterest immersive design), Medium / ppati000 (Pinterest tab bar anti-pattern), The Verge (Snapchat Simple Snapchat three-tab redesign), LinkedIn / Sarath A (Snapchat Fitts's Law redesign), Ecom Design Pro (mobile bottom navigation ecommerce 2026), UXPin (mobile navigation 2026 best practices), Nitrous Design (tab navigation guidelines), Android Developers (layout and navigation patterns), Timothy Graf (cognitive load in mobile IA, thumb zone architecture 2026), Mobile App Wiki (gesture navigation guide), developerux (mobile breadcrumbs 2026), tolinku (State of Deep Linking 2026), Information Architecture Authority (IA for mobile applications).*
