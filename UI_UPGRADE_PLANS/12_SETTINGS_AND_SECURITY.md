# 12 — Settings & Security Playbook (DETAILED)

> **Most reference-image-driven section** — 4 reference images
> Screens (with subdirectories):
> - **Settings root**: `SettingsScreen`
> - **Account**: `AccountSettingsScreen`, `EditProfileScreen` (see also 08)
> - **Security**: `ChangePasswordScreen`, `TwoFactorSetupScreen`
> - **Notifications**: `PushNotificationsScreen`
> - **Support**: `HelpSupportScreen`, `ReportScreen`
> Reference images: **`settings reference.jpeg`**, **`settings reference.png`**, **`settingsreen.jpeg`**, **`edit profile settings reference .jpeg`**
> Heritage plans: SETTINGS_UPGRADE_PLAN, AESTHETIC_CROSSCHECK_PLAN §3

---

## 1. Visual DNA (extracted from all 4 reference images)

### From `settings reference.jpeg` + `settings reference.png` (Settings list):
| Attribute | Spec |
|---|---|
| **Background** | `#0A0A0A` deep black |
| **Header** | "Preferences" small uppercase muted label + "Settings" large title (Type.title 24/700) + glass back button (top left) |
| **Profile preview card** | Large glass card at top: avatar (56px circular, gold ring if verified) + name + handle + small chevron; `GlassCard intensity={30}` |
| **Search bar** | Floating glass pill (NOT a flat input) — `GlassSearchPill` |
| **Settings groups** | Group of related rows, each in a glass card with rounded first/last corners (or full `GlassCard` per row) |
| **Row layout** | Tinted square icon container (32×32, `borderRadius: 10`, `${iconColor}20` bg) + title (`Type.body`) + subtitle (`Type.caption`, muted) + right chevron or toggle |
| **Toggle** | Gold track when active, white thumb — `PremiumToggle` |
| **Section header** | Small uppercase muted label above each group — `Type.meta` |
| **Destructive** | Red tinted row, red icon, red text — `Colors.danger` |
| **Bottom** | Version text small muted, centered |

### From `settingsreen.jpeg` (Settings screen detail):
Confirms: gold accent for verified, glass card containers, tinted icon containers, gold active toggles.

### From `edit profile settings reference .jpeg` (Edit Profile form):
| Attribute | Spec |
|---|---|
| **Form layout** | Grouped into glass cards (Personal Info, Preferences, Privacy) |
| **Avatar** | Large circular (100-120px) at top with camera overlay |
| **Inputs** | Glass with floating labels (Type.meta uppercase) |
| **Save button** | Gold primary CTA sticky at bottom with glow |

---

## 2. Per-Screen Edits (with subdirectories)

### 2.1 `SettingsScreen.tsx` (ROOT — REFACTOR)

**File**: `frontend/src/screens/SettingsScreen.tsx`

**Edits**:
1. **Header**: Replace solid `Colors.surface` block.
   - Small label: "Preferences" (`Type.meta`, muted, uppercase)
   - Title: "Settings" (`Type.title`)
   - Glass back button (Pattern 2)
2. **Profile preview card**: `AppCard variant="elevated"` → `GlassCard intensity={30} borderRadius={20} padding={Space.md}`
   - `AvatarRing size={56}` with `ringColor={Colors.brand}` if verified
   - Name: `Type.bodyEmphasis`
   - Handle: `Type.caption` muted
   - Chevron right
   - `AnimatedPressable` with `scaleValue: 0.985`
3. **Search bar**: Replace raw `TextInput` with `<GlassSearchPill />` (NEW component)
4. **Settings groups** (Account, Preferences, Commerce, Closet, Notifications, Security, Storage, Support, About):
   - Each group = `GlassCard intensity={20} borderRadius={16} marginVertical={Space.sm}`
   - Section header: `Type.meta` muted uppercase above each group
   - Each row: tinted icon container (32×32, `borderRadius: 10`, `${iconColor}20` bg) + title + subtitle + right widget (chevron or toggle)
5. **Toggles**: Replace native `<Switch>` with `<PremiumToggle>` (drop-in)
6. **Currency display**: `glass style cycle button` showing current currency
7. **Theme picker**: `AppSegmentControl variant="glass"` (Light / Dark / Auto)
8. **Language picker**: glass row
9. **Logout**: `AppButton variant="destructive"` at bottom
10. **Version text**: small, centered, muted at bottom
11. `FadeInDown` stagger on all rows

