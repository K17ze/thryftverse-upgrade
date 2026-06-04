# 01 — Foundation Tokens (Code-Ready)

> **Exact values to paste into `constants/colors.ts`, `theme/designTokens.ts`, `theme/gradients.ts`**
> These tokens are referenced by every per-section .md in this folder
> Read this AFTER `00_OVERALL_AND_FOUNDATION.md`

---

## 1. File-by-File Token Updates

This section provides **copy-paste-ready** TypeScript for each token file. Apply all changes before touching any screen.

---

### 1.1 `constants/colors.ts` — Add Glass & Glow palettes

**Action**: Add the following to the existing `Colors` object (do not remove existing keys).

```typescript
// constants/colors.ts — add these to the existing Colors object
export const Colors = {
  // === EXISTING — KEEP AS-IS ===
  background: '#0A0A0A',
  surface: '#121212',
  surfaceAlt: '#1A1A1A',
  brand: '#D4AF37',
  textPrimary: '#FFFFFF',
  textSecondary: '#B0B0B0',
  textMuted: '#6E6E6E',
  border: 'rgba(255,255,255,0.06)',
  borderLight: 'rgba(255,255,255,0.10)',
  danger: '#FF4D4D',
  success: '#4CAF50',

  // === NEW — ADD THESE ===
  brandDeep: '#C8A545',                    // gradient companion, pressed gold
  brandSubtle: 'rgba(212,175,55,0.12)',    // 12% gold tint for backgrounds
  borderFocus: 'rgba(212,175,55,0.30)',    // gold focus ring on inputs

  // === LIGHT THEME — ADD THESE ===
  backgroundL: '#F5F5F0',
  surfaceL: '#FFFFFF',
  surfaceAltL: '#FAFAF5',
  textPrimaryL: '#1A1A1A',
  textSecondaryL: '#555555',
  textMutedL: '#999999',
  borderL: 'rgba(0,0,0,0.06)',
};

// === GLASS SURFACE TOKENS — NEW EXPORT ===
export const Glass = {
  bg: 'rgba(255,255,255,0.025)',            // standard glass card
  bgLight: 'rgba(255,255,255,0.04)',         // search bar, focus state
  bgStrong: 'rgba(255,255,255,0.06)',        // pressed/hover
  bgL: 'rgba(0,0,0,0.03)',                   // light theme glass
  border: 'rgba(255,255,255,0.06)',          // hairline border
  borderLight: 'rgba(255,255,255,0.10)',     // active/hover
  borderL: 'rgba(0,0,0,0.08)',               // light theme
  borderFocus: 'rgba(212,175,55,0.30)',      // gold focus
  shadow: 'rgba(0,0,0,0.15)',                // card shadow
};

// === GLOW HALO TOKENS — NEW EXPORT ===
export const Glow = {
  brand: 'rgba(212,175,55,0.15)',            // halo around active elements
  brandStrong: 'rgba(212,175,55,0.35)',      // avatar unread glow
  danger: 'rgba(255,77,77,0.20)',            // error field glow
  success: 'rgba(76,176,80,0.15)',           // success halo
};

// === ICON TINTS — NEW EXPORT ===
export const IconTint = {
  brand: '#D4AF37',        // premium, verified
  blue: '#4A9EFF',         // communication, inbox
  red: '#FF6B6B',          // destructive, danger
  green: '#50C878',        // success, money
  purple: '#B266FF',       // special, syndicate
  amber: '#FFA500',        // warnings, auctions
  // Helper: usage `${IconTint.brand}20` for 12% bg opacity
};
```

**Verification**: Open the file and confirm the new keys exist.

---

### 1.2 `theme/designTokens.ts` — Update Typography, Elevation, Radius, Space

**Action**: Update the existing tokens to match the spec from `00_OVERALL_AND_FOUNDATION.md`.

