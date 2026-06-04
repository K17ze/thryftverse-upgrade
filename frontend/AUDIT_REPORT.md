# Thryftverse UI/UX Audit Report

## Executive Summary

The codebase contains **multiple competing design systems** that have evolved through incremental redesigns without deprecation of previous systems. This audit identifies the root causes of visual inconsistency, functional regression, and "AI-generated" feeling in settings subpages.

---

## 1. CRITICAL: Two Competing Typography Systems

### System A: `theme/designTokens.ts`
```ts
Type.display   = 32/38/700  (-0.5)
Type.title     = 24/30/700  (-0.3)
Type.subtitle  = 17/22/600  (-0.2)
Type.body      = 15/21/500  (0)
Type.price     = 20/24/700  (-0.3)
Type.caption   = 13/18/400  (0.1)
Type.meta      = 11/14/600  (0.5)
```

### System B: `constants/typography.ts`
```ts
TypeStyles.display = 40/46/extrabold (-0.42)
TypeStyles.heading = 30/36/bold       (-0.42)
TypeStyles.title   = 21/28/semibold   (0)
TypeStyles.body    = 15/22/regular    (0)
TypeStyles.caption = 12/18/light      (0.12)
```

### Impact
- Screens import both and mix them arbitrarily
- `SettingsHeader` uses `Type.subtitle.size` (17px) for titles
- `AccountSettingsScreen` uses `Type.meta.size` (11px) for section headers
- `HomeScreen` imports `Typography` from BOTH files
- No single source of truth for any text style

### Fix Required
- **Deprecate and remove** `constants/typography.ts`
- **Expand** `theme/designTokens.ts` `Type` scale to cover all needs
- Update all imports to use only `theme/designTokens.ts`

---

## 2. CRITICAL: Glassmorphism Still Active (Despite "Removal")

### `theme/gradients.ts` exports translucent tokens
```ts
export const Glass = {
  bg:        'rgba(255,255,255,0.025)',  // <-- STILL TRANSLUCENT
  border:    'rgba(255,255,255,0.06)',   // <-- STILL TRANSLUCENT
  bgLight:   'rgba(0,0,0,0.03)',        // <-- STILL TRANSLUCENT
  borderLight:'rgba(0,0,0,0.08)',       // <-- STILL TRANSLUCENT
};
```

### `components/ui/AppInput.tsx` imports from gradients
```ts
import { Glass, Glow } from '../../theme/gradients';
```
The `variant="glass"` mode uses these translucent tokens directly.

### `components/ui/GlassSurface.tsx` still exists
- Uses `expo-blur` `BlurView`
- Imported by **35 files** across the app
- `GlassCard`, `GlassHeader`, `GlassBottomBar` all still exported

### Impact
- `AppInput variant="glass"` renders translucent backgrounds
- 35 screens still use blur-based cards
- The "solid surface" redesign only touched a few files; the rest of the app is still frosted glass

### Fix Required
- **Delete** `theme/gradients.ts` entirely
- **Delete** `components/ui/GlassSurface.tsx` entirely
- **Remove** `AppInput` glass variant
- Replace all `GlassCard` usage with standard `View` + `Colors.surface`
- Replace all `BlurView` usage with solid `Colors.surface`

---

## 3. CRITICAL: Hardcoded Background Colors (Theme-Breaking)

The following screens hardcode `backgroundColor: '#0A0A0A'` (dark only):

| Screen | Line |
|--------|------|
| AccountSettingsScreen.tsx | `backgroundColor: '#0A0A0A'` |
| ChangePasswordScreen.tsx | `backgroundColor: '#0A0A0A'` |
| EditProfileScreen.tsx | `backgroundColor: '#0A0A0A'` |
| HelpSupportScreen.tsx | `backgroundColor: '#0A0A0A'` |
| ReportScreen.tsx | `backgroundColor: '#0A0A0A'` |
| TwoFactorSetupScreen.tsx | `backgroundColor: '#0A0A0A'` |

### Impact
- These screens are **completely broken in light mode**
- Text becomes invisible or unreadable
- The app feels like it ignores system theme settings

### Fix Required
- Replace all with `Colors.background`

---

## 4. CRITICAL: `Glass` Static Tokens Are Not Theme-Adaptive

