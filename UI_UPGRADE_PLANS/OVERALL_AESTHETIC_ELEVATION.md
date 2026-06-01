# Overall Aesthetic Elevation — Design System & Philosophy

## Executive Summary

This document defines the unified luxury dark aesthetic for ThryftVerse, derived from careful analysis of the reference images. It serves as the **source of truth** for all UI upgrade plans (Inbox, Settings, Upload, Other Screens).

> **Honest Audit Note (June 2026)**: After auditing the actual codebase, **most premium components already exist**: `GlassCard`/`GlassSurface`, `GlowSurface`, `AppButton` (gold variant), `AnimatedPressable`, `AppInput`, `AppSegmentControl`, `SkeletonLoader`, `BlurView`, `SharedTransitionView`, `Reanimated` parallax, `DoubleTapHeart`, `ProductCardV2`, `StaggeredItem`, and `ScreenHeader`. This document specifies the design language that these components already implement. The real work is **adoption** (swapping remaining solid `AppCard` surfaces to `GlassCard`) and **2 new components**: `AvatarRing` + `PulseDot`.

**Core identity**: ThryftVerse is a premium fashion resale marketplace. The UI must feel like a high-end native app — not a generic React Native template. Every pixel, animation, and interaction should reinforce trust, quality, and exclusivity.

---

## 1. Visual Philosophy

### The Reference Aesthetic

From the reference images, the following visual DNA is extracted:

| Attribute | Reference Expression | ThryftVerse Translation |
|-----------|-------------------|------------------------|
| **Mood** | Dark, intimate, exclusive | Deep black canvas with warm gold accents |
| **Depth** | Layered glass surfaces | Glassmorphism cards with hairline borders |
| **Light** | Subtle ambient glow | Gold glow on active elements, avatars, CTAs |
| **Typography** | Bold, oversized, confident | `Inter` family with tight negative spacing on headlines |
| **Imagery** | Large, dominant, full-bleed | Full-bleed photos with gradient overlays |
| **Motion** | Smooth, weighty, deliberate | Spring physics; nothing linear or instant |
| **Material** | Frosted glass, brushed metal | Translucent surfaces with subtle blur |

### What We Are NOT
- **Not** a bright, playful social app (no neon, no pastel)
- **Not** a corporate fintech app (no heavy data tables, no dense grids)
- **Not** a generic e-commerce template (no standard Bootstrap/Material styling)

---

## 2. Color System Elevation

### 2.1 Core Palette

The existing `Colors` object in `constants/colors.ts` already contains most of these tokens (`background`, `surface`, `surfaceAlt`, `brand`, `textPrimary`, `textSecondary`, `textMuted`, `border`, `borderLight`, `danger`, `success`). The additions below are optional glow/gradient helpers — not new color tokens.

> **Note**: Do not duplicate existing tokens. Use `Colors.brand`, `Colors.surface`, etc. directly. Only add the `*_GLOW` variants if they are used in multiple places.

```
BACKGROUND        →  #0A0A0A  (pure dark foundation)
SURFACE           →  #121212  (slightly elevated dark)
SURFACE_ALT       →  #1A1A1A  (card interiors, subtle contrast)
BRAND             →  #D4AF37  (antique gold — the signature accent)
BRAND_GLOW        →  rgba(212,175,55,0.15)  (for halos, shadows, borders)
TEXT_PRIMARY      →  #FFFFFF  (pure white for maximum contrast)
TEXT_SECONDARY    →  #B0B0B0  (warm gray for body text)
TEXT_MUTED        →  #6E6E6E  (subtle, nearly whispered text)
BORDER            →  rgba(255,255,255,0.06)  (hairline dividers)
BORDER_LIGHT      →  rgba(255,255,255,0.10)  (slightly stronger borders)
BORDER_FOCUS      →  rgba(212,175,55,0.30)  (gold focus ring)
DANGER            →  #FF4D4D  (kept, but used sparingly)
DANGER_GLOW       →  rgba(255,77,77,0.20)  (error field glow)
SUCCESS           →  #4CAF50  (kept for confirmations)
SUCCESS_GLOW      →  rgba(76,175,80,0.15)  (subtle success halo)
```

### 2.2 Gradient Tokens (New)