```typescript
// theme/designTokens.ts — replace existing values

import { Platform } from 'react-native';
import { Colors, Glass } from '../constants/colors';

export const Typography = {
  family: {
    regular: Platform.select({ ios: 'Inter_400Regular', android: 'Inter_400Regular' }),
    medium: Platform.select({ ios: 'Inter_500Medium', android: 'Inter_500Medium' }),
    semibold: Platform.select({ ios: 'Inter_600SemiBold', android: 'Inter_600SemiBold' }),
    bold: Platform.select({ ios: 'Inter_700Bold', android: 'Inter_700Bold' }),
  },
};

export const Type = {
  display: {
    fontSize: 32,
    fontWeight: '700' as const,
    lineHeight: 38,
    letterSpacing: -0.5,
    fontFamily: Typography.family.bold,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    lineHeight: 30,
    letterSpacing: -0.3,
    fontFamily: Typography.family.bold,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    lineHeight: 22,
    letterSpacing: -0.2,
    fontFamily: Typography.family.semibold,
  },
  body: {
    fontSize: 15,            // ⚠️ CHANGED from 14 → 15
    fontWeight: '500' as const,
    lineHeight: 21,
    letterSpacing: 0,
    fontFamily: Typography.family.medium,
  },
  bodyEmphasis: {
    fontSize: 15,
    fontWeight: '600' as const,
    lineHeight: 21,
    letterSpacing: 0,
    fontFamily: Typography.family.semibold,
  },
  price: {
    fontSize: 20,            // ⚠️ CHANGED from 14 → 20
    fontWeight: '700' as const,
    lineHeight: 24,
    letterSpacing: -0.3,
    fontFamily: Typography.family.bold,
  },
  priceLarge: {
    fontSize: 28,
    fontWeight: '700' as const,
    lineHeight: 32,
    letterSpacing: -0.5,
    fontFamily: Typography.family.bold,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 18,
    letterSpacing: 0.1,
    fontFamily: Typography.family.regular,
  },
  meta: {
    fontSize: 11,
    fontWeight: '600' as const,
    lineHeight: 14,
    letterSpacing: 0.5,
    fontFamily: Typography.family.semibold,
  },
};

export const Space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
};

export const Elevation = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 4,
  },
  floating: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.20,
    shadowRadius: 32,
    elevation: 8,
  },
  glow: {                                    // ⚠️ NEW — add this
    shadowColor: Colors.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 0,                           // glow is color-based, not height
  },
};
```

**Verification**: Grep the codebase for `fontSize: 14` — any hits should be replaced with `Type.body`.

---

### 1.3 `theme/gradients.ts` — Add Gradient Tokens (NEW FILE)

**Action**: Create this file if it doesn't exist.

```typescript
// theme/gradients.ts — NEW FILE

import { Colors } from '../constants/colors';

/**
 * Gradient definitions for use with expo-linear-gradient.
 * Format: [start, end] for simple 2-stop, or [start, mid, end] for 3-stop.
 */
export const Gradients = {
  gold: {
    diagonal: [Colors.brandDeep, Colors.brand] as [string, string],    // 135deg look
    horizontal: [Colors.brandDeep, Colors.brand] as [string, string],   // 90deg look
    vertical: [Colors.brand, Colors.brandDeep] as [string, string],     // 180deg look
  },
  dark: {
    vertical: ['#0A0A0A', '#121212'] as [string, string],
    radial: ['#1A1A1A', '#0A0A0A'] as [string, string],
  },
  overlay: {
    bottom: ['transparent', 'rgba(0,0,0,0.6)'] as [string, string],     // image overlay
    bottomStrong: ['transparent', 'rgba(0,0,0,0.85)'] as [string, string],
    top: ['rgba(0,0,0,0.4)', 'transparent'] as [string, string],        // header fade
  },
  ambient: {
    // For AmbientGradient component (mesh-like layered gradient)
    warm: ['#1A0F00', '#0A0A0A', '#000814'] as [string, string, string],
    cool: ['#000814', '#0A0A0A', '#0F0A1A'] as [string, string, string],
  },
};
```

**Usage**:
```tsx
import { LinearGradient } from 'expo-linear-gradient';
import { Gradients } from '../theme/gradients';

<LinearGradient
  colors={Gradients.gold.diagonal}
  start={{ x: 0, y: 0 }}
  end={{ x: 1, y: 1 }}
  style={{ ... }}
>
  {/* CTA content */}
</LinearGradient>
```

---

### 1.4 `constants/motion.ts` — Verify Spring Configs

**Action**: Ensure these match the spec. Update if missing.

```typescript
// constants/motion.ts — add if missing

export const Spring = {
  gentle: { damping: 20, stiffness: 180, mass: 1 },
  press: { damping: 15, stiffness: 350, mass: 0.5 },
  iconPress: { damping: 12, stiffness: 300, mass: 0.3 },
  modal: { damping: 22, stiffness: 220, mass: 1 },
  bouncy: { damping: 12, stiffness: 250, mass: 0.8 },
};

export const Duration = {
  fast: 150,
  normal: 250,
  slow: 400,
};

export const Stagger = {
  listItem: 45,           // ms between list items
  listItemMax: 15,        // max items to stagger
  cardEntrance: 100,      // ms delay for first card
  modalEntrance: 100,     // ms delay for modal
};
```

---

## 2. Token Audit Commands (run these to find drift)

After applying tokens, run these to catch any leftover hardcoded values:

