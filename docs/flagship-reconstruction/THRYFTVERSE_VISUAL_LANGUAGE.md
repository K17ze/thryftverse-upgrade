# Thryftverse Visual Language

## Application Structure

### Screen backgrounds
- All screens use `Colors.background` as the root background.
- Content is never full-bleed to the edge; horizontal padding is enforced.

### Page widths
- Content width: `Layout.contentWidth` (screen width minus `Space.md * 2`).
- Maximum readable width for text: 480px centred where applicable.

### Safe-area rules
- `SafeAreaView` with `edges={['top']}` for screens with scroll content.
- `SafeAreaView` with `edges={['top', 'bottom']}` for screens with bottom sticky actions.
- Keyboard-avoiding behaviour on all form screens.

### Header architecture
- **Root screens**: No header (handled by tab navigator).
- **Pushed screens**: `FlagshipHeader` with back button (44x44, `Colors.surfaceAlt`), centred title (`Type.subtitle`), optional right action.
- **Modal screens**: `FlagshipHeader` with close button, large title (`Type.title`), optional right action.
- **Sticky header**: On scroll, header gains subtle border and elevation via `useAnimatedScrollHandler`.

### Tab-root architecture
- 5 tabs: Home, Search, Sell, TradeHub, Inbox, Profile.
- Active state: filled icon + spring scale (1.12) + indicator dot.
- Inactive state: outline icon + muted colour.
- Tab bar: `Colors.surface`, subtle top shadow, height adapts to safe area.

### Subpage architecture
- All subpages use `FlagshipScreen` wrapper.
- Content scrolls inside `FlagshipScreen`; header is fixed.
- Sections stack vertically with `Space.lg` between.

### Modal architecture
- Full-screen modals use vertical card interpolation.
- Transparent sheets use `transparentModal` presentation.
- Modal header always has a close or done action.

### Sticky action architecture
- Sticky footer sits above safe area bottom inset.
- Background: `Colors.background` with top border (`Colors.border`).
- Contains primary action(s) using `FlagshipActionCluster`.
- Keyboard-aware on form screens.

---

## Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `Space.xs` | 4px | Icon gaps, inline element spacing |
| `Space.sm` | 8px | Tight padding, grid gaps |
| `Space.md` | 16px | Card padding, section gaps, horizontal screen padding |
| `Space.lg` | 24px | Section breaks |
| `Space.xl` | 32px | Major sections, hero spacing |
| `Space.xxl` | 48px | Onboarding, large hero |

### Global horizontal padding
- All screens: `paddingHorizontal: Space.md` (16px).
- Cards: internal padding `Space.md` (16px).

### Section spacing
- Between sections: `Space.lg` (24px).
- Between section title and first card: `Space.sm` (8px).

### Internal card spacing
- Card padding: `Space.md` (16px) all sides.
- Row padding vertical: 14px; horizontal: `Space.md`.
- Row min-height: 56px.

### Dense-list spacing
- List item gap: 0 (dividers separate).
- Divider: `StyleSheet.hairlineWidth`, `Colors.border`.

### Media-to-content spacing
- Avatar to text: `Space.sm` (8px).
- Cover to content: `Space.lg` (24px).
- Image to label: `Space.sm` (8px).

### Form spacing
- Between fields: `Space.md` (16px).
- Label to input: `Space.xs` (4px).
- Input height: 48px minimum.

---

## Typography

| Role | Token | Usage |
|------|-------|-------|
| Display | `Type.display` (32/38/700) | Auth hero, empty state titles |
| Page title | `Type.title` (24/32/700) | Screen headers (modal), profile names |
| Section title | `Type.subtitle` (17/24/600) | Card headers, section titles, product names |
| Card title | `Type.subtitle` (17/24/600) | Card headers |
| Body | `Type.body` (14/20/400) | General content, descriptions |
| Metadata | `Type.caption` (12/16/400) | Timestamps, captions, hints |
| Labels | `Type.meta` (11/14/500) | Small metadata, seller handles |
| Helper text | `Type.caption` (12/16/400) | Input helper, error text |
| Financial values | `Type.priceList` (20/24/700) | Prices in lists |
| Large financial | `Type.priceLarge` (28/32/700) | Checkout totals, hero prices |
| Message text | `Type.body` (14/20/400) | Chat messages, inbox preview |

---

## Surfaces

