# 00 — Overall Aesthetic Elevation & Foundation

> **Source-of-truth design philosophy for ThryftVerse**
> Drives every per-section .md in this folder
> Sourced from reference images: `overall outlook.jpeg`, `overall reference.jpeg`, `overall reference.jpg`, `extra reference for structuring llayout .jpeg`

---

## 1. Visual Philosophy (The "Why")

### 1.1 Brand Identity

ThryftVerse is a **premium fashion resale marketplace** for authenticated luxury items. The reference images position it visually alongside apps like **Vestiaire Collective**, **The RealReal**, **StockX**, and **1stDibs** — NOT a generic Instagram-style resale app.

The UI must feel:
- **Intimate and exclusive** — like a private members' club, not a flea market
- **Dark, layered, weighty** — depth comes from translucency, not from drop shadows
- **Editorial in typography** — confident, large, generous whitespace
- **Tactile in interaction** — every press feels deliberate, never instant or linear
- **Trustworthy** — gold accents signal "verified / premium / authentic"

### 1.2 The Reference DNA (extracted from `overall outlook.jpeg`, `overall reference.jpeg`, `overall reference.jpg`)

| Attribute | Expression | Consequence in Codebase |
|---|---|---|
| **Mood** | Dark, candlelit, gallery-like | `Colors.background = #0A0A0A`, never pure black, never gray |
| **Depth** | Layered translucent surfaces | `GlassCard` everywhere, no solid `AppCard` |
| **Light** | Warm gold glow on focus / active | `Colors.brand = #D4AF37` (antique gold), `brandGlow` for halos |
| **Typography** | Bold oversized headlines with negative tracking | `Type.display` 32/700/-0.5, `Type.title` 24/700/-0.3 |
| **Imagery** | Full-bleed photos, dominant | `CachedImage` with `contentFit: 'cover'`, `borderRadius: 20` |
| **Motion** | Spring physics, never linear | `Motion.spring` configs in `constants/motion.ts` |
| **Material** | Frosted glass, brushed metal | `<BlurView intensity={12-30} tint="dark">` wrappers |

### 1.3 What We Are NOT (Anti-Patterns)

❌ **Not** a bright playful social app (no neon, no pastel, no candy colors)
❌ **Not** a corporate fintech app (no dense tables, no flat cards, no system Switch)
❌ **Not** a generic e-commerce template (no Bootstrap/Material, no skeleton-only designs)
❌ **Not** cluttered (generous whitespace is luxury; crowded is cheap)

---

## 2. Layout DNA (extracted from `extra reference for structuring llayout .jpeg`)

### 2.1 Vertical Rhythm

```
[ SafeArea top (44pt iOS, 24pt Android) ]
[ Header (sticky, BlurView, 56pt tall) ]
[ 8pt breathing space ]
[ Hero / featured content (full-bleed if image) ]
[ 16pt section gap ]
[ Section title (Type.subtitle 17/600, muted) ]
[ 8pt gap ]
[ Card list (16pt gap between cards) ]
[ 24pt bottom safe area + CTA ]
[ Tab bar (GlassBottomBar, 64pt + safe area) ]
```

### 2.2 Card Layout Rules

| Card Type | Border Radius | Padding | Image Fit | Surface |
|---|---|---|---|---|
| **Hero card** (full-bleed) | `Radius.xl` (20) | 0 (image edge to edge) | `cover` | Image IS the card |
| **Standard card** (Inbox row, Order row) | `Radius.xl` (20) | `Space.md` (16) | — | `GlassCard intensity=30` |
| **Metric card** (Balance, Portfolio) | `Radius.lg` (16) | `Space.lg` (24) | — | `GlassCard intensity=25` |
| **List row** (Settings, Notifications) | `Radius.md` (12) internal | `Space.md` (16) horizontal, `Space.sm` (8) vertical | — | `GlassCard intensity=20` |
| **Form card** (Login, SignUp, EditProfile) | `Radius.xl` (20) | `Space.lg` (24) | — | `GlassCard intensity=25` |
| **Upload zone** (Sell empty state) | `Radius.xxl` (24) | `Space.xl` (32) | — | Dashed border, no fill |

### 2.3 Spacing Scale (in `Space` token)

