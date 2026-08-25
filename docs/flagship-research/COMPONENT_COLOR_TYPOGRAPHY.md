# ThryftVerse Flagship Upgrade — Color & Typography

> Flagship upgrade research for the ThryftVerse native social-commerce app.
> Scope: how to upgrade the **color system** and **type scale** to 2026 flagship quality.
> Companion to `Design.md` (v1.5) and `AGENTS.md` §4 ("Readable typography", "Text budget", "Light/dark parity", "Media is the primary color").
> Benchmark date: 2026-08. All file:line references are against the current production branch.

---

## 1. 2026 Competitor Benchmark — Color & Typography

The 2026 reference set is not a set of hex values to photocopy. It is a set of **system disciplines**: how market leaders separate raw palette from meaning, how they keep dark mode at parity with light, and how they let media — not chrome — carry colour. The ThryftVerse charter already encodes this in `AGENTS.md` §4 ("Media storytelling: real media must be the primary colour and visual anchor") and `Design.md` ("Imagery carries colour on media surfaces. The UI should not compete with user content."). The benchmark below shows how the leaders execute it.

### 1.1 Instagram — content-forward chrome, one custom typeface family

Instagram's 2026 brand evolution keeps the gradient as the foundation of its colour system but pushes the in-app chrome further into the background so community media dominates. The refreshed system is explicitly "content-forward and celebrates creativity, simplicity and self-expression" ([about.instagram.com/blog/announcements/instagram-visual-refresh](https://about.instagram.com/blog/announcements/instagram-visual-refresh)). The custom **Instagram Sans** family ships in three cuts — Regular, Headline, Condensed — plus a handwriting face (Instagram Pen) and a monospace (Instagram Mono), giving a small, disciplined set of roles rather than a sprawling scale ([meta.com/design-at-meta/blog/the-new-instagram-brand-identity](https://www.meta.com/design-at-meta/blog/the-new-instagram-brand-identity/), [about.instagram.com/brand/type](https://about.instagram.com/brand/type?subpath=type)). The lesson for ThryftVerse: one family (Inter) with a tight set of semantic roles beats a dozen ad-hoc sizes; the UI recedes so media speaks.

### 1.2 Pinterest — invisible chrome, true-aspect media, modular discovery

Pinterest's Gestalt design system documents the same principle ThryftVerse targets: "almost invisible chrome, highly colourful media, true image aspect ratios, modular discovery" (`Design.md` benchmark lessons). Gestalt publishes explicit colour-palette and typography guidelines so product teams never reach for raw hex ([gestalt.pinterest.systems](https://gestalt.pinterest.systems/)). The takeaway is structural: a design system that publishes its tokens publicly is a system that enforces them internally. ThryftVerse's token layer exists but is bypassed in production (see §3).

### 1.3 eBay / Vinted / Depop — transactional clarity and semantic status colour

Marketplace apps (eBay, Vinted, Depop) treat colour as **meaning, not decoration**: success/danger/warning are reserved for transactional truth (paid, shipped, refunded, disputed), and the rest of the surface is neutral so product imagery and price dominate. This maps directly to ThryftVerse's `Design.md` colour rules: "`danger`, `success`, `warning`: semantic truth only" and "Status colours must be truthful and accessible. Never use green/red/gold merely to decorate."

### 1.4 Snapchat — dark-first, luminance hierarchy, media as primary colour

