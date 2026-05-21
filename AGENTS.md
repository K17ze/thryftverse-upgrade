# ThryftVerse — Settings UI/UX Upgrade Plan

## 1. Current State Audit

### Screens Analyzed
- `SettingsScreen.tsx` — Main settings hub
- `AccountSettingsScreen.tsx` — Account details, 2FA, data export, delete
- `PushNotificationsScreen.tsx` — Push notification toggles
- `PaymentsScreen.tsx` — Payment methods, balance prefs
- `PostageScreen.tsx` — Carrier selection, shipping options
- `EditProfileScreen.tsx` — Avatar, bio, gender, location, website
- `ChangePasswordScreen.tsx` — Password update flow
- `HelpSupportScreen.tsx` — FAQs, live chat, tickets
- `PersonalisationScreen.tsx` — Feed preference tuning
- `SettingsCell.tsx` — Shared settings list-item primitive

### Design System in Use (App-wide)
- **Colors**: `Colors.background`, `Colors.surface`, `Colors.surfaceAlt`, `Colors.brand`, `Colors.textPrimary/Secondary/Muted`, `Colors.border`, `Colors.danger`, `Colors.success` (5-core palette, luxury e-commerce aesthetic)
- **Spacing**: `Space.xs/sm/md/lg/xl/xxl` (4px base grid)
- **Radius**: `Radius.sm/md/lg/xl/full` (4/8/12/16/999)
- **Elevation**: `Elevation.none/subtle/card/floating/modal`
- **Typography**: `Type.title/subtitle/body/price/caption/meta/priceLarge`
- **Components**: `AppButton`, `AppCard` (surface/elevated/brand/tint), `AppInput`, `AppSegmentControl`, `AnimatedPressable`, `T` (text primitive)

---

## 2. Critical Inconsistencies Found

### A. Header Pattern Fragmentation
Every settings subpage invents its own header:

| Screen | Back Button | Title Style | Right Action |
|--------|-------------|-------------|--------------|
| SettingsScreen | 44x14 rounded surface square | Label (11px) + hugeTitle (28px) | None |
| AccountSettingsScreen | Plain arrow-back | hugeTitle "Account" (28px) | None |
| PushNotificationsScreen | Plain arrow-back | headerTitle (17px bold) | Icon button (notifications-off) |
| PostageScreen | Plain arrow-back | headerTitle (17px bold) | Text "Save" |
| EditProfileScreen | 44x14 rounded surface square | hugeTitle "Edit Profile" (28px) | 44px spacer |
| ChangePasswordScreen | 44x14 rounded surface square | hugeTitle (28px) | None |

**Problem**: No unified "Settings Sub-Screen Header" component. Users lose spatial consistency when navigating settings.

### B. Card / Surface Style Drift
Settings subpages do not use `AppCard` or `SettingsGroup` consistently:

- `SettingsScreen` → uses `SettingsGroup` (12px radius, `Colors.surface`, `Colors.border`)
- `PushNotificationsScreen` → custom `card` style (16px radius, custom `CARD` color)
- `PostageScreen` → custom `card` (16px radius, `IS_LIGHT ? '#ffffff' : '#111111'`)
- `AccountSettingsScreen` → custom `cardGroup` (no radius on container, inner rows only)
- `EditProfileScreen` → no card wrapper at all; inputs float on background
- `ChangePasswordScreen` → same floating inputs

**Problem**: Surfaces look different on every subpage. The luxury aesthetic depends on restraint and consistency.

### C. Input Style Fragmentation
Multiple inline `pillInput` clones exist:

- `AccountSettingsScreen`: borderRadius varies, no `AppInput` usage
- `EditProfileScreen`: uses `INPUT_BG = IS_LIGHT ? '#f7f4ef' : '#161616'` (not in design system)
- `ChangePasswordScreen`: slightly different padding/height

The app already has `AppInput` (borderRadius 10, `Colors.surface`, `Colors.border`, prefix/suffix support, error states, helper text). Settings screens ignore it.

### D. Hardcoded Theme-Aware Colors
Several screens inline their own light/dark constants instead of using the centralized palette:

- `PostageScreen`: `CARD = IS_LIGHT ? '#ffffff' : '#111111'` (should be `Colors.surface`)
- `PostageScreen`: `BORDER = IS_LIGHT ? '#d8d1c6' : '#2a2a2a'` (should be `Colors.border`)
- `EditProfileScreen`: `PANEL_BG = IS_LIGHT ? '#ffffff' : '#111111'` (should be `Colors.surface`)
- `NotificationsScreen`: `PANEL_BG = IS_LIGHT ? '#ffffff' : '#111111'`

**Problem**: Theme switching is brittle; dark-mode refinements to `Colors` do not propagate.

### E. Typography Token Abandonment
Settings screens use raw font sizes and families instead of the `Type` scale:

- `headerTitle: { fontSize: 17, fontWeight: '700' }` → should use `Type.subtitle`
- `rowLabel: { fontSize: 15, fontWeight: '600' }` → should use `Type.body` / `Type.price`
- `sectionLabel: { fontSize: 11, letterSpacing: 1.2 }` → should use `Type.meta`

### F. Missing Motion & Feedback
- No `Reanimated` entrance animations on settings subpages (rest of app uses `FadeInDown`, shared transitions)
- No haptic feedback on destructive actions (Delete Account, Clear Cache)
- No loading skeletons for async settings sections

### G. UX / Information Architecture Issues
1. **Duplicate Routes**: SettingsScreen has both "Edit Profile" under Profile and "Personal Information" under Account — both navigate to `EditProfile`.
2. **Dead Toggles**: `notificationsEnabled` in `SettingsScreen` is local React state, not wired to the push-permission system.
3. **Mock Data in Production UI**: `AccountSettingsScreen` hardcodes `email='user@example.com'`, `fullName='John Doe'`, `phone='+44 7700 900077'`.
4. **Missing Preview Cards**: No profile preview card in Settings; users cannot see their identity at a glance.
5. **No Search**: Settings with 30+ items has no search/filter.

---

## 3. Upgrade Plan

### Phase 1 — Foundational Primitives (needed before any screen work)

#### 1.1 Create `SettingsHeader` Component
A reusable header for all settings subpages:
- Left: `AnimatedPressable` back button (44x44, `Radius.md`, `Colors.surface`)
- Center: Title using `Type.subtitle` or `Type.title` depending on context
- Right: Optional action slot (text button or icon)
- Uses `SafeAreaView` insets correctly

#### 1.2 Create `SettingsCard` Wrapper
Standardized card for settings forms/toggles:
- Uses `AppCard` with `variant='surface'` or `'elevated'`
- Enforces `Radius.lg` (12px) or `Radius.xl` (16px) consistently
- Supports `isFirst`/`isLast` divider logic or uses `SettingsCell` internally

#### 1.3 Migrate All Inputs to `AppInput`
Replace every inline `pillInput` in:
- `AccountSettingsScreen`
- `EditProfileScreen`
- `ChangePasswordScreen`
- `HelpSupportScreen` (support message input)

#### 1.4 Centralize Theme Colors
Audit and remove all inline `IS_LIGHT ? ... : ...` color blocks in settings screens. Replace with `Colors.*` and `Colors.surfaceAlt` where elevation is needed.

### Phase 2 — Settings Hub Overhaul (`SettingsScreen`)

#### 2.1 Add Profile Preview Card
- At top of scroll: avatar, display name, username, verification badge, reputation score
- Tapping navigates to `EditProfile`
- Uses `AppCard variant='elevated'` + `CachedImage`

#### 2.2 Add Settings Search Bar
- Collapsible search input at top (appears on scroll down / always visible)
- Filters sections in real-time

#### 2.3 Reorganize Sections (Information Architecture)
Proposed order:
1. **Profile Preview Card** (new)
2. **Account** — Personal Information, Password, Payment Methods, Addresses, Payout Method
3. **Preferences** — Currency Display, Local Currency, Theme, Language, Personalisation
4. **Commerce** — Shipping Profiles, Postage Defaults
5. **Notifications** — Push (deep link), Email toggle
6. **Security** — Two-Factor Authentication, Active Devices, Change Password
7. **Storage & Data** — Manage Downloads, Clear Cache, Request Data Export
8. **Support** — Help & Support, Terms, Privacy
9. **Logout** — Destructive action card

#### 2.4 Add Entrance Animations
- Wrap each `SettingsGroup` in `Reanimated.View` entering with `FadeInDown` staggered by index
- Use `AnimatedPressable` scale feedback on every row

