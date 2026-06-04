# 02 — Shared Components Library Spec

> **Spec for every reusable UI component**
> Drives every per-section .md in this folder
> Read this AFTER `01_FOUNDATION_TOKENS.md`

This document covers: existing components (verify usage) + new components (create first).

---

## Quick Component Index

| Component | Path | Status | Used By |
|---|---|---|---|
| `GlassCard` / `GlassSurface` | `components/ui/GlassSurface.tsx` | ✅ Exists | Most screens |
| `GlassHeader` | `components/ui/GlassSurface.tsx` | ✅ Exists | All sticky headers |
| `GlassBottomBar` | `components/ui/GlassSurface.tsx` | ✅ Exists | Chat toolbar, picker |
| `GlowSurface` | `components/ui/GlowSurface.tsx` | ✅ Exists | CTAs, active states |
| `GlowOrb` | `components/ui/GlowSurface.tsx` | ✅ Exists | Empty states, hero |
| `AmbientGradient` | `components/ui/AmbientGradient.tsx` | ✅ Exists | AuthLanding background |
| `AppButton` | `components/ui/AppButton.tsx` | ✅ Exists | All CTAs |
| `AppCard` | `components/ui/AppCard.tsx` | ✅ Exists (legacy) | Legacy solid cards |
| `AppInput` | `components/ui/AppInput.tsx` | ✅ Exists, **enhance w/ `variant`** | All form inputs |
| `AppSegmentControl` | `components/ui/AppSegmentControl.tsx` | ✅ Exists | Inbox tabs, filters |
| `AppStatusPill` | `components/ui/AppStatusPill.tsx` | ✅ Exists | Status indicators |
| `ScreenHeader` | `components/ui/ScreenHeader.tsx` | ✅ Exists | Back-button headers |
| `AnimatedPressable` | `components/AnimatedPressable.tsx` | ✅ Exists | All interactive |
| `SkeletonLoader` | `components/SkeletonLoader.tsx` | ✅ Exists | Loading states |
| `CachedImage` | `components/CachedImage.tsx` | ✅ Exists | All images |
| `SharedTransitionView` | `components/SharedTransitionView.tsx` | ✅ Exists | Home → ItemDetail |
| `DoubleTapHeart` | `components/DoubleTapHeart.tsx` | ✅ Exists | Like animation |
| `ProductCardV2` | `components/ProductCardV2.tsx` | ✅ Exists | Home masonry |
| `StaggeredGridEntrance` | `components/StaggeredGridEntrance.tsx` | ✅ Exists | Home grid |
| `AvatarRing` | `components/chat/AvatarRing.tsx` | ✅ Exists | All avatars |
| `PulseDot` | `components/chat/PulseDot.tsx` | ✅ Exists | Unread indicators |
| `ChatMessageItem` | `components/ChatMessageItem.tsx` | ✅ Exists | Chat thread |
| `ChatMessageList` | `components/ChatMessageList.tsx` | ✅ Exists | Chat thread |
| **`GlassSearchPill`** | `components/ui/GlassSearchPill.tsx` | ❌ **TO CREATE** | Search inputs |
| **`PremiumToggle`** | `components/ui/PremiumToggle.tsx` | ❌ **TO CREATE** | Toggles |

---

## 1. GlassCard / GlassSurface (existing — verify usage)

**Location**: `components/ui/GlassSurface.tsx`

**Spec**:
```typescript
interface GlassCardProps {
  intensity?: number;          // default 25, range 12-40
  tint?: 'dark' | 'light' | 'default';
  borderRadius?: number;       // default 20 (Radius.xl)
  borderColor?: string;        // default Glass.border
  padding?: number;            // default 0 (caller controls)
  children: React.ReactNode;
  style?: ViewStyle;
  // iOS BlurView passthrough props also supported
}
```

**Intensity cheat sheet**:
- `intensity={15}` — subtle (segment strip)
- `intensity={20}` — list row card
- `intensity={25}` — form card, search pill
- `intensity={30}` — message card, primary content card
- `intensity={40}` — modal, bottom sheet

**Correct usage patterns**:
```tsx
// Standard card
<GlassCard intensity={25} tint="dark" borderRadius={20}>
  <View style={{ padding: Space.md }}>{content}</View>
</GlassCard>

// Active state
<GlassCard intensity={30} tint="dark" borderRadius={20} borderColor={Colors.borderFocus}>
  {/* content */}
</GlassCard>
```

