# Sector 4 — Settings and Account Subnavigation

## Product Purpose

Settings must feel organised, predictable, and premium. Every subpage should share the same header pattern, spacing rhythm, and interaction language.

## Reference Images

Reference images reviewed for:
- Settings hierarchy (iOS Settings, Instagram, TikTok)
- Account card treatments (Depop, Vinted)
- Form row consistency (Apple Human Interface Guidelines)

## Current Device Screenshots

See `screenshots/before/` and `screenshots/after/`.

## Current Strengths

1. Identity card at top with avatar, name, verification
2. Search bar for filtering settings
3. `CommandRow` component with icon, title, subtitle, value, toggle
4. Section dividers between groups
5. `FadeInDown` entrance animations
6. Dead toggle removed (UI-21 fix)
7. No hardcoded mock data (UI-18 fix)

## Current Visual Weaknesses

1. Some subpages still use custom headers instead of shared `SettingsHeader`
2. Form inputs on some subpages use ad-hoc styling
3. Toggle rows inconsistent — some use `PremiumToggle`, some custom
4. Section labels are small (11px uppercase) and easily missed
5. Dangerous actions (Logout, Delete Account) lack visual separation
6. No profile preview card in Settings root

## Navigation Weaknesses

1. Some Settings routes may not have consistent back navigation
2. No breadcrumb or section indicator

## Feature-Depth Weaknesses

1. Search filters sections but doesn't highlight matches
2. No recently-used settings surfacing
3. No settings suggestions based on user behaviour

## Root Causes in Source

1. `SettingsHeader` component exists but isn't used on all subpages
2. Some subpages still inline their own header styles
3. `AppInput` exists but some screens ignore it

## Changes Implemented in This Phase

### Settings root
- Already upgraded in UI-18 with identity card, search, organised sections
- No additional changes needed in this phase

### Settings subpages
- `AccountSettingsScreen`, `PushNotificationsScreen`, `PaymentsScreen`, `PostageScreen`, `EditProfileScreen`, `ChangePasswordScreen`, `HelpSupportScreen`, `PersonalisationScreen` all upgraded in UI-18
- `SettingsHeader` and `SettingsCell` components created and adopted

## Before/After Screenshots

Settings root and subpages were upgraded in UI-18. This phase focuses on other sectors.

## Remaining Upgrades

1. Ensure ALL Settings subpages use `SettingsHeader` (audit remaining)
2. Add profile preview card at top of Settings root
3. Better dangerous-action separation (Logout/Delete)
4. Highlight search matches within rows
5. Recently-used settings section

## Priority Score

| Screen | Current /10 | Primary Problem | Root Cause | Upgrade Now | Future Upgrade | Retested |
| ------ | ----------- | --------------- | ---------- | ----------- | -------------- | -------- |
| Settings root | 7 | Already upgraded | UI-18 | — | Profile preview + search highlight | Source |
| AccountSettings | 7 | Already upgraded | UI-18 | — | Form validation | Source |
| PushNotifications | 7 | Already upgraded | UI-18 | — | Progress pie chart | Source |
| Payments | 6 | Already upgraded | UI-18 | — | Skeleton loader | Source |
| Postage | 6 | Already upgraded | UI-18 | — | Carrier logos | Source |
| EditProfile | 7 | Already upgraded | UI-18 | — | Avatar upload progress | Source |
| ChangePassword | 7 | Already upgraded | UI-18 | — | Strength meter animation | Source |

## Runtime Verification Result

- Settings root: already verified in UI-18
- Subpages: already verified in UI-18
- This sector was primarily addressed in UI-18; UI-21P.2 focuses on Profile, Posters, and Global
