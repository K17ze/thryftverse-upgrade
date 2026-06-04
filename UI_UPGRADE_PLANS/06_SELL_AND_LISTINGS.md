# 06 — Sell & Listings Playbook

> Screens: `SellScreen`, `EditListingScreen`, `ListingSuccessScreen`, `MyListingsScreen`, `ManageListingScreen`
> Heritage plans: UPLOAD_SCREEN_UPGRADE_PLAN, AESTHETIC_CROSSCHECK_PLAN §3

---

## 1. Current State Snapshot

| Screen | Existing Quality | Gap |
|---|---|---|
| `SellScreen` | Premium basics — 28px bold price input, `ReadinessBar` w/ spring, sticky footer CTA | All `AppCard variant="surface"` → `GlassCard`; soften icon buttons |
| `EditListingScreen` | Same patterns as Sell | Same gap |
| `ListingSuccessScreen` | Solid preview card | Swap to `GlassCard` |
| `MyListingsScreen` | Solid listing grid cards | Swap to `GlassCard` |
| `ManageListingScreen` | Solid action sheet cards | Swap to `GlassCard` |

**Honest audit verdict**: SellScreen has excellent primitives (price typography, readiness bar, validation). The work is Pattern 1 (Solid→Glass) applied uniformly + icon buttons softened.

---

## 2. Per-Screen Edits

### 2.1 `SellScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/SellScreen.tsx`

**Edits**:
1. **Header**: Change title from "Scan Item" → "New Listing" (clearer intent). Header icon buttons: `Colors.surface` → translucent glass (Pattern 2).
2. **Photo upload zone (empty state)**: 
   - Remove `AppCard` wrapper
   - Create larger dashed-border area: `borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.12)', borderRadius: 24`
   - Background: `Glass.bg`
   - Camera icon: 48px in `Colors.brand` with `GlowOrb` behind (size 120, intensity 0.12)
   - Title: "Add Photos" in `Type.subtitle`
   - Subtitle: "Take photos or upload from gallery" in `Type.caption`, `Colors.textMuted`
3. **Listing type selector** (Marketplace / Co-Own / Auction chips): wrap in `GlassCard intensity={15}`; chips = glass pills, active = `borderColor: Colors.brand` + `shadowColor: Glow.brand`
4. **All form section cards** (Title/Description, Pickers, Price, Co-Own, Auction, Readiness): `AppCard variant="surface"` → `GlassCard intensity={20} borderRadius={16}`
5. **Picker rows** (Category, Brand, Size, Condition): inside glass card, soft `Colors.border` dividers
6. **Co-own card**: when `coOwnEnabled`, add `borderColor: 'rgba(212,175,55,0.15)'` + `shadowColor: Glow.brand`
7. **Readiness bar**: keep spring animation; wrap in `GlassCard intensity={20}`
8. **Price input**: keep 28px bold; just wrap in `GlassCard`
9. **Sticky footer CTA**: keep `AppButton variant="primary"`; add `GlowSurface` wrapper when ready
10. **Add `FadeInDown` staggered entrance** to all form sections

**Result sketch** (top portion):
```tsx
<SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: Colors.background }}>
  <View style={styles.headerRow}>
    <Text style={Type.title}>New Listing</Text>
    <View style={{ flexDirection: 'row', gap: Space.sm }}>
      <GlassIconButton icon="flash-outline" onPress={handleFlash} />
      <GlassIconButton icon="close-outline" onPress={handleClose} />
    </View>
  </View>

  <ScrollView contentContainerStyle={{ padding: Space.md, paddingBottom: 100 }}>
    {/* Upload zone */}
    <View style={{
      borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.12)',
      borderRadius: 24, padding: Space.xl, alignItems: 'center', backgroundColor: Glass.bg,
    }}>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <GlowOrb size={120} color={Colors.brand} intensity={0.12} />
        <Ionicons name="camera-outline" size={48} color={Colors.brand} />
      </View>
      <Text style={{ ...Type.subtitle, marginTop: Space.md }}>Add Photos</Text>
      <Text style={{ ...Type.caption, color: Colors.textMuted }}>Take photos or upload from gallery</Text>
      <View style={{ flexDirection: 'row', gap: Space.sm, marginTop: Space.lg }}>
        <AppButton variant="primary" leftIcon={<Ionicons name="camera-outline" />} onPress={handleCamera}>Camera</AppButton>
        <AppButton variant="secondary" leftIcon={<Ionicons name="images-outline" />} onPress={handleGallery}>Gallery</AppButton>
      </View>
    </View>

    {/* Listing type chips */}
    <FadeInDown delay={index * 45}>
      <GlassCard intensity={15} borderRadius={999} style={{ padding: Space.xs, flexDirection: 'row', marginTop: Space.lg }}>
        {listingTypes.map(t => (
          <AnimatedPressable key={t.value} onPress={() => setType(t.value)}
            style={{ flex: 1, paddingVertical: Space.sm, borderRadius: 999, alignItems: 'center',
                     backgroundColor: type === t.value ? 'rgba(212,175,55,0.12)' : 'transparent',
                     borderWidth: type === t.value ? 1 : 0, borderColor: Colors.brand }}>
            <Text style={{ ...Type.body, color: type === t.value ? Colors.brand : Colors.textPrimary }}>{t.label}</Text>
          </AnimatedPressable>
        ))}
      </GlassCard>
    </FadeInDown>

    {/* Form sections — each in GlassCard */}
    {formSections.map((section, i) => (
      <FadeInDown key={section.key} delay={i * 45 + 100}>
        <GlassCard intensity={20} borderRadius={16} style={{ padding: Space.md, marginTop: Space.md }}>
          {/* section content */}
        </GlassCard>
      </FadeInDown>
    ))}
  </ScrollView>

  <GlassBottomBar>
    <GlowSurface intensity={0.1} color={Colors.brand} borderRadius={16} style={{ flex: 1 }}>
      <AppButton variant="primary" size="lg" fullWidth onPress={handlePublish}>Publish Listing</AppButton>
    </GlowSurface>
  </GlassBottomBar>
</SafeAreaView>
```