| Surface | Background | Border | Elevation | Usage |
|---------|-----------|--------|-----------|-------|
| Flat section | `Colors.background` | none | none | Screen background, plain lists |
| Elevated section | `Colors.surface` | `Colors.border` | `Elevation.subtle` | Cards, grouped rows |
| Editorial media surface | `Colors.surfaceAlt` | none | none | Image placeholders, media frames |
| Interactive row | `Colors.surface` | `Colors.border` (bottom only) | none | Tappable list items |
| Destructive surface | `Colors.danger` at 10% opacity | `Colors.danger` | none | Danger zone containers |
| Selected surface | `Colors.brand` at 8% opacity | `Colors.brand` | none | Selected states |
| Modal surface | `Colors.surface` | none | `Elevation.modal` | Modals, bottom sheets |

---

## Actions

| Action | Style | Size | Colour |
|--------|-------|------|--------|
| Primary | Filled pill | 48px height, `Radius.xl` | `Colors.brand`, `Colors.textInverse` |
| Secondary | Outlined pill | 48px height, `Radius.xl` | `Colors.border`, `Colors.textPrimary` |
| Tertiary | Text only | 44px height | `Colors.textSecondary` |
| Destructive | Filled pill | 48px height, `Radius.xl` | `Colors.danger`, `#FFFFFF` |
| Icon-only | 44x44 circle | `Radius.full` | `Colors.surfaceAlt`, `Colors.textPrimary` |
| Segmented tabs | Pill container | 36px height per tab | Active: `Colors.brand`; Inactive: transparent |
| Contextual actions | Inline text or icon | 44x44 | `Colors.textSecondary` |
| Sticky actions | Full-width or cluster | 48px | Primary + secondary pair |

---

## Media

| Media type | Size / Aspect | Radius | Treatment |
|------------|--------------|--------|-----------|
| Profile cover | 3:1 aspect, full width | `Radius.xl` (16px) | Full-bleed or edge-to-edge |
| Avatar (large) | 96x96px | `Radius.full` | Border: 3px `Colors.background` |
| Avatar (medium) | 56x56px | `Radius.full` | No border |
| Avatar (small) | 32x32px | `Radius.full` | No border |
| Poster | 9:16 or 4:5 | `Radius.lg` (12px) | Edge-to-edge in card |
| Listing image | 1:1 or 4:5 | `Radius.lg` (12px) | Edge-to-edge in card |
| Chat media | Max 280px width | `Radius.md` (8px) | Inline with message bubble |
| Collection cover | 16:9 | `Radius.xl` (16px) | Overlay text optional |
| Financial asset media | 1:1 | `Radius.lg` (12px) | Centre-cropped |
| Video | 16:9 or 9:16 | `Radius.lg` (12px) | Play indicator centred |

---

## Motion

| Motion | Duration | Easing | Detail |
|--------|----------|--------|--------|
| Screen entrance | 300ms | `FadeInDown` | Staggered by 40ms per section |
| Tab change | 150ms | Spring (damping 15, stiffness 150) | Icon scale + indicator width |
| Press feedback | 150ms | Spring | Scale to 0.98 or 0.995 |
| Loading transition | 200ms | Fade | Skeleton to content fade |
| Modal movement | 400ms | `forVerticalIOS` | Vertical slide from bottom |
| Media viewer transition | 300ms | Shared element | Image expansion |
| State confirmation | 400ms | Scale + fade | Checkmark or toast |

---

## States

| State | Visual treatment |
|-------|-----------------|
| Initial loading | Skeleton loaders matching content shape |
| Incremental loading | Spinner inline; skeleton for new items |
| Empty | Illustration + title + subtitle + CTA |
| No search results | Search icon + "No results" + suggestion |
| Offline | Offline banner + cached content if available |
| Failed request | Retry banner + cached content if available |
| Unavailable feature | Info banner + explanation |
| Destructive confirmation | Alert dialog or bottom sheet with red action |
| Success | Toast + haptic success |
| Partial data | Warning pill + rendered available data |

---

## Responsive Behaviour

| Width | Behaviour |
|-------|-----------|
| Compact (< 360px) | Single column; reduced padding (`Space.sm` horizontal) |
| Standard (360–414px) | Standard layout; `Space.md` padding |
| Large (> 414px) | Max content width 480px centred; larger touch targets |

---

## Constraints

- **No gold/yellow/glass-heavy styling.**
- **No imitation of another brand.**
- **All colours via `Colors` tokens.**
- **All typography via `Type` tokens.**
- **All spacing via `Space` tokens.**
- **All elevation via `Elevation` tokens.**