**Anti-patterns to fix**:
```tsx
// ❌ Don't nest GlassCard inside a solid surface
<View style={{ backgroundColor: Colors.surface }}>
  <GlassCard>...</GlassCard>   // looks broken
</View>

// ❌ Don't use `intensity={60}+` — too blurry
<GlassCard intensity={80}>...</GlassCard>

// ✅ Always combine with a View for padding
<GlassCard>
  <View style={{ padding: Space.md }}>...</View>
</GlassCard>
```

---

## 2. AppButton (existing — verify variant usage)

**Location**: `components/ui/AppButton.tsx`

**Variants**:
| Variant | bg | text | Use |
|---|---|---|---|
| `primary` | `Colors.brand` | `#0A0A0A` (dark on gold) | Main CTAs |
| `secondary` | `Glass.bgLight` | `Colors.textPrimary` | Cancel, Skip |
| `ghost` | transparent | `Colors.brand` | "View all" links |
| `danger` | `Colors.danger` | `#FFFFFF` | Destructive confirm |
| `destructive` | `rgba(255,77,77,0.1)` | `Colors.danger` | Destructive outline |

**Sizes**:
- `sm` — height 40, used inline (e.g., in profile hero)
- `md` — height 48, secondary actions
- `lg` — height 56, PRIMARY CTAs (always this for the main button)

**Spec**:
```typescript
interface AppButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;         // default true
  loading?: boolean;           // shows gold ring spinner
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onPress: () => void;
  children: React.ReactNode;
}
```

**Correct usage**:
```tsx
// Primary CTA — gold
<AppButton variant="primary" size="lg" fullWidth onPress={handlePublish}>
  Publish Listing
</AppButton>

// With optional glow
<GlowSurface intensity={0.1} color={Colors.brand} borderRadius={16}>
  <AppButton variant="primary" size="lg" fullWidth onPress={handlePublish}>
    Publish Listing
  </AppButton>
</GlowSurface>

// Secondary (glass)
<AppButton variant="secondary" size="lg" fullWidth onPress={handleCancel}>
  Cancel
</AppButton>

// Ghost (text link)
<AppButton variant="ghost" onPress={handleForgot}>
  Forgot password?
</AppButton>

// Destructive (red, in danger context)
<AppButton variant="destructive" size="md" onPress={handleDelete}>
  Delete Account
</AppButton>
```

**Anti-patterns**:
- ❌ Don't use multiple `primary` buttons on one screen
- ❌ Don't use `primary` for "Cancel" (use `secondary` or `ghost`)
- ❌ Don't make the CTA too short — always `size="lg"` for primary

---

## 3. AppInput (existing — ENHANCE with `variant`)

**Location**: `components/ui/AppInput.tsx`

**Action**: Add a `variant` prop. Default is `solid` (current behavior). `glass` adds translucency.

**Spec**:
```typescript
interface AppInputProps {
  variant?: 'solid' | 'glass';          // default 'solid', NEW 'glass'
  label?: string;                       // floating label, top of input
  helperText?: string;                  // bottom, muted
  errorText?: string;                   // red, replaces helperText
  prefix?: React.ReactNode;             // currency symbol, icon
  suffix?: React.ReactNode;             // icon button (eye, clear)
  multiline?: boolean;
  disabled?: boolean;
  // standard TextInput props
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  // ... rest
}
```

**Token-driven styles**:
```typescript
const styles = {
  container: {
    solid: {
      backgroundColor: Colors.surface,                         // #121212
      borderRadius: Radius.md,                                  // 12
      borderWidth: 0.5,
      borderColor: Glass.border,
    },
    glass: {
      backgroundColor: Glass.bgLight,                          // rgba(255,255,255,0.04)
      borderRadius: 14,                                         // slightly different
      borderWidth: 0.5,
      borderColor: Glass.border,
    },
  },
  focused: {
    borderColor: Glass.borderFocus,                            // gold ring
    shadowColor: Glow.brand,
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  error: {
    borderColor: Colors.danger,
    shadowColor: Glow.danger,
  },
};
```

**Migration**:
```tsx
// Before
<AppInput label="Email" value={email} onChangeText={setEmail} />

// After (for elevated forms)
<AppInput variant="glass" label="Email" value={email} onChangeText={setEmail} />
```

**Use `glass` variant in**: Login, SignUp, ForgotPassword, EditProfile, AddBankAccount, ChangePassword, SellScreen form fields, MakeOffer, all onboarding forms.

**Use `solid` variant in**: Settings search (no decoration needed), in-modal quick inputs.

---

