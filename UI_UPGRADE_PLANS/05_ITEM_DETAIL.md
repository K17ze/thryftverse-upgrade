# 05 — Item Detail Playbook

> Screens: `ItemDetailScreen`, `MakeOfferScreen`, `BuyoutScreen`
> Heritage plans: AESTHETIC_CROSSCHECK_PLAN §3, OTHER_SCREENS_UPGRADE_PLAN §3
> Reference images: inherits from `overall outlook.jpeg` (master aesthetic)

---

## 1. Current State Snapshot

| Screen | Existing Quality | Gap |
|---|---|---|
| `ItemDetailScreen` | ✅ **Premium** — parallax hero, `BlurView` floating header, `SharedTransitionView`, `DoubleTapHeart`, `AnimatedPressable` back/share buttons | Polish only |
| `MakeOfferScreen` | Solid offer card + input | Swap to `GlassCard`, use `AppInput variant="glass"` |
| `BuyoutScreen` | Solid summary card | Swap to `GlassCard` |

**Honest audit verdict**: `ItemDetailScreen` is the most premium screen in the app — preserve its features. `MakeOfferScreen` and `BuyoutScreen` need Pattern 1 (Solid→Glass).

---

## 2. Per-Screen Edits

### 2.1 `ItemDetailScreen.tsx` (POLISH + PATTERN VERIFY)

**File**: `frontend/src/screens/ItemDetailScreen.tsx`

**Verify these premium features are intact**:
- Hero image at top: `CachedImage` with parallax (scroll-driven translateY)
- Image carousel: paging with indicator dots
- `SharedTransitionView` with `sharedTransitionTag` matching `ProductCardV2`
- `DoubleTapHeart` overlay (double-tap to like)
- Floating header: `BlurView` (intensity 0→25 on scroll) with back/share/like buttons (Pattern 2: glass buttons)
- Seller row below hero: `AvatarRing size={48}` + name + reputation badge + chevron
- Title section: `Type.title` for name, `Type.subtitle` for brand/category
- Price section: `Type.priceLarge` (28/700) in `Colors.brand` (gold)
- Description: `Type.body` (15/500) in `Colors.textSecondary`
- Details card: `GlassCard intensity={25}` containing specs (size, condition, color, material)
- Activity badge row (views, likes, offers)
- Sticky bottom CTA: glass bar with Make Offer + Buy Now buttons

**Polish improvements**:
- Add `FadeInUp` staggered entrance to details sections (after parallax settles)
- Add `accessibilityLabel` to image carousel (e.g., "Product image 1 of 5")
- Seller row chevron: 18px `chevron-forward` in `Colors.textMuted`
- Reputation badge: small `AppStatusPill variant="active"` if verified

**DO NOT**:
- Don't add a new "Buy Now" button if there's already a sticky one
- Don't change the parallax — it's the most distinctive feature

### 2.2 `MakeOfferScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/MakeOfferScreen.tsx`

**Current state**: Solid `AppCard variant="surface"` wrapping the offer form.

**Edits**:
1. Form container: `AppCard` → `GlassCard intensity={25} borderRadius={20}`
2. Item preview row at top (thumbnail + title + listed price): keep as-is but wrap in `GlassCard intensity={20}` with horizontal layout
3. Offer amount input: `AppInput variant="glass"` with currency prefix, large (28px) bold typography
4. Suggested offers chips (e.g., "90%", "85%", "75%" of list price): each chip = glass pill, selected = gold border
5. Message input (optional message to seller): `AppInput variant="glass" multiline` (4 rows)
6. Submit button: `AppButton variant="primary" size="lg"` with `GlowSurface` wrapper when valid amount
7. Cancel: `AppButton variant="ghost"`
8. Add `FadeInUp` entrance to form card

