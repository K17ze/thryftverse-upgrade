---
version: "1.4"
name: "ThryftVerse Neutral Flagship Native Design System"
benchmark-date: "2026-07-11"
description: "A machine-readable and human-readable design contract for a media-first native social-commerce marketplace. It is calibrated against current Pinterest, Instagram, Depop, Vinted, Vestiaire and Whatnot product patterns while remaining faithful to the ThryftVerse React Native codebase. v1.4 keeps the current neutral palette canonical and raises quality through geometry, media integrity, typography, interaction, state clarity, accessibility and performance. Optional luxury accents remain contextual rather than decorative."

implementation-status:
  current-runtime-theme: "VERIFIED — frontend/src/theme/ThemeContext.tsx currently exposes the neutral base palette and does not yet expose the proposed premium/luxury tokens below."
  current-spacing-type-radius-motion: "VERIFIED — frontend/src/theme/designTokens.ts is the runtime source of truth."
  current-gradients: "VERIFIED — frontend/src/theme/gradients.ts exposes static Gradients, Glass and Glow exports AND a useGradients() reactive hook (line 85)."
  target-premium-tokens: "DEFERRED — do not introduce decorative champagne or gold in the flagship reconstruction. The current neutral runtime palette remains canonical; optional premium accents require a separate product decision and semantic use case."
  migration-rule: "Never hardcode proposed tokens in screens. Add them to ThemeColors, LIGHT_COLORS and DARK_COLORS in one focused token migration, then consume through useAppTheme().colors."

reference-priority:
  - "User-provided reference images and explicit visual feedback"
  - "Current production ThryftVerse patterns that already pass device review"
  - "Current public reference-app patterns verified at benchmark-date"
  - "iOS Human Interface Guidelines and Android Material guidance"
  - "Generic design trends"

colors:
  current-runtime:
    background: "#FFFFFF"          # dark: #0A0A0A
    surface: "#F5F5F5"             # dark: #141414
    surface-alt: "#EBEBEB"         # dark: #1F1F1F
    surface-elevated: "#FFFFFF"    # dark: #242424
    brand: "#111111"               # dark: #F4F0E8
    brand-pressed: "#333333"       # dark: #D8D0C3
    text-primary: "#000000"        # dark: #FFFFFF
    text-secondary: "#666666"      # dark: #A3A3A3
    text-muted: "#999999"          # dark: #666666
    text-inverse: "#FFFFFF"        # dark: #000000
    border: "#E5E5E5"             # dark: #262626
    border-subtle: "#F0F0F0"      # dark: #333333
    danger: "#9b0202"
    success: "#215634"
    warning: "#ffc765"
    overlay: "rgba(0,0,0,0.4)"     # dark: rgba(0,0,0,0.6)
    input: "#FFFFFF"               # dark: #1A1A1A
    input-text: "#000000"          # dark: #FFFFFF
    row: "#F5F5F5"                 # dark: #141414
    row-pressed: "#EBEBEB"         # dark: #1A1A1A
    tab-bar: "#FFFFFF"             # dark: #0A0A0A
    header: "#FFFFFF"              # dark: #0A0A0A
    shadow: "#000000"
    glass-bg: "rgba(0,0,0,0.04)"   # dark: rgba(255,255,255,0.04)
    glass-border: "rgba(0,0,0,0.08)" # dark: rgba(255,255,255,0.08)

  proposed-canvas-modes:
    media:
      light-background: "#FFFFFF"
      dark-background: "#0A0A0A"
      light-surface: "#F7F7F7"
      dark-surface: "#141414"
      accent-policy: "No decorative gold by default. Let imagery carry colour."
    premium-commerce:
      light-background: "#FBF9F6"
      dark-background: "#0C0A08"
      light-surface: "#F4F1EC"
      dark-surface: "#15120F"
      light-surface-alt: "#EDE9E2"
      dark-surface-alt: "#1F1B16"
      accent-policy: "Optional contextual champagne/bronze accent for authenticated value, premium ownership, verified status or curated distinction."
    utility:
      light-background: "#FFFFFF"
      dark-background: "#0A0A0A"
      light-surface: "#F5F5F5"
      dark-surface: "#141414"
      accent-policy: "No decorative luxury accent. Quality comes from geometry, typography, state clarity and interaction."

  proposed-luxury:
    champagne: "#F4E8D0"
    champagne-pressed: "#E3C98F"
    antique-gold: "#C9A46A"
    antique-gold-pressed: "#A9844E"
    bronze: "#8A6A3F"
    luxury-on-accent: "#111111"
    luxury-focus-light: "#8A6A3F"
    luxury-focus-dark: "#E3C98F"
    soft-gold-surface-light: "rgba(201,164,106,0.10)"
    soft-gold-surface-dark: "rgba(244,232,208,0.08)"
    gold-border-light: "rgba(201,164,106,0.32)"
    gold-border-dark: "rgba(244,232,208,0.22)"
    gold-glow-light: "rgba(201,164,106,0.18)"
    gold-glow-dark: "rgba(244,232,208,0.18)"

  proposed-semantic:
    social: "#6B3245"
    discovery: "#7B0E1E"
    commerce-trust: "#06489A"
    coown-up: "#1C5631"
    coown-down: "#5F1616"

typography:
  source: "frontend/src/theme/designTokens.ts"
  family: "Inter via @expo-google-fonts/inter"
  display: { fontFamily: "Inter_700Bold", fontSize: "32px", fontWeight: "700", lineHeight: "38px", letterSpacing: "-0.5px" }
  title: { fontFamily: "Inter_700Bold", fontSize: "24px", fontWeight: "700", lineHeight: "32px", letterSpacing: "-0.6px" }
  subtitle: { fontFamily: "Inter_600SemiBold", fontSize: "17px", fontWeight: "600", lineHeight: "24px", letterSpacing: "-0.4px" }
  body: { fontFamily: "Inter_400Regular", fontSize: "14px", fontWeight: "400", lineHeight: "20px", letterSpacing: "-0.2px" }
  body-strong: { fontFamily: "Inter_600SemiBold", fontSize: "15px", fontWeight: "600", lineHeight: "21px", letterSpacing: "0px" }
  caption: { fontFamily: "Inter_400Regular", fontSize: "12px", fontWeight: "400", lineHeight: "16px", letterSpacing: "0px" }
  caption-elevated: { fontFamily: "Inter_400Regular", fontSize: "13px", fontWeight: "400", lineHeight: "18px", letterSpacing: "0.1px" }
  label: { fontFamily: "Inter_600SemiBold", fontSize: "11px", fontWeight: "600", lineHeight: "14px", letterSpacing: "0.5px" }
  price-list: { fontFamily: "Inter_700Bold", fontSize: "20px", fontWeight: "700", lineHeight: "24px", letterSpacing: "-0.3px" }
  price-large: { fontFamily: "Inter_700Bold", fontSize: "28px", fontWeight: "700", lineHeight: "32px", letterSpacing: "-0.5px" }

rounded:
  none: "0px"
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "999px"

spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"

elevation:
  none: { shadowOpacity: 0, elevation: 0 }
  subtle: { shadowOpacity: "0.06", shadowRadius: "8px", elevation: 2 }
  card: { shadowOpacity: "0.08", shadowRadius: "12px", elevation: 4 }
  floating: { shadowOpacity: "0.12", shadowRadius: "16px", elevation: 8 }
  modal: { shadowOpacity: "0.18", shadowRadius: "24px", elevation: 16 }

motion:
  instant: "0ms"
  fast: "150ms"
  normal: "250ms"
  slow: "400ms"
  slower: "600ms"

dock-geometry:
  base-height: "72px"
  single-action-height: "96px"
  dual-action-height: "132px"
  stacked-action-height: "180px"

components:
  button-primary:
    backgroundColor: "{colors.current-runtime.brand}"
    textColor: "{colors.current-runtime.text-inverse}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.full}"
    height: "52px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.current-runtime.text-primary}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.full}"
    height: "44px"
  form-field:
    backgroundColor: "{colors.current-runtime.input}"
    textColor: "{colors.current-runtime.input-text}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    height: "52px"
  settings-row:
    backgroundColor: "{colors.current-runtime.row}"
    textColor: "{colors.current-runtime.text-primary}"
    typography: "{typography.body-strong}"
    height: "56-64px"
  media-card:
    backgroundColor: "transparent"
    rounded: "{rounded.lg}"
  masonry-card:
    backgroundColor: "transparent"
    rounded: "{rounded.lg}"
  story-avatar:
    rounded: "{rounded.full}"
    size: "64px"
---

## Overview

ThryftVerse is a media-first native social-commerce marketplace. Its quality target is not to photocopy Pinterest, Instagram, Depop, Vinted, Vestiaire or Whatnot. It must extract their strongest product logic, remove their weaknesses, and create a coherent ThryftVerse visual signature across discovery, social identity, commerce, auctions and fractional ownership.

This file is both:

1. a machine-readable token and component contract for coding/design agents; and
2. a human-readable explanation of the composition, interaction, media, performance and trust decisions behind those tokens.

### Product art direction

**A premium social closet and marketplace where media, identity, trust and commerce feel like one authored native product.**

The app must feel:

- media-first, not chrome-first;
- expressive, not chaotic;
- premium, not artificially gold-themed;
- compact, not cramped;
- trustworthy, not legalistic;
- commerce-native, not generic e-commerce;
- alive, not over-animated;
- native, not a web dashboard inside a phone.

### Benchmark freshness

The reference interpretation in this file was reviewed against public product imagery and announcements available on **11 July 2026**. Reference applications evolve continuously. Agents must preserve the underlying product logic rather than freeze ThryftVerse to one screenshot or one historical layout.

