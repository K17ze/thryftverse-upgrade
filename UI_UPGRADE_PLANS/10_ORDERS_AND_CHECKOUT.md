# 10 — Orders & Checkout Playbook

> Screens: `CheckoutScreen`, `OrderDetailScreen`, `MyOrdersScreen`, `WriteReviewScreen`
> Heritage plans: AESTHETIC_CROSSCHECK_PLAN §3, OTHER_SCREENS_UPGRADE_PLAN §3

---

## 1. Current State Snapshot

| Screen | Current Quality | Gap |
|---|---|---|
| `CheckoutScreen` | ✅ Good — `ScreenHeader`, `FadeInDown`, bottom sheets | Pattern 1: Solid → Glass on order summary card |
| `OrderDetailScreen` | ✅ Good — Timeline with dots/lines, status banner, transaction card | Pattern 1: Timeline cards → GlassCard; gold tint on completed steps |
| `MyOrdersScreen` | Solid order list cards | Swap to `GlassCard` |
| `WriteReviewScreen` | Solid form | Swap to `GlassCard`; use `AppInput variant="glass"` |

**Honest audit verdict**: Checkout and OrderDetail have good primitives — Pattern 1 applies for full consistency.

---

## 2. Per-Screen Edits

### 2.1 `CheckoutScreen.tsx` (POLISH + GLASS)

**File**: `frontend/src/screens/CheckoutScreen.tsx`

**Edits**:
1. Order summary card: `AppCard` → `GlassCard intensity={25} borderRadius={20}`; item preview (image + title + qty + price)
2. Price breakdown (Subtotal, Shipping, Tax, Total): rows inside the glass card; Total in `Type.title` gold
3. Shipping address selector: glass card
4. Payment method selector: glass card
5. Promo code input: `AppInput variant="glass"`
6. Place Order CTA: `AppButton variant="primary" size="lg"` with `GlowSurface`
7. `FadeInDown` stagger

### 2.2 `OrderDetailScreen.tsx` (POLISH + GLASS)

**File**: `frontend/src/screens/OrderDetailScreen.tsx`

**Edits**:
1. Status banner at top: `GlassCard intensity={30} borderRadius={20}`; large status icon + label; color matches status (success/warning/danger)
2. **Timeline** (Order placed → Confirmed → Shipped → Delivered): each step = glass row; completed step = `borderColor: Colors.brand` + `shadowColor: Glow.brand`; current = `PulseDot`; future = muted
3. Item card: `GlassCard intensity={25}`; image + title + price + qty
4. Shipping info card: `GlassCard intensity={20}`; address + tracking number
5. Transaction card: `GlassCard intensity={20}`; amount + payment method
6. Action buttons (Track Package, Contact Seller, Request Refund): row of glass buttons
7. Add `FadeInUp` stagger

### 2.3 `MyOrdersScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/MyOrdersScreen.tsx`

**Edits**:
1. Tabs (All / Active / Completed / Cancelled): `AppSegmentControl variant="glass"`
2. Order list cards: each = `GlassCard intensity={25} borderRadius={16}`; horizontal layout: image (left, 60×60) + title + status pill + price
3. Status pill: `AppStatusPill` (variant matches status: active/success/warning/danger)
4. `StaggeredGridEntrance` or `FadeInDown` stagger
5. Empty state: `GlowOrb` + package icon + "No orders yet"

### 2.4 `WriteReviewScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/WriteReviewScreen.tsx`

**Edits**:
1. Item preview at top: `GlassCard intensity={20}` horizontal layout
2. Star rating row: 5 large (40px) tappable stars; selected stars in `Colors.brand` (gold), unselected in `Colors.textMuted`; with `AnimatedPressable` for press scale
3. Review title input: `AppInput variant="glass"`
4. Review body: `AppInput variant="glass" multiline` (6 rows)
5. Photo upload: 4-5 thumbnail slots (dashed border, glass bg)
6. Submit button: `AppButton variant="primary"` with `GlowSurface`
7. `FadeInUp` stagger

---

## 3. Common Patterns (all screens in this section)

```tsx
// Order card pattern (MyOrders, OrderDetail)
<GlassCard intensity={25} borderRadius={16} style={{ padding: Space.md, flexDirection: 'row', alignItems: 'center' }}>
  <CachedImage uri={item.image} style={{ width: 60, height: 60, borderRadius: 10 }} />
  <View style={{ flex: 1, marginLeft: Space.md }}>
    <Text style={Type.bodyEmphasis} numberOfLines={1}>{item.title}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
      <AppStatusPill label={item.status} variant={statusVariant} />
      <Text style={{ ...Type.caption, color: Colors.textMuted, marginLeft: Space.sm }}>{item.date}</Text>
    </View>
  </View>
  <Text style={{ ...Type.bodyEmphasis, color: Colors.brand }}>{item.price}</Text>
</GlassCard>

// Timeline step pattern (OrderDetail)
<View style={{ flexDirection: 'row', alignItems: 'center' }}>
  <View style={{
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: isCompleted ? Colors.brand : 'transparent',
    borderWidth: 2, borderColor: isCompleted ? Colors.brand : (isCurrent ? Colors.brand : Colors.border),
    alignItems: 'center', justifyContent: 'center',
  }}>
    {isCurrent && <PulseDot size={8} />}
    {isCompleted && <Ionicons name="checkmark" size={14} color="#0A0A0A" />}
  </View>
  <Text style={{ ...Type.body, color: isCompleted ? Colors.textPrimary : Colors.textMuted, marginLeft: Space.md }}>
    {step.label}
  </Text>
</View>
```

---

## 4. Acceptance Criteria

- [ ] All cards use `GlassCard`
- [ ] Order status pills use `AppStatusPill`
- [ ] Timeline completed steps have gold tint
- [ ] All inputs use `AppInput variant="glass"`
- [ ] All CTAs use `GlowSurface` + `AppButton variant="primary"`
- [ ] `npm run typecheck` passes

---

## 5. Feature Preservation Checklist

### CheckoutScreen
- [ ] Order summary
- [ ] Price breakdown
- [ ] Shipping address selector
- [ ] Payment method selector
- [ ] Promo code
- [ ] Place order CTA
- [ ] Validation

### OrderDetailScreen
- [ ] Status banner
- [ ] Timeline (placed → confirmed → shipped → delivered)
- [ ] Item details
- [ ] Shipping info
- [ ] Tracking number
- [ ] Transaction details
- [ ] Action buttons (Track, Contact, Refund)
- [ ] Cancel order (if applicable)

### MyOrdersScreen
- [ ] Order list with tabs
- [ ] Status filter
- [ ] Date range filter
- [ ] Tap to OrderDetail
- [ ] Empty state

### WriteReviewScreen
- [ ] Item preview
- [ ] Star rating
- [ ] Review title
- [ ] Review body
- [ ] Photo upload
- [ ] Submit
- [ ] Validation (min chars, required rating)

---

**Next**: Read `11_TRADE_HUB_AND_SYNDICATE.md` for TradeHub, SyndicateHub screens.
