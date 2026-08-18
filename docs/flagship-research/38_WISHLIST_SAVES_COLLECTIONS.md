# 38 — Wishlist, Saves & Collections: Flagship Research Report

> **Department:** Save for later, wishlist, price-drop alerts, saved collections, saved searches, favorites
> **Benchmark date:** 2026-08
> **Primary benchmarks:** Pinterest · eBay · Instagram
> **Sources:** production codebase audit · 2026 web research · AGENTS.md §4

---

## 1. 2026 Competitor Benchmark

### Pinterest (2026)
Pinterest is the gold standard for saving and organizing:
- **Save to board** — tap "Save" on any pin, select a board, pin is saved
- **Board organization** — create unlimited boards, named and categorized
- **Section within boards** — subdivide boards into sections
- **Visual search from saved pin** — find similar items
- **Collaborative boards** — multiple users can save to the same board
- **Save from external sites** — browser extension saves to Pinterest

### eBay (2026)
eBay's save system is commerce-focused:
- **Watchlist** — save items to watchlist, see price changes and time-left
- **Saved searches** — save a search query, get notified on new matches
- **Saved sellers** — follow a seller, see new listings
- **Price-drop alerts** — notification when a watched item's price drops
- **Back-in-stock alerts** — notification when a watched item is restocked
- **Wishlist** — separate from watchlist, for "want later" vs "watching now"

### Instagram (2026)
Instagram's save system is content-focused:
- **Save posts** — tap bookmark icon, post is saved to "All Posts" collection
- **Collections** — organize saved posts into named collections
- **Save to collection** — long-press bookmark, select collection
- **Private saves** — only you can see your saved posts
- **Saved tab** — dedicated tab in profile for saved content

### Cross-cutting 2026 consensus
- **One-tap save** — bookmark icon, no confirmation, instant save
- **Collections/boards** — organize saved items into named groups
- **Price-drop alerts** — notify when saved item price drops
- **Back-in-stock alerts** — notify when saved item is restocked
- **Saved searches** — save query + filters, get new match alerts
- **Private by default** — saves are personal, not public
- **Saved tab on profile** — dedicated area for saved content

---

## 2. Psychology & Principles

### The save as intent marker
A saved item is a high-intent signal — the user wants this item but isn't ready to buy. This is the most valuable signal for: retargeting (show the item again later), price-drop alerts (nudge when cheaper), and recommendation tuning (show similar items). The 2026 standard: every save should trigger a price-drop alert enrollment.

### Collection as identity
Collections are a form of identity expression — "My Autumn Wardrobe", "Vintage Watches", "Gift Ideas". Users curate collections to organize their taste. For a marketplace, collections are also shopping lists — "Things I want for my new apartment". The 2026 standard: collections should be shareable (public link) and collaborative (multiple users can add).

### The price-drop nudge
A price-drop alert is the highest-converting notification type. The user already wants the item (they saved it), and the price just dropped (the barrier just lowered). This is the perfect storm for conversion. The 2026 standard: every saved item should automatically enroll in price-drop alerts.

### Back-in-stock as recovery
When an item goes out of stock, the user saves it and waits. When it's back, the notification recovers a potentially lost sale. The 2026 standard: back-in-stock alerts on all saved items, with the original size/color pre-selected.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Wishlist/save/collection files

| File | Lines | Role | Quality |
|------|-------|------|---------|
| `screens/ClosetScreen.tsx` | 1122+ | Closet (saved items) | ✅ Substantial |
| `screens/CreateCollectionScreen.tsx` | 318+ | Create collection | ✅ Exists |
| `screens/EditCollectionScreen.tsx` | 243+ | Edit collection | ✅ Exists |
| `screens/CollectionDetailScreen.tsx` | 397+ | Collection detail | ✅ Exists |
| `screens/ManageCollectionItemsScreen.tsx` | 132+ | Manage collection items | ✅ Exists |
| `screens/ExploreCollectionScreen.tsx` | 183+ | Explore collections | ✅ Exists |
| `screens/GalleriaCollectionDetailScreen.tsx` | 472+ | Galleria collection detail | ✅ Exists |
| `components/closet/CollectionCard.tsx` | — | Collection card | ✅ Exists |
| `components/closet/ClosetMediaMosaic.tsx` | 333+ | Closet media mosaic | ✅ Exists |
| `components/profile/MoodboardCollectionGrid.tsx` | — | Moodboard grid | ✅ Exists |
| `hooks/useSavedSearchAlerts.ts` | 81+ | Saved search alerts | ✅ Exists |
| `screens/SavedSearchesScreen.tsx` | 400+ | Saved searches screen | ✅ Exists |
| `store/useStore.ts` | 87 matches | Store with collection state | ✅ Comprehensive |

