# ThryftVerse Flagship Upgrade — Motion, Animation & Haptics

> Flagship upgrade research for the ThryftVerse native social-commerce app.
> Scope: how to upgrade **motion language**, **animation tokens**, **haptic feedback**, **state transitions**, **press feedback**, and **reduced-motion accessibility** to 2026 flagship quality.
> Companion to `Design.md` (v1.5, Motion section) and `AGENTS.md` §4 ("Native interaction patterns"), §13 ("Control quality"), §17 ("Motion and interaction"), §18 ("Accessibility"), §27.2–§27.5 (2026 flagship UX psychology).
> Benchmark date: 2026-08. All file:line references are against the current production branch.

---

## 1. 2026 Competitor Benchmark — Motion, Animation & Haptics

The 2026 reference set is not a set of spring constants to photocopy. It is a set of **motion disciplines**: how market leaders use physics-based motion as communication, how they pair haptics with visual feedback to create a tactile language, and how they respect reduced-motion as a first-class accessibility contract. The ThryftVerse charter already encodes the governing principle — "alive, not over-animated" (`Design.md` art direction) and "Motion is restrained and purposeful, not decorative" (`AGENTS.md` §26) — but the production codebase does not yet execute it consistently (see §3).

### 1.1 Instagram — physics-based motion that mimics human movement

Instagram's 2026 motion system, designed by Studio Dumbar/Dept®, is built around **physics as the cohesive rule-set**. The system emulates the imperfect ways humans film, tap, and scroll — adding "a level of human imperfection and interaction" through gesture-driven motion behaviours rather than canned easing curves. Physics "defines how motion is oriented in time and space," keeping the system cohesive across feed, Stories, Reels, and marketing surfaces ([itsnicethat.com/news/studio-dumbar-instagram-digital-120324](https://www.itsnicethat.com/news/studio-dumbar-instagram-digital-120324)). The lesson for ThryftVerse: spring physics should be the default for interactive feedback (presses, drags, swipes), and timing-based easing should be reserved for entrances/exits where a spring would overshoot destructively. Instagram's double-tap like — a heart that springs from 1.0 → 1.2 → 1.0 with a medium haptic — is the canonical micro-interaction that `Design.md` Component A already specifies but the codebase does not consistently deliver.

### 1.2 Pinterest — invisible motion, perceived performance as motion

Pinterest's Gestalt design system treats motion as a **perceived-performance tool**, not a decoration. Skeletons match final geometry, media crossfades on load (never pops), and content slides are so subtle they are felt rather than seen. The "almost invisible chrome" principle extends to motion: transitions exist to preserve spatial continuity (card → closeup → back) and to confirm state changes (save, board add), not to entertain. Pinterest's masonry items appear with a staggered FadeInDown capped to the first viewport — exactly the pattern `motionTokens.ts:153-163` encodes via `stagger.maxItems: 8`. The lesson: motion that users *don't notice* but would *miss if removed* is the flagship bar. Decorative motion that users *do* notice (and then turn off) is a failure.

### 1.3 eBay — transactional haptic grammar

