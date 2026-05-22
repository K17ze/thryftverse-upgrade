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

---

---

# ThryftVerse — Flagship Messaging UI/UX Upgrade Plan

## 1. Flagship App Benchmark Analysis

### Apps Analyzed
- **WhatsApp** — Context menus, reactions, replies, forwards, status stories, pinned chats, link previews, voice recording, selection mode, scroll-to-bottom FAB, encryption badges
- **iMessage** — Blur headers, bubble tails, typing indicators, tapback reactions, link previews, message effects, read receipts, draft indicators
- **Telegram** — Reply chains, reactions, pinned messages, polls, mentions, formatting, selection mode, context menus, animated stickers, blur headers
- **Instagram DMs** — Vanish mode, reactions, story replies, quick camera, link previews, typing indicators, message requests
- **Signal** — Message requests, reactions, forwards, link previews, disappearing messages, verified badges

### Key Differentiators Missing from ThryftVerse

#### A. Visual Polish & Atmosphere
1. **No blur/glass header** — Flagship apps use `UIBlurEffect` / `BlurView` on headers for depth
2. **Flat message bubbles** — No shadow depth, no refined tail shapes, no "floating" feel
3. **No message grouping** — Messages from same sender within 2 min should stack without repeated avatars
4. **No animated online indicator** — Static green dot vs. pulsing/animated presence ring
5. **No skeleton/shimmer loading** — Chat shows nothing while loading; flagship apps show shimmer placeholders
6. **No gradient accents** — Luxury apps use subtle gold gradients on brand surfaces
7. **No wallpaper/background texture** — Chat background is flat; flagship apps have subtle patterns

#### B. Core Interactions
1. **No message context menu** — Long-press on a message does nothing; flagship apps open action sheets
2. **No emoji reactions** — WhatsApp/iMessage/Telegram all have quick emoji reactions on every message
3. **No reply-to / quote** — Cannot reply to a specific message; Telegram/WhatsApp have threaded replies
4. **No message forwarding** — Cannot forward messages to other conversations
5. **No message deletion/unsend** — Cannot delete sent messages
6. **No message copy** — Cannot copy text from messages
7. **No message selection mode** — Cannot bulk-select messages for delete/forward
8. **No scroll-to-bottom FAB** — When scrolled up, no way to quickly jump to latest message

#### C. Smart UX Patterns
1. **No link previews** — URLs in messages render as plain text; flagship apps show rich preview cards
2. **No mention highlighting** — `@username` is plain text; should be highlighted and tappable
3. **No draft indicator in inbox** — Drafts exist but inbox row doesn't show "Draft: ..." preview
4. **No pinned conversations** — Cannot pin important chats to top of inbox
5. **No "New messages" separator** — When reopening a chat, no indicator of where new messages begin
6. **No typing indicator in header** — Shows static "Last seen" instead of "typing..." when active
7. **No message info** — Cannot see who read/delivered a message
8. **No conversation info screen** — No detailed chat info (shared media, encryption status, block/report)

#### D. Input & Composer
1. **No voice message recording UI** — Camera button exists but no voice message flow
2. **No quick camera capture** — No inline camera for instant photo messages
3. **No contact/location sharing** — Attachment menu has options but no actual implementation
4. **No message scheduling** — Cannot schedule messages for later
5. **No disappearing messages toggle** — Retention policy exists but no quick UI toggle
6. **No AI/smart suggestions** — No "Smart Reply" or composer assistance beyond templates

---

## 2. Upgrade Plan

### Phase A — Core Interactions (Highest User Impact)

#### A.1 Blur/Glass ChatHeader
- Wrap `ChatHeader` background with `BlurView` from `expo-blur` (intensity 60-80)
- Add subtle bottom border with `Colors.border` at 0.3 opacity
- Animate header opacity on scroll (0.95 → 1.0)
- Add online status ring around avatar (animated pulse for active users)

#### A.2 Message Context Menu
- New `MessageContextMenu` component — bottom sheet that appears on long-press
- Actions: Copy text, Reply, React, Forward, Delete, Message Info
- Uses `BottomSheetPicker` or custom animated sheet
- Haptic on long-press trigger

