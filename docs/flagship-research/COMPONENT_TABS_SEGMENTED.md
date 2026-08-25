# ThryftVerse Flagship Upgrade — Tabs & Segmented Navigation

**Component deep-dive:** every in-page tab rail, segmented control, scrollable tab bar, and tab indicator in the ThryftVerse React Native app, audited and upgraded to 2026 flagship quality.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4, §17 · production codebase audit · 2026 web research (Expo UI Tabs, HeroUI Tabs, Rork Lab Reanimated SegmentedControl, MetaMask scrollable-tab-view).

---

## 1. 2026 Competitor Benchmark

### Instagram (2026)
Instagram's profile uses a 3-tab rail (Posts / Reels / Tagged) with a thin underline indicator that slides between tabs on tap. The indicator is the only chrome — no pill background, no card, no border. The active tab label is fully opaque; inactive labels are at ~50% opacity. The tab rail sits flush below the profile header with no separator until the content scrolls, at which point a hairline appears. Instagram's lesson: **the indicator is the entire tab chrome — everything else is negative space.**

### Pinterest (2026)
Pinterest uses pill-style segmented controls for filter contexts (All / Boards / Pins) with a sliding pill background that morphs between segments. The pill uses the brand red as the active fill; inactive segments are transparent. The slide animation is a spring with gentle damping — not a snap, not a slow glide. Pinterest's lesson: **the pill communicates "these are peer options" while the underline communicates "these are content sections."**

### eBay (2026)
eBay's listing tabs (About / Shipping / Returns / Q&A) use a scrollable tab rail with an underline indicator. When there are more tabs than fit the viewport, the rail scrolls horizontally and the indicator slides to keep the active tab visible. eBay's lesson: **scrollable tabs are the answer when tab count exceeds viewport width.**