eBay's 2026 marketplace app pairs haptics with **transactional commitment level**: a light selection tick when scrolling past a category boundary, a medium impact when placing a bid or making an offer, and a success notification when a purchase completes. This maps directly to `Design.md` Motion patterns: "haptic light for navigation/selection; haptic medium for purchase/bid/offer/send; haptic success for completed purchase/win/publish." The discipline is **restraint** — eBay does not fire a haptic on every cell tap in a search results list, only on moments that carry commitment weight. Android's haptics UX design guide reinforces this: "less is more. Too much vibration can be annoying and even numbing to the hands" ([developer.android.com/develop/ui/views/haptics/haptics-principles](https://developer.android.com/develop/ui/views/haptics/haptics-principles)).

### 1.4 Snapchat — gesture-continuous motion, haptic-every-interaction

Snapchat's camera-first surface pairs **every gesture with a haptic and a physics response**: sticker grab fires a heavy impact, drag follows the finger 1:1 with spring-back on release, pinch-to-resize fires a light tick at each size step. The motion is continuous (the object never leaves the finger) rather than discrete (tap → animate-to-state). This is the "gesture-driven vs preset transitions" distinction in the Disney-12-principles-for-mobile literature: "While the finger is down, position must follow the pointer one to one with no interpolation. The moment the finger lifts, that same position should ease back to its origin under physics" ([doveletter.dev/docs/compose-animations/spring-drag-box](https://doveletter.dev/docs/compose-animations/spring-drag-box), [explainx.ai/skills/dylantarre/animation-principles/mobile-touch](https://explainx.ai/skills/dylantarre/animation-principles/mobile-touch)). ThryftVerse's Poster/Sticker composer is the surface that should adopt this pattern most aggressively.

### 1.5 The cross-industry 2026 consensus

Across all references, five disciplines recur:

1. **Motion as communication, not decoration** — "If you can't explain what information an animation conveys, remove it" ([mantlr.com/blog/motion-design-principles-2026](https://mantlr.com/blog/motion-design-principles-2026)). Motion earns its place when it explains, confirms, guides, or stabilises ([tubikstudio.com/blog/motion-with-intent-ui-animation-mobile](https://tubikstudio.com/blog/motion-with-intent-ui-animation-mobile/)).
2. **Spring physics for interactive feedback, timing for entrances/exits** — iOS 26 and Material 3 Expressive both default to spring-based motion for user-initiated interactions. "Never use linear for user-initiated motion" ([explainx.ai/skills/dylantarre/animation-principles/mobile-touch](https://explainx.ai/skills/dylantarre/animation-principles/mobile-touch)).
3. **Tokenised motion with constrained choices** — mature design systems tokenise duration, easing, and spring configs to reduce decision fatigue. Singtel's design system "intentionally constrained choices early" to two duration tiers and three easing types ([medium.com/singtel-experience-design/designing-the-unseen-introducing-motion-design-and-haptics-in-a-design-system-6994d51d8d06](https://medium.com/singtel-experience-design/designing-the-unseen-introducing-motion-design-and-haptics-in-a-design-system-6994d51d8d06)). Kinesis publishes 115 named easing tokens organised by behavioural intent ([timwickstrom.com/projects/kinesis](https://timwickstrom.com/projects/kinesis)).
4. **Haptics as a semantic language** — match the system pattern (success, error, warning, selection) to the event; never use haptics as decoration; "good haptics are felt, not noticed; bad ones are the first thing a user turns off" ([vp0.com/blogs/haptic-feedback-ui-design-guidelines-ios](https://vp0.com/blogs/haptic-feedback-ui-design-guidelines-ios)).
5. **Reduced-motion as a first-class contract** — Apple's App Store now publishes Reduced Motion evaluation criteria; apps that don't respect the system flag fail accessibility review ([developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria/](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria/)). The European Accessibility Act 2025 (in force since 28 June 2025) requires that software "does not override user accessibility preferences" including Reduce Motion ([sota.io/blog/eaa-mobile-app-accessibility-ios-android-pwa-developer-checklist-2026](https://www.sota.io/blog/eaa-mobile-app-accessibility-ios-android-pwa-developer-checklist-2026)).

---

## 2. Psychology & Principles

### 2.1 Motion as meaning

Motion in a native app does five concrete jobs: **explain** an interface (how elements relate spatially), **confirm** that the system received an action, **clarify** navigation (where the user came from and where they went), **reduce uncertainty** during system states (loading, submitting), and **land emotional moments** in contexts that genuinely call for them ([tubikstudio.com/blog/motion-with-intent-ui-animation-mobile](https://tubikstudio.com/blog/motion-with-intent-ui-animation-mobile/)). If a motion cannot be assigned to one of these five jobs, it is decoration and should be removed. This is `AGENTS.md` §17's "Motion as feedback, not decoration" and "No motion on static content — only on interactive state changes" encoded as a cognitive principle.

### 2.2 The "alive" feeling — spring physics as naturalism

Users form snap judgments about app quality within seconds. The **behavioral** level of emotional design (Don Norman, `AGENTS.md` §27.1) is driven by "gesture responsiveness (<16ms = 60fps), spring physics, haptic grammar, state predictability." Spring physics feel "alive" because they mimic real-world mechanics: an object has mass, it accelerates under a force, it decelerates as it approaches rest, and it may overshoot slightly before settling. Timing-based easing (ease-in-out) feels "digital" because it follows a mathematically perfect curve with no physical analogue. The 2026 flagship standard is: **springs for everything the user touches; timing for everything the system presents** (entrances, exits, crossfades). `motionTokens.ts:85-110` already defines 12 semantic spring presets in the flagship range (damping 12–18, stiffness 120–280, mass 0.8–1.0 per `AGENTS.md` §27.3) — the defect is that production screens bypass them (see §3.4).

### 2.3 Haptics as confirmation

Haptics carry **meaning**, not sensation. Apple's playing-haptics guidance ties specific feedback to specific events: success, warning, error, selection. A haptic should confirm that something happened, not just fire. "Good haptics are felt, not noticed; bad ones are the first thing a user turns off" ([vp0.com/blogs/haptic-feedback-ui-design-guidelines-ios](https://vp0.com/blogs/haptic-feedback-ui-design-guidelines-ios)). Android's haptics principles classify effects into **clear haptics** (crisp, discrete — button presses), **rich haptics** (expressive, sequenced — transitions), and **buzzy haptics** (sustained — alerts), and warns that "too much vibration can be annoying and even numbing" ([developer.android.com/develop/ui/views/haptics/haptics-principles](https://developer.android.com/develop/ui/views/haptics/haptics-principles)). The ThryftVerse haptic language (`utils/haptics.ts:47-66`, `utils/hapticPatterns.ts:16-88`) already encodes this semantic mapping — the defect is that 12 screens bypass the centralised helpers and call `expo-haptics` directly with ad-hoc intensity choices (see §3.5).

### 2.4 State transition clarity

State transitions are the single most impactful motion surface. When a screen goes from loading → populated, the user must perceive **continuity**, not replacement. Skeletons that match final geometry and crossfade into real content communicate "the same surface, now filled." A spinner that disappears and is replaced by a fully-rendered list communicates "something new appeared" — which is disorienting. `AGENTS.md` §14 requires "Skeletons should resemble the final layout. Do not use a generic centred spinner for every state." The motion corollary: the skeleton-to-content transition must be a **crossfade** (`Motion.transitions.mediaLoad`, 250ms opacity-only), never a pop, slide, or layout shift. `Design.md` Component A states this explicitly: "Media fade-in on load, never pop."

### 2.5 Reduced-motion as accessibility

Reduced-motion is not a nice-to-have. The European Accessibility Act 2025 (in force since 28 June 2025) requires that software does not override the user's OS-level accessibility preferences ([sota.io/blog/eaa-mobile-app-accessibility-ios-android-pwa-developer-checklist-2026](https://www.sota.io/blog/eaa-mobile-app-accessibility-ios-android-pwa-developer-checklist-2026)). Apple's App Store publishes **Reduced Motion evaluation criteria** as part of app accessibility review — apps that don't respect the system flag fail review ([developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria/](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria/)). The goal is to support users with "extreme motion sensitivity, who may experience negative side effects, such as nausea, dizziness, headaches, or distraction when encountering certain types of motion triggers" — particularly "spinning or scaling, and other techniques used to simulate three-dimensional effects or depth." The correct response is not to remove all animation (well-designed animations "convey information intuitively, increasing the usability and understandability of your app") but to **collapse travel to zero, keep state-change communication via opacity, and remove parallax/scaling/rotation** ([developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria/](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria/), [buttondown.com/inclusive-android-apps/archive/inclusive-android-apps-8-the-problem-of-animations/](https://buttondown.com/inclusive-android-apps/archive/inclusive-android-apps-8-the-problem-of-animations/)).

### 2.6 "Less is more" — restraint as premium

The 2026 motion-design literature is emphatic that restraint signals premium. "The best motion is usually subtle. It supports understanding without slowing the user down" ([blennd.com/motion-design-ux-best-practices/](https://blennd.com/motion-design-ux-best-practices/)). "Most of this motion is bad — it's slow, arbitrary, inaccessible, and often actively harmful" ([mantlr.com/blog/motion-design-principles-2026](https://mantlr.com/blog/motion-design-principles-2026)). The flagship timing rule (`AGENTS.md` §27.2): "Err on the shorter side. Users are more forgiving of fast than sluggish. Feedback must arrive within 100ms of user action." Tap response under 100ms is the 2026 production target ([forasoft.com/blog/article/mobile-app-ux-design-best-practices](https://www.forasoft.com/blog/article/mobile-app-ux-design-best-practices)). This is why `motionTokens.ts:54` defines `touch: 80ms` — the press highlight must arrive within the 100ms feedback budget.

---

## 3. Current ThryftVerse Audit — Concrete Defects

The audit below is evidence-based, with file:line references. The codebase has a strong *contract* (`motionTokens.ts`, `useMotionConfig.ts`, `useReducedMotion.ts`, `utils/haptics.ts`, `utils/hapticPatterns.ts`) but **widespread bypass** of that contract in production screens.

### 3.1 Dual Duration scales that disagree

The codebase has **two competing duration token systems** that define different values for the same semantic names:

| Token name | `designTokens.ts` `Duration` | `motionTokens.ts` `Motion.duration` | Defect |
|---|---|---|---|
| `fast` | 120ms (`designTokens.ts:328`) | 120ms (`motionTokens.ts:56`) | Agree |
| `normal` | 200ms (`designTokens.ts:330`) | 180ms (`motionTokens.ts:58`) | **Divergent** — 20ms gap |
| `slow` | 320ms (`designTokens.ts:332`) | 280ms (`motionTokens.ts:60`) | **Divergent** — 40ms gap |
| `slower` | 500ms (`designTokens.ts:334`) | 400ms (`motionTokens.ts:62`) | **Divergent** — 100ms gap |
| — | — | `touch: 80ms` (`motionTokens.ts:54`) | Missing from `Duration` |
| — | — | `crawl: 600ms` (`motionTokens.ts:64`) | Missing from `Duration` |

`Design.md` (Motion section, line 512) states: "The source of truth is `Duration` in `theme/designTokens.ts`." But `motionTokens.ts:50` defines a *second* `Motion.duration` scale with different values, and `motionTokens.ts` is the file that `useMotionConfig()` actually consumes (`useMotionConfig.ts:2`). Result: `Duration.normal` (200ms) and `Motion.duration.normal` (180ms) are both "the standard transition duration" but differ by 20ms. Screens that import `Duration` get one value; screens that use `useMotionConfig().duration` get another. **Grep confirms zero production consumption of `Duration.`** (0 matches across `frontend/src`) — the `designTokens.ts` duration scale is dead code, and `Motion.duration` is the de facto source of truth, contradicting `Design.md`.

### 3.2 Motion tokens not consumed — 193 hardcoded durations

Despite a comprehensive motion token system (`motionTokens.ts` exports `Motion.duration`, `Motion.tier`, `Motion.spring`, `Motion.easing`, `Motion.mapping`, `Motion.transitions`, `Motion.stagger`, `Motion.gestures`), production screens invent per-screen duration values:

- **193 instances** of `duration: <3+ digit number>` across `frontend/src` (grep count).
- `PosterViewerScreen.tsx`: `duration: 1200` (line 1414), `duration: 1300` (line 1419), `duration: 1000` (line 1429), `duration: 200` (line 1461), `duration: 400` (line 1463) — five different hardcoded durations in one file.
- `CheckoutScreen.tsx`: `duration: 700` (lines 1715–1716), `duration: 800` (lines 1764–1765), `duration: 1100` (line 1908) — three different durations for what are all content-crossfade transitions.
- `AIPoweredListingScreen.tsx`: `duration: 900` (lines 945–946), `duration: 500` (lines 953–954) — both for the same success-animation surface.
- `BrandedSplash.tsx`: `duration: 850` (lines 38–39) — a splash animation that should use `Motion.duration.slower` (400ms) or `Motion.duration.crawl` (600ms), not 850ms.
- `VisualSearchScreen.tsx`: `duration: 1200` (line 88), `duration: 800` (line 94) — both for scanning-state animations.
- `CreatorDraftListScreen.tsx`: `duration: 1200` (line 58), `duration: 200` (lines 214, 735), `duration: 180` (lines 218–219, 914), `duration: 160` (lines 907, 915) — four different durations for sheet/toast transitions in one file.

Only **170 instances** reference `Motion.` (grep count) — and many of those are imports or type references, not runtime consumption. The ratio of hardcoded to tokenised durations is roughly **1.1:1**, meaning nearly half of all duration values in the codebase are magic numbers.

### 3.3 Missing press feedback on raw Pressable components

`AnimatedPressable` (`components/AnimatedPressable.tsx`) is the canonical pressable surface — it provides spring-based scale feedback (0.96 default), opacity response, haptic grammar, 44pt hit-slop, and reduced-motion collapse. But the codebase has **4,091 `Pressable` matches** vs **2,429 `AnimatedPressable`/`PressScale` matches** — meaning roughly 40% of pressable surfaces use the raw React Native `Pressable` with no scale feedback, no haptic, and no reduced-motion awareness. `PressScale` tokens (`designTokens.ts:531-538`) are consumed in only **4 locations** (grep count) — `ClosetMediaMosaic.tsx` (3 uses) and `DrawingPaletteBar.tsx` (1 comment reference). The vast majority of press-scale values are hardcoded inline (400 matches for `scale.*0.9[0-9]`).

### 3.4 Missing haptics on high-commitment surfaces

The codebase has a well-designed haptic language: `utils/haptics.ts:47-66` defines 15 semantic haptic helpers (`tap`, `press`, `success`, `error`, `like`, `save`, `selection`, `heavyPress`, `warning`, etc.) and `utils/hapticPatterns.ts:16-88` defines 13 compound patterns (`like`, `purchaseComplete`, `bidPlaced`, `outbid`, `delete`, `refresh`, `tabSwitch`, `toggle`, `longPress`, `coOwnUnit`, `auctionWon`, `save`, `feedEnd`). **68 files import the centralised helpers** — but **12 files import `expo-haptics` directly** and bypass the semantic layer:

- `SellerFulfilmentScreen.tsx:43-45` — defines its own local `hapticStyles` object mapping `tap`/`heavyPress`/`selection` to raw `impactAsync` calls, duplicating `utils/haptics.ts`.
- `AIPoweredListingScreen.tsx:143-257` — 8 direct `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)` calls for what are all selection/tap moments; should use `haptics.selection()` or `haptics.tap()`.
- `SellScreen.tsx:224-1813` — 15 direct `impactAsync` calls, mixing Light and Medium without a clear commitment-level mapping; should use `haptics.tap()` for selection, `haptics.press()` for commitment, `HapticPatterns.purchaseComplete()` for publish.
- `EditListingScreen.tsx:338-625` — 7 direct calls mixing Light and Medium.
- `AddCardSheet.tsx:105,137,149` — uses `impactAsync` and `notificationAsync` directly; should use `haptics.success()` / `haptics.error()`.

The semantic inconsistency is the defect: `SellScreen.tsx:572` fires `ImpactFeedbackStyle.Medium` for a picker selection (should be Light/selection), while `SellScreen.tsx:601` fires `Medium` for a shipping-method commitment (correct). Without the centralised layer, there is no enforceable mapping from interaction type to haptic intensity.

### 3.5 No reduced-motion support on 193 hardcoded-duration animations

`useReducedMotion()` (`hooks/useReducedMotion.ts:21-56`) and `useMotionConfig()` (`hooks/useMotionConfig.ts:22-79`) are well-designed: they OR the OS-level Reduce Motion setting with an in-app preference, and `useMotionConfig` collapses all durations to 0, all springs to critically-damped (`REDUCED_SPRING` at `motionTokens.ts:225`), and all travel values to 0. But these hooks are only consumed in **~15 files** (grep for `useReducedMotion|useMotionConfig` returns 30 matches across ~15 unique files). The 193 hardcoded-duration animations in screens like `PosterViewerScreen.tsx`, `CheckoutScreen.tsx`, `AIPoweredListingScreen.tsx`, `VisualSearchScreen.tsx`, and `CreatorDraftListScreen.tsx` **never check reduced motion** — they pass raw `duration: 1200` to `withTiming()` regardless of the user's accessibility setting. This is an EAA 2025 compliance failure.

### 3.6 Missing state transitions

`AGENTS.md` §14 requires loading, empty, error, retry, and populated states to all be designed. The motion corollary — that transitions *between* these states must be authored — is not enforced. Specific defects:

- **Loading → populated:** Many screens use a generic `ActivityIndicator` (centred spinner) that disappears instantly when data arrives, replaced by content that pops in. There is no crossfade. `Motion.transitions.mediaLoad` (250ms opacity-only, `motionTokens.ts:196-199`) exists for exactly this purpose but is not consumed in skeleton-to-content transitions.
- **Empty → populated:** Empty states (illustration + CTA) typically appear with no entrance animation. When data is added (e.g., first item listed), the empty state disappears and the list appears with no transition.
- **Error → retry:** Error states (`RetryState.tsx`) do use `useReducedMotion` (line 18) but the retry action has no success-confirmation animation — the error state simply vanishes and is replaced by a loading state.
- **Tab switch:** `Motion.transitions.tabSwitch` (200ms directional slide + fade, `motionTokens.ts:185-189`) exists but profile tabs and discovery tabs in `UserProfileScreen.tsx` and `InboxScreen.tsx` use ad-hoc or no transition.

### 3.7 `Design.md` motion duration scale is stale

`Design.md` lines 514–520 document the motion duration scale as:
- `Duration.fast` (150ms)
- `Duration.normal` (250ms)
- `Duration.slow` (400ms)
- `Duration.slower` (600ms)

But `designTokens.ts:324-335` defines:
- `Duration.fast` (120ms)
- `Duration.normal` (200ms)
- `Duration.slow` (320ms)
- `Duration.slower` (500ms)

And `motionTokens.ts:50-65` defines a third scale:
- `Motion.duration.fast` (120ms)
- `Motion.duration.normal` (180ms)
- `Motion.duration.slow` (280ms)
- `Motion.duration.slower` (400ms)

Three sources of truth, three different values, for the same semantic names. `Design.md` is documentation, `designTokens.ts` is dead code (0 consumers), and `motionTokens.ts` is the runtime truth. The documentation must be reconciled to the runtime.

---

## 4. Micro Improvements

These are low-risk, localised fixes that can be applied screen-by-screen without architectural change:

1. **Replace hardcoded durations with `useMotionConfig().duration.*`** in the 193 locations. Each `withTiming(value, { duration: 1200 })` becomes `withTiming(value, { duration: motionConfig.duration.crawl })`. This single change brings 193 animations under reduced-motion control automatically, because `useMotionConfig` collapses all durations to 0 when reduced motion is enabled.
2. **Replace raw `Pressable` with `AnimatedPressable`** on the ~1,600 surfaces that lack press feedback. Start with high-traffic surfaces: feed cards, list rows, tab bar items, header actions. Each replacement adds spring scale + opacity + haptic + 44pt hit-slop + reduced-motion collapse in one import.
3. **Replace direct `expo-haptics` calls with `utils/haptics.ts` helpers** in the 12 files that bypass the semantic layer. `AIPoweredListingScreen.tsx`'s 8 `impactAsync(Light)` calls become `haptics.selection()` or `haptics.tap()`. `SellScreen.tsx`'s 15 calls become a mix of `haptics.tap()`, `haptics.press()`, and `HapticPatterns.purchaseComplete()`.
4. **Add `useReducedMotion()` gating to the 193 hardcoded animations.** Where a screen cannot use `useMotionConfig` (e.g., a shared-value animation that needs raw `withTiming`), wrap the duration: `const ms = reducedMotion ? 0 : 1200; withTiming(value, { duration: ms })`.
5. **Add crossfade to skeleton → content transitions.** Where a skeleton is replaced by populated content, wrap the content in an opacity `withTiming(1, { duration: motionConfig.transitions.mediaLoad.duration })` entrance. Never pop.
6. **Add `HapticPatterns.tabSwitch()` to all tab-switch handlers.** Profile tabs, inbox tabs, and discovery category rails should fire a selection haptic on tab change.
7. **Add `HapticPatterns.like()` to double-tap-like handlers.** The compound pattern (two quick light taps 60ms apart) is already defined (`hapticPatterns.ts:18-21`) but not consistently wired to feed double-tap.

---

## 5. Macro Improvements

These are architectural changes that establish a durable motion language and eliminate the bypass problem at its root.

### 5.1 Consolidate to one motion token source of truth

**Eliminate the dual-duration-scale defect.** `designTokens.ts` `Duration` is dead code (0 consumers) and disagrees with `motionTokens.ts` `Motion.duration`. Two options:

- **Option A (recommended):** Delete `Duration` from `designTokens.ts`, re-export `Motion.duration` as `Duration` for backward compatibility, and update `Design.md` to name `motionTokens.ts` as the source of truth. This makes `motionTokens.ts` the single runtime source and `Design.md` the single documentation source.
- **Option B:** Merge `Motion.duration` values into `designTokens.ts` `Duration` and have `motionTokens.ts` re-export them. This preserves the `Design.md` claim but requires updating all `Motion.duration.*` references.

Option A is cleaner because `motionTokens.ts` already owns the spring configs, easing curves, tier mappings, transition presets, stagger config, and gesture thresholds — duration is one part of a cohesive motion contract that should live in one file.

### 5.2 Motion language — duration, easing, spring, haptic contracts

Establish a **canonical interaction → motion mapping** so every surface references the same assignment. `motionTokens.ts:134-151` already defines `Motion.mapping` with 8 interaction types. The macro improvement is to **enforce consumption** — no `withTiming` or `withSpring` call should invent its own config. The contract:

| Interaction | Duration tier | Easing | Spring config | Haptic |
|---|---|---|---|---|
| Button press | micro (120ms) | spring | `spring.tap` (damping 18, stiffness 280) | `haptics.tap()` (Light) |
| Card tap | micro (120ms) | spring | `spring.press` (damping 15, stiffness 200) | `haptics.tap()` (Light) |
| Tab switch | deliberate (280ms) | `crisp` (ease-in-out cubic) | — | `HapticPatterns.tabSwitch()` (selection) |
| Sheet present | deliberate (280ms) | `entrance` (ease-out cubic) | `spring.sheet` (damping 22, stiffness 180) | — |
| Sheet dismiss | deliberate (280ms) | `exit` (ease-in cubic) | `spring.sheet` | — |
| List item reveal | micro (120ms) | `entrance` (ease-out) | — | — |
| Toggle/icon swap | micro (120ms) | `crisp` (ease-in-out) | — | `haptics.toggle()` (Light) |
| Content crossfade | normal (180ms) | `smooth` (ease-in-out ease) | — | — |
| Media load | normal (250ms) | `smooth` | — | — |
| Like (double-tap) | micro (120ms) | spring | `spring.success` (damping 12, stiffness 120) | `HapticPatterns.like()` (Light × 2) |
| Screen push | deliberate (280ms) | `entrance` (ease-out) | — | — |
| Modal entrance | deliberate (280ms) | `entrance` (ease-out) | `spring.sheet` | — |
| Purchase complete | slower (400ms) | spring | `spring.success` | `HapticPatterns.purchaseComplete()` (Medium → Success) |
| Bid placed | micro (120ms) | spring | `spring.tap` | `HapticPatterns.bidPlaced()` (selection → Light) |
| Error shake | micro (120ms) | spring | `spring.urgency` (damping 14, stiffness 220) | `haptics.error()` (Error notification) |

### 5.3 State transition system

Build a **`StateTransition` primitive** that authors the motion between every state pair. The system should wrap content in a shared-value opacity + translateY that crossfades when the state changes:

```
loading → populated:  skeleton crossfades to content (mediaLoad, 250ms opacity-only)
empty → populated:    empty state crossfades out + list FadeInDown in (listItem, 220ms)
error → retry:        error state slides down + spinner fades in (exit + entrance)
populated → error:    content crossfades to error state (crossfade, 180ms)
submitting → success: form crossfades to success confirmation (success spring, 400ms)
```

Every screen that `AGENTS.md` §14 requires to have loading/empty/error/populated states should use `StateTransition` to author the motion between them. This eliminates the "spinner disappears, content pops in" defect class.

### 5.4 Reduced-motion architecture

The current architecture is correct in design (`useReducedMotion` ORs OS + in-app preference; `useMotionConfig` collapses all values) but **bypassed in practice**. The macro fix is to make it structurally impossible to animate without reduced-motion awareness:

1. **Ban raw `withTiming` and `withSpring` in lint.** Add an ESLint rule that flags any `withTiming` or `withSpring` call whose config object contains a literal `duration` or spring constants not sourced from `useMotionConfig()` or `Motion.*`.
2. **Make `AnimatedPressable` the only pressable.** Add an ESLint rule that flags raw `Pressable` imports outside of `AnimatedPressable.tsx` itself. Every pressable surface inherits reduced-motion collapse automatically.
3. **Make `useMotionConfig` the only motion config source.** Screens that need custom spring configs should receive them from `useMotionConfig().spring.*`, not invent `{ damping: 15, stiffness: 200 }` inline.
4. **Gate decorative motion behind `isEnabled`.** `useMotionConfig().isEnabled` (line 76) is the convenience flag for "full motion is allowed." Shimmer, parallax, and decorative animation should be wrapped in `if (isEnabled) { ... }` so they are structurally disabled under reduced motion.

### 5.5 Press feedback language

Standardise press feedback across the app via `AnimatedPressable`'s `scaleValue` prop, mapped to `PressScale` tokens:

| Control type | `scaleValue` | `PressScale` token | Haptic |
|---|---|---|---|
| Primary button | 0.96 | — (between `tap` 0.97 and `icon` 0.92) | `haptics.tap()` |
| List row / card | 0.97 | `PressScale.tap` (`designTokens.ts:533`) | `haptics.tap()` |
| Large surface | 0.985 | `PressScale.gentle` (`designTokens.ts:535`) | `haptics.tap()` |
| Icon-only control | 0.92 | `PressScale.icon` (`designTokens.ts:537`) | `haptics.selection()` |
| Destructive | 0.96 | — | `haptics.heavyPress()` |

`AnimatedPressable` defaults to `scaleValue = 0.96` (line 72) — this should be changed to `PressScale.tap` (0.97) for list-row parity, with callers explicitly passing `PressScale.gentle` or `PressScale.icon` for other control types.

---

## 6. Flagship Acceptance Criteria

A screen passes the motion/haptics flagship bar when all of the following are true:

### 6.1 Motion language — restrained, native, reduced-motion respected

- Every `withTiming` call sources its duration from `useMotionConfig().duration.*` or `Motion.duration.*` — zero hardcoded durations.
- Every `withSpring` call sources its config from `useMotionConfig().spring.*` or `Motion.spring.*` — zero inline spring constants.
- No animation exceeds 400ms except rare celebratory/onboarding moments (`Motion.duration.crawl`, 600ms).
- No bounce, continuous pulsing, floating cards, decorative shimmer after loading, large spring movement, dramatic parallax, or page-wide animation (`AGENTS.md` §17 prohibited list).
- Every animated surface branches on `useReducedMotion()` or consumes `useMotionConfig()` — under reduced motion, all travel collapses to 0, springs become critically damped, and only opacity-only state communication remains.
- Press feedback on every interactive surface: spring scale (0.92–0.985 depending on control type) + opacity response within 80ms (`Motion.duration.touch`).

### 6.2 Haptic language — selection / light / medium / success

- Every haptic call goes through `utils/haptics.ts` or `utils/hapticPatterns.ts` — zero direct `expo-haptics` imports outside the utils layer.
- Haptic intensity maps to commitment level:
  - **Selection** (`haptics.selection()`): tab switch, picker value change, scroll-snap boundary, filter toggle.
  - **Light** (`haptics.tap()`): button press, card tap, list row tap, icon-only control.
  - **Medium** (`haptics.press()`): bid placed, offer sent, message sent, publish initiated, shipping method committed.
  - **Success** (`haptics.success()` / `HapticPatterns.purchaseComplete()`): purchase completed, auction won, listing published, co-own unit acquired.
  - **Error** (`haptics.error()`): payment failed, publish failed, bid rejected.
  - **Warning** (`haptics.warning()`): outbid notification, auction ending soon.
  - **Heavy** (`haptics.heavyPress()` / `HapticPatterns.longPress()`): long-press reveal, swipe-to-delete confirmation.
- Haptics are never fired on static content or decorative animation — only on interactive state changes.
- Haptics are never the sole feedback signal — every haptic is paired with a visual response (scale, opacity, colour, icon swap).

### 6.3 State transitions — loading → populated, empty → populated, error → retry

- **Loading → populated:** skeleton crossfades to content via `Motion.transitions.mediaLoad` (250ms opacity-only). No pop, no layout shift, no spinner-then-replace.
- **Empty → populated:** empty state (illustration + CTA) crossfades out; list items enter via `Motion.transitions.listItem` (220ms FadeInDown, 8px translate, capped to `stagger.maxItems: 8`).
- **Error → retry:** error state slides down via `Motion.easing.exit`; loading state fades in via `Motion.easing.entrance`. Retry success transitions to populated via the loading → populated path.
- **Submitting → success:** form content crossfades to success confirmation; success animation uses `spring.success` (damping 12, stiffness 120) for a brief, bouncy celebration — only under full motion.
- **Tab switch:** content crossfades or directionally slides via `Motion.transitions.tabSwitch` (200ms, 12px translateX, `crisp` easing); selection haptic fires on tab change.
- All state transitions collapse to instant/fade under reduced motion.

---

## 7. Priority & Sequencing

| Priority | Work item | Impact | Effort | Risk |
|---|---|---|---|---|
| **P0** | Consolidate `Duration` → `Motion.duration` (delete dead scale, update `Design.md`) | Eliminates dual-source-of-truth confusion | Low | Low — 0 consumers of `Duration.` |
| **P0** | Add ESLint rule banning raw `withTiming`/`withSpring` with literal configs | Structurally prevents future bypass | Medium | Medium — will surface 193 violations |
| **P0** | Replace 193 hardcoded durations with `useMotionConfig().duration.*` | Brings 193 animations under reduced-motion control | Medium | Low — mechanical replacement |
| **P1** | Replace 12 direct `expo-haptics` imports with `utils/haptics.ts` helpers | Enforces semantic haptic language | Low | Low |
| **P1** | Add `useReducedMotion()` to the ~15 screens with hardcoded animations that cannot use `useMotionConfig` | EAA 2025 compliance | Medium | Low |
| **P1** | Add `HapticPatterns.tabSwitch()` to all tab-switch handlers | Consistent tactile feedback on navigation | Low | Low |
| **P2** | Replace raw `Pressable` with `AnimatedPressable` on high-traffic surfaces (feed, list, tabs, headers) | Press feedback + haptic + hit-slop on ~1,600 surfaces | High | Medium — must preserve all onPress/onLongPress handlers |
| **P2** | Build `StateTransition` primitive and wire to loading/empty/error/populated on all screens | Authored state-transition motion app-wide | High | Medium — must preserve existing state logic |
| **P2** | Add crossfade to all skeleton → content transitions | Eliminates pop-in defect class | Medium | Low |
| **P3** | Add `HapticPatterns.like()` to all double-tap-like handlers | Signature tactile feedback on feed | Low | Low |
| **P3** | Tune `AnimatedPressable` default `scaleValue` to `PressScale.tap` (0.97) | Consistent press depth | Low | Low — visual change, must validate on device |
| **P3** | Add ProMotion 120fps support (`Info.plist` flag) + Reanimated 4 feature flags | Smoothness on high-refresh devices | Low | Low — config-only ([docs.swmansion.com/react-native-reanimated/docs/guides/performance](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/)) |

---

## 8. Token-Level Spec Table

The canonical motion + haptic contract for every interaction pattern in ThryftVerse. All values are from `motionTokens.ts` (runtime) and `designTokens.ts` (`PressScale`). Under reduced motion, all durations collapse to 0ms, all springs to `REDUCED_SPRING` (damping 100, stiffness 1000), and all travel to 0px.

| Motion pattern | Duration | Easing | Spring config | Travel | Haptic | Token reference |
|---|---|---|---|---|---|---|
| **Press scale — button** | 80ms (touch) | spring | `spring.tap` (damping 18, stiffness 280, mass 0.8) | scale → 0.96 | `haptics.tap()` (Light) | `Motion.duration.touch:54`, `Motion.spring.tap:87`, `PressScale` |
| **Press scale — card/row** | 80ms (touch) | spring | `spring.press` (damping 15, stiffness 200, mass 0.9) | scale → 0.97 (`PressScale.tap`) | `haptics.tap()` (Light) | `Motion.spring.press:89`, `PressScale.tap:533` |
| **Press scale — large surface** | 80ms (touch) | spring | `spring.press` | scale → 0.985 (`PressScale.gentle`) | `haptics.tap()` (Light) | `PressScale.gentle:535` |
| **Press scale — icon-only** | 80ms (touch) | spring | `spring.tap` | scale → 0.92 (`PressScale.icon`) | `haptics.selection()` (Light) | `PressScale.icon:537` |
| **Page/screen transition** | 280ms (slow) | `entrance` (ease-out cubic) | — | slide in from right | — | `Motion.duration.slow:60`, `Motion.easing.entrance:120` |
| **Sheet slide — present** | 280ms (slow) | `entrance` (ease-out cubic) | `spring.sheet` (damping 22, stiffness 180, mass 1.0) | translateY → 24px → 0 | — | `Motion.transitions.sheet:179-183`, `Motion.spring.sheet:93` |
| **Sheet slide — dismiss** | 280ms (slow) | `exit` (ease-in cubic) | `spring.sheet` | translateY → 400px | — | `Motion.easing.exit:122` |
| **Content crossfade** | 180ms (normal) | `smooth` (ease-in-out ease) | — | opacity 0 → 1, no travel | — | `Motion.transitions.crossfade:191-194` |
| **Media load crossfade** | 250ms | `smooth` (ease-in-out ease) | — | opacity 0 → 1, never pop | — | `Motion.transitions.mediaLoad:196-199` |
| **Like animation (double-tap)** | 120ms (fast) | spring | `spring.success` (damping 12, stiffness 120, mass 1.0) | scale 1.0 → 1.2 → 1.0 | `HapticPatterns.like()` (Light × 2, 60ms apart) | `Motion.spring.success:101`, `hapticPatterns.ts:18-21` |
| **Tab switch** | 200ms | `crisp` (ease-in-out cubic) | — | translateX → 12px → 0 + content crossfade | `HapticPatterns.tabSwitch()` (selection) | `Motion.transitions.tabSwitch:185-189`, `Motion.easing.crisp:126` |
| **List item appear** | 220ms | `entrance` (ease-out cubic) | — | FadeInDown, translateY 8px → 0 | — | `Motion.transitions.listItem:172-177` |
| **List stagger** | 40–100ms between items | — | — | capped to 8 items (`stagger.maxItems`) | — | `Motion.stagger:155-163` |
| **Toggle / icon swap** | 120ms (fast) | `crisp` (ease-in-out cubic) | — | opacity + scale morph | `haptics.toggle()` (Light) | `Motion.duration.fast:56`, `Motion.easing.crisp:126` |
| **Modal entrance** | 280ms (slow) | `entrance` (ease-out cubic) | `spring.sheet` (damping 22, stiffness 180) | scale 0.95 → 1.0 + opacity | — | `Motion.mapping.modalEntrance:148` |
| **Success celebration** | 400ms (slower) | spring | `spring.success` (damping 12, stiffness 120, mass 1.0) | scale + bounce, brief | `HapticPatterns.purchaseComplete()` (Medium → Success, 100ms apart) | `Motion.duration.slower:62`, `Motion.spring.success:101`, `hapticPatterns.ts:24-27` |
| **Error shake** | 120ms (fast) | spring | `spring.urgency` (damping 14, stiffness 220, mass 0.9) | translateX ±8px, 2 oscillations | `haptics.error()` (Error notification) | `Motion.spring.urgency:105` |
| **Pull-to-refresh** | 280ms (slow) | spring | `spring.settle` (damping 24, stiffness 240, mass 0.9) | translateY follows drag → spring back | `HapticPatterns.refresh()` (Medium) | `Motion.spring.settle:91`, `hapticPatterns.ts:52-54` |
| **Long-press reveal** | instant (0ms) | — | — | — | `HapticPatterns.longPress()` (Heavy) | `hapticPatterns.ts:67-69` |
| **Auction bid placed** | 120ms (fast) | spring | `spring.tap` (damping 18, stiffness 280) | scale 0.97 → 1.0 | `HapticPatterns.bidPlaced()` (selection → Light, 50ms apart) | `hapticPatterns.ts:30-33` |
| **Auction won** | 400ms (slower) | spring | `spring.success` (damping 12, stiffness 120) | scale celebration | `HapticPatterns.auctionWon()` (Success × 2, 200ms apart) | `hapticPatterns.ts:78-81` |
| **Co-own unit purchased** | 400ms (slower) | spring | `spring.success` | scale + glow | `HapticPatterns.coOwnUnit()` (Success → Light, 120ms apart) | `hapticPatterns.ts:72-75` |
| **Swipe-to-delete** | 200ms (normal) | `exit` (ease-in cubic) | `spring.settle` | translateX → screen width | `HapticPatterns.delete()` (Heavy → Error, 80ms apart) | `hapticPatterns.ts:41-44` |
| **Segment indicator slide** | 200ms (normal) | `crisp` (ease-in-out cubic) | `spring.indicator` (damping 24, stiffness 240, mass 0.9) | translateX → tab width | `haptics.selection()` | `Motion.spring.indicator:107` |

### Haptic level reference

| Haptic level | API call | `HapticType` | Use case | Token reference |
|---|---|---|---|---|
| **Selection** | `haptics.selection()` | `LIGHT` | Tab switch, picker, scroll-snap, filter | `haptics.ts:65` |
| **Light (tap)** | `haptics.tap()` | `LIGHT` | Button press, card tap, icon control | `haptics.ts:48` |
| **Medium (press)** | `haptics.press()` | `MEDIUM` | Bid, offer, send, publish, commitment | `haptics.ts:49` |
| **Heavy** | `haptics.heavyPress()` | `HEAVY` | Long-press, swipe-to-delete, destructive confirm | `haptics.ts:63` |
| **Success** | `haptics.success()` | `SUCCESS` | Purchase complete, auction won, publish done | `haptics.ts:50` |
| **Error** | `haptics.error()` | `ERROR` | Payment failed, publish failed, bid rejected | `haptics.ts:51` |
| **Warning** | `haptics.warning()` | `WARNING` | Outbid, auction ending soon, limit reached | `haptics.ts:64` |

---

## 9. Reanimated 4 Performance Notes (2026)

The 2026 Reanimated 4 production guidance (`AGENTS.md` §27.8: "Reanimated 4 worklets for all animations — off JS thread") is already architecturally correct in ThryftVerse — `AnimatedPressable` uses `useAnimatedStyle` with the `'worklet'` directive (line 117), so press feedback runs on the UI thread. But the 193 hardcoded-duration animations should be audited for two production risks documented in the current Reanimated 4 docs:

1. **Stale closure trap:** "If you pass a plain JavaScript object into a worklet (not a `useSharedValue`), Reanimated copies it once to the UI thread and treats it as immutable. Any update you make to that object on the JS side afterward is silently ignored" ([jean-desauw.fr/blog/react-native-animations-with-reanimated-in-production-what-nobody-tells-you](https://jean-desauw.fr/blog/react-native-animations-with-reanimated-in-production-what-nobody-tells-you)). Every value that changes during an animation must be a `useSharedValue`, not a plain object.
2. **New Architecture performance regressions:** Reanimated 4 on Fabric may show flickering during scroll and FPS drops with many animated components. The fixes require React Native 0.81+ and enabling feature flags `DISABLE_COMMIT_PAUSING_MECHANISM` and `USE_COMMIT_HOOK_ONLY_FOR_REACT_COMMITS` ([docs.swmansion.com/react-native-reanimated/docs/guides/performance](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/), [github.com/software-mansion-labs/skills/blob/main/skills/react-native-best-practices/references/animations/animations-performance.md](https://github.com/software-mansion-labs/skills/blob/main/skills/react-native-best-practices/references/animations/animations-performance.md)). Practical simultaneous-animation limits: ~500 on iOS, ~100 on low-end Android — use `useReducedMotion` to reduce animation complexity on low-end devices.
3. **ProMotion 120fps:** Add `CADisableMinimumFrameDurationOnPhone = true` to `Info.plist` to enable 120fps animations on ProMotion devices; without this flag, iOS caps at 60fps ([github.com/software-mansion-labs/skills/blob/main/skills/react-native-best-practices/references/animations/animations-performance.md](https://github.com/software-mansion-labs/skills/blob/main/skills/react-native-best-practices/references/animations/animations-performance.md)).

---

## 10. Web Sources

| # | Source | URL | Relevance |
|---|---|---|---|
| 1 | Motion with Intent: How Animation Earns Its Place in Mobile UI | [tubikstudio.com/blog/motion-with-intent-ui-animation-mobile](https://tubikstudio.com/blog/motion-with-intent-ui-animation-mobile/) | Motion as communication — the five jobs animation does |
| 2 | Motion Design UX Best Practices | [blennd.com/motion-design-ux-best-practices](https://blennd.com/motion-design-ux-best-practices/) | Restraint, trust-building, motion as system |
| 3 | Motion Design 2026: What Most Designers Get Wrong | [mantlr.com/blog/motion-design-principles-2026](https://mantlr.com/blog/motion-design-principles-2026) | Nine mistakes, motion-as-communication vs decoration |
| 4 | Mobile App UX Design: 2026 Best-Practices Playbook | [forasoft.com/blog/article/mobile-app-ux-design-best-practices](https://www.forasoft.com/blog/article/mobile-app-ux-design-best-practices) | 2026 targets: tap response <100ms, reduced motion honoured |
| 5 | Haptics design principles — Android Developers | [developer.android.com/develop/ui/views/haptics/haptics-principles](https://developer.android.com/develop/ui/views/haptics/haptics-principles) | Clear/rich/buzzy haptics, "less is more" |
| 6 | Haptics UX design — Android Open Source Project | [source.android.com/docs/core/interaction/haptics/haptics-ux-design](https://source.android.com/docs/core/interaction/haptics/haptics-ux-design) | Effect selection by strength and input event |
| 7 | Haptic Feedback UI Guidelines for iOS | [vp0.com/blogs/haptic-feedback-ui-design-guidelines-ios](https://vp0.com/blogs/haptic-feedback-ui-design-guidelines-ios) | System pattern matching, restraint, never sole signal |
| 8 | Patterns — Haptic Feedback — PIE Design System | [pie.design/patterns/haptic-feedback](https://www.pie.design/patterns/haptic-feedback/) | System-provided patterns, causal relationship |
| 9 | Using Haptics in Mobile Apps — Newly | [newly.app/sensors/haptics-mobile-apps](https://newly.app/sensors/haptics-mobile-apps) | iOS Taptic Engine, Android LRA, Expo Haptics 80% case |
| 10 | Reduced Motion evaluation criteria — Apple Developer | [developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria/) | App Store review criteria for reduced motion |
| 11 | EAA Mobile App Accessibility 2026 Developer Checklist | [sota.io/blog/eaa-mobile-app-accessibility-ios-android-pwa-developer-checklist-2026](https://www.sota.io/blog/eaa-mobile-app-accessibility-ios-android-pwa-developer-checklist-2026) | EAA 2025 compliance, Reduce Motion, WCAG 2.5.4 |
| 12 | Inclusive Android Apps #8: The Problem of Animations | [buttondown.com/inclusive-android-apps/archive/inclusive-android-apps-8-the-problem-of-animations](https://buttondown.com/inclusive-android-apps/archive/inclusive-android-apps-8-the-problem-of-animations/) | Vestibular disorders, motion triggers, Android Remove animations |
| 13 | Animation and motion — web.dev | [web.dev/learn/accessibility/motion](https://web.dev/learn/accessibility/motion) | WCAG motion guidelines, `@prefers-reduced-motion` |
| 14 | React Native Reanimated — Performance guide | [docs.swmansion.com/react-native-reanimated/docs/guides/performance](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/) | Reanimated 4 feature flags, New Arch regressions |
| 15 | Animations Performance and Accessibility — RN best practices | [github.com/software-mansion-labs/skills/blob/main/skills/react-native-best-practices/references/animations/animations-performance.md](https://github.com/software-mansion-labs/skills/blob/main/skills/react-native-best-practices/references/animations/animations-performance.md) | 120fps, feature flags, simultaneous animation limits |
| 16 | Mastering React Native Reanimated: 60 FPS | [tothenew.com/blog/mastering-react-native-reanimated-building-60-fps-animations-without-blocking-the-js-thread](https://www.tothenew.com/blog/mastering-react-native-reanimated-building-60-fps-animations-without-blocking-the-js-thread/) | Worklets, shared values, UI thread execution |
| 17 | RN Animations with Reanimated in Production | [jean-desauw.fr/blog/react-native-animations-with-reanimated-in-production-what-nobody-tells-you](https://jean-desauw.fr/blog/react-native-animations-with-reanimated-in-production-what-nobody-tells-you) | Stale closure trap, production crash risks |
| 18 | Instagram's new motion system mimics natural human movement | [itsnicethat.com/news/studio-dumbar-instagram-digital-120324](https://www.itsnicethat.com/news/studio-dumbar-instagram-digital-120324) | Physics as cohesive rule-set, human imperfection |
| 19 | Designing the Unseen: Motion Design and Haptics in a Design System | [medium.com/singtel-experience-design/designing-the-unseen-introducing-motion-design-and-haptics-in-a-design-system-6994d51d8d06](https://medium.com/singtel-experience-design/designing-the-unseen-introducing-motion-design-and-haptics-in-a-design-system-6994d51d8d06) | Tokenised motion, constrained choices, haptics as feedback |
| 20 | Kinesis — Motion tokens designed around how interfaces feel | [timwickstrom.com/projects/kinesis](https://timwickstrom.com/projects/kinesis) | 115 named easing tokens by behavioural intent |
| 21 | Disney's 12 animation principles applied to mobile | [explainx.ai/skills/dylantarre/animation-principles/mobile-touch](https://explainx.ai/skills/dylantarre/animation-principles/mobile-touch) | Spring physics, haptic pairing, timing <100ms |
| 22 | Spring Drag Box — Compose Animation Walkthrough | [doveletter.dev/docs/compose-animations/spring-drag-box](https://doveletter.dev/docs/compose-animations/spring-drag-box) | Gesture-continuous motion, snapTo vs animateTo |
| 23 | Cross-Platform Design Tokens | [dev.to/sophie_fa_6ed935b0601d76/cross-platform-design-tokens-getting-web-mobile-to-feel-like-one-product-2ibh](https://dev.to/sophie_fa_6ed935b0601d76/cross-platform-design-tokens-getting-web-mobile-to-feel-like-one-product-2ibh) | Single source of truth for motion tokens |
| 24 | iOS 26 Design System — tokens | [github.com/seunghan91/ios26-design-system](https://github.com/seunghan91/ios26-design-system) | Spring curves, Liquid Glass morphing tokens |
| 25 | @yahoo/uds-mobile — Reanimated motion parity | [registry.npmjs.org/@yahoo/uds-mobile](https://registry.npmjs.org/@yahoo/uds-mobile) | Physics-based animations with motion parity to web |
