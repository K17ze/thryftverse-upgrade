# 14 — Notifications & Activity Playbook

> Screens: `NotificationsScreen`, `PushNotificationsScreen`, `AuctionsScreen`, `CreateAuctionScreen`
> Heritage plans: AESTHETIC_CROSSCHECK_PLAN §3, OTHER_SCREENS_UPGRADE_PLAN §3

---

## 1. Current State Snapshot

| Screen | Existing Quality | Gap |
|---|---|---|
| `NotificationsScreen` | Solid `Colors.surface` / `Colors.surfaceAlt` cards; gold accent present for unread | Pattern 1: Solid → Glass on every notification row; swap icon containers to glass |
| `PushNotificationsScreen` | `SettingsCard` + `SettingsCell` solid surfaces; progress bar solid | Pattern 1: SettingsCard → GlassCard; progress track → glass pill; toggle rows → glass rows |
| `AuctionsScreen` | `AuctionCard` and `MetricGrid` present; search input solid; `FlashList` with `FadeInDown` | Pattern 1: Search → `AppInput variant="glass"`; auction cards verify GlassCard; empty state polish |
| `CreateAuctionScreen` | `TradeCard` / solid `listingCard` selection grid; `AppInput` default variant; header CTA size="sm" | Pattern 1: All cards → `GlassCard`; inputs → `variant="glass"`; Launch CTA → `size="lg"` |

**Honest audit verdict**: Notifications and Auctions have functional UI with some premium touches (gold unread rings, `FadeInDown`), but solid surfaces break the all-glass contract. PushNotifications and CreateAuction need the deepest refactor.

---

## 2. Per-Screen Edits

### 2.1 `NotificationsScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/NotificationsScreen.tsx`

**Edits**:
1. Remove `PANEL_BG = Colors.surface`, `PANEL_ALT = Colors.surfaceAlt`, `PANEL_BORDER = Colors.border` constants. Replace all usages with `GlassCard` or direct `Glass.*` tokens.
2. **Notification row card**: each item → `GlassCard intensity={25} borderRadius={16}`. Inside:
   - Left: 48×48 icon container — `GlassCard intensity={20} borderRadius={12}` with centered `Ionicons`
   - Icon color per type: `new_item` muted, `like` danger-red, `review` gold, `order` success-green, `price` brand-gold, `generic` muted
   - Body: title `Type.bodyEmphasis`, snippet `Type.caption` in `Colors.textSecondary`
   - Right: time `Type.caption` in `Colors.textMuted`, unread `PulseDot size={8} color={Colors.brand}`
   - Unread row: `borderColor: Colors.brand` on `GlassCard` + title in `Colors.textPrimary`
3. **Section header** ("Today", "This Week", "Earlier"): `Type.meta` uppercase, `Colors.textMuted`, no background block
4. **Avatar variant**: if notification includes actor avatar, use `AvatarRing size={48}` instead of icon container
5. **Swipe actions** (if implemented):
   - Mark read: `backgroundColor: 'rgba(212,175,55,0.15)'`
   - Delete: `backgroundColor: 'rgba(255,77,77,0.15)'`
6. **Empty state**: `GlowOrb` (size 120, gold, intensity 0.12) + `notifications-outline` icon + "No notifications yet" in `Type.body`
7. **List entrance**: `FadeInDown` stagger with 45ms delay per row (already present — verify)
8. **Mark-all-read header action**: glass icon button (`GlassIconButton`) top-right

**Result sketch**:
```tsx
<SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: Colors.background }}>
  <ScreenHeader title="Notifications" showBack rightAction={<GlassIconButton icon="checkmark-done-outline" onPress={markAllRead} />} />
  <SectionList
    sections={sections}
    keyExtractor={(item) => item.id}
    renderSectionHeader={({ section: { title } }) => (
      <Text style={{ ...Type.meta, color: Colors.textMuted, textTransform: 'uppercase', marginHorizontal: Space.md, marginTop: Space.lg, marginBottom: Space.sm }}>
        {title}
      </Text>
    )}
    renderItem={({ item, index }) => (
      <FadeInDown delay={index * 45}>
        <AnimatedPressable onPress={() => openNotification(item)}>
          <GlassCard
            intensity={25}
            borderRadius={16}
            style={{ marginHorizontal: Space.md, marginBottom: Space.sm, padding: Space.md, flexDirection: 'row', alignItems: 'center' }}
          >
            <GlassCard intensity={20} borderRadius={12} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={icon.name} size={22} color={icon.color} />
            </GlassCard>
            <View style={{ flex: 1, marginLeft: Space.md }}>
              <Text style={{ ...Type.bodyEmphasis, color: item.read ? Colors.textSecondary : Colors.textPrimary }} numberOfLines={1}>
                {item.text}
              </Text>
              <Text style={{ ...Type.caption, color: Colors.textMuted, marginTop: 2 }}>{item.time}</Text>
            </View>
            {!item.read && <PulseDot size={8} color={Colors.brand} />}
          </GlassCard>
        </AnimatedPressable>
      </FadeInDown>
    )}
  />
</SafeAreaView>
```

