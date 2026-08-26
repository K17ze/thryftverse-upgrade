---
auto_execution_mode: 0
description: Upgrade one native surface through authored composition, complete states, comparative captures, accessibility, and independent critique
---

# Visual Flagship Convergence Loop

Use this workflow for a rendered screen, modal, sheet, transition, or shared visual
primitive. The implementation unit is one coherent surface and its directly coupled
states—not a department-wide token pass.

## Required inputs

- route, presentation style, and user goal;
- exact states and data needed to reproduce the surface;
- current native capture and 3–5 relevant benchmarks at comparable viewport/state;
- platform/device matrix available to the task;
- functional contract status and any live-data blockers.

If the surface is backed by fabricated or broken data, run the live-signs workflow
first. Do not decorate a false contract.

## 1. Establish the visual truth

Capture repository identity and dirty state, locate the canonical navigator/screen,
and trace route → layout → orchestration → state → service. Preserve every working
capability before deleting JSX. Record the baseline at the same viewport, theme,
content, font scale, and state used for comparison.

Measure:

```text
dominant object / reading order / first useful content Y
useful objects above fold / rounded-container count / type-size count
largest visible non-media control / touch target vs visible glyph
media crop / sticky-nav occlusion / loading-to-final geometry shift
```

## 2. Write the composition brief

Before editing tokens, answer:

- What is the user's one job in this moment?
- What should dominate at thumbnail scale?
- What is read second and third?
- Which action must be identifiable without reading?
- What can be removed, flattened, or deferred without hiding capability?
- What must remain stable across loading, keyboard, offline, and large text?

Translate quality into observable outcomes. “Premium,” “modern,” and “like app X”
are rejected unless converted to geometry, density, hierarchy, crop, feedback, and
state criteria.

## 3. Apply the anti-AI composition gate

The `AGENTS.md` anti-AI policy is binding. In particular:

- one dominant object and intentional asymmetry, not equal cards;
- flat canvas, spacing, media, and hairlines before decorative containment;
- no card-on-card grouping without a distinct state or interaction boundary;
- no duplicated headings, explanatory filler, or label-everything chrome;
- one radius, stroke, icon, press, and motion grammar per surface;
- real media owns color on media-led surfaces; art-direct crops;
- transparent practical hit targets for ordinary navigation glyphs;
- motion only for continuity, causality, feedback, or state change;
- identical hierarchy and density in light/dark themes.

Psychology must remain testable:

| Human need | Mechanic | Evidence |
|---|---|---|
| orientation | stable reading order and geometry | thumbnail/squint pass |
| low decision cost | one dominant primary action | task identifiable without reading |
| confidence | immediate, truthful feedback | state change is perceivable and reversible |
| continuity | preserve object position/context | no unexplained jump across transition |
| agency | escape, undo, reduced motion | recovery works without hidden gesture |

### Feedback intensity — the S0–S4 hierarchy (AGENTS.md §27.9)

Feedback intensity must correspond to the significance of the state transition, not be applied universally. Do NOT automatically add scale, haptic, shake, or celebration to every element.

| Tier | Feedback | Use when |
|---|---|---|
| S0 — invisible | None. Local state updates silently. | Filter toggle, sort order, internal flag. |
| S1 — visual state only | Icon/state change, no haptic. | Like, save, follow, bookmark. |
| S2 — visual + subtle haptic | State change + light impact haptic. | Add to cart, send message, submit search. |
| S3 — dedicated success state | Full success surface + haptic. | Purchase, sale, payout, listing published. |
| S4 — celebratory | Spring celebration + haptic + optional sound. | First sale, milestone, rare badge. |

The vast majority of success moments are S0 or S1. S3 and S4 are rare by design. Press scale (0.97–0.985) is for primary actions only; transparent 44pt hit targets need only a tint/opacity press state.

### Motion grammar (AGENTS.md §27.2–27.3)

Use the canonical spring configs from `theme/motionTokens.ts` via `useMotionConfig()`:

```text
tap (damping 18, stiffness 280) · press (15, 200) · entrance (22, 180)
lift (16, 160) · success (12, 120) · sharedElement (26, 200) · urgency (14, 220)
```

Timing: 50–100ms instant feedback, 100–200ms simple state change, 200–300ms standard transition, 300–500ms complex transition. Err on the shorter side. Respect reduced motion with instant or fade fallbacks.

### Optical authority (AGENTS.md §29)

The native render wins over mathematical purity. Small documented optical corrections are permitted when token-perfect geometry looks visually wrong:

