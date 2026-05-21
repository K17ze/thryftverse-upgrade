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

---

# ThryftVerse — Inbox / Messaging UI/UX Upgrade Plan

## 1. Current State Audit

### Screens Analyzed
- `InboxScreen.tsx` — Main inbox hub with conversation list, search, segments, quick filters
- `ChatScreen.tsx` — Individual chat thread with messages, offers, composer, controls
- `CreateGroupChatScreen.tsx` — Group chat creation with member selection
- `GroupBotDirectoryScreen.tsx` — Bot deployment / removal for group chats

### Components Analyzed
- `ChatMessageList.tsx` — FlashList/FlatList wrapper with date separators
- `ChatMessageItem.tsx` — Message bubble primitive (text, status, avatar placeholder)
- `SwipeableMessage.tsx` — PanResponder swipe-to-reply wrapper
- `VoiceMessagePlayer.tsx` — Voice message waveform player
- `TypingIndicator.tsx` — Animated dot typing indicator
- `AttachmentMenu.tsx` — Bottom-sheet attachment picker modal
- `OfferBubble.tsx` — Offer/counter/accept/decline bubble
- `MessageStatusIndicator.tsx` — Read receipt / sent / delivered / failed indicator

### Design System in Use (App-wide)
- **Colors**: `Colors.background`, `Colors.surface`, `Colors.surfaceAlt`, `Colors.brand`, `Colors.textPrimary/Secondary/Muted`, `Colors.border`, `Colors.danger`, `Colors.success`, `Colors.textInverse`
- **Spacing**: `Space.xs/sm/md/lg/xl/xxl` (4px base grid)
- **Radius**: `Radius.sm/md/lg/xl/full` (4/8/12/16/999)
- **Elevation**: `Elevation.none/subtle/card/floating/modal`
- **Typography**: `Type.title/subtitle/body/price/caption/meta/priceLarge`
- **Components**: `AppButton`, `AppCard` (surface/elevated/brand/tint), `AppInput`, `AppSegmentControl`, `AnimatedPressable`, `T` (text primitive), `SettingsHeader`

---

## 2. Critical Inconsistencies Found

### A. Header Pattern Fragmentation
Every messaging surface invents its own header:

| Screen | Back Button | Title Style | Right Action |
|--------|-------------|-------------|--------------|
| InboxScreen | None (tab root) | `hugeTitle` (30px) + subtitle | "New Group" button + shield icon |
| ChatScreen | 44x44 rounded square | `headerHandle` (19px bold) + meta | Info icon / Bot directory icon |
| CreateGroupChatScreen | 44x44 rounded square | `headerTitle` (18px bold) | 44px spacer |
| GroupBotDirectoryScreen | 44x44 rounded square | `headerTitle` (18px bold) + subtitle | 44px spacer |

**Problem**: No unified "Messaging Header" component. Chat and sub-screens use completely different header structures from `SettingsHeader` and each other.

### B. Massive Hardcoded Theme-Aware Color Blocks
`ChatScreen.tsx` contains the largest inline theme switch block in the entire codebase:

```tsx
const IS_LIGHT = ActiveTheme === 'light';
const ACCENT = IS_LIGHT ? '#2f251b' : '#d7b98f';
const CARD = IS_LIGHT ? '#ffffff' : '#111111';
const CARD_ALT = IS_LIGHT ? '#f3eee7' : '#1a1a1a';
const BORDER = IS_LIGHT ? '#d8d1c6' : '#2a2a2a';
const HEADER_BG = IS_LIGHT ? 'rgba(247,245,241,0.96)' : 'rgba(10, 10, 10, 0.95)';
const FOOTER_BG = IS_LIGHT ? 'rgba(236,234,230,0.96)' : 'rgba(10,10,10,0.95)';
```

**Problem**: These override `Colors.*` tokens entirely. Any dark-mode refinement to the global palette does not propagate to chat. This is exactly the anti-pattern that was purged from Settings.

### C. Typography Token Abandonment (Severe)
Messaging screens use raw font sizes and families instead of the `Type` scale. Examples:

