# Settings Screen UI/UX Upgrade Plan

## Aesthetic Direction (from Reference Images)

The reference images show a clean dark settings interface with:
- **Large profile hero card** at top with avatar, name, reputation
- **Tinted icon containers** — small colored squares/circles behind each row's icon
- **Floating search pill** with translucent background
- **Clean section headers** — small, uppercase, muted
- **Solid (not glass) card backgrounds** for settings groups — dark surface with subtle border
- **Gold/active toggles** for switches
- **Destructive actions** (logout, delete) with red-tinted styling

---

## Honest Audit: What I Got Wrong vs Reality

My original plan proposed creating 6+ new components and heavy rewrites. After auditing the actual code, most of that was unnecessary:

| My Original Claim | Reality |
|------------------|---------|
| "Section headers too prominent" | Already `Type.meta`, `Colors.textMuted`, uppercase — **whisper-quiet already** |
| "Toggles no gold active state" | `Switch` already uses `trackColor={{ true: Colors.brand }}` — **already gold** |
| "Inconsistent icon containers" | `SettingsCell` already uses `${iconColor}20` tinted containers — **already correct** |
| "Need custom PremiumToggle" | Native `Switch` with gold track is fine — **no custom component needed** |
| "Need GlassSearchPill component" | `GlassCard` already exists — **reuse, don't recreate** |
| "Need ScrollAwareHeader" | `SettingsHeader` is functional; glass back button is enough |
| "Heavy borders between rows" | `Colors.border` is subtle; no heavy borders exist |

---

## Current State Audit

### `SettingsScreen.tsx`

| Element | Current State | Gap |
|---------|---------------|-----|
| Header | "Preferences" label + "Settings" title + back button with `Colors.surface` bg | Back button could use translucent glass styling |
| Profile card | `AppCard variant="elevated"` with 56px avatar, plain circle | **Swap to `GlassCard`** for translucency; **add gold ring** on avatar if verified |
| Search | Raw `TextInput` with `Colors.surface` background | **Swap to `GlassCard`** wrapper for glassmorphism search pill |
| Settings groups | `SettingsGroup` with `Colors.surface` bg, `Radius.lg` | Already rounded and clean; optionally swap to `GlassCard` but not required |
| Settings cells | `SettingsCell` with tinted icon containers (`${iconColor}20`) | **Already matches reference** — no change needed |
| Toggle | `Switch` with `Colors.brand` active track | **Already gold** — no change needed |
| Section headers | `SettingsSectionHeader` — small, muted, uppercase | **Already correct** — no change needed |
| Logout | `variant="destructive"` inside `SettingsGroup` | Functional; keep as-is |
| Version text | Small, muted, centered | Already correct |
| Animations | `FadeInDown` staggered entrance | Already correct — keep |

### `AccountSettingsScreen.tsx`

| Element | Current State | Gap |
|---------|---------------|-----|
| Header | `SettingsHeader` with solid back button (`Colors.surface`) | Back button could use translucent styling |
| Personal details | `SettingsCard` wrapping `AppInput` fields | **Swap `SettingsCard` to `GlassCard`** for translucency |
| Preferences | `SettingsCell` toggles inside `SettingsCard` | **Swap `SettingsCard` to `GlassCard`** |
| Security | Same pattern | **Swap `SettingsCard` to `GlassCard`** |
| Footer actions | `AppButton variant="secondary"` with custom solid backgrounds | Download data button could use `GlassCard`; Delete button already has red tint — keep |
| Save button | `AppButton variant="primary"` (gold) | **Already correct** — keep |
| 2FA modal | `SettingsCard` inside modal | Keep as-is (modal overlay makes glass unnecessary) |

### `SettingsCell.tsx` (Shared Component)

| Element | Current State | Gap |
|---------|---------------|-----|
| Icon container | 32x32, `borderRadius: Radius.md` (12px), tinted at 20% opacity | Already close to reference; could try `borderRadius: 10` for more squared look |
| Title | `Type.body`, `Typography.family.medium` | Correct |
| Subtitle | `Type.caption`, `Colors.textMuted` | Correct |
| Chevron | `chevron-forward` 18px, `Colors.textMuted` | Correct |
| Press feedback | `AnimatedPressable` with `scaleValue: 0.985` | Correct |
| Group wrapper | `Colors.surface`, `Radius.lg`, rounded first/last corners | Correct |

---

## Upgrade Plan

### SettingsScreen.tsx

#### 1. Profile Preview Card
- **Current**: `AppCard variant="elevated"` with solid `Colors.surface` background.
- **Change**: Swap to `GlassCard` from `components/ui/GlassSurface` (intensity=30, tint="dark", borderRadius=20).
- **Avatar**: Keep 56px size. If `user.isVerified`, wrap with a 2px gold ring (`borderColor: Colors.brand`). The `AvatarRing` component from the Inbox plan can be reused here.
- **Card press**: Already tappable to EditProfile — keep.

#### 2. Search Bar
- **Current**: Raw `TextInput` with `Colors.surface` background.
- **Change**: Wrap the search row in `GlassCard` (intensity=25, tint="dark", borderRadius=16) instead of the current `View` with `Colors.surface`. Keep the `TextInput` inside with transparent background.

#### 3. Header Back Button
- **Current**: `AnimatedPressable` with `Colors.surface` background.
- **Change**: Swap `backBtn` style background from `Colors.surface` to `rgba(255,255,255,0.05)` with `borderColor: Colors.border` for a softer translucent look. This matches the glass button style used elsewhere in the app.

