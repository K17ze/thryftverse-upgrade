# ThryftVerse Flagship Upgrade — Search & Filter UI Components

**Component deep-dive:** every search bar, filter panel, filter sheet, sort control, active filter display, and saved search component in the ThryftVerse React Native app, audited and upgraded to 2026 flagship quality. Note: Report #04 covers search at the department level; this report covers the component primitives.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4 · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### Instagram (2026)
Instagram's search bar is a rounded pill (Radius.full) with a search icon on the left and a clear (x) button on the right when text is present. The placeholder is "Search" in muted color. Tapping the bar navigates to a full-screen search with recent searches and suggestions. Instagram's lesson: **the search bar is a portal — tapping it opens a dedicated search experience, not an inline expansion.**

### Pinterest (2026)
Pinterest's filter system uses chips at the top of search results: active filters are shown as removable chips ("Price: Low-High ×", "Category: Shoes ×"). Tapping a chip removes the filter. A "Filters" button opens a bottom sheet with all filter options. Pinterest's lesson: **active filter chips make filter state visible — the user sees what's filtering their results without opening the filter panel.**

### eBay (2026)
eBay's filter sheet is a full-height bottom sheet with filter sections (Price, Condition, Category, Location, Shipping). Each section has a header and options. "Apply" and "Reset" buttons are sticky at the bottom. The sheet remembers the last filter state. eBay's lesson: **filter sheets must have Apply (commit) and Reset (clear all) — don't apply filters on tap (too easy to mis-tap).**

### Cross-cutting 2026 consensus
- **Search bar:** rounded pill, search icon left, clear button right, placeholder text.
- **Filter chips:** removable chips showing active filters at top of results.
- **Filter sheet:** bottom sheet with sections, Apply + Reset, sticky bottom buttons.
- **Sort control:** dropdown or sheet with sort options (Relevance, Price, Date, Distance).
- **Saved searches:** save a search query + filters for notifications on new matches.
- **Recent searches:** show last 5-10 searches when search bar is focused.

---

## 2. Psychology & Principles

### Search as the front door
For a marketplace, search is the front door — most users start with search, not browse. The search bar must be immediately visible, easy to tap, and lead to a fast, relevant search experience. A hidden or small search bar costs conversions.

### Filter visibility
When filters are hidden in a sheet, the user forgets what's filtering their results. Active filter chips at the top of results make the filter state visible — the user sees "Price: £0-50 × Category: Shoes ×" and understands why they're seeing these results. This is the 2026 standard.

### Apply vs instant-apply
Two patterns: instant-apply (filters apply on tap) and commit-apply (filters apply on "Apply" button). Instant-apply is faster for simple filters (chips). Commit-apply is better for complex filters (price range, multiple categories) because the user can set multiple filters before the results reload. The 2026 standard: instant-apply for chips, commit-apply for filter sheets.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Search/filter component files (23 files matched)