### 2.2 `PushNotificationsScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/PushNotificationsScreen.tsx`

**Edits**:
1. **SettingsCard** → `GlassCard intensity={25} borderRadius={20}` wrapping all toggle rows
2. **Progress indicator row**: track = `GlassCard intensity={15} borderRadius={999}` (full width, height 8); fill = `Colors.brand` (gold) with animated width; label `Type.caption` in `Colors.textMuted`
3. **SettingsCell** toggle rows: each row inside the glass card uses transparent background; remove solid `Colors.surface` dividers. Use hairline `Glass.border` bottom border.
4. **Toggle switches**: ensure `PremiumToggle` (or `Switch`) uses gold thumb when enabled (`Colors.brand`)
5. **Header right action**: replace `AnimatedPressable` with `styles.iconBtn` → `GlassIconButton`
6. **"Device registration" status banner** (if present): `GlassCard intensity={20} borderRadius={16}` with platform icon + status text + `AppButton variant="secondary" size="sm"`
7. Add `FadeInDown` stagger to progress bar, section title, and toggle card
8. **Section title**: `Type.meta` uppercase, `Colors.textMuted`, margin below

**Result sketch**:
```tsx
<SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: Colors.background }}>
  <SettingsHeader title="Push Notifications" onBack={() => navigation.goBack()} rightAction={<GlassIconButton icon="notifications-outline" onPress={handleToggleAll} />} />
  <ScrollView contentContainerStyle={{ padding: Space.md }} showsVerticalScrollIndicator={false}>
    <FadeInDown delay={0}>
      <GlassCard intensity={15} borderRadius={999} style={{ height: 8, marginBottom: Space.sm }}>
        <View style={{ width: `${(enabledCount / Math.max(pushTotalCount, 1)) * 100}%`, height: 8, backgroundColor: Colors.brand, borderRadius: 999 }} />
      </GlassCard>
      <Text style={{ ...Type.caption, color: Colors.textMuted, marginBottom: Space.lg }}>{enabledCount}/{pushTotalCount} enabled</Text>
    </FadeInDown>

    <FadeInDown delay={80}>
      <Text style={{ ...Type.meta, color: Colors.textMuted, textTransform: 'uppercase', marginBottom: Space.sm }}>Notification Types</Text>
      <GlassCard intensity={25} borderRadius={20}>
        {NOTIFICATIONS.map((item, idx) => (
          <View key={item.key} style={{ paddingVertical: Space.md, paddingHorizontal: Space.md, borderBottomWidth: idx < NOTIFICATIONS.length - 1 ? 1 : 0, borderBottomColor: Glass.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={Type.bodyEmphasis}>{item.label}</Text>
                <Text style={{ ...Type.caption, color: Colors.textMuted, marginTop: 2 }}>{item.subtitle}</Text>
              </View>
              <PremiumToggle value={!!toggles[item.key]} onValueChange={() => toggle(item.key)} />
            </View>
          </View>
        ))}
      </GlassCard>
    </FadeInDown>
  </ScrollView>
</SafeAreaView>
```

### 2.3 `AuctionsScreen.tsx` (POLISH + GLASS)

**File**: `frontend/src/screens/AuctionsScreen.tsx`

**Edits**:
1. **Search bar**: replace solid search container with `AppInput variant="glass"` (full width, placeholder "Search auctions...")
2. **MetricGrid cards**: verify each stat card uses `GlassCard intensity={20} borderRadius={16}`. Metric value in `Type.title` gold; label in `Type.caption` muted
3. **Auction cards**: verify `AuctionCard` internally uses `GlassCard intensity={25} borderRadius={20}`. If not, wrap or refactor `AuctionCard`:
   - Image top (full-bleed, 16:10 ratio, `borderRadius: 20`)
   - Bottom meta row: title `Type.bodyEmphasis`, current bid `Type.body` in gold, countdown pill `GlassCard intensity={30} borderRadius={999}`
   - "Place Bid" / "Buy Now" buttons: `AppButton variant="primary" size="lg"` inside `GlowSurface`
