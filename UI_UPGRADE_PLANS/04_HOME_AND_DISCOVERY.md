# 04 — Home & Discovery Playbook

> Screens: `HomeScreen`, `BrowseScreen`, `GlobalSearchScreen`, `FilterScreen`, `CategoryTreeScreen`, `CategoryDetailScreen`
> Heritage plans: OTHER_SCREENS_UPGRADE_PLAN §3, AESTHETIC_CROSSCHECK_PLAN §3
> Reference images: inherits from `overall outlook.jpeg` (master aesthetic)

---

## 1. Current State Snapshot

| Screen | Existing Quality | Gap |
|---|---|---|
| `HomeScreen` | ✅ **Premium** — `BlurView` header, masonry grid, stories, parallax, `SkeletonLoader`, `SharedTransitionView` | Polish + pattern verify |
| `BrowseScreen` | Listing cards in solid `AppCard` | Swap to `GlassCard` (Pattern 1) |
| `GlobalSearchScreen` | Raw `TextInput` search + result cards | Add `GlassSearchPill`, swap results to `GlassCard` |
| `FilterScreen` | Solid filter sections | Swap to `GlassCard`; add `GlassSearchPill` if search exists |
| `CategoryTreeScreen` | Solid cards | Swap to `GlassCard` |
| `CategoryDetailScreen` | Solid cards | Swap to `GlassCard` |

**Honest audit verdict**: `HomeScreen` is already excellent — minor pattern adoption only. The other 5 screens need Pattern 1 (`Solid → Glass`).

---

## 2. Per-Screen Edits

### 2.1 `HomeScreen.tsx` (POLISH + PATTERN VERIFY)

