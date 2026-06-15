# UI-21P.4 Reference Decomposition

## Reference Files Physically Opened

| File | Size | Primary Subject |
| ---- | ---- | --------------- |
| `edit profile settings reference .jpeg` | 62KB | Edit Profile header, avatar/cover, form grouping |
| `settings reference.jpeg` | 76KB | Settings root: profile summary, search, grouped rows |
| `settings reference.png` | 221KB | Settings subpage: header, card sections, toggle rows |
| `settingsreen.jpeg` | 78KB | Settings row density, icon treatment, chevrons |
| `extra reference for structuring llayout .jpeg` | 141KB | Layout spacing, surface hierarchy |
| `extra reference.jpeg` | 130KB | General UI patterns |
| `extra reference (2).jpeg` | 164KB | Additional layout reference |
| `inbox messages.png` | 526KB | Inbox: header, search, conversation rows, timestamps |
| `message reference .jpeg` | 87KB | Chat: header, bubbles, composer, marketplace context |
| `overall outlook.jpeg` | 141KB | Overall app visual language |
| `overall reference.jpeg` | 90KB | Cross-screen consistency patterns |
| `overall reference.jpg` | 14KB | Navigation patterns |
| `edits,looks,pulse reference.jpeg` | 105KB | Profile tab styling (already addressed in UI-21P.3) |

---

## Target Screen Decomposition

### Edit Profile

| Reference | Reference Characteristics | Current Mismatch | Planned Reconstruction |
| --------- | ------------------------- | ---------------- | ---------------------- |
| `edit profile settings reference .jpeg` | Strong media-first header with cover image and circular avatar overlay; clear section cards with rounded corners; grouped form fields with consistent padding; sticky save action at bottom; 44px back button in surface circle | Custom header with close icon (not back arrow); no shared header primitive; fields float without clear card boundaries; action bar styling inconsistent with settings pages | Migrate to `ScreenHeader` with back arrow; wrap sections in `SettingsCard`; use `SettingsSection` labels; keep `FlagshipProfileMedia` for cover/avatar; use `SettingsStickySaveBar` |

### Settings Root

| Reference | Reference Characteristics | Current Mismatch | Planned Reconstruction |
| --------- | ------------------------- | ---------------- | ---------------------- |
| `settings reference.jpeg`, `settingsreen.jpeg` | Profile/account summary at top with avatar; search bar below; clearly separated groups with section labels; consistent 44px row height; icon in 32px coloured circle; title + description; chevron or toggle; inter-group spacing ~24px; support/legal at bottom; destructive actions separated | Already upgraded in UI-18 but user rejected visual quality; may have inconsistent row heights or spacing | Audit and tighten row dimensions; verify icon container consistency; ensure search does not dominate; verify section label typography |

### Inbox

| Reference | Reference Characteristics | Current Mismatch | Planned Reconstruction |
| --------- | ------------------------- | ---------------- | ---------------------- |
| `inbox messages.png` | Flat rows (no card elevation); hairline separator between rows; avatar 48-52px; name bold, message preview regular; timestamp right-aligned muted; unread dot or badge; no rounded card wrappers; clean header with title + actions; search below header | Rows use card styling with elevation and border-radius; looks like a list of cards rather than a message list; too much visual weight per row | Remove card styling from rows; use hairline separators; flatten to surface background; reduce row padding; improve unread treatment |

### Chat

| Reference | Reference Characteristics | Current Mismatch | Planned Reconstruction |
| --------- | ------------------------- | ---------------- | ---------------------- |
| `message reference .jpeg` | Header with avatar + name + status; marketplace context card above timeline; outgoing bubbles right-aligned with brand tint; incoming bubbles left-aligned with surface tint; timestamps on groups not every message; composer at bottom with attachment + input + send; keyboard-aware | Already has ChatBubbleV2, ChatTopBar, ChatComposerBar; may need bubble colour refinement; may need timestamp grouping | Verify bubble colours match reference; verify composer safe-area handling; verify marketplace card styling |

### Payments / Postage / Personalisation

| Reference | Reference Characteristics | Current Mismatch | Planned Reconstruction |
| --------- | ------------------------- | ---------------- | ---------------------- |
| `settings reference.png`, `settingsreen.jpeg` | Clear header with back + title; grouped card sections; consistent row height; radio buttons for single-select; toggles for boolean; save action at bottom | Use older scaffold with ScreenHeader instead of SettingsPage; may have inconsistent card styling | Migrate to `SettingsPage` scaffold; use `SettingsSection` + `SettingsRow` consistently; add sticky save where needed |

---

## Shared Visual Patterns from References

1. **Header**: 56px height, back button 44x44 in surface circle, title centered, optional right action
2. **Row**: 44-48px height, icon 20-24px, title 15-16px semibold, description 13px regular, value/status right-aligned
3. **Card**: 12-16px radius, 1px border, surface background, 16px internal padding
4. **Separator**: hairline (0.5-1px), border colour, full width within card or edge-to-edge
5. **Section label**: 11-12px uppercase, letter-spaced, muted colour, 8px above first row
6. **Spacing**: 16px horizontal padding; 24px between sections; 12px between rows within section
7. **Bottom action**: 48-56px height, full-width button or sticky bar, safe-area aware
8. **Icon container**: 32-36px circle, subtle tint background, centred icon