## 4. AnimatedPressable (existing — already correct)

**Location**: `components/AnimatedPressable.tsx`

**Spec** (must support):
```typescript
interface AnimatedPressableProps {
  onPress: () => void;
  onLongPress?: () => void;
  scaleValue?: number;         // default 0.97 for cards, 0.96 for buttons
  hapticType?: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'none';
  disabled?: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
}
```

**Audit checklist**:
- [ ] All `Pressable` in the codebase replaced with `AnimatedPressable`
- [ ] All icon buttons use `scaleValue={0.90}` + `hapticType="light"`
- [ ] All row presses use `scaleValue={0.985}` + `hapticType="light"`
- [ ] All button presses use `scaleValue={0.96}` + `hapticType="medium"`
- [ ] All destructive uses `hapticType="heavy"`

**Migration grep**:
```bash
grep -rn "<Pressable" frontend/src/ --include="*.tsx" | grep -v "AnimatedPressable"
# Every hit should be replaced
```

---

## 5. SkeletonLoader (existing — verify usage)

**Location**: `components/SkeletonLoader.tsx`

**Spec**:
```typescript
interface SkeletonLoaderProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  count?: number;             // renders N stacked
  duration?: number;          // shimmer duration in ms
}
```

**Use in**: HomeScreen initial load, ItemDetail loading, Profile loading, Inbox loading, any list that fetches async.

**Anti-patterns**:
- ❌ Don't use a solid `Colors.surface` box as a placeholder (looks dead)
- ❌ Don't use a `Spinner` for content loading (use for actions only)

---

## 6. CachedImage (existing — verify usage)

**Location**: `components/CachedImage.tsx`

**Spec**:
```typescript
interface CachedImageProps {
  uri: string;
  style?: ImageStyle;
  contentFit?: 'cover' | 'contain' | 'fill';
  priority?: 'high' | 'normal' | 'low';
  transition?: number;        // cross-fade ms
  blurhash?: string;          // placeholder
  // standard Image props
}
```

**Migration**:
```tsx
// ❌ Don't use bare <Image>
<Image source={{ uri }} style={...} />

// ✅ Always use CachedImage
<CachedImage uri={uri} style={...} contentFit="cover" />
```

---

## 7. ScreenHeader (existing — verify usage)

**Location**: `components/ui/ScreenHeader.tsx`

**Spec**:
```typescript
interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;         // default true
  rightAction?: React.ReactNode;  // icon button
  transparent?: boolean;      // blends with content (no bg)
}
```

**Use in**: Most screens with a back button. For sticky-on-scroll variants, use `GlassHeader` from `GlassSurface.tsx`.

---

## 8. AppStatusPill (existing — verify variants)

**Location**: `components/ui/AppStatusPill.tsx`

**Variants** (from 00_OVERALL §10.1):
- `active` (gold) — Live, Active, Published
- `success` (green) — Completed, Delivered
- `warning` (amber) — Pending, Outbid
- `danger` (red) — Failed, Cancelled
- `neutral` (gray) — Draft, Archived

**Spec**:
```typescript
interface AppStatusPillProps {
  label: string;
  variant?: 'active' | 'success' | 'warning' | 'danger' | 'neutral';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;     // optional leading icon
}
```

---

## 9. AppSegmentControl (existing — verify usage)

**Location**: `components/ui/AppSegmentControl.tsx`

**Spec**:
```typescript
interface AppSegmentControlProps {
  segments: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
  variant?: 'solid' | 'glass';   // 'glass' uses GlassCard wrapper
}
```

**Use in**: Inbox tabs (All / Unread / Groups), Filter categories, Settings section picker.

**Glass variant**:
```tsx
<AppSegmentControl
  segments={[
    { label: 'All', value: 'all' },
    { label: 'Unread', value: 'unread' },
    { label: 'Groups', value: 'groups' },
  ]}
  value={filter}
  onChange={setFilter}
  variant="glass"        // wraps the strip in GlassCard
/>
```

---

## 10. SharedTransitionView (existing — verify usage)

**Location**: `components/SharedTransitionView.tsx`

**Use in**: HomeScreen → ItemDetailScreen (product image transition), Profile → Closet item.

```tsx
<SharedTransitionView
  sharedTransitionTag={`item-${item.id}`}
  style={{ width: '100%', aspectRatio: 1 }}
>
  <CachedImage uri={item.imageUrl} style={{ borderRadius: 20 }} />
</SharedTransitionView>
```

---

## 11. AvatarRing (existing — verify usage)