**Icon color map** (per row):
- Account: `IconTint.brand` (gold)
- Preferences: `IconTint.blue`
- Commerce (Wallet, Payments, Postage): `IconTint.green`
- Closet: `IconTint.purple`
- Notifications: `IconTint.amber`
- Security: `IconTint.red`
- Storage: `IconTint.blue`
- Support: `IconTint.green`
- About: `IconTint.textMuted`

**Result sketch**:
```tsx
<SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: Colors.background }}>
  {/* Header */}
  <View style={{ paddingHorizontal: Space.md, paddingTop: Space.md }}>
    <Text style={{ ...Type.meta, color: Colors.textMuted, textTransform: 'uppercase' }}>Preferences</Text>
    <Text style={{ ...Type.title, color: Colors.textPrimary, marginTop: 4 }}>Settings</Text>
  </View>

  <ScrollView contentContainerStyle={{ padding: Space.md }}>
    {/* Profile preview */}
    <FadeInDown delay={0}>
      <AnimatedPressable onPress={handleEditProfile}>
        <GlassCard intensity={30} borderRadius={20} style={{ padding: Space.md, flexDirection: 'row', alignItems: 'center' }}>
          <AvatarRing size={56} uri={user.avatar} ringColor={Colors.brand} />
          <View style={{ flex: 1, marginLeft: Space.md }}>
            <Text style={Type.bodyEmphasis}>{user.name}</Text>
            <Text style={{ ...Type.caption, color: Colors.textMuted }}>@{user.handle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </GlassCard>
      </AnimatedPressable>
    </FadeInDown>

    {/* Search */}
    <FadeInDown delay={50}>
      <View style={{ marginTop: Space.md }}>
        <GlassSearchPill placeholder="Search settings" value={query} onChangeText={setQuery} />
      </View>
    </FadeInDown>

    {/* Groups */}
    {filteredGroups.map((group, i) => (
      <FadeInDown key={group.title} delay={100 + i * 45}>
        <Text style={{ ...Type.meta, color: Colors.textMuted, textTransform: 'uppercase', marginTop: Space.lg, marginBottom: Space.sm }}>
          {group.title}
        </Text>
        <GlassCard intensity={20} borderRadius={16}>
          {group.rows.map((row, j) => (
            <SettingsRow key={row.id} {...row} isLast={j === group.rows.length - 1} />
          ))}
        </GlassCard>
      </FadeInDown>
    ))}

    {/* Logout */}
    <FadeInDown delay={500}>
      <View style={{ marginTop: Space.xl }}>
        <AppButton variant="destructive" size="md" fullWidth onPress={handleLogout}>
          Log Out
        </AppButton>
      </View>
    </FadeInDown>

    <Text style={{ ...Type.caption, color: Colors.textMuted, textAlign: 'center', marginTop: Space.lg }}>
      ThryftVerse v1.0.0
    </Text>
  </ScrollView>
</SafeAreaView>
```

**SettingsRow component** (helper, add to `SettingsCell.tsx`):
```tsx
const SettingsRow = ({ icon, iconColor, title, subtitle, rightElement, onPress, isLast }) => (
  <AnimatedPressable
    onPress={onPress}
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      padding: Space.md,
      borderBottomWidth: isLast ? 0 : 0.5,
      borderBottomColor: Glass.border,
    }}
  >
    <View style={{
      width: 32, height: 32, borderRadius: 10,
      backgroundColor: `${iconColor}20`,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Ionicons name={icon} size={20} color={iconColor} />
    </View>
    <View style={{ flex: 1, marginLeft: Space.md }}>
      <Text style={Type.body}>{title}</Text>
      {subtitle && <Text style={{ ...Type.caption, color: Colors.textMuted }}>{subtitle}</Text>}
    </View>
    {rightElement || <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />}
  </AnimatedPressable>
);
```

---

### 2.2 `AccountSettingsScreen.tsx` (ACCOUNT SUBDIRECTORY)

**File**: `frontend/src/screens/AccountSettingsScreen.tsx`

**Edits**:
1. **SettingsHeader** back button: `Colors.surface` → translucent glass (Pattern 2)
2. **Personal Details card**: `SettingsCard` (solid) → `GlassCard intensity={25} borderRadius={20} padding={Space.lg}`
   - Section label: "Personal Details" (Type.meta uppercase)
   - `AppInput variant="glass" label="Email"` (disabled, since changing email is separate flow)
   - `AppInput variant="glass" label="Full Name"`
   - `AppInput variant="glass" label="Phone"`
   - `AppInput variant="glass" label="Birthday"` (date picker)
