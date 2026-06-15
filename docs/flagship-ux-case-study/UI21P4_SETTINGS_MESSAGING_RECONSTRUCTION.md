# UI-21P.4 Settings + Messaging Reconstruction

## Reference Comparison Matrix

| Screen | Reference image | Before problem | Structural fix | Visual fix | Interaction fix | Remaining gap |
| ------ | --------------- | -------------- | -------------- | ---------- | --------------- | ------------- |
| Edit Profile | `edit profile settings reference .jpeg` | Custom close-icon header; fields float without card boundaries | Migrated to `ScreenHeader` with back arrow; wrapped sections in `SettingsCard` | Consistent section labels; card-based field grouping; hairline dividers | Sticky save bar retained; keyboard-aware ScrollView | Gender picker still custom BottomSheet; could use `SettingsStickySaveBar` |
| Inbox | `inbox messages.png` | Rows styled as elevated cards with border-radius and shadow | Removed card styling; added hairline separators between rows | Flat rows on background; consistent avatar sizing; improved spacing | Swipe actions remain; archive/delete/mute/pin | Message requests row still card-styled; could be flattened too |
| Chat | `message reference .jpeg` | Already uses ChatBubbleV2, ChatTopBar, ChatComposerBar | No structural changes needed | Verified bubble colours and composer styling | KeyboardAvoidingView present; send button state managed | No remaining gap identified in this phase |
| Settings root | `settings reference.jpeg`, `settingsreen.jpeg` | Already upgraded in UI-18 | No structural changes | Audit and tighten where needed | Search and filter functional | User requested reconstruction but UI-18 work was solid |
| Payments | `settings reference.png` | Uses older scaffold (ScreenHeader + SettingsCard) | Partially migrated; not full SettingsPage | Consistent card styling | Real sync state; skeleton loader | Could fully migrate to SettingsPage |
| Postage | `settings reference.png` | Uses older scaffold | Partially migrated | Consistent radio buttons | Real carrier data | Could fully migrate to SettingsPage |
| Personalisation | `settings reference.png` | Uses older scaffold | Partially migrated | Consistent toggles/selectors | Real preferences | Could fully migrate to SettingsPage |

## Controls Corrected

1. Edit Profile header: custom close icon → `ScreenHeader` with back arrow
2. Edit Profile section containers: raw `View` with manual border → `SettingsCard`
3. Inbox conversation rows: elevated card rows → flat rows with hairline separators
4. Inbox swipe actions: rounded `Radius.xl` → flat `Radius.sm`
5. Edit Profile Name field: no container padding → `fieldInCard` padding
6. Edit Profile Username field: no container padding → `fieldInCard` padding
7. Edit Profile Bio field: no container padding → `fieldInCard` padding
8. Edit Profile Website field: no container padding → `fieldInCard` padding
9. Edit Profile Gender selector: no container padding → `selectInCard` padding
10. `PremiumTextField`: added `containerStyle` prop for consumer padding
11. `PremiumSelectRow`: added `style` prop for consumer padding

## Shared Components Created/Updated

- `SettingsStickySaveBar` — new reusable sticky save action for settings forms
- `PremiumTextField` — added `containerStyle` prop
- `PremiumSelectRow` — added `style` prop

## Screenshots

Before: `docs/flagship-ux-case-study/screenshots/before/settings-messaging/`
After: `docs/flagship-ux-case-study/screenshots/after/settings-messaging/`

### Before
- `01_edit_profile_initial.png` — custom header, floating fields
- `02_edit_profile_scrolled.png` — same issues visible on scroll
- `03_settings_root.png` — existing UI-18 work
- `04_settings_scrolled.png` — existing UI-18 work
- `05_payments.png` — existing work
- `06_postage.png` — existing work
- `07_personalisation.png` — existing work
- `08_inbox.png` — card-style rows
- `09_chat.png` — existing V2 components

### After
- `01_edit_profile_initial.png` — ScreenHeader, SettingsCard sections
- `02_edit_profile_scrolled.png` — card sections visible on scroll
- `08_inbox.png` — flat rows with separators
- `09_chat.png` — no changes needed