#### 2.5 Haptic & Toast Feedback
- Light haptic on every row press
- Medium haptic on toggles
- Heavy haptic on destructive actions (Clear Cache, Log Out)

### Phase 3 — Subpage Unification

#### 3.1 `AccountSettingsScreen`
- Adopt `SettingsHeader` + `SettingsCard` patterns
- Replace all `TextInput` with `AppInput`
- Replace inline switches with `SettingsCell variant='toggle'`
- Wire email/fullName/phone to `currentUser` store (remove hardcoded mocks)
- Add confirmation modal for Data Export (not just instant toast)
- Add `Reanimated` scroll entrance for form sections

#### 3.2 `PushNotificationsScreen`
- Adopt `SettingsHeader`
- Use `SettingsCell variant='toggle'` for each notification type (instead of custom row)
- Add animated toggle-all button with `AppSegmentControl` or `AppButton`
- Add progress/pie indicator showing "X of Y enabled"

#### 3.3 `PaymentsScreen`
- Adopt `SettingsHeader`
- Use `AppCard` for payment method list
- Replace custom toggle with `SettingsCell variant='toggle'` or `AppSegmentControl`
- Add skeleton loader during `isSyncing`
- Add empty state illustration when no cards exist

#### 3.4 `PostageScreen`
- Adopt `SettingsHeader` (keep Save action)
- Use `AppCard` for carrier list
- Replace custom radio buttons with a `RadioButton` primitive (or styled `AnimatedPressable` circles)
- Use `SettingsCell variant='toggle'` for shipping options

#### 3.5 `EditProfileScreen`
- Adopt `SettingsHeader`
- Replace all inputs with `AppInput`
- Wrap form in `SettingsCard` / `AppCard`
- Add loading state for avatar upload
- Add bio character counter using `Type.caption`

#### 3.6 `ChangePasswordScreen`
- Adopt `SettingsHeader`
- Replace inputs with `AppInput`
- Add password strength indicator (visual bar)
- Wrap in `SettingsCard`

#### 3.7 `HelpSupportScreen`
- Adopt `SettingsHeader`
- Use `AppCard` for FAQ accordions
- Use `AppInput` for support message textarea
- Add `AppButton` for submit
- Add search filter for FAQs

#### 3.8 `PersonalisationScreen`
- Adopt `SettingsHeader`
- Use `AppCard` for preference groups
- Replace custom gender chips with standard chip component or `AppSegmentControl`

### Phase 4 — Accessibility & Polish

#### 4.1 Accessibility Audit
- Ensure every `SettingsCell` has `accessibilityLabel`, `accessibilityRole`, `accessibilityHint`
- Ensure toggle cells announce state changes
- Ensure focus order is logical (top-to-bottom, left-to-right)

#### 4.2 Loading & Empty States
- Add `SkeletonLoader` to async sections (payments, postage carriers)
- Add `EmptyState` component when lists are empty

#### 4.3 Scroll Behavior
- Add `useAnimatedScrollHandler` to headers for subtle opacity/elevation change on scroll (consistent with HomeScreen / MyProfileScreen)

---

## 4. Files to Create / Modify

### New Components
- `frontend/src/components/settings/SettingsHeader.tsx`
- `frontend/src/components/settings/SettingsCard.tsx`
- `frontend/src/components/settings/RadioButton.tsx` (for Postage carrier selection)
- `frontend/src/components/settings/PasswordStrengthBar.tsx`

### Modified Screens
- `frontend/src/screens/SettingsScreen.tsx`
- `frontend/src/screens/AccountSettingsScreen.tsx`
- `frontend/src/screens/PushNotificationsScreen.tsx`
- `frontend/src/screens/PaymentsScreen.tsx`
- `frontend/src/screens/PostageScreen.tsx`
- `frontend/src/screens/EditProfileScreen.tsx`
- `frontend/src/screens/ChangePasswordScreen.tsx`
- `frontend/src/screens/HelpSupportScreen.tsx`
- `frontend/src/screens/PersonalisationScreen.tsx`

### Modified Primitives
- `frontend/src/components/SettingsCell.tsx` — ensure it uses `Type` tokens, add `accessibilityHint` prop

---

## 5. Success Criteria