4. **BidComposer bottom sheet / modal**:
   - Backdrop: `rgba(0,0,0,0.7)`
   - Sheet container: `GlassCard intensity={30} borderRadius={24}` (top corners only)
   - Bid input: `AppInput variant="glass"` with currency prefix
   - Quick-bid chips: horizontal scroll of glass pills (`GlassCard intensity={20} borderRadius={999}`); selected = gold border
   - Submit bid CTA: `AppButton variant="primary" size="lg" fullWidth` with `GlowSurface`
5. **Empty state**: `GlowOrb` + `hammer-outline` icon + "No active auctions"
6. **Sync retry banner**: `GlassCard intensity={20} borderRadius={16}` with warning tint border
7. **List entrance**: `FadeInDown` stagger for auction cards (already present — verify)
8. **Header**: `ScreenHeader` with glass back button + glass "Create" icon button (`add-circle-outline`) top-right

### 2.4 `CreateAuctionScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/CreateAuctionScreen.tsx`

**Edits**:
1. **Header CTA**: change Launch button from `size="sm"` → `size="lg"`; wrap in `GlowSurface`
2. **Listing selection grid**: each card → `GlassCard intensity={25} borderRadius={16}`:
   - Image (square, 100×100, `borderRadius: 12`)
   - Title `Type.bodyEmphasis` below image
   - Price `Type.caption` gold
   - Selected state: `borderColor: Colors.brand` + `shadowColor: Glow.brand` + gold checkmark circle
3. **Selected listing preview**: `GlassCard intensity={25} borderRadius={20}` horizontal layout (image left, title + current price right)
4. **Form inputs**:
   - Starting bid: `AppInput variant="glass"` with currency prefix
   - Buy now: `AppInput variant="glass"` (only if `buyNowEnabled`)
   - Schedule picker: glass pills ("Now", "30m", "1h", "3h") — `GlassCard intensity={20} borderRadius={999}`; active = gold background + dark text
5. **Buy now toggle**: `PremiumToggle` (gold when enabled)
6. **Duration display**: read-only glass row showing "6 hours" with `Ionicons time-outline`
7. **Launch CTA** (bottom sticky): `AppButton variant="primary" size="lg" fullWidth` inside `GlowSurface`
8. Add `FadeInUp` stagger to preview card, form rows, and CTA