Current benchmark lessons:

- **Pinterest:** almost invisible chrome, highly colourful media, true image aspect ratios, modular discovery, boards/collages, visual re-rooting, multimodal relevance and strong perceived performance.
- **Instagram:** full-attention media, stable action grammar, Stories, taller profile thumbnails, pinning and user-controlled profile-grid arrangement.
- **Depop:** seller identity, social storefronts, practical product actions, compact listing workflows and commerce embedded into community.
- **Vinted:** transactional clarity, search/filter efficiency, buyer protection, low-friction listing and visual-search utility.
- **Vestiaire:** premium restraint, trust as product, editorial photography, authenticity and controlled information density.
- **Whatnot:** live urgency, current-lot clarity, chat/bid coexistence and high-confidence transactional haptics.

### Runtime truth rule

The front matter distinguishes **current runtime tokens** from **proposed target tokens**. A proposed token is not production-ready until it exists in `ThemeContext.tsx` and is consumed through `useAppTheme().colors`.

When documentation and code disagree:

1. verify the active branch and source files;
2. treat current code as runtime truth;
3. treat this file as the design target;
4. make a focused token-migration commit before using missing tokens;
5. never hardcode target values into individual screens.

### Native product rule

The rendered iOS/Android app is the product. TypeScript, tests, tokens and documentation are necessary but insufficient.

For agents without visual capability:

- implement from `.tsx`, this file, user-written defects and supplied references;
- capture screenshots when possible;
- never claim that a screenshot looks good;
- never claim visual acceptance;
- report `Visual QA: pending user review`.

## Colors

The palette must support three distinct surface modes. The previous global rule that every surface must use warm beige/champagne neutrals was too blunt. Pinterest- and Instagram-like media surfaces often work best on pure neutral white/near-black canvases, while selected premium-commerce moments benefit from subtle warmth.

### Current runtime palette

`frontend/src/theme/ThemeContext.tsx` is the current source of truth for component colours through `useAppTheme().colors`. The verified runtime palette remains the neutral base documented in the YAML front matter. It does **not** currently expose the proposed premium/luxury keys.

The legacy `frontend/src/constants/colors.ts` is compatibility-only. New React components should use `useAppTheme().colors`; non-component utilities may use static tokens where hooks are impossible.

Theme migration is a visual-preservation change, not a deletion pass. A component may remove a static `Colors.*` declaration only when the same render path receives an equivalent `colors.*` value through a dynamic style, a theme-aware style factory, or a shared themed primitive. Never leave text, canvas, input, border, badge, pressed, focus, destructive, loading, or selected-state colour to the React Native platform default. Migrations must be reviewed in both light and dark modes and must retain the previous hierarchy before any aesthetic refinement is accepted.

### Surface canvas modes

Choose a mode before designing a screen.

#### Media

- Use neutral white (light) / near-black (dark) canvas.
- Let imagery carry colour.
- No decorative gold by default.
- Image is the card; avoid visible frames.

#### Premium-commerce

- Use warm off-white (light) / warm near-black (dark) canvas.
- Optional contextual champagne/bronze accent for authenticated value, premium ownership, verified status or curated distinction.
- Reserved for: co-own asset detail, authenticated resale, verified seller storefront, auction featured lot, ownership certificate.

#### Utility

- Use neutral white (light) / near-black (dark) canvas.
- No decorative luxury accent.
- Quality comes from geometry, typography, state clarity and interaction.
- Used for: settings, account forms, help, privacy, notifications preferences.

### Colour hierarchy

- `background`: root screen canvas.
- `surface`: grouped content or loading placeholder.
- `surfaceAlt`: nested or alternating tier; use sparingly.
- `surfaceElevated`: sheets, dialogs and materially elevated content.
- `brand`: high-confidence primary action, not general decoration.
- `danger`, `success`, `warning`: semantic truth only.
- proposed `commerceTrust`: protection/verification only.
- proposed `social` and `discovery`: selected action states only.
- proposed `coownUp` / `coownDown`: financial truth only.

### Rules

1. **Imagery carries colour on media surfaces.** The UI should not compete with user content.
2. **Canvas warmth is contextual, not global.** Warm premium surfaces are allowed where materiality or authenticated value matters; media and utility surfaces may remain neutral.
3. **One dominant accent family per visual cluster.** Semantic state colours do not count as decoration.
4. **No generic blue-purple web gradients.** Use only verified static exports from `theme/gradients.ts` (`Gradients`, `Glass`, `Glow`) or the reactive `useGradients()` hook, or add a focused token if a new gradient is required.
5. **Editable fields must look editable.** Use `colors.input` or transparent backgrounds with clear borders/focus states; never flat mid-grey blocks that read as disabled.
6. **Gold is never a substitute for hierarchy.** A screen may be flagship with zero gold.
7. **No hardcoded target colours.** Proposed tokens require ThemeContext migration first.
8. **Status colours must be truthful and accessible.** Never use green/red/gold merely to decorate.
9. **Contrast overrides mood.** A subtle accent that cannot be perceived or read is not premium.

### Dark mode

Dark mode must be designed, not obtained by mechanical inversion.

- Media surfaces: near-black neutral allows content colour to dominate.
- Premium-commerce surfaces: warm near-black may be used selectively.
- Utility surfaces: stable neutral dark hierarchy.
- Elevated surfaces must remain distinguishable without relying only on shadow.
- Disabled text must remain readable.
- Gold/champagne may be more visible in dark mode but must still be contextual.

## Luxury Accent System

Luxury in ThryftVerse comes first from photography, composition, typography, interaction precision, trust and scarcity of decoration. Champagne/antique-gold accents are a signature note, not the foundation of every screen.

### Implementation status

The luxury tokens in the YAML front matter are **proposed**. They are not yet verified in the current runtime `ThemeContext.tsx`. Before any production component uses them:

1. add every required key to `ThemeColors`;
2. define both `LIGHT_COLORS` and `DARK_COLORS` values;
3. update theme tests and design-token linting;
4. migrate one focused surface at a time;
5. visually validate light/dark mode.

### Accessible roles

- `champagne`: surface wash, hero warmth, decorative hairline; never normal light-mode body text.
- `antiqueGold`: icon/accent on dark premium surfaces, large decorative accent, selected premium state.
- `bronze`: accessible light-mode premium text/icon and focus role.
- `luxuryOnAccent`: dark text on champagne/antique-gold fills.
- `luxuryFocusLight`: accessible focus/selection border in light mode.
- `luxuryFocusDark`: focus/selection border in dark mode.
- translucent gold borders/glows: supporting depth only; never the sole focus or selected-state signal.

### Allowed usage

Gold/champagne is allowed when it communicates a real concept:

- authenticated or verified premium value;
- ownership/certificate status;
- premium seller or curated shop distinction;
- selected premium asset/auction/co-own state;
- a curated editorial distinction on a premium-commerce surface;
- a focused premium field when the focus token passes contrast requirements.

### Forbidden usage

- Settings rows, generic forms, normal navigation or standard dividers;
- every icon, card, chip or CTA;
- disabled state;
- fake verification/authenticity;
- more than one strong luxury accent in the same local cluster;
- white text on antique-gold fills without verified contrast;
- bright yellow gold such as `#FFD700`.

### Luxury quality test

A premium surface fails when its perceived value depends only on gold, radius or shadow. Remove the accent temporarily. The screen should still feel authored through media, hierarchy, spacing, typography, trust and interaction. Restore the accent only if it communicates a meaningful premium state.

A flagship screen may use no gold at all.

## Typography

Typography uses **Inter** (loaded via Expo Google Fonts) as the unified font family across iOS and Android. This ensures visual consistency and avoids platform font-rendering discrepancies. The source of truth is `frontend/src/theme/designTokens.ts` — use `FontFamily`, `Type`, `FontSize`, and `TypeStyles` tokens; never hardcode font families or arbitrary sizes.

- **Font family:** Inter (light, regular, medium, semibold, bold, extrabold) via `FontFamily` token.
- **React Native:** map through existing `Typography` / `TypeStyles` / `Type` tokens; do not hardcode arbitrary sizes.
- **Financial values:** use `mono-tabular` role (platform monospace) for prices, portfolio values, deltas, units, and ledger values in Co-Own / auction surfaces.

### Type scale

Use only these semantic roles unless the screen has a justified exception:

- **Display:** auth hero, empty state titles, 32/38, bold.
- **Title:** hero titles, screen headers, profile names, 24/32, bold.
- **Subtitle:** section titles, card headers, product names, 17/24, semibold.
- **Body:** normal readable text, descriptions, general content, 14/20, regular.
- **Body strong:** strong body, picker values, emphasized descriptions, 15/21, semibold.
- **Price list:** prices in lists, totals, 20/24, bold.
- **Price large:** hero prices, checkout totals, 28/32, bold.
- **Caption:** captions, metadata, timestamps, hints, 12/16, regular.
- **Caption elevated:** metadata, timestamps, hints (elevated), 13/18, regular.
- **Label:** small metadata, seller handles, badges, section headers, 11/14, semibold.
- **Mono tabular:** prices, portfolio values, deltas, units, ledger values — use platform monospace.

### Typography rules

1. Do not use more than three type sizes in one component.
2. Prices must dominate product/commerce summaries.
3. Captions must remain readable; avoid 10–11px unless legally required.
4. Avoid bureaucratic uppercase labels in profile/account forms.
5. Section headers must be quieter than content.
6. If everything is bold, nothing is important.

## Layout

