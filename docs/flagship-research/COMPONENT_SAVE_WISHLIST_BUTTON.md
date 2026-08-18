# ThryftVerse Flagship Upgrade — Save/Wishlist Button Component

**Component deep-dive:** bookmark save button, save-to-collection picker, saved state animation, price-drop alert enrollment, back-in-stock enrollment.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4 · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### Instagram (2026)
- Bookmark icon on posts, one-tap to save
- Long-press bookmark → collection picker ("Save to...")
- Saved state: bookmark filled (brand color)
- Collections: named groups, private by default

### eBay (2026)
- "Add to Watchlist" on listings, one-tap
- Watchlist shows price changes and time-left
- Price-drop alerts: automatic on watchlist items
- Back-in-stock alerts: automatic on watchlist items

### Pinterest (2026)
- "Save" button on every pin, one-tap
- Board picker: select existing board or create new
- Visual: red "Save" button, instant save

### Cross-cutting 2026 consensus
- One-tap save (bookmark icon), no confirmation
- Long-press → collection/board picker
- Saved state: filled icon (brand color)
- Auto-enroll in price-drop and back-in-stock alerts
- Optimistic update with rollback
- Haptic on save

---

## 2. Psychology & Principles

### The save as intent marker
A saved item is a high-intent signal — the user wants this but isn't ready to buy. This is the most valuable signal for retargeting, price-drop alerts, and recommendation tuning.

### One-tap reduces friction
A save should be one tap — no picker, no confirmation. The item goes to a default "All Saved" collection. The user can organize later. Friction-free saving maximizes the save rate.

### Auto-enrollment in alerts
Every saved item should automatically enroll in price-drop and back-in-stock alerts. The user doesn't have to opt in — saving implies "I want to know if this changes." This is the highest-converting notification type.

---

## 3. Current ThryftVerse Audit — Concrete Defects

| File | Lines | Role | Quality |
|------|-------|------|---------|
| `screens/ClosetScreen.tsx` | 1122+ | Closet (saved items) | ✅ Substantial |
| `screens/CreateCollectionScreen.tsx` | 318+ | Create collection | ✅ Exists |
| `screens/CollectionDetailScreen.tsx` | 397+ | Collection detail | ✅ Exists |
| `hooks/useSavedSearchAlerts.ts` | 81+ | Saved search alerts | ✅ Exists |
| `store/useStore.ts` | 87 matches | Collection state | ✅ Comprehensive |

### Defects

| # | Defect | Severity |
|---|--------|----------|
| 1 | **No SaveButton on feed cards/PDP** — no bookmark icon | High |
| 2 | **No collection picker on save** — no "Save to..." picker | Medium |
| 3 | **No price-drop alert enrollment** — no auto-enroll on save | High |
| 4 | **No back-in-stock alert enrollment** | High |
| 5 | **No saved state animation** — no bookmark fill animation | Low |
| 6 | **No shared SaveButton component** — no reusable component | High |
| 7 | **No optimistic save/unsave** | Medium |

---

## 4. Micro Improvements

### M1 — Create shared SaveButton component
```tsx
interface SaveButtonProps {
  itemId: string;
  isSaved: boolean;
  onSave: () => void;
  onUnsave: () => void;
  onLongPress?: () => void;  // opens collection picker
  variant?: 'icon' | 'button';
}
```
- `icon` — bookmark icon (24pt), one-tap save
- `button` — "Save" text button with bookmark icon

### M2 — Add collection picker
Bottom sheet on long-press: "Save to..." with list of collections + "Create new". Quick and frictionless.

### M3 — Add saved state animation
On save: bookmark icon scales 1 → 1.2 → 1 with spring. Fills with brand color. Haptic (selection).

### M4 — Auto-enroll in price-drop and back-in-stock alerts
On save, automatically enroll in both alert types. User can opt out in settings. No explicit opt-in needed.

### M5 — Add optimistic update
On save/unsave, update UI instantly. If API fails, rollback with toast.

---

## 5. Macro Improvements

### A1 — Save component system
- `SaveButton` — shared component (icon + button variants)
- `CollectionPicker` — bottom sheet for collection selection
- `useSave` — hook with optimistic update + alert enrollment
- `usePriceAlerts` — hook for price-drop alert management
- `useBackInStock` — hook for back-in-stock alert management

---

## 6. Flagship Acceptance Criteria

- **Shared SaveButton** — icon + button variants
- **One-tap save** — no confirmation
- **Collection picker** — long-press → "Save to..."
- **Saved state animation** — spring scale + brand fill
- **Auto-enroll in alerts** — price-drop + back-in-stock
- **Optimistic update** — instant UI, rollback on error
- **Haptic on save**

### Thumbnail test
At 25% scale, bookmark icon is visible on feed cards and PDP. Saved state (filled) is distinguishable from unsaved (outline).

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Shared SaveButton | Low | Save everywhere |
| P0 | M4 — Auto-enroll in alerts | Medium | Conversion |
| P1 | M2 — Collection picker | Low | Organization |
| P1 | M5 — Optimistic update | Low | UX standard |
| P2 | M3 — Saved state animation | Low | Polish |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `saveButton.icon.size` | 24pt | Bookmark |
| `saveButton.icon.color` | colors.textPrimary | Unsaved |
| `saveButton.icon.activeColor` | colors.brand | Saved |
| `saveButton.haptic` | selection | On save |
| `saveButton.animation` | withSpring (scale 1→1.2→1) | |
| `saveButton.touchTarget` | 44pt | Control.touchable |
| `collectionPicker.height` | 60% screen | Bottom sheet |
| `collectionPicker.rowHeight` | 56pt | |
| `collectionPicker.avatar.size` | 40pt | Collection thumbnail |
| `priceAlert.title` | "Price drop" | Notification |
| `priceAlert.body` | "{item} is now {newPrice} (was {oldPrice})" | |
| `backInStock.title` | "Back in stock" | |
| `backInStock.body` | "{item} is back in stock" | |

---

*Generated 2026-08-18. Verified sources: facebook.com/help/instagram/1744643532522513 (tap Save, tap and hold for collection picker, private section of profile), stashr.me/blog/instagram-saved-posts-guide (long-press bookmark for folder, collaborative collections, one post many folders, no search in Saved), stasht.app/blog/how-to-search-instagram-saved-posts (no search/sort/filters in Saved as of July 2026), ebay.co.uk/help/buying/paying-items/shopping-basket (Save for later from basket), automatedsearches.com (eBay back-in-stock alerts June 2026, price drop alerts, saved search alerts 1440x more effective than eBay batch emails), finderskeepers.app (hourly price drop alerts, price history chart recording every 6 hours). Production codebase audit: ClosetScreen, CollectionCRUD, useSavedSearchAlerts, useStore.*