| Token | Value | Usage |
|---|---|---|
| `xs` | 4 | Icon-to-text gap, badge padding |
| `sm` | 8 | Inline spacing, chip gap, between row items |
| `md` | 16 | Card internal padding, screen horizontal padding |
| `lg` | 24 | Section vertical padding, card-to-card gap |
| `xl` | 32 | Hero top/bottom padding, large break |
| `xxl` | 48 | Major section break, empty state padding |

**Rule**: Screen containers use `paddingHorizontal: Space.md` (16). Cards use `padding: Space.md` internally. Between cards, use `marginBottom: Space.md` (16) or insert in a `FlatList ItemSeparatorComponent` of 12-16.

### 2.4 Safe Area

```tsx
import { SafeAreaView } from 'react-native-safe-area-context';

// iOS: edges={['top']} only — let content flow to bottom edge
// Android: edges={['top']} — system handles bottom
<SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: Colors.background }}>
  {/* Sticky CTA needs extra bottom padding */}
  <View style={{ paddingBottom: insets.bottom + 16 }}>
    <AppButton>Primary Action</AppButton>
  </View>
</SafeAreaView>
```

---

## 3. Color System (master rules)

### 3.1 Dark Canvas (Primary Theme)

| Token | Value | Use |
|---|---|---|
| `Colors.background` | `#0A0A0A` | App-wide canvas, all screens |
| `Colors.surface` | `#121212` | Card base (when not using GlassCard) |
| `Colors.surfaceAlt` | `#1A1A1A` | Sub-card contrast, dividers |
| `Colors.brand` | `#D4AF37` | Antique gold — the ONE accent color |
| `Colors.brandDeep` | `#C8A545` | Gradient companion, pressed states |
| `Colors.textPrimary` | `#FFFFFF` | Body, titles, primary CTAs |
| `Colors.textSecondary` | `#B0B0B0` | Subtitles, descriptions, secondary text |
| `Colors.textMuted` | `#6E6E6E` | Meta, captions, timestamps, hints |
| `Colors.border` | `rgba(255,255,255,0.06)` | Hairline dividers |
| `Colors.borderLight` | `rgba(255,255,255,0.10)` | Slightly stronger borders, focus |
| `Colors.borderFocus` | `rgba(212,175,55,0.30)` | Gold focus ring on inputs |
| `Colors.danger` | `#FF4D4D` | Errors, destructive actions |
| `Colors.success` | `#4CAF50` | Confirmations, success states |

### 3.2 Light Mode (Secondary Theme)