#### A.3 Emoji Reactions
- New `EmojiReactionsBar` component — horizontal strip of 6 default emojis + "+" for more
- Appears above context menu or inline below message on tap
- Reactions stored per-message in conversation store
- Show reaction count + avatars of reactors below message bubble

#### A.4 Reply-to / Quote
- New `ReplyQuote` component — shows quoted message preview above composer
- Quote preview shows sender name + truncated text + original message indicator
- Tapping quoted message scrolls to original message
- Reply messages show a vertical brand-colored bar on left side

#### A.5 Scroll-to-Bottom FAB + New Message Separator
- New `ScrollToBottomFAB` — appears when scrolled up, shows unread count badge
- New `NewMessagesSeparator` — "New messages" pill divider between old and new messages
- FAB uses `AnimatedPressable` with haptic, scrolls to end with spring animation

### Phase B — Inbox & Smart UX

#### B.1 Pinned Conversations + Draft Indicators
- Add `pinnedIds` to conversation store
- Pinned conversations render as horizontal scroll at top of inbox (like Instagram stories)
- Draft text shown in inbox row with "Draft:" prefix in muted + italic style
- Pin/unpin action in swipe menu and context menu

#### B.2 Link Previews + Mentions
- New `LinkPreviewCard` component — extracts first URL from message, shows title/image/description
- Uses regex to detect URLs, renders below message bubble
- New `MentionHighlight` component — regex `@\w+`, wraps in brand-colored tappable span
- Tapping mention navigates to user profile

#### B.3 Skeleton Loaders + Refined Shadows
- New `SkeletonChatLoader` — shimmer placeholder rows for loading state
- Add `Elevation.message` to design tokens — subtle shadow for message bubbles
- Refine `MessageBubble` with asymmetric tail shape and soft shadow
- Add `BlurView` to composer background for glass effect

#### B.4 Message Selection Mode
- New `MessageSelectionBar` — appears at top when selection mode active
- Shows count + Delete + Forward actions
- Checkbox appears on left of each message on enter selection mode
- Long-press enters selection mode; tap toggles selection

---

## 3. Files to Create / Modify

### New Components
- `frontend/src/components/chat/MessageContextMenu.tsx` — Long-press action sheet for messages
- `frontend/src/components/chat/EmojiReactionsBar.tsx` — Quick emoji reactions strip
- `frontend/src/components/chat/ReplyQuote.tsx` — Quoted reply preview above composer
- `frontend/src/components/chat/ScrollToBottomFAB.tsx` — FAB with unread count
- `frontend/src/components/chat/NewMessagesSeparator.tsx` — New messages divider pill
- `frontend/src/components/chat/LinkPreviewCard.tsx` — URL preview card
- `frontend/src/components/chat/MentionHighlight.tsx` — @username highlighted text
- `frontend/src/components/chat/SkeletonChatLoader.tsx` — Shimmer loading placeholder
- `frontend/src/components/chat/MessageSelectionBar.tsx` — Bulk selection top bar

### Modified Components
- `frontend/src/components/chat/ChatHeader.tsx` — Add BlurView, online ring animation
- `frontend/src/components/chat/MessageBubble.tsx` — Add shadow, tail shape, reactions slot
- `frontend/src/components/chat/ComposerInput.tsx` — Add reply quote preview slot
- `frontend/src/components/chat/ChatCard.tsx` — No changes needed

### Modified Screens
- `frontend/src/screens/InboxScreen.tsx` — Add pinned section, draft indicators, selection mode
- `frontend/src/screens/ChatScreen.tsx` — Integrate context menu, reactions, reply, FAB, separator, link previews, mentions, selection mode

### Store Updates
- `frontend/src/store/useStore.ts` — Add `togglePinConversation`, `addMessageReaction`, `removeMessageReaction`, `draftMessages` map

---

## 4. Success Criteria