**Result sketch**:
```tsx
<SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: Colors.background }}>
  <TradeHeader title="Launch Auction" showClose onClose={() => navigation.goBack()} rightAction={
    <GlowSurface intensity={0.1} color={Colors.brand} borderRadius={16}>
      <AppButton title="Launch" onPress={launchAuction} variant="primary" size="lg" hapticFeedback="medium" accessibilityLabel="Launch auction" />
    </GlowSurface>
  } />

  <ScrollView contentContainerStyle={{ padding: Space.md, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
    <FadeInUp delay={100}>
      <Text style={{ ...Type.meta, color: Colors.textMuted, textTransform: 'uppercase', marginBottom: Space.sm }}>Select Listing</Text>
      <FlashList
        data={sellerListings}
        horizontal
        estimatedItemSize={120}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AnimatedPressable onPress={() => setSelectedListingId(item.id)}>
            <GlassCard intensity={25} borderRadius={16} style={{ width: 120, marginRight: Space.md, padding: Space.sm, borderColor: item.id === selectedListingId ? Colors.brand : 'transparent' }}>
              <CachedImage uri={coverUri} style={{ width: 100, height: 100, borderRadius: 12 }} />
              <Text style={{ ...Type.bodyEmphasis, marginTop: Space.sm }} numberOfLines={1}>{item.title}</Text>
              <Text style={{ ...Type.caption, color: Colors.brand }}>{formatPrice(item.price)}</Text>
              {item.id === selectedListingId && (
                <View style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="checkmark" size={14} color="#0A0A0A" />
                </View>
              )}
            </GlassCard>
          </AnimatedPressable>
        )}
      />
    </FadeInUp>

    {selectedListing && (
      <FadeInUp delay={150}>
        <GlassCard intensity={25} borderRadius={20} style={{ marginTop: Space.lg, padding: Space.md, flexDirection: 'row', alignItems: 'center' }}>
          <CachedImage uri={previewImage} style={{ width: 64, height: 64, borderRadius: 12 }} />
          <View style={{ marginLeft: Space.md, flex: 1 }}>
            <Text style={Type.bodyEmphasis} numberOfLines={1}>{selectedListing.title}</Text>
            <Text style={{ ...Type.caption, color: Colors.brand }}>{formatPrice(selectedListing.price)}</Text>
          </View>
        </GlassCard>
      </FadeInUp>
    )}

    <FadeInUp delay={200}>
      <View style={{ marginTop: Space.lg }}>
        <Text style={{ ...Type.meta, color: Colors.textMuted, textTransform: 'uppercase', marginBottom: Space.sm }}>Auction Settings</Text>
        <AppInput variant="glass" label="Starting Bid" value={startingBidInput} onChangeText={setStartingBidInput} keyboardType="decimal-pad" leftIcon="cash-outline" />
        <View style={{ height: Space.md }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Space.md }}>
          <Text style={Type.body}>Enable Buy Now</Text>
          <PremiumToggle value={buyNowEnabled} onValueChange={setBuyNowEnabled} />
        </View>
        {buyNowEnabled && (
          <AppInput variant="glass" label="Buy Now Price" value={buyNowInput} onChangeText={setBuyNowInput} keyboardType="decimal-pad" leftIcon="pricetag-outline" />
        )}
      </View>
    </FadeInUp>

    <FadeInUp delay={250}>
      <View style={{ marginTop: Space.lg }}>
        <Text style={{ ...Type.meta, color: Colors.textMuted, textTransform: 'uppercase', marginBottom: Space.sm }}>Schedule</Text>
        <View style={{ flexDirection: 'row', gap: Space.sm }}>
          {START_WINDOWS.map((w) => (
            <AnimatedPressable key={w.label} onPress={() => setStartInMinutes(w.minutes)}>
              <GlassCard intensity={startInMinutes === w.minutes ? 30 : 20} borderRadius={999} style={{ paddingVertical: Space.sm, paddingHorizontal: Space.md, borderColor: startInMinutes === w.minutes ? Colors.brand : 'transparent' }}>
                <Text style={{ ...Type.bodyEmphasis, color: startInMinutes === w.minutes ? Colors.brand : Colors.textPrimary }}>{w.label}</Text>
              </GlassCard>
            </AnimatedPressable>
          ))}
        </View>
      </View>
    </FadeInUp>
  </ScrollView>

  <GlassBottomBar>
    <GlowSurface intensity={0.1} color={Colors.brand} borderRadius={16} style={{ flex: 1 }}>
      <AppButton variant="primary" size="lg" fullWidth onPress={launchAuction}>Launch Auction</AppButton>
    </GlowSurface>
  </GlassBottomBar>
</SafeAreaView>
```

---

## 3. Component Dependencies

| Component | Required For | Status |
|---|---|---|
| `GlassCard` | All screens | ✅ |
| `GlassIconButton` | Notifications header, PushNotifications header, Auctions header | ✅ |
| `AppInput variant="glass"` | Auctions search, CreateAuction bid inputs | ❌ Enhance AppInput per 02 §3 |
| `AppButton variant="primary" size="lg"` | CreateAuction Launch CTA, Auctions bid/buy CTAs | ✅ |
| `GlowSurface` | CreateAuction Launch CTA, Auctions bid CTAs | ✅ |
| `PremiumToggle` | PushNotifications toggles, CreateAuction buy-now toggle | ❌ Create per 02 §20 |
| `PulseDot` | Notifications unread indicators | ✅ |
| `AvatarRing` | Notifications actor avatars | ✅ |
| `GlowOrb` | Empty states (Notifications, Auctions) | ✅ |
| `FadeInDown` / `FadeInUp` | All list / form entrances | ✅ |
| `AnimatedPressable` | All tappable cards | ✅ |
| `GlassBottomBar` | CreateAuction sticky footer | ✅ |
| `CachedImage` | Notification images, Auction images, CreateAuction listing images | ✅ |
| `ScreenHeader` | Notifications, Auctions | ✅ |
| `SettingsHeader` | PushNotifications | ✅ |

---

## 4. Acceptance Criteria

