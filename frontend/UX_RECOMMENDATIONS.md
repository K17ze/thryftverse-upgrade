# Phase 4 — Top 10 Highest-Impact UX Improvements

**Date:** 2026-06-04
**Source:** Chat QA + Settings UX Audit + Design System Compliance
**Criteria:** Experience, clarity, trust, polish — NOT gimmicks, gradients, glassmorphism, or cloning

---

## 1. End-to-End Reply Flow

**What:** Replies are sent but the reply reference is invisible in the conversation history.

**Why it matters:** Users lose conversational context. A reply without context is just a plain message.

**Fix:** `MessageBubble` now renders a mini reply indicator above the text (implemented). The remaining gap is tapping a reply indicator to scroll to the original message.

**Impact:** High — core chat feature integrity
**Effort:** Low (already partially fixed)
**Files:** `MessageBubble.tsx`, `ChatScreen.tsx`

---

## 2. Auto-Scroll on Send

**What:** After sending a message, the list stays at its current scroll position. The user must manually scroll to see their message.

**Why it matters:** Basic chat hygiene. Every messaging app scrolls to the sent message.

**Fix:** Added `scrollToEnd` after `pushMessage` with a 50ms delay for layout (implemented).

**Impact:** High — every send action
**Effort:** Low (already fixed)
**Files:** `ChatScreen.tsx`

---

## 3. Multiline Composer

**What:** The message input is single-line only. Long messages truncate and the input field never grows.

**Why it matters:** Writing anything longer than a sentence is frustrating. Users can't see what they've typed.

**Fix:** Added `multiline`, `numberOfLines={1}`, `maxLength={2000}`, and `blurOnSubmit={false}` to `ComposerInput` (implemented).

**Impact:** High — affects every message typed
**Effort:** Low (already fixed)
**Files:** `ComposerInput.tsx`

---

## 4. Replace Hardcoded Mock Data in Settings with Real State

**What:** SettingsScreen shows fake data: "Bank •••• 4242", "2 saved" shipping profiles, reputation label from mock fallback. Even signed-in users see this.

**Why it matters:** Creates immediate distrust. Users can tell when an app is faking its own UI.

**Fix:** Wire settings values to actual store state. Show loading skeletons while resolving. Hide sections entirely when data is empty rather than showing fake placeholders.

**Impact:** Very High — trust erosion at first contact with settings
**Effort:** Medium (requires backend mapping or store hydration)
**Files:** `SettingsScreen.tsx`, `PaymentsScreen.tsx`, `PostageScreen.tsx`

---

## 5. Add Loading Skeletons to Data-Heavy Screens

**What:** PaymentsScreen, PostageScreen, and AccountSettingsScreen show blank or partially rendered content while syncing with the backend.

**Why it matters:** Blank screens feel broken. Skeleton loaders signal that the app is working and set layout expectations.

**Fix:** Use the existing `SkeletonLoader` component (already used in `BrowseScreen`) for initial sync states.

**Impact:** High — perceived performance and polish
**Effort:** Low (component already exists)
**Files:** `PaymentsScreen.tsx`, `PostageScreen.tsx`, `AccountSettingsScreen.tsx`

---

## 6. Unify Toggle Components Across Settings

**What:** Settings screens use three different toggle implementations:
- `PremiumToggle` (haptic, animated, branded)
- Raw RN `Switch` (no haptic, different colors, platform-specific)
- Custom inline toggles in `PushNotificationsScreen`

**Why it matters:** A premium product has one toggle. Three toggles feel like three different apps.

**Fix:** Replace all raw `Switch` usages with `PremiumToggle`. Refactor `PushNotificationsScreen` rows to use `SettingsCell variant="toggle"`.

**Impact:** Medium-High — tactile consistency
**Effort:** Low-Medium
**Files:** `AccountSettingsScreen.tsx`, `PostageScreen.tsx`, `PushNotificationsScreen.tsx`

---

## 7. Standardize Typography in Top 5 Screens

