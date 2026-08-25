# ThryftVerse Flagship Upgrade — Selection & Multi-Select

**Component deep-dive:** every checkbox, radio button, multi-select list, selection mode, and bulk action bar in the ThryftVerse React Native app, audited and upgraded to 2026 flagship quality.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4, §17 · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### eBay (2026)
eBay's cart and bulk listing management use a standard selection pattern: long-press to enter selection mode, checkboxes appear on each row, a sticky bulk action bar slides up from the bottom with "Select All", selected count, and action buttons (Delete, Move, Publish). The checkbox is 20pt with a 1pt border, brand-colored fill when checked, white checkmark. eBay's lesson: **selection mode is a mode — the UI transforms to show checkboxes and bulk actions, then transforms back when done.**

### Instagram (2026)
Instagram's multi-photo selection uses a grid where long-press enters selection mode. Selected photos get a brand-colored overlay with a numbered badge showing selection order. A sticky bar at the bottom shows count and "Next" button. Instagram's lesson: **numbered selection order helps users track what they've selected in sequence.**

### Cross-cutting 2026 consensus
- **Long-press to enter selection mode** — standard mobile pattern.
- **Sticky bulk action bar** at the bottom with count + actions.
- **Select All** checkbox in the bar or header.
- **20pt checkbox** with 1pt border, brand fill, white checkmark.
- **Selection state on the row** — brand border or background tint.
- **Exit on back gesture** or "Cancel" button.
- **Accessibility:** `accessibilityRole="checkbox"` with `accessibilityState={{ checked }}`.

---

## 2. Psychology & Principles

### Mode switching
Selection mode is a modal interaction — the user enters a different state where taps select/deselect instead of navigate. This must be clearly communicated: the UI changes (checkboxes appear, bulk bar slides up), a haptic fires on mode entry, and the back gesture exits the mode. Without clear mode signaling, users tap rows expecting navigation and accidentally enter selection mode.

### Bulk action efficiency
Bulk actions are the payoff for selection mode — "delete 10 items at once" instead of 10 individual deletions. Without bulk actions, selection mode is pointless. The bulk action bar must show: what's selected (count), what can be done (action buttons), and how to exit (cancel).

### Select-all as a power user shortcut
Select-all is the most-used bulk action in list management. Without it, selecting 100 items requires 100 taps. With it, one tap selects all. The select-all checkbox in the header or bulk bar is the standard pattern.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Shared selection components (8 files)

| File | Lines | Type | Notes |
|------|-------|------|-------|
| `components/settings/RadioButton.tsx` | 63 | Radio button | ✅ Animated, haptic |
| `components/settings/PremiumToggle.tsx` | 83 | Toggle/switch | ✅ Animated |
| `components/SettingsCell.tsx` | 318 | Settings row with toggle | ✅ Uses PremiumToggle |
| `components/checkout/CheckoutSelectionRow.tsx` | 191 | Checkout selection | ✅ |
| `components/ui/PremiumSelectRow.tsx` | 144 | Select row with chevron | ✅ |
| `components/listing/ListingModeSelector.tsx` | 171 | Sell format selector | ✅ |
| `components/BottomSheetPicker.tsx` | 204 | Single-select picker | ❌ No multi-select |
| `components/sell/SustainabilityTags.tsx` | 314 | Multi-select chips | ✅ Good pattern |

### Selection hooks (2 files)
- `hooks/chat/useMessageSelection.ts` (83 lines) — chat message selection
- `creator/look/useLookMultiSelect.ts` (262 lines) — canvas layer multi-select

### Screens with selection mode (6 files)

| Screen | Selection Mode | Bulk Actions | Select-All |
|--------|---------------|--------------|------------|
| `InventoryManagementScreen.tsx` (1179 lines) | ✅ Long-press entry | ✅ Pause/Resume/Delete | ❌ Missing |
| `BundleBagScreen.tsx` (444 lines) | ✅ Tap to select | ❌ No bulk bar | ❌ Missing |
| `BulkListingScreen.tsx` (~800 lines) | ❌ No row selection | ✅ Validate/Publish/Clear all | N/A (all items) |
| `ChatScreen.tsx` (~2200 lines) | ✅ Long-press | ❌ No bulk actions UI | ❌ Missing |
| `CreatorCanvas.tsx` | ✅ Multi-select layers | ✅ Multi-drag/align/z-order | N/A |
| `LookComposerScreen.tsx` | ✅ Layer multi-select | ✅ Multi-drag/align | N/A |

### Inline checkbox implementations (5 screens)
- `CreateSyndicateScreen.tsx:793, 1228` — custom checkbox for recourse acceptance
- `KYCVerificationScreen.tsx:925, 1378` — custom checkbox for terms
- `AuctionHomeScreen.tsx:2123, 2659` — checkmark in right slot
- `SellScreen.tsx:1798-1799, 1822-1823, 2578-2587` — custom radio circles (should use RadioButton)
- `InventoryManagementScreen.tsx:1051-1060` — inline checkbox in row

### Defects

