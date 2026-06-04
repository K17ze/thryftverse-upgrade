# 08 — Profile & Social Playbook

> Screens: `MyProfileScreen`, `UserProfileScreen`, `EditProfileScreen`, `ClosetScreen`, `CollectionDetailScreen`
> Reference images: **`saved_closet .jpeg`** (Closet layout) + **`edit profile settings reference .jpeg`** (Edit Profile form)
> Heritage plans: AESTHETIC_CROSSCHECK_PLAN §3, OTHER_SCREENS_UPGRADE_PLAN §3

---

## 1. Visual DNA (extracted from reference images)

### From `saved_closet .jpeg`:
| Attribute | Spec |
|---|---|
| **Layout** | Grid of saved items, 2-3 columns, 16px gutters |
| **Cards** | Full-bleed images with bottom gradient overlay (transparent to black); title + price floating on gradient |
| **Filter chips** | Top horizontal scroll, glass pills (Category, Brand, Size) |
| **Empty state** | Centered icon + message, "Save items you love to find them here" |

### From `edit profile settings reference .jpeg`:
| Attribute | Spec |
|---|---|
| **Layout** | Form with section groupings (Personal Info, Preferences, Security) |
| **Section card** | Glass card containing 2-3 related inputs |
| **Section title** | Small uppercase muted label above each card |
| **Avatar picker** | Circular (100-120px) at top, gold ring if verified, change photo overlay on press |
| **Inputs** | All glass, with floating labels (Type.meta uppercase) |
| **Save button** | Gold primary CTA, sticky at bottom |

---

## 2. Per-Screen Edits

### 2.1 `MyProfileScreen.tsx` (POLISH + PATTERN VERIFY)

**File**: `frontend/src/screens/MyProfileScreen.tsx`

**Verify these premium features are intact** (per audit):
- Parallax cover image (240px tall, gradient overlay)
- LinkedIn-style hero: avatar (100px) + name + handle + reputation badge
- Stats row (listings, sold, followers) with gold numbers
- Quick access grid (4 cards: Closet, Listings, Purchases, Reviews)
- Tabs (Listings / Sold / Closet) — `AppSegmentControl variant="glass"`
- Listings grid using `ProductCardV2` in `StaggeredGridEntrance`
- Settings icon (top right) — glass icon button

**Polish improvements**:
- Add `FadeInDown` stagger to stats and quick access cards
- Avatar: `AvatarRing size={100}` with `ringColor={Colors.brand}` if verified
- Stats numbers: `Type.title` (24/700) in `Colors.brand` (gold)
- Stats labels: `Type.caption` in `Colors.textMuted`
- Quick access cards: `GlassCard intensity={25} borderRadius={20}` with icon + label

### 2.2 `UserProfileScreen.tsx` (POLISH + PATTERN)

**File**: `frontend/src/screens/UserProfileScreen.tsx`

**Edits**:
1. Same hero pattern as `MyProfileScreen`
2. Add Follow / Message buttons: `AppButton variant="primary"` (Follow) + `AppButton variant="secondary"` (Message)
3. Verified badge: `AppStatusPill variant="active"` next to name
4. Mutual friends section: horizontal scroll of `AvatarRing size={36}`
5. Bottom CTA: Message button (sticky)
6. Same `GlassCard` and parallax patterns as `MyProfileScreen`

### 2.3 `EditProfileScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/EditProfileScreen.tsx`

**Edits** (matches `edit profile settings reference .jpeg`):
1. **Avatar picker** at top: `AvatarRing size={100}` with circular camera icon overlay button; on press → photo picker action sheet
2. **Personal Info card**: `GlassCard intensity={25} borderRadius={20} padding={Space.lg}`
   - Section label: "Personal Info" (Type.meta, uppercase, muted)
   - `AppInput variant="glass" label="Full Name"`
   - `AppInput variant="glass" label="Username"`
   - `AppInput variant="glass" label="Bio" multiline` (4 rows)
3. **Preferences card** (another `GlassCard`):
   - Section label: "Preferences"
   - `AppInput variant="glass" label="Location"`
   - Currency picker (BottomSheet)
   - Language picker (BottomSheet)