1. All settings subpages use the same header, card, and input primitives.
2. No inline `IS_LIGHT ? ... : ...` color constants remain in any settings screen.
3. All typography uses `Type` or `T` design tokens.
4. All interactive elements provide haptic feedback.
5. SettingsScreen scroll entrance uses `Reanimated` staggered fade-in.
6. No hardcoded mock strings appear in production UI (email, name, phone wired to store/API).
7. Accessibility labels/hints pass a screen-reader walkthrough.

---

## 6. Implementation Status: COMPLETED

All 10 settings files have been upgraded. TypeScript passes with zero errors.

### New Components Created
- `frontend/src/components/settings/SettingsHeader.tsx` — unified header for all settings subpages
- `frontend/src/components/settings/SettingsCard.tsx` — standardized card wrapper using `AppCard` + `Radius.lg`
- `frontend/src/components/settings/RadioButton.tsx` — themed radio button for carrier selection
- `frontend/src/components/settings/PasswordStrengthBar.tsx` — visual password strength indicator

### Screens Rewritten
- `SettingsScreen.tsx` — profile preview card, search bar, reorganized sections, `FadeInDown` animations, dead toggle removal
- `AccountSettingsScreen.tsx` — `SettingsHeader`, `AppInput`, `SettingsCell`, `FadeInDown`, no hardcoded mocks
- `PushNotificationsScreen.tsx` — `SettingsHeader`, `SettingsCell` toggles, progress bar, animated toggle-all
- `PaymentsScreen.tsx` — `SettingsHeader`, `SettingsCard`, skeleton syncing indicator, `FadeInDown`
- `PostageScreen.tsx` — `SettingsHeader`, `RadioButton`, `SettingsCell` toggles, `FadeInDown`
- `EditProfileScreen.tsx` — `SettingsHeader`, `AppInput`, avatar upload loading state, `FadeInDown`
- `ChangePasswordScreen.tsx` — `SettingsHeader`, `AppInput`, `PasswordStrengthBar`, `FadeInDown`
- `HelpSupportScreen.tsx` — `SettingsHeader`, `SettingsCard`, FAQ search filter, `AppButton`, `FadeInDown`
- `PersonalisationScreen.tsx` — `SettingsHeader`, `SettingsCell`, gender pills with `Colors.brand`, `FadeInDown`

### Primitives Updated
- `SettingsCell.tsx` — migrated to `Type` tokens, `Space`/`Radius` constants, added `accessibilityHint` prop

---

# ThryftVerse — Saved / Wishlist / Watchlist / Collections UI/UX Upgrade Plan

## 1. Current State Audit

### Screens Analyzed
- `SearchScreen.tsx` — Main "Explore" screen that also hosts SAVED / WISHLIST / WATCHLIST tabs
- `FavouritesScreen.tsx` — Orphaned screen labeled "Watchlist" but only renders `wishlist` items; no navigation to it exists in the app
- `ItemDetailScreen.tsx` — Collection save modal (inline, raw styles); the only existing collections UI surface
- `ProductCardV2.tsx` — `MasonryGrid` used for rendering saved/wishlist grids

### Store / Data Layer Audit
The Zustand store (`useStore.ts`) has a **complete but UI-less** collections system:
- `wishlist: string[]` — liked/hearts items
- `savedProducts: string[]` — bookmarked items
- `collections: Collection[]` — full Pinterest-style boards with `id`, `name`, `description`, `itemIds`, `coverImage`, `createdAt`, `updatedAt`
- Full CRUD API: `createCollection`, `deleteCollection`, `renameCollection`, `addToCollection`, `removeFromCollection`, `isInCollection`, `isItemSavedAnywhere`, `getItemCollections`
- Navigation type `CollectionDetail: { collectionId: string }` exists but **no screen component exists** (dead route)

---

## 2. Critical Inconsistencies Found

### A. Orphaned Screen + Conflated Mental Models
- `FavouritesScreen` is registered in `AppNavigator` but **zero call sites** navigate to it anywhere in the codebase.
- Meanwhile, `SearchScreen` (bottom-tab "Explore") jams Saved/Wishlist/Watchlist tabs under an "Explore" header with a global search bar.
- **Problem**: Searching and browsing your closet are different user intents. Users should not have to enter "Explore" to manage saved items.