**What:** `MyProfileScreen`, `UserProfileScreen`, `BalanceScreen`, `HomeScreen`, and `OrderDetailScreen` use `Typography.family.*` directly and hardcode `fontSize`. This creates visible text-size drift.

**Why it matters:** Typography is the most visible design system element. Inconsistent text sizing makes the app feel amateur.

**Fix:** Replace `Typography.family.semibold` with `Type.body.fontFamily` (or add fontFamily to `Type` scale). Replace hardcoded `fontSize: 15` with `Type.body.size`.

**Impact:** High — visible on every screen
**Effort:** Medium (requires visual QA)
**Files:** `MyProfileScreen.tsx`, `UserProfileScreen.tsx`, `BalanceScreen.tsx`, `HomeScreen.tsx`, `OrderDetailScreen.tsx`

---

## 8. Extract Inline Search Bar into Shared Component

**What:** `GlobalSearchScreen`, `InboxScreen`, and `SettingsScreen` each have a custom inline `View` + `TextInput` search bar with identical styling.

**Why it matters:** Duplicated code drifts. If padding or border color needs changing, three files must be updated. A shared component ensures consistency.

**Fix:** Create `AppSearchBar` in `components/ui/` that accepts `placeholder`, `value`, `onChangeText`, `onClear`, and `containerStyle`. Replace all three inline implementations.

**Impact:** Medium — consistency and maintainability
**Effort:** Low
**Files:** `GlobalSearchScreen.tsx`, `InboxScreen.tsx`, `SettingsScreen.tsx`

---

## 9. Remove or Hide Dead Linked-Accounts Section

**What:** `AccountSettingsScreen` shows "Facebook — Not connected" and "Google — Not connected" buttons that are permanently hardcoded to `false`. Tapping them does nothing.

**Why it matters:** Dead UI creates confusion. Users will tap, get no feedback, and assume the app is broken.

**Fix:** Either implement OAuth linking or hide the section behind a feature flag until it's ready.

**Impact:** Medium — user confusion and trust
**Effort:** Very Low
**Files:** `AccountSettingsScreen.tsx`

---

## 10. Fix Hardcoded Colors in Top Screens for Dark Mode

**What:** `HomeScreen`, `AuthLandingScreen`, `ItemDetailScreen`, and `EditListingScreen` use hardcoded hex colors (`#fff`, `#000`, `rgba(...)`). These do not adapt to dark mode.

**Why it matters:** Dark mode is a basic accessibility and battery-saving expectation. Hardcoded white text on a light background becomes invisible.

**Fix:** Replace `#fff` with `Colors.textInverse` or `Colors.textPrimary` depending on context. Replace `#000` with `Colors.textPrimary`. Use `Colors.overlay` for scrims.

**Impact:** High — dark mode correctness
**Effort:** Low-Medium
**Files:** `HomeScreen.tsx`, `AuthLandingScreen.tsx`, `ItemDetailScreen.tsx`, `EditListingScreen.tsx`

---

## Summary Table

| Rank | Improvement | Impact | Effort | Category |
|------|-------------|--------|--------|----------|
| 1 | End-to-end reply flow | High | Low | Chat |
| 2 | Auto-scroll on send | High | Low | Chat |
| 3 | Multiline composer | High | Low | Chat |
| 4 | Remove fake settings data | Very High | Medium | Trust |
| 5 | Loading skeletons | High | Low | Perceived Performance |
| 6 | Unify toggles | Medium-High | Low-Medium | Consistency |
| 7 | Standardize typography | High | Medium | Visual Polish |
| 8 | Shared search bar | Medium | Low | Maintainability |
| 9 | Hide dead linked accounts | Medium | Very Low | Clarity |
| 10 | Fix hardcoded colors | High | Low-Medium | Dark Mode |

**Already implemented in this session:** #1, #2, #3 (chat fixes), plus critical InboxScreen `PulseDot` crash fix.

**Recommended next sprint:** #4, #5, #10 — highest user-visible impact with manageable effort.