**Result sketch**:
```tsx
<SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: Colors.background }}>
  <ScreenHeader title="Make an Offer" showBack />
  <ScrollView contentContainerStyle={{ padding: Space.md }}>
    <FadeInUp duration={400} delay={100}>
      <GlassCard intensity={20} borderRadius={16} style={{ padding: Space.md, flexDirection: 'row' }}>
        <CachedImage uri={item.imageUrl} style={{ width: 60, height: 60, borderRadius: 10 }} />
        <View style={{ marginLeft: Space.md, flex: 1 }}>
          <Text style={Type.subtitle}>{item.title}</Text>
          <Text style={{ ...Type.body, color: Colors.textSecondary }}>Listed at {formatPrice(item.price)}</Text>
        </View>
      </GlassCard>
    </FadeInUp>

    <FadeInUp duration={400} delay={200}>
      <GlassCard intensity={25} borderRadius={20} style={{ padding: Space.lg, marginTop: Space.md }}>
        <Text style={{ ...Type.meta, color: Colors.textMuted, textTransform: 'uppercase' }}>Your Offer</Text>
        <AppInput variant="glass" prefix="$" value={offer} onChangeText={setOffer} placeholder="0.00" style={{ fontSize: 28, fontWeight: '700' }} />
        <View style={{ flexDirection: 'row', gap: Space.sm, marginTop: Space.md }}>
          {['90%', '85%', '75%'].map(pct => (
            <AnimatedPressable key={pct} onPress={() => setOffer(String(item.price * 0.9))}
              style={{ paddingHorizontal: Space.md, paddingVertical: Space.sm, borderRadius: 999,
                       backgroundColor: Glass.bgLight, borderColor: Glass.border, borderWidth: 0.5 }}>
              <Text style={{ ...Type.body, color: Colors.textPrimary }}>{pct}</Text>
            </AnimatedPressable>
          ))}
        </View>
        <Text style={{ ...Type.meta, color: Colors.textMuted, textTransform: 'uppercase', marginTop: Space.lg }}>Message (Optional)</Text>
        <AppInput variant="glass" multiline value={message} onChangeText={setMessage} placeholder="Hi! I'm interested in..." />
      </GlassCard>
    </FadeInUp>
  </ScrollView>
  <GlassBottomBar>
    <GlowSurface intensity={0.1} color={Colors.brand} borderRadius={16} style={{ flex: 1 }}>
      <AppButton variant="primary" size="lg" fullWidth onPress={handleSubmit}>Send Offer</AppButton>
    </GlowSurface>
  </GlassBottomBar>
</SafeAreaView>
```

### 2.3 `BuyoutScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/BuyoutScreen.tsx`

**Edits**:
1. Summary card: `AppCard` → `GlassCard intensity={25} borderRadius={20}`
2. Item preview row: same as MakeOffer (glass card, horizontal)
3. Price breakdown rows (Item price, Service fee, Shipping, Total): each in a glass sub-card
4. Total row: bold `Type.priceLarge` in `Colors.brand`
5. Payment method selector: glass card, dropdown picker
6. Shipping address selector: glass card
7. CTA: `AppButton variant="primary" size="lg"` with `GlowSurface` — "Confirm Purchase"
8. Add `FadeInUp` staggered entrance

---

## 3. Component Dependencies

| Component | Required For | Created? |
|---|---|---|
| `GlassCard` | All | ✅ |
| `AppInput variant="glass"` | MakeOffer, Buyout | ❌ **Enhance AppInput** per 02 §3 |
| `GlowSurface` | MakeOffer, Buyout (CTA halo) | ✅ |
| `AppButton` | All | ✅ |
| `GlassBottomBar` | MakeOffer, Buyout (sticky footer) | ✅ |
| `ScreenHeader` | All | ✅ |
| `AvatarRing` | ItemDetail (seller row) | ✅ |
| `DoubleTapHeart` | ItemDetail | ✅ |
| `CachedImage` | All | ✅ |

---

## 4. Acceptance Criteria

- [ ] `ItemDetailScreen` parallax + blur + transitions preserved
- [ ] `ItemDetailScreen` seller row uses `AvatarRing`
- [ ] `MakeOfferScreen` form uses `GlassCard` + `AppInput variant="glass"`
- [ ] `BuyoutScreen` summary uses `GlassCard`
- [ ] All CTAs in MakeOffer/Buyout use `GlowSurface` + `AppButton variant="primary"`
- [ ] All icon buttons use Pattern 2 (glass)
- [ ] All bare `Image` → `CachedImage`
- [ ] `npm run typecheck` passes

---

## 5. Feature Preservation Checklist

### ItemDetailScreen
- [ ] Hero image carousel (multi-photo swipe)
- [ ] Parallax scroll effect
- [ ] Double-tap to like with heart animation
- [ ] Back, share, like header buttons
- [ ] Seller info + reputation
- [ ] Item title, brand, category
- [ ] Price in gold
- [ ] Description
- [ ] Details (size, condition, color, material, year)
- [ ] Activity stats (views, likes, offers)
- [ ] Make Offer / Buy Now sticky CTAs
- [ ] Report item link
- [ ] Similar items carousel at bottom
- [ ] Loading state (`SkeletonLoader`)

### MakeOfferScreen
- [ ] Item preview at top
- [ ] Offer amount input with currency prefix
- [ ] Quick percentage chips (90/85/75%)
- [ ] Optional message field
- [ ] Submit / Cancel
- [ ] Loading state
- [ ] Error handling (e.g., offer too low)
- [ ] Haptic on submit

### BuyoutScreen
- [ ] Item preview
- [ ] Price breakdown (item + fees + shipping)
- [ ] Total in gold
- [ ] Payment method selector
- [ ] Shipping address selector
- [ ] Confirm purchase CTA
- [ ] Terms checkbox
- [ ] Loading state during purchase
- [ ] Success state → OrderDetail

---

**Next**: Read `06_SELL_AND_LISTINGS.md` for Sell, EditListing, ListingSuccess, MyListings, ManageListing screens.