| Style Name | Current | Should Be |
|------------|---------|-------------|
| `hugeTitle` | `fontSize: 30, family: Inter_700Bold` | `Type.title` |
| `headerHandle` | `fontSize: 19, family: Inter_700Bold` | `Type.subtitle` |
| `headerMetaText` | `fontSize: 11, family: Inter_500Medium` | `Type.meta` |
| `senderName` | `fontSize: 15, family: Inter_600SemiBold` | `Type.price` |
| `snippet` | `fontSize: 14, family: Inter_400Regular` | `Type.body` |
| `bubbleText` | `fontSize: 15, family: Inter_500Medium` | `Type.body` |
| `offerPrice` | `fontSize: 28, family: Inter_700Bold` | `Type.priceLarge` |
| `statusTitle` | `fontSize: 16, family: Inter_700Bold` | `Type.subtitle` |
| `statusBody` | `fontSize: 14, family: Inter_400Regular` | `Type.body` |
| `dateLabelText` | `fontSize: 12, family: Inter_600SemiBold` | `Type.caption` |
| `time` | `fontSize: 11, family: Inter_400Regular` | `Type.caption` |
| `groupMetaText` | `fontSize: 11, family: Inter_500Medium` | `Type.meta` |
| `templateChipText` | `fontSize: 11, family: Inter_600SemiBold` | `Type.meta` |
| `groupBotLabel` | `fontSize: 11, family: Inter_600SemiBold` | `Type.meta` |
| `botName` | `fontSize: 15, family: Inter_700Bold` | `Type.price` |
| `botCategory` | `fontSize: 10, family: Inter_600SemiBold` | `Type.meta` |

**Problem**: Over 30+ raw typography declarations. The luxury aesthetic depends on a restrained, consistent type system.

### D. Card / Surface Style Drift
Messaging surfaces do not use `AppCard` consistently:

- `InboxScreen`: `messageCard` uses `borderRadius: 22`, raw `Colors.surface` + `Colors.border` — not `AppCard`
- `ChatScreen`: `itemCard`, `groupSummaryCard`, `groupBotRow`, `controlPanel`, `inboxScopeCard`, `opsSummaryCard` — all custom-styled with raw `CARD`, `BORDER`, `CARD_ALT`
- `CreateGroupChatScreen`: `titleCard`, `searchCard`, `memberRow` — all custom
- `GroupBotDirectoryScreen`: `botCard` — custom `borderRadius: 18`

**Problem**: No standardized card primitive for messaging surfaces. Every card looks slightly different.

### E. Input Style Fragmentation
Multiple inline input clones exist:

- `ChatScreen`: `textInput` inside `inputFloatingPill` (raw `TextInput`, borderRadius 30, custom padding)
- `CreateGroupChatScreen`: `TextInput` for group title and member search (no `AppInput` usage)
- `GroupBotDirectoryScreen`: no input, but `deployBtn` is custom

The app has `AppInput` (borderRadius 10, `Colors.surface`, `Colors.border`, prefix/suffix support, error states, helper text). Messaging screens ignore it.

### F. Spacing Inconsistencies
- `paddingHorizontal: 18`, `paddingHorizontal: 20` instead of `Space.md` (16) or `Space.lg` (24)
- `gap: 14` instead of `Space.sm` (8) or `Space.md` (16)
- `marginVertical: 8` instead of `Space.sm`
- `borderRadius: 22` on header buttons instead of `Radius.md` (8) or `Radius.lg` (12)
- `borderRadius: 24` on message bubbles instead of `Radius.xl` (16)

### G. Missing Motion & Feedback
- `SwipeableMessage` uses old `PanResponder` + `Animated` API instead of Reanimated
- `Swipeable` actions in `InboxScreen` (`renderRightActions`, `renderLeftActions`) have no haptic feedback
- Send button, template chips, control toggles, offer actions — no haptic feedback
- `AttachmentMenu` uses `TouchableOpacity` instead of `AnimatedPressable`
- `VoiceMessagePlayer` uses `TouchableOpacity` instead of `AnimatedPressable`
- `OfferBubble` action buttons use `TouchableOpacity` instead of `AppButton` / `AnimatedPressable`

### H. Component Primitive Issues