```
GOLD_GRADIENT     →  linear-gradient(135deg, #C8A545, #D4AF37)
GOLD_GRADIENT_H   →  linear-gradient(90deg, #C8A545, #D4AF37)
DARK_GRADIENT     →  linear-gradient(180deg, #0A0A0A, #121212)
GLASS_BG          →  rgba(255,255,255,0.025)
GLASS_BORDER      →  rgba(255,255,255,0.06)
```

### 2.3 Light Mode Adaptation

While the primary aesthetic is dark, light mode must still feel premium:

```
BACKGROUND_LIGHT  →  #F5F5F0  (warm off-white, not sterile white)
SURFACE_LIGHT     →  #FFFFFF  (pure white cards)
SURFACE_ALT_LIGHT →  #FAFAF5  (subtle warm tint)
TEXT_PRIMARY_L    →  #1A1A1A  (near-black, not pure black)
TEXT_SECONDARY_L  →  #555555
TEXT_MUTED_L      →  #999999
BORDER_LIGHT_MODE →  rgba(0,0,0,0.06)
GLASS_BG_LIGHT    →  rgba(0,0,0,0.03)
GLASS_BORDER_L    →  rgba(0,0,0,0.08)
```

**Rule**: The gold accent (`#D4AF37`) is the ONLY color that does not change between themes. It is the brand constant.

---

## 3. Typography Elevation

### 3.1 Type Scale (Refined)

| Token | Size | Weight | Line Height | Letter Spacing | Usage |
|-------|------|--------|-------------|----------------|-------|
| `display` | 32px | 700 | 38px | -0.5px | Auth hero, empty state titles |
| `title` | 24px | 700 | 30px | -0.3px | Screen titles, card headers |
| `subtitle` | 17px | 600 | 22px | -0.2px | Section labels, usernames |
| `body` | 15px | 500 | 21px | 0px | Body text, descriptions |
| `bodyEmphasis` | 15px | 600 | 21px | 0px | Strong body, picker values |
| `price` | 20px | 700 | 24px | -0.3px | Prices in lists |
| `priceLarge` | 28px | 700 | 32px | -0.5px | Hero prices, totals |
| `caption` | 13px | 400 | 18px | 0.1px | Metadata, timestamps |
| `meta` | 11px | 600 | 14px | 0.5px | Labels, badges, section headers |

### 3.2 Typography Rules

- **Headlines**: Always `Inter_700Bold`, always negative letter-spacing for tightness
- **Prices**: Always bold, always gold (`Colors.brand`) when representing money
- **Section labels**: Always uppercase, always wide letter-spacing, always muted — they should whisper
- **Body**: Never use `fontSize: 14` directly; always use `Type.body` (15px)
- **Never**: Use `fontFamily` directly in stylesheets. Always reference `Typography.family.*` or `Type.*.fontFamily`

---

## 4. Spacing & Layout Elevation

### 4.1 Spacing Scale (Preserved but Applied Differently)

| Token | Value | New Usage |
|-------|-------|-----------|
| `xs` | 4px | Icon gaps, tight inline spacing |
| `sm` | 8px | Row internal padding, chip gaps |
| `md` | 16px | Card internal padding, screen horizontal padding |
| `lg` | 24px | Section margins, card vertical padding |
| `xl` | 32px | Major section breaks, hero spacing |
| `xxl` | 48px | Screen bottom padding, large dividers |

### 4.2 Layout Principles

- **Generous breathing room**: Never crowd elements. The dark canvas demands space.
- **Full-bleed imagery**: Photos should extend edge-to-edge where possible, with rounded corners only on the bottom (or all around if not full-bleed).
- **Edge-to-edge cards**: Cards should span `width: 100%` with horizontal `padding: 16px` on the screen container — not card margins.
- **Safe areas**: Respect `SafeAreaView` insets, but use `edges={['top']}` only; let content flow to bottom edge.
- **Bottom bars**: Sticky CTAs should have `paddingBottom` equal to bottom safe area inset + 16px.

---

## 5. Shape & Elevation Elevation

### 5.1 Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| `sm` | 8px | Small buttons, tags |
| `md` | 12px | Inputs, small cards |
| `lg` | 16px | Primary buttons, medium cards |
| `xl` | 20px | Glassmorphism cards |
| `xxl` | 24px | Upload zones, modals |
| `full` | 999px | Avatars, circular buttons |

### 5.2 Elevation Language

