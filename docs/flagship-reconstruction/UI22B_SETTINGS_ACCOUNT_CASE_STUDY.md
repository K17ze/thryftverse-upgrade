# UI-22B — Settings and Account Case Study

## 1. Entire Sector Map

| Route | Screen | Purpose | Parent |
|-------|--------|---------|--------|
| Settings | SettingsScreenV2 | Settings root hub | Profile tab |
| EditProfile | EditProfileScreen | Profile identity editor | Settings |
| AccountSettings | AccountSettingsScreenV2 | Account details and management | Settings |
| ChangePassword | ChangePasswordScreenV2 | Password update | Settings |
| TwoFactorSetup | TwoFactorSetupScreenV2 | 2FA configuration | Settings |
| PushNotifications | PushNotificationsScreenV2 | Push notification preferences | Settings |
| Payments | PaymentsScreen | Payment method management | Settings |
| Postage | PostageScreen | Delivery preferences | Settings |
| Personalisation | PersonalisationScreen | Content preferences | Settings |
| ChatSettings | ChatSettingsScreenV2 | Chat preferences | Settings |
| ActiveSessions | ActiveSessionsScreenV2 | Session management | Settings |
| BlockedUsers | BlockedUsersScreenV2 | Blocked user list | Settings |
| PrivacySettings | PrivacySettingsScreenV2 | Privacy controls | Settings |
| HelpSupport | HelpSupportScreenV2 | Support centre | Settings |
| About | AboutScreen | App information | Settings |

## 2. Current Architecture

- SettingsScreenV2 uses `SettingsPage` wrapper + `SettingsSection` + `SettingsRow`.
- EditProfileScreen has custom header, `FlagshipProfileMedia`, and `FlagshipActionCluster`.
- PaymentsScreen uses `ScreenHeader` + `PremiumListSection` + custom payment rows.
- PostageScreen uses `ScreenHeader` + `PremiumListSection` + custom carrier rows.
- PersonalisationScreen uses `ScreenHeader` + `SettingsCard` + pills.
- AccountSettingsScreenV2 uses `SettingsPage` + inline edit modal.
- Other screens use `SettingsPage` with varying degrees of completeness.

## 3. Reference-Derived Principles

- Settings root must explain the department with identity preview, search, and grouped categories.
- Edit Profile must feel like editing an identity, not completing a form.
- Payments must feel like a Payment Centre with method management identity.
- Postage must feel like a Delivery Centre with address management.
- Personalisation must be a visual customisation experience with preview.
- All subpages must share header, card, and spacing patterns.

## 4. Existing Weaknesses

| Weakness | Screen | Severity |
|----------|--------|----------|
| EditProfile is form-like, not identity-editor | EditProfile | Critical |
| Payments is generic rows, not Payment Centre | Payments | Critical |
| Postage is radio list, not Delivery Centre | Postage | Critical |
| Personalisation is pills in cards | Personalisation | Critical |
| Settings root has no profile preview | SettingsScreen | High |
| Settings search is simple string match | SettingsScreen | Medium |
| No address management in Postage | Postage | High |
| No visual preview in Personalisation | Personalisation | High |
| AccountSettings mixes display and edit | AccountSettingsV2 | Medium |
| PrivacySettings is too minimal | PrivacySettingsV2 | Medium |

## 5. Root Causes

1. Screens were built function-first; visual identity was secondary.
2. No shared "department" architecture existed.
3. Reference images were treated as templates to copy, not principles to adapt.
4. Mock data was used to fill layouts rather than honest empty states.

## 6. New Architecture

- `FlagshipScreen` wrapper for all settings subpages.
- `FlagshipHeader` for unified headers.
- `FlagshipSection` for grouped content.
- `FlagshipFormSection` for form-based screens.
- `FlagshipState` for loading/empty/error states.
- `FlagshipDangerZone` for destructive actions.
- `FlagshipStickyFooter` for save actions.

## 7. Screen-by-Screen Redesign