#### `ChatMessageItem.tsx`
- Uses `Typography.family.regular` (old system), not `Type` tokens
- Avatar uses text initial placeholder instead of `CachedImage` fallback
- No `showAvatar` prop actually used; avatars are never rendered for DMs
- Message status indicator only shows for outgoing; incoming messages lack timestamp integration

#### `SwipeableMessage.tsx`
- Uses legacy `Animated.Value` + `PanResponder` instead of Reanimated
- `TouchableOpacity` is imported but unused
- Hardcoded `backgroundColor: 'rgba(0, 0, 0, 0.3)'` for action icon
- No haptic on swipe threshold trigger

#### `VoiceMessagePlayer.tsx`
- Hardcoded `#FFFFFF`, `rgba(255,255,255,0.3)`, `rgba(0,0,0,0.1)` instead of theme-aware colors
- Uses `TouchableOpacity` instead of `AnimatedPressable`
- Waveform width is hardcoded to 200 instead of measured layout

#### `AttachmentMenu.tsx`
- Uses `TouchableOpacity` instead of `AnimatedPressable`
- Title uses raw `fontSize: 18, fontWeight: '600'` instead of `Type.subtitle`
- Option labels use raw `fontSize: 13` instead of `Type.caption`

#### `OfferBubble.tsx`
- Uses `Image` instead of `CachedImage`
- Raw typography everywhere (`fontSize: 24`, `fontWeight: '700'`, etc.)
- Action buttons use `TouchableOpacity` instead of `AppButton`
- `discountBadge` uses `#FFFFFF` hardcoded

#### `MessageStatusIndicator.tsx`
- `timestamp` uses raw `fontSize: 11, fontWeight: '400'` instead of `Type.caption`
- `iconContainer` uses fixed pixel dimensions without `Space` tokens

### I. Dead / Unused Code
- `ChatScreen` imports `ChatMessageList` but only uses `SimpleChatMessageList` (the FlatList fallback)
- `ChatMessageList.tsx` contains a full `FlashList` implementation that is never consumed
- `SwipeableMessage` is imported in `ChatScreen` but never actually wraps messages (commented out or unused in render)

### J. Keyboard & Composer Issues
- `ChatScreen` uses raw `KeyboardAvoidingView` but no `KeyboardAwareScrollView` pattern
- Composer `TextInput` has no `AppInput` wrapper, so no error states, labels, or helper text
- `returnKeyType="send"` is present but platform behavior is inconsistent
- No mention of `InputAccessoryView` for rich composer features

### K. Accessibility Gaps
- `CachedImage` container styles in `InboxScreen` are inline objects, not stylesheet references
- `ChatScreen` status block has an `AnimatedPressable` without `accessibilityRole` on the inner text link
- `VoiceMessagePlayer` has no `accessibilityLabel` on play/pause or speed toggle
- `AttachmentMenu` option buttons lack `accessibilityRole` and `accessibilityHint`
- `OfferBubble` action buttons lack `accessibilityRole` and `accessibilityHint`

---

## 3. Upgrade Plan

### Phase 1 — Foundational Primitives (needed before any screen work)

#### 1.1 Create `ChatHeader` Component
A reusable header for all messaging subpages:
- Left: `AnimatedPressable` back button (44x44, `Radius.md`, `Colors.surface`)
- Center: Title using `Type.subtitle`, subtitle/meta using `Type.meta`
- Right: Optional action slot (info icon, bot directory icon, or spacer)
- Supports both DM mode (avatar + handle + location/last-seen) and Group mode (title + member count)
- Uses `SafeAreaView` insets correctly
- Haptic feedback on back press

#### 1.2 Create `MessageBubble` Primitive
Standardized message bubble component:
- Supports `variant='me' | 'them'` with correct `Radius.xl` + asymmetric tail radius
- Uses `Colors.brand` for me, `Colors.surface` + `Colors.border` for them
- Integrates `MessageStatusIndicator` for outgoing messages
- Integrates timestamp using `Type.caption`
- Supports `senderLabel` for group chats using `Type.meta`
- Uses `Reanimated` `FadeIn` for entrance animation
- Replaces raw `textBubble` styles in `ChatScreen`