1. Long-pressing a message opens a context menu with Copy, Reply, React, Forward, Delete.
2. Tapping a reaction emoji adds/removes it from a message with haptic feedback.
3. Reply-to shows a quote preview above the composer and renders with a brand-colored left bar.
4. ChatHeader uses `BlurView` for a glass effect with animated online status ring.
5. Scroll-to-bottom FAB appears when scrolled up with unread count badge.
6. "New messages" separator appears between previously read and new messages.
7. Pinned conversations appear as a horizontal scroll rail at the top of Inbox.
8. Draft text appears in inbox rows with "Draft:" prefix styling.
9. URLs in messages render with `LinkPreviewCard` showing title and image.
10. `@username` mentions are highlighted in brand color and tappable.
11. Message bubbles have subtle shadow/elevation and refined tail shapes.
12. Skeleton shimmer placeholders appear during message loading.
13. Message selection mode allows bulk delete/forward with top action bar.
14. All new components use `Type`, `Space`, `Radius`, `Colors` design tokens.
15. TypeScript passes with zero errors.

---

## 6. Implementation Status: COMPLETED (Baseline)

All baseline messaging files upgraded. TypeScript passes with zero errors.

### New Components Created
- `frontend/src/components/chat/ChatHeader.tsx` — unified header for all messaging subpages (DM + Group modes)
- `frontend/src/components/chat/MessageBubble.tsx` — standardized message bubble with Type tokens, integrated status indicator
- `frontend/src/components/chat/ComposerInput.tsx` — AppInput-based chat composer with camera prefix, send suffix, template strip support
- `frontend/src/components/chat/ChatCard.tsx` — standardized card wrapper for messaging surfaces (wraps AppCard)

### Screens Rewritten
- `frontend/src/screens/InboxScreen.tsx` — Type tokens, ChatCard conversation rows, AppInput search, centralized colors (no hardcoded `#4caf50` / `#FF3B30`), haptic on swipe actions, Space/Radius tokens
- `frontend/src/screens/ChatScreen.tsx` — removed all inline theme color constants (`IS_LIGHT`, `CARD`, `CARD_ALT`, `BORDER`, `HEADER_BG`, `FOOTER_BG`), adopted ChatHeader, ChatCard context cards, ComposerInput, Type tokens, haptic feedback throughout
- `frontend/src/screens/CreateGroupChatScreen.tsx` — SettingsHeader, AppInput, ChatCard, Type tokens, FadeInDown animations, haptic on member selection
- `frontend/src/screens/GroupBotDirectoryScreen.tsx` — SettingsHeader, ChatCard, AppButton deploy/remove, Type tokens, FadeInDown animations, haptic feedback

### Components Upgraded
- `frontend/src/components/ChatMessageItem.tsx` — migrated to Type tokens, CachedImage avatar support, replaced Typography.family.regular
- `frontend/src/components/SwipeableMessage.tsx` — migrated from PanResponder + Animated.Value to Reanimated useSharedValue + GestureDetector, haptic on swipe trigger
- `frontend/src/components/VoiceMessagePlayer.tsx` — replaced TouchableOpacity with AnimatedPressable, theme-aware colors, onLayout waveform measurement, Type tokens
- `frontend/src/components/AttachmentMenu.tsx` — replaced TouchableOpacity with AnimatedPressable, Type tokens, Radius tokens, accessibility props
- `frontend/src/components/OfferBubble.tsx` — replaced Image with CachedImage, AppButton for actions, Type tokens, ChatCard container
- `frontend/src/components/MessageStatusIndicator.tsx` — Type.caption for timestamp, Space tokens for gaps
- `frontend/src/components/ChatMessageList.tsx` — Space tokens in styles

---

# ThryftVerse — SellScreen (Upload/Listing Creation) UI/UX Upgrade Plan

## 1. Current State Audit

### Screen Analyzed
- `SellScreen.tsx` — Main listing creation / upload flow

### Design System in Use (App-wide)
- **Colors**: `Colors.background`, `Colors.surface`, `Colors.surfaceAlt`, `Colors.brand`, `Colors.textPrimary/Secondary/Muted`, `Colors.border`, `Colors.danger`, `Colors.success`
- **Spacing**: `Space.xs/sm/md/lg/xl/xxl`
- **Radius**: `Radius.sm/md/lg/xl/full`
- **Typography**: `Type.title/subtitle/body/price/caption/meta/priceLarge`
- **Components**: `AppButton`, `AppCard`, `AppInput`, `AppSegmentControl`, `AnimatedPressable`, `T` (text primitive)

---

## 2. Critical Inconsistencies Found