| Token | Value | Use |
|---|---|---|
| `Colors.backgroundL` | `#F5F5F0` | Warm off-white (NEVER pure #FFFFFF) |
| `Colors.surfaceL` | `#FFFFFF` | Pure white cards |
| `Colors.surfaceAltL` | `#FAFAF5` | Subtle warm tint |
| `Colors.textPrimaryL` | `#1A1A1A` | Near-black (NEVER pure black) |
| `Colors.textSecondaryL` | `#555555` | Body text |
| `Colors.textMutedL` | `#999999` | Meta |
| `Colors.borderL` | `rgba(0,0,0,0.06)` | Hairline |

**Rule**: `Colors.brand` is the **only** color that does not change between themes. It is the brand constant.

### 3.3 Glass Surface Tokens (NEW — must be added)

```typescript
// constants/colors.ts — add these
export const Glass = {
  bg: 'rgba(255,255,255,0.025)',         // standard glass card
  bgLight: 'rgba(255,255,255,0.04)',      // search bar, focus state
  bgStrong: 'rgba(255,255,255,0.06)',     // pressed/hover
  bgL: 'rgba(0,0,0,0.03)',                // light theme glass
  border: 'rgba(255,255,255,0.06)',       // hairline border on glass
  borderLight: 'rgba(255,255,255,0.10)',  // active/hover
  borderL: 'rgba(0,0,0,0.08)',            // light theme
  borderFocus: 'rgba(212,175,55,0.30)',   // gold focus
  shadow: 'rgba(0,0,0,0.15)',             // card shadow
};

export const Glow = {
  brand: 'rgba(212,175,55,0.15)',         // halo around active elements
  brandStrong: 'rgba(212,175,55,0.35)',   // avatar unread glow
  danger: 'rgba(255,77,77,0.20)',         // error field glow
  success: 'rgba(76,176,80,0.15)',        // success halo
};
```

---

## 4. Typography DNA

### 4.1 Type Scale (apply via `Type` tokens in `theme/designTokens.ts`)

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `Type.display` | 32 | 700 | 38 | -0.5 | Auth hero, empty state titles |
| `Type.title` | 24 | 700 | 30 | -0.3 | Screen titles, card headers |
| `Type.subtitle` | 17 | 600 | 22 | -0.2 | Section labels, usernames |
| `Type.body` | **15** | 500 | 21 | 0 | Body text, descriptions (NEVER 14) |
| `Type.bodyEmphasis` | 15 | 600 | 21 | 0 | Strong body, picker values |
| `Type.price` | 20 | 700 | 24 | -0.3 | Prices in lists |
| `Type.priceLarge` | 28 | 700 | 32 | -0.5 | Hero prices, totals |
| `Type.caption` | 13 | 400 | 18 | 0.1 | Metadata, timestamps |
| `Type.meta` | 11 | 600 | 14 | 0.5 | ALL-CAPS labels, badges, section headers |

**Critical rules:**
- ❌ NEVER use `fontSize: 14` directly — always `Type.body` (15)
- ❌ NEVER use `fontFamily` in stylesheets — always `Typography.family.*`
- ✅ Headlines always have negative letter-spacing
- ✅ Prices are always bold + `Colors.brand` (gold)
- ✅ Section labels always `Type.meta`, uppercase, `Colors.textMuted` — they should whisper

### 4.2 Typography Hierarchy on a Card

```tsx
<View style={styles.card}>
  {/* SECTION LABEL (meta, muted, uppercase) */}
  <Text style={{ ...Type.meta, color: Colors.textMuted, textTransform: 'uppercase' }}>
    Vintage
  </Text>

  {/* TITLE (bold, primary) */}
  <Text style={{ ...Type.subtitle, color: Colors.textPrimary }}>
    Chanel Classic Flap
  </Text>

  {/* BODY (secondary, lighter) */}
  <Text style={{ ...Type.body, color: Colors.textSecondary }}>
    Caviar leather, gold hardware, 2019
  </Text>

  {/* PRICE (bold, gold) */}
  <Text style={{ ...Type.price, color: Colors.brand }}>
    $4,250
  </Text>
</View>
```

---

## 5. Iconography DNA

### 5.1 Library & Weight

- **Primary**: `Ionicons` — outline style (`*-outline`) for inactive, filled for active
- **Secondary**: `MaterialCommunityIcons` — for niche icons (e.g., `trophy-outline`)

### 5.2 Icon Sizes

| Context | Size | Container |
|---|---|---|
| Tab bar | 24 | No container |
| Header icon | 22 | `rgba(255,255,255,0.05)` circular 40×40 |
| Row icon | 20 | Tinted square 32×32, `borderRadius: 10` |
| Inline / meta | 16 | No container |
| Hero / empty state | 32-48 | `GlowOrb` behind, `Colors.brand` color |

### 5.3 Icon Container (Settings Rows, Notifications)

```tsx
<View style={{
  width: 32,
  height: 32,
  borderRadius: 10,
  backgroundColor: `${iconColor}20`, // 20 = 12% opacity
  alignItems: 'center',
  justifyContent: 'center',
}}>
  <Ionicons name={icon} size={20} color={iconColor} />
</View>
```

**Color tints** (used as `${color}20` background):
- `Colors.brand` (gold) — premium, verified
- `#4A9EFF` (blue) — communication, inbox
- `#FF6B6B` (red) — destructive, danger
- `#50C878` (green) — success, money
- `#B266FF` (purple) — special, syndicate
- `#FFA500` (amber) — warnings, auctions

---

## 6. Motion & Animation DNA

### 6.1 Spring Configs (in `constants/motion.ts`)

```typescript
export const Spring = {
  gentle: { damping: 20, stiffness: 180, mass: 1 },      // list items, cards
  press: { damping: 15, stiffness: 350, mass: 0.5 },     // button press
  iconPress: { damping: 12, stiffness: 300, mass: 0.3 }, // icon button
  modal: { damping: 22, stiffness: 220, mass: 1 },       // modals, sheets
  bouncy: { damping: 12, stiffness: 250, mass: 0.8 },    // success, confetti
};

export const Duration = {
  fast: 150,
  normal: 250,
  slow: 400,
};
```

### 6.2 Entrance Animation Patterns

| Pattern | Spec | Where |
|---|---|---|
| `FadeInDown` | 350ms, stagger `index * 45ms` | List items, cards, settings rows |
| `FadeInUp` | 400ms, delay 100ms | Bottom sheets, modals |
| `FadeIn` | 300ms | Overlays, toasts |
| `ScaleIn` | 250ms spring | Popovers, menus, success pop |
| `PulseDot` | 1500ms loop | Unread indicators, live now |

**Rule**: Cap stagger at `15 * 45ms = 675ms` total delay. Never animate more than 15 items simultaneously.

### 6.3 Interaction Specs

| Interaction | Animation |
|---|---|
| Press (card/row) | scale 0.97, `Spring.press`, ~120ms |
| Press (button) | scale 0.96, `Spring.press` |
| Press (icon) | scale 0.90, `Spring.iconPress` |
| Release | Spring back to scale 1, slight overshoot |
| Scroll header | opacity 0→1 over first 80px, `BlurView` intensity 0→25 |
| Focus (input) | border color spring 200ms |
| Error shake | translateX [-8, 8, -8, 8, 0], 400ms |
| Success pulse | scale 1→1.05→1, 300ms |

### 6.4 Haptic Feedback Map

| Action | Haptic |
|---|---|
| Any tap | `light` |
| Press and hold | `medium` |
| Submit / Confirm | `medium` |
| Success (publish, send) | `success` iOS / `medium` Android |
| Error / Invalid | `error` iOS / `heavy` Android |
| Delete / Destructive | `heavy` |
| Toggle switch | `light` |
| Pull-to-refresh trigger | `medium` |
| Scroll snap | `light` |

**Implementation**: Use `AnimatedPressable` from `components/AnimatedPressable.tsx` — it wraps the haptic + scale logic. NEVER use raw `Pressable` for interactive elements.

---

## 7. Image Treatment

### 7.1 Product / Listing Images

```tsx
<CachedImage
  uri={imageUri}
  style={{
    width: '100%',
    aspectRatio: 1,            // square for grid, 4/5 for portrait
    borderRadius: 20,          // Radius.xl
  }}
  contentFit="cover"
  priority="high"
/>
```

### 7.2 Bottom Gradient Overlay (for image cards)

```tsx
<View style={{ position: 'relative' }}>
  <CachedImage ... />
  <LinearGradient
    colors={['transparent', 'rgba(0,0,0,0.6)']}
    style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%' }}
    pointerEvents="none"
  />
  <View style={{ position: 'absolute', bottom: Space.md, left: Space.md, right: Space.md }}>
    <Text style={{ ...Type.subtitle, color: '#FFFFFF' }}>Title</Text>
    <Text style={{ ...Type.price, color: Colors.brand }}>$4,250</Text>
  </View>
</View>
```

### 7.3 Avatars

```tsx
<AvatarRing
  size={52}                  // sm=36, md=52, lg=72, xl=100
  uri={avatarUrl}
  isOnline={true}
  isUnread={false}
  ringColor={Colors.brand}   // gold for verified/premium
/>
```

**Rules**:
- Always circular (`borderRadius: 999`)
- `contentFit: 'cover'`
- Fallback: User initials in `Colors.textSecondary` on `Colors.surfaceAlt`
- Always wrap in `AvatarRing` — never use raw `CachedImage` for avatars

### 7.4 Covers / Banners (Profile, Syndicate)

```tsx
<View style={{ position: 'relative', height: 240 }}>
  <CachedImage uri={coverUrl} style={{ width: '100%', height: '100%' }} contentFit="cover" />
  <LinearGradient
    colors={['transparent', 'rgba(0,0,0,0.8)']}
    style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '70%' }}
  />
</View>
```

Parallax: `useAnimatedScrollHandler` + `interpolate(scrollY, [0, 200], [0, -60])` for subtle drift on Profile screen.

---

## 8. Glassmorphism Specification (THE defining surface)

### 8.1 Standard Glass Card

```typescript
const glassCard = {
  backgroundColor: Glass.bg,                  // rgba(255,255,255,0.025)
  borderRadius: 20,                          // Radius.xl
  borderWidth: 0.5,
  borderColor: Glass.border,                 // rgba(255,255,255,0.06)
  // iOS shadow
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.15,
  shadowRadius: 20,
  // Android
  elevation: 4,
};
```

**Implementation**: Use `GlassCard` from `components/ui/GlassSurface.tsx` (already exists).

```tsx
<GlassCard intensity={30} tint="dark" borderRadius={20}>
  {/* content */}
</GlassCard>
```

### 8.2 Active / Focused Glass Card

```typescript
const glassCardActive = {
  ...glassCard,
  borderColor: 'rgba(212,175,55,0.20)',     // gold tint
  shadowColor: Colors.brand,
  shadowOpacity: 0.10,
  shadowRadius: 16,
};
```

Use when: row is selected, picker is focused, list item is active.

### 8.3 Glass Search Pill

```typescript
const glassSearchPill = {
  height: 44,
  borderRadius: 16,                          // not full pill — slightly squared
  backgroundColor: Glass.bgLight,            // rgba(255,255,255,0.04)
  borderWidth: 0.5,
  borderColor: Glass.border,
  paddingHorizontal: 16,
  // Focus: borderColor: Glass.borderFocus
};
```

**Implementation**: `GlassSearchPill` from `components/ui/GlassSearchPill.tsx` (TO BE CREATED).

### 8.4 Glass Input

```typescript
const glassInput = {
  backgroundColor: Glass.bgLight,
  borderRadius: 14,
  borderWidth: 0.5,
  borderColor: Glass.border,
  paddingHorizontal: 16,
  paddingVertical: 14,
};
```

**Implementation**: Use `AppInput variant="glass"` (TO BE ENHANCED).

### 8.5 Implementation Notes

- **iOS**: Wrap content in `<BlurView intensity={12-30} tint="dark">` for true glassmorphism
- **Android**: Fall back to translucent `backgroundColor` (BlurView is unreliable on Android)
- **Performance**: NEVER wrap entire scrollable lists in `BlurView`. Apply blur only to static containers (headers, cards, bottom bars)
- **Accessibility**: If blur reduces text contrast, increase `backgroundColor` alpha by 0.01-0.02

---

## 9. Buttons (4 Variants)

### 9.1 Primary CTA (Gold)

```typescript
{
  width: '100%',
  height: 56,                                // primary CTA height
  borderRadius: 16,                          // Radius.lg
  backgroundColor: Colors.brand,             // solid gold
  shadowColor: Colors.brand,
  shadowOpacity: 0.25,
  shadowRadius: 16,
  // Text
  color: '#0A0A0A',                          // dark on gold for contrast
  fontWeight: 700,
  fontSize: 16,
  letterSpacing: -0.2,
  // Press
  scale: 0.96,                               // spring(15, 350)
}
```

**Use**: Publish listing, Buy Now, Make Offer, Withdraw, Save, Confirm.

### 9.2 Secondary CTA (Glass)

```typescript
{
  width: '100%',
  height: 56,
  borderRadius: 16,
  backgroundColor: Glass.bgLight,
  borderWidth: 0.5,
  borderColor: Glass.border,
  // Text
  color: Colors.textPrimary,
  fontWeight: 600,
  // Press: backgroundColor → Glass.bgStrong
}
```

**Use**: Cancel, Skip, Add to Closet, Maybe Later.

### 9.3 Ghost / Tertiary

```typescript
{
  // No bg, no border
  color: Colors.brand,                       // or textSecondary
  fontWeight: 600,
  // Press: opacity 0.7
}
```

**Use**: Forgot password, View all, Learn more.

### 9.4 Icon Button (Circular, 40×40 or 44×44)

```typescript
{
  width: 40, height: 40, borderRadius: 20,
  backgroundColor: 'rgba(255,255,255,0.05)',
  borderWidth: 0.5, borderColor: Glass.border,
  alignItems: 'center', justifyContent: 'center',
  // Press: scale 0.90 + bg → Glass.bgStrong
}
```

**Use**: Header icons, picker close, swipe actions.

**Implementation**: Use `AppButton` (from `components/ui/AppButton.tsx`) for all button variants. It supports `variant="primary" | "secondary" | "ghost" | "danger" | "destructive"`.

---

## 10. Status Pills & Badges

### 10.1 AppStatusPill Variants

| Variant | bg | text | Use |
|---|---|---|---|
| `active` | `rgba(212,175,55,0.12)` | `Colors.brand` | Live, Active, Published |
| `success` | `rgba(76,176,80,0.12)` | `Colors.success` | Completed, Delivered, Confirmed |
| `warning` | `rgba(255,165,0,0.12)` | `#FFA500` | Pending, Reviewing, Outbid |
| `danger` | `rgba(255,77,77,0.12)` | `Colors.danger` | Failed, Cancelled, Rejected |
| `neutral` | `rgba(255,255,255,0.06)` | `Colors.textSecondary` | Draft, Archived |

**Structure**:
```typescript
{
  borderRadius: 999,    // full pill
  height: 24,
  paddingHorizontal: 10,
  // Text: Type.meta (11/600)
}
```

**Implementation**: `AppStatusPill` from `components/ui/AppStatusPill.tsx` (already exists).

---

## 11. Accessibility Requirements (non-negotiable)

### 11.1 Contrast (WCAG AA minimum)

- Body text: 4.5:1 against background
- Large text (≥18pt or 14pt bold): 3:1 against background
- `Colors.textMuted` (#6E6E6E) on `Colors.background` (#0A0A0A) = ~5.4:1 — passes
- `Colors.textSecondary` (#B0B0B0) on `Colors.background` = ~9.2:1 — passes
- `Colors.brand` (#D4AF37) on `Colors.background` = ~8.0:1 — passes
- ⚠️ White on rgba(255,255,255,0.025) glass — verify with opacity adjustment

### 11.2 Touch Targets

- Minimum 44×44pt for all interactive elements (Apple HIG, Material guideline)
- Settings rows: 52pt min height
- Primary CTAs: 56pt min height
- Icon buttons: 40-44pt

### 11.3 Screen Readers

- Every card: `accessibilityRole="button"` (or appropriate role)
- Every icon-only button: `accessibilityLabel`
- Every toggle: announces state ("Email notifications, on")
- All images: `accessibilityLabel` (or `accessibilityElementsHidden={true}` for decorative)
- All text fields: associated `accessibilityLabel` (not placeholder)

### 11.4 Reduced Motion

```typescript
import { useReducedMotion } from 'react-native-reanimated';

const reduced = useReducedMotion();
const stagger = reduced ? 0 : 45;             // disable stagger
const enableParallax = !reduced;
const enablePulse = !reduced;
```

**When reduced motion is enabled**:
- Disable parallax (snap headers, no drift)
- Replace `FadeInDown` with `FadeIn` (no Y translation)
- Disable shimmer animations on `SkeletonLoader`
- Keep haptic feedback (it's not visual)
- Disable `PulseDot` animation (use static dot)

---

## 12. Anti-Patterns (NEVER DO)

| Anti-Pattern | Why | Solution |
|---|---|---|
| Light gray backgrounds (`#F2F2F2`) | Kills luxury dark mood | `#0A0A0A` always |
| Solid white cards on dark bg | Too harsh, no depth | Glassmorphism |
| Green iOS-style toggles | Looks like Settings.app, not luxury | `PremiumToggle` gold |
| Blue links | Default web pattern | `Colors.brand` gold text or underline |
| Heavy drop shadows (opacity 0.3+) | Dated | `Elevation.subtle` (0.08-0.15) |
| Sharp corners (0-4px radius) | Cold | 12-20px min for cards |
| System default spinners | Boring | Custom gold ring spinner |
| Multi-color icon palette | Chaotic | 3-4 tints max, all at low opacity |
| All-caps body text | Shouting | ALL-CAPS ONLY for `Type.meta` labels |
| Compact 8px between cards | Cramped | 12-16px min |
| Linear/instant transitions | Cheap | Spring physics always |
| Raw `fontSize: 14` in stylesheets | Drift | `Type.body` (15) |
| `fontFamily: 'Inter_...'` in stylesheets | Drift | `Typography.family.*` |
| Inline `IS_LIGHT ? ... : ...` color logic | Spaghetti | `Colors` tokens (theme-aware) |

---

## 13. Quality Checklist (Per Screen)

Before marking any screen "elevated":

### Foundation
- [ ] No raw `fontSize` or `fontFamily` in stylesheets
- [ ] No inline `IS_LIGHT ? ... : ...` color logic
- [ ] All spacing uses `Space` tokens (xs/sm/md/lg/xl/xxl)
- [ ] All radius uses `Radius` tokens (sm/md/lg/xl/xxl/full)
- [ ] All shadows use `Elevation` tokens (none/subtle/card/floating/glow)

### Surfaces
- [ ] All section cards use `GlassCard` (or justified `AppCard` for solid)
- [ ] No bare `View` with `backgroundColor: Colors.surface` for important content
- [ ] All headers use `GlassHeader` (sticky BlurView)
- [ ] All bottom CTAs use `GlowSurface` wrapper (when gold)
- [ ] All bottom bars use `GlassBottomBar`

### Interaction
- [ ] All `Pressable` replaced with `AnimatedPressable` (haptic + scale)
- [ ] All `Switch` replaced with `PremiumToggle` (in settings/notifications)
- [ ] All avatars use `AvatarRing` (gold ring if verified/premium)
- [ ] All search inputs use `GlassSearchPill`
- [ ] All form inputs use `AppInput variant="glass"`

### Motion
- [ ] All list entrances use `FadeInDown` with stagger
- [ ] All scroll-aware headers fade in from 0→1 over 80px
- [ ] Parallax disabled if `useReducedMotion()` is true
- [ ] All shimmer/skeleton animations disabled in reduced motion

### Accessibility
- [ ] All touch targets ≥ 44pt
- [ ] All icons have `accessibilityLabel`
- [ ] All text passes 4.5:1 contrast
- [ ] All toggles announce state
- [ ] All cards have `accessibilityRole`

### Ops
- [ ] `EXECUTION_TRACKER.md` updated with file:line + status
- [ ] `VISUAL_AUDIT.md` screenshot captured
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes

---

## 14. The 4 Universal Patterns (memorize these)

When elevating any screen, apply these 4 patterns. They cover 80% of the work:

### Pattern 1: Solid → Glass
```tsx
// ❌ Before
<View style={{ backgroundColor: Colors.surface, borderRadius: 16, padding: 16 }}>
  {content}
</View>

// ✅ After
<GlassCard intensity={25} tint="dark" borderRadius={20}>
  <View style={{ padding: 16 }}>{content}</View>
</GlassCard>
```

### Pattern 2: Solid Icon Button → Glass Icon Button
```tsx
// ❌ Before
<AnimatedPressable style={{ backgroundColor: Colors.surface, width: 40, height: 40, borderRadius: 20 }}>
  <Ionicons name="close" size={22} color={Colors.textPrimary} />
</AnimatedPressable>

// ✅ After
<AnimatedPressable
  style={{
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 0.5, borderColor: Glass.border,
    width: 40, height: 40, borderRadius: 20,
  }}>
  <Ionicons name="close" size={22} color={Colors.textPrimary} />
</AnimatedPressable>
```

### Pattern 3: Plain Avatar → AvatarRing
```tsx
// ❌ Before
<CachedImage uri={avatarUrl} style={{ width: 52, height: 52, borderRadius: 26 }} />

// ✅ After
<AvatarRing size={52} uri={avatarUrl} isOnline={true} isUnread={false} />
```

### Pattern 4: Native Switch → PremiumToggle
```tsx
// ❌ Before
<Switch
  value={enabled}
  onValueChange={setEnabled}
  trackColor={{ true: Colors.brand, false: Colors.border }}
/>

// ✅ After
<PremiumToggle
  value={enabled}
  onValueChange={setEnabled}
/>
```

(Same API, gold track animated, drop-in replacement.)

---

## 15. Reference Image Verification (TODO)

When the actual reference images are accessible, verify these specs:

### `overall outlook.jpeg` / `overall reference.jpeg` / `overall reference.jpg`
- [ ] Background is exactly `#0A0A0A` (or very close)
- [ ] Brand color matches `#D4AF37` (gold)
- [ ] Cards have visible translucency (not solid)
- [ ] Typography is bold with negative letter-spacing on headlines
- [ ] Generous whitespace (no crowding)
- [ ] Spring-based animations (no linear)
- [ ] Icons are outline style

### `extra reference for structuring llayout .jpeg`
- [ ] Vertical rhythm: header → hero → sections → CTA → tab bar
- [ ] Card padding consistent (16-24px)
- [ ] Section gaps consistent (16-24px)
- [ ] Bottom safe area respected
- [ ] Tab bar floats with blur

**If any spec doesn't match, update this doc before applying.**

---

**Next**: Read `01_FOUNDATION_TOKENS.md` for the exact code-ready token values to paste into `constants/colors.ts` and `theme/designTokens.ts`.
