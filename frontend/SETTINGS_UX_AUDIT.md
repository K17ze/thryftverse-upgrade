# Phase 2 — Settings UX Audit

**Date:** 2026-06-04
**Screens Audited:** 9
**Method:** Static code review + design-system compliance check

---

## 1. SettingsScreen (Main Hub)

### Strengths
- Clear section grouping (Account, Preferences, Commerce, Closet, Notifications, Support, Danger)
- Search bar filters sections dynamically — good discoverability
- Animated entrance (`FadeInDown`) adds polish
- Consistent use of `SettingsCell` within `SettingsGroup` — good component reuse
- Profile preview card at top provides clear identity context
- `isFirst`/`isLast` border-radius logic on cells creates iOS-style grouped table aesthetic

### Weaknesses
- **Hardcoded mock data throughout:** "Bank •••• 4242", "2 saved", reputation label uses mock fallback. A signed-in user still sees placeholder data.
- **Profile card uses `GlassCard`** — deprecated visual language, inconsistent with solid surfaces elsewhere.
- **Logout button is inline custom styled** instead of using `SettingsCell` destructive variant or `AppButton`. Looks different from every other action.
- **Search bar is inline-styled `View`+`TextInput`** — not a shared component, duplicated from `GlobalSearchScreen` and `InboxScreen`.
- **Version text** is tiny (`Type.meta.size`) and low contrast; feels like an afterthought.
- **"Commerce" section visible to all users** even if they have never sold anything. Should be gated by seller status.

### Recommended Improvements
1. Replace `GlassCard` profile wrapper with solid `View` using `Colors.surface` + `Elevation.subtle`.
2. Replace inline logout button with `SettingsCell variant="destructive"` inside a `SettingsGroup`.
3. Extract inline search bar into a shared `AppSearchBar` component (used in 3 screens already).
4. Gate Commerce section behind `user.isSeller` flag.
5. Move version number into a dedicated "About" footer with proper spacing.

### Effort: Low (1-2 hours)

---

## 2. AccountSettingsScreen

### Strengths
- Comprehensive form covering personal details, preferences, linked accounts, security
- Clear visual separation of sections
- Proper use of `SettingsCard` containers
- 2FA disable modal uses actual `Modal` with form validation
- Account deletion flow has confirmation step

### Weaknesses
- **Unsafe `userAny` cast** (`user as any`) bypasses type safety for form fields.
- **Linked accounts section is permanently dead:** `facebookLinked = false`, `googleLinked = false` hardcoded. Shows "Not connected" buttons that do nothing.
- **Mixed input systems:** Uses `AppInput` for some fields but `SettingsCell` for others. No visual consistency in form density.
- **Holiday mode toggle** uses raw `Switch` instead of `PremiumToggle` — different haptic and visual behavior from other toggles in the app.
- **Data export button** shows spinner but has no progress indication for large exports.
- **Typography uses deprecated `Typography.family.bold`** instead of `Type` scale.

### Recommended Improvements
1. Remove or hide linked accounts section until OAuth is implemented.
2. Replace raw `Switch` with `PremiumToggle` for holiday mode.
3. Add `helperText` to `AppInput` fields explaining format requirements.
4. Use `SkeletonLoader` while loading user data instead of showing empty fields.

### Effort: Low-Medium (2-3 hours)

---

## 3. PushNotificationsScreen

### Strengths
- Real backend integration for device registration
- Clear toggle descriptions explaining what each notification does
- Platform-aware permission handling
- "Enable all" bulk toggle at top is convenient

### Weaknesses
- **Toggle rows are custom-built** instead of using `SettingsCell variant="toggle"`. This means they miss `PremiumToggle` haptics and animation.
- **Header right action** uses custom `AnimatedPressable` with ad-hoc styling rather than a standardized header action pattern.
- **No empty state** if all toggles are off — screen looks broken.
- **Permission denied state** just shows a toast; should persist a banner explaining how to re-enable in system settings.
- **Toggle state can drift** from actual system permissions without a sync check on mount.

### Recommended Improvements
1. Refactor toggle rows to use `SettingsCell variant="toggle"`.
2. Add a persistent banner when system push permissions are denied, with a "Open Settings" button.
3. Add empty-state illustration when all notifications are disabled.
4. Sync toggle states with system permissions on screen focus.

### Effort: Medium (3-4 hours)

---

## 4. HelpSupportScreen

### Strengths
- FAQ search filters in real-time
- Multiple contact channels (live chat, email, tickets)
- Animated accordion-style FAQ expand/collapse
- Direct navigation to live chat with context