### B. Duplicate / Dead Tabs
```tsx
const watchlistItems = wishlistItems; // line 224, SearchScreen
```
The `WATCHLIST` tab is a literal alias of `WISHLIST`. Users see three tabs but only two datasets. This is confusing and wastes horizontal tab space.

### C. Collections System is "Headless"
- Full store API exists with persistence, but **no UI** lets users browse, rename, delete, or view their collections.
- `CollectionDetail` route is typed but unimplemented — tapping a collection is impossible.
- The only collections UI is the `ItemDetail` save modal, which uses raw `StyleSheet` instead of `AppCard` / `AppInput`.

### D. Hardcoded Theme-Aware Colors (Same pattern as Settings audit)
- `SearchScreen`: `PANEL_ALT = IS_LIGHT ? '#ece4d8' : Colors.surfaceAlt`
- `SearchScreen`: `BRAND = IS_LIGHT ? '#2f251b' : ACCENT`
- `SearchScreen`: `activeTab: { backgroundColor: IS_LIGHT ? '#fff' : Colors.textPrimary }`
- `SearchScreen`: `activeTabText: { color: IS_LIGHT ? '#000' : '#000' }`
- `ItemDetailScreen` modal: `backgroundColor: isSavedProduct(...) ? 'rgba(52,199,89,0.12)' : Colors.surfaceAlt`
- `ItemDetailScreen` modal: hardcoded `#34C759` success green instead of `Colors.success`

### E. Typography Token Abandonment
- `SearchScreen`: `hugeTitle: { fontSize: 24, fontFamily: Typography.family.bold }` → should be `Type.title`
- `FavouritesScreen`: `headerLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.7 }` → should be `Type.meta`
- `FavouritesScreen`: `headerTitle: { fontSize: 22, fontFamily: 'Inter_700Bold' }` → should be `Type.subtitle`
- `ItemDetailScreen` modal: raw `fontSize: 16, fontWeight: '600'` → should be `Type.body` / `Type.price`

### F. Input / Component Fragmentation
- `SearchScreen` search bar is a raw `TextInput` inside a styled `View`; should use `AppInput` with prefix icon.
- Tab switcher in `SearchScreen` uses three `AppButton` instances with hardcoded active states; should use `AppSegmentControl`.
- `ItemDetailScreen` collection modal uses raw `TextInput` and `TouchableOpacity` instead of `AppInput` and `AppButton`.
- Collection list items in modal use raw styles instead of `SettingsCell` or a new `CollectionListItem` primitive.

### G. Missing Motion & Feedback
- No `Reanimated` entrance animations on masonry grid items in saved/wishlist tabs.
- No haptic feedback when adding/removing from collections.
- No skeleton loader for the `showWishlistLoadingState` in `SearchScreen` — raw `View` blocks with hardcoded sizes.

### H. Accessibility Gaps
- Saved tab grid items in `SearchScreen` use `visualOnly={true}`, so product info (price, size, seller) is hidden from sighted users and potentially screen readers.
- `FavouritesScreen` grid uses `showSeller={true}` but no `accessibilityLabel` on the `MasonryGrid` item pressables.
- `ItemDetailScreen` collection modal items lack `accessibilityRole` and `accessibilityState` for selected/unselected.

---

## 3. Upgrade Plan

### Phase 1 — Foundation & Cleanup

#### 1.1 Remove or Repurpose `FavouritesScreen`
Since `FavouritesScreen` is orphaned and its entire purpose is superseded by `SearchScreen` tabs:
- **Option A (Recommended)**: Delete `FavouritesScreen.tsx`, remove `Favourites` route from `AppNavigator.tsx` and `navigation/types.ts`.
- **Option B**: Repurpose it as a standalone `ClosetScreen` if we want a dedicated tab later.

#### 1.2 Create `ClosetScreen` (Dedicated Saved Hub)
Extract the saved/wishlist/collections logic out of `SearchScreen` into a new top-level screen:
- Route: `Closet` in `RootStackParamList`
- Header: Reuse `SettingsHeader` pattern (back button + title + optional action)
- Tabs: `AppSegmentControl` with segments: **Saved** | **Wishlist** | **Collections**
- Remove the dead `WATCHLIST` duplicate segment.

