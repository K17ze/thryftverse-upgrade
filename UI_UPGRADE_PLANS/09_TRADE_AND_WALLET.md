# 09 — Trade & Wallet Playbook

> Screens: `BalanceScreen`, `BalanceHistoryScreen`, `WithdrawScreen`, `AddBankAccountScreen`, `PaymentsScreen`, `PostageScreen`, `WalletScreen`, `PortfolioScreen`, `MarketLedgerScreen`
> Heritage plans: OTHER_SCREENS_UPGRADE_PLAN §3, AESTHETIC_CROSSCHECK_PLAN §3

---

## 1. Current State Snapshot

| Screen | Current Quality | Gap |
|---|---|---|
| `BalanceScreen` | Solid balance hero + metric cards | Swap to `GlassCard`; add gold accent on balance |
| `BalanceHistoryScreen` | Solid transaction rows | Swap to `GlassCard` |
| `WithdrawScreen` | Solid form | Swap to `GlassCard`; use `AppInput variant="glass"` |
| `AddBankAccountScreen` | Solid form | Same as Withdraw |
| `PaymentsScreen` | Solid payment method cards | Swap to `GlassCard` |
| `PostageScreen` | Solid shipping profile cards | Swap to `GlassCard`; toggle → `PremiumToggle` |
| `WalletScreen` | (Similar to Balance) | Same gap |
| `PortfolioScreen` | Solid metric cards + holdings list | Swap to `GlassCard` |
| `MarketLedgerScreen` | Solid transaction rows | Swap to `GlassCard` |

**Honest audit verdict**: All these screens use solid surfaces — Pattern 1 (Solid→Glass) applies uniformly.

---

## 2. Per-Screen Edits (common pattern)

### 2.1 `BalanceScreen.tsx` (REFACTOR)

**Edits**:
1. Balance hero card: `AppCard` → `GlassCard intensity={30} borderRadius={24} padding={Space.xl}`; balance number in `Type.priceLarge` (28/700) gold
2. Quick action row (Top Up, Withdraw, Send): 3 glass icon buttons with gold-tinted containers
3. Metric cards (This month, Pending, Available): 3 glass cards in a row, each with label (Type.meta, muted) + value (Type.title, white)
4. Recent activity preview: small list of transaction rows
5. `FadeInDown` stagger

### 2.2 `BalanceHistoryScreen.tsx` (REFACTOR)

**Edits**:
1. Filter chips (All / Income / Expense): glass pills
2. Transaction rows: each = `GlassCard intensity={20} borderRadius={16}`; icon container (tinted square 40×40) + title + amount (green for credit, red for debit) + time
3. Group by day with sticky date headers (Type.meta, muted)
4. `FadeInDown` stagger

### 2.3 `WithdrawScreen.tsx` (REFACTOR)

**Edits**:
1. Available balance display at top: glass card, gold text
2. Amount input: `AppInput variant="glass"` with currency prefix, large (28px) bold
3. Bank account selector: glass card with current account preview
4. Memo input: `AppInput variant="glass" multiline`
5. Withdraw button: `AppButton variant="primary"` with `GlowSurface`
6. `FadeInUp` stagger

### 2.4 `AddBankAccountScreen.tsx` (REFACTOR)

**Edits**:
1. Form card: `GlassCard intensity={25} borderRadius={20}`
2. Section labels (Bank Details, Account Holder): Type.meta uppercase
3. All inputs: `AppInput variant="glass"` (Account holder name, Account number, Routing number, Bank name)
4. Verify micro-deposits UI: 2 small inputs
5. Save button: `AppButton variant="primary"` with `GlowSurface`
6. `FadeInUp` stagger

### 2.5 `PaymentsScreen.tsx` (REFACTOR)

**Edits**:
1. Payment method cards (Credit card, PayPal, etc.): each = `GlassCard intensity={25} borderRadius={16}`; card icon (left) + last 4 digits + expiry; default badge if primary
2. Add new method button: glass outlined card with `+ Add Payment Method`
3. Default badge: `AppStatusPill variant="active"`
4. `FadeInDown` stagger

### 2.6 `PostageScreen.tsx` (REFACTOR)

**Edits**:
1. Shipping profile cards: each = `GlassCard intensity={25} borderRadius={16}`; name + address + "Default" badge
2. "Use as default" toggle: `PremiumToggle` (replaces native Switch)
3. Add new address button: glass outlined
4. `FadeInDown` stagger

### 2.7 `WalletScreen.tsx` (REFACTOR)

**Edits** (similar to BalanceScreen):
1. Hero balance card: `GlassCard intensity={30} borderRadius={24}`
2. Send / Receive QR: large glass card with QR code centered
3. Recent transactions: small list
4. `FadeInUp` stagger

### 2.8 `PortfolioScreen.tsx` (REFACTOR)

