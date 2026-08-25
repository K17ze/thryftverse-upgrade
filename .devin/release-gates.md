# ThryftVerse Release Gates

> **Purpose:** The gates that must pass before any visual change is merged or any release candidate is promoted. These gates complement automated logic tests — they exist because logic tests cannot judge visual quality, optical alignment, hierarchy, or state authorship.
>
> **Authority:** AGENTS.md §4, §13, §14, §17, §18, §20, §22, §27, §31; `.devin/workflows/visual-flagship-convergence-loop.md`; Design.md (release gates, reference quality gates, implementation guardrails); audit `15_VISUAL_QA_METRICS_EXPERIMENTS_RELEASE_GATES.md`; `visual-qa-gates.md`.
>
> **Rule:** A TypeScript pass alone is not completion. A passing test suite alone is not completion. Replacing tokens alone is not visual elevation. The improvement must be obvious at thumbnail size. No P0 defect may ship. No P1 defect may claim flagship quality.
>
> **Enforcement (AGENTS.md §31.7):** The visual release gate (`check:visual-gates`) now **fails on P0 by default**. The build loop enforces the constitution. The implementation unit is one surface at a time per the Visual Flagship Convergence Loop — visual completion requires a native artifact, a side-by-side vs the benchmark, at least one rework iteration, and human sign-off.

---

## 1. Gate levels

- **P0 hard gate** — ship blocker. The build is broken, unsafe, or untruthful. Must fix immediately.
- **P1 quality gate** — flagship blocker. The build works but is not flagship. Must fix before claiming flagship quality.
- **P2 polish gate** — fix in the same pass if time permits, or log as follow-up.

A release candidate is not promotable until every P0 gate passes. A surface is not flagship until every P1 gate passes for that surface.

---

## 2. P0 hard gates (ship blockers)

### 2.1 TypeScript passes
- [ ] `cd frontend; npx tsc --noEmit` exits 0.
- 0 type errors. No `any` escape hatches introduced without justification.

### 2.2 Critical tests pass
- [ ] `npm run test` (vitest) passes for affected suites.
- [ ] `npm run verify:phase` passes for phase-gated surfaces.
- [ ] No known duplicate transaction or data-loss risk.

### 2.3 No mock/demo competitor-branded content
- [ ] No placeholder or demo content that imitates a competitor brand.
- [ ] No fabricated success states, IDs, data, persistence, presence, activity, or order/tracking state.
- [ ] Every visible control performs its represented action, navigates correctly, shows a truthful disabled state, or is removed.

### 2.4 Screenshot set approved
- [ ] Golden routes captured across the device matrix (see `visual-qa-gates.md` §2, §3).
- [ ] Thumbnail test passes (§4 of visual-qa-gates.md).
- [ ] Squint test passes (§5 of visual-qa-gates.md).
- [ ] Screenshot rubric scored (§8 of visual-qa-gates.md); no P0 blocker averaged away.

### 2.5 Media error states approved
- [ ] Missing images get a restrained placeholder, not a broken-image icon.
- [ ] Image failures do not collapse layout.
- [ ] No raw backend URLs or error messages exposed.
- [ ] Skeletons match final aspect ratios — zero layout shift.

### 2.6 Keyboard / safe area approved
- [ ] Keyboard never covers the active field or composer.
- [ ] Sticky docks never cover the last scroll item.
- [ ] Bottom sheets include safe-area bottom padding.
- [ ] Headers do not collide with Dynamic Island / status bar.
- [ ] Android system Back matches visible hierarchy.

### 2.7 Release-mode performance captured
- [ ] Profile in release mode only — dev mode is 2–5× slower.
- [ ] 60fps minimum for scrolling and animations (120fps on ProMotion).
- [ ] Crash-free sessions ≥99.95%.
- [ ] p95 route interactive measured.
- [ ] Dropped frames measured on mid-range Android.
- [ ] Image/video failure rate measured.

### 2.8 No hardcoded colors in non-camera surfaces
- [ ] `npm run check:visual-gates` reports zero hardcoded color violations in `src/screens` and `src/components` (excluding theme files, camera/poster surfaces, and documented exceptions).
- [ ] All colors consumed through `useAppTheme().colors` or verified static exports (`Gradients`, `Glass`, `Glow` from `theme/gradients.ts`).
- [ ] No proposed tokens hardcoded before ThemeContext migration.

### 2.9 No card-on-card composition
- [ ] No nested surface without a distinct interaction or state boundary.
- [ ] Surface budget: at most one dominant non-media panel above the fold.

### 2.10 All interactive controls have accessibility labels
- [ ] Every `Pressable`, `TouchableOpacity`, `TouchableHighlight`, `Button` has `accessibilityLabel` (or `accessible` + `accessibilityRole` + text content).
- [ ] Icon-only controls must have `accessibilityLabel`.
- [ ] State is announced: selected, unread, loading, error.
- [ ] Destructive actions clearly labelled as destructive.
- [ ] Back and Close distinguishable — different icons, different labels.