| Token | Shadow | Usage |
|-------|--------|-------|
| `none` | none | Flat elements on dark bg |
| `subtle` | `opacity: 0.08, radius: 8` | Pressed states, subtle depth |
| `card` | `opacity: 0.12, radius: 20` | Standard glass cards |
| `floating` | `opacity: 0.20, radius: 32` | Modals, bottom sheets, FABs |
| `glow` | `color: brand, opacity: 0.25, radius: 16` | Active CTAs, unread avatars |

**Rule on Android**: `elevation` values must accompany every shadow specification. Use `elevation: 4` for card, `elevation: 8` for floating.

---

## 6. Glassmorphism Specification

This is the defining surface treatment of the new aesthetic.

### 6.1 Standard Glass Card

```typescript
const glassCard = {
  backgroundColor: 'rgba(255,255,255,0.025)',  // barely visible
  borderRadius: 20,
  borderWidth: 0.5,
  borderColor: 'rgba(255,255,255,0.06)',
  // iOS shadow
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.15,
  shadowRadius: 20,
  // Android
  elevation: 4,
};
```

### 6.2 Active / Focused Glass Card

```typescript
const glassCardActive = {
  ...glassCard,
  borderColor: 'rgba(212,175,55,0.20)',
  shadowColor: Colors.brand,
  shadowOpacity: 0.10,
  shadowRadius: 16,
};
```

### 6.3 Glass Input

```typescript
const glassInput = {
  backgroundColor: 'rgba(255,255,255,0.03)',
  borderRadius: 14,
  borderWidth: 0.5,
  borderColor: 'rgba(255,255,255,0.06)',
  paddingHorizontal: 16,
  paddingVertical: 14,
};
```

### 6.4 Glass Search Pill

```typescript
const glassSearchPill = {
  height: 44,
  borderRadius: 16,
  backgroundColor: 'rgba(255,255,255,0.04)',
  borderWidth: 0.5,
  borderColor: 'rgba(255,255,255,0.06)',
  // On focus:
  // borderColor: 'rgba(212,175,55,0.30)',
};
```

### 6.5 Implementation Notes

- **Expo BlurView**: Use `<BlurView intensity={12} tint="dark">` as a wrapper for true glassmorphism on iOS. On Android, fall back to the translucent `backgroundColor` approach (React Native Android does not support `BlurView` well).
- **Performance**: Do NOT wrap entire scrollable lists in `BlurView`. Apply blur only to static containers (headers, cards, bottom bars).
- **Accessibility**: Ensure glass cards maintain sufficient contrast. If blur reduces readability, increase `backgroundColor` alpha slightly.

---

## 7. Component Library Elevation

> **Honest Audit Note**: The components described below largely **already exist** in the codebase. This section serves as documentation of the existing component specs, not a creation list.
> - `GlassCard` / `GlassSurface` → `components/ui/GlassSurface.tsx`
> - `AppButton` (primary/secondary/ghost) → `components/ui/AppButton.tsx`
> - `AnimatedPressable` (icon button with scale) → `components/AnimatedPressable.tsx`
> - `AppInput` (labels, prefixes, helper text) → `components/ui/AppInput.tsx`
> - `SkeletonLoader` (shimmer) → `components/SkeletonLoader.tsx`
> - `Switch` with gold track → already used in `SettingsCell.tsx`
> - Only **2 new components** are genuinely missing: `AvatarRing` and `PulseDot` (from `INBOX_UPGRADE_PLAN.md`)

### 7.1 Buttons

#### Primary CTA (Gold Gradient)
```typescript
// Full-width, 56px height, 16px radius
// Background: linear-gradient(135deg, #C8A545, #D4AF37)
// Text: #0A0A0A (dark on gold for maximum contrast)
// Shadow: brand glow
// Press: scale to 0.97, spring animation
```

#### Secondary CTA (Glass)
```typescript
// Same dimensions as primary
// Background: glass surface (rgba(255,255,255,0.04))
// Border: 0.5px rgba(255,255,255,0.08)
// Text: Colors.textPrimary
// Press: background brightens to rgba(255,255,255,0.07)
```

#### Ghost / Tertiary
```typescript
// No background, no border
// Text: Colors.brand or Colors.textSecondary
// Press: text opacity 0.7
```