**Location**: `components/chat/AvatarRing.tsx`

**Spec**:
```typescript
interface AvatarRingProps {
  size?: number;             // default 52
  uri?: string;
  isOnline?: boolean;
  isUnread?: boolean;        // adds gold outer glow
  ringColor?: string;        // default Colors.brand
  ringWidth?: number;        // default 2
  fallbackInitials?: string;
}
```

**Sizes**:
- `sm: 36` — inline list row
- `md: 52` — message row, default
- `lg: 72` — profile avatar
- `xl: 100` — profile hero

**Use everywhere** a circular avatar appears. NEVER use raw `CachedImage` with `borderRadius: 999`.

---

## 12. PulseDot (existing — verify usage)

**Location**: `components/chat/PulseDot.tsx`

**Spec**:
```typescript
interface PulseDotProps {
  size?: number;             // default 8
  color?: string;            // default Colors.brand
  pulsing?: boolean;         // default true
}
```

**Use in**: Unread indicators on Inbox message rows, Notification rows, Live auction badges.

```tsx
<PulseDot size={10} color={Colors.brand} />
```

---

## 13. GlowSurface & GlowOrb (existing — verify usage)

**Location**: `components/ui/GlowSurface.tsx`

**Spec**:
```typescript
interface GlowSurfaceProps {
  intensity?: number;        // 0-1, default 0.1
  color?: string;            // default Colors.brand
  borderRadius?: number;
  children: React.ReactNode;
}

interface GlowOrbProps {
  size?: number;             // default 120
  color?: string;            // default Colors.brand
  intensity?: number;
}
```

**GlowSurface use**: Wrap primary CTAs for subtle halo.
```tsx
<GlowSurface intensity={0.15} color={Colors.brand} borderRadius={16}>
  <AppButton variant="primary" size="lg" fullWidth onPress={...}>
    Publish
  </AppButton>
</GlowSurface>
```

**GlowOrb use**: Behind empty state icons, hero decorations.
```tsx
<View style={{ alignItems: 'center', justifyContent: 'center' }}>
  <GlowOrb size={160} color={Colors.brand} intensity={0.12} />
  <Ionicons name="mail-unread-outline" size={48} color={Colors.brand} />
</View>
```

---

## 14. AmbientGradient (existing — verify usage)

**Location**: `components/ui/AmbientGradient.tsx`

**Use in**: AuthLandingScreen background, AuthScreen, any "hero" or empty state that needs atmospheric depth.

```tsx
<View style={{ flex: 1, backgroundColor: Colors.background }}>
  <AmbientGradient
    colors={Gradients.ambient.warm}     // or 'cool'
    intensity={0.4}
  />
  {/* content */}
</View>
```

---

## 15. ProductCardV2 (existing — verify usage)

**Location**: `components/ProductCardV2.tsx`

**Spec**: Pre-styled masonry card with image + bottom gradient overlay + price + title.

**Use in**: HomeScreen grid, BrowseScreen grid, CategoryDetailScreen grid, SearchScreen results.

```tsx
<ProductCardV2
  item={item}
  onPress={() => navigation.navigate('ItemDetail', { id: item.id })}
  sharedTransitionTag={`item-${item.id}`}
/>
```

---

## 16. StaggeredGridEntrance (existing — verify usage)

**Location**: `components/StaggeredGridEntrance.tsx`

**Use in**: Any grid of cards that should animate in on first mount.

```tsx
<StaggeredGridEntrance stagger={45} maxStagger={675}>
  {items.map((item) => (
    <ProductCardV2 key={item.id} item={item} />
  ))}
</StaggeredGridEntrance>
```

---

## 17. DoubleTapHeart (existing — verify usage)

**Location**: `components/DoubleTapHeart.tsx`

**Use in**: ItemDetailScreen, full-bleed product images on HomeScreen, ProductCardV2 overlay.

```tsx
<DoubleTapHeart
  active={isLiked}
  onToggle={() => toggleLike(item.id)}
  // ...image as child
>
  <CachedImage uri={item.imageUrl} style={{ width: '100%', aspectRatio: 1 }} />
</DoubleTapHeart>
```

---

## 18. ChatMessageItem / ChatMessageList (existing — verify)

**Location**: `components/ChatMessageItem.tsx`, `components/ChatMessageList.tsx`

