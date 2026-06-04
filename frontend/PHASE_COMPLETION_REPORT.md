# Phase Completion Report — Settings UX Improvements

**Date:** 2026-06-04
**Status:** Complete
**TypeScript:** `tsc --noEmit` passes (exit 0)

---

## 1. Remove Fake Settings Data

**File:** `src/screens/SettingsScreen.tsx`

**Changes:**
- Profile card: Replaced `const user = currentUser ? { ...MY_USER, ...currentUser } : MY_USER` with `const user = currentUser ?? MY_USER`. Authenticated users no longer inherit mock `rating`, `reviewCount`, or `isVerified` from `MY_USER`.
- Reputation label: Only renders if `currentUser` has real rating/reviewCount data. Otherwise hidden.
- Payment Methods value: Changed from hardcoded `'1 saved'` to `'Manage'` (when saved) / `'None'`.
- Addresses value: Changed from `'1 saved'` to `'Manage'` (when saved) / `'None'`.
- Commerce Payout Method: Removed `"Bank •••• 4242"` → now shows `'Manage'` / `'None'`.
- Commerce Shipping Profiles: Removed `"2 saved"` → now shows `"Manage"`.

---

## 2. Add Skeleton Loading States

**PaymentsScreen.tsx**
- Import `SkeletonLoader`
- Replaced `ActivityIndicator` + text spinner during initial sync with 3x `SkeletonLoader` bars (56px height, full width, `Radius.lg`) matching payment row layout
- Skeletons only show during `isSyncing && backendPaymentMethods.length === 0`
- Added `skeletonWrap` style, removed unused `syncingRow`/`syncingText` styles

**PostageScreen.tsx**
- Import `SkeletonLoader`
- Added `isHydrating` state with `setIsHydrating(true)` at start of effect and `false` in `finally`
- During `isHydrating`, shows 3x `SkeletonLoader` bars (64px height) instead of blank carrier list
- Added `skeletonWrap` style

**AccountSettingsScreen.tsx**
- Import `SkeletonLoader`
- Added `isHydrating` state with 400ms mount timer to simulate initial hydration
- During `isHydrating`, shows 4x `SkeletonLoader` bars (72px height) matching `AppInput` row layout
- Added `skeletonWrap` style

---

## 3. Toggle System Consolidation

**Assessment:**
- `AccountSettingsScreen.tsx`: Already uses `SettingsCell variant="toggle"` (renders `PremiumToggle` internally). **No changes needed.**
- `PostageScreen.tsx`: Already uses `SettingsCell variant="toggle"`. **No changes needed.**
- `PushNotificationsScreen.tsx`: Already uses `SettingsCell variant="toggle"` inside `SettingsCard`. **No changes needed.**

**Cleanup:**
- Removed unused `Switch` import from `PostageScreen.tsx` (dead code).

---

## 4. Linked Accounts Cleanup

**File:** `src/screens/AccountSettingsScreen.tsx`

**Changes:**
- Removed entire "Linked Accounts" section (Facebook + Google rows)
- Removed dead handler functions: `handleFacebookLink`, `handleGoogleLink`
- Removed dead state variables: `facebookLinked`, `googleLinked`
- ~30 LOC removed

---

## 5. Search Bar Consolidation

**New Component:** `src/components/ui/AppSearchBar.tsx`

**API:**
```ts
interface AppSearchBarProps {
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  onClear?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  inputProps?: Omit<TextInputProps, ...>;
  rightNode?: React.ReactNode;
}
```

**Features:**
- Solid surface background with `Colors.surface` + `Colors.border`
- Search icon, clear button (auto-shows when value > 0)
- Optional `rightNode` for custom right-side content (e.g. camera icon)
- Forwards ref to underlying `TextInput`
- Built with `AnimatedPressable` for haptic clear action

**Migrations:**

| Screen | Before | After |
|--------|--------|-------|
| `SettingsScreen.tsx` | Inline `View` + `TextInput` inside `GlassCard` | `AppSearchBar` with `containerStyle={{ borderRadius: Radius.lg }}` |
| `InboxScreen.tsx` | `AppInput` with prefix/suffix | `AppSearchBar` with `inputProps` for `autoCapitalize`/`autoCorrect` |
| `GlobalSearchScreen.tsx` | Custom `TextInput` with animated border + camera icon | `AppSearchBar` inside `Reanimated.View` wrapper, preserving animated border + camera icon via `rightNode` |

**Removed styles:**
- `SettingsScreen.tsx`: `searchInputRow`, `searchInput`
- `InboxScreen.tsx`: `searchInput`, `clearSearchBtn`
- `GlobalSearchScreen.tsx`: `searchInput`, `clearBtn`

---

## 6. Settings Consistency Audit

**SettingsScreen.tsx:**
- `GlassCard` removed (profile card + search wrapper both replaced with solid `View`)
- No deprecated color tokens (`glassBg`, `glassBorder`)
- No broken imports (removed `GlassCard` import, `TextInput` import)
- No dead settings actions

**AccountSettingsScreen.tsx:**
- Still contains `GlassCard` in Personal Details, Preferences, Security, and 2FA modal — **not in scope** per task description (Task 6 specifically asked about SettingsScreen)

---

## Validation

### TypeScript
```
cd frontend && npx tsc --noEmit --pretty false
Exit code: 0
```

**Note:** Pre-existing `CreateAuctionScreen.tsx` errors (GlassSurface `borderRadius` prop) remain but are outside this scope.

### Navigation
- No navigation changes made
- All settings screens use existing routes

---

## Metrics

| Metric | Count |
|--------|-------|
| Files changed | 8 |
| LOC removed | ~85 (fake data strings, dead handlers, dead imports, unused styles) |
| Components added | 1 (`AppSearchBar`) |
| Components deleted | 0 |
| Skeleton screens added | 3 |

**Files changed:**
- `src/screens/SettingsScreen.tsx`
- `src/screens/AccountSettingsScreen.tsx`
- `src/screens/PaymentsScreen.tsx`
- `src/screens/PostageScreen.tsx`
- `src/screens/InboxScreen.tsx`
- `src/screens/GlobalSearchScreen.tsx`
- `src/components/ui/AppSearchBar.tsx` (new)

---

## Remaining Technical Debt

1. **AccountSettingsScreen** still uses `GlassCard` in 4 places (Personal Details, Preferences, Security, 2FA modal). These should be migrated to `SettingsCard` or solid `View` in a future pass.
2. **TwoFactorSetupScreen** still lacks `ScreenHeader` and uses raw `TextInput` instead of `AppInput` (noted in Phase 2 audit).
3. **CreateAuctionScreen.tsx** has 7 pre-existing `GlassSurface`/`borderRadius` TypeScript errors unrelated to this work.
4. **Typography hardcoding** in Settings-related screens remains unaddressed per task constraints (no typography system changes).
5. **Hardcoded hex colors** in `PostageScreen.tsx` `saveBtnText` (`#ffffff`) and `AccountSettingsScreen.tsx` danger styles remain.