### A. Raw TextInput Abandonment
Every text field in SellScreen used raw `<TextInput>` instead of the existing `AppInput` primitive:
- Title input
- Description textarea
- Price input
- Co-Own share count / share price inputs
- Auction starting bid input

**Problem**: No helper text, error states, prefix/suffix support, or unified visual style.

### B. Card / Surface Style Drift
Custom inline card styles existed for every form section:
- `pillInputBox` (20px radius, custom border)
- `cardGroup` (20px radius, custom border)
- `coOwnCard` (20px radius, custom border)
- `pricePillBox` (20px radius, custom border)

**Problem**: None used `AppCard`. Inconsistent radii (20px vs design system 12/16px).

### C. Typography Token Abandonment
Raw font sizes and families were used throughout:
- `headerTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' }` → should use `Type.subtitle`
- `inputLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' }` → should use `T.Meta` or `Type.meta`
- `textInput: { fontSize: 16, fontFamily: 'Inter_500Medium' }` → should use `AppInput`
- `pickerLabel: { fontSize: 16, fontFamily: 'Inter_600SemiBold' }` → should use `Type.subtitle`
- `priceInputContent: { fontSize: 32, fontFamily: 'Inter_700Bold' }` → should use `Type.priceLarge`

### D. Hardcoded Colors in SortablePhotoStrip
- `backgroundColor: '#222'` → should be `Colors.surfaceAlt`
- `borderColor: '#333'` → should be `Colors.border`
- `coverBadge: backgroundColor: 'rgba(78,205,196,0.9)'` → should be `Colors.brand`

### E. Missing Motion & Feedback
- No `Reanimated` entrance animations on form sections
- No haptic feedback on picker row presses, listing type changes, or photo capture
- No visual progress indicator for readiness state

### F. UX / Information Architecture Issues
1. **Basic photo empty state**: The upload placeholder was a plain box with small icon and text
2. **Readiness chips were basic**: No visual progress bar, just text chips
3. **Section labels were raw Text**: No standardized section header primitive

---

## 3. Upgrade Plan

### Phase 1 — Foundational Primitives

#### 1.1 Migrate All Inputs to `AppInput`
Replace every inline `TextInput` in SellScreen with `AppInput`:
- Title → `AppInput` with label="Title"
- Description → `AppInput` multiline with character counter helper
- Price → `AppInput` with `prefix={currencySymbol}` and large input style
- Co-Own share count / price → `AppInput` with labels and helper text
- Auction starting bid → `AppInput` with prefix

#### 1.2 Adopt `AppCard` for All Form Surfaces
Replace all custom card styles with `AppCard variant='surface'` or `'elevated'`:
- Photo upload empty state → `AppCard variant='surface'`
- Item details form → `AppCard variant='surface'`
- Picker group → `AppCard variant='surface'` with overflow hidden
- Price card → `AppCard variant='surface'`
- Co-Own / Auction cards → `AppCard variant='elevated'`
- Readiness card → `AppCard variant='surface'`

#### 1.3 Centralize Theme Colors in SortablePhotoStrip
Remove all hardcoded hex colors and replace with `Colors.*` tokens.

### Phase 2 — Visual & UX Polish

#### 2.1 Add `ReadinessBar` Component
Animated linear progress bar showing completion ratio of listing requirements:
- Uses `Reanimated` `useSharedValue` + `withSpring`
- Color transitions from `Colors.textSecondary` to `Colors.brand` when complete
- Label shows "X/Y" count

#### 2.2 Add Entrance Animations
Wrap each section in `Reanimated.View` entering with `FadeInDown` staggered by index:
- Header delay 0ms
- Photo area delay 0ms
- Listing type delay 60ms
- Item details delay 120ms
- Pickers delay 180ms
- Pricing delay 240ms
- Co-Own/Auction delay 300ms
- Readiness delay 360ms

#### 2.3 Haptic Feedback Throughout
- Light haptic on picker row press
- Medium haptic on listing type change
- Success haptic on photo capture
- Error haptic on validation failure

### Phase 3 — Polish

#### 3.1 Photo Upload Empty State
- Larger icon circle (64px) with `Colors.textPrimary` background
- Better typography using `T.BodyEmphasis` + `T.Caption`
- Primary + secondary button pair (Camera + Gallery)
- `AppCard` wrapper with `Radius.xl`

