# Sector 4 — Settings and Account Subnavigation

## Product Purpose

Settings must feel organised, predictable, and premium. Every subpage should share the same header pattern, spacing rhythm, and interaction language.

## Reference Images

Reference images reviewed for:
- Settings hierarchy (iOS Settings, Instagram, TikTok)
- Account card treatments (Depop, Vinted)
- Form row consistency (Apple Human Interface Guidelines)

## Current Device Screenshots

- `screenshots/after/07_settings_root.png` — Settings root
- `screenshots/after/08_settings_scrolled.png` — Settings scrolled
- `screenshots/after/09_account_settings.png` — Account settings

## Current Strengths

1. Identity card at top with avatar, name, verification
2. Search bar for filtering settings
3. `SettingsCell` component with icon, title, subtitle, value, toggle
4. Section dividers between groups
5. `FadeInDown` entrance animations
6. Dead toggle removed (UI-21 fix)
7. No hardcoded mock data (UI-18 fix)

## Changes Implemented in UI-21P.3

### Settings root
- Already upgraded in UI-18 with identity card, search, organised sections
- No additional changes needed

### Settings subpages
- Most subpages already use V2 versions with `SettingsPage` scaffold
- `PaymentsScreen`, `PostageScreen`, `EditProfileScreen`, `PersonalisationScreen` use `ScreenHeader` + `SettingsCard` + `SettingsCell`
- Visual consistency is good across subpages

## Physical Audit Findings

| Route | Physical Issue | Root Cause | Fixed Now | Deferred |
| ----- | -------------- | ---------- | --------- | -------- |
| Settings root | Good structure | UI-18 upgrade | — | Search highlight |
| AccountSettings (V2) | Uses SettingsPage | Already upgraded | — | — |
| PushNotifications (V2) | Uses SettingsPage | Already upgraded | — | — |
| PaymentsScreen | Uses ScreenHeader + SettingsCard | Partially upgraded | — | Migrate to SettingsPage |
| PostageScreen | Uses ScreenHeader + SettingsCard | Partially upgraded | — | Migrate to SettingsPage |
| EditProfileScreen | Uses ScreenHeader | Partially upgraded | — | Migrate to SettingsPage |
| PersonalisationScreen | Uses ScreenHeader + SettingsCard | Partially upgraded | — | Migrate to SettingsPage |
| ChangePassword (V2) | Uses SettingsPage | Already upgraded | — | — |
| HelpSupport (V2) | Uses SettingsPage | Already upgraded | — | — |
| PrivacySettings (V2) | Uses SettingsPage | Already upgraded | — | — |
| ChatSettings (V2) | Uses SettingsPage | Already upgraded | — | — |
| ActiveSessions (V2) | Uses SettingsPage | Already upgraded | — | — |
| BlockedUsers (V2) | Uses SettingsPage | Already upgraded | — | — |

## Before/After Screenshots

Settings root and subpages were upgraded in UI-18. This phase focused on other sectors.

## Remaining Upgrades

1. Migrate remaining non-V2 screens to `SettingsPage` scaffold
2. Add profile preview card at top of Settings root
3. Better dangerous-action separation (Logout/Delete)
4. Highlight search matches within rows
5. Recently-used settings section

## Priority Score

| Screen | Current /10 | Primary Problem | Root Cause | Upgrade Now | Future Upgrade | Retested |
| ------ | ----------- | --------------- | ---------- | ----------- | -------------- | -------- |
| Settings root | 7 | Already upgraded | UI-18 | — | Profile preview + search highlight | Device |
| AccountSettings (V2) | 7 | Already upgraded | UI-18 | — | Form validation | Source |
| PushNotifications (V2) | 7 | Already upgraded | UI-18 | — | Progress pie chart | Source |
| PaymentsScreen | 6 | Uses older scaffold | Partial upgrade | — | Migrate to SettingsPage | Device |
| PostageScreen | 6 | Uses older scaffold | Partial upgrade | — | Migrate to SettingsPage | Device |
| EditProfileScreen | 7 | Uses older scaffold | Partial upgrade | — | Migrate to SettingsPage | Device |
| PersonalisationScreen | 6 | Uses older scaffold | Partial upgrade | — | Migrate to SettingsPage | Device |
| ChangePassword (V2) | 7 | Already upgraded | UI-18 | — | Strength meter animation | Source |

## Runtime Verification Result

- Settings root: device verified
- Account settings: device verified
- Settings subpages: mostly V2, consistent headers verified