### Cross-cutting 2026 consensus
- **Three indicator styles:** underline (content sections), pill (peer options/filters), segmented (iOS-native 2-3 option toggle) ([Expo UI Tabs](https://expo-ui.thunderdevelops.in/docs/components/tabs), [HeroUI Tabs](https://heroui.com/docs/native/components/tabs)).
- **Animated sliding indicator is mandatory** — static per-tab underlines that remount on switch are a 2020 pattern ([Rork Lab — Reanimated SegmentedControl](https://rorklab.net/en/articles/rork-dev/rork-expo-animated-segmented-control-reanimated-sliding-indicator)).
- **Scrollable tabs** when tab count exceeds viewport ([HeroUI Tabs.ScrollView](https://heroui.com/docs/native/components/tabs)).
- **Measure each segment's real width** — equal-column assumption breaks in localized labels ([Rork Lab](https://rorklab.net/en/articles/rork-dev/rork-expo-animated-segmented-control-reanimated-sliding-indicator)).
- **Accessibility:** `accessibilityRole="tablist"` on container, `accessibilityRole="tab"` + `accessibilityState.selected` on each tab ([Expo UI Tabs](https://expo-ui.thunderdevelops.in/docs/components/tabs)).
- **Reduced motion:** indicator snaps instantly when reduced motion is active.

---

## 2. Psychology & Principles

### Indicator as wayfinding
The tab indicator answers "where am I?" in a fraction of a second. A sliding indicator that moves from one tab to another communicates the transition — the user's eye follows the motion and understands the content below has changed. A static indicator that disappears and reappears on the new tab loses this transitional signal; the user must re-parse the entire rail to find the active tab.

### Underline vs pill semantics
- **Underline** = content sections (Posts / Reels / Tagged). The underline says "these are different views of the same entity."
- **Pill** = peer options (All / Unread / Archived). The pill says "these are filters on the same content."
- **Segmented** = mode toggle (List / Grid). The segmented control says "these are display modes."

Mixing these semantics — using a pill for content sections, or an underline for filter options — confuses the user's mental model.

### Fitts's law and tab width
Tabs should be at least 44pt tall and wide enough for the label plus padding. Equal-width tabs (`flex: 1`) are the default for ≤5 tabs; scrollable tabs with measured widths are needed for >5 tabs. Compressed tabs with truncated labels are a defect.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Shared components (7 files)

| File | Lines | Indicator | Animated | Scrollable |
|------|-------|-----------|----------|------------|
| `components/profile/ProfileTabRail.tsx` | 279 | Underline (40% width) | ✅ withTiming 220ms | ❌ |
| `components/profile/MyProfileTabRail.tsx` | 171 | Underline (40% width) | ✅ withTiming 220ms | ❌ |
| `components/profile/PublicProfileTabRail.tsx` | 167 | Underline (40% width) | ✅ withTiming 220ms | ❌ |
| `components/orders/OrdersTabRail.tsx` | 90 | Full-width underline | ❌ **NO ANIMATION** | ❌ |
| `components/ui/AppSegmentControl.tsx` | 169 | Pill background | ✅ withSpring | ❌ |
| `creator/controls/CreatorSegmentControl.tsx` | 263 | Pill + crossfade | ✅ withSpring | ❌ |
| `platform/native/NativeSegmentedControl.tsx` | 87 | Static fill | ❌ **NO ANIMATION** | ❌ |

### Inline implementations (9 screens)

| Screen | Lines | Indicator | Animated |
|--------|-------|-----------|----------|
| `SellerAnalyticsScreen.tsx` | 308-329 | Background fill | ❌ |
| `PortfolioScreen.tsx` | 540-575 | Bottom border | ❌ |
| `CreatorPublishSheet.tsx` | 1038-1065 | Sliding pill | ✅ |
| `CreatorAssetPicker.tsx` | 1027-1066 | Sliding pill | ✅ |
| `BackgroundSheet.tsx` | 383-421 | Sliding underline | ✅ |
| `ProductBrowserSheet.tsx` | 449-469 | **textDecorationLine** | ❌ |
| `GreenScreenSheet.tsx` | 255-304 | **textDecorationLine** | ❌ |
| `AccessibilityMoveSheet.tsx` | 180-218 | **textDecorationLine** | ❌ |
| `CreatorFolderOrganizeSheet.tsx` | 760-766 | **textDecorationLine** | ❌ |

### Defects

| # | Defect | Location | Severity |
|---|--------|----------|----------|
| 1 | **3 duplicate ProfileTabRail variants** — ProfileTabRail, MyProfileTabRail, PublicProfileTabRail are nearly identical | 3 files, 617 total lines | High |
| 2 | **OrdersTabRail has no animation** — static underline remounts on tab switch | `OrdersTabRail.tsx:81-89` | High |
| 3 | **NativeSegmentedControl has no animation** — static fill, 0 usages | `NativeSegmentedControl.tsx:69-76` | Medium |
| 4 | **4 screens use `textDecorationLine: 'underline'`** as tab indicator — not a visual indicator, just text styling | ProductBrowserSheet, GreenScreenSheet, AccessibilityMoveSheet, CreatorFolderOrganizeSheet | High |
| 5 | **No scrollable tab support** in any shared component | All 7 shared components | High |
| 6 | **Inconsistent animation configs** — withTiming 220ms (Profile), withSpring tap (AppSegment), withSpring entrance (Creator) | Multiple files | Medium |
| 7 | **Hardcoded values** — TAB_HEIGHT=44 (Profile), HEIGHT=36 (Creator), height=2 underline (Orders) | Multiple files | Low |
| 8 | **AppSegmentControl missing reduced motion check** | `AppSegmentControl.tsx` | Medium |
| 9 | **NativeSegmentedControl unused** — 0 imports, dead code | `NativeSegmentedControl.tsx` | Low |

---

## 4. Micro Improvements

### M1 — Add animated indicator to OrdersTabRail
Replace static per-tab underline with a shared `Animated.View` indicator that slides between tabs using `withSpring` or `withTiming`, matching the ProfileTabRail pattern.

### M2 — Replace text-decoration indicators
In ProductBrowserSheet, GreenScreenSheet, AccessibilityMoveSheet, CreatorFolderOrganizeSheet: replace `textDecorationLine: 'underline'` with a proper `Animated.View` underline or pill indicator.

### M3 — Add scrollable variant to ProfileTabRail
Wrap tabs in `<ScrollView horizontal showsHorizontalScrollIndicator={false}>` when `tabs.length > maxVisibleTabs` (default 5). Auto-scroll to keep active tab visible.

### M4 — Consolidate ProfileTabRail variants
Merge ProfileTabRail, MyProfileTabRail, PublicProfileTabRail into a single `TabRail` component with style props (variant, height, indicatorWidth).

### M5 — Add reduced motion to AppSegmentControl
Check `useReducedMotion()` and snap indicator instantly when active.

### M6 — Deprecate or fix NativeSegmentedControl
Either add sliding animation or remove the dead code (0 usages).

### M7 — Standardize animation config
Use `Motion.spring.tap` (or a dedicated tab indicator spring) across all tab components.

---

## 5. Macro Improvements

### A1 — One tab system, three variants
Create a single `TabRail` component with a `variant` prop:
- `variant="underline"` — for content sections (profile, orders)
- `variant="pill"` — for filter options (search, analytics period)
- `variant="segmented"` — for mode toggles (creator tools)

All variants share: animated sliding indicator, scrollable support, reduced motion, accessibility roles, consistent spring config.

### A2 — Scrollable tab architecture
When `tabs.length > maxVisible`, wrap in horizontal ScrollView with:
- Auto-scroll to active tab on change
- `scrollToOverflowEnabled` for smooth scrolling
- Indicator stays synced with scroll offset

---

## 6. Flagship Acceptance Criteria

- **One tab component** with 3 variants (underline, pill, segmented)
- **Animated sliding indicator** on every tab rail — no static remounts
- **Scrollable support** when tabs exceed viewport width
- **Reduced motion** — indicator snaps instantly when active
- **Accessibility** — `tablist`/`tab` roles, `selected` state
- **No `textDecorationLine` indicators** — proper visual indicators only
- **No duplicate variants** — one ProfileTabRail, not three
- **Consistent spring config** across all tab indicators

### Thumbnail test
At 25% scale, the active tab must be identifiable by the indicator alone — not by label weight or background fill. The indicator is the sole signal.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Animate OrdersTabRail | Low | Orders UX |
| P0 | M2 — Replace text-decoration indicators | Low | Creator UX |
| P1 | M4 — Consolidate ProfileTabRail variants | Medium | Maintainability |
| P1 | M3 — Add scrollable variant | Medium | Many-tab screens |
| P1 | M5 — Reduced motion on AppSegmentControl | Low | Accessibility |
| P2 | A1 — One tab system, three variants | High | All tab surfaces |
| P2 | M7 — Standardize animation config | Low | Consistency |
| P3 | M6 — Fix or remove NativeSegmentedControl | Low | Dead code |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `tab.height` | 44pt | Control.touchable |
| `tab.indicator.width` | 40% of tab width (underline) | Or full width (pill) |
| `tab.indicator.height` | 2pt | Stroke.emphasis |
| `tab.indicator.radius` | Radius.full | Pill variant |
| `tab.indicator.animation` | withSpring, damping 22, stiffness 180 | Motion.spring.tap |
| `tab.indicator.reducedMotion` | Instant (no animation) | Accessibility |
| `tab.label.activeOpacity` | 1.0 | Fully opaque |
| `tab.label.inactiveOpacity` | 0.5 | Reduced |
| `tab.scrollable.threshold` | 5 tabs | Switch to ScrollView |
| `tab.accessibility.container` | `tablist` | ARIA |
| `tab.accessibility.item` | `tab` + `selected` state | ARIA |

---

*Generated 2026-08-18. Sources: Expo UI Tabs, HeroUI Tabs, Rork Lab Reanimated SegmentedControl, MetaMask scrollable-tab-view, production codebase audit.*