**Edits**:
1. Top metric row (Total Value, 24h Change, All-time): 3 glass metric cards; "Total Value" uses gold; change is green/red with arrow icon
2. Holdings list: each row = `GlassCard intensity={20}`; logo (40×40 circular) + name + amount + value (gold)
3. Chart card: `GlassCard intensity={25}` wrapping a chart (line/area)
4. `FadeInDown` stagger

### 2.9 `MarketLedgerScreen.tsx` (REFACTOR)

**Edits**:
1. Header stats: 2-3 glass metric cards
2. Ledger rows: each = `GlassCard intensity={20}`; type icon + counterparty + amount + status
3. Date grouping with sticky headers
4. `FadeInDown` stagger

---

## 3. Common Token Usage (all screens in this section)

```tsx
// Hero card pattern (Balance, Wallet, Portfolio)
<GlassCard intensity={30} borderRadius={24} style={{ padding: Space.xl, margin: Space.md }}>
  <Text style={{ ...Type.meta, color: Colors.textMuted, textTransform: 'uppercase' }}>Total Balance</Text>
  <Text style={{ ...Type.priceLarge, color: Colors.brand, marginTop: Space.xs }}>$4,250.00</Text>
  <Text style={{ ...Type.caption, color: Colors.textMuted, marginTop: Space.xs }}>+$120 this week</Text>
</GlassCard>

// Metric card pattern
<GlassCard intensity={25} borderRadius={16} style={{ padding: Space.md, flex: 1 }}>
  <Text style={{ ...Type.meta, color: Colors.textMuted, textTransform: 'uppercase' }}>This Month</Text>
  <Text style={{ ...Type.title, color: Colors.textPrimary, marginTop: Space.xs }}>$1,240</Text>
</GlassCard>

// Transaction row pattern
<GlassCard intensity={20} borderRadius={16} style={{ padding: Space.md, flexDirection: 'row', alignItems: 'center' }}>
  <View style={{
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: `${iconColor}20`,
    alignItems: 'center', justifyContent: 'center',
  }}>
    <Ionicons name={icon} size={20} color={iconColor} />
  </View>
  <View style={{ flex: 1, marginLeft: Space.md }}>
    <Text style={Type.bodyEmphasis}>{title}</Text>
    <Text style={{ ...Type.caption, color: Colors.textMuted }}>{time}</Text>
  </View>
  <Text style={{ ...Type.bodyEmphasis, color: isCredit ? Colors.success : Colors.danger }}>
    {isCredit ? '+' : '−'}{amount}
  </Text>
</GlassCard>
```

---

## 4. Acceptance Criteria

- [ ] All hero/metric cards use `GlassCard intensity={25-30}`
- [ ] All transaction rows use `GlassCard intensity={20}`
- [ ] Balance numbers use `Type.priceLarge` in `Colors.brand` (gold)
- [ ] All inputs use `AppInput variant="glass"`
- [ ] All toggles use `PremiumToggle` (PostageScreen)
- [ ] All `FadeInDown`/`FadeInUp` staggers present
- [ ] `npm run typecheck` passes

---

## 5. Feature Preservation Checklist

### BalanceScreen
- [ ] Current balance display (gold)
- [ ] Pending balance
- [ ] Available balance
- [ ] Quick actions: Top Up, Withdraw, Send
- [ ] Recent transactions
- [ ] Pull-to-refresh

### BalanceHistoryScreen
- [ ] Transaction list grouped by date
- [ ] Filter by type (All/Income/Expense)
- [ ] Each row: icon, title, time, amount
- [ ] Tap to transaction detail
- [ ] Infinite scroll

### WithdrawScreen
- [ ] Available balance
- [ ] Amount input
- [ ] Bank account selector
- [ ] Memo
- [ ] Withdraw button
- [ ] Validation (min/max amount)

### AddBankAccountScreen
- [ ] Bank name, account holder, account number, routing
- [ ] Verify micro-deposits
- [ ] Save bank account

### PaymentsScreen
- [ ] List of payment methods
- [ ] Default indicator
- [ ] Add new method
- [ ] Edit/Delete method
- [ ] Set as default

### PostageScreen
- [ ] List of shipping addresses
- [ ] Default indicator
- [ ] Add new address
- [ ] Edit/Delete address
- [ ] Set as default

### WalletScreen
- [ ] Balance
- [ ] Send (QR or address)
- [ ] Receive (QR code)
- [ ] Transaction history

### PortfolioScreen
- [ ] Total value
- [ ] 24h change
- [ ] All-time high/low
- [ ] Chart
- [ ] Holdings list
- [ ] Tap to coin detail

### MarketLedgerScreen
- [ ] Header stats
- [ ] Transaction list grouped by date
- [ ] Filter by type
- [ ] Tap to transaction detail

---

**Next**: Read `10_ORDERS_AND_CHECKOUT.md` for Checkout, OrderDetail, MyOrders, WriteReview screens.