3. **Preferences card**: another `GlassCard`
   - Section label: "Preferences"
   - "Holiday Mode" toggle → `PremiumToggle`
   - "Private Profile" toggle → `PremiumToggle`
4. **Security card**: another `GlassCard`
   - Section label: "Security"
   - "Password" row → `ChangePasswordScreen`
   - "Two-Factor Authentication" row with status → `TwoFactorSetupScreen`
   - "Active Devices" row
5. **Linked Accounts card**: another `GlassCard`
   - Section label: "Linked Accounts"
   - "Facebook" row with connect/disconnect button
   - "Google" row with connect/disconnect button
6. **Footer actions**:
   - "Download my data" — `AppButton variant="secondary"` (could be `GlassCard` row)
   - "Delete Account" — `AppButton variant="destructive"` (red tinted)
7. **Save button** (sticky footer): `AppButton variant="primary" size="lg"` with `GlowSurface`
8. Add `FadeInUp` stagger

---

### 2.3 `ChangePasswordScreen.tsx` (SECURITY SUBDIRECTORY)

**File**: `frontend/src/screens/ChangePasswordScreen.tsx`

**Edits**:
1. Form card: `GlassCard intensity={25} borderRadius={20} padding={Space.lg}`
2. Section label: "Change Password"
3. All inputs: `AppInput variant="glass"`
   - Current password
   - New password (with strength indicator)
   - Confirm new password
4. Password strength bar: gold (strong) / amber (medium) / red (weak)
5. Save button: `AppButton variant="primary"` with `GlowSurface`
6. `FadeInUp` stagger

---

### 2.4 `TwoFactorSetupScreen.tsx` (SECURITY SUBDIRECTORY)

**File**: `frontend/src/screens/TwoFactorSetupScreen.tsx`

**Edits**:
1. **Status hero card**: `GlassCard intensity={30} borderRadius={20}` showing "2FA is OFF" or "2FA is ON"; large icon (shield-checkmark-outline or shield-outline) in `Colors.brand` with `GlowOrb` behind
2. **Setup flow** (if enabling):
   - Step 1: Show QR code in a glass card (white bg, 200×200)
   - Step 2: Manual entry key (selectable text in monospace)
   - Step 3: Verify code (6-digit `AppInput variant="glass"`)
3. **Disable flow** (if enabled): confirmation modal
4. Enable/Disable CTA: `AppButton variant="primary"` (enable) or `AppButton variant="destructive"` (disable)
5. `FadeInUp` stagger

---

### 2.5 `PushNotificationsScreen.tsx` (NOTIFICATIONS SUBDIRECTORY)

**File**: `frontend/src/screens/PushNotificationsScreen.tsx`

**Edits**:
1. **Category rows** (Orders, Messages, Offers, Price Drops, Newsletter, Product Updates): each in a `GlassCard intensity={20}` row
2. **Toggles**: All native `<Switch>` → `PremiumToggle` (gold track)
3. **Section labels**: "Push Notifications", "Email Notifications" — Type.meta uppercase
4. Quiet hours card: `GlassCard intensity={25}` with time pickers
5. `FadeInDown` stagger

---

### 2.6 `HelpSupportScreen.tsx` (SUPPORT SUBDIRECTORY)

**File**: `frontend/src/screens/HelpSupportScreen.tsx`

**Edits**:
1. **Search bar** at top: `GlassSearchPill`
2. **Category cards** (Orders, Payments, Shipping, Returns, Account, Technical): each = `GlassCard intensity={25} borderRadius={16}` with icon + title + chevron
3. **FAQ section** below: collapsible FAQ items in `GlassCard intensity={20}`
4. **Contact us button**: `AppButton variant="primary"` with `GlowSurface`
5. `FadeInDown` stagger

---

### 2.7 `ReportScreen.tsx` (SUPPORT SUBDIRECTORY)

**File**: `frontend/src/screens/ReportScreen.tsx`

**Edits**:
1. Reason picker: each reason = `GlassCard intensity={20}` row with radio indicator; selected = gold border
2. Additional details: `AppInput variant="glass" multiline`
3. Submit: `AppButton variant="primary"` with `GlowSurface`
4. `FadeInUp` stagger

---

## 3. Component Dependencies