#### Icon Button (Circular)
```typescript
// 40x40 or 44x44 circle
// Background: rgba(255,255,255,0.05)
// Border: 0.5px rgba(255,255,255,0.08)
// Icon: 20px, Colors.textPrimary
// Press: scale 0.92, background brightens
```

### 7.2 Inputs

All inputs must be wrapped in a glass container. The raw `TextInput` should never sit directly on the background.

- **Label**: Floating or inline top. `Type.meta` (11px), uppercase, `Colors.textMuted`
- **Value**: `Type.body` (15-16px), `Colors.textPrimary`
- **Placeholder**: `rgba(255,255,255,0.15)` (very subtle)
- **Prefix/Suffix**: Icon or currency symbol, `Colors.textMuted`, vertically centered
- **Focus**: Border transitions to `Colors.borderFocus` (gold 30%)
- **Error**: Border becomes `Colors.danger`, subtle `Colors.dangerGlow` shadow
- **Success**: Optional green checkmark suffix

### 7.3 Cards

#### Standard Card
- Use `GlassCard` from `components/ui/GlassSurface`
- `borderRadius: 20px`
- Internal padding: `16px`

#### Media Card (Home, Browse)
- Full-bleed image with `borderRadius: 20px`
- Bottom gradient overlay (transparent to `rgba(0,0,0,0.6)`)
- Title + price floating on gradient
- No visible card border — the image IS the card

#### List Row Card (Inbox, Orders, Notifications)
- `borderRadius: 16px` or `20px`
- Avatar on left (56px with optional ring)
- Title + subtitle stack in center
- Meta (time, price, status) on right

#### Metric Card (Wallet, Portfolio)
- `borderRadius: 16px`
- Label on top in `Type.meta`
- Value in `Type.price` or `Type.title`
- Optional trend indicator (arrow + percentage)

### 7.4 Avatars

Use the `AvatarRing` component everywhere:
- **Size variants**: `sm` (36px), `md` (52px), `lg` (72px), `xl` (100px)
- **Ring**: 2px border, `Colors.brand` for verified/premium, `Colors.border` for regular
- **Online dot**: 10px circle, `Colors.success`, `borderWidth: 2.5px`, positioned bottom-right
- **Unread glow**: `shadowColor: Colors.brand`, `shadowOpacity: 0.35`, `shadowRadius: 10`

### 7.5 Status Pills

- **Container**: `borderRadius: 999px` (full pill)
- **Height**: 24px
- **Padding**: `horizontal: 10px`
- **Text**: `Type.meta` (11px), bold
- **Variants**:
  - `active`: `backgroundColor: rgba(212,175,55,0.12)`, `color: Colors.brand`
  - `success`: `backgroundColor: rgba(76,175,80,0.12)`, `color: Colors.success`
  - `warning`: `backgroundColor: rgba(255,165,0,0.12)`, `color: #FFA500`
  - `danger`: `backgroundColor: rgba(255,77,77,0.12)`, `color: Colors.danger`
  - `neutral`: `backgroundColor: rgba(255,255,255,0.06)`, `color: Colors.textSecondary`

### 7.6 Toggles

Use the native `Switch` component with gold styling (already implemented in `SettingsCell.tsx`):
- **Track (active)**: `Colors.brand`
- **Track (inactive)**: `Colors.border`
- **Thumb**: White (`#FFFFFF`)
- **iOS background**: `Colors.border`

No custom `PremiumToggle` component is needed.

---

## 8. Motion & Animation Language

### 8.1 Entrance Animations

| Pattern | Spec | Usage |
|---------|------|-------|
| `FadeInDown` | `duration: 350ms`, `delay: index * 45ms`, `damping: 20` | List items, cards |
| `FadeInUp` | `duration: 400ms`, `delay: 100ms` | Bottom sheets, modals |
| `FadeIn` | `duration: 300ms` | Overlays, toasts |
| `ScaleIn` | `duration: 250ms`, `spring` | Popovers, menus |

**Rule**: Never animate more than 15 items simultaneously. Cap stagger at `15 * 45ms = 675ms` delay.

### 8.2 Interaction Animations

