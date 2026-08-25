# ThryftVerse Flagship Upgrade — Navigation Chrome

**Component:** Headers, tab bars, back buttons, screen headers, and all navigation-related chrome
**Research date:** August 2026
**Benchmark window:** Pinterest, Instagram, Depop, Vinted, eBay Evo, Snapchat — public product imagery and announcements available July–August 2026
**Codebase audited:** `frontend/src` on the active ThryftVerse upgrade branch

---

## 1. 2026 Competitor Benchmark — Navigation Chrome

The dominant 2026 navigation-chrome story across every benchmark app is the same: **chrome recedes, content leads.** Headers shrink, become transparent over media, or disappear entirely. Tab bars lose labels and adopt floating glass materials. Back navigation migrates from visible buttons to edge-swipe gestures. The visible chrome that remains is quieter, smaller, and more optically aligned than ever.

### Instagram — Liquid Glass tab bar and DM-centric restructure

Instagram completed the most visible navigation-chrome shift of 2026. In February–March 2026, Instagram rolled out a permanent bottom-navigation redesign that moved the Create button out of the center tab to the top-left corner, and placed Reels in the center with DMs in the second-most-prominent position. The new tab order is **Home → Reels → DMs → Search → Profile** — a structure that reflects where engagement actually lives (DMs and Reels drove nearly all recent Instagram growth per CEO Adam Mosseri's October 2025 announcement) [https://www.inro.social/blog/instagram-tabs-new-layout-2025] [https://storrito.com/resources/what-instagrams-navigation-redesign-actually-changed/].

Simultaneously, Instagram began deploying iOS 26's **Liquid Glass** material to its bottom navigation bar. Instead of a flat, edge-to-edge dark or light strip pinned to the bottom edge, the navigation elements now float inside a translucent, pill-shaped container that hovers slightly above the bottom edge. The bar is cleaner, more immersive, and lets content scroll visibly behind the frosted-glass material — directly mirroring the system-wide design language Apple introduced with iOS 26 [https://piunikaweb.com/2026/02/13/instagram-liquid-glass-navbar-update-whatsapp-delay/].

Key chrome lessons from Instagram 2026:
- **Tab bar labels are gone.** Icons-only, 24pt, with a clear active/inactive tint contrast. The profile tab uses the user's avatar instead of a person icon — identity replaces abstraction.
- **Create is an action, not a destination.** It lives in the top-left corner as a visible glyph, not in the tab bar. Pressing it opens a modal overlay and does not change the active tab.
- **The bar floats.** Content scrolls behind the translucent glass material. There is no opaque divider between content and navigation.
- **Swipe-to-switch tabs.** Instagram added horizontal swipe gestures to move between adjacent tabs, supplementing direct taps with gesture-based navigation [https://marketing4ecommerce.net/en/instagram-new-navigation-menu/].

### Pinterest — invisible chrome, media as the surface

Pinterest's 2026 navigation chrome is the most aggressively minimal in the benchmark set. The guiding principle is that **the image is the surface** — there is no visible card shell, no header band, no tab bar background. The search bar sits at the top as a transparent pill that adopts a subtle scrim only when content scrolls beneath it. The bottom tab bar (Home, Search, Create, Notifications, Profile) is icon-only with no labels and no visible bar background on media surfaces [https://help.pinterest.com/en/article/discover-ideas-on-pinterest].

Pinterest's 2026 visual-search reimagining (announced May 2026) reinforced the "chrome recedes" principle: the camera/Lens entry is embedded inside the search affordance, not as a separate floating button. When the user engages visual search, the header chrome dissolves entirely and the camera viewfinder becomes the full screen [https://www.linkedin.com/posts/pinterestdesign_at-pinterest-we-know-inspiration-often-starts-activity-7463348751752159233-st49].

Key chrome lessons from Pinterest 2026:
- **Transparent header over media.** The search bar floats over the masonry with no opaque background until scroll requires it.
- **No visible tab bar container.** Icons sit directly on the canvas with active/inactive tint as the only state signal.
- **Camera/visual-search lives in the search affordance**, not as a separate chrome element.
- **The closeup view has no header at all** — a close (X) button floats over the image with a gradient scrim, and back is handled by edge-swipe.

### eBay Evo — simplified marketplace chrome

eBay's Evo design system (publicly documented in the eBay Playbook, 280+ pages of guidance) represents a significant chrome simplification for a marketplace that historically suffered from dense, chrome-heavy headers. Evo's approach is "humanize and simplify" — cleaner headers, pill buttons sized for thumbs, one commerce blue, and accessibility embedded directly into components [https://innovation.ebayinc.com/stories/ebay-evo-the-evolution-of-ebays-brand-and-design-system/] [https://www.designsystems.one/design-systems/ebay-design].

Key chrome lessons from eBay Evo 2026:
- **Pill buttons for primary actions** in headers, sized for thumb reach (44pt minimum).
- **Minimal header chrome** — logo + search + cart, no decorative elements.
- **Accessibility is structural**, not an audit afterthought. Every component ships with accessibility annotations.

### Snapchat — gesture-native, chrome-minimal

Snapchat has always been gesture-native, and its 2026 chrome continues this tradition. The app relies heavily on edge-swipe navigation between its three primary surfaces (Chat, Camera, Stories/Discover). There is no persistent bottom tab bar in the traditional sense — navigation is gesture-driven with minimal visible chrome. Headers appear only when needed and dissolve during immersive media consumption.

### Cross-app synthesis — the "chrome recedes" principle

Every benchmark app in 2026 follows the same principle: **navigation chrome should be felt, not seen.** The specific tactics vary:

| App | Tab bar | Header over media | Back navigation | Create/action |
|-----|---------|-------------------|-----------------|---------------|
| Instagram | Floating Liquid Glass, icon-only, no labels | Transparent with scrim on scroll | Edge-swipe + minimal chevron | Top-left glyph, not in tab bar |
| Pinterest | No visible container, icon-only | Transparent, dissolves on closeup | Edge-swipe + floating close | In search affordance |
| eBay Evo | Bottom nav, pill buttons | Solid minimal header | System back + chevron | Separate flow |
| Snapchat | Gesture-driven, no traditional tab bar | Dissolves during media | Edge-swipe primary | Camera is the home screen |

The universal lesson: **chrome is infrastructure, not decoration.** When chrome dominates the silhouette, the screen fails the squint test. When chrome recedes, media and content lead, and the product feels premium.

---

## 2. Psychology & Principles

### Wayfinding and the "invisible header" principle

Navigation chrome serves one primary psychological function: **wayfinding** — the user's ability to know where they are, where they came from, and where they can go. But wayfinding does not require visually dominant chrome. In fact, the most effective wayfinding is **subconscious**: the user knows where they are without consciously reading a header or looking at a tab label.

The "invisible header" principle states that **a header succeeds when the user never notices it.** The header's job is to provide just enough context (a title, a back affordance, a contextual action) that the user's attention remains on content. When a header is visually loud — heavy background, large title, decorative elements, multiple action buttons — it competes with content for attention and increases cognitive load.

This is why Instagram, Pinterest, and Snapchat all trend toward transparent or minimal headers in 2026. The header provides orientation without demanding attention. The user's eye stays on media.

### "Chrome recedes, content leads"

This is the foundational composition principle for navigation chrome, directly from ThryftVerse Design.md's Native Platform Contract: "Prefer clarity, deference and depth: content leads, chrome recedes" (Design.md, iOS section, line 1218). The AGENTS.md squint test operationalizes this: "blur or squint at the screen; media/identity/content should dominate, while navigation and utility chrome recede" (AGENTS.md §4, line 242).

Psychologically, this principle reduces **cognitive load**. Every visible chrome element is a piece of information the user's visual system must process. When chrome is minimal, the user's limited attention budget is spent on content — the actual product value — rather than on navigation infrastructure. Cognitive fluency research (documented in AGENTS.md §27.1) confirms that easy-to-process interfaces feel premium: "Reduce visual noise, maintain clear hierarchy, use consistent patterns. Generous whitespace signals confidence" (AGENTS.md, line 939).

### Cognitive load reduction

Navigation chrome is the most frequently seen UI in the app. The user sees the tab bar and header on every screen. If this chrome is inconsistent — different header patterns on different screens, varying back-button styles, sometimes labels sometimes not — the user's brain must re-process the chrome on every screen transition. This is **recognition over recall** in reverse: instead of a stable, recognizable pattern that the brain filters out, inconsistent chrome forces active recognition on every screen.

Stable navigation chrome enables **habit formation**. When the tab bar is always in the same place, always uses the same icons, always has the same active-state grammar, the user develops muscle memory. Switching tabs becomes automatic. Going back becomes automatic. The user stops thinking about navigation and starts thinking about content. This is the behavioral level of Don Norman's emotional design (AGENTS.md §27.1, line 936): "How it functions and performs. Driven by: gesture responsiveness, spring physics, haptic grammar, state predictability."

### Thumb zone and ergonomic truth

The thumb zone is the single most important ergonomic constraint for navigation chrome. Steven Hoober's research identifies three grip zones: the easy zone (bottom third), the stretch zone (middle third), and the hard zone (top third). On phones over 6 inches — the majority of 2026 devices — the hard zone carries a significant usability penalty [https://timgraf.com/ux-design/designing-for-the-thumb-zone-a-modern-guide-to-mobile-ux-that-respects-human-anatomy/].

This has direct implications for navigation chrome:
- **Bottom tab bars are ergonomically correct.** They sit in the easy zone where the thumb naturally rests. This is why every benchmark app uses a bottom tab bar for primary navigation.
- **Top-left back buttons are ergonomically hostile.** The top-left corner is the hardest-to-reach point on the screen for right-handed users (who are ~75% of the population). This is why iOS edge-swipe back is not a luxury — it is an ergonomic necessity [https://medley.ltd/blog/its-just-a-back-button-until-you-drop-your-phone/].
- **Header action buttons in the top-right are stretch-zone elements.** They should be reserved for contextual actions the user needs occasionally, not primary actions.

The thumb zone also explains why **gesture navigation is not optional in 2026**. Both iOS and Android have committed to gesture-based navigation as the default. iOS uses a left-edge swipe for back; Android uses both left and right edges [https://mobileapp.wiki/en/uiux/gesture-navigation-guide]. Apps that disable gesture navigation or fail to support system back are fighting both ergonomics and platform convention.

### Recognition over recall

Navigation chrome should rely on **recognition** (the user sees a familiar icon and knows what it does) rather than **recall** (the user must remember what an unfamiliar icon means). This is why standard navigation glyphs — chevron-back, close (X), search magnifier, home, profile — are powerful. They are instantly recognizable across every app the user has ever used. Novelty symbols do not replace clear product language (AGENTS.md §4, line 232).

For tab bars, this means using destination-naming icons (Home, Search, Profile) rather than action-naming icons (Create, Boost, Try AI). As the iOS tab bar UX guide notes: "'Home,' 'Library,' 'Search,' and 'Profile' tend to work because they describe destinations, not actions. 'Create,' 'Boost,' or 'Try AI' usually belong elsewhere" [https://uiuxdesigning.com/ios-tab-bar/].

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Defect 1: ScreenHeader primitive is used by 0 screens

The `ScreenHeader` component (`frontend/src/components/ui/ScreenHeader.tsx`) is a well-structured header primitive with four variants (standard, large, minimal, modal), proper 44pt hit targets (`Control.hit`), accessibility labels, haptic feedback, and a clean back-button + title + right-action layout. It was audited at line 22–85.

A grep for `ScreenHeader` across `frontend/src/screens` returns **0 matches**. The component exists but is not consumed by any production screen. This is a dead primitive — the codebase has a header system that no screen uses.

### Defect 2: FlagshipHeader is the de facto header, used 279 times in screens

The `FlagshipHeader` component (`frontend/src/components/flagship/FlagshipHeader.tsx`) is the actual production header. A grep for `FlagshipHeader` across `frontend/src/screens` returns **279 matches**, and across all of `frontend/src` returns **308 matches**. This is the dominant header primitive.

FlagshipHeader is well-built — it supports pushed/modal/large variants, has proper hit targets, accessibility labels, haptic feedback, avatar support, title-press handling, and large-title collapse progress. However, it has structural limitations:
- **No transparent-over-media variant.** The component has no `transparent` or `scrim` mode. It always renders with the screen's default background. There is no way to float the header over media with a gradient scrim, which is the standard pattern for profile covers, product-detail heroes, and media viewers in every benchmark app.
- **No search-header variant.** The component cannot embed a search field. Screens that need search in the header (Inbox, Explore, Home) build their own inline headers with custom `headerTitle` styles (see InboxScreen.tsx line 152, CheckoutScreen.tsx line 253, OrderDetailScreen.tsx line 711).
- **Title is always center-aligned.** FlagshipHeader centers the title (line 162: `textAlign: 'center'`). iOS large-title convention and Android Material convention both use left-aligned titles. Center-aligned titles are a web pattern, not a native mobile pattern.

### Defect 3: 322 inline back-button / goBack references across screens

A grep for `chevron-back|onBack\(|navigation\.goBack|navigation\.pop` across `frontend/src/screens` returns **322 matches**. Many of these are inline back buttons built per-screen rather than using a shared primitive. This produces:
- **Inconsistent back-button geometry.** Some screens use `Control.hit` (44pt), some use arbitrary sizes, some use `hitSlop` instead of a proper 44pt target.
- **Inconsistent back-button icons.** Some use `chevron-back`, some use `arrow-back`, some use `close` for modal dismissal with no consistent rule.
- **Inconsistent accessibility labels.** Some say "Go back", some say "Close", some have no accessibility label at all.
- **No consistent back-vs-close grammar.** The distinction between Back (hierarchical pop) and Close (modal dismissal) is not enforced system-wide. FlagshipHeader handles this at line 49 (`effectiveBackIcon = backIcon ?? (isModal ? 'close' : 'chevron-back')`), but inline back buttons do not follow this rule.

### Defect 4: Label-less tab bar with no accessibility labels for sighted users

The tab bar (`frontend/src/navigation/TabNavigator.tsx`) sets `tabBarShowLabel: false` (line 220) and provides `tabBarAccessibilityLabel` per tab (lines 273, 283, 322, 334). This is correct for accessibility (screen readers announce the label), but **sighted users get no text label**. The 2026 benchmark apps (Instagram, Pinterest) also use icon-only tab bars, but they compensate with universally recognizable icons (home, search, profile avatar). ThryftVerse's tab bar uses:
- Home: `home` / `home-outline` (line 271)
- Explore: `search` / `search-outline` (line 281)
- Create: `add` in a filled circle (line 168)
- Inbox: `paper-plane` / `paper-plane-outline` (line 316)
- Profile: user avatar (line 332)

The `paper-plane` icon for Inbox is ambiguous — it reads as "send" or "share" to users unfamiliar with the pattern. Instagram uses `paper-plane` for DMs, but Instagram has trained billions of users on this mapping. ThryftVerse does not have that training effect. A sighted user seeing a paper-plane icon with no label may not recognize it as "Inbox/Messages."

### Defect 5: No transparent-over-media header system

There is no shared primitive for transparent headers that float over media with gradient scrims. Screens that need this pattern (profile cover, product-detail hero, media viewer, Poster viewer) each build their own inline solution or skip it entirely. The `PosterViewerScreen` uses `headerShown: false` (AppNavigator.tsx line 144) and handles its own chrome. The `VisualSearchScreen` also uses `headerShown: false` (line 256). The `LiveStreamViewer` and `LiveStreamSeller` screens use `headerShown: false` (lines 312–313).

This means every immersive media surface re-implements its own floating chrome from scratch, with no shared scrim geometry, no consistent close-button placement, and no consistent safe-area handling.

### Defect 6: Inconsistent header patterns across screens

The grep for `headerTitle` across `frontend/src` reveals at least **15 screens** with their own inline `headerTitle` style definitions (InboxScreen, CheckoutScreen, OrderDetailScreen, OrderReceiptScreen, WithdrawScreen, WalletConvertScreen, AddressFormScreen, MyOrdersScreen, CreateLookScreen, OutfitBuilderScreen, AIPoweredListingScreen, ConversationalSearchScreen, AssetDueDiligenceScreen, AIPhotoEnhancementScreen, CreatorDraftListScreen). Each defines its own font size, family, and color for the header title. These are not using FlagshipHeader — they are building custom headers inline.

This produces visible inconsistency: the Checkout header title has a different visual weight than the Order Detail header title, which has a different weight than the Inbox header title. The user sees different header typography on every screen, which breaks the stable-nav habit-formation principle.

### Defect 7: Chrome-heavy headers on content surfaces

Several screens build dense header chrome with multiple action buttons, custom layouts, and heavy visual weight. For example, `HomeScreen.tsx` (line 1111) has an animated `headerTitleWrap` with a custom `headerRight` (line 1115), and `LiveShoppingHomeScreen.tsx` (line 404) builds a custom `headerLeft` + `headerTitle` layout. These headers compete with content for visual attention, violating the "chrome recedes" principle.

### Defect 8: No gesture-nav layer beyond React Navigation defaults

AppNavigator.tsx correctly uses `createNativeStackNavigator` with `gestureEnabled: true` (line 29) for push screens and `gestureEnabled: true` (line 37) for modals. This preserves iOS swipe-back and Android system back. However, there is no additional gesture-nav layer for:
- **Swipe-to-switch-tab** (Instagram 2026 pattern).
- **Swipe-down-to-dismiss** on non-modal screens that would benefit from it.
- **Predictive back** on Android (Android 13+ API level 33) — the codebase does not opt into predictive back animations [https://developer.android.com/design/ui/mobile/guides/patterns/predictive-back].

### Defect 9: 999 back-navigation-related references (truncated count)

A broad grep for `chevron-back|onBack|goBack|navigation\.goBack|Back` across `frontend/src/screens` returned **999 matches** (truncated at the tool's max). This indicates back-navigation logic is deeply distributed across screens rather than centralized in a shared header primitive. Every screen manages its own back behavior, back icon, back accessibility label, and back haptic — producing massive inconsistency surface area.

---

## 4. Micro Improvements

### 4.1 Add a transparent variant to FlagshipHeader

Add a `variant: 'transparent'` to FlagshipHeader that:
- Renders no background fill.
- Overlays a gradient scrim (dark → transparent, top-to-bottom) behind the header.
- Switches icon/title colors to `colors.textInverse` (white) for legibility over media.
- Accepts a `scrimHeight` prop (default: header height + safe-area top + 40pt).
- Accepts a `onScrollProgress` prop (0→1) that fades the scrim in as content scrolls beneath, mirroring Instagram/Pinterest behavior.

### 4.2 Add a search-header variant to FlagshipHeader

Add a `variant: 'search'` that:
- Embeds a search field in the header area.
- Supports a left back/close button and a right action (camera for visual search, filter, etc.).
- Uses `colors.input` background for the field with `colors.border` 1px border.
- Transitions to a committed search mode on focus (field expands, back button becomes cancel).

### 4.3 Add left-aligned title option

Add a `titleAlign: 'center' | 'left'` prop. Default to `'left'` for pushed screens (iOS large-title convention) and `'center'` for modal screens. This aligns with both iOS HIG (left-aligned large titles) and Android Material (left-aligned titles).

### 4.4 Standardize back-vs-close grammar

Enforce the existing FlagshipHeader rule (`isModal ? 'close' : 'chevron-back'`, line 49) across all screens:
- **Pushed screens** use `chevron-back` with accessibility label "Go back".
- **Modal screens** use `close` (X) with accessibility label "Close".
- **Media viewers** use `close` (X) with a gradient scrim.
- Remove all `arrow-back` usage in favor of `chevron-back` for iOS consistency.

### 4.5 Add accessibility-visible labels to the tab bar

While keeping the visual icon-only design (matching 2026 benchmarks), add a `tabBarLabel` that is visually hidden but available to assistive technology. More importantly, reconsider the `paper-plane` icon for Inbox — either use a more universally recognizable icon (`chatbubble`/`chatbubble-outline`) or add a brief onboarding tooltip that teaches the mapping.

### 4.6 Centralize header title typography

Remove all per-screen `headerTitle` style definitions. FlagshipHeader should own the title typography via its variant system. Screens that currently define custom `headerTitle` styles should migrate to FlagshipHeader with the appropriate variant.

---

## 5. Macro Improvements

### 5.1 One-header primitive system

Consolidate `ScreenHeader` (dead, 0 usages) and `FlagshipHeader` (279 usages) into a single canonical header primitive. The consolidated header should support all variants:

| Variant | Use case | Title align | Background | Scrim |
|---------|----------|-------------|------------|-------|
| `pushed` | Standard hierarchical screen | Left | `colors.header` | None |
| `large` | iOS large-title scroll-collapse | Left (large → inline) | `colors.header` | None |
| `modal` | Modal sheet | Center | `colors.header` | None |
| `transparent` | Over media (profile cover, product hero, media viewer) | Left or center | Transparent | Gradient scrim |
| `search` | Search-entry screens | N/A (field) | `colors.header` | None |
| `minimal` | Chrome-less (actions only, no title) | N/A | Transparent | Optional |

Delete `ScreenHeader.tsx` after migration. Every screen uses the one primitive.

### 5.2 Tab bar system

The current tab bar is well-built (Liquid Glass backdrop, spring-animated Create button, avatar profile tab, badge counts). The macro improvements are:
- **Swipe-to-switch-tab gesture layer.** Add a horizontal swipe gesture on the tab navigator to switch between adjacent tabs, mirroring Instagram 2026 [https://marketing4ecommerce.net/en/instagram-new-navigation-menu/].
- **Tab bar hide-on-scroll refinement.** The current `tabBarHideOnKeyboard: true` (line 221) handles keyboard. Add scroll-based hide/show for content surfaces where the tab bar occludes content, using the existing `tabBarVisible` shared value from `TabScrollContext` (already wired in HomeScreen.tsx line 445).
- **Reconsider the Inbox icon.** Evaluate `chatbubble`/`chatbubble-outline` vs `paper-plane` for universal recognizability.

### 5.3 Back/close/overflow grammar system

Create a shared `NavAction` component family:
- `NavBack` — chevron-back, 44pt hit, transparent, "Go back" label, light haptic.
- `NavClose` — close (X), 44pt hit, transparent, "Close" label, light haptic.
- `NavOverflow` — ellipsis-horizontal, 44pt hit, transparent, "More options" label, opens a bottom sheet menu.
- `NavSearch` — search magnifier, 44pt hit, transparent, "Search" label.

All NavAction components:
- Default to transparent background (no visible circle/square).
- Show `colors.rowPressed` on press feedback only.
- Use 22–24pt glyph inside 44pt hit target (per AGENTS.md §4: "Separate hit area from visible shape").
- Accept a `tone: 'default' | 'inverse'` prop for use over media (inverse = white icon).

### 5.4 Transparent-over-media header system

Build a `MediaHeader` component (or a `transparent` variant on the consolidated header) that:
- Floats over media with a gradient scrim (0.55 → 0 opacity, top-to-bottom).
- Uses `colors.textInverse` for all icons and titles.
- Respects safe-area top inset.
- Fades in a solid background as the user scrolls (driven by `onScrollProgress`).
- Handles close (X) for media viewers and back (chevron) for hierarchical media surfaces (product detail with hero image).

### 5.5 Gesture navigation layer

- **Preserve existing iOS swipe-back** (already enabled via `gestureEnabled: true` in AppNavigator.tsx line 29).
- **Add Android predictive back support.** Opt into Android 13+ predictive back gestures so users get a visual preview of the back destination before committing [https://developer.android.com/design/ui/mobile/guides/patterns/predictive-back].
- **Add swipe-to-switch-tab** on the tab navigator.
- **Ensure Android system back matches visible hierarchy.** The native stack handles this, but screens with custom back logic (322 inline references) must be audited to ensure Android hardware/gesture back works correctly on every screen [https://auditbuffet.com/patterns/ab-001967].

---

## 6. Flagship Acceptance Criteria

### 6.1 "Chrome recedes, content leads"

- **Squint test:** On every screen, blurring the eyes reveals media/identity/content as the dominant visual story. Navigation chrome (headers, tab bars, back buttons) recedes into the background.
- **Thumbnail test:** At 25% scale, the primary content object and reading order remain obvious. Repeated header rectangles and tab bar containers do not dominate the silhouette.
- **Media-to-chrome ratio:** On media surfaces (feed, discovery, profile, product detail), media occupies >70% of the first viewport. Header + tab bar combined occupy <20%.

### 6.2 Icon grammar

- One icon family (Ionicons) across all navigation chrome.
- Standard navigation glyphs: 20–24pt.
- Stable outline/filled-state rule: inactive = outline, active = filled (or tint change).
- No novelty symbols replacing clear product language.
- Chevrons remain quieter than row values and never collide with them (Design.md, line 1074).

### 6.3 Hit area vs visible shape

- All navigation chrome controls: 44pt minimum hit target.
- Visible glyph: 20–24pt.
- No 44pt grey circle/square rendered merely to satisfy accessibility (AGENTS.md §4, line 227).
- Press feedback may temporarily reveal `colors.rowPressed`; resting state remains visually uncontained (Design.md, line 1084).
- Back, Close, search, overflow, camera, notifications: transparent 44pt targets by default (Design.md, line 1080).

### 6.4 Thumb zone

- Primary navigation (tab bar) in the bottom 30–40% of the screen (easy zone).
- Back navigation via edge-swipe gesture (not top-left button only).
- Header action buttons in the top-right (stretch zone) reserved for contextual actions, not primary actions.
- No critical action placed in the top-left hard zone without a gesture alternative.

### 6.5 Consistent header patterns

- One header primitive across all screens.
- Title typography owned by the primitive, not per-screen.
- Back/close grammar enforced: chevron-back for pushed, close (X) for modal.
- Transparent-over-media variant available and used on all media surfaces.
- Safe-area top inset respected on every header.

### 6.6 Stable navigation for habit formation

- Tab bar order stable across sessions.
- Tab bar icons stable (no A/B-tested icon swaps).
- Active/inactive tint contrast sufficient for recognition.
- Tab switch haptic consistent (already implemented: `haptic.patterns.tabSwitch()` in TabNavigator.tsx line 260).

---

## 7. Priority & Sequencing

### Phase 1 — Foundation (highest impact, unblocks everything)
1. **Consolidate ScreenHeader + FlagshipHeader** into one canonical header primitive with all variants (pushed, large, modal, transparent, search, minimal).
2. **Add transparent-over-media variant** with gradient scrim and inverse-tone icons.
3. **Create NavAction component family** (NavBack, NavClose, NavOverflow, NavSearch) with enforced hit-area/visible-shape separation.

### Phase 2 — Migration (consistency pass)
4. **Migrate all 15+ screens with custom `headerTitle` styles** to the consolidated header primitive.
5. **Audit and migrate inline back buttons** (322 references) to NavBack/NavClose.
6. **Enforce back-vs-close grammar** across all screens.

### Phase 3 — Polish (2026 parity)
7. **Add swipe-to-switch-tab** gesture layer on the tab navigator.
8. **Add Android predictive back** support.
9. **Reconsider Inbox tab icon** for universal recognizability.
10. **Refine tab bar hide-on-scroll** for content surfaces.

### Phase 4 — Verification
11. **Squint test + thumbnail test** on every screen touched.
12. **Thumb-zone audit** — verify no critical action is in the hard zone without a gesture alternative.
13. **Android system back audit** — verify hardware/gesture back works on every screen.
14. **Light/dark parity check** — verify header chrome geometry is identical across themes.

---

## 8. Token-Level Spec Table

| Chrome element | Height | Hit target | Visible glyph | Background | Border | Title typography | Icon color | Press feedback | Safe area |
|---|---|---|---|---|---|---|---|---|---|
| **Standard header (pushed)** | 56pt min | 44pt | 22–24pt | `colors.header` | None | `Type.subtitle` (17/24/600), left-aligned, `colors.textPrimary` | `colors.textPrimary` | `colors.rowPressed` bg, 0.9 scale | Top inset |
| **Large header (scroll-collapse)** | 56pt bar + 96pt large title | 44pt | 22–24pt | `colors.header` | None | Large: `Type.title` (24/32/700), left; Collapsed: `Type.subtitle` (17/24/600), left | `colors.textPrimary` | `colors.rowPressed` bg, 0.9 scale | Top inset |
| **Modal header** | 56pt min | 44pt | 22–24pt | `colors.header` | None | `Type.subtitle` (17/24/600), center-aligned, `colors.textPrimary` | `colors.textPrimary` | `colors.rowPressed` bg, 0.9 scale | Top inset |
| **Transparent header (over media)** | 56pt min + scrim | 44pt | 22–24pt | Transparent + gradient scrim (0.55→0) | None | `Type.subtitle` (17/24/600), `colors.textInverse` | `colors.textInverse` (white) | `colors.overlay` bg, 0.9 scale | Top inset + scrim extends above |
| **Search header** | 56pt min | 44pt | 22–24pt | `colors.header` | None | Search field: `colors.input` bg, `colors.border` 1px, `Type.body` (14/20/400), `Radius.xl` | `colors.textPrimary` | `colors.rowPressed` bg on buttons | Top inset |
| **Minimal header (actions only)** | 44pt min | 44pt | 22–24pt | Transparent | None | No title | `colors.textPrimary` | `colors.rowPressed` bg | Top inset |
| **Tab bar item (standard)** | 60pt + bottom inset | 44pt min | 24pt icon | Transparent (Liquid Glass backdrop) | None | No visible label; `tabBarAccessibilityLabel` for AT | Active: `colors.textPrimary`; Inactive: `colors.textMuted` | Spring scale 0.9 (`Motion.spring.tap`) | Bottom inset |
| **Tab bar item (Create)** | 52pt hit / 40pt visible | 52pt | 24pt (`add`) | `colors.brand` filled circle, 40pt, `Radius.full` | None | N/A | `colors.surface` (inverse) | Spring scale 0.9 (`Motion.spring.tap`) | Bottom inset |
| **Tab bar item (Profile)** | 27pt avatar in 28pt wrap | 44pt | 27pt avatar or initials | Transparent; 2px `colors.textPrimary` border when focused | 2px border when active | N/A | Avatar image or `colors.textMuted` initials | None (visual border is the state) | Bottom inset |
| **Tab bar badge** | 18pt min | N/A | N/A | `colors.danger` | 1.5px `colors.surface` border | `Type.caption` (10pt bold), white | N/A | N/A | N/A |
| **Back button (NavBack)** | 44pt | 44pt | 22pt (`chevron-back`) | Transparent | None | N/A | `colors.textPrimary` (default) / `colors.textInverse` (over media) | `colors.rowPressed` bg, 0.9 scale, light haptic | N/A |
| **Close button (NavClose)** | 44pt | 44pt | 22pt (`close`) | Transparent | None | N/A | `colors.textPrimary` (default) / `colors.textInverse` (over media) | `colors.rowPressed` bg, 0.9 scale, light haptic | N/A |
| **Overflow menu (NavOverflow)** | 44pt | 44pt | 22pt (`ellipsis-horizontal`) | Transparent | None | N/A | `colors.textPrimary` (default) / `colors.textInverse` (over media) | `colors.rowPressed` bg, 0.9 scale, light haptic | N/A |
| **Search button (NavSearch)** | 44pt | 44pt | 22pt (`search`) | Transparent | None | N/A | `colors.textPrimary` (default) / `colors.textInverse` (over media) | `colors.rowPressed` bg, 0.9 scale, light haptic | N/A |
| **Tab bar container** | 60pt + bottom inset | N/A | N/A | Transparent (`LiquidGlassBackdrop`, intensity 90 light / 70 dark) | `colors.border` hairline top | N/A | N/A | N/A | Bottom inset |
| **Gradient scrim (transparent header)** | Header height + top inset + 40pt | N/A | N/A | `colors.shadow` 0.55 → 0 (top-to-bottom) | None | N/A | N/A | N/A | Extends above header into status bar |

### Token references

All tokens reference `frontend/src/theme/designTokens.ts` and `frontend/src/theme/ThemeContext.tsx`:
- `Control.hit` = 44pt (minimum hit target)
- `Control.icon` = 22–24pt (standard visible icon)
- `Space.md` = 16pt (header horizontal padding)
- `Type.subtitle` = 17/24/600 (standard header title)
- `Type.title` = 24/32/700 (large header title)
- `Type.body` = 14/20/400 (search field text)
- `Type.caption` = 12/16/400 (badge text)
- `Radius.full` = 999px (Create button, avatars)
- `Radius.xl` = 16px (search field)
- `colors.header` = #FFFFFF (light) / #0A0A0A (dark)
- `colors.textPrimary` = #000000 (light) / #FFFFFF (dark)
- `colors.textInverse` = #FFFFFF (light) / #000000 (dark)
- `colors.textMuted` = #767676 (light) / #7A7A7A (dark)
- `colors.border` = #E5E5E5 (light) / #262626 (dark)
- `colors.rowPressed` = #EBEBEB (light) / #1A1A1A (dark)
- `colors.danger` = #9b0202 (badge background)
- `colors.surface` = #F5F5F5 (light) / #141414 (dark) (Create button icon color)
- `colors.brand` = #111111 (light) / #F4F0E8 (dark) (Create button background)
- `Motion.spring.tap` = damping 18, stiffness 280, mass 0.8 (tab press feedback)
- `Duration.fast` = 150ms (press feedback)

---

## Web Sources

1. **UXPin — Mobile Navigation Design: 8 Types, Examples & Best Practices (2026)** — https://www.uxpin.com/studio/blog/mobile-navigation-examples/
2. **Phone Simulator — Mobile Navigation Patterns That Work in 2026** — https://phone-simulator.com/blog/mobile-navigation-patterns-in-2026
3. **Android Developers — Layouts and navigation patterns** — https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns
4. **Nitrous — Mobile Tab Navigation Best Practices (May 2026)** — https://www.nitrousdesign.com/blogs/guideliness-for-designing-effective-tab-bar-navigation-on-mobile
5. **UIUXDesigning — iOS Tab Bar: A Complete UX and Design Guide for 2026** — https://uiuxdesigning.com/ios-tab-bar/
6. **raflifahrezi — 10 Bottom Navigation Bar Design Mistakes** — https://raflifahrezi.com/ui-ux-design/10-bottom-navigation-bar-design-mistakes-that-are-killing-your-mobile-app-ux/
7. **Sanjay Dey — Android UX vs iOS UX Differences: 2026 Designer Guide** — https://www.sanjaydey.com/android-ux-vs-ios-ux-differences/
8. **AuditBuffet — Back button/navigation uses platform conventions** — https://auditbuffet.com/patterns/ab-001967
9. **Aaron Mallen — iOS vs Android Design Guidelines (April 2026)** — https://www.aaronmallen.com/2026/04/08/ios-vs-android-design-guidelines-key-differences-every-app-designer-should-know/
10. **Mobile App Wiki — Gesture Navigation in Mobile Apps** — https://mobileapp.wiki/en/uiux/gesture-navigation-guide
11. **Android Developers — Navigation Event** — https://developer.android.com/guide/navigation/navigation-event
12. **PiunikaWeb — Instagram Liquid Glass navbar update (February 2026)** — https://piunikaweb.com/2026/02/13/instagram-liquid-glass-navbar-update-whatsapp-delay/
13. **Inrō — The New Instagram Tabs Layout (2026)** — https://www.inro.social/blog/instagram-tabs-new-layout-2025
14. **Storrito — Instagram's New Navigation Changes Explained** — https://storrito.com/resources/what-instagrams-navigation-redesign-actually-changed/
15. **Marketing4eCommerce — New Navigation menu on Instagram** — https://marketing4ecommerce.net/en/instagram-new-navigation-menu/
16. **Inrō — Instagram Layout 2026** — https://www.inro.social/blog/instagram-layout
17. **Prisma Design System — App Bar (iOS 26 Liquid Glass, Material 3 Expressive)** — https://prisma-ui.com/components/app-bar.html
18. **Base Web — Mobile Header (Fixed vs Floating)** — https://baseweb.design/components/mobile-header/
19. **GitHub — react-native-screens Discussion #4021 (iOS 26 Liquid Glass Stack header)** — https://github.com/software-mansion/react-native-screens/discussions/4021
20. **thoughtbot — Migrating to native stack navigation with iOS 26** — https://thoughtbot.com/blog/migrating-to-native-stack-navigation-with-a-surprise-from-ios-26
21. **Samsung One UI Design Guide** — https://design.samsung.com/global/contents/oneui/download/oneui_design_guide_eng.pdf
22. **eBay Innovation — eBay Evo: The Evolution of eBay's Brand and Design System** — https://innovation.ebayinc.com/stories/ebay-evo-the-evolution-of-ebays-brand-and-design-system/
23. **DesignSystems.one — eBay Evo Design System Breakdown** — https://www.designsystems.one/design-systems/ebay-design
24. **Creative Bloq — eBay's interface update (Evo)** — https://www.creativebloq.com/design/im-im-impressed-by-ebays-new-human-centred-ui-evolution
25. **Timothy Graf — Designing for the Thumb Zone (2026)** — https://timgraf.com/ux-design/designing-for-the-thumb-zone-a-modern-guide-to-mobile-ux-that-respects-human-anatomy/
26. **wolfnhare — iPhone One-Handed Design Guide: Thumb Zones and Reachability** — https://wolfnhare.com/iphone-one-handed-design-guide-thumb-zones-and-reachability
27. **Matt Medley — It's Just a Back Button. Until You Drop Your Phone** — https://medley.ltd/blog/its-just-a-back-button-until-you-drop-your-phone/
28. **Android Developers — Ensure compatibility with gesture navigation** — https://developer.android.com/develop/ui/views/touch-and-input/gestures/gesturenav
29. **Android Developers — Predictive back design** — https://developer.android.com/design/ui/mobile/guides/patterns/predictive-back
30. **Pinterest Help — Discover ideas on Pinterest** — https://help.pinterest.com/en/article/discover-ideas-on-pinterest
31. **Pinterest Design (LinkedIn) — Visual search reimagined (May 2026)** — https://www.linkedin.com/posts/pinterestdesign_at-pinterest-we-know-inspiration-often-starts-activity-7463348751752159233-st49
32. **Framer Websites — Website Navigation Design: Best Practices for 2026** — https://framerwebsites.com/blog/website-navigation-design

---

## Code References

| File | Lines | Relevance |
|------|-------|-----------|
| `frontend/src/components/ui/ScreenHeader.tsx` | 1–128 | Dead header primitive — 0 screen usages |
| `frontend/src/components/flagship/FlagshipHeader.tsx` | 1–184 | De facto header — 279 screen usages; no transparent/search variant; center-aligned title |
| `frontend/src/navigation/TabNavigator.tsx` | 1–417 | Tab bar system — Liquid Glass, icon-only, no labels, Create as action button |
| `frontend/src/navigation/AppNavigator.tsx` | 1–400 | Stack navigator — `headerShown: false` globally, `gestureEnabled: true`, 7 explicit `headerShown` overrides |
| `frontend/src/screens/InboxScreen.tsx` | 152, 514, 852–856 | Custom inline `headerTitle` style |
| `frontend/src/screens/CheckoutScreen.tsx` | 253, 1156, 1184, 1220, 1305, 2018, 2218 | Custom inline `headerTitle` style (4 render sites) |
| `frontend/src/screens/OrderDetailScreen.tsx` | 711, 1512, 1534, 1568, 1596–1597, 2141–2147 | Custom inline `headerTitle` + `headerRight` |
| `frontend/src/screens/OrderReceiptScreen.tsx` | 59, 165, 201, 223, 257 | Custom inline `headerTitle` style (4 render sites) |
| `frontend/src/screens/HomeScreen.tsx` | 445, 479–509, 517, 1111–1115, 1389–1408 | Custom animated header with `tabBarVisible` scroll logic |
| `frontend/src/screens/LiveShoppingHomeScreen.tsx` | 404–405, 582–587 | Custom `headerLeft` + `headerTitle` |
| `frontend/src/screens/SyndicateHubScreen.tsx` | 253, 773, 783, 793, 812 | FlagshipHeader with right action (correct usage) |
| `frontend/src/screens/MyListingsScreen.tsx` | 90, 159, 268 | FlagshipHeader usage (correct) |
| `frontend/src/theme/designTokens.ts` | 639 | `tabBarHeight: 44` token |
| `frontend/src/theme/ThemeContext.tsx` | 52, 89, 126 | `tabBar` color token (light/dark) |
| `frontend/src/context/TabScrollContext.tsx` | 5, 11 | `tabBarVisible` shared value for scroll-based hide/show |

---

**Document end.** This research deep-dive informs the flagship navigation-chrome upgrade for ThryftVerse. The next step is implementation: consolidate the header primitive, add the transparent-over-media variant, create the NavAction family, and migrate all screens to the canonical system.