- [ ] `NotificationsScreen`: every notification row uses `GlassCard intensity={25} borderRadius={16}`
- [ ] `NotificationsScreen`: unread rows have gold border + bold title
- [ ] `NotificationsScreen`: icon containers use `GlassCard intensity={20} borderRadius={12}` (no solid bg)
- [ ] `NotificationsScreen`: empty state uses `GlowOrb` + `notifications-outline`
- [ ] `PushNotificationsScreen`: settings card uses `GlassCard intensity={25} borderRadius={20}`
- [ ] `PushNotificationsScreen`: progress track uses glass pill; fill is gold (`Colors.brand`)
- [ ] `PushNotificationsScreen`: toggle rows have no solid backgrounds; use hairline `Glass.border` dividers
- [ ] `PushNotificationsScreen`: header right action uses `GlassIconButton`
- [ ] `AuctionsScreen`: search input uses `AppInput variant="glass"`
- [ ] `AuctionsScreen`: `AuctionCard` internally uses `GlassCard` (or is wrapped in one)
- [ ] `AuctionsScreen`: metric stat cards use `GlassCard` with gold values
- [ ] `AuctionsScreen`: bid composer sheet uses `GlassCard intensity={30} borderRadius={24}`
- [ ] `AuctionsScreen`: empty state uses `GlowOrb` + `hammer-outline`
- [ ] `CreateAuctionScreen`: listing selection cards use `GlassCard intensity={25} borderRadius={16}`
- [ ] `CreateAuctionScreen`: selected listing card has gold border + checkmark
- [ ] `CreateAuctionScreen`: all form inputs use `AppInput variant="glass"`
- [ ] `CreateAuctionScreen`: schedule picker chips use glass pills with gold active state
- [ ] `CreateAuctionScreen`: Launch CTA uses `AppButton variant="primary" size="lg"` inside `GlowSurface`
- [ ] `CreateAuctionScreen`: sticky footer uses `GlassBottomBar`
- [ ] All screens: background is `#0A0A0A` (`Colors.background`)
- [ ] All screens: no solid surfaces remain (verify with grep for `Colors.surface` / `Colors.surfaceAlt` in these 4 files)
- [ ] All list entrances use `FadeInDown` or `FadeInUp` stagger
- [ ] `npm run typecheck` passes for all 4 files
- [ ] Visual diff against glassmorphism reference ≥ 90% match

---

## 5. Feature Preservation Checklist

### NotificationsScreen
- [ ] Section grouping (Today / This Week / Earlier)
- [ ] Relative time formatting (Just now / 5m ago / 2h ago / 3 days ago)
- [ ] Notification type derivation (new_item, like, review, order, price, generic)
- [ ] Unread vs read visual distinction
- [ ] Tap to navigate to relevant screen (item, order, profile)
- [ ] Mark-as-read on tap
- [ ] Mark-all-read header action
- [ ] Swipe actions (mark read, delete) — if present
- [ ] Pull-to-refresh (silent sync every 30s)
- [ ] Empty state
- [ ] `AvatarRing` for actor avatars when available

### PushNotificationsScreen
- [ ] Device registration / deregistration flow
- [ ] Expo push token acquisition
- [ ] Permission request handling
- [ ] Toggle all on/off header action
- [ ] Per-type toggle persistence
- [ ] Progress indicator (enabled count / total)
- [ ] Toast feedback on sync / error
- [ ] Platform detection (iOS / Android / web)

### AuctionsScreen
- [ ] Live vs upcoming auction filtering
- [ ] Real-time countdown (1s interval)
- [ ] Search/filter by title
- [ ] Pull-to-refresh
- [ ] Bid composer with suggested bid
- [ ] Buy Now instant purchase
- [ ] Watch / unwatch toggle
- [ ] Custom auction creation integration
- [ ] Remote sync + local merge
- [ ] Sync status pill + retry banner
- [ ] Auction settlement on expiry
- [ ] Empty state
- [ ] Ad poster carousel for upcoming auctions

### CreateAuctionScreen
- [ ] Listing selection from seller inventory
- [ ] Starting bid default (80% of listing price)
- [ ] Buy now toggle + validation (> starting bid)
- [ ] Schedule start window (Now / 30m / 1h / 3h)
- [ ] 6-hour fixed duration
- [ ] Currency conversion (GBP ↔ IZE ↔ display)
- [ ] Validation before launch
- [ ] Success toast + navigation back
- [ ] Mock fallback when no own listings

---

**Next**: Read `15_TRADE_AND_WALLET.md` for TradeHub, SyndicateHub, and Wallet screens.