Snapchat is dark-first and treats the camera/media surface as the primary colour. This is the "media is the primary colour" principle in `AGENTS.md` §4: "On discovery, profile and creator surfaces, real media must be the primary colour and visual anchor. Generic grey placeholder cards never become the dominant first-viewport story." The 2026 dark-mode consensus is that dark mode is **designed, not inverted** — surfaces elevate by getting lighter (luminance hierarchy), not by adding shadow ([muz.li/blog/dark-mode-design-systems](https://muz.li/blog/dark-mode-design-systems-a-complete-guide-to-patterns-tokens-and-hierarchy/)).

### 1.5 The cross-industry 2026 consensus

Across all references, four disciplines recur:

1. **Three-tier token architecture** — primitive → semantic → component. Components never reference raw values; theming happens at the semantic tier ([themasterly.com/blog/design-tokens](https://www.themasterly.com/blog/design-tokens), [colorui.io/learn/design-tokens-intro](https://colorui.io/learn/design-tokens-intro), [72technologies.com/blog/design-tokens-that-survive-engineering-3](https://www.72technologies.com/blog/design-tokens-that-survive-engineering-3), [invariant.design/docs/04-token-architecture](https://www.invariant.design/docs/04-token-architecture)).
2. **Dark mode as parity, not inversion** — geometry, hierarchy and density stay identical; surfaces elevate by luminance, not glow ([mantlr.com/blog/dark-mode-design-guide-color-typography-accessibility](https://mantlr.com/blog/dark-mode-design-guide-color-typography-accessibility), [developer.android.com/design/ui/mobile/guides/styles/themes](https://developer.android.com/design/ui/mobile/guides/styles/themes)).
3. **Type scale discipline** — a small set of semantic roles with one weight delta for hierarchy; body text floor at 16pt/14pt; captions avoided below 11–12pt ([gendesigns.ai/blog/app-typography-guide-ios-android](https://gendesigns.ai/blog/app-typography-guide-ios-android), [align.vn/blog/font-size-for-mobile-app-design-guide](https://www.align.vn/blog/font-size-for-mobile-app-design-guide/)).
4. **Contrast as accessibility infrastructure** — WCAG 2.2 AA (4.5:1 normal text, 3:1 large text and UI components) encoded into the token layer, not audited at the end ([digitalheroesco.com/journal/color-system-wcag-compliance](https://digitalheroesco.com/journal/color-system-wcag-compliance/), [137foundry.com/articles/website-color-system-brand-accessibility-guide](https://137foundry.com/articles/website-color-system-brand-accessibility-guide)).

---

## 2. Psychology & Principles

### 2.1 Colour as meaning, not decoration

Colour in a commerce/marketplace app carries **state and trust**, not mood. A green chip means "paid/shipped/verified"; a red chip means "disputed/refunded/failed"; a gold accent means "authenticated premium value". When colour is used decoratively (a blue `#3B9EFF` check icon, a random grey card), it dilutes the semantic vocabulary and trains users to ignore the colours that actually matter. This is why `Design.md` rule 8 exists: "Status colours must be truthful and accessible. Never use green/red/gold merely to decorate." The 2026 token literature calls this **intent over appearance** — name tokens by the job they do (`color.text.primary`), not the value they hold (`gray-900`) ([gel.pageuppeople.com/latest/gel-design-system/foundations/color](https://gel.pageuppeople.com/latest/gel-design-system/foundations/color-w9W5EGGO), [socialanimal.dev/blog/build-color-system-web-design-2026](https://socialanimal.dev/blog/build-color-system-web-design-2026/)).

### 2.2 The type scale as hierarchy

Typography is the primary hierarchy tool. The eye reads **size and weight relationships** before it reads words. When a screen uses five sizes and four weights, the hierarchy collapses — nothing dominates because everything competes. `AGENTS.md` §4 encodes this as the **text budget**: "The first viewport normally uses no more than three type sizes and one eyebrow." The 2026 mobile typography guides confirm the discipline: Apple's HIG defaults to 17pt body with a tight 11-style semantic scale; Material 3 uses 12/14/16/20/34 ([gendesigns.ai/blog/app-typography-guide-ios-android](https://gendesigns.ai/blog/app-typography-guide-ios-android), [align.vn/blog/font-size-for-mobile-app-design-guide](https://www.align.vn/blog/font-size-for-mobile-app-design-guide/)). The principle is **one weight delta for hierarchy** — `TypographyV2` (`frontend/src/theme/typography.v2.ts:9`) states it directly: "One weight delta is normally enough to express hierarchy."

### 2.3 Cognitive ease via type rhythm

Readable typography is not just about individual sizes — it is about the **rhythm** between them. Line-height should be ~1.4–1.6× the font size for body text ([weareaffective.com/learning-centre/how-do-i-choose-the-right-font-size-for-my-mobile-app](https://weareaffective.com/learning-centre/how-do-i-choose-the-right-font-size-for-my-mobile-app)). The ThryftVerse scale already follows this (body 14/20 ≈ 1.43, caption 12/16 ≈ 1.33, display 32/38 ≈ 1.19 for tight display tracking). The defect is not the scale itself but the **drift away from it** — screens invent sizes (8, 9, 10, 19, 21, 40, 60) that break the rhythm.

### 2.4 The "three sizes + one eyebrow" rule

`AGENTS.md` §4 text budget: "Remove duplicate headings, decorative subtitles and labels that merely name an obvious object." An eyebrow is a single small uppercase label that names a section; more than one per viewport is decoration. `TypographyV2` restricts uppercase to the `label` role only (`UPPERCASE_ALLOWED_ROLES` at `typography.v2.ts:191`) — "Every other role must use default text transform — no decorative caps."

### 2.5 Dark mode as parity, not inversion

`AGENTS.md` §4: "Geometry, hierarchy and information density remain identical across themes. Dark mode is not permission to add translucent containers or glow." The 2026 dark-mode literature is emphatic: inverting a light palette produces oversaturated colours that vibrate and cause eye strain; real dark mode reduces saturation 10–20% and raises lightness 5–10% for status colours, and uses dark grey (`#0A0A0A`–`#1A1A1A`) rather than pure black to avoid OLED smearing ([mantlr.com/blog/dark-mode-design-guide-color-typography-accessibility](https://mantlr.com/blog/dark-mode-design-guide-color-typography-accessibility)). ThryftVerse's `#0A0A0A` dark background is already correct. The failure is **parity**: some components ship one light recipe that was never re-tokenized for dark, leaving pale "cut-out sticker" fills on a near-black page — the exact failure class documented in a 301-screenshot audit of another product ([github.com/we-promise/sure/issues/2134](https://github.com/we-promise/sure/issues/2134)).

### 2.6 Colour contrast as accessibility

WCAG 2.2 AA: 4.5:1 for normal text, 3:1 for large text (≥18.66px regular or ≥14px bold) and for UI component borders/focus rings ([digitalheroesco.com/journal/color-system-wcag-compliance](https://digitalheroesco.com/journal/color-system-wcag-compliance/)). ThryftVerse's `textMuted` was already raised to meet 4.65:1 light / 4.64:1 dark (`ThemeContext.tsx:70`, `ThemeContext.tsx:107`), and a high-contrast override path exists (`applyHighContrast` at `ThemeContext.tsx:162`). The remaining risk is **semantic accents** (`social`, `discovery`, `commerceTrust`, `antiqueGold`) used as text on surfaces — these must be verified per-pairing, not assumed.

---

## 3. Current ThryftVerse Audit — Concrete Defects

The audit below is evidence-based, with file:line references. The codebase has a strong *contract* (`Design.md`, `typography.v2.ts`, `ThemeContext.tsx`) but **widespread bypass** of that contract in production screens.

### 3.1 Two colour sources of truth that disagree

`Design.md` states `ThemeContext.tsx` is the source of truth and `constants/colors.ts` is "compatibility-only". But `colors.ts` claims "Values mirror theme/ThemeContext.tsx exactly. Single source of truth is ThemeContext" (`colors.ts:1`) — and then **does not mirror it**:

| Token | `colors.ts` dark | `ThemeContext.tsx` dark | Defect |
|---|---|---|---|
| `warning` | `#C9A46A` (`colors.ts:49`) | `#D49454` (`ThemeContext.tsx:76`) | Divergent — gold vs amber |
| `warning` (light) | `#8A6A3F` (`colors.ts:110`) | `#B8742E` (`ThemeContext.tsx:113`) | Divergent |
| `borderSubtle` (dark) | `#333333` (`colors.ts:44`) | `#1E1E1E` (`ThemeContext.tsx:73`) | Divergent — `#333` is barely visible on `#0A0A0A` |
| `surfaceAlt` (dark) | `#1F1F1F` (`colors.ts:26`) | `#1C1C1C` (`ThemeContext.tsx:62`) | Divergent |
| `surfaceRaised` | **missing** | `#1F1F1F` (`ThemeContext.tsx:63`) | `colors.ts` lacks the token |
| `brandSubtle` | **missing** | `rgba(244,240,232,0.08)` (`ThemeContext.tsx:67`) | `colors.ts` lacks the token |

Any non-component module importing `Colors.warning` or `Colors.borderSubtle` from `colors.ts` gets a **different value** than a component using `useAppTheme().colors`. This is a silent parity bug.

### 3.2 Hardcoded hex colours bypassing tokens

A grep for `#[0-9A-Fa-f]{6}` across `frontend/src` returns **1001 matches**. Within `frontend/src/screens`, 14 files contain direct hex literals. Representative defects:

- **`LiveShoppingHomeScreen.tsx`** — `#FFFFFF` at lines 68, 168, 686, 709, 747, 759, 781 (white text/icons hardcoded instead of `colors.textInverse`); `#3B9EFF` at lines 119, 176 — a **non-token blue** checkmark icon that introduces a colour outside the entire semantic system and will not adapt to dark mode.
- **`SellScreen.tsx`** — `#00000000` and `#00000033` (8-digit alpha hex) at lines 2510, 2542, 2570, 2583 — alpha expressed as hex instead of `rgba()` or a token, opaque to theming.
- **`HomeScreen.tsx`** — `color: '#fff'` inline at line 1058 — bypasses `colors.textInverse`.
- **`PaymentsScreen.tsx`** — `#1A1F71`, `#EB001B`, `#2E77BC`, `#FF6000` at lines 57–60 — these are **legitimate brand card colours** (Visa/Mastercard/Amex/Discover) and are an acceptable exception, but they should be isolated in a `BRAND_CARD_COLORS` constant, not inline in screen logic.
- **`PosterViewerScreen.tsx`** — hex at lines 988, 991, 1006.

The `#3B9EFF` blue in `LiveShoppingHomeScreen` is the most dangerous: it is a semantic colour (success/verified) expressed as a raw value, so it cannot be themed, audited for contrast, or changed globally.

### 3.3 Type scale drift — off-scale fontSize values

A grep for `fontSize:\s*\d+` in `frontend/src/screens` returns **51 hardcoded fontSize values** across 8 files. Many fall **outside** the `Type` / `TypographyV2` scale:

| File | Line | Value | Scale violation |
|---|---|---|---|
| `HomeScreen.tsx` | 1881 | `8` | Below the 10pt floor; unreadable |
| `HomeScreen.tsx` | 1434, 1619 | `10` | Below 11pt `meta` floor |
| `HomeScreen.tsx` | 1627, 1896, 1910, 1930, 1948, 1962 | `9` | Below any scale token |
| `HomeScreen.tsx` | 2171 | `19` | Not in scale (between `itemTitle` 18 and `priceList` 20) |
| `GlobalSearchScreen.tsx` | 1690 | `10` | Below floor; 21 total hardcoded sizes in one file |
| `WalletScreen.tsx` | 747, 755 | `40` | Not in scale (above `display` 32) |
| `PosterViewerScreen.tsx` | 1489 | `60` | Not in scale |
| `CreatePosterHighlightScreen.tsx` | 653 | `9` | Below floor |
| `SyndicateHubScreen.tsx` | 866 | `10` | Below floor |
| `ClosetScreen.tsx` | 1033 | `10` | Below floor |

`Design.md` typography rule 3: "Captions must remain readable; avoid 10–11px unless legally required." Sizes 8 and 9 are **illegible** at standard viewing distance and violate the charter. `GlobalSearchScreen` is the worst offender with 21 inline sizes — a clear case of a screen assembling its own ad-hoc scale.

### 3.4 Competing fontWeight values inline

37 hardcoded `fontWeight` values across screens, mixing `'500'`, `'600'`, `'700'` inline instead of deriving from `Type` roles:

- **`AIPoweredListingScreen.tsx`** — 15 inline fontWeights (lines 1305–1727).
- **`AuctionHomeScreen.tsx`** — 11 inline fontWeights (lines 2214–2561), mixing `'500'`, `'600'`, `'700'` in the same screen.

When weights are set inline, the **one weight delta** principle breaks: a screen can accidentally render a section title at `'500'` and body at `'600'`, inverting hierarchy. The `Type` tokens already encode the correct weight per role; inline weights bypass that intent.

### 3.5 fontFamily drift

`HomeScreen.tsx:1435` hardcodes `fontFamily: 'Inter_700Bold'` instead of using `FontFamily.bold`. Only one screen-level instance was found, but it establishes a pattern: raw family strings bypass the `FontFamily` token and would break a future font migration.

### 3.6 Text.tsx component defects

`frontend/src/components/ui/Text.tsx` is the shared text primitive, but it has internal inconsistencies that undermine the scale:

- **`Title1`, `Title2`, `Title3` are identical** — all three map to `Type.title` (24/32/bold) at `Text.tsx:338–355`. Three "different" components that render the same style violate type scale discipline and mislead callers into thinking they have distinct roles.
- **`bodyEmphasis` uses the wrong token** — `Text.tsx:327–331` builds `bodyEmphasis` from `Type.price` (14/20/600) instead of `Type.bodyEmphasis` (15/21/600). The shared primitive ships a **different size** than the token it claims to represent.
- **No eyebrow/overline in the `T` namespace** — `TypeStyles.overline` exists (`designTokens.ts:247`) but is not exported as a component in `Text.tsx`, so screens that need an eyebrow build it inline.
- **`CaptionEmphasis` is not in the canonical v2 set** — `TypographyV2` has no `captionEmphasis` role; `LEGACY_TO_V2_MAP` maps it to `meta` (`typography.v2.ts:237`). The component still ships, perpetuating a forbidden token.

### 3.7 Two parallel type systems, migration incomplete

The codebase has **two** type contracts:
1. `designTokens.ts` `Type` / `TypeStyles` (legacy) — 146 screens reference `Type.`/`TypeStyles.`/`Typography.`/`FontSize.` tokens.
2. `typography.v2.ts` `TypographyV2` (canonical) — defines `FORBIDDEN_LEGACY_TOKENS` (`typography.v2.ts:248`) including `captionElevated`, `metaElevated`, `bodyLarge`, `bodyEmphasis`, `price`, `priceLarge`, `subtitle`, `title`.

The migration map exists (`LEGACY_TO_V2_MAP` at `typography.v2.ts:221`) but screens still consume forbidden legacy tokens. Until migration completes, the "one scale" principle is aspirational, not enforced.

### 3.8 Low Text.tsx adoption vs raw token usage

Only **24 screens** import the shared `Text.tsx` components, while **146 screens** use raw `Type`/`Typography`/`FontSize` tokens inline and **160 screens** use `useAppTheme`/`colors.*`. This means most screens construct text styles by hand from tokens rather than via the shared primitive — the pattern that produces the 51 inline `fontSize` and 37 inline `fontWeight` defects above. The shared primitive exists but is under-adopted.

### 3.9 Missing dark-mode parity for semantic accents

`ThemeContext.tsx` defines `social`, `discovery`, `commerceTrust`, `antiqueGold`, `bronze` for both light and dark (`ThemeContext.tsx:79–83`, `116–120`), but there is **no contrast verification** documented for these as text-on-surface pairings. The dark `discovery` (`#B85566`) on `#0A0A0A` and light `discovery` (`#7B0E1E`) on `#FFFFFF` need per-pairing AA verification. `Design.md` rule 9: "Contrast overrides mood. A subtle accent that cannot be perceived or read is not premium."

---

## 4. Micro Improvements — Per-Screen Colour/Type Fixes

These are screen-local corrections that resolve the most visible defects without a system rewrite.

1. **`LiveShoppingHomeScreen.tsx`** — replace `#FFFFFF` (lines 68, 168, 686, 709, 747, 759, 781) with `colors.textInverse`; replace `#3B9EFF` (lines 119, 176) with `colors.success` or a new `colors.verified` semantic token. This single screen introduces an untokenised blue into the product.
2. **`HomeScreen.tsx`** — eliminate `fontSize: 8` and `fontSize: 9` (lines 1627, 1881, 1896, 1910, 1930, 1948, 1962); raise to `Type.meta` (11) or `Type.caption` (12). Replace `#fff` (line 1058) with `colors.textInverse`. Replace `fontFamily: 'Inter_700Bold'` (line 1435) with `FontFamily.bold`. Replace `fontSize: 19` (line 2171) with `Type.itemTitle` (18) or `Type.priceList` (20).
3. **`GlobalSearchScreen.tsx`** — consolidate 21 inline `fontSize` values into `Type` roles; remove `fontSize: 10` (line 1690). This screen needs a full type pass.
4. **`WalletScreen.tsx`** — replace `fontSize: 40` (lines 747, 755) with `Type.display` (32) or add a justified `Type.heroBalance` role; do not invent a one-off size.
5. **`PosterViewerScreen.tsx`** — replace `fontSize: 60` (line 1489) with a display-scale token; replace hex (lines 988, 991, 1006) with semantic tokens.
6. **`SellScreen.tsx`** — replace 8-digit alpha hex `#00000000`/`#00000033` (lines 2510, 2542, 2570, 2583) with `rgba()` expressions or `colors.overlay`/`colors.glassBorder` tokens.
7. **`AIPoweredListingScreen.tsx` / `AuctionHomeScreen.tsx`** — replace 26 inline `fontWeight` values with `Type` role assignments so weight derives from role, not from a per-style literal.
8. **`PaymentsScreen.tsx`** — extract `#1A1F71`/`#EB001B`/`#2E77BC`/`#FF6000` (lines 57–60) into a `BRAND_CARD_COLORS` constant; document as an intentional brand-identity exception.

---

## 5. Macro Improvements — System-Level Colour & Type Architecture

### 5.1 The colour system: primitive → semantic → component

ThryftVerse currently has a **two-tier** colour system: raw hex values in `LIGHT_COLORS`/`DARK_COLORS` (`ThemeContext.tsx:59–131`) consumed directly by screens. The 2026 standard is **three-tier** ([themasterly.com/blog/design-tokens](https://www.themasterly.com/blog/design-tokens), [colorui.io/learn/design-tokens-intro](https://colorui.io/learn/design-tokens-intro), [72technologies.com/blog/design-tokens-that-survive-engineering-3](https://www.72technologies.com/blog/design-tokens-that-survive-engineering-3), [invariant.design/docs/04-token-architecture](https://www.invariant.design/docs/04-token-architecture)):

```
T1 Primitive  (raw values, no meaning)     e.g. neutral.900 = #0A0A0A
      ↓ referenced by
T2 Semantic   (role + meaning, theme-aware) e.g. color.surface.primary
      ↓ referenced by
T3 Component  (scoped per component)        e.g. button.primary.background
```

**Proposed migration:**

1. **Add a primitive tier** — extract the raw hex values behind `ThemeColors` into a `PrimitiveColors` map (e.g. `neutral.0`–`neutral.1000`, `amber.600`, `cherry.700`). Primitives are never imported by screens.
2. **Re-express semantics as references** — `LIGHT_COLORS`/`DARK_COLORS` become maps of semantic tokens pointing at primitives. Dark mode is a second set of semantic→primitive mappings; components do not change ([socialanimal.dev/blog/build-color-system-web-design-2026](https://socialanimal.dev/blog/build-color-system-web-design-2026/)).
3. **Add the missing semantic roles** — `surfaceRaised` and `brandSubtle` exist in `ThemeContext` but not `colors.ts`; synchronise. Add `verified`/`info` if `#3B9EFF`-style accents are genuinely needed (otherwise route to `success`).
4. **Reconcile `colors.ts` with `ThemeContext.tsx`** — either regenerate `colors.ts` from the same source or deprecate it in favour of a `useThemeColors()` hook usable in non-component modules. The current divergence (§3.1) is a silent bug.
5. **Add component-tier aliases** for the highest-traffic components (`button.primary.bg`, `card.surface`, `input.border.focus`) so a component can be restyled without touching the semantic layer ([honcho.agency/design-systems/glossary/token-tiers](https://honcho.agency/design-systems/glossary/token-tiers)).

### 5.2 The type scale: one scale, one rhythm

The canonical scale already exists in `TypographyV2` (`typography.v2.ts:82`). The macro fix is **enforcement**:

1. **Complete the v2 migration** — replace all `Type.subtitle`/`Type.title`/`Type.bodyEmphasis`/`Type.captionElevated`/`Type.price`/`Type.priceLarge` usages with their `TypographyV2` canonical equivalents per `LEGACY_TO_V2_MAP`. Delete `FORBIDDEN_LEGACY_TOKENS` from new code via lint.
2. **Fix `Text.tsx`** — make `Title1`/`Title2`/`Title3` map to distinct v2 roles (`screenTitle`, `sectionTitle`, `itemTitle`) or collapse to one `Title` component; fix `bodyEmphasis` to use `Type.bodyEmphasis` not `Type.price`; add an `Eyebrow`/`Overline` component to the `T` namespace.
3. **Ban inline `fontSize`/`fontWeight`/`fontFamily`** — enforce via lint rule that any `TextStyle` in `screens/` must derive from `TypographyV2` or a `Text.tsx` component. The 51 inline `fontSize` and 37 inline `fontWeight` defects (§3.3, §3.4) are all lint-failable.
4. **Adopt the `Text.tsx` primitives more broadly** — drive the 146 screens currently using raw tokens toward the shared components so hierarchy is centrally controlled.
5. **Optical sizing** — Inter ships as a variable font via `@expo-google-fonts/inter`; enable `font-optical-sizing` behaviour (or per-size weight tuning) so 11pt meta gets sturdier rendering and 32pt display gets refined tracking. The 2026 variable-font guidance is that the `opsz` axis is "the most important axis you're ignoring" ([lucky.graphics/learn/variable-fonts-guide-2026](https://lucky.graphics/learn/variable-fonts-guide-2026/), [codexical.com/posts/2026-05-30-variable-fonts-performance-accessibility](https://www.codexical.com/posts/2026-05-30-variable-fonts-performance-accessibility)).

### 5.3 The dark-mode contract

`AGENTS.md` §4: "Light/dark parity. Geometry, hierarchy and information density remain identical across themes." The contract to enforce:

1. **Every colour used in light mode has a dark counterpart** — no `#FFFFFF`-only literals (§3.2).
2. **Surfaces elevate by luminance, not shadow** — dark surface tiers (`#0A0A0A` → `#141414` → `#1C1C1C` → `#1F1F1F` → `#242424`) must remain distinguishable without relying on shadow alone (`Design.md` dark mode rules).
3. **Status colours reduce saturation in dark** — `warning` dark (`#D49454`) is already desaturated vs a bright amber; verify `success`/`danger`/`coownUp`/`coownDown` follow the same 10–20% desaturation rule ([mantlr.com/blog/dark-mode-design-guide-color-typography-accessibility](https://mantlr.com/blog/dark-mode-design-guide-color-typography-accessibility)).
4. **No translucent containers or glow added in dark** — `AGENTS.md` §4 prohibits this; `glassBg`/`glassBorder` are reserved for sticky bars, sheets, and media overlays only (`Design.md` elevation rules).
5. **High-contrast path** — `applyHighContrast` (`ThemeContext.tsx:162`) already raises `textSecondary`/`textMuted`/`border` for accessibility settings; verify every semantic accent also passes under high-contrast.

### 5.4 Semantic colour roles

The current `ThemeColors` interface (`ThemeContext.tsx:13–57`) mixes structural roles (`background`, `surface`, `border`) with semantic-state roles (`danger`, `success`, `warning`, `coownUp`, `coownDown`) and category accents (`social`, `discovery`, `commerceTrust`). The 2026 best practice is to make the **role explicit in the name** (`color-{property}-{intent}-{variant}`) ([gel.pageuppeople.com/latest/gel-design-system/foundations/color](https://gel.pageuppeople.com/latest/gel-design-system/foundations/color-w9W5EGGO)). At minimum, document the contract for each existing role and add the missing `info`/`verified` role if needed (or explicitly route to `success`/`commerceTrust`).

---

## 6. Flagship Acceptance Criteria

A screen passes the colour & typography flagship bar when **all** of the following hold:

1. **Text budget** — first viewport uses no more than three type sizes and one eyebrow (`AGENTS.md` §4). No duplicate headings, decorative subtitles, or labels that merely name an obvious object.
2. **Light/dark parity** — geometry, hierarchy and density are identical across themes; no hardcoded light-only colours; surfaces elevate by luminance not glow.
3. **No hardcoded colours** — zero `#[0-9A-Fa-f]{6}` literals in screen code except documented brand-identity exceptions (e.g. card-network colours). All colour flows through `useAppTheme().colors` or a `PrimitiveColors`/semantic token.
4. **Type scale discipline** — zero inline `fontSize`/`fontWeight`/`fontFamily` in `screens/`; all text derives from `TypographyV2` roles or `Text.tsx` components. No size below 11pt unless legally required.
5. **Semantic colour roles** — status colours (`success`/`warning`/`danger`/`coownUp`/`coownDown`) used only for truthful state; category accents (`social`/`discovery`/`commerceTrust`) only for contextual meaning; no decorative colour.
6. **Contrast** — all text/background pairings pass WCAG 2.2 AA (4.5:1 normal, 3:1 large/UI); semantic accents verified per-pairing in both themes and under high-contrast.
7. **One weight delta** — hierarchy expressed by one weight step (regular → semibold, or semibold → bold), not by inventing weights inline.
8. **Media is the primary colour** — on discovery/profile/creator surfaces, real media dominates; UI chrome recedes (`AGENTS.md` §4, `Design.md` colour rule 1).
9. **Thumbnail + squint test** — at 25% scale the reading order is obvious; squinting reveals media/content dominating while chrome recedes (`AGENTS.md` §4).
10. **Single source of truth** — `colors.ts` and `ThemeContext.tsx` agree on every shared key, or `colors.ts` is deprecated in favour of one source.

---

## 7. Priority & Sequencing

| Phase | Work | Impact | Effort |
|---|---|---|---|
| **P0 — Stop the bleed** | Lint rule banning inline `fontSize`/`fontWeight`/`fontFamily`/`#hex` in `screens/`; fix `LiveShoppingHomeScreen` `#3B9EFF` and `HomeScreen` 8/9pt sizes | Prevents new drift | Low |
| **P1 — Reconcile sources** | Synchronise `colors.ts` with `ThemeContext.tsx` (warning, borderSubtle, surfaceAlt, surfaceRaised, brandSubtle) or deprecate `colors.ts` | Eliminates silent parity bug | Low |
| **P2 — Fix `Text.tsx`** | Distinct Title roles; fix `bodyEmphasis` token; add `Eyebrow` component; remove `CaptionEmphasis` or map to `meta` | Shared primitive becomes trustworthy | Medium |
| **P3 — Complete v2 migration** | Codemod `FORBIDDEN_LEGACY_TOKENS` → `TypographyV2` roles across 146 screens; delete legacy aliases after parity | One scale, one rhythm | High |
| **P4 — Three-tier colour** | Add `PrimitiveColors` tier; re-express semantics as references; add component-tier aliases | Rebrand/dark-mode/high-contrast become free | High |
| **P5 — Per-screen flagship pass** | Drive screens to shared `Text.tsx` primitives; enforce text budget per screen; verify contrast per pairing | Visible flagship quality | High |

P0 and P1 are prerequisites: they stop new defects and remove the silent divergence before any systemic rewrite.

---

## 8. Token-Level Spec Table

### 8.1 Type roles (canonical — `TypographyV2`)

| Role | Size | Line height | Weight | Letter spacing | Font family | Tabular | Transform | Use |
|---|---|---|---|---|---|---|---|---|
| `display` | 32 | 38 | 700 | -0.5 | `Inter_700Bold` | — | none | Rare campaign/onboarding/empty-state statement |
| `screenTitle` | 24 | 32 | 700 | -0.6 | `Inter_700Bold` | — | none | Screen identity, hero headers, profile names |
| `sectionTitle` | 17 | 24 | 600 | -0.4 | `Inter_600SemiBold` | — | none | Major section, card header |
| `itemTitle` | 18 | 24 | 600 | -0.3 | `Inter_600SemiBold` | — | none | Product/person/conversation title in lists |
| `body` | 14 | 20 | 400 | -0.2 | `Inter_400Regular` | — | none | Body text, descriptions, general content |
| `bodyStrong` | 15 | 21 | 600 | 0 | `Inter_600SemiBold` | — | none | Emphasized body, picker values |
| `meta` | 11 | 14 | 500 | 0.15 | `Inter_500Medium` | — | none | Timestamps, attributes, seller handles |
| `label` (eyebrow) | 11 | 14 | 600 | 0.5 | `Inter_600SemiBold` | — | uppercase | Controls/field labels, the one eyebrow |
| `priceHero` | 28 | 32 | 700 | -0.5 | `Inter_700Bold` | yes | none | PDP/checkout total |
| `priceList` | 20 | 24 | 700 | -0.3 | `Inter_700Bold` | yes | none | Prices in lists, totals |
| `numericMeta` | 13 | 18 | 600 | 0 | `Inter_600SemiBold` | yes | none | Bids, quantities, P&L |

Source: `frontend/src/theme/typography.v2.ts:82–175`. Line-height ratios: body 1.43, caption/meta 1.27, display 1.19 (tight display tracking). Uppercase restricted to `label` (`UPPERCASE_ALLOWED_ROLES`, `typography.v2.ts:191`). Tabular figures restricted to `priceHero`/`priceList`/`numericMeta` (`TABULAR_FIGURE_ROLES`, `typography.v2.ts:181`).

### 8.2 Semantic colour roles

| Role | Light | Dark | Intent | WCAG note |
|---|---|---|---|---|
| `background` | `#FFFFFF` | `#0A0A0A` | Root screen canvas | — |
| `surface` | `#F5F5F5` | `#141414` | Grouped content, loading placeholder | — |
| `surface-2` (`surfaceAlt`) | `#EFEFEF` | `#1C1C1C` | Nested/alternating tier; use sparingly | — |
| `surface-raised` (`surfaceRaised`) | `#F2F2F2` | `#1F1F1F` | Raised surface between surface and elevated | — |
| `surface-elevated` (`surfaceElevated`) | `#FFFFFF` | `#242424` | Sheets, dialogs, materially elevated content | — |
| `border` | `#E5E5E5` | `#262626` | Subtle separators | Verify 3:1 UI-component contrast |
| `text-primary` | `#000000` | `#FFFFFF` | Headlines, body, important labels | 21:1 / 21:1 ✓ |
| `text-secondary` | `#666666` | `#A3A3A3` | Subtitles, metadata, captions | 5.74:1 light / 5.32:1 dark ✓ AA |
| `text-tertiary` (`textMuted`) | `#767676` | `#7A7A7A` | Placeholders, disabled, hints | 4.65:1 light / 4.64:1 dark ✓ AA |
| `primary` (`brand`) | `#111111` | `#F4F0E8` | High-confidence primary action only | — |
| `secondary` (`brandPressed`) | `#333333` | `#D8D0C3` | Pressed/active brand state | — |
| `success` | `#215634` | `#215634` | Paid/shipped/verified/positive | Verify as text on surface |
| `warning` | `#B8742E` | `#D49454` | Caution/pending/expiry | Distinct from antiqueGold |
| `error` (`danger`) | `#9b0202` | `#9b0202` | Failed/disputed/destructive | — |
| `info` (`commerceTrust`) | `#06489A` | `#4A7AC4` | Protection/verification/trust | Verify as text on surface |

Source: `frontend/src/theme/ThemeContext.tsx:59–131`. High-contrast overrides at `ThemeContext.tsx:162–188` raise `text-secondary`/`text-tertiary`/`border` for accessibility settings. **Note:** `colors.ts` diverges from these values for `warning`, `borderSubtle`, `surfaceAlt` (§3.1) and must be reconciled. Semantic accents `social`/`discovery`/`antiqueGold`/`bronze` are category/premium roles, not status, and are documented in `Design.md` "Luxury Accent System".

---

## 9. References

**Web sources (2026):**
- Android Developers — Color for mobile design: https://developer.android.com/design/ui/mobile/guides/styles/color
- Android Developers — Themes: https://developer.android.com/design/ui/mobile/guides/styles/themes
- Masterly — Design Tokens: A Practical Guide for 2026: https://www.themasterly.com/blog/design-tokens
- ColorUI — Design Tokens 101: https://colorui.io/learn/design-tokens-intro
- 72Technologies — Design Tokens That Survive Contact With Engineering: https://www.72technologies.com/blog/design-tokens-that-survive-engineering-3
- IDL — Token Architecture: https://www.invariant.design/docs/04-token-architecture
- Honcho — Token Tiers: https://honcho.agency/design-systems/glossary/token-tiers
- FramingUI — Multi-Platform Design Tokens: https://framingui.com/blog/multi-platform-design-tokens
- Worldcoin Nucleus — cross-platform design system: https://github.com/worldcoin/nucleus
- AppSignal — Semantic Colors: https://www.appsignal.design/latest/foundations/semantic-colors-uaIApGCs
- GenDesigns — App Typography Guide iOS vs Android (2026): https://gendesigns.ai/blog/app-typography-guide-ios-android
- Align.vn — Font Size for Mobile App Design: https://www.align.vn/blog/font-size-for-mobile-app-design-guide/
- Affective — Right Font Size for Mobile App: https://weareaffective.com/learning-centre/how-do-i-choose-the-right-font-size-for-my-mobile-app
- Accor Welcome — Typography for iOS and Android: https://design.accor.com/latest/foundations/typography/typography-for-i-os-and-android-PZxCGE8a-PZxCGE8a
- Muzli — Dark Mode Design Systems: https://muz.li/blog/dark-mode-design-systems-a-complete-guide-to-patterns-tokens-and-hierarchy/
- Mantlr — Dark Mode Design Guide (2026): https://mantlr.com/blog/dark-mode-design-guide-color-typography-accessibility
- we-promise/sure — dark-mode token parity audit: https://github.com/we-promise/sure/issues/2134
- Smashing Magazine — Self-Correcting Color Systems (2026): https://www.smashingmagazine.com/2026/05/building-self-correcting-color-systems-contrast-color/
- SocialAnimal — Build a Color System for Web Design in 2026: https://socialanimal.dev/blog/build-color-system-web-design-2026/
- 137Foundry — Color System WCAG Guide: https://137foundry.com/articles/website-color-system-brand-accessibility-guide
- DigitalHeroes — Color System WCAG Compliance 2026: https://digitalheroesco.com/journal/color-system-wcag-compliance/
- PageUp GEL — Semantic colour: https://gel.pageuppeople.com/latest/gel-design-system/foundations/color-w9W5EGGO
- Lucky Graphics — Complete Guide to Variable Fonts 2026: https://lucky.graphics/learn/variable-fonts-guide-2026/
- Codexical — Variable Fonts Performance & Accessibility: https://www.codexical.com/posts/2026-05-30-variable-fonts-performance-accessibility
- Blake Crosley — SF Pro Typography System: https://blakecrosley.com/blog/sf-pro-typography-system
- Zignuts — Mobile App Typography Best Practices 2026: https://www.zignuts.com/blog/mastering-mobile-app-typography-best-practices-pro-tips
- Instagram — Visual Refresh: https://about.instagram.com/blog/announcements/instagram-visual-refresh
- Meta Design — New Instagram Brand Identity: https://www.meta.com/design-at-meta/blog/the-new-instagram-brand-identity/
- Instagram — Sans Typeface: https://about.instagram.com/brand/type?subpath=type
- Pinterest — Gestalt Design System: https://gestalt.pinterest.systems/

**Internal sources:**
- `AGENTS.md` §4 (Readable typography, Text budget, Light/dark parity, Media is the primary color)
- `Design.md` — Colors, Typography, Luxury Accent System, Dark mode sections
- `frontend/src/theme/ThemeContext.tsx` — runtime colour source of truth
- `frontend/src/theme/designTokens.ts` — `Type`, `TypeStyles`, `FontFamily`, `FontSize`, `Numeric`
- `frontend/src/theme/typography.v2.ts` — canonical `TypographyV2` roles, migration map, forbidden tokens
- `frontend/src/constants/colors.ts` — legacy static colour export (divergent)
- `frontend/src/components/ui/Text.tsx` — shared text primitives