#### 1.3 Create `ComposerInput` Primitive
Standardized chat composer input:
- Wraps `AppInput` with `variant='chat'` or dedicated chat mode
- Prefix slot for camera/attachment button
- Suffix slot for send button (`AnimatedPressable` with haptic)
- Template strip above input (horizontal scroll of quick-reply chips)
- Uses `Colors.surface`, `Radius.full` (pill shape), `Colors.border`
- Supports `KeyboardAvoidingView` integration

#### 1.4 Create `ChatCard` Wrapper
Standardized card for messaging surfaces:
- Uses `AppCard` with `variant='surface'` or `'elevated'`
- Enforces `Radius.lg` (12px) or `Radius.xl` (16px) consistently
- Used for context cards (item preview, group summary), control panels, and bot rows

#### 1.5 Migrate `SwipeableMessage` to Reanimated
- Replace `PanResponder` + `Animated.Value` with `useSharedValue` + `useAnimatedGestureHandler`
- Add haptic feedback on swipe threshold trigger
- Keep reply (right swipe on others) and actions (left swipe on me) behavior
- Use theme-aware colors for background reveal layer

### Phase 2 — InboxScreen Overhaul

#### 2.1 Adopt Unified Header
- Replace custom `hugeTitle` header with standardized header pattern
- Keep "New Group" and shield action buttons but styled with `AppButton` and `AnimatedPressable`
- Use `Type.title` for screen title, `Type.caption` for subtitle

#### 2.2 Migrate Search to `AppInput`
- Remove `searchWrap` and `searchInput` raw style overrides
- Use `AppInput` with `prefix` and `suffix` props only
- Use `inputContainerStyle` minimally (only radius tweaks if needed)

#### 2.3 Migrate Conversation Cards to `ChatCard`
- Replace `messageCard` raw styles with `ChatCard` / `AppCard`
- Ensure `Radius.lg` and `Elevation.subtle` for consistent surface feel
- Keep swipe actions but add haptic feedback on delete/archive

#### 2.4 Typography Token Migration
- `hugeTitle` → `Type.title`
- `senderName` → `Type.price`
- `snippet` → `Type.body`
- `time` → `Type.caption`
- `groupMetaText` → `Type.meta`
- `listMeta` → `Type.caption`

#### 2.5 Centralize Theme Colors
- Remove hardcoded `'#4caf50'` online dot → `Colors.success`
- Remove hardcoded `'#FF3B30'` swipe delete → `Colors.danger`
- Remove hardcoded `'#fff'` swipe text → `Colors.textInverse`

#### 2.6 Add Entrance Animations
- Keep existing `FadeInDown` stagger on conversation rows
- Add `AnimatedPressable` scale feedback on every conversation card press

#### 2.7 Accessibility Polish
- Move inline `CachedImage` container styles to stylesheet
- Ensure every conversation row has complete `accessibilityLabel` (title, unread state, last message preview)
- Ensure swipe actions announce "Delete conversation" and "Archive conversation" correctly

### Phase 3 — ChatScreen Overhaul

#### 3.1 Remove All Inline Theme Color Constants
- Delete `IS_LIGHT`, `ACCENT`, `CARD`, `CARD_ALT`, `BORDER`, `HEADER_BG`, `FOOTER_BG`
- Replace every usage with `Colors.*` tokens:
  - `CARD` → `Colors.surface`
  - `CARD_ALT` → `Colors.surfaceAlt`
  - `BORDER` → `Colors.border`
  - `HEADER_BG` → `Colors.background` + opacity, or use `Colors.surface` with `Elevation.subtle`
  - `FOOTER_BG` → `Colors.surface` with `Elevation.subtle`
  - `ACCENT` → `Colors.brand`
  - `TEXT` → `Colors.textPrimary`
  - `MUTED` → `Colors.textMuted`

#### 3.2 Adopt `ChatHeader`
- Replace custom editorial header with `ChatHeader` component
- Wire DM avatar, handle, location/last-seen through props
- Wire Group title, member count through props