### 2.2 `EditListingScreen.tsx` (REFACTOR)

Same pattern as `SellScreen`. Reuse the same form section structure. The screen is the same form pre-populated with existing values.

**Edits**:
1. All `AppCard` → `GlassCard`
2. Header: `ScreenHeader` with glass back button
3. Add `FadeInDown` stagger
4. Sticky CTA: "Save Changes" (gold)

### 2.3 `ListingSuccessScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/ListingSuccessScreen.tsx`

**Edits**:
1. Confetti animation: keep
2. Hero preview card (item image + title + price): `AppCard` → `GlassCard intensity={30} borderRadius={24}`; larger padding (`Space.xl`)
3. Success badge above: `GlowOrb` + checkmark icon
4. Success message: `Type.display` (32/700) in `Colors.textPrimary`
5. Next steps cards (Share to story, View listing, List another): each = `GlassCard intensity={25}` with icon
6. CTAs: "View Listing" (primary) + "Back to Home" (secondary)
7. Add `FadeInUp` staggered entrance

### 2.4 `MyListingsScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/MyListingsScreen.tsx`

**Edits**:
1. Listing grid cards: `AppCard` → `GlassCard intensity={25} borderRadius={20}`
2. Each card: image + title + price + status pill (use `AppStatusPill` for `active`/`sold`/`draft`)
3. Add new listing button (top right): `AppButton variant="primary" leftIcon="add"` (compact)
4. Filter tabs: `AppSegmentControl variant="glass"` (Active / Sold / Draft)
5. Use `StaggeredGridEntrance` for the grid
6. Empty state: `GlowOrb` + illustration

### 2.5 `ManageListingScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/ManageListingScreen.tsx`

**Edits**:
1. Listing preview at top: `GlassCard intensity={30}` with image + title + price
2. Action section (Edit, Mark Sold, Boost, Delete, Share): each action row = `GlassCard intensity={20}` with tinted icon container
3. Stats section (Views, Likes, Offers): metric cards in glass with gold numbers
4. Delete button: `AppButton variant="destructive"`
5. Add `FadeInDown` stagger

---

## 3. Acceptance Criteria

- [ ] All `AppCard variant="surface"` swapped to `GlassCard`
- [ ] Header buttons use Pattern 2 (glass)
- [ ] Photo upload zone has dramatic dashed border + `GlowOrb`
- [ ] Co-own card has gold tint when active
- [ ] Listing type chips are glass pills with active gold border
- [ ] Price input retains 28px bold
- [ ] CTA: `GlowSurface` + `AppButton variant="primary" size="lg"`
- [ ] All `FadeInDown` stagger present
- [ ] `npm run typecheck` passes

---

## 4. Feature Preservation Checklist

### SellScreen
- [ ] Camera permission + capture
- [ ] Gallery permission + select
- [ ] Photo reordering (SortablePhotoStrip)
- [ ] Photo limit (10 max)
- [ ] Co-own auto-populates auth photos from base photos
- [ ] Listing type: Marketplace / Co-Own / Auction
- [ ] Co-own toggle with share count + share price math
- [ ] Auction starting bid input + duration selector
- [ ] Title, description, category, brand, size, condition fields
- [ ] Price input with currency prefix
- [ ] All picker bottom sheets (Category, Condition, Size, Brand)
- [ ] Readiness tracking
- [ ] Flow step tracking
- [ ] Publish validation with shake animation
- [ ] Co-own publish → CreateCoOwn
- [ ] Marketplace publish → ListingSuccess
- [ ] Error messaging
- [ ] Keyboard avoiding
- [ ] Sticky footer CTA

### MyListingsScreen
- [ ] Grid of all user's listings
- [ ] Filter by status (Active/Sold/Draft)
- [ ] Tap to ManageListing
- [ ] Add new listing CTA

### ManageListingScreen
- [ ] Listing preview
- [ ] Edit, Mark Sold, Boost, Share actions
- [ ] Stats (views, likes, offers)
- [ ] Delete with confirmation

---

**Next**: Read `07_INBOX_AND_CHAT.md` for Inbox, Chat, and group messaging screens.