| File | Lines | Description | Quality |
|------|-------|-------------|---------|
| `components/ui/AppSearchBar.tsx` | 25+ | Shared search bar | ✅ Exists |
| `components/orders/OrdersFilterSheet.tsx` | 48+ | Orders filter sheet | ✅ Exists |
| `hooks/useSavedSearchAlerts.ts` | 81+ | Saved search alerts hook | ✅ Exists |
| `screens/SavedSearchesScreen.tsx` | 400+ | Saved searches screen | ✅ Exists |
| `screens/GlobalSearchScreen.tsx` | 1142+ | Main search screen | ✅ Comprehensive |
| `screens/ConversationalSearchScreen.tsx` | 368+ | AI search | ✅ |
| `screens/VisualSearchScreen.tsx` | 727+ | Visual search | ✅ |
| `screens/BrowseScreen.tsx` | 855+ | Browse with filters | ✅ |
| `screens/AuctionHomeScreen.tsx` | 1945+ | Auction browsing with filters | ✅ |
| `screens/FilterScreen.tsx` | — | Filter screen | ✅ (per Report #35: uses text inputs for price range) |

### Defects

| # | Defect | Location | Severity |
|---|--------|----------|----------|
| 1 | **No active filter chips** — no removable chips showing active filters at top of results | Search/browse screens | High |
| 2 | **No shared FilterSheet component** — OrdersFilterSheet exists but is screen-specific | Global | Medium |
| 3 | **No shared SortControl component** — sort options built inline per screen | Multiple screens | Medium |
| 4 | **Price range uses text inputs** instead of range slider (per Report #35) | FilterScreen | High |
| 5 | **Inconsistent search bar styling** — some screens use AppSearchBar, others build inline | Multiple screens | Medium |
| 6 | **No recent searches display** when search bar is focused | GlobalSearchScreen | Medium |
| 7 | **No filter count badge** on "Filters" button — user doesn't know how many filters are active | Browse, Auction | Low |
| 8 | **Saved searches exist but no UI to save current search** from search results | SavedSearchesScreen | Medium |

---

## 4. Micro Improvements

### M1 — Create shared FilterChip component
```tsx
interface FilterChipProps {
  label: string;
  onRemove: () => void;
}
```
Pill shape, brand-tinted background, label + × icon, tap to remove.

### M2 — Create ActiveFilterBar component
```tsx
interface ActiveFilterBarProps {
  filters: ActiveFilter[];
  onRemoveFilter: (key: string) => void;
  onClearAll: () => void;
}
```
Horizontal scroll of FilterChips + "Clear all" at the end. Shown at top of search/browse results.

### M3 — Create shared FilterSheet component
```tsx
interface FilterSheetProps {
  visible: boolean;
  onClose: () => void;
  onApply: (filters: Filters) => void;
  onReset: () => void;
  sections: FilterSection[];
}
```
Bottom sheet with filter sections, Apply + Reset sticky at bottom.

### M4 — Create shared SortControl component
```tsx
interface SortControlProps {
  options: SortOption[];
  value: string;
  onChange: (value: string) => void;
}
```
Dropdown or sheet with sort options. Shows current sort as label.

### M5 — Add filter count badge to "Filters" button
Show a small count badge on the "Filters" button when filters are active ("Filters (3)").

### M6 — Add recent searches
Show last 5-10 searches when the search bar is focused, before the user types. Tap to re-run.

### M7 — Add "Save this search" from results
Add a "Save" button on search results that saves the current query + filters as a saved search (integrates with existing `useSavedSearchAlerts` hook).

---

## 5. Macro Improvements

### A1 — Search & filter component system
Create a unified family:
- `SearchBar` — pill with icon, clear, placeholder (already exists as AppSearchBar)
- `ActiveFilterBar` — horizontal scroll of removable filter chips
- `FilterSheet` — bottom sheet with sections, Apply + Reset
- `SortControl` — dropdown/sheet for sort options
- `FilterChip` — single removable chip
- `RecentSearches` — list of recent search queries
- `SavedSearchButton` — save current search + filters

### A2 — Consistent filter UX across all surfaces
Every screen with filtering (Browse, Auction, Search, Orders, Inventory) should use the same FilterSheet, ActiveFilterBar, and SortControl components. No screen-specific filter implementations.

---

## 6. Flagship Acceptance Criteria

- **Active filter chips** at top of all filtered results
- **Shared FilterSheet** with Apply + Reset
- **Shared SortControl** across all sortable lists
- **Filter count badge** on "Filters" button
- **Recent searches** on search bar focus
- **Save search** from results
- **Consistent search bar** (AppSearchBar) everywhere
- **Price range slider** (per Report #35) instead of text inputs

### Thumbnail test
At 25% scale, filtered results must show: the active filter chips at the top (as small pills) and the "Filters" button with count badge. The chips must be visually distinct from the results below.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — FilterChip | Low | Active filters |
| P0 | M2 — ActiveFilterBar | Low | All filtered screens |
| P1 | M3 — Shared FilterSheet | Medium | All filter surfaces |
| P1 | M4 — SortControl | Low | All sortable lists |
| P1 | M5 — Filter count badge | Low | Filter visibility |
| P2 | M6 — Recent searches | Medium | Search UX |
| P2 | M7 — Save search from results | Low | Saved searches |
| P3 | A1 — Full search/filter system | High | All search surfaces |
| P3 | A2 — Consistent filter UX | High | Consistency |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `searchBar.height` | 44pt | Control.touchable |
| `searchBar.radius` | Radius.full | Pill |
| `searchBar.background` | colors.surfaceAlt | |
| `searchBar.iconColor` | colors.textMuted | |
| `searchBar.placeholderColor` | colors.textMuted | |
| `filterChip.height` | 32pt | |
| `filterChip.radius` | Radius.full | Pill |
| `filterChip.background` | brand at 10% opacity | Tinted |
| `filterChip.textColor` | colors.brand | |
| `filterChip.icon` | 'close' | Remove |
| `filterSheet.height` | 80% screen | Bottom sheet |
| `filterSheet.applyButton` | Primary button, sticky bottom | |
| `filterSheet.resetButton` | Ghost button, sticky bottom | |
| `sortControl.height` | 44pt | |
| `sortControl.icon` | 'chevron-down' | |
| `filterBadge.background` | colors.brand | |
| `filterBadge.text` | colors.textInverse | White |
| `filterBadge.size` | 16pt | Count badge |

---

*Generated 2026-08-18. Sources: production codebase audit, Instagram search bar patterns, Pinterest active filter chips, eBay filter sheet patterns.*