4. **Privacy card** (another `GlassCard`):
   - Section label: "Privacy"
   - "Private Profile" toggle → `PremiumToggle`
   - "Show Activity Status" toggle → `PremiumToggle`
5. **Save button** (sticky footer): `AppButton variant="primary" size="lg"` with `GlowSurface`
6. Add `FadeInUp` staggered entrance to each card

**Result sketch**:
```tsx
<SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: Colors.background }}>
  <ScreenHeader title="Edit Profile" showBack />
  <ScrollView contentContainerStyle={{ padding: Space.md, paddingBottom: 100 }}>
    {/* Avatar picker */}
    <View style={{ alignItems: 'center', marginVertical: Space.lg }}>
      <AnimatedPressable onPress={handleAvatarPress} style={{ position: 'relative' }}>
        <AvatarRing size={100} uri={avatar} />
        <View style={{
          position: 'absolute', bottom: 0, right: 0,
          width: 32, height: 32, borderRadius: 16,
          backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name="camera-outline" size={16} color="#0A0A0A" />
        </View>
      </AnimatedPressable>
    </View>

    {/* Personal Info */}
    <FadeInUp delay={100}>
      <GlassCard intensity={25} borderRadius={20} style={{ padding: Space.lg, marginTop: Space.md }}>
        <Text style={{ ...Type.meta, color: Colors.textMuted, textTransform: 'uppercase', marginBottom: Space.md }}>Personal Info</Text>
        <AppInput variant="glass" label="Full Name" value={name} onChangeText={setName} />
        <View style={{ height: Space.md }} />
        <AppInput variant="glass" label="Username" value={handle} onChangeText={setHandle} />
        <View style={{ height: Space.md }} />
        <AppInput variant="glass" label="Bio" multiline value={bio} onChangeText={setBio} />
      </GlassCard>
    </FadeInUp>

    {/* Preferences */}
    <FadeInUp delay={200}>
      <GlassCard intensity={25} borderRadius={20} style={{ padding: Space.lg, marginTop: Space.md }}>
        <Text style={{ ...Type.meta, color: Colors.textMuted, textTransform: 'uppercase', marginBottom: Space.md }}>Preferences</Text>
        <AppInput variant="glass" label="Location" value={location} onChangeText={setLocation} />
        {/* Currency + Language pickers */}
      </GlassCard>
    </FadeInUp>

    {/* Privacy */}
    <FadeInUp delay={300}>
      <GlassCard intensity={25} borderRadius={20} style={{ padding: Space.lg, marginTop: Space.md }}>
        <Text style={{ ...Type.meta, color: Colors.textMuted, textTransform: 'uppercase', marginBottom: Space.md }}>Privacy</Text>
        <View style={styles.toggleRow}>
          <Text style={Type.body}>Private Profile</Text>
          <PremiumToggle value={privateProfile} onValueChange={setPrivateProfile} />
        </View>
        <View style={styles.toggleRow}>
          <Text style={Type.body}>Show Activity Status</Text>
          <PremiumToggle value={showActivity} onValueChange={setShowActivity} />
        </View>
      </GlassCard>
    </FadeInUp>
  </ScrollView>

  <GlassBottomBar>
    <GlowSurface intensity={0.1} color={Colors.brand} borderRadius={16} style={{ flex: 1 }}>
      <AppButton variant="primary" size="lg" fullWidth onPress={handleSave}>Save Changes</AppButton>
    </GlowSurface>
  </GlassBottomBar>
</SafeAreaView>
```

### 2.4 `ClosetScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/ClosetScreen.tsx`

**Edits** (matches `saved_closet .jpeg`):
1. **Filter chips at top** (Category, Brand, Size): horizontal scroll of glass pills; active = gold border
2. **Grid**: 2-3 columns of saved item cards using `ProductCardV2` in `StaggeredGridEntrance`
3. **Each card**: image + bottom gradient + title + price (gold)
4. **Empty state**: `GlowOrb` + bookmark/heart icon + "Save items you love to find them here"
5. **Add new collection button** (top right): glass icon button with `add-circle-outline`

### 2.5 `CollectionDetailScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/CollectionDetailScreen.tsx`