#### 3.3 Migrate Context Cards to `ChatCard`
- `itemCard` (TaggedItemCard) → `ChatCard` / `AppCard variant='elevated'`
- `groupSummaryCard` → `ChatCard`
- `groupBotRow` → `ChatCard`
- `controlPanel` → `ChatCard`
- `inboxScopeCard` → `ChatCard`
- `opsSummaryCard` → `ChatCard`

#### 3.4 Migrate Composer to `ComposerInput`
- Replace raw `TextInput` inside `inputFloatingPill` with `ComposerInput`
- Keep camera button, send button, template strip behavior
- Add haptic feedback on send

#### 3.5 Migrate Message Rendering to `MessageBubble`
- Replace `textBubble` / `textBubbleMe` raw styles with `MessageBubble`
- Replace `offerBubble` / `offerBubbleMe` raw styles with `OfferBubble` (upgraded) or `MessageBubble`
- Integrate `SwipeableMessage` (Reanimated version) as wrapper

#### 3.6 Typography Token Migration
- `headerHandle` → `Type.subtitle`
- `headerMetaText` → `Type.meta`
- `bubbleText` → `Type.body`
- `bubbleTextMe` → `Type.body` with `Colors.textInverse`
- `offerPrice` → `Type.priceLarge`
- `offerOriginal` → `Type.caption`
- `statusTitle` → `Type.subtitle`
- `statusBody` → `Type.body`
- `dateLabelText` → `Type.caption`
- `templateChipText` → `Type.meta`
- `groupSenderLabel` → `Type.meta`

#### 3.7 Add Haptic & Motion Feedback
- Light haptic on send button press
- Medium haptic on offer accept/decline
- Light haptic on template chip press
- Light haptic on control toggle switches
- `FadeIn` / `SlideInRight` / `SlideInLeft` on message bubbles (already partially present; ensure all use `reducedMotionEnabled` check)

#### 3.8 Fix Keyboard Handling
- Ensure `KeyboardAvoidingView` behavior is `padding` on iOS, `height` on Android
- Verify composer stays above keyboard on all screen sizes

### Phase 4 — Subpage Unification

#### 4.1 `CreateGroupChatScreen`
- Adopt `SettingsHeader` (or `ChatHeader`) for unified header
- Replace raw `TextInput` with `AppInput` for group title and search
- Replace `titleCard` / `searchCard` / `memberRow` with `ChatCard` / `AppCard`
- Migrate typography to `Type` tokens
- Add haptic feedback on member selection and group creation
- Add `FadeInDown` entrance animation on member rows

#### 4.2 `GroupBotDirectoryScreen`
- Adopt `SettingsHeader` (or `ChatHeader`) for unified header
- Replace `botCard` raw styles with `ChatCard` / `AppCard`
- Migrate typography to `Type` tokens
- Replace custom `deployBtn` with `AppButton` (variant toggle between secondary/primary)
- Add haptic feedback on deploy/remove
- Add `FadeInDown` entrance animation on bot cards

### Phase 5 — Component Polish

#### 5.1 `ChatMessageItem.tsx`
- Migrate to `Type` tokens
- Replace `Typography.family.regular` with `Type.body` fontFamily resolution
- Use `CachedImage` for avatars (even as fallback) instead of text placeholder
- Integrate `MessageBubble` for the actual bubble rendering
- Keep `DateSeparator` but use `Type.caption`

#### 5.2 `SwipeableMessage.tsx` (Reanimated Migration)
- Replace `PanResponder` + `Animated.Value` with `useSharedValue` + `useAnimatedGestureHandler`
- Add haptic feedback on reply/actions trigger
- Use theme-aware colors for background reveal layer (`Colors.brand` for reply, `Colors.textMuted` for actions)
- Remove unused `TouchableOpacity` import

#### 5.3 `VoiceMessagePlayer.tsx`
- Replace `TouchableOpacity` with `AnimatedPressable`
- Replace hardcoded `#FFFFFF` / `rgba(255,255,255,0.3)` with `Colors.textInverse` / theme-aware opacity
- Replace hardcoded `rgba(0,0,0,0.1)` with `Colors.border` or `Colors.textMuted` at low opacity
- Use `Type.caption` for duration text, `Type.meta` for speed text
- Measure waveform width via `onLayout` instead of hardcoded 200

