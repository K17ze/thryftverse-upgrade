# 11 — Trade Hub & Syndicate Playbook

> Screens: `TradeHubScreen`, `SyndicateHubScreen`, `SyndicateOnboardingScreen`, `SyndicateOrderHistoryScreen`, `SyndicateScreen`, `CreateSyndicateScreen`
> Heritage plans: AESTHETIC_CROSSCHECK_PLAN §3, OTHER_SCREENS_UPGRADE_PLAN §3

---

## 1. Current State Snapshot

| Screen | Existing Quality | Gap |
|---|---|---|
| `TradeHubScreen` | Metrics grid removed, tab switcher at top. Solid card rows. | Swap to `GlassCard`, glass metric cards |
| `SyndicateHubScreen` | Solid cards for syndicate listings | Swap to `GlassCard` |
| `SyndicateOnboardingScreen` | Solid form cards | Swap to `GlassCard`, use `AppInput variant="glass"` |
| `SyndicateOrderHistoryScreen` | Solid transaction rows | Swap to `GlassCard` |
| `SyndicateScreen` | Solid detail cards | Swap to `GlassCard` |
| `CreateSyndicateScreen` | Solid form | Swap to `GlassCard`, glass inputs |

**Honest audit verdict**: All 6 screens use solid surfaces — Pattern 1 (Solid→Glass) applies uniformly.

---

## 2. Per-Screen Edits

### 2.1 `TradeHubScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/TradeHubScreen.tsx`

**Edits**:
1. **Tab switcher** at top: wrap in `GlassCard intensity={15} borderRadius={999}`; active tab = gold background + white text
2. **Metric cards** (if any remain): each = `GlassCard intensity={20} borderRadius={16}`; label in `Type.meta`, value in `Type.title`
3. **Listing rows**: `AppCard` or solid `View` → `GlassCard intensity={25} borderRadius={16}`
4. **Action buttons**: `AppButton variant="primary" size="lg"` with `GlowSurface`
5. `FadeInDown` stagger on rows

### 2.2 `SyndicateHubScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/SyndicateHubScreen.tsx`

**Edits**:
1. **Syndicate cards**: solid → `GlassCard intensity={25} borderRadius={20}`
2. Each card: image (full-bleed, borderRadius 20) + name + member count + progress bar (gold fill)
3. **Join button**: `AppButton variant="primary" size="sm"`; if joined → `variant="ghost"` with checkmark
4. **Filter chips**: glass pills, active = gold border
5. `FadeInDown` stagger

### 2.3 `SyndicateOnboardingScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/SyndicateOnboardingScreen.tsx`

**Edits**:
1. **Form container**: `AppCard` → `GlassCard intensity={25} borderRadius={20} padding={Space.lg}`
2. **All inputs**: `AppInput variant="glass"`
3. **Step progress dots**: gold circles, completed = solid, current = ring, future = muted
4. **Continue button**: `AppButton variant="primary" size="lg"` with `GlowSurface`
5. `FadeInUp` stagger

### 2.4 `SyndicateOrderHistoryScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/SyndicateOrderHistoryScreen.tsx`

**Edits**:
1. **Transaction rows**: each = `GlassCard intensity={20} borderRadius={16}`
2. Each row: icon (tinted square) + title + amount (green/red) + date
3. Group by month with sticky headers (`Type.meta`, muted)
4. `FadeInDown` stagger

### 2.5 `SyndicateScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/SyndicateScreen.tsx`

**Edits**:
1. **Hero card**: `GlassCard intensity={30} borderRadius={24}` with cover image + name + stats
2. **Member list**: each row = `GlassCard intensity={20} borderRadius={12}`; avatar + name + contribution
3. **Action buttons**: `AppButton variant="primary"` (Join) / `variant="secondary"` (Leave)
4. `FadeInDown` stagger

### 2.6 `CreateSyndicateScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/CreateSyndicateScreen.tsx`

**Edits**:
1. **Form card**: `GlassCard intensity={25} borderRadius={20}`
2. **All inputs**: `AppInput variant="glass"` (Name, Description, Target amount, Min contribution)
3. **Cover image picker**: glass circle with dashed border + camera icon
4. **Launch CTA**: `AppButton variant="primary" size="lg"` with `GlowSurface`
5. `FadeInUp` stagger

---

## 3. Component Dependencies

| Component | Required For | Status |
|---|---|---|
| `GlassCard` | All screens | ✅ Exists |
| `AppButton` | All CTAs | ✅ Exists |
| `AppInput variant="glass"` | Onboarding, CreateSyndicate | ✅ Enhanced |
| `GlowSurface` | Primary CTAs | ✅ Exists |
| `AvatarRing` | Member rows | ✅ Exists |
| `FadeInDown` / `FadeInUp` | All | ✅ Exists |

---

## 4. Acceptance Criteria

- [ ] All 6 screens use `GlassCard` for their main content containers
- [ ] All form inputs use `AppInput variant="glass"`
- [ ] All primary CTAs use `AppButton variant="primary" size="lg"`
- [ ] All list entrances use `FadeInDown` with stagger
- [ ] All metric/value displays use gold (`Colors.brand`) for emphasis
- [ ] `npm run typecheck` passes

---

## 5. Feature Preservation Checklist

### TradeHubScreen
- [ ] Tab switcher (Buy / Sell / Trade / Syndicate)
- [ ] Pull-to-refresh
- [ ] Navigate to listing detail

### SyndicateHubScreen
- [ ] Syndicate grid/list
- [ ] Filter/search
- [ ] Join / Leave actions

### SyndicateOnboardingScreen
- [ ] Multi-step flow
- [ ] Form validation
- [ ] Progress persistence

### SyndicateOrderHistoryScreen
- [ ] Transaction list
- [ ] Group by date
- [ ] Pull-to-refresh

### SyndicateScreen
- [ ] Member list
- [ ] Contribution stats
- [ ] Join/Leave

### CreateSyndicateScreen
- [ ] Image upload
- [ ] Form validation
- [ ] Launch syndicate

---

**Next**: Read `12_SETTINGS_AND_SECURITY.md` for Settings, Account, Security, Support screens.