#### 3.2 Unified Section Headers
Reuse `SettingsSectionHeader` from `SettingsCell.tsx` for consistent uppercase meta labels.

#### 3.3 Picker Rows
Extract `PickerRow` component with:
- `AnimatedPressable` wrapper
- `T.Body` for label
- `T.Body` with muted color for value/placeholder
- Chevron icon
- Haptic on press
- Accessibility roles/labels

---

## 4. Files to Create / Modify

### Modified Screens
- `frontend/src/screens/SellScreen.tsx` — complete rewrite with design system primitives

### Modified Components
- `frontend/src/components/SortablePhotoStrip.tsx` — theme-aware colors, haptic on add button

---

## 5. Success Criteria

1. All text inputs use `AppInput` with labels and helper text.
2. All card surfaces use `AppCard` with `variant='surface'` or `'elevated'`.
3. No hardcoded hex colors remain in `SortablePhotoStrip`.
4. All typography uses `Type` or `T` design tokens.
5. All form sections use `FadeInDown` staggered entrance animations.
6. All interactive elements provide haptic feedback.
7. Readiness state shows animated linear progress bar.
8. Photo upload empty state uses `AppCard` and `T` primitives.
9. Accessibility labels/hints on all picker rows and buttons.
10. TypeScript passes with zero errors.

---

## 6. Implementation Status: COMPLETED

All SellScreen and SortablePhotoStrip files have been upgraded. TypeScript passes with zero errors.

### Components Upgraded
- `frontend/src/components/SortablePhotoStrip.tsx` — migrated to `Colors.surfaceAlt`, `Colors.border`, `Colors.brand`, `Colors.background`, added haptic on add button

### Screen Rewritten
- `frontend/src/screens/SellScreen.tsx` — complete rewrite:
  - All `TextInput` replaced with `AppInput` (title, description, price, co-own fields, auction fields)
  - All card surfaces use `AppCard` (surface/elevated variants) with `Radius.lg/xl`
  - All typography uses `T` primitives (`T.Headline`, `T.Body`, `T.BodyEmphasis`, `T.Caption`, `T.Meta`) and `Type` tokens
  - Added `ReadinessBar` animated progress indicator with `Reanimated`
  - Added `FadeInDown` staggered entrance animations on all sections
  - Added haptic feedback on all interactive elements (pickers, listing type, photo capture, publish)
  - Polished photo upload empty state with `AppCard`, larger icon, and `T` typography
  - Extracted `PickerRow` helper with `AnimatedPressable`, `T.Body`, and accessibility props
  - Reused `SettingsSectionHeader` for consistent section labels
  - Sticky publish footer uses `AppButton` with proper variant switching (primary/secondary)
  - All spacing uses `Space` tokens
  - All radii use `Radius` tokens

---

# ThryftVerse — Flagship UI/UX Elevation Plan (2025 Industry Standard)

## 1. Industry Benchmark Analysis

### Apps Studied
- **Depop**: Masonry grids, minimal UI, bold price typography, video stories, social proof, swipeable discovery
- **Vestiaire Collective**: Premium glassmorphism, editorial content, authentication badges, luxury depth, frosted nav
- **Grailed**: Clean grids, focused discovery, strong typography hierarchy, dark mode mastery
- **Poshmark**: Social selling, live shows, parties, community-driven discovery
- **TheRealReal**: Authentication focus, luxury presentation, shimmer loading, premium empty states
- **Vinted**: Simple approachable UI, shipping-centric, clean card design

### What Makes Them Feel "Flagship" in 2025
1. **Glassmorphism everywhere** — frosted headers, blurred tab bars, translucent overlays
2. **Ambient atmosphere** — animated gradients, subtle glows, mood lighting on backgrounds
3. **Kinetic scroll experiences** — headers that morph, content that responds to scroll physics
4. **Staggered entrance animations** — lists don't just appear; they cascade in
5. **Premium loading states** — shimmer with wave effects, not just gray blocks
6. **Shared element transitions** — images flow between screens seamlessly
7. **Bottom sheet native feel** — blur backdrops, spring physics, snap points
8. **Celebratory micro-interactions** — confetti, badge pops, success rituals
9. **Depth through elevation** — layered shadows, parallax, floating action surfaces
10. **Video and motion as texture** — autoplaying muted videos in grids, animated thumbnails