| Component | Required For | Status |
|---|---|---|
| `GlassSearchPill` | Settings search | ❌ Must create per 02 §19 |
| `GlassCard` | All | ✅ |
| `PremiumToggle` | All toggles | ❌ Must create per 02 §20 |
| `AppInput variant="glass"` | Forms | ❌ Enhance AppInput per 02 §3 |
| `AvatarRing` | Profile preview | ✅ |
| `AppStatusPill` | 2FA status, device list | ✅ |
| `GlowSurface` | CTAs | ✅ |
| `GlowOrb` | 2FA hero, empty states | ✅ |
| `AppButton` | All buttons | ✅ |

---

## 4. Acceptance Criteria

- [ ] `SettingsScreen` profile preview uses `GlassCard` + `AvatarRing`
- [ ] `SettingsScreen` search uses `GlassSearchPill`
- [ ] All settings rows use tinted icon containers (already correct)
- [ ] All toggles use `PremiumToggle` (gold track)
- [ ] `AccountSettingsScreen` form sections use `GlassCard`
- [ ] `ChangePasswordScreen` form uses `GlassCard` + `AppInput variant="glass"`
- [ ] `TwoFactorSetupScreen` uses `GlassCard` + `GlowOrb` for hero
- [ ] `PushNotificationsScreen` all toggles use `PremiumToggle`
- [ ] `HelpSupportScreen` uses `GlassCard` for category cards
- [ ] All CTAs use `GlowSurface`
- [ ] All `FadeInDown`/`FadeInUp` staggers present
- [ ] `npm run typecheck` passes
- [ ] Visual diff vs all 4 reference images ≥ 90%

---

## 5. Feature Preservation Checklist

### SettingsScreen
- [ ] Profile preview navigates to EditProfile
- [ ] Account section: Edit profile, Email, Phone, Birthday
- [ ] Preferences section: Currency, Language, Theme, Holiday mode
- [ ] Commerce section: Wallet, Payments, Postage
- [ ] Closet section: Manage collections
- [ ] Notifications section: Push, Email
- [ ] Security section: Password, 2FA, Devices
- [ ] Storage section: Cache, Downloads
- [ ] Support section: Help, Terms, Privacy, Report bug
- [ ] Logout with confirmation
- [ ] Version display
- [ ] Search filters groups dynamically

### AccountSettingsScreen
- [ ] Personal details form (email, full name, phone, birthday)
- [ ] Preferences toggles (Holiday Mode, Private Profile)
- [ ] Security section (Password, 2FA, Active Devices)
- [ ] Linked Accounts (Facebook, Google)
- [ ] Download my data
- [ ] Delete account with confirmation
- [ ] Save changes
- [ ] Email change separate flow

### ChangePasswordScreen
- [ ] Current password
- [ ] New password with strength indicator
- [ ] Confirm new password
- [ ] Save
- [ ] Validation (min length, complexity)

### TwoFactorSetupScreen
- [ ] 2FA status (ON/OFF)
- [ ] QR code display for authenticator app
- [ ] Manual entry key
- [ ] 6-digit verify code
- [ ] Enable / Disable
- [ ] Backup codes
- [ ] Recovery options

### PushNotificationsScreen
- [ ] Push toggles per category (Orders, Messages, Offers, etc.)
- [ ] Email toggles per category
- [ ] Quiet hours
- [ ] Sound selection
- [ ] Save (auto on toggle)

### HelpSupportScreen
- [ ] Search FAQ
- [ ] Category cards (Orders, Payments, etc.)
- [ ] FAQ accordion items
- [ ] Contact us button → ReportScreen or email
- [ ] App version info

### ReportScreen
- [ ] Reason picker (radio list)
- [ ] Additional details
- [ ] Submit
- [ ] Success confirmation

---

## 6. Reference Image Verification (TODO)

When all 4 reference images are accessible, verify:
- [ ] `settings reference.jpeg`: profile preview is glass card with chevron
- [ ] `settings reference.jpeg`: settings groups have tinted icon containers
- [ ] `settings reference.jpeg`: gold active toggles (not green)
- [ ] `settings reference.jpeg`: section labels are small uppercase muted
- [ ] `settings reference.png`: confirms same patterns (alt angle/format)
- [ ] `settingsreen.jpeg`: same patterns with perhaps different layout
- [ ] `edit profile settings reference .jpeg`: form is grouped into glass cards
- [ ] `edit profile settings reference .jpeg`: avatar picker at top with camera overlay
- [ ] `edit profile settings reference .jpeg`: all inputs are glass with floating labels

---

**Next**: Read `13a_CREATE_POSTER.md` and `13b_CREATE_LOOK.md` for the Create Poster and Create Look screens.