| Interaction | Spec |
|-------------|------|
| **Press (card/row)** | `scale: 0.97`, `spring(damping: 18, stiffness: 400)`, `duration: ~120ms` |
| **Press (button)** | `scale: 0.96`, `spring(damping: 15, stiffness: 350)` |
| **Press (icon)** | `scale: 0.90`, `spring(damping: 12, stiffness: 300)` |
| **Release** | Spring back to `scale: 1` with slight overshoot |
| **Scroll header** | `opacity: 0 → 1` over first 80px, with `backdrop-blur` |
| **Focus (input)** | Border color spring transition, `duration: 200ms` |
| **Error shake** | `translateX: [-8, 8, -8, 8, 0]`, `duration: 400ms` |
| **Success pulse** | Scale `1 → 1.05 → 1`, `duration: 300ms` |

### 8.3 Haptic Feedback Map

| Action | Haptic |
|--------|--------|
| Tap (any interactive) | `light` |
| Press and hold | `medium` |
| Submit / Confirm | `medium` |
| Success (publish, send) | `success` (iOS) / `medium` (Android) |
| Error / Invalid | `error` (iOS) / `heavy` (Android) |
| Delete / Destructive | `heavy` |
| Toggle switch | `light` |
| Pull-to-refresh trigger | `medium` |
| Scroll snap | `light` |

### 8.4 Loading States

- **Skeletons**: Use `ShimmerSkeleton` component with diagonal shimmer sweep
  - Base: `rgba(255,255,255,0.03)`
  - Highlight: `rgba(255,255,255,0.07)`
- **Spinners**: Only use the custom gold ring spinner
  - Track: `rgba(255,255,255,0.06)`
  - Fill: `Colors.brand`
- **Progress bars**: Thin (3px), gold gradient fill, no animation on indeterminate

---

## 9. Iconography Rules

### 9.1 Icon Style

- **Library**: `Ionicons` (primary), `MaterialCommunityIcons` (secondary)
- **Weight**: Always outline style (`*-outline`), never filled — except for active states
- **Size**:
  - Navigation: 24px
  - Inline / row: 20px
  - Small / meta: 16px
  - Large / hero: 32-48px
- **Color**: Match context — `Colors.textPrimary` for actions, `Colors.textMuted` for decoration, `Colors.brand` for emphasis

### 9.2 Icon Containers

- **Square**: 32x32, `borderRadius: 10px`, tinted background at 12% opacity
- **Circle**: 40x40, `borderRadius: 20px`, `rgba(255,255,255,0.05)` bg
- **No container**: Ghost buttons, plain text links

---

## 10. Image Treatment

### 10.1 Product Images

- **Border radius**: `20px` for standalone, `0px` for full-bleed hero
- **Content fit**: `cover` always — never stretch
- **Placeholder**: Skeleton shimmer while loading, never solid color block
- **Overlay**: Bottom gradient on cards (`transparent` to `rgba(0,0,0,0.5)`)

### 10.2 Avatars

- Always circular (`borderRadius: 999px`)
- `contentFit: 'cover'`
- Fallback: User initials in `Colors.textSecondary` on `Colors.surfaceAlt` background

### 10.3 Covers / Banners

- Parallax scroll effect where applicable
- Gradient overlay for text readability
- `contentFit: 'cover'`, `priority: 'high'`

---

## 11. Accessibility Requirements

The luxury aesthetic must not compromise accessibility.

### 11.1 Contrast

- All text on glass cards must pass WCAG AA (4.5:1 for normal, 3:1 for large)
- `Colors.textMuted` on `Colors.background` is borderline — use sparingly for non-essential text only
- If blur reduces contrast, increase `backgroundColor` alpha by 0.01-0.02

### 11.2 Touch Targets

- Minimum 44x44pt for all interactive elements
- Settings rows: 52px height minimum
- Buttons: 56px height minimum for primary CTAs

### 11.3 Screen Readers

- Every card must have `accessibilityRole="button"` or appropriate role
- Every icon-only button must have `accessibilityLabel`
- Every toggle must announce state change ("Email notifications, on")
- Custom sliders (price range) must implement `AccessibilityActions`

### 11.4 Reduced Motion