### What exists (genuinely substantial)
1. **ClosetScreen** — 1122-line closet screen with saved items, collections, moodboards. This is the primary "saved items" surface.
2. **Collection CRUD** — CreateCollectionScreen, EditCollectionScreen, CollectionDetailScreen, ManageCollectionItemsScreen. Full collection management.
3. **GalleriaCollectionDetailScreen** — 472 lines for galleria collections (curated collections).
4. **useSavedSearchAlerts** — 81-line hook for saved search alert management.
5. **SavedSearchesScreen** — 400+ line saved searches screen.
6. **Store** — 87 matches for collection/saved state in useStore. Comprehensive state management.
7. **CollectionCard, ClosetMediaMosaic, MoodboardCollectionGrid** — UI components for displaying collections.

### What's missing

| # | Defect | Severity |
|---|--------|----------|
| 1 | **No price-drop alerts** — no notification when a saved item's price drops | High |
| 2 | **No back-in-stock alerts** — no notification when a saved item is restocked | High |
| 3 | **No one-tap save on feed/PDP** — no bookmark icon on feed cards or PDP | High |
| 4 | **No "Save to collection" picker** — no quick picker when tapping save | Medium |
| 5 | **No saved tab on profile** — saves are in Closet, not on profile | Low |
| 6 | **No shareable collections** — collections can't be shared via link | Medium |
| 7 | **No collaborative collections** — can't invite others to add to a collection | Low |
| 8 | **No "Recently viewed" separate from saves** — no browsing history tracking | Medium |
| 9 | **No watchlist vs wishlist distinction** — no "watching now" vs "want later" | Low |
| 10 | **No save analytics** — no save rate, save-to-purchase conversion tracking | Medium |

---

## 4. Micro Improvements

### M1 — Add one-tap save (bookmark) on feed cards and PDP
Bookmark icon on every feed card and PDP. Tap to save (instant, no confirmation). Tap again to unsave. Haptic on save. Animated bookmark fill. Saves to default "All Saved" collection.

### M2 — Add "Save to collection" picker
On long-press of bookmark (or on first save), show a collection picker bottom sheet: "Save to..." with list of existing collections + "Create new". Quick and frictionless.

### M3 — Add price-drop alerts
When a user saves an item, automatically enroll in price-drop alerts. When the item's price drops, send a push notification: "Price drop: [Item name] is now £X (was £Y)". Tappable → opens PDP.

### M4 — Add back-in-stock alerts
When a user saves an out-of-stock item (or saves an item that later goes out of stock), enroll in back-in-stock alerts. When restocked, send push: "Back in stock: [Item name]". Tappable → opens PDP.

### M5 — Add shareable collections
Each collection gets a shareable link (`thryftverse.com/collection/:id`). Tap "Share" on collection → generates link. Recipient can view the collection (read-only) in-app or on web.

### M6 — Add recently viewed tracking
Track recently viewed items (last 20) in local storage + backend. Separate from saves — this is browsing history, not curated. Show as "Recently viewed" rail on home and in closet.

### M7 — Add saved tab on profile
Add a "Saved" tab on user profile (visible only to the user). Shows saved items and collections. Quick access to closet from profile.

---

## 5. Macro Improvements

### A1 — Unified save system
Create a single save platform:
- `SaveButton` — bookmark icon component (save/unsave, one-tap)
- `CollectionPicker` — bottom sheet for selecting/creating a collection
- `ClosetScreen` — already exists, evolve into the save hub
- `useSaves` — hook for save/unsave with optimistic update
- `usePriceAlerts` — hook for price-drop alert enrollment
- `useBackInStock` — hook for back-in-stock alert enrollment
- `useRecentlyViewed` — hook for browsing history