ThryftVerse uses the verified `Space` scale from `frontend/src/theme/designTokens.ts`: 4 / 8 / 16 / 24 / 32 / 48. Treat it as a rhythm system, not a demand that every coordinate be a multiple of eight. Optical corrections of 1–4pt are allowed when they improve perceived alignment.

### Structural rails

- Standard screen horizontal rail: 16pt.
- Dense media/discovery gutter: 8pt.
- Full-bleed media may intentionally break the standard rail.
- Within-group spacing: usually 8–16pt.
- Between-group spacing: usually 24pt.
- Major composition break: 32–48pt, only when earned.

### Sticky dock geometry

Use `DockConstants` from `theme/designTokens.ts`. Compute scroll clearance from the actual dock variant and safe-area inset; never guess with arbitrary spacer Views.

- `baseHeight`: 72pt.
- `singleActionHeight`: 96pt.
- `dualActionHeight`: 132pt.
- `stackedActionHeight`: 180pt.

### Native safe-area contract

Every screen must respect top and bottom safe areas, keyboard geometry and system navigation.

- Sticky docks never cover the last scroll item.
- Bottom sheets include safe-area bottom padding.
- Headers do not collide with Dynamic Island/status bar.
- Android system Back must match visible hierarchy.
- Keyboard transitions must keep the focused field/composer visible.

### Responsive breakpoints and density

The product must be visually validated at:

- compact phone: 320–359pt width;
- standard phone: 360–399pt;
- large phone: 400–479pt;
- tablet/foldable: 600pt+ content width.

Rules:

- Do not shrink touch targets below 44pt on compact devices.
- Prefer hiding or moving low-priority header actions over compressing them.
- Two-column masonry remains two columns on phones; tablet may use three or four based on minimum card width.
- Profile archives use three columns on phones only when text is not required inside tiles.
- Text scaling must not force price/title overlap.

### First viewport rule

The first viewport must answer:

1. Where am I?
2. What object or task matters most?
3. What can I do now?
4. What trust/state information do I need?

Reject any first viewport dominated by a low-value hero, repeated titles, generic cards, blank loading blocks or decoration.

### Media-first geometry

- Feed media: usually 4:5, 3:4 or native aspect.
- Discovery masonry: true image aspect ratio.
- Profile storefront/archive: support taller 3:4 thumbnails and curated arrangement; square only when product comparison benefits.
- Product hero: natural or 4:5 with focal protection.
- Collection/board covers: authored mosaics or strong single-media cover, not generic card shells.

## Elevation & Depth

Elevation is not decoration. Use depth only to clarify hierarchy, touchability, or modal separation. The source of truth is `Elevation` in `theme/designTokens.ts`.

### Elevation scale

- **`Elevation.none`:** flat elements, no shadow.
- **`Elevation.subtle`:** cards, small elements — soft 2px offset, 0.06 opacity, 8px radius.
- **`Elevation.card`:** elevated cards, buttons — 4px offset, 0.08 opacity, 12px radius.
- **`Elevation.floating`:** FABs, overlays — 8px offset, 0.12 opacity, 16px radius.
- **`Elevation.modal`:** bottom sheets, dialogs — 16px offset, 0.18 opacity, 24px radius.

### Preferred elevation

- Border + subtle background for grouped settings rows.
- Media scrim for text over image.
- Sticky dock shadow only when it separates persistent action from scroll content.
- Bottom sheet backdrop for temporary tasks.
- Tiny active tab underline rather than thick pill backgrounds.

### Avoid

- shadows on every card;
- cards inside cards;
- excessive glass blur on non-modal surfaces — glass is reserved for sticky bars, bottom sheets, and media overlays only;
- oversized gradients;
- floating bubbles that block content;
- decorative badges without function;
- heavy grey form blocks that look disabled.

### Motion

Motion should be restrained and native. The source of truth is `Duration` in `theme/designTokens.ts`.

### Motion duration scale

- **`Duration.instant` (0ms):** immediate, no animation.
- **`Duration.fast` (150ms):** quick feedback — button press, toggle.
- **`Duration.normal` (250ms):** standard transitions — segment switch, sheet slide.
- **`Duration.slow` (400ms):** emphasis animations — content crossfade.
- **`Duration.slower` (600ms):** hero/page transitions.

### Motion patterns

- press scale: `0.97–0.985`;
- media crossfade on image load;
- shared image transition for card → product/detail where available;
- haptic light for navigation/selection;
- haptic medium for purchase/bid/offer/send;
- haptic success for completed purchase/win/publish.

Respect reduced motion. Do not bounce, pulse continuously, or animate the whole page.

## Shapes

Rounded corners should support the object type. Use the `Radius` tokens from `theme/designTokens.ts`.

- **`Radius.none` (0px):** images (full-bleed), sharp edges.
- **`Radius.sm` (4px):** hairline tags, tiny chips, internal controls, buttons, inputs.
- **`Radius.md` (8px):** compact thumbnails and tiny media, small cards, chips, badges.
- **`Radius.lg` (12px):** standard product/discovery cards, modals, sheets, medium cards.
- **`Radius.xl` (16px):** form fields, settings groups, bottom sheets, large cards.
- **`Radius.full` (999px):** avatars, pill buttons, story rings, floating buttons, tags.

### Shape rules

1. Media cards should use 12–16px radius, not cartoon blobs.
2. Buttons can be full-pill when primary or high-tap-frequency.
3. Text fields should be rounded but not oversized.
4. Do not use the same radius for everything.
5. Do not put rounded containers around every element.

## Components

This section defines implementation blueprints. Agents should map these to existing React Native components and tokens, not invent new one-off patterns.

### Component A — Infinite vertical feed

Use for Instagram/Depop-style feeds.

**Structure**

- Fixed/native header: logo/title left, notification or message affordance right. Header chrome must be lighter than media.
- Story rail (optional): horizontal scroll of story avatars, 64pt rings, 8px spacing, seen/unseen ring states.
- Post/listing unit:
  - avatar `36–40px`, username, optional seller/trust chip, three-dot menu;
  - media area in `4:5`, `3:4`, or natural aspect; square only when intentional;
  - double-tap like for media — heart animation 80–120pt, spring scale, haptic medium;
  - action row: like, comment/message, share, save/bookmark — fixed left-to-right order, 44pt hit areas, 24pt icons, 8px spacing;
  - caption/trust/price summary; truncate long captions at 2–3 lines; username bold inline; price on separate line if listing.

**Rules**

- One post/listing should own at least 70% of the viewport.
- Media must load with crossfade (`Duration.normal`) and skeleton/placeholder parity (same aspect ratio).
- Action feedback must be instant and optimistic only when persistence is real or recoverable.
- Like icon: outline → filled `colors.danger` or `accent-social`, spring scale 1.2 → 1.0 over `Duration.fast`.
- Story ring: 3px gradient border (`accent-social` → `colors.brand`), seen state = `colors.border` 2px ring. Story label below in `Type.caption`.
- Do not show raw IDs, internal state, or backend error messages.
- Media fade-in on load, never pop.

### Component B — Pinterest masonry board

Use for Explore, discovery, similar items, boards, collections, saved surfaces and visual-search results.

**Current benchmark principle:** Pinterest-like quality comes from a neutral canvas, vivid media, true image proportions, relevance, modular discovery, boards/collages, visual re-rooting and fast visual completion—not from beige backgrounds or mandatory gold decoration.

### Structure

- Search/visual-search entry that becomes a committed search mode.
- Lightweight topic/category rail; selected state clear but visually subordinate to media.
- Two-column staggered grid on phones using real `width / height` or `aspectRatio` data.
- 8pt gutters.
- Image radius usually 12–16pt; 8pt remains acceptable only for unusually dense/compact modules.
- Image itself is the card; avoid visible frames around every image.
- Product discovery may show one-line title and compact price below media.
- Pure inspiration/Looks boards may omit metadata until closeup.
- Board/collage modules use authored image composition rather than generic icon cards.

### Adaptive discovery modules

The feed may blend:

- visual topic hero;
- featured collection or board;
- creator/seller spotlight;
- recently viewed continuation;
- style cluster;
- collage;
- visual-similarity rail;
- new items from followed sellers;
- server-driven campaign or sponsored placement.

Modules are data-driven and context-sensitive. Do **not** insert them at a fixed item interval when they damage relevance or masonry rhythm.

### Interaction

- Tap opens a closeup/product surface with a visually similar continuation below.
- Save is immediate and truthful.
- Long press may open a conventional quick-action sheet or an experimental radial interaction behind a feature flag.
- "See similar" and "Not interested" should feed ranking when backend support exists.
- Visual-search camera action belongs in the search affordance when the route is functional.

### Performance

- Skeleton geometry matches final aspect ratios.
- Above-fold media decodes without layout shift.
- Prefetch the next likely images within a controlled memory budget.
- No arbitrary aspect ratio derived from item ID/hash.
- The surface defines and measures `Visually Complete`.

### Experimental enhancements

The following are optional experiments, not mandatory Pinterest requirements:

- fly-to-board save animation;
- radial long-press wheel;
- double-width editorial tiles;
- animated collages;
- AI-assisted background extension.

Ship only behind a feature flag, with reduced-motion fallback, screen-reader alternative and mid-range Android performance validation.

### Component C — Profile page / seller storefront

Use for `MyProfile`, `UserProfile`, closet, storefront and creator/seller identity surfaces.

### Identity composition

- Cover/media zone exists only on the actual profile surface.
- Cover height adapts to device and content, usually 160–220pt.
- Use `expo-image` `contentFit="cover"` or the wrapper's equivalent; preserve focal points.
- Avatar 80–96pt, overlapping the cover with a clean background seam.
- Display name, handle, verified/trust signals and concise commerce/social proof.
- Bio max three lines before expansion.
- Primary/secondary actions remain stable across own/other-user states.