#### 1.3 Build `CollectionDetailScreen`
Implement the dead `CollectionDetail` route:
- Fetch collection by ID from store
- Render `MasonryGrid` of collection items
- Header shows collection name, item count, and cover image (if set)
- Actions: Rename (inline or modal), Delete (confirmation modal), Share
- Empty state: `EmptyState` with "Browse items to add to this collection" CTA

#### 1.4 Build `CollectionsManagerScreen` (or inline in ClosetScreen)
- Grid or list of user's collections
- Each card shows: cover image thumbnail, collection name, item count, updated date
- Tap → `CollectionDetail`
- Long-press / trailing action → Rename / Delete
- Floating action button → Create new collection (uses `AppButton` + `AppInput` modal)

#### 1.5 Centralize Theme Colors
Audit and remove all inline `IS_LIGHT ? ... : ...` blocks in:
- `SearchScreen.tsx`
- `ItemDetailScreen.tsx` (collection modal styles)
Replace with `Colors.*`, `Colors.surfaceAlt`, `Colors.success`, and `Colors.textPrimary`.

#### 1.6 Migrate to Design System Typography
Replace all raw `fontSize` / `fontFamily` / `fontWeight` in affected files with:
- `Type.title` / `Type.subtitle` for headers
- `Type.body` / `Type.price` for row labels and prices
- `Type.meta` for section labels and counts
- `Type.caption` for secondary info

### Phase 2 — ClosetScreen Overhaul

#### 2.1 Header & Search
- Use `SettingsHeader` (or a new `ListScreenHeader`) with:
  - Left: back button (if pushed from profile) or dismiss (if modal)
  - Center: "Closet" title using `Type.subtitle`
  - Right: count badge using `Type.meta`
- Add a real search bar using `AppInput` with `prefixIcon="search"` that filters current tab only.

#### 2.2 Tab Content: Saved Tab
- Render `MasonryGrid` with `visualOnly={false}` so price, size, and seller info is visible.
- Enable `showSaveButton={true}` so users can remove from Saved inline.
- Add entrance animation: wrap grid in `Reanimated.View` with `FadeInDown` staggered.

#### 2.3 Tab Content: Wishlist Tab
- Same grid treatment as Saved.
- Add `AnimatedHeart` toggle on each card (already present in `ProductCardV2`).

#### 2.4 Tab Content: Collections Tab
- Render collections as a vertical list of `AppCard` (variant="elevated") rows.
- Each row: cover image thumbnail (3-item collage or first item), name, item count, chevron.
- Tap → `CollectionDetail`
- Swipe-to-delete or trailing "..." menu for Rename/Delete.

#### 2.5 Empty States
- Saved: `EmptyState icon="bookmark-outline" title="No saved products" subtitle="Tap the bookmark on any product to save it here." ctaLabel="Browse"`
- Wishlist: `EmptyState icon="heart-outline" title="Your wishlist is empty" subtitle="Heart items to track them."`
- Collections: `EmptyState icon="folder-open-outline" title="No collections yet" subtitle="Group your saved items into boards." ctaLabel="Create Collection"`

#### 2.6 Sort & Filter Bar
- Add a sub-header bar with:
  - Sort dropdown: Recently Saved, Price: Low-High, Price: High-Low, Newest
  - Filter chip: Category, Size, Brand (if data supports)

### Phase 3 — ItemDetail Collection Modal Upgrade

#### 3.1 Redesign Modal UI
- Wrap modal content in `AppCard variant="elevated"` instead of raw `View`.
- Use `SettingsCell variant='toggle'` for the "Save for later" row.
- Use `SettingsCell` (or new `CollectionRow`) for each collection with:
  - Left: thumbnail grid or first item image
  - Center: collection name + item count in `Type.caption`
  - Right: checkmark circle if selected
- Add haptic feedback (`haptic.light()` / `haptic.success()`) on toggle.

#### 3.2 Create Collection Input
- Replace raw `TextInput` with `AppInput`.
- Replace raw `TouchableOpacity` "Create" button with `AppButton size="sm"`.

#### 3.3 Accessibility
- `accessibilityRole="button"` on all collection rows
- `accessibilityState={{ selected }}` for selected collections
- `accessibilityLabel="Save to ${collection.name} collection"`

### Phase 4 — SearchScreen De-cluttering