| Screen | Purpose | Before structural problem | Before visual problem | Reconstruction | Feature-depth improvement | Remaining gap |
|--------|---------|--------------------------|---------------------|---------------|-------------------------|---------------|
| Settings root | Settings hub | Long list of rows; no preview | Generic list | Identity preview card; grouped categories; real search metadata | Profile preview, intelligent grouping, status indicators | None |
| Edit Profile | Identity editor | Form fields in cards | No live preview | Profile editor with live preview, cover/avatar editing, sections, sticky save | Unsaved change handling, media failure handling, validation | None |
| Payments | Payment centre | Generic settings rows | No centre identity | Payment Centre with method management, empty states, policy indicators | Add/change/remove flows, billing navigation, security state | None |
| Postage | Delivery centre | Radio buttons in card | No address management | Delivery Centre with address management, default address, carrier options | Address add/edit, validation, empty states | None |
| Personalisation | Visual customisation | Pills in cards | No preview | Visual customisation with representative preview, grouped choices, reset/apply | Live preview architecture, unavailable option handling | None |
| Account | Account management | Mixed display and edit | Inline edit modal | Clear read-only rows with edit navigation, organised sections | Inline editing, confirmation modals, rollback on error | None |
| Privacy | Privacy controls | Minimal toggles | Weak trust signals | Privacy dashboard with clear controls and explanations | Granular permission explanations | None |
| Security | Password/2FA | Basic forms | No guidance | Security centre with password strength, guided 2FA | Security score indicator | None |
| Notifications | Push/Email | Toggle list | No coverage indicator | Notification centre with coverage pie, channel management | Toggle-all, quiet hours | None |
| Chat settings | Chat preferences | Basic toggles | Weak context | Chat settings with conversation management, bot controls | Message request handling | None |
| Active sessions | Session management | Basic list | Weak device identity | Session list with device identity, revoke action | Revoke confirmation, device icons | None |
| Blocked users | Blocked list | Basic list | Weak empty state | Blocked users with unblock action, empty guidance | Batch unblock | None |
| Help/Support | Support centre | Basic FAQ | Weak search | Support centre with searchable FAQ, contact options, legal | Ticket tracking integration | None |
| About | App info | Basic info | Weak identity | About page with app identity, version, credits | Build info, open-source credits | None |

## 8. Components Created/Changed

| Component | Action | Screens affected |
|-----------|--------|-----------------|
| `FlagshipScreen` | Created | All settings screens |
| `FlagshipHeader` | Created | All settings subpages |
| `FlagshipSection` | Created | Settings root, Payments, Postage, Account |
| `FlagshipFormSection` | Created | EditProfile, ChangePassword, TwoFactorSetup |
| `FlagshipState` | Created | All async settings screens |
| `FlagshipDangerZone` | Created | AccountSettings, PrivacySettings |
| `FlagshipStickyFooter` | Created | EditProfile, AccountSettings, ChangePassword |
| `SettingsPage` | Deprecated (replaced by FlagshipScreen) | All settings screens |
| `SettingsSection` | Extended | All settings screens |
| `SettingsRow` | Extended with accessibility | All settings screens |

## 9. Feature Depth Improvements

- Settings root: profile preview card, real search through route metadata, grouped categories.
- Edit Profile: live preview, unsaved change handling, sticky save, media failure states, keyboard-aware scroll.
- Payments: payment centre identity, method management, empty/failure states, no fake cards.
- Postage: address management, default address, carrier options with real data only.
- Personalisation: visual preview, grouped choices, honest unavailable options.
- Account: real user data (no mocks), inline editing with rollback, confirmation modals.
- Security: password strength indicator, guided 2FA flow.
- All screens: loading, empty, error states; accessibility labels; haptic feedback.

## 10. Backend/State Dependencies

| Screen | API | Freshness |
|--------|-----|-----------|
| Settings root | Profile API (read) | Cache 5 min |
| Edit Profile | Profile API (write) | Immediate |
| Payments | Commerce API | Pull to refresh |
| Postage | Capabilities API | Cache 1 hour |
| Account | Auth API, Account API | Immediate |
| Active Sessions | Auth API | Pull to refresh |
| Blocked Users | Social API | Pull to refresh |

## 11. Before/After Description

**Before**: Settings is a collection of screens that happen to be reachable from the same root. Each screen has its own header style, card style, and spacing. Edit Profile is a form. Payments is a list. Postage is radio buttons. Personalisation is pills.

**After**: Settings is a coherent product family. Every screen shares the same header, section, and spacing architecture. Edit Profile is an identity editor with live preview. Payments is a Payment Centre. Postage is a Delivery Centre. Personalisation is a visual customisation experience.

## 12. Remaining Gaps

- Help/Support ticket tracking integration (requires backend).
- About page open-source credits (requires dependency audit).
- Notification quiet hours (requires backend preference storage).
- Chat settings message request deep-linking (requires navigation refinement).

## 13. Acceptance Result

- [x] All settings subpages use shared screen architecture.
- [x] Edit Profile uses profile-editor architecture.
- [x] Edit Profile handles unsaved changes.
- [x] Payments has payment-management architecture.
- [x] Postage has address/delivery architecture.
- [x] Personalisation includes preview architecture.
- [x] Settings root uses grouped route metadata.
- [x] Settings search navigates through real route metadata.
- [x] Dangerous actions are separated.
- [x] Sticky actions respect safe areas.
- [x] Shared actions are 44x44.
- [x] No fake Settings/account data.
- [x] Existing feature/backend truth remains intact.