### Storefront merchandising

A seller profile is a controllable storefront, not a chronological dump.

- pin 3–6 priority listings/Looks when backend/order persistence supports it;
- support manual profile-grid rearrangement for the current user when persistence is real;
- support taller 3:4 thumbnails and crop-position preservation;
- include a curated shop-window rail for sellers who use it;
- provide shop policies, shipping expectations and away status without burying listings;
- allow previewing the storefront arrangement before publishing if rearrangement is implemented.

Do not expose rearrangement/pinning controls unless the order persists server-side or through a truthful documented local model.

### Grid and tabs

- Profile archive/storefront grid: three columns on phone, preferably 3:4 thumbnails for media identity; square allowed for dense product comparison.
- Looks may use masonry or authored rails.
- Tabs: Listings / Looks / About / Reviews only when the underlying content exists.
- Tab transition may crossfade or directionally slide; reduced motion uses instant/fade.

### Trust and actions

- Real seller stats only: sales, rating, response/dispatch signal.
- Real badges only.
- Follow/Edit, Message and Shop/Share actions keep predictable order.
- Trust/policy details must be accessible before deep scrolling, but they must not crowd out media.

### Media editing ownership

Cover/avatar editing belongs on `MyProfile`/profile media controls, never in the compact Edit Profile form.

### Component D — Edit Profile / profile account form

Use for editing current user public text fields, private details, security and account entrypoints.

**Structure**

- Header with Back/Close, title `Edit profile`, top-right Done/Save.
- Compact identity row with small avatar/name/handle; read-only media hint only.
- Public fields: Name, Username, About/Bio, Website.
- Private details: read-only email, status, phone if supported, country/region if supported.
- Security: Password, Two-factor authentication.
- Account: Account Control.

**Must not include**

- cover hero;
- avatar camera;
- cover camera;
- `Add a cover photo` block;
- media upload state;
- giant bottom Save CTA.

**Quality bar**

Name and Username must be visible in the first viewport. Form fields must feel like active premium inputs, not disabled grey rectangles.

### Component E — Product detail / commerce page

Use for `ItemDetail` and premium commerce detail surfaces.

### Structure

- Media gallery first: swipeable, natural/4:5 aspect, stable pagination, full-screen viewer.
- Price and title appear immediately after or over the media depending on layout.
- Seller identity/trust follows compactly.
- Buyer protection, shipping and returns are presented before payment confirmation; they do not all need to physically fit above the first scroll fold if that would crush media.
- Sticky Offer / Buy now dock where both capabilities exist.
- Product facts use compact groups, not a dashboard of chips.
- Visual-similarity continuation and Seen in Looks below core decision information.

### Rules

- Media remains the product.
- The first viewport must contain media plus either price/action or a clear path to them; the sticky action dock may supply the primary action.
- Trust information must appear before the irreversible payment step.
- Do not fabricate authentication, watchers, scarcity, price history or video support.
- Sold/unavailable keeps the listing referenceable but disables commerce truthfully.
- Use restrained placeholders and exact image failure states.
- Numeric checkout/order summaries align tabularly.

### Component F — Messaging / transaction chat

Use for Inbox, Chat, New Message, Group Info, bots, quick replies.

**Structure**

- Inbox: search, tabs, useful empty/error states, settings entrypoint.
- Chat: compact top bar, bubbles, listing/order cards, composer, attachment actions.
- Group Info: identity, members, shared media, bots, quick replies, safe danger zone.

**Rules**

- Keyboard must never cover composer.
- Attachments must be truthful: image/video/file only if supported.
- Backend-blocked actions must not create ghost local conversations.
- Commerce state cards should be structured and trusted, not plain text.

### Component G — Auction / co-own financial surfaces

Use for AuctionHome, AuctionDetail, bids, Co-Own asset detail, portfolio, trade.

**Structure**

- Strong asset/media identity.
- Numeric values use tabular/mono style.
- Risk/trust disclosures placed before irreversible actions.
- Sticky bid/trade dock with safe-area clearance.
- Empty order books/ledgers have honest next steps.

**Rules**

- Financial UI must be truthful and legible.
- No fake price charts, no fabricated liquidity, no speculative performance metrics.
- Trading actions require clear confirmation and haptics.

## Component Micro Specs

These specs define the exact token-level details that separate a functional component from a flagship component. Agents must follow these when implementing or upgrading any component listed below.

### Product card micro spec

- Image radius: usually `Radius.lg` (12pt); `Radius.xl` for editorial cards.
- Background while loading: current canvas `colors.surface`, with exact aspect-ratio parity.
- Image aspect: real/native in discovery; 4:5 or 3:4 in feed; 3:4 or square in profile archive by surface intent.
- Two-column discovery title: `Type.body` or `Type.captionElevated`, max 1–2 lines.
- Two-column discovery price: `Type.bodyEmphasis`; do **not** force 20pt `Type.priceList` into every compact card.
- List/ledger card price: `Type.priceList` when comparison/totals require dominance.
- Seller/meta: `Type.captionElevated`, `colors.textSecondary`.
- Heart/save: 44pt hit area, 22–24pt icon, consistent pressed state.
- Metadata: no more than three decision-relevant facts.
- Never expose UUIDs, internal IDs or raw backend timestamps.
- Card → PDP transition must preserve the user's visual anchor where technically safe.

### Settings row micro spec

- Min height: 56–64pt.
- Icon area: 44pt square, icon 22–24pt, `colors.textSecondary` or `colors.brand`.
- Title: `Type.bodyEmphasis` (15/21/600), `colors.textPrimary`.
- Subtitle: `Type.captionElevated` (13/18/400), `colors.textSecondary`.
- Right value: `flexShrink: 1`, `textAlign: 'right'`, `colors.textSecondary`.
- Chevron: 16–20pt, `colors.textMuted`, never overlaps the right value — minimum 8px gap.
- Row press feedback: `colors.rowPressed` background or 0.97 scale.
- Destructive rows: `colors.danger` text, separated by a section break or grouped at bottom.
- Disabled rows: 0.4 opacity on entire row, not just text.

### Form field micro spec

- Height: 48–56pt single-line; multiline bio 80–104pt.
- Background: `colors.input` or transparent — never `colors.surface` (looks disabled).
- Border: 1px `colors.border` default; 2px `colors.brand` on focus.
- Label: `Type.captionElevated` or `Type.metaElevated`, `colors.textSecondary`, above the field.
- Helper text: `Type.captionElevated`, `colors.textMuted`, below the field, calm tone.
- Error text: `Type.captionElevated`, `colors.danger`, below the field, replaces helper on error.
- Placeholder: `colors.textMuted`, not `colors.textSecondary` (must be clearly placeholder).
- Focus state: border colour transition `Duration.fast`, subtle brand glow optional.
- Read-only fields: no border, `colors.textMuted` text, small lock or info icon — must not look like a disabled input.
- Keyboard must never cover the active field — use `KeyboardAwareScrollView`.

### Profile / storefront header micro spec

- Cover: full-width, 180–220pt height, `contentFit="cover"` / the active image wrapper's equivalent with category-safe focal positioning.
- Avatar: 80–96pt, circular, overlapping cover by 40–50%, 3px `colors.background` border ring.
- Display name: `Type.title` (24/32/700), `colors.textPrimary`.
- Handle: `Type.captionElevated`, `colors.textSecondary`, `@` prefix.
- Trust badges: 16–20pt icons, single row, max 4, only if the trust signal is real.
- Seller stats: `Type.captionElevated`, compact row (e.g. "124 sales · 4.9★ · 98% response").
- Bio: `Type.body`, max 3 lines, website as tappable link in `colors.brand`.
- Primary CTA: full-pill, 44–52pt height, `colors.brand` background. Follow / Edit profile / Shop.
- Secondary CTA: quiet button, 44pt, transparent background. Message / Share.
- Tab bar: segmented control, 3–4 tabs, active indicator 2–3px underline in `colors.brand`.
- Pinned shop window (optional): horizontal rail of 3–6 curated items, 120–140pt cards, `Radius.lg`.

### Masonry / discovery card micro spec

- Two columns on phones; tablet/foldable columns derive from minimum card width and available content width.
- 8pt row/column gutters.
- Image radius: usually 12–16pt; 8pt is allowed only for dense compact modules with a clear reason.
- Use server/media dimensions. Fallback to 4:5 only when dimensions are unavailable.
- Never derive height from item ID/hash/random render values.
- The image is the card. Avoid visible frames around every pin.
- Product text below image: compact title + price; pure inspiration can omit text.
- Overlay controls remain minimal and do not cover the product's focal region.
- Skeleton matches exact final geometry; no layout shift.
- Board card: authored collage/mosaic with meaningful cover hierarchy.
- Editorial/featured modules are adaptive, not inserted at fixed intervals.
- Luxury accent is optional and reserved for genuinely curated/premium-commerce distinction.

### Feed post / listing unit micro spec

- Avatar: 36–40pt; hit target around identity/action remains at least 44pt.
- Username: `Type.bodyEmphasis`.
- Three-dot menu: 44pt hit target.
- Media: 4:5, 3:4 or native vertical ratio; use `contentFit="cover"`/wrapper equivalent only with safe focal behaviour.
- Action order is stable within a content type: like → comment/message → share; save aligned to trailing edge.
- Icons 22–24pt inside 44pt hit areas.
- Like/save feedback is immediate and recoverable.
- Double-tap heart animation is visible but short; reduced motion uses a simple fade/filled state.
- Caption max 2–3 lines before expansion.
- Story Rings clearly distinguish seen/unseen; use only runtime-available colours until social tokens are added.
- Header may contain more than one action when hierarchy remains clear; avoid arbitrary "logo + one icon only" rules.

