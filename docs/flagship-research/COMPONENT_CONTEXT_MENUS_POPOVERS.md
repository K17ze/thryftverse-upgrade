# ThryftVerse Flagship Upgrade — Context Menus & Popovers

**Component deep-dive:** every long-press context menu, popover menu, dropdown menu, and overflow menu in the ThryftVerse React Native app, audited and upgraded to 2026 flagship quality.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4, §17 · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### Instagram (2026)
Instagram uses iOS-style context menus on long-press: a dark popover appears near the touched element with action items ("Report", "Copy Link", "Share", "Unfollow"). The popover has a small arrow pointing to the source element. Tapping outside dismisses it. Instagram's lesson: **context menus are anchored to the element they act on — the spatial relationship communicates "this menu is about this thing."**

### Snapchat (2026)
Snapchat uses long-press context menus on chat messages and stories: a popover with actions ("Delete", "Reply", "React"). The popover appears with a spring animation and dismisses on outside tap. Snapchat's lesson: **context menus on messages are the standard pattern for message actions — don't use a separate "actions" screen.**

### eBay (2026)
eBay uses overflow menus (three-dot icon) on listing cards in the seller dashboard: tapping the icon opens a popover with "Edit", "End Listing", "Relist", "Delete". The popover is anchored to the three-dot icon. eBay's lesson: **overflow menus are for secondary actions on cards — primary actions are on the card surface, secondary actions are in the overflow.**

### Cross-cutting 2026 consensus
- **Long-press context menu** — dark popover anchored to the element, with arrow.
- **Overflow menu** — three-dot icon opens popover with secondary actions.
- **Dropdown menu** — chevron icon opens popover with selectable options.
- **Spring animation** on open, tap-outside to dismiss.
- **Haptic on open** — medium haptic when menu appears.
- **Accessibility** — `accessibilityRole="menu"`, items as `menuitem`.

---

## 2. Psychology & Principles

### Spatial anchoring
A context menu anchored to the element it acts on creates a spatial relationship: "this menu is about this thing." A bottom sheet that slides up from the bottom loses this relationship — the user must remember what they long-pressed. For actions on specific elements (messages, listings, comments), anchored popovers are superior to bottom sheets.

### Primary vs secondary actions
Not every action deserves a spot on the card surface. Primary actions (Buy, Bid, Message) are on the surface. Secondary actions (Edit, Delete, Report, Share) are in the overflow menu. This keeps the card clean while making all actions accessible.

### The long-press discovery problem
Long-press is not discoverable — new users don't know to long-press. The 2026 standard: use overflow menus (three-dot icon) for discoverable secondary actions, and long-press context menus as a shortcut for power users. Both open the same popover.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Context menu / popover usage

| Metric | Count | Notes |
|--------|-------|-------|
| Files with `onLongPress` | ~241 matches | Many inline long-press handlers |
| Shared Popover component | **None** | No `components/ui/Popover.tsx` |
| Shared ContextMenu component | **None** | No `components/ui/ContextMenu.tsx` |
| Overflow menu component | **None** | Three-dot icons built inline |

### Inline long-press implementations (key screens)

| Screen | Lines | Long-Press Action | Implementation |
|--------|-------|-------------------|----------------|
| `ChatScreen.tsx` | 1394 | Message selection mode | Custom handler |
| `InventoryManagementScreen.tsx` | 570+ | Enter selection mode | Custom handler |
| `CreatorCanvas.tsx` | 517-529 | Layer context menu | Custom handler |
| `LookComposerScreen.tsx` | — | Layer multi-select | Custom handler |
| `PosterViewerScreen.tsx` | — | Story context | Custom handler |

### Defects

| # | Defect | Location | Severity |
|---|--------|----------|----------|
| 1 | **No shared Popover component** — every screen builds its own | Global | High |
| 2 | **No shared ContextMenu component** — long-press menus are inline | Global | High |
| 3 | **No overflow menu component** — three-dot icons built inline | Multiple card screens | High |
| 4 | **All menus are bottom sheets** — no anchored popovers | Global | High |
| 5 | **No context menus on key objects** — listings, comments, reviews have no long-press menu | Listings, comments | Medium |
| 6 | **Long-press not discoverable** — no visual hint, no overflow icon alternative | Global | Medium |
| 7 | **No spring animation on menu open** — menus appear instantly or slide | Global | Low |
| 8 | **No haptic on menu open** | Global | Low |
| 9 | **241 inline onLongPress handlers** — no shared pattern | Multiple files | Medium |

---

## 4. Micro Improvements