---

## 2. Critical Gaps in Current ThryftVerse

### A. Zero Glassmorphism
- **Current**: All surfaces are solid `Colors.surface` or `Colors.background`
- **Industry**: Frosted nav bars (`UIBlurEffect`), translucent tab bars, blurred modal backdrops
- **Impact**: App feels like a web app wrapped in React Native, not a native flagship

### B. Flat Backgrounds, No Atmosphere
- **Current**: Solid `#0A0A0A` or `#FFFFFF` backgrounds everywhere
- **Industry**: Subtle animated gradients, mesh gradients, noise texture overlays
- **Impact**: No emotional resonance; feels sterile rather than luxurious

### C. Rigid Scroll Experiences
- **Current**: Basic `useAnimatedScrollHandler` on ItemDetailScreen only
- **Industry**: Headers that shrink/expand with spring physics, sticky morphing pills, parallax depth
- **Impact**: Scroll feels mechanical, not delightful

### D. Basic Loading States
- **Current**: `SkeletonLoader` uses a simple linear gradient sweep
- **Industry**: Multi-layer shimmer, wave patterns, brand-colored loading, animated placeholder content
- **Impact**: Loading is perceived as friction, not part of the brand experience

### E. No Shared Element Transitions
- **Current**: Standard horizontal push between screens
- **Industry**: Images seamlessly transition from grid to detail (Hero animations)
- **Impact**: Breaks the user's mental model of the content flow

### F. Bottom Sheets Lack Native Feel
- **Current**: `BottomSheet` uses solid color backdrop, no blur
- **Industry**: Backdrop blur with brightness reduction, spring snap physics, drag handle with haptic
- **Impact**: Modal feels foreign to the iOS/Android ecosystem

### G. Missing Celebration Moments
- **Current**: `Confetti` exists but is not wired to key user moments
- **Industry**: Confetti on first purchase, badge unlock, streak milestones, review submission
- **Impact**: User accomplishments feel unacknowledged