**Edits**:
1. Collection hero: image + name + item count
2. Edit collection (top right): glass icon button
3. Grid: same as ClosetScreen
4. Add `FadeInUp` stagger

---

## 3. Component Dependencies

| Component | Required For | Status |
|---|---|---|
| `AvatarRing` | All | ✅ |
| `GlassCard` | All | ✅ |
| `AppInput variant="glass"` | EditProfile | ❌ Enhance AppInput per 02 §3 |
| `PremiumToggle` | EditProfile (Privacy) | ❌ Create per 02 §20 |
| `GlowSurface` | EditProfile (Save CTA) | ✅ |
| `AppStatusPill` | UserProfile (verified badge) | ✅ |
| `ProductCardV2` | MyProfile, UserProfile, Closet, Collection | ✅ |
| `StaggeredGridEntrance` | All grids | ✅ |
| `GlowOrb` | Empty states | ✅ |
| `AppSegmentControl variant="glass"` | Profile tabs | ❌ Add `variant` if missing |

---

## 4. Acceptance Criteria

- [ ] `MyProfileScreen` parallax cover + LinkedIn-style hero preserved
- [ ] `MyProfileScreen` stats numbers in gold
- [ ] `MyProfileScreen` quick access cards use `GlassCard`
- [ ] `UserProfileScreen` follow/message buttons styled correctly
- [ ] `EditProfileScreen` form uses `GlassCard` per section
- [ ] `EditProfileScreen` all inputs use `AppInput variant="glass"`
- [ ] `EditProfileScreen` toggles use `PremiumToggle`
- [ ] `EditProfileScreen` save CTA uses `GlowSurface`
- [ ] `ClosetScreen` grid uses `ProductCardV2` in `StaggeredGridEntrance`
- [ ] `ClosetScreen` filter chips are glass pills
- [ ] All avatars use `AvatarRing`
- [ ] All entrance animations present
- [ ] `npm run typecheck` passes
- [ ] Visual diff vs `saved_closet .jpeg` ≥ 90%
- [ ] Visual diff vs `edit profile settings reference .jpeg` ≥ 90%

---

## 5. Feature Preservation Checklist

### MyProfileScreen
- [ ] Parallax cover photo
- [ ] Avatar (100px) with verified ring
- [ ] Display name, handle, bio
- [ ] Reputation badge
- [ ] Stats: Listings, Sold, Followers
- [ ] Quick access: Closet, Listings, Purchases, Reviews
- [ ] Tabs: Listings / Sold / Closet
- [ ] Settings icon (top right)
- [ ] Share profile button
- [ ] Pull-to-refresh
- [ ] Edit profile navigation

### UserProfileScreen
- [ ] Hero: avatar, name, bio, stats
- [ ] Follow / Unfollow button
- [ ] Message button
- [ ] Verified badge if applicable
- [ ] Mutual friends
- [ ] Listings grid
- [ ] Block / Report actions

### EditProfileScreen
- [ ] Avatar picker (change photo)
- [ ] Full name, username, bio fields
- [ ] Location field
- [ ] Currency picker
- [ ] Language picker
- [ ] Theme preference (Light/Dark/Auto)
- [ ] Private profile toggle
- [ ] Activity status toggle
- [ ] Save changes
- [ ] Validation (username unique, required fields)

### ClosetScreen
- [ ] Grid of saved items
- [ ] Filter chips
- [ ] Empty state
- [ ] Add new collection
- [ ] Tap item → ItemDetail

### CollectionDetailScreen
- [ ] Collection hero
- [ ] Grid of items in collection
- [ ] Edit / Delete collection
- [ ] Add items to collection

---

## 6. Reference Image Verification (TODO)

When images are accessible, verify:
- [ ] `saved_closet .jpeg`: grid is 2-3 columns, cards full-bleed with gradient overlay
- [ ] `saved_closet .jpeg`: filter chips at top, glass style
- [ ] `edit profile settings reference .jpeg`: form is grouped into cards
- [ ] `edit profile settings reference .jpeg`: avatar is large circular at top
- [ ] `edit profile settings reference .jpeg`: all inputs are glass with floating labels

---

**Next**: Read `09_TRADE_AND_WALLET.md` for Balance, Wallet, Payments, Postage screens.