#### 5.4 `AttachmentMenu.tsx`
- Replace `TouchableOpacity` with `AnimatedPressable`
- Use `Type.subtitle` for title, `Type.caption` for option labels
- Use `Radius.lg` / `Radius.xl` for sheet corners and icon containers
- Add `accessibilityRole` and `accessibilityHint` to every option

#### 5.5 `OfferBubble.tsx`
- Replace `Image` with `CachedImage`
- Use `AppButton` for Accept / Counter / Decline actions
- Migrate all typography to `Type` tokens
- Use `Colors.textInverse` instead of `#FFFFFF`
- Use `ChatCard` / `AppCard` for container

#### 5.6 `MessageStatusIndicator.tsx`
- Use `Type.caption` for timestamp
- Use `Space` tokens for container gaps and icon container sizing

---

## 4. Files to Create / Modify

### New Components
- `frontend/src/components/chat/ChatHeader.tsx` — Unified header for Chat and messaging subpages
- `frontend/src/components/chat/MessageBubble.tsx` — Standardized message bubble primitive
- `frontend/src/components/chat/ComposerInput.tsx` — Standardized chat composer with AppInput base
- `frontend/src/components/chat/ChatCard.tsx` — Standardized card wrapper for messaging surfaces (wraps AppCard)

### Modified Screens
- `frontend/src/screens/InboxScreen.tsx` — unified header, AppInput search, ChatCard conversation rows, Type tokens, centralized colors
- `frontend/src/screens/ChatScreen.tsx` — remove inline color constants, ChatHeader, ChatCard context cards, ComposerInput, MessageBubble, Type tokens
- `frontend/src/screens/CreateGroupChatScreen.tsx` — SettingsHeader, AppInput, ChatCard, Type tokens
- `frontend/src/screens/GroupBotDirectoryScreen.tsx` — SettingsHeader, AppCard/ChatCard, AppButton, Type tokens

### Modified Components
- `frontend/src/components/ChatMessageItem.tsx` — Type tokens, CachedImage avatar, MessageBubble integration
- `frontend/src/components/SwipeableMessage.tsx` — Reanimated migration, haptic feedback, theme-aware colors
- `frontend/src/components/VoiceMessagePlayer.tsx` — AnimatedPressable, theme-aware colors, Type tokens, onLayout measurement
- `frontend/src/components/AttachmentMenu.tsx` — AnimatedPressable, Type tokens, Radius tokens, accessibility
- `frontend/src/components/OfferBubble.tsx` — CachedImage, AppButton, Type tokens, ChatCard container
- `frontend/src/components/MessageStatusIndicator.tsx` — Type tokens, Space tokens
- `frontend/src/components/ChatMessageList.tsx` — Remove dead FlashList code if still unused, or wire it properly

---

## 5. Success Criteria

1. All messaging screens (Inbox, Chat, CreateGroupChat, GroupBotDirectory) use the same header, card, and input primitives.
2. No inline `IS_LIGHT ? ... : ...` color constants remain in any messaging screen.
3. All typography in messaging files uses `Type` or `T` design tokens.
4. All cards in messaging use `AppCard` or `ChatCard` instead of raw StyleSheet card clones.
5. All interactive elements provide haptic feedback (send, swipe actions, template chips, offer actions, bot deploy).
6. `SwipeableMessage` uses Reanimated (`useSharedValue`) instead of legacy `Animated.Value` + `PanResponder`.
7. `ChatScreen` composer uses `ComposerInput` / `AppInput` instead of raw `TextInput`.
8. All `TouchableOpacity` in messaging components replaced with `AnimatedPressable`.
9. `VoiceMessagePlayer` uses theme-aware colors instead of hardcoded `#FFFFFF` and `rgba(0,0,0,0.1)`.
10. `OfferBubble` uses `CachedImage` and `AppButton` instead of `Image` and `TouchableOpacity`.
11. Accessibility labels/roles/hints pass a screen-reader walkthrough on all messaging surfaces.
12. Entrance animations use `FadeInDown` / `FadeIn` with `reducedMotionEnabled` guards consistently.