- 1px icon baseline correction, glyph optical-size compensation, asymmetric visual centering, category-specific media focal positioning, inner/outer corner compensation, typography baseline adjustment.
- Every optical correction must be documented inline with a comment explaining the deviation.
- Optical corrections are local to the component. Never propagate a correction into a shared token.
- Never "clean up" an intentional optical exception because it doesn't match the spacing scale.

### iOS 26 Liquid Glass — RN implications (AGENTS.md §34.2, §35.2)

React Native cannot use `.glassEffect()`. The RN approach:

- reduce opaque backgrounds on bars; use translucent surface fills (`colors.surfaceAlt`) for selected states.
- let content extend underneath bars via `contentContainerStyle` padding.
- check `AccessibilityInfo.isReduceTransparencyEnabled()` before rendering glass.
- Apple says "reduce custom backgrounds in controls and navigation elements" — scoped usage only, never wrap the entire app in glass.

## 4. Implement the whole surface state machine

Modify canonical production files and directly coupled primitives only. Preserve
navigation, virtualization, keyboard behavior, media behavior, accessibility, and
handlers. Design relevant loading, cached/refreshing, populated, empty,
filtered-empty, partial, offline, error/retry, disabled, submitting, permission
denied, missing-media, and reduced-motion states. Skeleton geometry should converge
to final geometry; generic centered spinners are exceptional.

Every visible control must act truthfully, expose enabled/disabled/loading/selected
state, use a practical touch target, provide pressed feedback, have an accessible
label/role, and use appropriate haptics only when meaningful.

## 5. Engineering and accessibility gates

Run the smallest relevant checks, then the authoritative frontend gates:

```text
npm run frontend:typecheck
npm run frontend:test
npm --prefix frontend run lint
npm --prefix frontend run lint:design-tokens
npm --prefix frontend run check:visual-gates
```

Verify VoiceOver/TalkBack order and state, large text, contrast, non-color status,
reduced motion, keyboard/focus, gesture alternatives, dynamic announcements, and
error recovery. Keep the visible shape separate from the target: approximately
44pt iOS and 48dp Android targets where applicable.

## 6. Native convergence loop

Use a development or release build, not web rendering, for proof:

```text
capture baseline → implement → capture same state → equal-scale compare
→ independent cold critique → rework same surface → capture again → human review
```

Use representative compact, standard, and large phones plus a mid-range Android
when available; test both themes only when theme is in scope. Capture keyboard,
permission, offline/error, long-content, and large-text states relevant to the
change. A transition needs a recording; a static frame cannot prove motion.

The critic receives only the user goal, benchmark, resulting capture, and measurable
outcomes. It reports hierarchy, templated composition, density, crop, chrome,
state, and accessibility defects. If no independent reviewer, device, or human
acceptance is available, use the native-validation-pending status and do not sign
off visually.

Do not commit captures unless requested. Record their local paths, device/OS,
viewport, build ID, state, timestamp, and rework decision.

## 7. Last-mile visual acceptance gate (AGENTS.md §30)

Before claiming visual completion, inspect the rendered surface against this
checklist. Passing TypeScript and tests is not permission to skip this gate.

```text
Silhouette:  25% scale primary object obvious? no rounded-rect grid?
First viewport: most important content visible without scrolling?
Rhythm:      spacing cadence deliberate, not random?
Corners:     inner/outer radii relate correctly? hairlines only where needed?
Icons:       consistent line weight? align to text baseline? consistent gap?
Media:       focal point preserved? no blind cover? consistent aspect ratios?
Typography:  clear type scale? tabular figures? graceful truncation?
States:      press states on every control? skeleton matches final? no layout shift?
Theme:       light + dark identical geometry/hierarchy/density? no added glow?
Device:      compact phone no overflow? standard holds? large scales gracefully?
```

Only after every applicable box passes may the agent claim `COMPLETE — TARGET MET`.
If any box fails, fix and re-run. Do not claim completion with open failures.

Research basis, reviewed 25 August 2026: [Apple design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles),
[Apple feedback](https://developer.apple.com/design/human-interface-guidelines/feedback),
[Apple motion](https://developer.apple.com/design/human-interface-guidelines/motion),
[Android core app quality](https://developer.android.com/docs/quality-guidelines/core-app-quality),
[WCAG 2.2](https://www.w3.org/TR/WCAG22/), and
[iOS 26 Liquid Glass](https://developer.apple.com/developer-services-and-distribution/download/wwdc-2026/).