**Verify these premium features are intact** (don't break them):
- `BlurView` floating header with scroll-aware opacity (0 → 1 over 80px)
- `StaggeredGridEntrance` for product grid
- `ProductCardV2` with `SharedTransitionView` tags
- Story bubbles (top horizontal scroll) with gradient rings
- Search bar: should be `GlassSearchPill` (NEW — if not yet, add it)
- `SkeletonLoader` while fetching
- `RefreshControl` for pull-to-refresh
- `FadeInUp` for section headers

**Adoption**:
- Replace any solid `AppCard` with `GlassCard`
- Any remaining `Pressable` → `AnimatedPressable`
- Any remaining bare `Image` → `CachedImage`

### 2.2 `BrowseScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/BrowseScreen.tsx`

**Edits**:
1. All `AppCard variant="surface"` wrapping listing cards → `GlassCard intensity={25} borderRadius={20}`
2. Category filter chips at top: each chip = `GlassCard` (intensity=15) with `borderRadius=999`; active = `borderColor: Colors.brand`
3. Grid header: section title in `Type.subtitle`, see all link as `AppButton variant="ghost"`
4. Replace bare `Image` with `CachedImage`
5. Wrap grid in `StaggeredGridEntrance` if not already

### 2.3 `GlobalSearchScreen.tsx` (REFACTOR + NEW COMPONENT)

**File**: `frontend/src/screens/GlobalSearchScreen.tsx`

**Edits**:
1. **Top search bar**: Replace raw `TextInput` + custom `View` wrapper with `<GlassSearchPill autoFocus />`
2. **Recent search chips**: each chip = `GlassCard intensity={15} borderRadius={999}`; `paddingHorizontal: 12, paddingVertical: 6`
3. **Result cards**: solid → `GlassCard intensity={25} borderRadius={16}`; horizontal layout: image left, title/price right
4. **Empty state**: `GlowOrb` behind search icon
5. **Loading state**: `SkeletonLoader` rows (height 80)

**Note**: This screen REQUIRES `GlassSearchPill` to be created first (per `02_SHARED_COMPONENTS.md` §19).

### 2.4 `FilterScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/FilterScreen.tsx`

**Edits**:
1. Each filter section card (Category, Brand, Size, Condition, Price): `AppCard` → `GlassCard intensity={25} borderRadius={16}`
2. Each section title: `Type.subtitle` in `Colors.textPrimary`
3. Each option row: `AnimatedPressable` with `Colors.surface` background → glass; selected = `borderColor: Colors.brand`
4. Price range slider: gold track, white thumb (custom — wrap `@react-native-community/slider`)
5. Reset button: `AppButton variant="ghost"`; Apply button: `AppButton variant="primary" size="lg"` (sticky footer)

### 2.5 `CategoryTreeScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/CategoryTreeScreen.tsx`

**Edits**:
1. Category cards: `AppCard` → `GlassCard intensity={20} borderRadius={16}`
2. Each card: icon (32px tinted square, `borderRadius: 10`) + name + chevron
3. Active category (tapped): `borderColor: Colors.brand` + `shadowColor: Glow.brand`
4. Use `AvatarRing` (or icon container with gold tint) for category icons

### 2.6 `CategoryDetailScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/CategoryDetailScreen.tsx`

**Edits**:
1. Category hero header: glass card with category image + name + count
2. Sort/view toggle: `AppSegmentControl variant="glass"` (Grid / List)
3. Listing grid: same as `BrowseScreen` — `ProductCardV2` in `StaggeredGridEntrance`
4. Filter button (top right): glass icon button with `options-outline` icon

---

## 3. Component Dependencies

| Component | Required For | Created? |
|---|---|---|
| `GlassSearchPill` | `GlobalSearchScreen` | ❌ **Must create first** per 02 §19 |
| `GlassCard` | All screens | ✅ Exists |
| `ProductCardV2` | `BrowseScreen`, `CategoryDetailScreen` | ✅ Exists |
| `StaggeredGridEntrance` | `BrowseScreen`, `CategoryDetailScreen` | ✅ Exists |
| `AppSegmentControl` | `FilterScreen`, `CategoryDetailScreen` | ✅ Exists |
| `SkeletonLoader` | `GlobalSearchScreen` (loading) | ✅ Exists |

---

## 4. Acceptance Criteria

- [ ] All listing/category cards use `GlassCard` (Pattern 1)
- [ ] All bare `TextInput` (especially in search) replaced with `GlassSearchPill` or `AppInput`
- [ ] All bare `Image` replaced with `CachedImage`
- [ ] All `Pressable` replaced with `AnimatedPressable`
- [ ] HomeScreen patterns preserved (parallax, masonry, shared transitions)
- [ ] All filter chips and toggles use glass styling
- [ ] All `StaggeredGridEntrance` entrance animations in place
- [ ] `npm run typecheck` passes

---

## 5. Feature Preservation Checklist

### HomeScreen
- [ ] Masonry grid of listings
- [ ] Story bubbles (top horizontal scroll)
- [ ] Section headers with "see all" links
- [ ] Search bar at top (in header)
- [ ] Tab bar at bottom
- [ ] Pull-to-refresh
- [ ] Shared transition to ItemDetail
- [ ] Double-tap to like
- [ ] Filter chips row (optional)

### BrowseScreen
- [ ] Listing grid
- [ ] Category filter chips
- [ ] Pull-to-refresh
- [ ] Infinite scroll
- [ ] Tap to ItemDetail

### GlobalSearchScreen
- [ ] Auto-focus search input
- [ ] Recent searches (persisted)
- [ ] Live result updates as user types
- [ ] Recent searches clearable
- [ ] Empty state
- [ ] Result tap to ItemDetail or UserProfile

### FilterScreen
- [ ] Category picker
- [ ] Brand picker (multi-select chips)
- [ ] Size picker
- [ ] Condition picker
- [ ] Price range slider
- [ ] Color picker
- [ ] Reset / Apply
- [ ] Apply closes screen, updates parent

### CategoryTreeScreen
- [ ] Tree of categories (top-level + sub-categories)
- [ ] Tap to enter sub-category
- [ ] Visual hierarchy (indentation)

### CategoryDetailScreen
- [ ] Category hero
- [ ] Grid of listings in category
- [ ] Sort/filter
- [ ] View toggle (grid/list)

---

**Next**: Read `05_ITEM_DETAIL.md` for ItemDetail, MakeOffer, Buyout screens.