```bash
# 1. Raw fontSize values
grep -rn "fontSize: 1[0-9]" frontend/src/ --include="*.tsx" --include="*.ts"

# 2. Raw fontFamily values
grep -rn "fontFamily: ['\"]" frontend/src/ --include="*.tsx" --include="*.ts"

# 3. Raw rgba glass colors (should all be in Glass/Colors tokens now)
grep -rn "rgba(255,255,255," frontend/src/ --include="*.tsx" --include="*.ts"

# 4. Raw #0A0A0A or #121212
grep -rn "#0A0A0A\|#121212" frontend/src/ --include="*.tsx" --include="*.ts"

# 5. IS_LIGHT color logic
grep -rn "IS_LIGHT" frontend/src/ --include="*.tsx" --include="*.ts"
```

**Expected results**:
- Raw `fontSize: 1X` → 0 hits (or only on icon button sizes, which is fine)
- Raw `fontFamily` → 0 hits outside `theme/`
- Raw rgba → 0 hits outside `theme/` and `constants/`
- Raw `#0A0A0A` etc. → 0 hits outside `constants/colors.ts`
- `IS_LIGHT` → 0 hits (use `Colors` tokens directly, theme-aware)

---

## 3. Token Usage Cheatsheet

### 3.1 Spacing
```tsx
import { Space } from '../theme/designTokens';

<View style={{ padding: Space.md, marginBottom: Space.lg }}>
```

### 3.2 Radius
```tsx
import { Radius } from '../theme/designTokens';

<View style={{ borderRadius: Radius.xl }}>
```

### 3.3 Typography
```tsx
import { Type } from '../theme/designTokens';

<Text style={{ ...Type.subtitle, color: Colors.textPrimary }}>
  Hello
</Text>
```

### 3.4 Elevation
```tsx
import { Elevation } from '../theme/designTokens';

<View style={{ ...Elevation.card }}>
  {/* card with proper iOS + Android shadow */}
</View>

<View style={{ ...Elevation.glow }}>
  {/* CTA with gold glow */}
</View>
```

### 3.5 Color (dark theme default)
```tsx
import { Colors } from '../constants/colors';

<Text style={{ color: Colors.textPrimary }}>White text</Text>
<View style={{ backgroundColor: Colors.surface }}>Card</View>
```

### 3.6 Glass
```tsx
import { Glass } from '../constants/colors';

<View style={{ backgroundColor: Glass.bg, borderColor: Glass.border }}>
  {/* translucent card */}
</View>
```

### 3.7 Glow
```tsx
import { Glow } from '../constants/colors';

<View style={{ shadowColor: Glow.brand }}>  // for elevation glow
```

### 3.8 Icon tint helper
```tsx
import { IconTint } from '../constants/colors';

<View style={{ backgroundColor: `${IconTint.brand}20` }}>
  {/* 12% opacity brand-tinted bg */}
</View>
```

---

## 4. Token Migration Patterns (recipes for common refactors)

### 4.1: AppCard variant="surface" → GlassCard

```tsx
// ❌ Before
import { AppCard } from '../components/ui/AppCard';

<AppCard variant="surface" style={{ padding: 16, borderRadius: 20 }}>
  {content}
</AppCard>

// ✅ After
import { GlassCard } from '../components/ui/GlassSurface';

<GlassCard intensity={25} tint="dark" borderRadius={20}>
  <View style={{ padding: 16 }}>{content}</View>
</GlassCard>
```

### 4.2: Raw color → token

```tsx
// ❌ Before
<View style={{ backgroundColor: '#1A1A1A' }}>
<Text style={{ color: 'rgba(255,255,255,0.7)' }}>

// ✅ After
<View style={{ backgroundColor: Colors.surfaceAlt }}>
<Text style={{ color: Colors.textSecondary }}>
```

### 4.3: Raw fontSize → Type token

```tsx
// ❌ Before
<Text style={{ fontSize: 14, fontWeight: '500' }}>Body</Text>
<Text style={{ fontSize: 24, fontWeight: '700' }}>Title</Text>
<Text style={{ fontSize: 11, fontWeight: '600', textTransform: 'uppercase' }}>LABEL</Text>

// ✅ After
<Text style={Type.body}>Body</Text>
<Text style={Type.title}>Title</Text>
<Text style={{ ...Type.meta, textTransform: 'uppercase' }}>LABEL</Text>
```

### 4.4: Solid icon button → glass icon button

```tsx
// ❌ Before
<AnimatedPressable style={{ backgroundColor: Colors.surface, width: 40, height: 40, borderRadius: 20 }}>
  <Icon name="close" />
</AnimatedPressable>

// ✅ After
<AnimatedPressable style={{
  backgroundColor: 'rgba(255,255,255,0.05)',
  borderWidth: 0.5, borderColor: Glass.border,
  width: 40, height: 40, borderRadius: 20,
}}>
  <Icon name="close" />
</AnimatedPressable>
```

### 4.5: Native Switch → PremiumToggle

```tsx
// ❌ Before
<Switch
  value={enabled}
  onValueChange={setEnabled}
  trackColor={{ true: Colors.brand, false: Colors.border }}
/>

// ✅ After
<PremiumToggle value={enabled} onValueChange={setEnabled} />
```