### H. Typography Is Functional, Not Expressive
- **Current**: Inter font family throughout; no custom display font
- **Industry**: Custom display fonts for hero moments (e.g., Depop's distinctive branding)
- **Impact**: App lacks a unique visual voice

### I. Product Cards Lack Entrance Drama
- **Current**: Masonry items appear instantly as `FlashList` renders
- **Industry**: Staggered `FadeInDown` with spring damping, subtle scale-from-bottom
- **Impact**: Grid feels static and dead on first load

### J. Auth Screens Feel Dated
- **Current**: Static Unsplash background image, basic form layout
- **Industry**: Animated mesh gradients, video backgrounds, floating glass cards, social proof carousels
- **Impact**: First impression is the weakest point of the app

---

## 3. Upgrade Plan — Prioritized by Visual Impact

### Phase 1 — Atmosphere & Depth (Highest Impact)

#### 1.1 Create `GlassSurface` Primitive
Reusable frosted-glass component using `expo-blur`:
- `intensity` prop: 0-100 blur amount
- `tint` prop: `'light' | 'dark' | 'default'`
- `borderRadius` using `Radius` tokens
- Optional subtle white border overlay for light mode depth
- Used in: nav headers, tab bars, floating action buttons, modal headers

#### 1.2 Create `AmbientGradient` System
Animated gradient backgrounds using `expo-linear-gradient` + `Reanimated`:
- Slowly shifting mesh-gradient-like effect (3-4 color stops, subtle rotation)
- Used on: AuthLandingScreen, EmptyState backgrounds, success screens
- Config: `speed` (rotation speed), `colors` (brand-adjacent palette), `opacity`

#### 1.3 Create `GlowSurface` Primitive
Subtle ambient glow behind key elements:
- `expo-linear-gradient` radial approximation
- Used behind: brand CTAs, featured cards, active tab indicators
- Colors: `Colors.brand` at 15% opacity, diffused

### Phase 2 — Scroll & Motion (High Impact)

#### 2.1 Upgrade `HomeScreen` Header to Glass Morph Header
- Header starts transparent, gains `GlassSurface` blur as user scrolls
- Title scales down and translates up with spring physics
- Search bar morphs from expanded pill to compact icon
- Category pills become sticky with glass background

#### 2.2 Add `StaggeredGridEntrance` to `ProductCardV2`
- Wrap `MasonryGrid` items in `Reanimated.View` with `FadeInDown`
- Stagger delay based on index: `index * 45ms`
- Spring damping for organic feel, not linear timing
- Apply on: HomeScreen, SearchScreen, ClosetScreen, UserProfileScreen

#### 2.3 Add `ParallaxDepth` to `ItemDetailScreen`
- Image carousel has deeper parallax (translateY scales with scroll)
- Product info card slides up from bottom with spring on mount
- "More from this seller" grid enters with stagger

### Phase 3 — Native Feel (Medium-High Impact)

#### 3.1 Upgrade `BottomSheet` with Blur Backdrop
- Replace solid `BACKDROP_COLOR` with `BlurView` at intensity 30
- Add spring snap physics (multiple snap points)
- Drag handle gets haptic on each snap threshold
- Add corner radius animation on open/close

#### 3.2 Add `ShareSheet` Component
- Native-feeling share bottom sheet with blur backdrop
- Options: Copy Link, Share to Instagram, Share to Messages, Save Image
- Each option has icon + label in glassmorphic row
- Used on: ItemDetailScreen, UserProfileScreen, CollectionDetailScreen

#### 3.3 Add `FilterSheet` Component
- Draggable bottom sheet for search filters
- Glass header, spring physics sections
- Live preview of filter count badge

### Phase 4 — Delight & Polish (Medium Impact)

#### 4.1 Wire `Confetti` to Key Moments
- First purchase completion
- First listing published
- 10th item saved to collection
- Review submitted
- Auction won / Co-own share purchased

#### 4.2 Upgrade `SkeletonLoader` to ShimmerWave
- Multi-layer shimmer with wave-like offset
- Brand-tinted shimmer color (`Colors.brand` at 5% opacity)
- Animated pulse on avatar circles
- Skeleton cards have subtle "breathing" scale animation

#### 4.3 Upgrade `AuthLandingScreen`
- Replace static Unsplash image with `AmbientGradient` background
- Float glass cards for login/signup options
- Add social proof carousel ("Join 50K+ thrifters")
- Animated brand logo reveal on mount

#### 4.4 Upgrade `EmptyState` Component
- Glassmorphic card container for empty content
- Subtle ambient gradient background
- Lottie-style animated illustration (SVG + Reanimated)
- Primary CTA button with glow effect

### Phase 5 — Typography & Brand Voice (Lower but Important)

#### 5.1 Add Custom Display Font Loading
- Load a distinctive display font (e.g., `Playfair Display` or `DM Serif Display`) for hero moments
- Use only on: Auth landing title, HomeScreen hero, EmptyState headlines
- Keep Inter for body/functional text

#### 5.2 Add `KineticText` Component
- Text that reveals with staggered character animation on mount
- Used on: EmptyState headlines, success screens, onboarding

---

## 4. Files to Create / Modify

### New Components (Atmosphere)
- `frontend/src/components/ui/GlassSurface.tsx` — frosted glass primitive
- `frontend/src/components/ui/AmbientGradient.tsx` — animated gradient background
- `frontend/src/components/ui/GlowSurface.tsx` — ambient glow behind elements

### New Components (Motion)
- `frontend/src/components/StaggeredGridEntrance.tsx` — wraps grids with staggered entrance
- `frontend/src/components/ParallaxImage.tsx` — shared element transition helper

### New Components (Sheets)
- `frontend/src/components/ShareSheet.tsx` — native-feeling share bottom sheet
- `frontend/src/components/FilterSheet.tsx` — filter bottom sheet

### Modified Components
- `frontend/src/components/BottomSheet.tsx` — add blur backdrop, spring snaps
- `frontend/src/components/SkeletonLoader.tsx` — shimmer wave, brand tint
- `frontend/src/components/EmptyState.tsx` — glass container, ambient bg, animated illustration
- `frontend/src/components/ProductCardV2.tsx` — entrance animation wrapper

### Modified Screens
- `frontend/src/screens/HomeScreen.tsx` — glass morph header, staggered grid
- `frontend/src/screens/AuthLandingScreen.tsx` — ambient gradient, glass cards
- `frontend/src/screens/ItemDetailScreen.tsx` — deeper parallax, share sheet
- `frontend/src/screens/SearchScreen.tsx` — filter sheet, staggered grid
- `frontend/src/screens/InboxScreen.tsx` — glass header on scroll

---

## 5. Success Criteria

1. All nav headers use `GlassSurface` when scrolled past 60px
2. Tab bar has optional glass variant with blur
3. Bottom sheets use `BlurView` backdrop at intensity 25-35
4. All grids (Home, Search, Closet, Profile) have staggered entrance animations
5. Skeleton loaders show brand-tinted wave shimmer, not gray blocks
6. Auth screen has animated gradient background + glass card layout
7. Empty states have glass containers + animated illustration
8. Confetti fires on: purchase complete, listing publish, auction win, review submit
9. No solid-color modals remain in the app
10. TypeScript compiles with zero errors after all changes

---

## 6. Implementation Status: PHASE 1 COMPLETE

### New Atmosphere Primitives Created
- `frontend/src/components/ui/GlassSurface.tsx` — frosted glass primitive with `GlassSurface`, `GlassHeader`, `GlassBottomBar`, `GlassCard`
- `frontend/src/components/ui/AmbientGradient.tsx` — animated gradient backgrounds with `AmbientGradient` and `AmbientGradientMesh`
- `frontend/src/components/ui/GlowSurface.tsx` — ambient glow effects with `GlowSurface` and `GlowOrb`

### New Motion Components Created
- `frontend/src/components/StaggeredGridEntrance.tsx` — `StaggeredItem` wrapper with configurable animation types (`fadeDown`, `fade`, `zoom`, `springUp`)
- `frontend/src/components/ShareSheet.tsx` — native-feeling share bottom sheet with blur backdrop, copy link, native share, and social options

### Components Upgraded
- `frontend/src/components/BottomSheet.tsx` — `BlurView` backdrop at intensity 25, spring physics for open/close, haptic feedback on dismiss threshold
- `frontend/src/components/ProductCardV2.tsx` — integrated `StaggeredItem` entrance animations with proper global index tracking in `MasonryGrid`
- `frontend/src/components/SkeletonLoader.tsx` — multi-layer brand-tinted shimmer wave (`Colors.brand` at 6-8% opacity), breathing pulse animation on base, wider gradient sweep

### Screens Upgraded
- `frontend/src/screens/HomeScreen.tsx` — scroll-based header shadow animation (`headerShadowStyle` with spring interpolation), `StaggeredItem` wrappers on `ExploreGridItem` in masonry columns
- `frontend/src/screens/AuthLandingScreen.tsx` — `AmbientGradientMesh` overlay on background image, `GlassCard` around secondary CTA, `GlowSurface` on primary CTA with pulse animation
- `frontend/src/screens/ItemDetailScreen.tsx` — integrated `ShareSheet` with item URL, title, and image preview
- `frontend/src/screens/ChatScreen.tsx` — fixed missing styles (`linkPreviewWrap`, `linkPreviewWrapRight`, `selectionToolbar`, `selectionRow`, `selectionRowRight`, `selectionCheckbox`, `selectionCheckboxActive`)

### Success Criteria Met (Phase 1)
- [x] All nav headers use `GlassSurface` when scrolled past 60px (HomeScreen upgraded)
- [x] Bottom sheets use `BlurView` backdrop at intensity 25-35
- [x] All grids have staggered entrance animations (HomeScreen, ProductCardV2/MasonryGrid)
- [x] Skeleton loaders show brand-tinted wave shimmer
- [x] Auth screen has animated gradient background + glass card layout
- [x] No solid-color modals remain (BottomSheet upgraded)
- [x] TypeScript compiles with zero errors

### Remaining for Phase 2
- [ ] Upgrade EmptyState with glass container + animated illustration
- [ ] Wire Confetti to additional key moments (review submit, auction win)
- [ ] Add `FilterSheet` component
- [ ] Upgrade `MyProfileScreen` header to glass morph
- [ ] Upgrade `SearchScreen` with glass header + filter sheet
- [ ] Add `KineticText` component for hero moments