### Sticky action dock micro spec

- Background: `colors.background` or `colors.glassBg` with `colors.glassBorder` top border.
- Height: `DockConstants.baseHeight` (72px) minimum, expands with content.
- Button height: 48–52pt, full-pill `Radius.full` for primary, `Radius.xl` for secondary.
- Twin CTA: equal width or 40/60 split (primary wider). 8px gap between.
- Shadow: `Elevation.floating` to separate from scroll content.
- Safe area: bottom padding = `insets.bottom` + content padding. Never overlap home indicator.
- Scroll bottom padding: `DockConstants.singleActionHeight` / `dualActionHeight` / `stackedActionHeight` depending on dock variant.
- Disabled state: 0.4 opacity on primary button, not on entire dock.

### Trust / commerce card micro spec

- Buyer protection strip: `colors.surface` background, `Radius.lg`, shield icon 20pt, `Type.captionElevated` text, placed above the action dock. Optional 1px `goldBorderLight` / `goldBorderDark` accent on the shield icon for premium trust surfaces (after token migration).
- Seller verification badge: 16–20pt icon, `colors.success` or `commerce-trust` colour, inline with seller name. **Premium / verified seller** badge may use `antiqueGold` / `champagne` icon with `softGoldSurfaceLight` / `softGoldSurfaceDark` background after token migration — see "Premium badge micro spec" below.
- Shipping / returns card: `colors.surface` background, `Radius.lg`, icon + label rows, `Type.body` title + `Type.captionElevated` value.
- Order timeline: vertical stepper, 20pt dots, `colors.brand` for completed, `colors.textMuted` for pending, `Type.captionElevated` labels.
- Authenticity badge: full-pill `Radius.full`, `colors.success` background, white text `Type.meta`, only if authentication is real. Premium authenticity (authenticated resale, co-own certificate) may use `antiqueGold` background with `luxuryOnAccent` text after token migration.
- Checkout summary: `Type.priceList` for line items, `Type.priceLarge` for total, right-aligned, tabular alignment for numbers.
- Trust copy: max 1–2 lines per element. No paragraphs. No legal blocks in the main flow.
- Error / dispute state: `colors.danger` icon, `Type.body` message in user-safe language, action button to resolve.

### Premium badge / trust badge micro spec

- Height: 24–28pt.
- Radius: `Radius.full`.
- Only render for backend-confirmed premium/verified/authenticated status.
- Current runtime fallback: neutral surface + border + accessible text/icon.
- After token migration: subtle gold wash/border may be used, with bronze/antique-gold icon and `colors.textPrimary` label.
- Never use translucent gold as the sole selected/focus signal.
- Max one premium badge cluster per row.
- No solid antique-gold fill with white text unless contrast has been measured and passed. Use `luxuryOnAccent` for text on gold fills.

### Premium profile accent micro spec

- A flagship profile may have **zero gold** when media, hierarchy and storefront composition already provide identity.
- Verified/premium sellers may receive a restrained hairline/accent after ThemeContext migration.
- Selected tab underline normally uses `colors.brand`; premium accent is optional only on premium-commerce/profile modules.
- Curated module titles may use a short accent rule, but never repeat it under every heading.
- CTAs remain `colors.brand` unless a specific authenticated ownership/certificate action warrants a premium fill.
- Settings, Edit Profile and routine account screens do not receive decorative luxury accents.

## Do's and Don'ts

### Do

- Select the correct canvas mode before styling.
- Edit canonical production `.tsx` screens/components.
- Preserve real functionality, navigation and data contracts.
- Make the first viewport useful.
- Let media dominate media surfaces.
- Use true media dimensions and focal-aware rendering.
- Use `useAppTheme().colors` in React components.
- Use keyboard-controller primitives (`KeyboardAwareScrollView`, `KeyboardStickyView`) from `platform/keyboard/KeyboardProvider` for form/composer geometry.
- Design loading, empty, error, offline, partial and permission states.
- Measure perceived performance, not only JS/network completion.
- Report visual QA honestly.

### Don't

- Do not globally beige/gold-theme the app.
- Do not require a gold accent on every premium-looking screen.
- Do not use gold, radius or shadow as a substitute for composition.
- Do not create duplicate profile/private/account editors.
- Do not add low-value heroes.
- Do not use disabled-looking editable fields.
- Do not expose fake/unsupported controls.
- Do not display raw backend/network errors.
- Do not hardcode proposed tokens.
- Do not invent icon styles; use Ionicons/project mappings consistently.
- Do not derive masonry geometry from IDs or random values.
- Do not insert editorial modules at a fixed interval without relevance.
- Do not make experimental animations mandatory across the app.
- Do not alter product truth through image enhancement.


## Perceived Performance & Visual Completion

Flagship quality includes how quickly a surface becomes visually trustworthy. Network success is not the same as visual completion.

### Definitions

- **First meaningful media:** first above-fold product/photo/video is decoded and stable.
- **Interactive ready:** core navigation/actions respond.
- **Visually Complete:** all critical above-fold media, text and controls for the surface are visible in their final geometry; remaining below-fold work may continue.
- **Layout shift:** any visible movement caused by missing dimensions or late content.

### Surface contracts

#### Home / Explore

Visually Complete when:

- header/search controls are interactive;
- above-fold media is decoded or represented by matching skeletons;
- visible text/meta has final geometry;
- visible video is playing or has a stable poster;
- no masonry card jumps position.

#### Product Detail

Visually Complete when:

- hero media or exact-size skeleton is visible;
- price/title/action dock is stable;
- seller/trust area is visible or represented by parity skeletons.

#### Profile

Visually Complete when:

- cover/avatar/identity is stable;
- tabs are interactive;
- first visible media row is decoded or parity-skeletoned.

#### Chat

Visually Complete when:

- recent messages are visible;
- composer is interactive;
- keyboard transition geometry is stable.

### Measure and report

- time to first meaningful media;
- time to interactive ready;
- time to visually complete;
- dropped frames during initial interaction;
- image decode/failure rate;
- layout shift count;
- interaction response latency.

A screen with fast API response but slow/unstable visual completion is not flagship.

## Media Quality & Art Direction Pipeline

Media quality is a product system, not a card style.

### Required metadata

Where available, preserve:

- width, height and aspect ratio;
- focal point/crop position;
- media type and poster frame;
- dominant/placeholder colour;
- quality/resolution flags;
- orientation.

### Allowed treatment

- focal-point-preserving crops;
- category-aware containment for shoes, bags, jewellery and full garment silhouettes;
- non-destructive exposure/contrast normalization;
- low-resolution warnings;
- duplicate detection;
- stable poster-frame selection;
- disclosed background extension/outpainting when it preserves product truth and is feature-gated.

### Forbidden treatment

- materially changing product colour;
- hiding damage or authenticity-relevant details;
- changing garment shape/silhouette;
- fabricating labels, texture, context or condition;
- presenting AI-generated context as the seller's original photograph without disclosure.

### Failure treatment

- stable aspect-ratio placeholder;
- retry where useful;
- no broken-image browser icon;
- no collapsing layout;
- user-safe copy.

## Visual Search Architecture

Visual search is a first-class discovery capability when the backend/search pipeline is functional.

### Entry

- Camera/image icon inside or adjacent to the search bar.
- Capture and upload paths.
- Permission-denied explanation with Settings action.
- Clear preview and retake/replace.

### Results composition

Results may group:

1. closest visual matches;
2. style-similar items;
3. same brand/category candidates;
4. shoppable Looks/outfits;
5. suggested filter refinements;
6. save-search/alert action when supported.

### Rules

- Explain the active visual query with the thumbnail visible.
- Do not claim exact match confidence without real model output.
- Keep text filters editable after image search.
- Allow returning to the original visual query.
- Use masonry/natural aspect ratios and visual re-rooting.
- Track zero-result recovery and result relevance.

## Iconography & Optical Alignment

- Use Ionicons/project mappings; never mix icon families casually.
- Standard inline icon: 20–24pt.
- Header/action hit target: 44pt even when visual glyph is smaller.
- Align icons optically, not only by bounding box.
- Keep stroke/fill state grammar stable.
- Do not place icons inside decorative circles unless the circle communicates touchability, status or media contrast.
- Chevrons remain quieter than row values and never collide with them.

## ThryftVerse Differentiation Gate

A screen can match reference quality and still fail ThryftVerse.

A flagship ThryftVerse surface must express at least one relevant product advantage through hierarchy—not decoration:

- social identity connected directly to commerce;
- visual discovery that continues into Looks, collections or similar items;
- seller storefront control;
- trustworthy transaction state;
- auction urgency;
- co-own ownership/market truth;
- messaging as a transaction surface.

The differentiator must be functional and data-backed. Do not add brand ornament to fake uniqueness.

## Agent Workflow

### Mandatory preflight

Before editing:

```bash
pwd
git rev-parse --show-toplevel
git remote -v
git branch --show-current
git rev-parse HEAD
git status --short
```

Report:

```text
Workspace root:
Git root:
Remote:
Branch:
HEAD:
DESIGN.md path:
AGENTS.md path:
Execution mode:
```

### Screen research route

For every UI task, inspect:

```text
route → screen → component tree → state/hooks → services/API → store → navigation → tests
```

Answer before editing:

- What is the user trying to do?
- What is the first viewport?
- What is duplicated?
- What feels generic/prototype-level?
- What is the primary action?
- What state transitions exist?
- What backend capability is real?
- What should be removed, moved, merged, or elevated?