#### 4.1 Remove Closet Tabs from SearchScreen
- Remove `closetTabs`, `activeTab`, `filteredSaved`, `filteredWishlist`, `filteredWatchlist` logic.
- `SearchScreen` should focus purely on discovery: trending, categories, looks, search results.
- Add a single "Closet" shortcut row or FAB that pushes the new `ClosetScreen`.

#### 4.2 Keep Saved Looks (if desired)
- If the "Saved Looks" feature (mock data only, `SAVED_LOOKS`) is still desired, move it to `ClosetScreen` as a fourth tab or nested section.

### Phase 5 — Navigation & Entry Points

#### 5.1 MyProfileScreen Quick Access
- Add a "Closet" quick-access tile in `MyProfileScreen` (next to Orders, Listings, etc.) that pushes `ClosetScreen`.
- Badge the tile with total saved + wishlist count.

#### 5.2 ItemDetail Entry
- Keep the existing bookmark/collection modal entry point.
- Add a contextual "View in Closet" link after saving.

#### 5.3 Settings Entry
- Add "Closet" or "Saved Items" row in `SettingsScreen` under Preferences/Account that pushes `ClosetScreen`.

### Phase 6 — Accessibility & Polish

#### 6.1 Accessibility Audit
- Ensure every product card in grid has `accessibilityLabel` including title, price, and seller.
- Ensure tab switcher announces active tab on change.
- Ensure collection actions (rename/delete) have confirmation spoken via screen reader.

#### 6.2 Loading & Empty States
- Skeleton loaders for async data (already partially present; standardize on `SkeletonLoader` component).
- `EmptyState` for every tab and screen.

#### 6.3 Scroll Behavior
- Add `useAnimatedScrollHandler` to `ClosetScreen` header for subtle elevation change on scroll (consistent with `HomeScreen` / `MyProfileScreen`).

---

## 4. Files to Create / Modify

### New Screens
- `frontend/src/screens/ClosetScreen.tsx` — Dedicated Saved/Wishlist/Collections hub
- `frontend/src/screens/CollectionDetailScreen.tsx` — Individual collection view

### New Components
- `frontend/src/components/closet/CollectionCard.tsx` — Collection list item with thumbnail
- `frontend/src/components/closet/CollectionGrid.tsx` — Collections grid/list
- `frontend/src/components/closet/SaveToCollectionModal.tsx` — Extracted from `ItemDetailScreen` collection modal

### Modified Screens
- `frontend/src/screens/SearchScreen.tsx` — Remove closet tabs, add Closet entry shortcut
- `frontend/src/screens/ItemDetailScreen.tsx` — Replace inline collection modal with new `SaveToCollectionModal`
- `frontend/src/screens/MyProfileScreen.tsx` — Add Closet quick-access tile
- `frontend/src/screens/SettingsScreen.tsx` — Add Closet settings row

### Modified Navigation
- `frontend/src/navigation/types.ts` — Remove `Favourites`, add `Closet`, keep `CollectionDetail`
- `frontend/src/navigation/AppNavigator.tsx` — Remove `FavouritesScreen`, add `ClosetScreen` and `CollectionDetailScreen`

### Deleted
- `frontend/src/screens/FavouritesScreen.tsx` (orphaned, no references)

---

## 5. Success Criteria

1. `FavouritesScreen` is removed; no orphaned routes remain.
2. `SearchScreen` no longer contains saved/wishlist/watchlist tabs — it is purely discovery.
3. A dedicated `ClosetScreen` exists with **Saved**, **Wishlist**, and **Collections** tabs (no duplicate watchlist).
4. `CollectionDetailScreen` is implemented and reachable from `ClosetScreen`.
5. No inline `IS_LIGHT ? ... : ...` color constants remain in `SearchScreen`, `ItemDetailScreen` modal, or new closet files.
6. All typography in affected files uses `Type` or `T` design tokens.
7. `AppInput`, `AppButton`, `AppCard`, and `AppSegmentControl` are used everywhere instead of raw RN primitives.
8. All interactive save/collection actions provide haptic feedback.
9. Grid items use `Reanimated` entrance animations (`FadeInDown` staggered).
10. Every interactive element has correct `accessibilityRole`, `accessibilityLabel`, and `accessibilityHint`.
11. Empty states exist for every tab and screen with contextual CTAs.