(Same API surface — drop-in replacement.)

### 4.6: Plain avatar → AvatarRing

```tsx
// ❌ Before
<CachedImage uri={avatarUrl} style={{ width: 52, height: 52, borderRadius: 26 }} />

// ✅ After
<AvatarRing size={52} uri={avatarUrl} isOnline={true} isUnread={false} />
```

### 4.7: Raw input → AppInput glass

```tsx
// ❌ Before
<View style={{ backgroundColor: Colors.surface, borderRadius: 12, padding: 14 }}>
  <TextInput placeholder="Email" placeholderTextColor={Colors.textMuted} />
</View>

// ✅ After
<AppInput variant="glass" placeholder="Email" value={email} onChangeText={setEmail} />
```

### 4.8: Search bar → GlassSearchPill

```tsx
// ❌ Before
<View style={{ backgroundColor: Colors.surface, borderRadius: 999, height: 44, paddingHorizontal: 16 }}>
  <TextInput placeholder="Search..." />
</View>

// ✅ After
<GlassSearchPill placeholder="Search..." value={query} onChangeText={setQuery} />
```

---

## 5. Light Mode Considerations

The codebase already has `theme/themePreference.ts` (or similar) for light/dark switching. The new tokens are **theme-aware by default**:

- `Colors.background` → `#0A0A0A` (dark default)
- `Colors.backgroundL` → `#F5F5F0` (light alternative)
- The `Colors` object is intended to be **re-bound per theme** by the theme provider

**Recommended pattern** (if not already implemented):

```typescript
// theme/useActiveColors.ts — auto-resolves based on theme
import { useThemePreference } from './themePreference';
import { Colors as DarkColors } from '../constants/colors';

export const useActiveColors = () => {
  const { isLight } = useThemePreference();
  return isLight
    ? { ...DarkColors, background: DarkColors.backgroundL, /* etc */ }
    : DarkColors;
};
```

**If light mode is out of scope**: skip this section. Just use the dark tokens directly.

---

## 6. Acceptance Criteria (Token Layer)

Before moving to per-section work, confirm:

- [ ] `constants/colors.ts` has all new keys: `brandDeep`, `brandSubtle`, `borderFocus`, `backgroundL` (etc), `Glass.*`, `Glow.*`, `IconTint.*`
- [ ] `theme/designTokens.ts` has updated `Type` (with 15px body, 20px price, 28px priceLarge, 32px display)
- [ ] `theme/designTokens.ts` has `Elevation.glow`
- [ ] `theme/gradients.ts` exists with `Gradients.gold`, `Gradients.overlay`, `Gradients.ambient`
- [ ] `constants/motion.ts` has `Spring`, `Duration`, `Stagger` exports
- [ ] Grep for `fontSize: 14` returns 0 hits in screens
- [ ] Grep for `fontFamily:` outside `theme/` returns 0 hits
- [ ] Grep for `IS_LIGHT` returns 0 hits
- [ ] Grep for hardcoded `#0A0A0A` outside `constants/` returns 0 hits
- [ ] `npm run typecheck` passes

---

## 7. Quick Reference Card (print or pin)

```
COLORS
  bg #0A0A0A       surface #121212     surfaceAlt #1A1A1A
  brand #D4AF37    textPrimary #FFF    textSecondary #B0B0B0
  textMuted #6E6E6E   border rgba(255,255,255,0.06)

GLASS (use these instead of solid surfaces)
  Glass.bg rgba(255,255,255,0.025)        Glass.border rgba(255,255,255,0.06)
  Glass.bgLight rgba(255,255,255,0.04)   Glass.bgStrong rgba(255,255,255,0.06)

GLOW (for CTAs and active states)
  Glow.brand rgba(212,175,55,0.15)        Glow.brandStrong rgba(212,175,55,0.35)

TYPE
  display 32/700/-0.5    title 24/700/-0.3    subtitle 17/600/-0.2
  body 15/500/0          price 20/700/-0.3    priceLarge 28/700/-0.5
  caption 13/400/0.1     meta 11/600/0.5

SPACE     xs 4  sm 8  md 16  lg 24  xl 32  xxl 48
RADIUS    sm 8  md 12  lg 16  xl 20  xxl 24  full 999
ELEVATION none / subtle / card / floating / glow

SPRINGS
  gentle (20, 180, 1)   press (15, 350, 0.5)   iconPress (12, 300, 0.3)
  modal (22, 220, 1)    bouncy (12, 250, 0.8)
```

---

**Next**: Read `02_SHARED_COMPONENTS.md` for the spec of every reusable component (`GlassCard`, `GlowSurface`, `AppButton`, `AvatarRing`, `PremiumToggle`, `GlassSearchPill`, `AppInput glass`, etc.).