`constants/colors.ts` exports:
```ts
export const Glass = {
  bg: '#141414',       // Always dark
  bgLight: '#1F1F1F',  // Always dark
  bgL: '#FAFAF5',      // Always light
  border: 'rgba(255,255,255,0.10)', // Always assumes dark
};
```

These tokens do NOT switch with theme. `Glass.bg` is always `#141414` even in light mode.

### Fix Required
- Remove the `Glass` export entirely
- Replace all usages with `Colors.surface` / `Colors.surfaceAlt`

---

## 5. ELEVATION SYSTEM: Conflicting Shadow Definitions

`Elevation` in `designTokens.ts`:
```ts
Elevation.none    = transparent
Elevation.subtle  = { shadowOpacity: 0.06, shadowRadius: 8 }
Elevation.card    = { shadowOpacity: 0.15, shadowRadius: 20 }
Elevation.floating= { shadowOpacity: 0.12, shadowRadius: 16 }
Elevation.modal   = { shadowOpacity: 0.18, shadowRadius: 24 }
Elevation.glow    = brand halo
// PLUS legacy aliases:
Elevation.sm = { shadowOpacity: 0.08, shadowRadius: 2 }
Elevation.md = { shadowOpacity: 0.12, shadowRadius: 4 }
```

`CommonStyles.card` uses `Elevation.sm` (legacy alias).
Some components use `Elevation.subtle`, others use `Elevation.sm`.
Settings redesign explicitly removed all elevation.
HomeScreen uses `Elevation.subtle` inline.

### Fix Required
- Remove legacy aliases (`sm`, `md`, `lg`, `xl`)
- Standardize on: `none`, `subtle`, `card`, `floating`, `modal`
- Audit all `...Elevation.xxx` spread usage

---

## 6. CARD SYSTEM: Five Competing Implementations

| System | Source | Radius | Border | Shadow | Used In |
|--------|--------|--------|--------|--------|---------|
| GlassCard | GlassSurface.tsx | `Radius.lg` | `Colors.glassBorder` | BlurView | 35 files |
| SettingsGroup | SettingsCell.tsx | `Radius.lg` | hairline `Colors.border` | None | Settings |
| CommonStyles.card | designTokens.ts | `Radius.lg` | None | `Elevation.sm` | Misc |
| Inline card (solid) | ChatScreen styles | `Radius.lg` | hairline `Colors.border` | None | Chat |
| Inline custom | Various screens | Mixed | Mixed | Mixed | 50+ files |

### Fix Required
- Create ONE `Card` primitive component
- Single configuration: `Colors.surface`, `Radius.lg`, hairline `Colors.border`, **no shadow**
- Remove `GlassCard`
- Replace `CommonStyles.card` shadow with none

---

## 7. ICON SYSTEM: No Semantic Color Mapping

`IconTint` in `colors.ts`:
```ts
brand: '#D4AF37', blue: '#4A9EFF', red: '#FF6B6B',
green: '#50C878', purple: '#B266FF', amber: '#FFA500'
```

Most screens ignore this and use:
- `Colors.brand` for everything
- Random hex strings inline (`#1877F2` for Facebook, `#EA4335` for Google)
- `Colors.textMuted` for inactive
- `Colors.success` for positive

No system for: navigation, commerce, social, destructive, informational.

### Fix Required
- Remove `IconTint` (unused)
- Standardize: `Colors.brand`, `Colors.success`, `Colors.danger`, `Colors.textSecondary`, `Colors.textMuted`
- No random hex colors

---

## 8. NAVIGATION HEADERS: Four Different Patterns

| Pattern | Used In | Title Size | Back Button |
|---------|---------|------------|-------------|
| SettingsHeader | Settings subpages | 17px (`Type.subtitle`) | 40x40 glassBg |
| Inline custom | SettingsScreen | 32px (`Type.display`) | 44x44 solid |
| GlassHeader | (was used in Inbox) | N/A | glass surface |
| Custom inline | ChatScreen | N/A | 44x44 solid |
| Floating + BlurView | HomeScreen | Animated | Hidden/animated |

### Fix Required
- Single `ScreenHeader` component for all push screens
- Two variants: `large` (display title) for root settings, `inline` (subtitle size) for subpages
- Consistent back button: 40x40, `Colors.surfaceAlt`, no border

---

## 9. SETTINGS SUBPAGES: AI-Generated Feel

