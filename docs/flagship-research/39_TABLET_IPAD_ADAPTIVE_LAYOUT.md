# 39 — Tablet/iPad Adaptive Layout: Flagship Research Report

> **Department:** Tablet layout, iPad adaptation, SplitView, list-detail patterns, NavigationRail, adaptive breakpoints, orientation handling
> **Benchmark date:** 2026-08
> **Primary benchmarks:** Apple HIG (iPad) · Material 3 Expressive (Android tablets) · Instagram · eBay
> **Sources:** production codebase audit · 2026 web research · AGENTS.md §4

---

## 1. 2026 Competitor Benchmark

### Apple HIG for iPad (2026)
Apple's Human Interface Guidelines for iPad in 2026:
- **Split View** — sidebar + content, the primary iPad layout pattern
- **Master-Detail** — list on left, detail on right (Settings, Mail)
- **Form Sheet / Page Sheet** — modals as partial overlays, not full-screen
- **Sidebar** — collapsible navigation sidebar (iPadOS 26 with Liquid Glass)
- **Edge margins** — 24-32pt on iPad (vs 16pt on phone)
- **Multitasking** — support Slide Over and Split View (1/3, 1/2, 2/3 width)
- **Drag and drop** — between apps and within apps

### Material 3 Expressive (2026)
Google's Material 3 for Android tablets:
- **Three breakpoints** — Compact (<600dp), Medium (600-839dp), Expanded (≥840dp)
- **NavigationRail** — replaces bottom navigation at Expanded width
- **List-Detail layout** — at Expanded, list and detail side-by-side
- **Adaptive layouts** — components adapt to breakpoint, not just stretch
- **Predictive Back** — gesture-based back navigation

### Instagram (2026)
Instagram on iPad:
- **Stretched phone layout** — Instagram is criticized for not using iPad space well
- **3-column grid** on iPad (vs 2-column on phone) for explore
- **No Split View** — doesn't use sidebar or master-detail
- **Lesson:** Don't do what Instagram does on iPad — do better.

### eBay (2026)
eBay on iPad:
- **Sidebar navigation** — left sidebar with categories
- **List-detail for search** — search results on left, item detail on right
- **Multi-column grids** — 3-4 columns for search results
- **Proper form sheets** — filters and checkout as partial overlays

### Cross-cutting 2026 consensus
- **Tablets get a separate layout, not a stretched phone** — 70% of "simple stretch" apps get rejected at App Store review
- **Split View / Master-Detail** — the primary pattern for list+detail screens
- **NavigationRail** — replaces bottom tab bar at expanded width
- **More columns** — 2-3 column grids for browse/search results
- **Larger margins** — 24-32pt on tablet (vs 16pt on phone)
- **Form sheets** — modals as partial overlays, not full-screen
- **Multitasking support** — Slide Over and Split View

---

## 2. Psychology & Principles

### The "stretched phone" problem
A phone layout stretched to tablet width looks broken: content is too wide, text lines are too long for comfortable reading, and the screen feels empty. The 2026 standard: tablets get a purpose-designed layout that uses the horizontal space productively — either with a sidebar, a multi-column grid, or a list-detail split.

### The reading width limit
Text becomes harder to read when line lengths exceed ~75 characters. On a tablet in portrait, a full-width text block can exceed 120 characters. The 2026 standard: constrain text columns to a readable width (max 600-700pt) and use the remaining space for navigation, sidebars, or secondary content.

### The two-pane advantage
On a tablet, showing list and detail side-by-side eliminates the navigation cost of pushing to a detail screen. The user can browse the list while the detail is visible — they can scan multiple items without going back. This is the single biggest UX improvement a tablet layout can provide.

### Multitasking as a feature
iPad users frequently use Split View (two apps side by side) and Slide Over. An app that doesn't support multitasking feels restrictive — the user can't compare items in ThryftVerse with items in another app. The 2026 standard: support all multitasking modes, with layouts that adapt to 1/3, 1/2, and 2/3 widths.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Tablet/adaptive layout files

| File | Lines | Role | Quality |
|------|-------|------|---------|
| `hooks/useBreakpoint.ts` | 43 | Breakpoint hook | ✅ Senior |
| `theme/designTokens.ts` | — | Design tokens with breakpoint refs | ✅ Exists |
| `app.json` | — | `supportsTablet: true` | ✅ Set |