### Weaknesses
- **FAQ accordion is entirely custom** — no shared `Accordion` or `ExpandableCard` component. Duplicated effort across app.
- **Scroll-to-tickets uses hardcoded `y: 760`** — will break on different screen sizes or if FAQ count changes.
- **Support message form** has no character limit, no attachment support, and sends to a toast instead of an actual API.
- **Quick action buttons** (Chat, Email, Tickets) use custom styling not shared with any other icon-button pattern.
- **No loading state** for FAQ data (though it's local).

### Recommended Improvements
1. Extract FAQ accordion into a reusable `AccordionItem` component.
2. Replace hardcoded scroll position with `measure` or a ref-based `scrollTo`.
3. Add `maxLength={1000}` and send button to support message form.
4. Use shared icon-button pattern for quick actions.

### Effort: Low-Medium (2-4 hours)

---

## 5. PersonalisationScreen

### Strengths
- Visual preference pills for gender with clear active state
- Hero text explains the value proposition
- Bottom sheet picker for preference categories is consistent with other pickers

### Weaknesses
- **Gender pills use custom styling** instead of shared `AppSegmentControl` — inconsistent radius, padding, and active state with segment controls in `InboxScreen`.
- **Hero text uses custom font sizing** not from `Type` scale.
- **Preferences cards below pills** are plain `SettingsCell` rows in a `SettingsCard`, but the visual hierarchy doesn't distinguish them from the pills above.
- **No preview** of how feed will change after selecting preferences.
- **Accessibility:** Gender pills don't have `accessibilityRole="radio"` or proper `accessibilityState` for screen readers.

### Recommended Improvements
1. Replace gender pills with `AppSegmentControl` (supports multi-select with `allowMultiple`).
2. Use `Type` scale for hero text.
3. Add a "Preview your feed" teaser card at bottom.
4. Fix accessibility roles on preference selectors.

### Effort: Low (1-2 hours)

---

## 6. PaymentsScreen

### Strengths
- Real backend sync for payment methods and country capabilities
- Empty states for missing payment methods
- Capability-aware gating (shows unavailable methods based on country)
- `AddCardSheet` bottom sheet for adding cards

### Weaknesses
- **`renderPaymentMethodRows` is a 100+ line inline function** — unmaintainable, untestable, and duplicates rendering logic.
- **"Unavailable" payment method rows are pressable** but show a useless toast. Should be visually disabled (greyed out, non-pressable).
- **No loading skeleton** — screen shows blank while syncing.
- **Mixed card styling:** Backend cards use `SettingsCard`, fallback card uses inline style, unavailable cards use yet another style.
- **Policy label** (`formatCountryPolicyScope`) is rendered as plain text with no context icon.

### Recommended Improvements
1. Extract `renderPaymentMethodRows` into a `PaymentMethodRow` component.
2. Grey out unavailable methods instead of making them pressable no-ops.
3. Add `SkeletonLoader` during initial sync.
4. Unify card rendering to use a single `PaymentMethodCard` component.

### Effort: Medium (4-5 hours)

---

## 7. PostageScreen

### Strengths
- Radio-button carrier selection is clear and scannable
- Price comparison visible at a glance
- Real backend capability hydration for country-specific carriers
- Save button in header provides clear action

### Weaknesses
- **Save button uses custom inline styling** instead of `AppButton` or header action pattern.
- **Toggles (free shipping, bundle discount) use raw `Switch`** instead of `PremiumToggle` — inconsistent haptics.
- **Carrier cards mix `SettingsCard` and custom `RadioButton`** — visual weight is inconsistent.
- **No confirmation toast on save** — header button just navigates back.
- **No validation** if no carrier is selected (all could be deselected).

### Recommended Improvements
1. Replace raw `Switch` with `PremiumToggle`.
2. Use `AppButton` style for save action or standard header action pattern.
3. Ensure at least one carrier is always selected (default fallback).
4. Show save confirmation toast.

### Effort: Low (1-2 hours)

---

## 8. ChangePasswordScreen

### Strengths
- Comprehensive validation (length, match, difference from current)
- Password strength bar provides real-time feedback
- `KeyboardAvoidingView` used correctly
- Loading state on update button

### Weaknesses
- **Uses `TouchableOpacity` alongside `AnimatedPressable`** — two pressable systems in one screen.
- **Password visibility toggle** is custom inline instead of `AppInput` suffix prop.
- **No biometric authentication option** for password change (expected on premium apps).
- **Error messages** are toasts that disappear — should show inline below fields.

### Recommended Improvements
1. Replace `TouchableOpacity` with `AnimatedPressable`.
2. Use `AppInput suffix` for visibility toggle.
3. Show validation errors inline under fields instead of toasts.
4. Add optional biometric re-auth before allowing password change.

### Effort: Low-Medium (2-3 hours)

---

## 9. TwoFactorSetupScreen

### Strengths
- Real enrollment API integration
- QR code display with manual key fallback
- Loading and error states handled
- Clean 6-digit code entry

### Weaknesses
- **No `ScreenHeader`** — uses manual back button and title, inconsistent with every other settings screen.
- **Input is raw `TextInput`** instead of `AppInput` — no shared styling, no validation helper.
- **Error message** is plain red text, not using shared error component.
- **No copy-to-clipboard** for manual key — standard 2FA UX expectation.
- **Typography uses deprecated `Typography.family.bold`**.

### Recommended Improvements
1. Add `ScreenHeader` for consistency.
2. Replace raw `TextInput` with `AppInput`.
3. Add "Copy key" button next to manual secret.
4. Use shared error text component.

### Effort: Low (1-2 hours)

---

## Cross-Cutting Issues

| Issue | Screens Affected | Severity |
|-------|-----------------|----------|
| Raw `Switch` instead of `PremiumToggle` | AccountSettings, Postage | Medium |
| `Typography` wrapper used instead of `Type` scale | AccountSettings, ChangePassword, Postage, TwoFactorSetup | Low |
| `GlassCard` still present | SettingsScreen, AccountSettings | Low |
| Custom inline search bar | SettingsScreen, GlobalSearchScreen, InboxScreen | Medium |
| Hardcoded mock data | SettingsScreen, AccountSettings | Medium |
| Mixed pressable systems (`TouchableOpacity` + `AnimatedPressable`) | ChangePasswordScreen | Low |
| No loading skeletons | PaymentsScreen, PostageScreen | Medium |
| Inline render functions >50 lines | PaymentsScreen | Medium |

---

## Summary

**Best screens:** SettingsScreen (hub), ChangePasswordScreen — structurally sound, just need polish.
**Weakest screens:** PaymentsScreen (complexity), TwoFactorSetupScreen (inconsistency), HelpSupportScreen (custom components everywhere).

**Total recommended effort to bring all settings screens to premium standard:** ~15-20 hours.