### 2.11 All interactive controls have hitSlop
- [ ] Every icon-only control has `hitSlop` (recommended `{ top: 10, bottom: 10, left: 10, right: 10 }` or larger) to meet the 44pt target.
- [ ] Visible chrome separated from hit area — no 44pt grey circle rendered merely to satisfy accessibility on routine actions.

### 2.12 All animations respect reduced motion
- [ ] Every animation using `react-native-reanimated` checks `useReducedMotion()` / `useMotionConfig()`.
- [ ] Reduced-motion fallback: instant or simple fade.
- [ ] No bounce, continuous pulse, or decorative shimmer.
- [ ] `npm run check:animated-scroll` passes.

### 2.13 All states covered
- [ ] loading (skeleton matching final layout, not generic spinner);
- [ ] empty (next action, not just "Nothing here");
- [ ] error (user-safe language, recovery action);
- [ ] offline (designed, not blank/crash);
- [ ] populated (real data, not fabricated).

### 2.14 No P0 visual defects
- [ ] No clipped CTA or action button.
- [ ] No keyboard covering input.
- [ ] No duplicate entrypoint for the same user goal.
- [ ] No fake/unsupported action exposed as working.
- [ ] No raw backend error/status code visible.
- [ ] No broken image with no failure state.
- [ ] No unreadable text (contrast below WCAG AA, or text <11px without legal justification).
- [ ] No footer/dock/tab bar overlapping scroll content.
- [ ] No screen crash on load, state change, or standard interaction.
- [ ] No navigation dead-end.

---

## 3. P1 quality gates (flagship blockers)

### 3.1 No unexplained >2px optical alignment variance in shared primitives
- [ ] Shared primitives (buttons, rows, cards, fields, headers) align within 2px across all surfaces that use them.
- [ ] If three or more screens exhibit the same visual defect, inspect and correct the shared primitive first.

### 3.2 All primary actions use canonical button/dock
- [ ] Primary actions use the canonical button or sticky action dock.
- [ ] Primary actions are visually dominant; secondary actions restrained; destructive actions separated.
- [ ] Press feedback: scale 0.97–0.985, opacity, or both, with correct haptic level.

### 3.3 Typography token migration complete on flagship routes
- [ ] No hardcoded `fontSize` in flagship route screens/components — use `Type.*`, `FontSize.*`, or `TypeStyles`.
- [ ] `npm run lint:design-tokens` passes (warnings reviewed, platform violations zero).
- [ ] Text budget: no more than three type sizes + one eyebrow in the first viewport.
- [ ] Prices use `Type.priceList` or `Type.priceLarge` with tabular figures (`Numeric.*`).

### 3.4 Dark/light parity
- [ ] Geometry, hierarchy, and information density remain identical across themes.
- [ ] Dark mode is not permission to add translucent containers or glow.
- [ ] Elevated surfaces remain distinguishable without relying only on shadow.
- [ ] Disabled text remains readable in dark mode.

### 3.5 Reduced motion parity
- [ ] Reduced-motion users get the same information and capability, just without decorative motion.
- [ ] All motion has a reduced-motion fallback (instant or simple fade).
- [ ] No decorative animation delays or blocks primary interaction.

### 3.6 Radius budget compliance
- [ ] At most two non-avatar radius sizes per viewport (excluding modal).
- [ ] Radius communicates role: 8–12pt compact utility, 12–16pt media/fields, 20pt+ only for genuinely dominant panel/dock.
- [ ] No mixing arbitrary 0.5/1/1.5/2pt outlines in the same component family.

### 3.7 Surface budget compliance
- [ ] At most one dominant non-media panel above the fold.
- [ ] Flat canvas, spacing, and hairlines are the default utility structure.
- [ ] No card-on-card composition.

### 3.8 Icon grammar compliance
- [ ] One icon family per region (Ionicons canonical).
- [ ] One optical size band per region.
- [ ] Stable outline/filled-state rule.
- [ ] Standard nav glyphs 20–24pt; metadata glyphs 14–18pt.

### 3.9 Media storytelling
- [ ] On discovery, profile, and creator surfaces, real media is the primary color and visual anchor.
- [ ] Generic grey placeholder cards never become the dominant first-viewport story.
- [ ] Image crops honest — shoes, bags, jewellery, garment silhouettes preserved.
- [ ] `contentFit="cover"` not blindly used on critical product imagery.

### 3.10 First viewport usefulness
- [ ] First viewport answers: Where am I? What object/task matters most? What can I do now? What trust/state do I need?
- [ ] No low-value hero, repeated title, generic card, blank loading block, or decoration dominating.
- [ ] Discovery: ≥2 meaningful media objects or beginning of next module above fold.
- [ ] List: 4–6 useful rows above fold.

### 3.11 Trust placement
- [ ] Trust / buyer protection appears before the irreversible payment step.
- [ ] Seller verification visible in first viewport of product detail.
- [ ] Price, primary action, and trust all visible before scrolling (or via sticky dock).