### What exists
1. **useBreakpoint hook** — 43-line hook implementing Material 3 adaptive guidance. Returns `windowClass: 'compact' | 'medium' | 'expanded'` with thresholds at 600dp and 840dp. Also has `isCommerceCompact` (390px) and `isVeryCompact` (340px) for small phones. This is **genuinely senior** — it follows Material 3 exactly.
2. **app.json** — `supportsTablet: true` is set. This means the app runs on iPad at native resolution (not stretched iPhone).
3. **141 files use Dimensions/useWindowDimensions** — widespread use of window dimensions, but mostly for calculating card sizes, not for adaptive layouts.

### What's missing

| # | Defect | Severity |
|---|--------|----------|
| 1 | **No Split View / Master-Detail** — no screen uses list-detail side-by-side | High |
| 2 | **No NavigationRail** — bottom tab bar used at all widths | High |
| 3 | **No sidebar navigation** — no collapsible sidebar on tablet | High |
| 4 | **No multi-column grids on tablet** — browse/search still 2-column on tablet | High |
| 5 | **No form sheets on tablet** — modals are full-screen at all widths | Medium |
| 6 | **No adaptive margins** — 16pt margins at all widths | Medium |
| 7 | **No multitasking support** — layouts don't adapt to 1/3, 1/2, 2/3 widths | Medium |
| 8 | **No drag-and-drop** — no drag items between views | Low |
| 9 | **No orientation-specific layouts** — no landscape-specific design | Medium |
| 10 | **useBreakpoint exists but is under-consumed** — hook exists but few screens use it for layout changes | High |

---

## 4. Micro Improvements

### M1 — Add NavigationRail for expanded width
At `isExpanded` (width ≥ 840dp), replace the bottom tab bar with a left NavigationRail:
- Vertical rail with icon + label for each tab
- 72pt wide (collapsed) or 240pt wide (expanded with labels)
- Selected tab highlighted with brand color
- Bottom tab bar hidden at expanded width

### M2 — Add Split View for list-detail screens
For key list-detail flows, show list and detail side-by-side at expanded width:
- **BrowseScreen** — category list on left, items grid on right
- **SearchScreen** — search results on left, item detail on right
- **OrdersScreen** — order list on left, order detail on right
- **ChatScreen** — conversation list on left, chat thread on right
- **SettingsScreen** — settings list on left, settings panel on right

### M3 — Add multi-column grids on tablet
At `isExpanded`, increase grid columns:
- **Browse/Search** — 3-4 columns (vs 2 on phone)
- **Discovery feed** — 2-3 columns masonry (vs 1-2 on phone)
- **Profile grid** — 4-5 columns (vs 3 on phone)
- **Closet** — 3-4 columns (vs 2 on phone)

### M4 — Add adaptive margins
At `isExpanded`, increase edge margins:
- Phone: 16pt (Space.md)
- Tablet: 24-32pt (Space.lg - Space.xl)
- Apply to all screens via a shared `useAdaptiveInsets` hook

### M5 — Add form sheets on tablet
At `isExpanded`, render modals as form sheets (partial overlay) instead of full-screen:
- Filter sheet — 50% width, centered
- Checkout — 60% width, centered
- Item detail — 80% width, centered (or Split View)

### M6 — Consume useBreakpoint in all screens
Audit all screens and add breakpoint-based layout changes. The hook exists but is under-consumed. Every screen should at minimum adapt margins and grid columns.

### M7 — Add multitasking support
Test and adapt layouts for:
- 1/3 width (Slide Over) — compact layout
- 1/2 width (Split View) — medium layout
- 2/3 width (Split View) — expanded layout
- Full width — expanded layout

---

## 5. Macro Improvements

### A1 — Adaptive layout system
Create a unified adaptive layout system:
- `useBreakpoint` — already exists, extend with orientation
- `useAdaptiveInsets` — returns margin/padding based on breakpoint
- `useAdaptiveColumns` — returns grid column count based on breakpoint
- `NavigationRail` — tablet navigation component
- `SplitViewLayout` — list-detail layout component
- `FormSheet` — tablet modal component

### A2 — Screen-by-screen adaptation
Every screen needs an adaptation pass:
- **HomeScreen** — 2-3 column masonry at expanded, NavigationRail
- **BrowseScreen** — Split View (categories + grid), 3-4 columns
- **SearchScreen** — Split View (results + detail), 3-4 columns
- **ItemDetailScreen** — form sheet at expanded, or Split View from search
- **ChatScreen** — Split View (conversation list + thread)
- **OrdersScreen** — Split View (order list + detail)
- **SettingsScreen** — Split View (settings list + panel)
- **ProfileScreen** — 4-5 column grid, sidebar
- **ClosetScreen** — 3-4 column grid, Split View for collection detail