#### 4. Settings Groups (Optional)
- The `SettingsGroup` already uses `Colors.surface` with `Radius.lg` and proper first/last corner rounding. This is already clean and functional.
- **Optional upgrade**: Swap `SettingsGroup` background from `Colors.surface` to `GlassSurface` (intensity=20) for a subtle translucency effect. This is a nice-to-have, not critical.

---

### AccountSettingsScreen.tsx

#### 1. Settings Cards (Personal Details, Preferences, Security, Linked Accounts)
- **Current**: `SettingsCard` with solid `Colors.surface` or `Colors.surfaceAlt` background.
- **Change**: Swap all `SettingsCard` usages to `GlassCard` (intensity=25, tint="dark", borderRadius=16). This makes the form sections feel elevated and translucent.

#### 2. Header Back Button
- **Current**: `SettingsHeader` back button with `Colors.surface` background.
- **Change**: Same as SettingsScreen — swap to translucent `rgba(255,255,255,0.05)` with subtle border.

#### 3. Footer Action Buttons
- **Download my data**: Currently `AppButton variant="secondary"` with `Colors.surface` background. Could swap to a `GlassCard` row with icon + title + subtitle + chevron (like a `SettingsCell` layout). Not critical.
- **Delete Account**: Already uses red-tinted background (`rgba(255,77,77,0.1)`) and red border. This is already visually distinct — keep as-is.

#### 4. Save Button
- Already `AppButton variant="primary"` (gold). Keep exactly as-is.

---

### SettingsCell.tsx (Minor Polish)

#### 1. Icon Container Shape
- **Current**: `borderRadius: Radius.md` (12px) — fairly rounded.
- **Change**: Try `borderRadius: 10` for a slightly more squared, modern look. This is subtle and optional.

---

## What Already Exists (Do Not Rebuild)

| Component | File | Notes |
|-----------|------|-------|
| `GlassCard` / `GlassSurface` | `components/ui/GlassSurface.tsx` | Reusable glassmorphism with BlurView |
| `SettingsCell` | `components/SettingsCell.tsx` | Already has tinted icon containers, gold toggle, proper layout |
| `SettingsGroup` | `components/SettingsCell.tsx` | Already rounds first/last corners |
| `SettingsSectionHeader` | `components/SettingsCell.tsx` | Already small, muted, uppercase |
| `SettingsCard` | `components/settings/SettingsCard.tsx` | Solid card variant system; swap to `GlassCard` |
| `SettingsHeader` | `components/settings/SettingsHeader.tsx` | Functional header; just soften back button |
| `AppButton` | `components/ui/AppButton.tsx` | Has `primary` (gold), `secondary` variants |
| `AnimatedPressable` | `components/AnimatedPressable.tsx` | Scale + haptic already integrated |

---

## File Modifications

| File | Action | Details |
|------|--------|---------|
| `frontend/src/screens/SettingsScreen.tsx` | Style refactor | Swap profile `AppCard` to `GlassCard`; wrap search in `GlassCard`; soften back button bg |
| `frontend/src/screens/AccountSettingsScreen.tsx` | Style refactor | Swap all `SettingsCard` to `GlassCard`; soften `SettingsHeader` back button |
| `frontend/src/components/SettingsCell.tsx` | Minor tweak | Optional: icon container `borderRadius: 10` instead of `Radius.md` |
| `frontend/src/components/AvatarRing.tsx` | **Reuse** from Inbox plan | For profile avatar gold ring (if verified) |

---

## Design Tokens

No new tokens needed. Use existing:
- `Colors.brand`, `Colors.surface`, `Colors.border`, `Colors.textPrimary`, `Colors.textMuted`
- `Space`, `Radius`, `Type` from `theme/designTokens`
- `GlassCard` from `components/ui/GlassSurface`

---

## Feature Preservation Checklist
- [ ] Profile preview card navigates to EditProfile
- [ ] All settings sections: Account, Preferences, Commerce, Closet, Notifications, Security, Storage, Support
- [ ] Search filters sections dynamically
- [ ] Currency display cycling + picker
- [ ] Theme picker
- [ ] Language picker
- [ ] Email notifications toggle (gold track)
- [ ] Push notifications subtitle
- [ ] Two-factor status display
- [ ] Active devices link
- [ ] Cache clearing
- [ ] Help & Support, Terms, Privacy links
- [ ] Logout with navigation reset
- [ ] Version display
- [ ] AccountSettings: Personal details form (email, full name, phone, birthday)
- [ ] AccountSettings: Preferences toggles (Holiday Mode, Private Profile)
- [ ] AccountSettings: Security (Password, 2FA toggle + modal)
- [ ] AccountSettings: Linked Accounts (Facebook, Google)
- [ ] AccountSettings: Download my data
- [ ] AccountSettings: Delete account with confirmation
- [ ] AccountSettings: Save changes

---

## Success Criteria
1. Profile card uses `GlassCard` instead of solid `AppCard`
2. Verified avatar has gold ring (reuse `AvatarRing`)
3. Search bar is wrapped in `GlassCard`
4. Back buttons on both Settings and AccountSettings use translucent styling
5. AccountSettings form cards use `GlassCard`
6. Settings rows, toggles, section headers, and icons remain unchanged (already correct)
7. All existing functionality preserved exactly
8. No new components created unnecessarily