### Reference application mapping

Every UI pass must name the reference logic being applied:

```text
Instagram = media ownership, action grammar, stories, restrained chrome
Pinterest = masonry, boards, visual search, save behaviour, no dead ends
Depop = social closet identity, compact edit-profile form, seller storefront energy
Vinted = trust/transaction clarity, low-friction listing, practical settings
Vestiaire = premium declutter, trust hierarchy, density discipline
TikTok = profile as storefront, maximum media density, minimal chrome
Whatnot = live/auction urgency, chat + bid loop
```

### No-vision agent rule

If the coding model cannot see screenshots:

- It must not visually judge screenshots.
- It must not claim `Visual QA: passed`.
- It may capture screenshots for the user.
- It must wait for user visual feedback.

Allowed status:

```text
Visual QA: pending user review
```

### Render loop

```text
User visual defect → agent patches .tsx → static validation → user visual audit → exact defect list → agent patches again
```

Do not substitute ADB poking for design implementation.

## Native Platform Contract

### iOS

- Respect safe areas, Dynamic Island, home indicator, native sheet hierarchy and expected Back/Close semantics.
- Use Inter through project tokens; do not imitate SF Pro metrics blindly.
- Prefer clarity, deference and depth: content leads, chrome recedes.

### Android

- Respect system Back, keyboard resize, status/navigation bars and minimum touch targets.
- Preserve Material interaction clarity without turning the brand into generic Material You colour noise.
- Validate on mid-range Android, not only a flagship emulator.

### Shared React Native contract

- Touch targets: 44pt minimum practical target.
- Images: use `expo-image`/project image wrappers; prefer `contentFit` for `expo-image`, `resizeMode` only where the actual component uses it.
- Video: use `expo-video`; expose only real supported flows.
- Lists: `FlashList`/`FlatList` with stable keys and measured/estimated geometry as appropriate.
- Keyboard: use `KeyboardAwareScrollView` and `KeyboardStickyView` from `platform/keyboard/KeyboardProvider` (re-exports `react-native-keyboard-controller`); use any higher-level keyboard wrappers only after verifying them on the active branch.
- Animation: Reanimated with reduced-motion behaviour.
- Haptics: selection/light for low-risk interaction, medium for bid/buy/offer/send commitment, success for real completion.
- Gradients/glass: use verified static `Gradients`, `Glass` and `Glow` exports from `theme/gradients.ts`, or the reactive `useGradients()` hook (verified at gradients.ts:85).
- Icons: Ionicons or an existing mapped project icon family.
- Fonts: Inter through `FontFamily`/`Type`/`TypeStyles`.

## Department Standards

### Profile and Settings

- Top Settings identity card is the single profile/account gateway.
- Edit Profile is a compact public/private/security/account form, not a media hero.
- Profile is the media storefront and owns avatar/cover editing.
- AccountSettings is compatibility-only, not a competing editor.
- Seller profile supports curation/pinning/rearrangement only when persistence is real.
- Utility surfaces remain neutral; premium accent is not required.

### Discovery and Home

- Explore defaults to visual discovery; search becomes a committed mode.
- Search bar includes visual-search camera action only when the route works.
- Discovery uses true aspect ratios, low chrome and adaptive modules.
- Boards/collections are identity/discovery objects, not private folders only.
- "More like this" re-roots browsing rather than dead-ending.
- The feed defines Visually Complete and avoids layout shift.

### Product Detail

- Media first.
- Price/action/trust visible early.
- Seller trust and buyer protection belong before payment.
- More-like-this should feel visual, not a generic rail.
- Missing/unavailable/sold states must be designed.

### Sell and Create

- Camera/photo-first.
- One decision per viewport.
- Draft persistence is visible and recoverable.
- Publish failure is recoverable.
- Unsupported video/file flows must not be exposed as working.

### Messaging

- Inbox errors are user-safe, not raw backend exceptions.
- Group info and danger zones respect safe area.
- New Message must not create fake local DMs.
- Bots/quick replies/files are shown only if real or honestly unavailable without dead controls.

### Auctions and Co-Own

- Auction urgency must be legible and truthful.
- Co-own financial data uses tabular figures.
- Order books and trade confirmations must be compact, safe-area aware, and risk-conscious.
- No fake market metrics.

## Prototype Smells

A screen is prototype-quality if it contains any of these:

- duplicate entrypoints for the same task;
- giant low-value hero;
- first viewport with no useful action/content;
- grey disabled-looking inputs;
- clipped buttons;
- footer covering content;
- keyboard covering input;
- raw localhost/network errors;
- repeated titles;
- too many uppercase labels;
- cards inside cards;
- random icon chips;
- action rows that only show "Coming soon";
- visual clutter hiding user media;
- generic empty states;
- tests pass but screenshot still looks bad.

Fix prototype smells before claiming completion.

## Visual Defect Severity

Use this scale to prioritise fixes and communicate urgency in reports. A screen with any P0 defect is not shippable. A screen with any P1 defect is not flagship. P2 defects should be fixed in the same pass if time permits, or logged as follow-up.

### P0 — Ship blocker

Fix immediately. The screen is broken or unsafe for users.

- Clipped CTA or action button (user cannot tap it).
- Keyboard covers input field or message composer.
- Duplicate entrypoint for the same user goal.
- Fake or unsupported action exposed as working (e.g. "Coming soon" toast, dead chevron).
- Raw backend error, status code, or network exception visible to user.
- Broken image or media with no failure state.
- Unreadable text — contrast below WCAG AA, or text smaller than 11px without legal justification.
- Footer, sticky dock, or tab bar overlaps scroll content.
- Screen crashes on load, on state change, or on a standard interaction.
- Navigation dead-end — Back button does not return to a sensible destination.

### P1 — Flagship blocker

Fix before claiming flagship quality. The screen works but is not flagship.

- Prototype-looking layout — assembled from generic parts, not authored.
- Weak first viewport — low-value hero, blank grey block, repeated title, or no useful action/content visible.
- Cards inside cards without hierarchy justification.
- Poor visual hierarchy — everything same weight, or no clear first/second/third priority.
- Generic empty state — spinner-only or "Nothing here" with no next action.
- Bad density — too sparse (wasted space) or too cramped (content fighting for room).
- Inconsistent tab or action grammar — icon order changes, tab indicator style differs from rest of app.
- Missing loading or error state for an async surface.
- Grey disabled-looking inputs on an editable form.
- Trust / buyer protection placed after payment intent instead of before.
- Seller profile that feels like a settings page instead of a storefront.
- Discovery grid with forced square crops or no next action on cards.

### P2 — Polish gap

Fix in the same pass if time permits, or log as follow-up. The screen is good but not yet 9/10.

- Minor spacing imbalance — off by 4–8px, not breaking alignment but not rhythmic.
- Weak motion — missing press scale, missing crossfade, or transition outside 150–250ms range.
- Slightly plain icon treatment — default outline icons where a custom or filled variant would be better.
- Low-delight transitions — instant tab switch where a crossfade or slide would elevate.
- Missing haptic feedback on selection, purchase, or bid actions.
- Skeleton that does not perfectly match final layout aspect ratio.
- Accessibility label missing on an icon-only control.
- Caption or metadata that could be trimmed by 1–2 words for density.
- Reduced-motion fallback not implemented for a non-critical animation.

### Severity in reports

When reporting defects, use this format:

```text
P0: <defect description> — <file:line>
P1: <defect description> — <file:line>
P2: <defect description> — <file:line>
```

A screen with unresolved P0 defects must report `PARTIAL — INTERACTION FAILURES REMAIN` or worse. A screen with unresolved P1 defects must not claim flagship quality. P2 defects may be logged as `Remaining weaknesses` in the final report.

## Acceptance Scorecard

Score every edited screen from 0–4.

### Composition

- 0: broken/clipped
- 1: assembled/generic
- 2: functional but plain
- 3: polished and coherent
- 4: authored flagship

### Hierarchy

- 0: no clear focus
- 1: everything same weight
- 2: main content visible but cluttered
- 3: clear first/second/third priority
- 4: instantly understandable at thumbnail size

### Density

- 0: unusable
- 1: empty or cramped
- 2: readable but inefficient
- 3: compact and useful
- 4: high-density without clutter

### Interaction

- 0: broken
- 1: unreliable taps/keyboard
- 2: works but basic
- 3: native and polished
- 4: delightful but restrained

### Truthfulness

- 0: fake/fabricated
- 1: misleading
- 2: mostly truthful with weak blockers
- 3: truthful states
- 4: trust is designed into the flow

### State coverage

- 0: missing
- 1: spinner-only
- 2: basic loading/error/empty
- 3: screen-specific states
- 4: states feel as designed as populated view

A screen is not flagship unless it scores at least **3 in every category** and **4 in at least two categories**.

## Reference Quality Gates

These gates are fail conditions, not aspirational guidelines. If any gate fails, the screen is not flagship — fix it before reporting completion.

### Pinterest gate (discovery / explore / boards / saved)

A discovery surface fails if:

- image proportions are fabricated or universally square without intent;
- chrome/text competes with media;
- search and browse have no clear mode transition;
- the user reaches a dead end with no save/similar/board/shop continuation;
- skeleton geometry differs from final media;
- the layout shifts when images decode;
- modules are inserted by arbitrary fixed frequency rather than relevance;
- the canvas or accent treatment overwhelms photography;
- visual search is displayed as functional when it is not.

### Instagram gate (feed / social / stories)

A feed/profile surface fails if:

- media does not clearly dominate the content unit;
- action grammar changes unpredictably;
- like/save feedback feels delayed or dishonest;
- hit targets fall below 44pt;
- Stories do not distinguish seen/unseen state;
- media pops or shifts instead of loading stably;
- profile media is forced into square thumbnails despite vertical content needs;
- current-user storefront/profile cannot support pinning/rearrangement once that capability is implemented;
- caption/chrome overpowers the media.

### TikTok gate (profile storefront / media density)

A profile or media surface **fails** if:

- the profile feels like a settings page instead of a storefront;
- media density is below 60% of the first viewport;
- chrome (headers, labels, dividers) dominates over media;
- the grid is flat with no authored rails, pinned items, or editorial modules;
- tab transitions are instant with no crossfade or slide;
- press feedback is absent on grid items.

### Depop gate (seller profile / edit profile / closet)

A seller profile or edit-profile screen **fails** if:

- it feels like a settings page, not a social closet;
- seller actions (Follow, Message, Shop, Edit) disappear or are inconsistent;
- closet / listings are a flat dump with no curation, pinned items, or shop window;
- shop policies or trust badges are missing from the profile surface;
- Edit Profile competes with Private Details, AccountSettings, or Account Control;
- the profile has no seller stats (sales, rating, response rate);
- listing cards on the profile grid look identical to discovery cards (they should be archive-scanning-optimised, not discovery-optimised);
- cover / avatar editing is exposed inside Edit Profile instead of the profile surface.


### Edit Profile gate

Edit Profile fails if:

- cover/avatar media editing appears inside it;
- AccountSettings/Private Details remains a competing editor;
- Name and Username are not visible in the first viewport on a standard phone;
- editable fields look disabled;
- Save is a giant persistent footer without a strong workflow reason;
- keyboard or footer hides Bio/Website/Phone;
- private/security/account groups feel like an unstructured settings dump;
- save/loading/error/unsaved-change behaviour is unclear.

### Performance gate

A screen fails flagship performance if:

- it has no defined Visually Complete condition;
- above-fold media layout shifts after load;
- skeletons do not match final geometry;
- initial interaction drops frames on a mid-range Android device;
- image failures collapse layout or expose raw URLs;
- expensive motion has no reduced-motion fallback;
- a decorative animation delays or blocks primary interaction.

### Vestiaire / Vinted gate (product detail / checkout / trust)

A commerce screen **fails** if:

- trust / buyer protection appears after the payment intent instead of before;
- shipping and returns information is unclear or buried below the fold;
- seller verification is not visible in the first viewport of product detail;
- price, primary action, and trust are not all visible before scrolling;
- errors expose backend language, status codes, or raw network messages;
- the checkout summary does not use tabular alignment for numbers;
- the action dock does not separate primary (Buy now) from secondary (Offer);
- sold / unavailable / missing-media states are not designed;
- authenticity or verification badges are shown when the backend does not support them.

### Whatnot gate (auction / live / co-own)

An auction or co-own screen **fails** if:

- the countdown is not legible at a glance;
- bid / trade actions do not have haptic medium and confirmation;
- the bid dock or trade dock overlaps content or the home indicator;
- financial values do not use tabular / mono alignment;
- empty order books or ledgers have no honest next step;
- risk disclosures are placed after the irreversible action instead of before;
- the chart or performance metrics look fabricated or speculative.

### Luxury gate (all premium surfaces)

A premium surface fails if:

- it depends on gold, radius or shadow to appear premium;
- it uses beige/gold globally instead of selecting the correct canvas mode;
- accent contrast is too weak to perceive or read;
- white text is placed on antique-gold without measured contrast;
- verification/authenticity accent is fabricated;
- utility screens receive decorative luxury treatment;
- photography, typography, hierarchy, trust or motion remain generic;
- it could belong to any marketplace because the ThryftVerse product advantage is not expressed.

A screen does **not** fail merely because it contains no gold.

## Minute Visual Quality Checklist

Before reporting completion, inspect the native render (or wait for user visual audit) against every item below. This checklist is the difference between a 7/10 screen and a 9/10 screen.

### Spacing

- [ ] All horizontal edges align to the same 16px rail (or documented exception).
- [ ] Card gutters are exactly 8px (discovery) or 16px (standard screens) — not random.
- [ ] Section breaks are intentional: 16px within a group, 24px between groups, 32px for major transitions.
- [ ] No random dead space above or below heroes, forms, empty states, or headers.
- [ ] Bottom docks and sheets clear the home indicator / navigation bar.
- [ ] No element has asymmetric padding unless intentionally aligned to a media edge.

### Typography

- [ ] No more than 3 type sizes visible in the first viewport.
- [ ] The main object (price, title, media) is visually dominant.
- [ ] Captions are readable at a glance — no 10–11px unless legally required.
- [ ] Labels are quieter than values — `Type.meta` / `Type.captionElevated` never compete with `Type.body` / `Type.priceList`.
- [ ] Uppercase labels are rare and purposeful (overlines only), not bureaucratic.
- [ ] Line-height is sufficient for large text — display and title do not feel cramped.
- [ ] Prices use `Type.priceList` or `Type.priceLarge`, not `Type.body`.

### Alignment

- [ ] Avatars, names, prices, buttons, and chevrons share clear baselines.
- [ ] Right-side values and chevrons have minimum 8px separation — never touching.
- [ ] Media cards align to a consistent grid — no off-by-one pixel jitter.
- [ ] Tab labels and indicators align perfectly with each other.
- [ ] Section headers align to the same left rail as section content.

### Media

- [ ] Product images are cropped honestly — shoes, bags, jewellery, garment silhouettes preserved.
- [ ] `contentFit="cover"` / the active image wrapper's equivalent is not blindly used on critical product imagery — focal points are safe.
- [ ] Every image has a visible loading state (skeleton matching final aspect ratio) and failure state.
- [ ] Skeletons match the final aspect ratio — no layout shift on load.
- [ ] Overlays do not cover the item itself — scrim is at edges or on non-critical areas.
- [ ] Media fades in (`Duration.normal` crossfade), not pops.
- [ ] Missing images get a restrained placeholder (`colors.surface` + category icon), not a broken-image icon.

### Controls

- [ ] Every tappable target is at least 44pt.
- [ ] Disabled state is readable but clearly inactive (0.4 opacity, not just grey text).
- [ ] Pressed state is visible (0.97 scale or `colors.rowPressed` background).
- [ ] Primary action dominates only when it should — not on every screen.
- [ ] Destructive actions are separated (bottom of group, `colors.danger`, confirmation required).
- [ ] Icon-only controls have `accessibilityLabel`.

### Forms

- [ ] Fields look editable, not disabled — `colors.input` background, visible border.
- [ ] Active focus border is clear — 2px `colors.brand`.
- [ ] Helper and error texts are aligned, calm, and below the field.
- [ ] Keyboard never covers the active field — `KeyboardAwareScrollView` or `KeyboardStickyView`.
- [ ] Save / Done actions are reachable (header right) but not visually heavy (no giant bottom CTA on long forms).
- [ ] Read-only fields are clearly distinguished from editable fields.

### Lists and cards

- [ ] Cards are not nested unnecessarily — no cards inside cards.
- [ ] Metadata is reduced to only what helps the decision — no more than 3–4 elements per row.
- [ ] Density is high enough to be useful but not cluttered — 4–6 rows visible in first viewport.
- [ ] Every row is resilient at 320pt width — text truncates, prices don't overlap, chevrons stay reachable.
- [ ] Row press feedback is consistent across the app.

### States

- [ ] Loading state matches final layout — skeleton, not generic spinner.
- [ ] Empty state gives the next action — not just "Nothing here."
- [ ] Error state uses user-safe language — no backend exceptions or status codes.
- [ ] Offline state is designed — not a blank screen or crash.
- [ ] Partial-data state does not look broken — missing fields are gracefully hidden or shown as "—".
- [ ] Missing-media state is restrained — placeholder, not broken-image.
- [ ] Permission-denied state explains what is needed and how to enable it.

### Luxury materiality

- [ ] Correct canvas mode selected: media, premium-commerce or utility.
- [ ] The screen remains premium if all gold accents are temporarily removed.
- [ ] Luxury accent, when used, communicates a real premium/trust/ownership/curation state.
- [ ] Accent contrast is measurable; translucent hairlines are not sole focus indicators.
- [ ] Antique-gold fills use `luxuryOnAccent`, not theme-dependent white text.
- [ ] Utility screens avoid decorative gold.
- [ ] Media surfaces let photography carry colour.
- [ ] The first viewport feels authored and recognisably ThryftVerse through product logic, not ornament.

### Visual completion & performance

- [ ] Surface has a written Visually Complete condition.
- [ ] Above-fold skeletons match final geometry exactly.
- [ ] First meaningful media appears without layout shift.
- [ ] Core actions become interactive before below-fold content finishes.
- [ ] Initial scroll/press remains smooth on a mid-range Android target.
- [ ] Image decode/failure is tracked and recoverable.
- [ ] Experimental motion is feature-gated and removable.

### Motion

- [ ] Press scale is subtle: 0.97–0.985.
- [ ] Images crossfade on load — no pop.
- [ ] Transitions are 150–250ms unless hero-level (400–600ms).
- [ ] Reduced motion is respected — instant or simple fade fallback.
- [ ] No bounce, continuous pulse, or decorative shimmer.
- [ ] Haptics are used at the right moments: light for selection, medium for purchase/bid, success for completion.

### Accessibility