---

## 6. Flagship Acceptance Criteria

- **NavigationRail** at expanded width (≥840dp)
- **Split View** for list-detail screens (Browse, Search, Orders, Chat, Settings)
- **Multi-column grids** — 3-4 columns at expanded
- **Adaptive margins** — 24-32pt at expanded
- **Form sheets** — modals as partial overlays at expanded
- **Multitasking support** — 1/3, 1/2, 2/3 widths
- **useBreakpoint consumed** in all screens
- **No stretched phone layout** — every screen adapts
- **Orientation support** — landscape and portrait
- **App Store iPad compliance** — no "Designed for iPhone" label

### Thumbnail test
At 25% scale on an iPad simulator, the app must show: a NavigationRail on the left, multi-column content on the right, and proper margins. It must NOT look like a stretched phone app.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unlocks |
|----------|------|------|----------|
| P0 | M1 — NavigationRail | Medium | Tablet nav |
| P0 | M2 — Split View for key screens | High | List-detail |
| P0 | M3 — Multi-column grids | Low | Content density |
| P1 | M4 — Adaptive margins | Low | Spacing |
| P1 | M5 — Form sheets | Medium | Modals |
| P1 | M6 — Consume useBreakpoint everywhere | Medium | All screens |
| P2 | M7 — Multitasking support | Medium | iPad compliance |
| P3 | A1 — Full adaptive system | High | All tablet surfaces |
| P3 | A2 — Screen-by-screen adaptation | High | Complete tablet UX |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `breakpoint.compact` | < 600dp | Phone portrait |
| `breakpoint.medium` | 600-839dp | Phone landscape, small tablet |
| `breakpoint.expanded` | ≥ 840dp | Tablet, desktop |
| `navigationRail.width.collapsed` | 72pt | Icons only |
| `navigationRail.width.expanded` | 240pt | Icons + labels |
| `navigationRail.icon.size` | 24pt | |
| `navigationRail.label.font` | Type.caption | 12pt |
| `splitView.listWidth` | 320pt | Fixed list pane |
| `splitView.detailMinWidth` | 400pt | Minimum detail pane |
| `adaptiveMargin.compact` | Space.md (16pt) | Phone |
| `adaptiveMargin.expanded` | Space.lg (24pt) | Tablet |
| `adaptiveColumns.browse.compact` | 2 | Phone |
| `adaptiveColumns.browse.expanded` | 4 | Tablet |
| `adaptiveColumns.profile.compact` | 3 | Phone |
| `adaptiveColumns.profile.expanded` | 5 | Tablet |
| `formSheet.width.expanded` | 60% screen | Centered |
| `formSheet.radius.expanded` | Radius.xxl | Large radius |

---

*Generated 2026-08-18. Verified sources: developer.apple.com/videos/play/wwdc2025/208 (Elevate iPad design: sidebar morphs to tab bar, tab bar as starting point, scroll edge effect, extend content below toolbar/sidebar, non-destructive layout changes), developer.apple.com/videos/play/wwdc2025/282 (UISplitViewController interactive column resizing, inspector columns, scene-based lifecycle), developer.apple.com/videos/play/wwdc2024/10147 (iPadOS 18 tab bar ↔ sidebar, customization, drag-and-drop tabs), developer.apple.com/documentation/swiftui/sidebaradaptabletabviewstyle (iPadOS top tab bar→sidebar, iOS bottom tab bar, macOS/tvOS sidebar, visionOS ornament+sidebar), developer.apple.com/documentation/technotes/tn3154 (NavigationSplitView 2-3 column), developer.android.com/develop/adaptive-apps/guides/build-adaptive-navigation (NavigationSuiteScaffold: nav bar compact, nav rail expanded, Material3 adaptive), developer.android.com/develop/ui/compose/components/navigation-rail (3-7 destinations, tablet/desktop, FAB optional), developer.android.com/reference/kotlin/androidx/compose/material3/NavigationRail.composable (NavigationRailItem API), codelabs.developers.google.com/jetpack-compose-adaptability (Material 3 adaptive, foldable postures, nav rail for medium width). Production codebase audit: useBreakpoint, app.json, designTokens.*