### A2 — Save-driven engagement loop
1. **User saves item** → enrolled in price-drop + back-in-stock alerts
2. **Price drops** → push notification → user opens PDP → purchase
3. **Item restocked** → push notification → user opens PDP → purchase
4. **Saved item appears in "Recently viewed" rail** → re-engagement
5. **Collection shared** → recipient discovers items → new user engagement

---

## 6. Flagship Acceptance Criteria

- **One-tap save** on feed cards and PDP
- **Collection picker** on save
- **Price-drop alerts** — automatic enrollment on save
- **Back-in-stock alerts** — automatic enrollment on save
- **Shareable collections** — public link
- **Recently viewed** — separate from saves
- **Saved tab on profile** — quick access
- **Optimistic save/unsave** — instant UI update
- **Collections** — create, edit, manage, share
- **Saved searches** — already exist, maintain

### Thumbnail test
At 25% scale, the bookmark icon must be visible on feed cards and PDP. The closet must show collection cards with media thumbnails. Saved items must be visually distinct from unsaved.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unlocks |
|----------|------|------|----------|
| P0 | M1 — One-tap save on feed/PDP | Low | Save everywhere |
| P0 | M3 — Price-drop alerts | Medium | Conversion |
| P0 | M4 — Back-in-stock alerts | Medium | Conversion |
| P1 | M2 — Collection picker | Low | Organization |
| P1 | M6 — Recently viewed | Low | Re-engagement |
| P2 | M5 — Shareable collections | Medium | Viral loop |
| P2 | M7 — Saved tab on profile | Low | Quick access |
| P3 | A1 — Full save system | High | All save surfaces |
| P3 | A2 — Save-driven engagement loop | High | Retention |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `saveButton.icon.size` | 24pt | Bookmark |
| `saveButton.icon.color` | colors.textPrimary | Unsaved |
| `saveButton.icon.activeColor` | colors.brand | Saved |
| `saveButton.haptic` | selection | On save |
| `saveButton.animation` | withSpring (scale 1 → 1.2 → 1) | Bookmark fill |
| `collectionPicker.height` | 60% screen | Bottom sheet |
| `collectionPicker.rowHeight` | 56pt | Collection row |
| `collectionPicker.avatar.size` | 40pt | Collection thumbnail |
| `priceAlert.notification.title` | "Price drop" | |
| `priceAlert.notification.body` | "{item} is now {newPrice} (was {oldPrice})" | |
| `backInStock.notification.title` | "Back in stock" | |
| `backInStock.notification.body` | "{item} is back in stock" | |
| `recentlyViewed.maxItems` | 20 | Local + backend |
| `recentlyViewed.rail.height` | 120pt | |
| `collectionCard.radius` | Radius.lg | |
| `collectionCard.thumbnailGrid` | 2x2 | 4-item preview |

---

*Generated 2026-08-18. Verified sources: facebook.com/help/instagram/1744643532522513 (save posts, tap and hold for collection picker), stashr.me/blog/instagram-saved-posts-guide (long-press bookmark for collection, collaborative collections, no search in Saved), stasht.app/blog/how-to-search-instagram-saved-posts (no search/sort/filters in Saved as of July 2026, only + New Collection), testimonial.to/resources/collections-on-instagram (private folders, tap bookmark, long-press for folder), ebay.co.uk/help/buying/paying-items/shopping-basket (Add to basket, multi-seller checkout, Save for later, Request total), ebay.com.au/help/buying/shipping-delivery/saving-combined-shipping (combined postage, add to cart for combined total), automatedsearches.com (eBay back-in-stock alerts June 2026, price drop alerts, saved search alerts), finderskeepers.app (hourly price drop alerts, price history chart, eBay batches alerts), ubuyfirst.com/ebay-alerts (real-time alerts on new listings, price drops, restocks via eBay API). Production codebase audit: ClosetScreen, CollectionCRUD, useSavedSearchAlerts, SavedSearchesScreen, useStore.*