### AccountSettingsScreen
- Uses `GlassCard` for EVERY section (deprecated)
- `AppButton` footer actions are overstyled with custom icon wraps
- Section title uses `Type.meta` (11px uppercase) — too small
- Uses `AppInput variant="glass"` (deprecated)
- Modal uses `GlassCard` (deprecated)
- `Typography` imported from `constants/typography` (competing system)

### EditProfileScreen
- Hardcoded `#0A0A0A` background
- Uses `GlassCard` for form
- `AppInput variant="glass"` for some fields, no variant for others
- Cover/avatar camera circles use `rgba(0,0,0,0.5)` — not theme-adaptive
- `KeyboardAvoidingView` wrapping — may have scroll issues

### ChangePasswordScreen
- Hardcoded `#0A0A0A` background
- Uses `GlassCard` for form
- `AppInput variant="glass"` for all inputs
- Missing `keyboardShouldPersistTaps="handled"` on ScrollView
- No scroll padding for bottom button

### All Settings Subpages
- Inconsistent spacing between inputs (some `Space.sm`, some `Space.md`)
- Save buttons have varying radii (`Radius.xl`, `Radius.md`)
- No unified form container pattern
- Each screen invents its own section title style

---

## 10. CHAT FUNCTIONAL REGRESSIONS

From the previous redesign:
- `GlassCard` tags were replaced with `View` tags but **closing tags were not consistently updated**
- `GlassSurface` tags replaced with `View` but props like `intensity`, `tint`, `contentStyle` remain on `View` elements
- `GlassBottomBar` replaced with `View` but `contentStyle` prop remains
- `composerWrap` background uses `Colors.surface` now but the composer area may not extend properly
- `ChatHeader` lost `BlurView` but the header height and safe area may be off

### Functional Issues
- Keyboard avoiding may fail because `KeyboardAvoidingView` in `ChatScreen` and `ComposerInput` are nested
- Scroll to bottom FAB may be hidden by composer
- Message selection toolbar (replacing `GlassBottomBar`) lacks proper height and safe area

---

## 11. HOME SCREEN: DEEPLY EMBEDDED GLASSMORPHISM

- `BlurView` imported and used for floating header + peek modal
- `PANEL_BG = Colors.glassBg` used throughout
- Multiple `Colors.glassBorder` references for tiles, cards, buttons
- `IS_LIGHT = ActiveTheme === 'light'` computed at module level — doesn't update if theme changes at runtime
- Uses `LinearGradient` for ambient backgrounds

---

## 12. COMPONENT API INCONSISTENCY

### `AppButton`
- 5 variants: primary, secondary, gold, contrast, danger
- `gold` and `primary` are identical (both use `Colors.brand`)
- `secondary` uses `transparent` background + `Colors.glassBorder` border
- Size radii: sm=14, md=18, lg=24 — but `Radius.md=12`, `Radius.lg=16`
- `subtitle` prop creates multi-line buttons which are not standard iOS/Android patterns

### `AppInput`
- `variant="glass"` mode uses `theme/gradients.ts` `Glass` tokens
- `variant="solid"` uses `Colors.surface` — but called "solid" when it should be the only option
- Label style: hardcoded `Inter_700Bold`, 12px, uppercase — conflicts with `Type.meta`
- Error style uses `Glow.danger` shadow — adds a glow effect that is not in the design system

---

## Recommended Fix Order

1. **Foundation**: Remove `constants/typography.ts`, consolidate into `designTokens.ts`
2. **Foundation**: Delete `theme/gradients.ts`, remove `Glass` export from `colors.ts`
3. **Foundation**: Remove legacy `Elevation` aliases, fix `CommonStyles.card`
4. **Components**: Remove `AppInput` glass variant, fix label/error styles
5. **Components**: Simplify `AppButton` (remove gold/contrast, fix secondary)
6. **Components**: Create unified `ScreenHeader`, delete `SettingsHeader` and `GlassHeader`
7. **Components**: Delete `GlassSurface.tsx` entirely
8. **Screens**: Fix all 6 hardcoded backgrounds
9. **Screens**: Fix all settings subpages (remove GlassCard, standardize forms)
10. **Screens**: Fix ChatScreen functional regressions
11. **Screens**: Fix HomeScreen glassmorphism (defer to last — largest scope)