### M1 — Create shared Popover component
```tsx
interface PopoverProps {
  visible: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<View>;
  children: React.ReactNode;
  arrow?: boolean;
  placement?: 'top' | 'bottom' | 'auto';
}
```
Anchored to a ref, arrow pointing to anchor, spring animation on open, tap-outside to dismiss, dark surface (colors.surfaceInverse).

### M2 — Create shared ContextMenu component
```tsx
interface ContextMenuProps {
  items: ContextMenuItem[];
  onLongPress: () => void;
  children: React.ReactNode;
}
interface ContextMenuItem {
  label: string;
  icon?: string;
  onPress: () => void;
  destructive?: boolean;
}
```
Wraps children, handles long-press, opens Popover with menu items.

### M3 — Create shared OverflowMenu component
```tsx
interface OverflowMenuProps {
  items: OverflowMenuItem[];
}
```
Renders a three-dot icon button. On press, opens Popover with menu items. 44pt touch target, transparent background (per AGENTS.md: visible containment must have meaning).

### M4 — Add context menus to key objects
- **Listing cards:** long-press → "Save", "Share", "Report", "Hide"
- **Comments:** long-press → "Reply", "Copy", "Report", "Delete"
- **Reviews:** long-press → "Helpful", "Report"
- **Chat messages:** long-press → "Reply", "Copy", "Forward", "Delete" (already has selection mode)

### M5 — Add overflow menus to seller dashboard cards
- **Listing cards in InventoryManagement:** overflow → "Edit", "Pause", "Relist", "Delete"
- **Order cards:** overflow → "View details", "Mark shipped", "Print label"

### M6 — Add haptic and spring animation
Medium haptic on menu open. Spring animation (Motion.spring.entrance) for popover appearance.

---

## 5. Macro Improvements

### A1 — Menu component system
Create a unified menu family:
- `Popover` — anchored container with arrow, spring, tap-outside dismiss
- `ContextMenu` — long-press wrapper that opens Popover with menu items
- `OverflowMenu` — three-dot icon that opens Popover with menu items
- `DropdownMenu` — chevron button that opens Popover with selectable options
- `MenuItem` — single row in a menu (label, icon, destructive style, chevron)

### A2 — Dual-access pattern
Every object with secondary actions should have both:
- **Overflow icon** (discoverable) — three-dot icon on the card
- **Long-press** (power user shortcut) — long-press the card
Both open the same Popover with the same items.

---

## 6. Flagship Acceptance Criteria

- **Shared Popover component** — anchored, arrow, spring, tap-outside dismiss
- **Shared ContextMenu** — long-press wrapper
- **Shared OverflowMenu** — three-dot icon button
- **Context menus on key objects** — listings, comments, reviews, messages
- **Overflow menus on dashboard cards** — listings, orders
- **Haptic on open** — medium haptic
- **Spring animation** — Motion.spring.entrance
- **Destructive items styled** — danger color for delete/report
- **Accessibility** — `menu` role, `menuitem` for items

### Thumbnail test
At 25% scale, an open popover must show: the dark surface, the menu items as rows, and the arrow pointing to the anchor. The popover must be visually distinct from the background.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Shared Popover | Medium | All menus |
| P0 | M2 — Shared ContextMenu | Medium | Long-press menus |
| P1 | M3 — OverflowMenu | Low | Dashboard cards |
| P1 | M4 — Context menus on key objects | Medium | Listings, comments, reviews |
| P1 | M5 — Overflow on dashboard cards | Medium | Seller dashboard |
| P2 | M6 — Haptic and spring | Low | Polish |
| P3 | A1 — Full menu system | High | All menu surfaces |
| P3 | A2 — Dual-access pattern | Medium | Discoverability |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `popover.background` | colors.surfaceInverse | Dark surface |
| `popover.text` | colors.textInverse | White text |
| `popover.radius` | Radius.md (12pt) | |
| `popover.arrow.size` | 8pt | Pointing to anchor |
| `popover.padding` | Space.sm | Internal padding |
| `popover.animation` | withSpring (Motion.spring.entrance) | Open |
| `popover.dismiss` | tap-outside + back gesture | |
| `popover.haptic` | medium on open | |
| `menuItem.height` | 44pt | Control.touchable |
| `menuItem.padding` | Space.md | Horizontal |
| `menuItem.destructiveColor` | colors.danger | Delete, report |
| `menuItem.icon.size` | 20pt | Icon grammar |
| `overflowMenu.icon` | 'ellipsis-horizontal' | Three dots |
| `overflowMenu.iconSize` | 20pt | Standard nav glyph |
| `overflowMenu.touchTarget` | 44pt | Transparent background |

---

*Generated 2026-08-18. Sources: production codebase audit, Instagram context menu patterns, Snapchat message context menus, eBay overflow menu patterns.*