**Verify**:
- [ ] Sent bubbles use `Colors.brand` (gold) — already correct per audit
- [ ] Received bubbles use `GlassCard` (intensity=20, tint=dark) — upgrade from solid `Colors.surface`
- [ ] Composer pill uses `GlassCard` (intensity=25, borderRadius=999) — upgrade
- [ ] Offer/status cards inside chat use `GlassCard` (intensity=30) — upgrade
- [ ] Date pills use translucent glass
- [ ] Selection toolbar uses `GlassBottomBar`

---

## 19. NEW: GlassSearchPill (TO CREATE)

**Path**: `components/ui/GlassSearchPill.tsx`

**Why it doesn't exist yet**: 6+ screens (GlobalSearch, Filter, Discovery, Inbox, Settings search) hand-roll a search input with a solid `Colors.surface` background. Inconsistent.

**Spec**:
```typescript
interface GlassSearchPillProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
  leftIcon?: React.ReactNode;          // default 'search-outline' from Ionicons
  rightIcon?: React.ReactNode;         // optional clear button
  variant?: 'pill' | 'rounded';       // default 'rounded' (borderRadius=16)
  // standard TextInput props
}
```

**Visual**:
```typescript
{
  height: 44,
  borderRadius: 16,                    // 'pill' variant = 999
  backgroundColor: Glass.bgLight,      // rgba(255,255,255,0.04)
  borderWidth: 0.5,
  borderColor: Glass.border,
  paddingHorizontal: 16,
  // Focused:
  //   borderColor: Glass.borderFocus,
  //   shadowColor: Glow.brand,
  //   shadowOpacity: 0.2,
  //   shadowRadius: 8,
}
```

**Internal structure**:
```tsx
<GlassCard intensity={20} tint="dark" borderRadius={16} style={...focusedStyle}>
  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 44 }}>
    {leftIcon}
    <TextInput
      style={{ flex: 1, ...Type.body, color: Colors.textPrimary, marginLeft: 8 }}
      placeholder={placeholder}
      placeholderTextColor={Colors.textMuted}
      value={value}
      onChangeText={onChangeText}
      onFocus={onFocus}
      onBlur={onBlur}
      onSubmitEditing={onSubmit}
    />
    {rightIcon}
  </View>
</GlassCard>
```

**Usage**:
```tsx
<GlassSearchPill
  placeholder="Search ThryftVerse"
  value={query}
  onChangeText={setQuery}
  onSubmit={handleSearch}
/>
```

**Acceptance criteria**:
- [ ] Used in: `InboxScreen`, `SettingsScreen`, `GlobalSearchScreen`, `FilterScreen`, `EditProfileScreen`
- [ ] Each consumer shows glassmorphism focus state on press
- [ ] Haptic `light` on focus
- [ ] Component file passes typecheck

---

## 20. NEW: PremiumToggle (TO CREATE)

**Path**: `components/ui/PremiumToggle.tsx`

**Why it doesn't exist**: Native `<Switch>` is functional but doesn't match the premium aesthetic. We need an animated, gold-track toggle with proper spring physics and haptic feedback.

**Spec**:
```typescript
interface PremiumToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';                 // default 'md'
  trackActiveColor?: string;          // default Colors.brand
  trackInactiveColor?: string;        // default Glass.border
  // No thumb color prop — always white for premium look
}
```

**Visual** (size 'md'):
```
[OFF]  ●━━━━━━━━━━━━━━  gray track, white thumb left
       44×26 total

[ON]   ━━━━━━━━━━━━●    gold track, white thumb right
       44×26 total
```

**Animation spec**:
- Thumb translateX: spring(Spring.press) — damping 20, stiffness 300
- Track color: interpolate between inactive and active over 200ms
- Haptic `light` on toggle
- Disabled: 50% opacity, no animation

**Implementation** (sketch):
```tsx
import Animated, { useSharedValue, useAnimatedStyle, withSpring, interpolateColor } from 'react-native-reanimated';
import { triggerHaptic } from '../utils/haptics';

export const PremiumToggle = ({ value, onValueChange, size = 'md', disabled }) => {
  const progress = useSharedValue(value ? 1 : 0);
  
  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, { damping: 20, stiffness: 300 });
  }, [value]);
  
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [Colors.border, Colors.brand]
    ),
  }));
  
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * (size === 'md' ? 18 : 14) }],
  }));
  
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        triggerHaptic('light');
        onValueChange(!value);
      }}
      hitSlop={12}
    >
      <Animated.View style={[
        { width: 44, height: 26, borderRadius: 13, padding: 3 },
        trackStyle,
      ]}>
        <Animated.View style={[
          { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFF' },
          thumbStyle,
        ]} />
      </Animated.View>
    </Pressable>
  );
};
```