- Respect `useReducedMotion()` hook
- When reduced motion is enabled:
  - Disable parallax
  - Replace `FadeInDown` with simple `FadeIn`
  - Disable shimmer animations
  - Keep haptic feedback (it's not visual)

---

## 12. Implementation Priority

### Phase 0 — Foundation (Do First)
1. Audit existing `Colors`, `Radius`, `Elevation`, `Space` tokens — they already exist in `theme/designTokens.ts`
2. Create `AvatarRing` component (from `INBOX_UPGRADE_PLAN.md`) — the only genuinely missing shared component
3. Create `PulseDot` component (from `INBOX_UPGRADE_PLAN.md`) — for unread indicators
4. Verify `GlassCard` / `GlassSurface` covers all use cases — already built
5. Verify `AppButton` gold variant is used everywhere for primary CTAs — already built
6. Verify `SkeletonLoader` is used for all loading states — already built

### Phase 1 — Structural Screens
1. AuthLanding → Login → ForgotPassword
2. HomeScreen (feed + stories + search)
3. ItemDetailScreen (conversion-critical)
4. MyProfileScreen (social hub)

### Phase 2 — Transactional Screens
1. SellScreen (creator flow)
2. CheckoutScreen → OrderDetailScreen
3. BalanceScreen → BalanceHistoryScreen
4. MakeOfferScreen

### Phase 3 — Communication
1. InboxScreen (messaging hub)
2. ChatScreen (conversation thread)
3. NotificationsScreen

### Phase 4 — Settings & Support
1. SettingsScreen → AccountSettingsScreen
2. EditProfileScreen
3. HelpSupportScreen
4. All payment/security screens

### Phase 5 — Discovery & Tools
1. BrowseScreen → FilterScreen → GlobalSearchScreen
2. ClosetScreen → CollectionDetailScreen
3. CreateLookScreen → OutfitBuilderScreen
4. CreatePosterScreen → PosterViewerScreen
5. MyListingsScreen → ManageListingScreen

---

## 13. Anti-Patterns (What to Avoid)

| Anti-Pattern | Why | Solution |
|--------------|-----|----------|
| Light gray backgrounds (`#F2F2F2`) | Kills the luxury dark mood | Use `#0A0A0A` or `#121212` |
| Solid white cards on dark bg | Too harsh, no depth | Use glassmorphism |
| Green toggles | Looks like iOS settings, not a luxury brand | Use gold track |
| Blue links | Default web pattern | Use gold text or underline |
| Heavy drop shadows (`opacity: 0.3+`) | Dated, heavy | Use subtle, diffuse shadows (`opacity: 0.08-0.15`) |
| Sharp corners (0-4px radius) | Cold, unfriendly | Use 12-20px minimum for cards |
| System default spinners | Boring | Use gold custom spinner |
| Multi-color icon palette | Chaotic | Use 3-4 tints max, all at low opacity |
| All-caps body text | Shouting | All-caps ONLY for `Type.meta` labels |
| Compact spacing (8px between cards) | Cramped | Use 12-16px minimum between cards |

---

## 14. Quality Checklist

Before any screen upgrade is considered complete, verify:

- [ ] No inline `IS_LIGHT ? ... : ...` color constants
- [ ] No raw `fontSize` or `fontFamily` values — only `Type` / `Typography` tokens
- [ ] All cards use `GlassCard` (from `components/ui/GlassSurface`) or translucent styling
- [ ] All interactive elements have haptic feedback (via `AnimatedPressable`)
- [ ] All list entrances use `FadeInDown` with stagger (already implemented)
- [ ] All avatars use `AvatarRing` (once created from Inbox plan)
- [ ] All primary CTAs use `AppButton variant="primary"` (gold)
- [ ] All toggles use native `Switch` with `Colors.brand` active track
- [ ] All inputs use `AppInput` (already has labels, prefixes, helper text)
- [ ] All loading states use `SkeletonLoader` (already built)
- [ ] All headers are scroll-aware where applicable (already on Home, ItemDetail)
- [ ] All screens pass a visual contrast check
- [ ] All screens respect reduced motion preference (already implemented)
- [ ] All existing features are preserved (navigation, API, validation, state)

---

## 15. Summary

This aesthetic elevation transforms ThryftVerse from a functional React Native app into a premium fashion marketplace experience. The key principles are:

1. **Dark canvas** — let content and imagery be the stars
2. **Glassmorphism** — layered translucent surfaces create depth
3. **Gold accent** — one signature color for trust, value, and exclusivity
4. **Generous space** — luxury needs room to breathe
5. **Spring motion** — every interaction feels weighty and deliberate
6. **Typography discipline** — a tight, confident type scale
7. **Component consistency** — every screen speaks the same visual language

All screen-specific plans (Inbox, Settings, Upload, Other Screens) derive from this document and must not deviate without updating this source of truth.