### 3.12 Visual delta evidence recorded
- [ ] First useful content Y-position recorded.
- [ ] Number of useful objects above fold recorded.
- [ ] Visible rounded-container count recorded.
- [ ] Largest non-media control size recorded.
- [ ] Icon optical size recorded.
- [ ] Content occluded by sticky nav/docks recorded.
- [ ] Loading vs final geometry shift recorded.
- [ ] Before/after compared and not regressed.

---

## 4. P2 polish gates

- [ ] Minor spacing imbalance (off by 4–8px) resolved.
- [ ] Weak motion (missing press scale, crossfade, or transition outside 150–250ms) resolved.
- [ ] Slightly plain icon treatment upgraded.
- [ ] Low-delight transitions elevated (crossfade or slide where instant was used).
- [ ] Missing haptic feedback on selection, purchase, or bid actions added.
- [ ] Skeleton that does not perfectly match final layout aspect ratio fixed.
- [ ] Accessibility label missing on an icon-only control added.
- [ ] Caption/metadata trimmed by 1–2 words for density.
- [ ] Reduced-motion fallback implemented for non-critical animation.

---

## 5. Automated gates

Run these before requesting human visual review. All must pass (P0) or be explicitly waived with a documented reason.

| Gate | Command | Purpose | Level |
|---|---|---|---|
| TypeScript | `cd frontend; npx tsc --noEmit` | 0 type errors | P0 |
| Design tokens | `npm run lint:design-tokens` | No hardcoded spacing/radius/gap in platform code | P1 |
| Animated scroll | `npm run check:animated-scroll` | Reanimated scroll handlers use animated containers | P0 |
| Maestro flows | `npm run check:maestro-flows` | Flow YAML validates | P0 (when flows exist) |
| Visual release gates | `npm run check:visual-gates` | Hardcoded colors, missing accessibility, missing hitSlop, card-on-card, reduced-motion. **Fails on P0 by default** (AGENTS.md §31.7). Use `npm run check:visual-gates:report` for warn-only local exploration. | P0/P1 |
| Bundle size | `npm run check:bundle-size` | Binary within limits | P1 |
| Unit tests | `npm run test` | Affected suites pass | P0 |
| Phase verify | `npm run verify:phase` | Phase-gated surfaces pass | P0 |

---

## 6. Manual gates (human visual review)

Automated gates cannot judge: optical alignment, hierarchy, card density, media dominance, copy quality, empty-state authorship, transition quality, or whether a screen feels authored vs assembled. These require human review per `visual-qa-gates.md`.

- [ ] Thumbnail test passes (visual-qa-gates.md §4).
- [ ] Squint test passes (visual-qa-gates.md §5).
- [ ] Visual delta evidence recorded (visual-qa-gates.md §6).
- [ ] Screenshot rubric scored ≥3/4 every category, ≥4/4 in two (visual-qa-gates.md §8).
- [ ] Reference quality gate passes for surface type (visual-qa-gates.md §11).
- [ ] Minute visual quality checklist passes (visual-qa-gates.md §12).
- [ ] Human review questions answered (visual-qa-gates.md §9).
- [ ] Interaction QA with 60fps capture passes (visual-qa-gates.md §10).
- [ ] Dark/light parity verified on device.
- [ ] Reduced motion verified on device.
- [ ] Large text (200%) verified on device — no overlap, no unreachable controls.

---

## 7. Sign-off

A release is not shippable until:
1. Every P0 automated gate passes.
2. Every P0 manual gate passes.
3. Every P1 gate is resolved or explicitly waived with a documented reason.
4. `VISUAL_SIGNOFF.md` is produced (visual-qa-gates.md §14).
5. The user visually confirms the native screen and required states.

Allowed release statuses:
```text
COMPLETE — TARGET MET
IMPLEMENTED — NATIVE DEVICE VALIDATION PENDING
PARTIAL — VISUAL TARGET NOT MET
PARTIAL — INTERACTION FAILURES REMAIN
PARTIAL — BACKEND CAPABILITY BLOCKER
BLOCKED — INCORRECT REPOSITORY OPEN
BLOCKED — REFERENCE IMAGES UNAVAILABLE
BLOCKED — RUNTIME FAILURE
```

No `COMPLETE — TARGET MET` until the user visually confirms the native screen and the required states.

---

## 8. How to use this gate

### Before merging a visual change
1. Run all automated gates (§5).
2. Run the thumbnail + squint tests on the changed surface.
3. Verify no P0 defect (§2) is introduced.
4. Verify P1 gates (§3) for the changed surface.
5. Request human visual review if the change touches a flagship route.

### Before promoting a release candidate
1. Run all automated gates (§5).
2. Capture golden routes across the device matrix (visual-qa-gates.md §2, §3).
3. Run the full visual QA gate (visual-qa-gates.md).
4. Produce `VISUAL_SIGNOFF.md`.
5. Obtain user visual confirmation.