**Acceptance criteria**:
- [ ] Used in: `PushNotificationsScreen`, `PostageScreen`, `SettingsScreen` (via `SettingsCell` toggle variant), `AccountSettingsScreen`, `NotificationsScreen`
- [ ] All existing `<Switch>` components replaced
- [ ] Drop-in API: same `value` / `onValueChange` props as `<Switch>`
- [ ] Haptic on toggle
- [ ] Respects `useReducedMotion()` — instant jump instead of spring if reduced
- [ ] Component passes typecheck

---

## 21. Component Cross-Reference

Quick lookup of "which component do I use for X?":

| Need | Component |
|---|---|
| Translucent card | `GlassCard` |
| Sticky header with blur | `GlassHeader` |
| Floating bottom bar | `GlassBottomBar` |
| Gold halo behind CTA | `GlowSurface` |
| Halo behind empty state icon | `GlowOrb` |
| Animated gradient background | `AmbientGradient` |
| Gold primary button | `AppButton variant="primary"` |
| Glass secondary button | `AppButton variant="secondary"` |
| Text link button | `AppButton variant="ghost"` |
| Destructive outline | `AppButton variant="destructive"` |
| Form input (default) | `AppInput variant="solid"` |
| Form input (premium form) | `AppInput variant="glass"` |
| Tabs / segmented control | `AppSegmentControl variant="glass"` |
| Status badge | `AppStatusPill` |
| Back-button header | `ScreenHeader` |
| Interactive element (any) | `AnimatedPressable` |
| Loading placeholder | `SkeletonLoader` |
| Image | `CachedImage` |
| Hero image with shared transition | `SharedTransitionView` + `CachedImage` |
| Circular avatar with ring | `AvatarRing` |
| Animated unread dot | `PulseDot` |
| Floating search bar | `GlassSearchPill` (NEW) |
| Gold animated toggle | `PremiumToggle` (NEW) |
| Like animation | `DoubleTapHeart` |
| Product masonry card | `ProductCardV2` |
| Grid with entrance animation | `StaggeredGridEntrance` |
| Chat message | `ChatMessageItem` |
| Chat thread | `ChatMessageList` |

---

## 22. Adoption Audit (run after refactor)

```bash
# Find any remaining bare Pressable
grep -rn "<Pressable" frontend/src/ --include="*.tsx" | grep -v "AnimatedPressable"

# Find any remaining bare Image
grep -rn "<Image " frontend/src/ --include="*.tsx" | grep -v "CachedImage"

# Find any remaining bare Switch
grep -rn "<Switch" frontend/src/ --include="*.tsx"

# Find any remaining bare TextInput (with surrounding custom wrapper, not AppInput)
grep -rn "<TextInput" frontend/src/ --include="*.tsx" | grep -v "AppInput"

# Find any remaining bare ActivityIndicator
grep -rn "<ActivityIndicator" frontend/src/ --include="*.tsx"

# Find any remaining AppCard variant="surface" or variant="elevated" (should be GlassCard)
grep -rn 'AppCard variant="surface"\|AppCard variant="elevated"' frontend/src/ --include="*.tsx"
```

**Expected results after full refactor**:
- `<Pressable` (bare) → 0
- `<Image` (bare) → 0
- `<Switch` (native) → 0 (all replaced by `PremiumToggle`)
- `<TextInput` (bare) → 0 (all wrapped in `AppInput` or `GlassSearchPill`)
- `<ActivityIndicator` → 0 (use `AppButton loading` or `Spinner` component)
- `AppCard variant="surface"` → 0 in elevated screens (all swapped to `GlassCard`)

---

## 23. Component Quality Checklist

For every component file:

- [ ] Full TypeScript interface (no `any`)
- [ ] Uses tokens from `constants/colors.ts` and `theme/designTokens.ts`
- [ ] No hardcoded hex/rgba
- [ ] `accessibilityRole` and `accessibilityLabel` on interactive
- [ ] `AnimatedPressable` for press interactions
- [ ] Haptic feedback where appropriate
- [ ] Respects `useReducedMotion()`
- [ ] Documented with JSDoc comment
- [ ] Default export OR named export (consistent)
- [ ] No inline `IS_LIGHT` logic
- [ ] Passes typecheck

---

**Next**: Read `03_AUTH_AND_ONBOARDING.md` for the per-section playbook, then 04-14, then `EXECUTION_TRACKER.md` and `VISUAL_AUDIT.md`.
 