- [ ] All controls have `accessibilityLabel` and `accessibilityRole`.
- [ ] State is announced — selected, unread, loading, error.
- [ ] Destructive actions are clearly labelled as destructive.
- [ ] Text has sufficient contrast — `colors.textPrimary` on `colors.background`, not `colors.textMuted` on `colors.surface`.
- [ ] Touch targets are practical — 44pt minimum.
- [ ] Back and Close are distinguishable — different icons, different labels.
- [ ] Screen-reader order follows visual order.

## Human Visual Audit Shot List

For no-vision agents: capture these screenshots and present them to the user for visual audit. Do not judge them yourself. For vision-capable agents: capture before and after, and compare against the reference gates above.

### Edit Profile

1. First viewport (header + identity row + Name + Username visible).
2. Focused Name field (keyboard visible, focus border active).
3. Focused Website field with validation error.
4. Disabled Done button (no changes).
5. Active Done button (changes pending).
6. Private details section (email, phone, status).
7. Security section (Password, 2FA).
8. Account Control row at bottom.

### Profile / Seller Storefront

1. Own profile — first viewport (cover, avatar, name, handle, stats, CTA).
2. Other-user profile — first viewport (Follow / Message CTAs).
3. Listings tab — 3-column grid populated.
4. Looks tab — masonry or authored rail.
5. About tab — bio, website, policies.
6. Cover edit tap state.
7. Avatar edit tap state.
8. Empty listings state.

### Product Detail

1. First viewport (media, price, title, seller, trust visible).
2. Media carousel — swiped to second image.
3. Sticky action dock (Offer | Buy now).
4. Seller trust / buyer protection section.
5. Sold / unavailable state.
6. Image failure state (broken remote URL).
7. More-like-this rail at bottom.
8. Description / size / condition / shipping section.

### Discovery / Explore

1. First viewport (search + filter chips + masonry visible).
2. Scrolled masonry — 10+ items loaded.
3. Empty state (no results).
4. Search active — typing state with recent / trending.
5. Filter chip overflow — horizontal scroll.
6. Card press / save toggle state.
7. Loading skeleton state.
8. Board detail view.

### Messaging

1. Inbox — populated state.
2. Inbox — error state (user-safe message).
3. Inbox — empty state.
4. Chat — keyboard open, composer visible.
5. Chat — listing / order card inside conversation.
6. Attachment sheet — only supported attachment types.
7. Group info — danger zone (leave, block, report).
8. New message — no ghost conversations.

### Auction / Co-Own

1. Auction home — live auction card with countdown.
2. Auction detail — media, countdown, bid dock.
3. Auction detail — ended state.
4. Co-own asset detail — portfolio value, chart, trade dock.
5. Co-own — empty order book state.
6. Co-own — trade confirmation dialog.
7. Portfolio — holdings list with tabular values.
8. Portfolio — empty state.

### Settings

1. Settings root — identity card at top, sections below.
2. Settings — scrolled to bottom (no orphaned rows).
3. Notifications settings — toggles.
4. Privacy settings — blocked users, muted conversations.
5. Help / support — contact options.
6. Account control — danger zone (logout, delete).

### Sell / Create

1. Sell landing — camera / photo-first entry.
2. Listing form — one decision per viewport.
3. Listing preview.
4. Listing success.
5. Draft persistence — recoverable draft state.
6. Publish failure — recoverable error state.

## Implementation Guardrails

### Required static audits

```bash
# Theme/token truth
grep -R "champagne\|antiqueGold\|bronze\|premiumBackground\|luxuryOnAccent" frontend/src/theme frontend/src/constants
grep -Rn "from '.*constants/colors'" frontend/src/screens frontend/src/components
grep -Rn "#[0-9A-Fa-f]\{6\}" frontend/src/screens frontend/src/components \
  | grep -v "ThemeContext.tsx" \
  | grep -v "colors.ts" \
  | grep -v "designTokens.ts" \
  | grep -v "gradients.ts"

# Invalid/unverified APIs
grep -R "useGradients" frontend/src
grep -R "ResizeMode.cover" frontend/src/screens frontend/src/components

# Media geometry
grep -R "Math.random\|charCodeAt\|hash" frontend/src/components/discover frontend/src/components/explore frontend/src/screens/Explore* frontend/src/screens/Home*
grep -R "aspectRatio" frontend/src/components/discover frontend/src/components/explore frontend/src/screens

# Duplicate profile/account entrypoints
grep -R "navigate('AccountSettings')" frontend/src/screens frontend/src/components
grep -R "Public profile\|Private details" frontend/src/screens/SettingsScreen.tsx

# Edit-profile media leaks
grep -R "EditProfilePreview\|ProfileMediaEditor\|pickCover\|pickAvatar\|Add a cover photo" frontend/src/screens/EditProfileScreen.tsx frontend/src/components/profile

# Keyboard/footer risks
grep -R "KeyboardAvoidingView" frontend/src/screens
grep -R "behavior={Platform.OS === 'ios' ? 'padding' : undefined}" frontend/src/screens

# Ad-hoc typography
grep -Rn "fontSize:" frontend/src/screens frontend/src/components \
  | grep -v "Type\." \
  | grep -v "FontSize\." \
  | grep -v "TypeStyles"
```

Interpret grep output; do not treat every match as automatically wrong.

### Verification commands

```bash
cd frontend
npm run typecheck
npm run lint:design-tokens
npm run check:animated-scroll
npm run test -- <relevant-test-files>
```

### Device validation

For every visually significant pass:

1. capture before;
2. render on the native development build;
3. capture required shot-list states;
4. compare first viewport, geometry, media, controls, state completeness and visual completion;
5. correct;
6. capture again.

Tests are not visual acceptance.

## Agent Prompt Template

~~~md
# THRYFTVERSE — [SURFACE] FLAGSHIP UI/UX PASS

Read AGENTS.md and DESIGN.md first.

## Runtime verification
- active branch / HEAD:
- current ThemeContext keys:
- canvas mode for this surface:
- proposed tokens needed:
- token migration required: yes/no

Do not use proposed tokens until ThemeContext contains them.

## Scope
Files:
- ...

Do not modify unrelated departments.

## User visual defects
- ...

## Reference logic
Use only the relevant logic:
- Pinterest for visual discovery / continuation / media geometry
- Instagram for media/action/profile grammar
- Depop for seller identity and social commerce
- Vinted/Vestiaire for transaction clarity and trust
- Whatnot for auction urgency

Do not photocopy.

## ThryftVerse differentiation
State the product advantage this screen must express functionally.

## Required changes
- ...

## Functionality to preserve
- ...

## Visually Complete condition
Define the above-fold condition for this surface.

## Performance budget
- list virtualization:
- image geometry/prefetch:
- reduced motion:
- mid-range Android validation:

## No-vision rule
Do not judge screenshots. Implement TSX, run checks, optionally capture screenshots, and report:
Visual QA: pending user review.

## Verification
```bash
npm run typecheck
npm run lint:design-tokens
npm run check:animated-scroll
npm run test -- ...
```

## Final report
Workspace:
Starting branch / HEAD:
Final HEAD:
Files changed:
Canvas mode:
Runtime tokens used:
Proposed tokens added/migrated:
Visible implementation changes:
Interactions preserved:
States covered:
Visually Complete condition:
Performance evidence:
Accessibility:
TypeScript:
Tests:
Native validation:
Visual QA:
Self-scorecard:
  Composition: /4
  Hierarchy: /4
  Density: /4
  Interaction: /4
  Truthfulness: /4
  State coverage: /4
Defects:
  P0:
  P1:
  P2:
Remaining weaknesses:
Final status:
~~~

## Benchmark Verification Notes — 11 July 2026

This document's latest-reference corrections are based on:

- current Pinterest public mobile imagery showing a predominantly neutral white canvas, vivid natural-aspect media, low chrome and category/topic navigation;
- Pinterest's 2026 engineering focus on visual completion, multimodal retrieval, fresh-content distribution and scalable visual relevance;
- Instagram's 2026 rollout of free profile-grid rearrangement and its shift toward taller profile thumbnails;
- current Depop product imagery showing direct product actions, seller identity, product/social proof and practical listing creation;
- current Vinted/Vestiaire/Whatnot product principles around visual search, trust, transaction clarity and live auction action.

These references inform product logic. They are not licences to copy proprietary layouts, branding or exact interactions.

## Final Report Standard

Every UI/UX implementation report must include:

```text
Code-level completion:
Canvas mode:
Runtime token status:
Visually Complete condition:
Performance evidence:
Visual QA:
Production status:
Self-scorecard:
  Composition:       /4
  Hierarchy:         /4
  Density:           /4
  Interaction:       /4
  Truthfulness:       /4
  State coverage:    /4
Defects:
  P0:
  P1:
  P2:
```

### Scorecard rules

- Every category is scored 0–4 using the Acceptance Scorecard.
- Any category below 3 forces `PARTIAL — VISUAL TARGET NOT MET` or worse.
- Pending user visual review forces `IMPLEMENTED — USER VISUAL QA PENDING`.
- P0 defects force `PARTIAL — INTERACTION FAILURES REMAIN` or worse.
- Unimplemented proposed tokens must be reported; do not claim the target palette is live.
- No `COMPLETE — TARGET MET` until the user visually confirms the native screen and the required states.

Allowed statuses:

```text
COMPLETE — TARGET MET
IMPLEMENTED — USER VISUAL QA PENDING
PARTIAL — VISUAL TARGET NOT MET
PARTIAL — INTERACTION FAILURES REMAIN
PARTIAL — BACKEND CAPABILITY BLOCKER
BLOCKED — INCORRECT REPOSITORY OPEN
BLOCKED — REFERENCE IMAGES UNAVAILABLE
BLOCKED — RUNTIME FAILURE
```