| # | Defect | Location | Severity |
|---|--------|----------|----------|
| 1 | **No shared Checkbox component** — every screen builds its own | 5+ inline implementations | High |
| 2 | **Inconsistent checkbox styling** — 20x20 1pt border Radius.sm (Inventory) vs 20x20 2pt border Radius.lg (Bundle) | Multiple screens | Medium |
| 3 | **No select-all** on any multi-select screen | Inventory, Bundle, Chat | High |
| 4 | **Only 1 complete bulk action bar** (InventoryManagement) | Other screens missing | High |
| 5 | **BundleBagScreen has no bulk actions** — only checkout button | `BundleBagScreen.tsx` | Medium |
| 6 | **ChatScreen has selection mode but no bulk actions UI** | `ChatScreen.tsx` | Medium |
| 7 | **BottomSheetPicker is single-select only** — no multi-select variant | `BottomSheetPicker.tsx` | Medium |
| 8 | **SellScreen builds custom radio buttons** instead of using RadioButton | `SellScreen.tsx:1798-1823` | Low |
| 9 | **BulkListingScreen bulk actions apply to ALL** — no row-level selection | `BulkListingScreen.tsx` | Medium |
| 10 | **Stroke width inconsistency** — 1pt vs 2pt borders on checkboxes | Multiple | Low |

---

## 4. Micro Improvements

### M1 — Create shared Checkbox component
```tsx
// components/ui/Checkbox.tsx
interface CheckboxProps {
  checked: boolean;
  onToggle: () => void;
  size?: number;      // default 20
  disabled?: boolean;
}
```
20pt, 1pt border (Stroke.standard), Radius.sm, brand fill when checked, white checkmark, AnimatedPressable with haptic, `accessibilityRole="checkbox"`.

### M2 — Create reusable BulkActionBar component
```tsx
interface BulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  actions: BulkAction[];
  onSelectAll: () => void;
  onCancel: () => void;
}
```
Sticky bottom, selected count, select-all checkbox, action buttons, cancel.

### M3 — Add select-all to all multi-select screens
Add select-all checkbox to InventoryManagementScreen header, BundleBagScreen hero, and ChatScreen selection bar.

### M4 — Add bulk actions to BundleBagScreen and ChatScreen
BundleBag: "Remove selected", "Move to wishlist". Chat: "Delete selected", "Forward selected".

### M5 — Extend BottomSheetPicker for multi-select
Add `multiSelect?: boolean` prop with checkbox rows and "Select All" button.

### M6 — Migrate SellScreen custom radios to RadioButton
Replace inline radio circles with the shared `RadioButton` component.

---

## 5. Macro Improvements

### A1 — Selection mode as a reusable pattern
Create a `useSelectionMode` hook and `SelectionModeProvider` that handles: long-press entry, selection set state, select-all, exit on back, bulk bar visibility. Reusable across Inventory, Bundle, Chat, and any future list with selection.

### A2 — Consistent selection visual language
- **Checkbox:** 20pt, 1pt border, Radius.sm, brand fill, white checkmark
- **Selected row:** brand border + subtle brand background tint (5% opacity)
- **Selection mode entry:** haptic (medium) + checkboxes fade in
- **Bulk bar:** slides up from bottom with spring

---

## 6. Flagship Acceptance Criteria

- **Shared Checkbox component** — no inline implementations
- **Shared BulkActionBar** — sticky bottom with count, select-all, actions, cancel
- **Select-all** on every multi-select screen
- **Long-press to enter selection mode** with haptic
- **Selection state on rows** — brand border + tint
- **BottomSheetPicker supports multi-select**
- **Consistent checkbox styling** — 20pt, 1pt, Radius.sm
- **Accessibility** — `checkbox` role, `checked` state

### Thumbnail test
At 25% scale, in selection mode, checkboxes must be visible on each row and the bulk action bar must be visible at the bottom with the selected count.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Shared Checkbox | Low | All checkboxes |
| P0 | M2 — BulkActionBar | Medium | All bulk screens |
| P1 | M3 — Select-all everywhere | Low | Power user UX |
| P1 | M4 — Bulk actions for Bundle/Chat | Medium | Bundle + Chat UX |
| P1 | M5 — Multi-select BottomSheetPicker | Medium | Category selection |
| P2 | M6 — Migrate SellScreen radios | Low | Consistency |
| P3 | A1 — useSelectionMode hook | High | Reusable pattern |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `checkbox.size` | 20pt | Control.icon |
| `checkbox.border` | 1pt (Stroke.standard) | Unselected |
| `checkbox.border.checked` | 0pt (filled, no border) | Selected |
| `checkbox.radius` | Radius.sm (4pt) | |
| `checkbox.fill.checked` | colors.brand | |
| `checkbox.checkmark.color` | colors.textInverse | White |
| `checkbox.haptic` | selection on toggle | |
| `bulkBar.position` | sticky bottom | Above safe area |
| `bulkBar.height` | 56pt | Control.dock |
| `bulkBar.animation` | withSpring (slide up) | Motion.spring.entrance |
| `selection.row.tint` | brand at 5% opacity | Subtle |
| `selection.row.border` | 1pt brand | Selected |
| `selection.entry.haptic` | medium | Mode entry |

---

*Generated 2026-08-18. Sources: production codebase audit, eBay cart/bulk patterns, Instagram photo selection patterns.*
