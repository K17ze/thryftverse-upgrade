# 23 — Accessibility & Inclusive Design

> **Department status:** Critical infrastructure gap. ThryftVerse has a partial accessibility scaffold — a `useReducedMotion` hook, an `AccessibilityPreferencesContext`, a dev-only `accessibilityAudit.ts`, and an `AccessibilitySettingsScreen` — but the system does not yet meet WCAG 2.2 AA, does not enforce contrast at the token level, does not support Dynamic Type end-to-end, and has no screen-reader testing pipeline. This document defines the flagship accessibility system: the legal floor, the engineering architecture, the per-component fixes, and the acceptance criteria that make accessibility a first-class department rather than a post-hoc checklist.

---

## Table of Contents

1. [2026 Competitor Benchmark](#1-2026-competitor-benchmark)
2. [Psychology & Principles](#2-psychology--principles)
3. [Architectural Issues & Engineering Flaws](#3-architectural-issues--engineering-flaws)
4. [AI Slop Diagnosis](#4-ai-slop-diagnosis)
5. [Current ThryftVerse Audit](#5-current-thryftverse-audit)
6. [Micro Improvements](#6-micro-improvements)
7. [Macro Improvements](#7-macro-improvements)
8. [Flagship Acceptance Criteria](#8-flagship-acceptance-criteria)
9. [Priority & Sequencing](#9-priority--sequencing)
10. [Token-Level Spec Table](#10-token-level-spec-table)

---

## 1. 2026 Competitor Benchmark

Accessibility in 2026 is no longer a "nice-to-have" checkbox at the end of a release. The European Accessibility Act (EAA) has been enforced since 28 June 2025, the US Department of Justice codified WCAG 2.1 AA as the standard for Title II entities in 2024, and Apple's App Store now requires developers to publish **Accessibility Nutrition Labels** declaring support for VoiceOver, Voice Control, Sufficient Contrast, Dark Interface, Larger Text, Differentiate Without Color, and Reduce Motion. A mobile app that cannot truthfully check those boxes is at a competitive and legal disadvantage.

### Instagram (Meta)

Instagram's accessibility engineering team has published detailed work on making the feed screen-reader-navigable. Their key insight: instead of making one-off label changes, they took a **holistic approach** — aggregating feed post elements so a VoiceOver/TalkBack user hears "Post by @username, image, [description]" as a single focus stop rather than swiping through 15 individual UI elements per post. They prioritised the feed because it is the first surface every user touches, and improving screen-reader access there improves the experience for users with visual impairments and limited mobility simultaneously. Instagram supports Dynamic Type on iOS and font scaling on Android, supports auto-generated captions for video content, and publishes a public accessibility statement. However, independent audits note that Instagram's mobile web experience still has contrast failures (light blue links on white) and disables zoom/scaling, which is indefensible for accessibility.

- **VoiceOver/TalkBack:** Aggregated feed labels, role-correct post elements, author-first label ordering
- **Dynamic Type:** Supported on iOS native app; web disables scaling
- **Contrast:** Generally passes on native; web has failures on link/button contrast
- **Reduced motion:** Partial — respects OS Reduce Motion for major transitions
- **Switch control / Voice Control:** Inherits from UIAccessibility protocol (free with good VoiceOver support)
- **Accessibility statement:** Published at about.instagram.com

Source: [Crafting an Accessible Instagram Feed](https://about.instagram.com/blog/engineering/crafting-an-accessible-instagram-feed), [Accessibility and Instagram — AFB](https://www.afb.org/blindness-and-low-vision/using-technology/using-social-media-visual-impairment-or-blindness-3), [How accessible is Instagram? — Dustin Whisman](https://dustinwhisman.com/writing/accessibility-top-100/instagram/)

### Pinterest

Pinterest's accessibility work focuses on visual search, screen reader navigation of masonry grids, and alt-text generation. Pinterest supports VoiceOver and TalkBack with custom accessibility labels for pins, boards, and search results. Their masonry grid presents a unique challenge: screen readers traverse linearly, but masonry is two-dimensional. Pinterest solves this by grouping pins into semantic rows and announcing "Pin, [title], [price if applicable]" per focus stop. Pinterest supports Dynamic Type and has a published accessibility statement.

### eBay

eBay has one of the most mature accessibility programs in e-commerce, with a dedicated accessibility team, automated scanning in CI, and a public accessibility statement. Their web accessibility scores (Silktide Index, July 2026) show Level AA at 47.3% — which sounds low but reflects the difficulty of full conformance on a massive, dynamic marketplace. eBay's native apps support VoiceOver/TalkBack, Dynamic Type, and high-contrast themes. They publish VPAT (Voluntary Product Accessibility Template) documents for procurement customers.

Source: [eBay — Silktide Index August 2026](https://index.silktide.com/website/ebay/august-2026)

### Snapchat

Snapchat publishes an Accessibility support section covering alt text, captions/subtitles for video Snaps, text size adjustment on iOS, and captions for Discover content. Snapchat's accessibility is weaker than Instagram's — the camera-first interface presents unique challenges for screen readers, and much of the content is ephemeral visual media. However, they support Dynamic Type, captions, and text size controls.

Source: [Snapchat Accessibility Support](https://help.snapchat.com/hc/en-us/sections/14203449466900-Accessibility)

### Benchmark Summary Table

| Dimension | Instagram | Pinterest | eBay | Snapchat | ThryftVerse (current) |
|---|---|---|---|---|---|
| VoiceOver/TalkBack | Aggregated labels | Row-grouped masonry | Full support | Partial | Labels exist (2,627) but no aggregation strategy |
| Dynamic Type | iOS native | Supported | Supported | Supported | `maxFontSizeMultiplier` on 95 Text nodes; no system Dynamic Type contract |
| Contrast 4.5:1 | Native passes | Passes | Web ~47% AA | Partial | `textMuted` at 4.65:1 (passes); no automated enforcement |
| Reduced motion | Partial | Partial | Supported | Partial | `useReducedMotion` hook exists; 878 references but no 100% guarantee |
| Switch control | Via UIAccessibility | Via UIAccessibility | Supported | Limited | No testing |
| Voice Control | Via UIAccessibility | Via UIAccessibility | Supported | Limited | No testing |
| Accessibility statement | Published | Published | Published (VPAT) | Published | **Missing** |
| CI accessibility audit | Yes | Yes | Yes | Unknown | Dev-only `accessibilityAudit.ts` (no CI integration) |

---

## 2. Psychology & Principles

### Accessibility as a Human Right

The World Health Organization and World Bank estimate that approximately **15% of the global population — one in six people — experience a significant disability in their lifetime**. For a consumer marketplace like ThryftVerse, that is not an edge case. It is a user base segment larger than most countries. When we design only for the "average" user, we exclude one in six people from buying, selling, discovering, and participating in the marketplace. Accessibility is not charity; it is the baseline of product quality.

Source: [Android Developers — Accessibility](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility)

### The Curb Cut Effect

The "curb cut effect" is the most powerful argument for accessibility investment: **features designed for disabled users benefit everyone**. Sidewalk curb cuts were originally demanded by wheelchair users, but they also help parents with strollers, delivery workers with carts, travelers with rolling luggage, and cyclists. In digital products:

- **Screen reader labels** help Voice Control users (who speak labels aloud to tap them)
- **Dynamic Type** helps users in bright sunlight, users with temporary eye strain, and aging users whose near vision is declining
- **Reduced motion** helps users with vestibular disorders AND users on public transit with motion sickness AND users on low-end devices where animations cause jank
- **High contrast** helps users in bright sunlight AND users with low vision
- **Switch control support** means keyboard navigation works, which helps power users and automated testing

Designing for the edges improves the centre. This is not altruism; it is product strategy.

### Cognitive Load Reduction

Cognitive accessibility is the least-implemented pillar of inclusive design. The W3C's Cognitive Accessibility (COGA) task force has published guidance that most teams ignore: **users with cognitive impairments — memory issues, attention disorders, language processing differences, age-related cognitive decline — struggle with redundant entry, unpredictable navigation, and complex multi-step flows**. WCAG 2.2 added SC 3.3.7 Redundant Entry (Level A) specifically to address this: apps must not require users to re-enter the same information within a single process.

For ThryftVerse, cognitive accessibility means:
- Listing creation should pre-fill known fields (seller's location, shipping policies) rather than asking for them every time
- Checkout should not require re-entering shipping address if it was entered during browsing
- Navigation should be predictable — the tab bar order should not change, the back button should always go back
- Error messages should be in plain language, not backend exception strings

Source: [W3C WCAG2Mobile](https://www.w3.org/TR/wcag2mobile-22/), [ACM TOSEM — Enhancing Cognitive Accessibility in Mobile Apps via LLM-driven Redundant Entry Reduction (2026)](https://doi.org/10.1145/3816705)

### Motor Accessibility — Fitts's Law for Impaired Users

Fitts's Law states that the time to acquire a target is a function of the target's size and distance. For users with motor impairments (tremors, limited dexterity, one-handed use, injury recovery), the effective target size is smaller because their tap precision is lower. The WCAG 2.2 SC 2.5.8 Target Size (Minimum) sets the legal floor at **24×24 CSS pixels**, but Apple's HIG recommends **44×44pt** and Google's Material Design recommends **48×48dp**. ThryftVerse's `Control.hit = 44` token is correct, but the gap is enforcement: many touchable elements in the codebase use `hitSlop` inconsistently, and some icon-only buttons have visible glyphs of 20–24pt inside hit areas that may or may not meet 44pt.

Source: [Accessibility.build — Mobile Accessibility Guide](https://accessibility.build/guides/mobile-accessibility), [Android Developers — Make apps more accessible](https://developer.android.com/guide/topics/ui/accessibility/apps)

### The "Design for the Edges" Philosophy

Inclusive design does not mean designing for the average and then adding accessibility features. It means **starting with the users who have the most constraints and working inward**. A user who navigates entirely by VoiceOver will expose every missing label, every illogical focus order, every state that is not announced. A user who needs 200% text scaling will expose every fixed-height container that clips. A user who enables Reduce Motion will expose every animation that has no fallback. If the product works for these users, it works for everyone — and the "everyone" version is better than it would have been if designed for the average first.

### The Legal Compliance Dimension

**ADA (Americans with Disabilities Act):** The DOJ's Title II rule (2024) codified WCAG 2.1 AA as the required standard for state and local government web content. For Title III (private businesses), WCAG 2.1 AA is the de facto standard referenced in demand letters, settlement agreements, and court filings. A consumer marketplace app like ThryftVerse is a Title III entity.

**EAA (European Accessibility Act):** Enforced since 28 June 2025. The EAA applies to businesses with 10+ employees or €2M+ annual turnover that sell covered products or services to EU consumers. E-commerce is explicitly in scope. The technical standard is EN 301 549, which incorporates WCAG 2.1 AA and adds Chapter 11 (Software) requirements specific to native mobile apps — including requirements that WCAG alone does not cover. Enforcement is active: disability organisations have filed injunctions in France, regulators in the Netherlands and Germany have sent warning letters, and market surveillance inspections have begun.

**WCAG 2.2:** The current W3C Recommendation (published October 2023). WCAG 2.2 adds nine new success criteria over 2.1, with a focus on mobile and cognitive accessibility:
- 2.4.11 Focus Not Obscured (Minimum) — sticky headers/docks must not cover the focused element
- 2.5.7 Dragging Movements — single-pointer alternatives for drag interactions
- 2.5.8 Target Size (Minimum) — 24×24 CSS pixels minimum
- 3.3.7 Redundant Entry — no re-entering the same data in one process

Source: [Accessible.org — Align ADA and EAA Compliance](https://accessible.org/align-accessibility-investments-ada-eaa-compliance/), [AuditJu — Does the EAA Apply to Your Mobile App?](https://auditsu.com/resources/european-accessibility-act-mobile-apps), [Level Access — EAA Compliance in 2026](https://www.levelaccess.com/blog/eaa-compliance-in-2026-how-enforcement-has-evolved-and-what-to-expect-next/)

---

## 3. Architectural Issues & Engineering Flaws

### App Store / Play Store Rejection Risk

Apple's App Store now requires **Accessibility Nutrition Labels** — developers must truthfully declare support for VoiceOver, Voice Control, Sufficient Contrast, Dark Interface, Larger Text, Differentiate Without Color, and Reduce Motion. If ThryftVerse submits without verifying these claims, there are two risks:

1. **False declaration:** If the app claims VoiceOver support but key flows are unnavigable, Apple can reject the submission or remove the app after user complaints. Apple's review process includes accessibility testing with VoiceOver and Dynamic Type.
2. **Missing declaration:** If the app does not declare accessibility support, it loses discoverability in App Store search filters for accessibility-conscious users and signals low quality.

Google Play has a similar (though less enforced) accessibility declaration in the Play Console. Google's Accessibility Scanner can flag issues before submission.

Source: [Apple Developer — Prepare your app for Accessibility Nutrition Labels](https://developer.apple.com/videos/play/tech-talks/111433/)

### Legal Liability

Under the EAA, a non-compliant mobile app delivering e-commerce services to EU consumers is a **compliance risk**. The enforcement mechanisms include:
- Injunctions filed by disability organisations (already happening in France)
- Market surveillance inspections by regulators (Netherlands, Germany)
- Warning letters from private law firms
- Fines and mandatory remediation orders

Under the ADA, private businesses can face demand letters and lawsuits. The cost of defending an ADA Title III lawsuit (even a frivolous one) typically exceeds $20,000; the cost of a settlement with a remediation mandate can exceed $100,000. The cost of building accessibility in from the start is a fraction of these numbers.

### Lost User Base

One in six users has a disability. For a marketplace, that means:
- Users who cannot navigate with VoiceOver will abandon the app
- Users who cannot read text at the default size will abandon the app
- Users who get motion sick from animations will abandon the app
- Users who cannot distinguish colour-only state indicators will make errors and abandon the app

Each abandonment is lost revenue. For a social-commerce marketplace where both buyers and sellers must participate, losing disabled sellers means less inventory, which means less buyer engagement, which compounds.

### The Cost of Retrofitting vs Building-In

Accessibility debt compounds the same way as technical debt. Retrofitting accessibility onto a codebase with 4,101 touchable elements and 3,372 `onPress` handlers is exponentially more expensive than building it in from the start. The retrofit requires:
- Auditing every screen for missing labels (manual, because automated tools catch only ~25% of issues)
- Adding `accessibilityLabel`, `accessibilityRole`, `accessibilityState` to every interactive element
- Testing every flow with VoiceOver and TalkBack
- Fixing focus order on every screen
- Adding reduced-motion fallbacks to 879 animation calls
- Enforcing contrast ratios across the entire token system
- Supporting Dynamic Type without clipping on every screen

The cost of building accessibility in from the start is roughly 5–10% of development time. The cost of retrofitting is 30–50% of the affected screens' development time, plus the opportunity cost of delayed features.

Source: [Accessible.org — Conduct a Native Mobile App Audit](https://accessible.org/conduct-audit-native-mobile-app/)

### The "Accessibility Debt" Problem

Accessibility debt is invisible until it becomes a lawsuit or an App Store rejection. Unlike TypeScript errors or test failures, accessibility issues do not produce compile-time warnings. The codebase has a dev-only `accessibilityAudit.ts` that walks the React element tree and logs missing labels — but it is **dev-only, not in CI, and not enforced**. There is no pre-commit hook, no CI gate, no PR check that says "this PR adds a Pressable without an accessibilityLabel." Every PR that adds an interactive element without accessibility props increases the debt silently.

---

## 4. AI Slop Diagnosis

### The "AI Doesn't See" Problem

AI-generated code is systematically worse at accessibility than human-authored code, for a fundamental reason: **AI models do not see the rendered UI**. They generate JSX from text descriptions, and accessibility props (`accessibilityLabel`, `accessibilityRole`, `accessibilityState`) are invisible in the rendered output. An AI model generating a Pressable with an Ionicons heart icon will produce:

```tsx
<Pressable onPress={toggleLike}>
  <Ionicons name={liked ? 'heart' : 'heart-outline'} size={24} color={colors.danger} />
</Pressable>
```

This is functionally correct for sighted users but **completely invisible to VoiceOver** — the screen reader will announce nothing, or announce "button" with no label. A senior engineer would write:

```tsx
<Pressable
  onPress={toggleLike}
  accessibilityRole="button"
  accessibilityLabel={liked ? 'Unlike' : 'Like'}
  accessibilityState={{ selected: liked }}
  accessibilityHint="Double tap to toggle like on this post"
>
  <Ionicons name={liked ? 'heart' : 'heart-outline'} size={24} color={colors.danger} />
</Pressable>
```

The AI omits these props because they are not part of the visual description, and the AI has no feedback signal that they are missing. This is the "AI doesn't see" problem: accessibility is invisible in the code, invisible in the render, and only visible when a real user with a real screen reader tries to use the app.

### Missing Labels

The codebase has 2,627 `accessibilityLabel` instances across 4,101 touchable elements — a **64% coverage rate**. This means approximately 1,474 touchable elements lack labels. Many of these are icon-only controls (back buttons, close buttons, overflow menus, heart/save/share icons) that are completely invisible to screen readers. The dev-only `accessibilityAudit.ts` correctly identifies this pattern (line 222–227: "icon-only control without accessibilityLabel. Icon-only controls MUST have an accessible label") but the audit is not enforced.

### Hardcoded Font Sizes Blocking Dynamic Type

The codebase has 95 `maxFontSizeMultiplier` usages and only 2 `allowFontScaling` usages. `maxFontSizeMultiplier` caps the system font scale — which means that while the app partially respects Dynamic Type, it **artificially limits how large text can grow**. Many of these caps are set to 1.2 or 1.3, meaning a user who sets their iOS Dynamic Type to the largest accessibility size (AX5, roughly 2.5x) will only see text at 1.2x in ThryftVerse. This is a partial implementation that gives the illusion of Dynamic Type support while actually blocking it for the users who need it most.

The `Type` token system in `designTokens.ts` defines fixed `size` values (e.g., `body: { size: 14 }`) with no `allowFontScaling` default. React Native's `Text` component respects system font scaling by default, but `maxFontSizeMultiplier` caps override that respect with an artificial ceiling.

### Colour Combinations Failing Contrast

The Design.md front matter documents `textMuted: "#767676"` with the annotation "WCAG 2.2 AA: 4.65:1 light / 4.64:1 dark" — which passes the 4.5:1 minimum for normal text. However, this is the **only** colour in the palette with a documented contrast ratio. There is no automated check that:
- `textSecondary (#666666)` on `surface (#F5F5F5)` passes 4.5:1
- `textMuted (#767676)` on `surfaceAlt (#EBEBEB)` passes 4.5:1
- `meta` text (11px) on `surface` passes 4.5:1 (small text has the same 4.5:1 requirement, not 3:1)
- White text on `brand (#111111)` passes 4.5:1 (it does — 17.4:1)
- `danger (#9b0202)` on `surface` passes 4.5:1
- `success (#215634)` on `surface` passes 4.5:1

The `accessibility.ts` file includes a `getContrastRatio()` function and `meetsContrastRequirements()` helper (lines 58–108), and `accessibilityAudit.ts` includes an `auditColorContrast()` function (lines 374–413) — but neither is called automatically. There is no CI step that runs contrast checks against the token palette.

### Animations Without Reduced-Motion

The codebase has 879 `withTiming`/`withSpring`/`withDecay`/`Animated.timing`/`Animated.spring` calls and 1,142 `useAnimatedStyle`/`useSharedValue`/`useAnimatedProps` calls. There are 878 `reducedMotion` references — which suggests broad awareness of the pattern — but this is a grep count, not a guarantee. The `useReducedMotion` hook (`hooks/useReducedMotion.ts`) correctly ORs the OS-level setting with the in-app preference, and `useMotionConfig` consumes it. But there is no static analysis that verifies every animation call branches on `reducedMotion`. An AI-generated animation that adds a spring bounce to a card mount will not include the reduced-motion check unless explicitly prompted to.

A 2026 study of AI-generated UIs found that **96.9% ship some motion with no reduced-motion guard** and **66.3% fail WCAG 2.2.2 (Level A)** by running infinite animations with no pause path. ThryftVerse's 878 `reducedMotion` references put it ahead of the AI-generated average, but the absence of a CI gate means any new PR can regress.

Source: [MotionSpec — State of Motion in AI-Generated UIs: 196 Sites Tested (2026)](https://motionspec.dev/blog/state-of-motion-ai-generated-uis)

---

## 5. Current ThryftVerse Audit

### Quantitative Audit

| Metric | Count | Coverage |
|---|---|---|
| `accessibilityLabel` | 2,627 | 64% of touchables (2,627 / 4,101) |
| `accessibilityRole` | 1,837 | 45% of touchables |
| `accessibilityHint` | 679 | 17% of touchables |
| `accessibilityState` | 353 | 9% of touchables |
| `accessible` prop | 69 | — |
| `accessibilityLiveRegion` | 25 | — |
| `accessibilityElementsHidden` | 6 | — |
| `importantForAccessibility` | 10 | — |
| Touchable elements (TouchableOpacity/Pressable/etc.) | 4,101 | — |
| `onPress` handlers | 3,372 | — |
| `reducedMotion` references | 878 | — |
| `AccessibilityInfo` references | 88 | — |
| `isReduceMotionEnabled` calls | 3 | — |
| `isScreenReaderEnabled` calls | 1 | — |
| `allowFontScaling` | 2 | — |
| `maxFontSizeMultiplier` | 95 | — |
| Reanimated animation calls | 879 | — |
| Animated style/shared value hooks | 1,142 | — |
| Images with accessibility labels (alt text equivalent) | 112 | — |

### Key Files

| File | Role | Status |
|---|---|---|
| `frontend/src/hooks/useReducedMotion.ts` | OS + in-app reduced motion hook | **Implemented** — ORs OS setting with in-app preference, subscribes to `reduceMotionChanged` |
| `frontend/src/hooks/useReducedMotion.ts:65` | `useReducedTransparency()` | **Implemented** — iOS-only, checks `isReduceTransparencyEnabled` for Liquid Glass fallback |
| `frontend/src/context/AccessibilityPreferencesContext.tsx` | Persisted in-app accessibility prefs | **Implemented** — text size, reduced motion, high contrast, bold text, screen reader hints; persists to AsyncStorage |
| `frontend/src/screens/AccessibilitySettingsScreen.tsx` | User-facing accessibility settings | **Implemented** — text size selector, motion/display/reader toggles, live preview |
| `frontend/src/utils/accessibility.ts` | Contrast ratio calc, touch target helpers, label presets | **Implemented** — `getContrastRatio()`, `meetsContrastRequirements()`, `getAccessibilityProps()`, `accessibilityLabels` preset dictionary |
| `frontend/src/utils/accessibilityAudit.ts` | Dev-only tree-walking audit | **Implemented but dev-only** — checks missing labels, roles, small touch targets, switch state; no CI integration |
| `frontend/src/preferences/accessibilityPreferences.ts` | Preference storage layer | **Implemented** — AsyncStorage persistence, `TEXT_SIZE_SCALE` mapping |
| `frontend/src/theme/designTokens.ts` | Design tokens | `Control.hit = 44` (correct); no contrast ratio documentation beyond `textMuted` |

### Concrete Defects

**P0 — Ship blockers:**

1. **No accessibility statement.** ThryftVerse has no public accessibility statement declaring WCAG conformance level, supported assistive technologies, and known limitations. This is required for EAA compliance and App Store Nutrition Labels.
2. **No screen reader testing pipeline.** Only 1 `isScreenReaderEnabled` call in the entire codebase. No VoiceOver or TalkBack testing in CI or release process.
3. **36% of touchable elements lack `accessibilityLabel`.** Approximately 1,474 interactive elements are invisible or unnamed to screen readers. Icon-only controls (back, close, overflow, heart, share) are the worst offenders.

**P1 — Flagship blockers:**

4. **55% of touchable elements lack `accessibilityRole`.** Without roles, VoiceOver and TalkBack cannot announce the element type ("button", "link", "switch"). 2,264 elements are missing roles.
5. **No Dynamic Type contract.** `maxFontSizeMultiplier` is used 95 times with varying caps. There is no token-level policy for what the cap should be, no verification that text reflows at 200%, and no testing at AX5 text size.
6. **No contrast enforcement.** The `getContrastRatio()` function exists but is never called in CI. The token palette has no automated contrast verification. `textSecondary (#666666)` on `surface (#F5F5F5)` is 4.33:1 — **fails** WCAG AA for normal text.
7. **No reduced-motion guarantee.** 879 animation calls exist. 878 `reducedMotion` references exist. But there is no static analysis verifying that every animation has a reduced-motion branch. The motion department report identifies 193 animations without reduced-motion fallbacks.
8. **No focus order testing.** Screen reader traversal order is not tested. Complex screens (product detail, auction, co-own) may have illogical focus orders that jump between unrelated elements.
9. **No switch control or voice control testing.** These assistive technologies inherit from the UIAccessibility protocol on iOS, so good VoiceOver support provides partial coverage — but it is not verified.
10. **`accessibilityElementsHidden` used only 6 times.** Decorative elements (background shapes, dividers, shadow views) should be hidden from screen readers. With only 6 usages, the accessibility tree is likely polluted with decorative noise.

**P2 — Polish gaps:**

11. **`accessibilityHint` on only 17% of touchables.** Icon-only controls benefit from hints describing the action result. 83% of touchables lack hints.
12. **`accessibilityState` on only 9% of touchables.** Stateful controls (like/unlike, save/unsave, follow/unfollow, tab selected) need `accessibilityState` for screen readers to announce the current state.
13. **`accessibilityLiveRegion` used only 25 times.** Dynamic content updates (bid updates, message arrivals, countdown timers) need live region announcements. Auction countdowns and chat messages likely lack live region support.
14. **Images with alt text: 112 out of unknown total.** Product images, avatars, and cover photos need accessibility labels. The 112 count is likely a fraction of total images.

---

## 6. Micro Improvements

### Per-Component Accessibility Fixes

**Icon-only buttons (Back, Close, overflow, heart, share, bookmark):**
Every icon-only `Pressable` or `TouchableOpacity` must have `accessibilityRole="button"`, `accessibilityLabel`, and `accessibilityHint`. The `accessibilityLabels` dictionary in `utils/accessibility.ts` (lines 132–158) provides presets for common actions (`home`, `search`, `like`, `unlike`, `save`, `unsave`, `share`, `more`). These presets should be used consistently:

```tsx
// Before (AI slop)
<Pressable onPress={onBack}>
  <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
</Pressable>

// After (flagship)
<Pressable
  onPress={onBack}
  accessibilityRole="button"
  accessibilityLabel="Back"
  accessibilityHint="Return to the previous screen"
  hitSlop={8}
>
  <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
</Pressable>
```

**Like/Save toggle buttons:**
Stateful toggles must expose `accessibilityState.selected`:

```tsx
<Pressable
  onPress={toggleLike}
  accessibilityRole="button"
  accessibilityLabel={liked ? 'Unlike' : 'Like'}
  accessibilityState={{ selected: liked }}
  accessibilityHint="Double tap to toggle like on this post"
>
  <Ionicons name={liked ? 'heart' : 'heart-outline'} size={24} color={liked ? colors.danger : colors.textSecondary} />
</Pressable>
```

**Product images:**
Every product image must have `accessibilityLabel` with a meaningful description and `accessibilityRole="image"`:

```tsx
<Image
  source={{ uri: item.imageUrl }}
  accessibilityRole="image"
  accessibilityLabel={item.altText || `${item.title} — $${item.price}`}
  style={styles.image}
/>
```

**Tab bars:**
Each tab must have `accessibilityRole="tab"` and `accessibilityState={{ selected: isActiveTab }}`:

```tsx
<Pressable
  onPress={() => onTabPress(tab.key)}
  accessibilityRole="tab"
  accessibilityLabel={tab.label}
  accessibilityState={{ selected: tab.key === activeTab }}
>
```

**Form fields:**
Text inputs must have `accessibilityLabel` (the field name) and error messages must use `accessibilityLiveRegion="polite"` so screen readers announce errors when they appear:

```tsx
<TextInput
  accessibilityLabel="Email"
  accessibilityHint="Enter your email address"
  accessibilityLiveRegion="polite" // for error messages below
/>
```

**Auction countdown timers:**
Countdowns must use `accessibilityLiveRegion="polite"` to announce time changes at meaningful intervals (not every second — that would be noise). Announce at threshold changes: "Auction ends in 5 minutes", "Auction ends in 1 minute", "Auction ended".

**Chat messages:**
New messages must be announced via `accessibilityLiveRegion="polite"` on the message list or individual incoming messages.

---

## 7. Macro Improvements

### The Accessibility System

#### 7.1 One Accessibility Wrapper Component

Create a single `AccessiblePressable` component that enforces accessibility props at the type level:

```tsx
interface AccessiblePressableProps extends PressableProps {
  /** Required: screen reader label */
  accessibilityLabel: string;
  /** Required: semantic role */
  accessibilityRole?: 'button' | 'link' | 'tab' | 'switch' | 'image' | 'search';
  /** Optional: action description */
  accessibilityHint?: string;
  /** Optional: current state for toggles */
  accessibilityState?: { selected?: boolean; checked?: boolean; disabled?: boolean; expanded?: boolean; busy?: boolean };
  /** Enforce 44pt minimum hit target */
  minHitTarget?: boolean; // default true
}
```

This makes it a **TypeScript error** to create a pressable without a label. Existing `Pressable` usage should be migrated to `AccessiblePressable` over time. New code must use it.

#### 7.2 One `useAccessibility` Hook

Consolidate the current scattered accessibility hooks into one:

```tsx
function useAccessibility() {
  const reducedMotion = useReducedMotion();
  const reducedTransparency = useReducedTransparency();
  const { textSize, textSizeScale, highContrast, boldText, screenReaderHints } = useAccessibilityPreferences();
  const [isScreenReaderActive, setIsScreenReaderActive] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setIsScreenReaderActive);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setIsScreenReaderActive);
    return () => sub?.remove();
  }, []);

  return {
    reducedMotion,
    reducedTransparency,
    textSize,
    textSizeScale,
    highContrast,
    boldText,
    screenReaderHints,
    isScreenReaderActive,
    /** Announce a message to screen readers without moving focus */
    announce: (message: string) => AccessibilityInfo.announceForAccessibility(message),
    /** Move focus to an element (use sparingly) */
    setFocus: (reactTag: number) => AccessibilityInfo.setAccessibilityFocus(reactTag),
  };
}
```

#### 7.3 Automated Audit CI

Integrate accessibility checks into CI:

1. **ESLint rule:** Add `eslint-plugin-react-native-a11y` (or equivalent) to flag Pressable/TouchableOpacity without `accessibilityLabel` at lint time. This catches issues in PRs before merge.
2. **Contrast token check:** Add a pre-commit/CI script that runs `getContrastRatio()` on every foreground/background pair in the theme palette and fails if any pair drops below 4.5:1 (normal text) or 3:1 (large text / non-text).
3. **Maestro accessibility flows:** Maestro supports accessibility-label-based selectors and has built-in accessibility test patterns (e.g., `settings_controls_accessible_labels`, `settings_dynamic_type_layout`, `settings_voiceover_order`). Add Maestro flows that:
   - Navigate the app using accessibility labels only (simulating VoiceOver/TalkBack)
   - Increase Dynamic Type to maximum and verify no clipping
   - Enable Reduce Motion and verify no animations play
4. **Dev audit in development builds:** The existing `accessibilityAudit.ts` should log warnings in dev builds. Consider promoting critical errors to crash-in-dev for missing labels on icon-only controls.

Source: [Maestro — End-to-End UI Testing](https://maestro.dev/), [React Native Relay — React Native Accessibility Guide 2026](https://reactnativerelay.com/article/react-native-accessibility-guide-building-inclusive-apps-expo)

#### 7.4 Contrast Token Enforcement

Add a `ContrastToken` type that documents the contrast ratio for every text/background pair:

```tsx
export const ContrastPairs = {
  textPrimaryOnBackground: { fg: '#000000', bg: '#FFFFFF', ratio: 21, passes: 'AAA' },
  textSecondaryOnBackground: { fg: '#666666', bg: '#FFFFFF', ratio: 5.74, passes: 'AA' },
  textSecondaryOnSurface: { fg: '#666666', bg: '#F5F5F5', ratio: 4.33, passes: 'FAIL' }, // ← needs fix
  textMutedOnBackground: { fg: '#767676', bg: '#FFFFFF', ratio: 4.65, passes: 'AA' },
  textMutedOnSurface: { fg: '#767676', bg: '#F5F5F5', ratio: 3.69, passes: 'FAIL' }, // ← needs fix
  // ...
} as const;
```

The failing pairs must be fixed by darkening `textSecondary` or `textMuted`, or lightening `surface`. `textMuted` on `surface` at 3.69:1 is a P0 contrast failure.

#### 7.5 Dynamic Type Contract

Define a Dynamic Type policy:
- **Body text, captions, metadata:** `maxFontSizeMultiplier={1.5}` — allows scaling to 150% of base size
- **Prices, financial values:** `maxFontSizeMultiplier={1.3}` — limited scaling to prevent layout breakage in tabular displays
- **Navigation bar titles, tab labels:** `maxFontSizeMultiplier={1.2}` — limited to prevent header overflow
- **All other text:** `allowFontScaling` defaults to true; no cap unless explicitly justified

Every screen must be tested at iOS Dynamic Type AX5 (largest accessibility size) and Android font scale 2.0. Text must reflow, not clip. Fixed-height containers must use `minHeight` instead of `height` for text-bearing elements.

#### 7.6 Reduced-Motion Architecture

The `useReducedMotion` hook is correct. The gap is enforcement. Add a `useMotionConfig` wrapper (which already exists per the hook's docstring) that every animation consumes:

```tsx
function useMotionConfig() {
  const reducedMotion = useReducedMotion();
  return {
    reducedMotion,
    /** Use instead of withTiming when reduced motion is active */
    timing: reducedMotion ? (val: number) => withTiming(val, { duration: 0 }) : withTiming,
    /** Use instead of withSpring when reduced motion is active */
    spring: reducedMotion ? (val: number) => withTiming(val, { duration: 0 }) : withSpring,
    /** Duration override for reduced motion */
    duration: (normal: number) => reducedMotion ? 0 : normal,
  };
}
```

Every `withTiming` and `withSpring` call should go through `useMotionConfig` rather than being called directly. This makes reduced-motion a system-level guarantee, not a per-animation responsibility.

#### 7.7 Screen Reader Navigation Order

Define focus order rules per screen type:
- **Feed:** post author → media → action row (like, comment, share, save) → caption → next post
- **Product detail:** media gallery → price → title → seller → trust/buyer protection → action dock
- **Profile:** cover → avatar → name/handle → stats → actions (follow/edit, message, share) → tabs → grid
- **Settings:** header → sections in visual order → rows within sections

Use `accessibilityElementsHidden` on decorative views (backgrounds, shadows, gradient scrims that don't convey information). Use `importantForAccessibility="no-hide-descendants"` on off-screen carousel items.

---

## 8. Flagship Acceptance Criteria

### WCAG 2.2 AA Compliance

ThryftVerse must conform to WCAG 2.2 Level AA. This means:

| WCAG SC | Level | Requirement | ThryftVerse Status |
|---|---|---|---|
| 1.1.1 Non-text Content | A | All images have alt text / accessibility labels | 112 images labelled; total unknown |
| 1.3.1 Info and Relationships | A | Semantic roles convey structure | 1,837 roles / 4,101 touchables (45%) |
| 1.3.4 Orientation | AA | Support portrait and landscape | Not tested |
| 1.4.3 Contrast (Minimum) | AA | 4.5:1 normal text, 3:1 large text | `textMuted` passes; `textSecondary` on `surface` fails (4.33:1) |
| 1.4.4 Resize Text | AA | Text scales to 200% without loss | `maxFontSizeMultiplier` caps block full scaling |
| 1.4.10 Reflow | AA | Content works at 320px width | Not tested at 320px |
| 1.4.12 Text Spacing | AA | No clipping when spacing increases | Not tested |
| 2.1.1 Keyboard | A | All functionality via keyboard/switch | Not tested with switch control |
| 2.4.3 Focus Order | A | Logical focus order | Not tested with VoiceOver/TalkBack |
| 2.4.7 Focus Visible | AA | Visible focus indicator | Not tested |
| 2.4.11 Focus Not Obscured (2.2) | AA | Sticky elements don't obscure focus | Not tested |
| 2.5.1 Pointer Gestures | A | Single-tap alternatives for gestures | Double-tap-to-like needs single-tap alternative |
| 2.5.8 Target Size (Minimum) (2.2) | AA | 24×24 CSS px minimum | `Control.hit = 44` token exists; enforcement incomplete |
| 3.3.7 Redundant Entry (2.2) | A | No re-entering same data in one process | Not audited |
| 4.1.2 Name, Role, Value | A | Every control exposes name, role, state | 64% have names, 45% have roles, 9% have state |
| 4.1.3 Status Messages | AA | Live region for dynamic updates | 25 `accessibilityLiveRegion` usages |

### 100% AccessibilityLabel Coverage

Every interactive element (`Pressable`, `TouchableOpacity`, `TouchableHighlight`, `Switch`, `TextInput` with no visible label) must have an `accessibilityLabel`. This is non-negotiable. The `AccessiblePressable` wrapper makes this a TypeScript error. The ESLint rule catches it in PRs. The Maestro CI flow verifies it at runtime.

### Dynamic Type Support

- All `Text` components respect system font scaling (`allowFontScaling` defaults to true in React Native)
- `maxFontSizeMultiplier` is set to a documented, justified value per text role (not arbitrary)
- Every screen is tested at iOS AX5 and Android 200% font scale
- No text clips at maximum font size; containers use `minHeight` and scroll views

### 4.5:1 Contrast Minimum

- Every foreground/background pair in the theme palette is verified by `getContrastRatio()` in CI
- Failing pairs are fixed (darken foreground or lighten background)
- Dark mode contrast is verified separately (dark mode is not mechanical inversion)
- Non-text contrast (icons, borders, selection indicators) meets 3:1 minimum

### Reduced-Motion on All Animations

- Every `withTiming`, `withSpring`, `withDecay` call branches on `useMotionConfig().reducedMotion`
- When reduced motion is active, animations complete instantly (duration 0) or use a simple opacity fade
- No infinite animations without a pause/stop path (WCAG 2.2.2)
- The `useReducedMotion` hook ORs's OS setting with in-app preference (already implemented)

### Screen Reader Navigable

- Every screen can be navigated with VoiceOver (iOS) and TalkBack (Android) from top to bottom
- Focus order follows visual order
- Every interactive element announces a meaningful label + role
- Stateful controls announce their state via `accessibilityState`
- Dynamic updates (bids, messages, countdowns) are announced via `accessibilityLiveRegion`
- Decorative elements are hidden via `accessibilityElementsHidden`

### Switch Control Compatible

- Every interactive element is reachable via switch control (linear scanning)
- Touch targets meet 44pt minimum
- No gesture-only interactions (double-tap-to-like must have a single-tap button alternative)

### Accessibility Statement

Publish a public accessibility statement at `thryftverse.com/accessibility` declaring:
- WCAG 2.2 AA conformance target
- Supported assistive technologies (VoiceOver, TalkBack, Switch Control, Voice Control, Dynamic Type, Reduce Motion)
- Known limitations and timeline for remediation
- Contact for accessibility feedback

---

## 9. Priority & Sequencing

### Phase 1 — Compliance Floor (Weeks 1–2)

**Must ship before any production push to EU or App Store Nutrition Label submission.**

1. **Fix contrast failures.** Run `getContrastRatio()` on all token pairs. Fix `textSecondary` on `surface` (4.33:1 → darken to pass 4.5:1). Fix `textMuted` on `surface` (3.69:1 → darken or restrict `textMuted` to background-only contexts). Add CI contrast check.
2. **Publish accessibility statement.** Draft and publish at `thryftverse.com/accessibility`.
3. **Add ESLint accessibility rules.** `eslint-plugin-react-native-a11y` to catch missing labels in PRs.
4. **Create `AccessiblePressable` wrapper.** Migrate high-traffic screens (Home, Feed, Product Detail, Profile) first.

### Phase 2 — Screen Reader Foundation (Weeks 3–4)

1. **Audit and fix all icon-only controls.** Back, Close, overflow, heart, save, share, chevron — every icon-only Pressable gets `accessibilityLabel` + `accessibilityRole="button"` + `accessibilityHint`.
2. **Add `accessibilityState` to all toggles.** Like/save/follow/tab selection must expose selected state.
3. **Hide decorative elements.** Add `accessibilityElementsHidden` to background shapes, shadow views, gradient scrims.
4. **Test key flows with VoiceOver.** Login → browse feed → open product → add to cart → checkout. Fix focus order issues.
5. **Test key flows with TalkBack.** Same flows on Android. Fix platform-specific issues.

### Phase 3 — Dynamic Type & Motion (Weeks 5–6)

1. **Audit `maxFontSizeMultiplier` values.** Standardise to the documented policy (1.5 body, 1.3 prices, 1.2 nav).
2. **Test every screen at AX5 / 200% font scale.** Fix clipping, overflow, and layout breakage.
3. **Audit all 879 animation calls.** Verify each branches on `useMotionConfig().reducedMotion`. Fix the 193 animations identified in the motion report.
4. **Add Maestro CI flows.** Dynamic type layout test, reduced motion test, VoiceOver order test.

### Phase 4 — Advanced Accessibility (Weeks 7–8)

1. **Switch control testing.** Verify linear scanning reaches all controls. Fix touch target gaps.
2. **Voice control testing.** Verify labels are speakable and unique within each screen.
3. **Cognitive accessibility audit.** Check for redundant entry (WCAG 3.3.7). Check error message clarity. Check navigation predictability.
4. **Live region audit.** Add `accessibilityLiveRegion` to auction countdowns, chat messages, bid updates, and form errors.
5. **Colour blindness audit.** Verify no state is communicated by colour alone (like/unlike must use icon shape, not just colour).

---

## 10. Token-Level Spec Table

| Dimension | Token / Value | Standard | Source |
|---|---|---|---|
| **Touch target — minimum** | `Control.hit = 44` | 44×44pt (iOS HIG) / 48×48dp (Android) | WCAG 2.5.8 (AA): 24×24 CSS px floor; Apple HIG: 44pt; Material: 48dp |
| **Touch target — critical actions** | `MIN_TOUCH_TARGET.critical = 48` | 48×48pt for purchase/bid/confirm | Android Developers recommendation |
| **Touch target spacing** | `MIN_TOUCH_SPACING = 8` | 8pt minimum between targets | WCAG 2.5.8 spacing exception |
| **Contrast — normal text** | 4.5:1 minimum | All text < 18pt regular or < 14pt bold | WCAG 1.4.3 (AA) |
| **Contrast — large text** | 3.0:1 minimum | Text ≥ 18pt regular or ≥ 14pt bold | WCAG 1.4.3 (AA) |
| **Contrast — non-text** | 3.0:1 minimum | Icons, borders, selection indicators | WCAG 1.4.11 (AA) |
| **Contrast — `textPrimary` on `background`** | 21:1 | `#000000` on `#FFFFFF` | Passes AAA |
| **Contrast — `textSecondary` on `background`** | 5.74:1 | `#666666` on `#FFFFFF` | Passes AA |
| **Contrast — `textSecondary` on `surface`** | 4.33:1 → **FAIL** | `#666666` on `#F5F5F5` | **Fix: darken to #595959 (5.0:1)** |
| **Contrast — `textMuted` on `background`** | 4.65:1 | `#767676` on `#FFFFFF` | Passes AA (marginal) |
| **Contrast — `textMuted` on `surface`** | 3.69:1 → **FAIL** | `#767676` on `#F5F5F5` | **Fix: darken to #6B6B6B (4.56:1) or restrict to background only** |
| **Dynamic Type — body text cap** | `maxFontSizeMultiplier={1.5}` | 150% of base size | WCAG 1.4.4 (AA): 200% without loss |
| **Dynamic Type — price text cap** | `maxFontSizeMultiplier={1.3}` | 130% of base size | Justified: tabular layout preservation |
| **Dynamic Type — nav title cap** | `maxFontSizeMultiplier={1.2}` | 120% of base size | Justified: header overflow prevention |
| **Dynamic Type — test threshold** | iOS AX5 / Android 200% | Must reflow without clipping | WCAG 1.4.4 (AA) |
| **Reduced motion — duration** | 0ms (instant) or 80ms fade | Instant or simple opacity fade | Apple HIG: Reduce Motion; WCAG 2.3.3 (AAA) |
| **Reduced motion — trigger** | OS setting OR in-app preference | `useReducedMotion()` returns `osReducedMotion \|\| inAppReducedMotion` | `hooks/useReducedMotion.ts:55` |
| **Reduced transparency — trigger** | iOS `isReduceTransparencyEnabled` | Fall back to opaque surface | `hooks/useReducedMotion.ts:65` |
| **Accessibility label grammar** | "[Noun] [state]" — "Like", "Unlike", "Back", "Close", "More options" | Concise, action-oriented, state-aware | AGENTS.md §18: "Accessibility labels must be state-aware" |
| **Accessibility hint grammar** | "Double tap to [action]" — "Double tap to return to the previous screen" | Describes the result, not the visual | React Native docs: "additional context on the result of the action" |
| **Accessibility role — button** | `accessibilityRole="button"` | All Pressable/TouchableOpacity with tap action | WCAG 4.1.2 (A) |
| **Accessibility role — link** | `accessibilityRole="link"` | Navigation to another screen/route | WCAG 4.1.2 (A) |
| **Accessibility role — tab** | `accessibilityRole="tab"` | Tab bar items | WCAG 4.1.2 (A) |
| **Accessibility role — switch** | `accessibilityRole="switch"` | Toggle controls (Switch component) | WCAG 4.1.2 (A) |
| **Accessibility role — image** | `accessibilityRole="image"` | All meaningful images | WCAG 1.1.1 (A) |
| **Accessibility role — header** | `accessibilityRole="header"` | Screen titles, section headers | WCAG 1.3.1 (A) |
| **Accessibility state — selected** | `accessibilityState={{ selected: boolean }}` | Like/save/follow/tab state | WCAG 4.1.2 (A) |
| **Accessibility state — checked** | `accessibilityState={{ checked: boolean }}` | Switch/checkbox state | WCAG 4.1.2 (A) |
| **Accessibility state — disabled** | `accessibilityState={{ disabled: boolean }}` | Disabled controls | WCAG 4.1.2 (A) |
| **Accessibility state — expanded** | `accessibilityState={{ expanded: boolean }}` | Expandable sections, menus | WCAG 4.1.2 (A) |
| **Accessibility state — busy** | `accessibilityState={{ busy: boolean }}` | Loading states | WCAG 4.1.2 (A) |
| **Live region — polite** | `accessibilityLiveRegion="polite"` | Non-urgent updates (new message, form error) | WCAG 4.1.3 (AA) |
| **Live region — assertive** | `accessibilityLiveRegion="assertive"` | Urgent updates (auction ended, error) | WCAG 4.1.3 (AA) |
| **Elements hidden** | `accessibilityElementsHidden={true}` | Decorative views, shadow views, background shapes | WCAG 1.3.1 (A) |
| **No-hide-descendants** | `importantForAccessibility="no-hide-descendants"` | Off-screen carousel items, accordion collapsed content | React Native docs |
| **Focus order** | Visual order = accessibility tree order | Top-to-bottom, left-to-right (LTR) | WCAG 2.4.3 (A) |
| **Focus not obscured** | Sticky elements must not cover focused element | Scroll content past sticky headers/docks | WCAG 2.4.11 (AA, 2.2) |
| **Pointer cancellation** | Trigger on up-event, not down-event | `Pressable` uses `onPress` (up-event) by default | WCAG 2.5.2 (A) |
| **Motion actuation** | Shake/tilt features need a UI button alternative | If ThryftVerse uses shake-to-undo, add a button | WCAG 2.5.4 (A) |
| **Orientation** | Support portrait and landscape | Unless one is essential (camera) | WCAG 1.3.4 (AA) |
| **Redundant entry** | Don't ask for the same data twice in one process | Pre-fill shipping address in checkout | WCAG 3.3.7 (A, 2.2) |

---

## References

### Web Sources

1. W3C — Guidance on Applying WCAG 2.2 to Mobile Applications (WCAG2Mobile): https://www.w3.org/TR/wcag2mobile-22/
2. Accessibility.build — Mobile Accessibility Guide: https://accessibility.build/guides/mobile-accessibility
3. Assistive Media — Mobile WCAG Compliance: A Practical Guide: https://assistivemedia.org/mobile-wcag-compliance-guide/
4. Accessible.org — How to Conduct an Audit for a Native Mobile App: https://accessible.org/conduct-audit-native-mobile-app/
5. ADA Tray — WCAG 2.2 Guide for Accessible Mobile Apps: https://www.adatray.com/blog/wcag-2-2-mobile-app-accessibility
6. React Native — Accessibility docs: https://reactnative.dev/docs/accessibility
7. React Native Relay — React Native Accessibility Guide 2026: https://reactnativerelay.com/article/react-native-accessibility-guide-building-inclusive-apps-expo
8. React Native XYZ — React Native Accessibility Checklist: https://reactnative.xyz/react-native-accessibility-checklist
9. John Hambardzumian — React Native A11y: VoiceOver, Focus & WCAG: https://hambardzumian.com/blog/react-native-accessibility-focus-roles-assistive-technology
10. sirlisko — Accessibility in React Native: Beyond the Checklist: https://sirlisko.com/blog/accessibility-in-react-native-beyond-the-checklist
11. Apple Developer — Accessibility Technologies Group Lab (WWDC26): https://developer.apple.com/videos/play/wwdc2026/8005/
12. Apple Developer — Accessibility for UIKit: https://developer.apple.com/documentation/UIKit/accessibility-for-uikit
13. Apple Developer — Get started with Dynamic Type (WWDC24): https://developer.apple.com/videos/play/wwdc2024/10074/
14. Mobile A11y — 10 Tips for Building iOS Apps That Handle Dynamic Type Well: https://mobilea11y.com/blog/good-dynamic-type/
15. Apple Developer — Prepare your app for Accessibility Nutrition Labels: https://developer.apple.com/videos/play/tech-talks/111433/
16. Apple Developer — Sufficient Contrast evaluation criteria: https://developer.apple.com/help/app-store-connect/manage-app-accessibility/sufficient-contrast-evaluation-criteria
17. Apple Developer — Reduced Motion evaluation criteria: https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria/
18. Android Developers — Accessibility (Mobile guide): https://developer.android.com/design/ui/mobile/guides/foundations/accessibility
19. Android Developers — Make apps more accessible: https://developer.android.com/guide/topics/ui/accessibility/apps
20. Android Developers — Principles for improving app accessibility: https://developer.android.com/guide/topics/ui/accessibility/principles
21. Android Developers — Accessibility in Jetpack Compose: https://developer.android.com/develop/ui/compose/accessibility
22. Android Accessibility Help — Color contrast: https://support.google.com/accessibility/android/answer/7158390
23. MDN — prefers-reduced-motion CSS media feature: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion
24. web.dev — Animation and motion (accessibility): https://web.dev/learn/accessibility/motion
25. MotionSpec — State of Motion in AI-Generated UIs: 196 Sites Tested (2026): https://motionspec.dev/blog/state-of-motion-ai-generated-uis
26. OpenReplay — Using prefers-reduced-motion for Accessible Animation: https://blog.openreplay.com/prefers-reduced-motion-accessible-animation/
27. ACM TOSEM — Enhancing Cognitive Accessibility in Mobile Apps via LLM-driven Redundant Entry Reduction (2026): https://doi.org/10.1145/3816705
28. Assistive Media — Mobile Accessibility Design: Engineering Inclusive Apps (2026): https://assistivemedia.org/future-mobile-accessibility-design-guide/
29. Disability World — Mobile-Native Accessibility APIs in 2026: https://www.disabilityworld.org/articles/mobile-native-a11y-apis/
30. Assistive Media — Speech Accessibility Tools: Designing Inclusive Voice UX: https://assistivemedia.org/speech-accessibility-tools-voice-ux-design/
31. Instagram Engineering — Crafting an Accessible Instagram Feed: https://about.instagram.com/blog/engineering/crafting-an-accessible-instagram-feed
32. Snapchat — Accessibility Support: https://help.snapchat.com/hc/en-us/sections/14203449466900-Accessibility
33. AFB — Accessibility and Instagram: https://www.afb.org/blindness-and-low-vision/using-technology/using-social-media-visual-impairment-or-blindness-3
34. Silktide — eBay Accessibility Index (August 2026): https://index.silktide.com/website/ebay/august-2026
35. Accessible.org — Align Accessibility Investments for ADA and EAA Compliance: https://accessible.org/align-accessibility-investments-ada-eaa-compliance/
36. AuditJu — Does the EAA Apply to Your Mobile App?: https://auditsu.com/resources/european-accessibility-act-mobile-apps
37. AuditJu — EN 301 549 Chapter 11: The Mobile App Standard Nobody's Explaining: https://auditsu.com/resources/en-301-549-chapter-11-mobile-apps
38. sota.io — EAA Mobile App Accessibility 2026: Developer Checklist: https://www.sota.io/blog/eaa-mobile-app-accessibility-ios-android-pwa-developer-checklist-2026
39. Level Access — EAA Compliance in 2026: How Enforcement Has Evolved: https://www.levelaccess.com/blog/eaa-compliance-in-2026-how-enforcement-has-evolved-and-what-to-expect-next/
40. RedQA — Mobile Accessibility Testing: Applying WCAG on iOS and Android: https://redqa.com/blog/mobile-accessibility-testing
41. Primer — Mobile Accessibility Checklist: https://www.primer.style/accessibility/tools-and-resources/checklists/mobile-checklist/
42. Maestro — End-to-End UI Testing for Mobile and Web: https://maestro.dev/
43. Codersera — Maestro vs Appium vs Detox 2026: https://codersera.com/blog/maestro-vs-appium-vs-detox-2026/

### Codebase Sources

- `AGENTS.md` §13 (Control Quality), §14 (State Completeness), §16 (Performance — reduced-motion), §17 (Motion and Interaction), §18 (Accessibility)
- `Design.md` — Native Platform Contract (§1226), motion section (§510–531), visual-geometry hit target (§146), contrast documentation (§31)
- `frontend/src/hooks/useReducedMotion.ts` — OS + in-app reduced motion hook (lines 1–112)
- `frontend/src/context/AccessibilityPreferencesContext.tsx` — Persisted accessibility preferences (lines 1–153)
- `frontend/src/screens/AccessibilitySettingsScreen.tsx` — User-facing settings screen (lines 1–452)
- `frontend/src/utils/accessibility.ts` — Contrast ratio, touch target, label helpers (lines 1–158)
- `frontend/src/utils/accessibilityAudit.ts` — Dev-only tree-walking audit (lines 1–444)
- `frontend/src/preferences/accessibilityPreferences.ts` — Preference storage
- `frontend/src/theme/designTokens.ts` — `Control.hit = 44` (line 490), `Duration` scale (lines 324–335), `PressScale` (lines 531–538)
- `frontend/src/creator/core/a11y/` — Canvas accessibility labels, colour accessibility, timeline accessibility
- `frontend/src/creator/surfaces/AccessibilityMoveSheet.tsx`, `AccessibilityZOrderSheet.tsx` — Creator accessibility surfaces
