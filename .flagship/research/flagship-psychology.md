# Flagship Sub-Screen Psychology — 2025–2026 Research Synthesis

**Track:** The psychology & craft of flagship mobile quality
**Date compiled:** 2026-09-12
**Scope:** Sub-screen/component-level mechanisms that separate flagship apps from competent apps. Every claim carries a source, publisher, date, and evidence class.

**Evidence classes:** PRIMARY RESEARCH (peer-reviewed or controlled study) / PLATFORM GUIDANCE (Apple HIG, Material 3, Android UX docs) / SECONDARY ANALYSIS (NN/g, Baymard, design-engineering blogs) / COMMUNITY (designer discourse, skills repos) / INFERENCE (reasoned synthesis of the above).

---

## 1. Perceived quality formation

### The mechanism
Perceived quality is formed pre-attentively by System 1 processing, before the user reads a single word. Aesthetic judgments stabilize in ~50 ms and barely change with longer exposure (Lindgaard et al.). That first visceral read then propagates: visual appeal bleeds into judgments of usability and trustworthiness (the aesthetic–usability effect / halo). Crucially, the effect is bidirectional over time — Tuch et al. (2012) showed that *after use*, poor usability drags down perceived aesthetics. So polish buys the benefit of the doubt; jank spends it. On secondary screens, users are no longer judging "is this pretty" but "is this operationally sound" — misaligned edges, popping content, dead taps and layout shifts each act as small betrayal events that degrade global trust, because users generalize from visible sloppiness to invisible correctness ("if the button is misaligned, is my payment safe?").

### Current evidence
- Aesthetic appeal judged in **50 ms**, stable across longer exposures — Lindgaard et al. 2006, cited in NN/g "Powers of 10" (2009) and ACM TOCHI replication (Alsudani & Casey lineage). PRIMARY RESEARCH. https://www.nngroup.com/articles/powers-of-10-time-scales-in-ux/
- Apparent usability correlates more strongly with perceived *beauty* than with measured usability — Kurosu & Kashimura, CHI'95. PRIMARY RESEARCH. http://masui.org.s3.amazonaws.com/b/d/bdd052e6233fbeb0380491c7af408502.pdf
- Post-use, usability failures lower perceived aesthetics (the halo reverses) — Tuch et al., *Computers in Human Behavior* 2012. PRIMARY RESEARCH. https://www.sciencedirect.com/science/article/abs/pii/S0747563212000908
- First impressions drive credibility judgments; prominent elements pull attention automatically (Fogg's prominence–interpretation) — NN/g, Fessenden 2017. SECONDARY ANALYSIS. https://www.nngroup.com/articles/first-impressions-human-automaticity/
- Design quality is the #1 trustworthiness factor, durable across decades — NN/g "Trustworthiness in Web Design" (2016 update of Nielsen 1999). SECONDARY ANALYSIS. https://www.nngroup.com/articles/trustworthy-design/
- Craft/taste as differentiator when building cost → 0 — Karri Saarinen (Linear), Config keynote May 2025, "Why is quality so rare?". SECONDARY ANALYSIS. https://linear.app/now/why-is-quality-so-rare

### Concrete thresholds/numbers
- **50 ms** — aesthetic judgment forms (Lindgaard).
- **100 ms** — direct-manipulation ceiling: below this, response feels caused by the user (Nielsen response-time limits, 1993, reaffirmed 2014+). https://www.nngroup.com/articles/response-times-3-important-limits/
- **1 s** — flow-of-thought ceiling; **10 s** — attention-holding ceiling.

### Implementation translation (React Native)
- First paint of a secondary screen must arrive already-composed: no layout shift after mount, no image pop-in, no late-arriving header. Precompute layout; render skeletons that match final geometry exactly.
- Every interactive element must visually acknowledge touch within ~1 frame of `onPressIn` — not `onPress`/`onPressOut`. Pressed state on press-in closes the perception gap.
- Janky single details (a flickering badge, a scroll stutter, a wrong-radius card) are not local defects; treat each as a global trust withdrawal and fix at the primitive level.

### Audit questions
- At 25% scale (thumbnail test), does the screen have a clear dominant object, or is it a grid of identical grey cards?
- Does anything move, pop, or re-lay-out within the first second after the screen appears?
- Does every tappable surface show feedback on touch-down, before release?

---

## 2. Micro-interaction psychology

### The mechanism
Press feedback works through *perceived simultaneity*: the brain fuses touch and response into one causal event only within a narrow latency window. Psychophysics studies found the point of subjective simultaneity (PSS) at ~5 ms tactile, ~19 ms audio, ~32 ms visual — and perceived *quality* drops measurably beyond ~70–100 ms for tactile/audio and ~100–150 ms for visual. Interestingly, a small delay is not merely tolerated but sometimes *preferred*: responses judged "most comfortable" cluster in the 100–200 ms band — instant (0–50 ms) feedback can feel like it wasn't caused by the action at all. Springs feel native because they model real inertia — decelerating asymptotically and preserving velocity on interruption — whereas linear/ease curves have non-physical velocity discontinuities the eye instantly detects.

### Current evidence
- PSS and quality thresholds per modality; recommended feedback windows: **tactile 5–50 ms, audio 20–70 ms, visual 30–85 ms** — Kaaresoja & Linjama lineage, ACM TAP "Temporally Perfect Virtual Button" (2014). PRIMARY RESEARCH. https://dl.acm.org/doi/10.1145/2611387
- Optimal subjective delay ~100–200 ms; <50 ms judged "too fast to be caused by me" — KOH/ERP studies, *Perceptual and Motor Skills* 2004 + ERP corroboration 2008. PRIMARY RESEARCH. https://journals.sagepub.com/doi/10.2466/pms.99.3.924-930
- Springs preserve velocity through interruption; linear animation's abrupt velocity jumps "feel out of place" for movement — Apple WWDC23 "Animate with springs". PLATFORM GUIDANCE. https://developer.apple.com/videos/play/wwdc2023/10158/
- M3 Expressive moved all component motion to a spring-based physics system (stiffness/damping/initial velocity tokens) — Material Design 3, 2025. PLATFORM GUIDANCE. https://m3.material.io/styles/motion/overview/how-it-works
- Pressed-scale convention ~0.95–0.98 with a fast/springy return; 0.97 matches iOS system button feel — community engineering references + react-native-pressable-scale default 0.95. COMMUNITY. https://github.com/mrousavy/react-native-pressable-scale/
- Android haptic grammar: `EFFECT_CLICK` as baseline, `EFFECT_TICK` lighter, `EFFECT_HEAVY_CLICK`/`EFFECT_DOUBLE_CLICK` stronger; press harder than release — Android haptics UX design docs. PLATFORM GUIDANCE. https://source.android.com/docs/core/interaction/haptics/haptics-ux-design

### Concrete thresholds/numbers
- Visual press feedback: **≤85 ms** to read as simultaneous.
- Haptic confirmation: **≤50 ms** ideal.
- Optimal "felt causal" delay band: **~100–200 ms**.
- Pressed scale: **0.95–0.98** (≤0.95 reads cartoonish; ≥0.99 imperceptible).
- Haptics: "less is more" — overuse numbs and causes users to disable globally (Android haptics principles).

### Implementation translation (React Native)
- Use `Pressable` with `onPressIn`-driven visual state or Reanimated `useAnimatedStyle` on `isPressed`; keep feedback off the JS thread (RNGH/Reanimated) so it survives JS stalls.
- Replace `Animated.timing` + `Easing.linear/easeInOut` with `withSpring` (Reanimated) or `expo-haptics`-paired springs; springs are interruptible by construction — timing animations snap velocity to zero when retargeted.
- Haptics via `expo-haptics`: `impactAsync(Light)` for selections/toggles, `Medium` for commits, `notificationAsync(Success/Warning/Error)` for outcomes. Never on every scroll tick.
- Android: prefer `HapticFeedbackConstants` action-oriented semantics over raw waveforms — hardware variance means abstracting to *meaning*, not waveform.

### Audit questions
- Does touch-down produce visible feedback within one frame, even under JS load?
- Can every in-flight animation be interrupted and retargeted without a velocity snap (tap mid-animation)?
- Is haptic usage sparse and semantic (confirm/warn/succeed) rather than decorative?
- Do any pressables still use plain opacity with no scale/dim, or worse, no pressed state at all?

---

## 3. State honesty & trust

### The mechanism
Uncertainty is the enemy: when the system gives no signal, the brain interprets silence as threat ("did it send? did it save? did it charge me?"). Truthful, scoped uncertainty ("still loading," "saved locally, will sync") preserves trust better than false confidence (fake progress, silent failures). Skeleton screens outperform spinners not because they're faster but because they convert an unknown wait into a *preview*: the user reads the shape of coming content, perceiving shorter duration and higher competence. Spinners communicate only "wait"; progress bars communicate "wait, and here's how much"; skeletons communicate "wait, and here's what's coming."

### Current evidence
- Skeleton screens produced the best perceived speed: 48% rated a fixed 5 s load as fast (1–3 s); blank page worst at 52.4% slow/very slow — IHC 2025 comparative study, n=21. PRIMARY RESEARCH. https://doi.org/10.5753/ihc_estendido.2025.13255
- Two-stage spinner+skeleton reduced perceived wait vs. spinner alone; blank-screen-then-spinner worst — *Applied Sciences* 2025, "Mobile Click-and-Load Waiting Scenarios". PRIMARY RESEARCH. https://doi.org/10.3390/app15126717
- "Looped animation + skeleton screen" shortest perceived wait; percent-done adds transparency — 2024 feedback-combination study, n=134. PRIMARY RESEARCH. https://doi.org/10.17918/00010606
- Skeleton preferred for informational services; progress bars for educational/entertainment; spinners rated low despite ubiquity — APJCRI 2025. PRIMARY RESEARCH. https://doi.org/10.47116/apjcri.2025.10.28
- Offline UX: tell users both the app's state and the actions still available; unstable connection "makes your app feel untrustworthy" — web.dev/Google offline UX guidelines. PLATFORM GUIDANCE. https://web.dev/articles/offline-ux-design-guidelines
- Pair "cloud off" icon with explicit "no internet" text; icon-only status fails comprehension — Google Material offline design guidance. PLATFORM GUIDANCE. https://design.google/library/offline-design
- Label online-saved vs. device-saved vs. queued vs. stale distinctly; never let online-only actions pretend to succeed — UX Patterns Guide, offline state pattern. SECONDARY ANALYSIS. https://uxpatternsguide.com/patterns/offline-state/
- M3: use skeleton loaders so UI is "coherent and stable during a transition"; avoid content shifting or popping in — Material 3 transitions. PLATFORM GUIDANCE. https://m3.material.io/styles/motion/transitions/applying-transitions

### Concrete thresholds/numbers
- <100 ms: no indicator needed. 100 ms–1 s: response only. >1 s: skeleton/spinner. >10 s: percent-done + expectation of duration (Nielsen limits).
- Skeleton shapes must match final layout geometry ~1:1 — a skeleton that doesn't resemble the loaded content reads as a second glitch.

### Implementation translation (React Native)
- Build skeleton components that mirror real row/card geometry (same heights, radii, padding). Animate with a slow shimmer (~1.2–1.5 s loop) rather than a spin.
- Never render a spinner where a skeleton is possible; reserve spinners for blocking actions < a few seconds and use determinate progress for uploads/checkout steps.
- Offline: cache-first reads, a persistent honest banner ("Offline — showing saved items"), disable buy/offer buttons with a reason, queue writes with visible "will send when back online" state.
- Error recovery is a confidence feature: every failed mutation needs a retry affordance *in place*, not a modal that loses context.

### Audit questions
- Does every fetch surface have loading/empty/error/offline/populated designed — or only the happy path?
- Do skeletons match the final layout's silhouette? Does content pop or shift when it arrives?
- If the network dies mid-checkout, does the UI say exactly what's saved, queued, or lost?
- Does any spinner run longer than ~2 s without escalating to skeleton/progress/explanation?

---

## 4. Information hierarchy & density

### The mechanism
Users don't read screens; they *forage*. Eyetracking shows scanning patterns (F, layer-cake, spotted, lawn-mower) that concentrate fixations top-left and on headings/first-words. Hierarchy isn't decoration — it's the mechanism by which a scanning user gets the right answer from partial attention. Density has a dual cost: each additional element adds visual search time and decision weight. Chunking and progressive disclosure reduce working-memory load; "one thing per page" converts a complex form into a sequence of trivial decisions, which empirically lowers abandonment and error.

### Current evidence
- F-pattern confirmed on mobile in NN/g's revisit (500+ participants across 13 years of eyetracking); also layer-cake, spotted, commitment, lawn-mower, pinball patterns — NN/g "How People Read Online" report + 2017/2026-review article. PRIMARY RESEARCH. https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/
- One-at-a-time question format: more completions, faster, no drop-out increase — PLOS ONE large-scale study (Peytchev et al. lineage), two large web studies. PRIMARY RESEARCH. https://journals.plos.org/plosone/article/file?id=10.1371/journal.pone.0036771&type=printable
- "One thing per page" reduces cognitive load, surfaces errors early, speeds perceived progress — GDS service-manual guidance + Adam Silver case study (Boots.com). SECONDARY ANALYSIS. https://www.smashingmagazine.com/2017/05/better-form-design-one-thing-per-page/ and https://userresearch.blog.gov.uk/2015/08/13/no-more-accordions-how-to-choose-a-form-structure/
- GDS: no more accordions — collapsed content hides required fields and breaks the mental sequence. SECONDARY ANALYSIS (same URL above).
- Normal list viewport should expose ~4–6 useful rows (density target consistent with Fitts/visual-search trade-offs). INFERENCE from target-size + scanning research.

### Concrete thresholds/numbers
- ~4–6 visible rows per list viewport; ≥2 media objects in a discovery viewport.
- ≤3 type sizes in first viewport; headings carry the scan (layer-cake).
- First ~2 lines / first words of each line get the most fixations — front-load keywords.

### Implementation translation (React Native)
- Order = importance: the thing the user came for occupies the first viewport; secondary content is reachable, not competing.
- Long forms (listing an item, checkout, payout setup) → stepped screens with one decision each, progress indicated, early validation.
- Use typographic hierarchy (size/weight/color) rather than boxing everything; hairlines + spacing do grouping work that cards overdo.
- Headings and list items front-load the discriminating word ("Order #4821 · Shipped" not "Your order information").

### Audit questions
- Can a scanning user identify the screen's purpose from headings alone (layer-cake test)?
- Does the first viewport contain the primary action/object without scrolling?
- Is any form asking >1 conceptual question on a single screen?
- Are the most important items top-left/topmost, or is prime real estate spent on chrome and decoration?

---

## 5. Motion as communication

### The mechanism
Motion's real job is *causality demonstration*: it shows the user where content came from and where it went, maintaining a coherent spatial model of the app. A shared-element (container-transform) transition answers "is this the same item?" with continuity instead of explanation. Without it, users must re-orient on every navigation — a small cognitive tax paid hundreds of times per session. Motion also carries a budget: frequent, large, stylized animation on routine transitions is exhausting; reserve expressive motion for hero moments and use quiet, fast defaults elsewhere.

### Current evidence
- Transitions exist to "establish a coherent spatial model"; unified direction of movement; container transform reserved for hero moments/shallow hierarchies; platform defaults for forward/back nav — Material 3 Transitions guidance. PLATFORM GUIDANCE. https://m3.material.io/styles/motion/transitions/applying-transitions
- M3 four canonical patterns: container transform (seamless element→element), shared axis (spatial/navigational relationship), fade through (unrelated destinations), fade (within bounds) — Material motion codelab/spec. PLATFORM GUIDANCE. https://codelabs.developers.google.com/codelabs/material-motion-android
- M3 suggested durations: Emphasized 500 ms on-screen / 400 ms enter / 200 ms exit; Standard 300/250/200 — M3 easing & duration. PLATFORM GUIDANCE. https://m3.material.io/styles/motion/easing-and-duration/applying-easing-and-duration
- Honor reduced-motion settings; avoid slow cross-fades that create "distracting cross faded frames" — M3 transitions. PLATFORM GUIDANCE (same URL).
- Springs now underpin the whole M3 Expressive motion scheme; velocity continuity is the default, not an option — M3 motion overview. PLATFORM GUIDANCE. https://m3.material.io/styles/motion/overview/how-it-works

### Concrete thresholds/numbers
- Entering transitions ~250–400 ms; exiting ~200 ms (exits faster than entrances).
- Small utility transitions ~200–300 ms; keep press/hover effects <150 ms.
- Cross-fades: short (<200 ms) to avoid ghosting frames.

### Implementation translation (React Native)
- React Navigation: use native-stack default transitions for push/pop; add `SharedElement` (reanimated shared-element or `react-native-shared-element`) for product-card → product-detail image continuity — the single highest-signal flagship transition in a marketplace.
- Horizontal peer navigation (tabs of equal rank) should translate on x-axis to hint at swipeability; hierarchical push should come from the right/edge per platform convention.
- Respect `AccessibilityInfo.isReduceMotionEnabled()` — swap spatial motion for fades.
- Don't animate mount on every list item; staggered fade-ins on recycled rows read as "AI polish."

### Audit questions
- Tapping a product card: does the image *become* the detail header (spatial continuity), or does a new screen materialize?
- Do back/gesture transitions reverse the entrance path exactly (undoable spatial model)?
- Is any routine transition slower than ~400 ms or more expressive than the content justifies?
- Does reduced-motion degrade gracefully to instant/fade?

---

## 6. Typography & legibility

### The mechanism
Legibility (distinguishing glyphs) and readability (following lines) are separate axes; mobile kills both via small sizes, glare, and motion. Readable measure matters: too-short lines choppy, too-long lines lose the return sweep. Hierarchy perception is driven by a small set of size/weight/contrast relationships — more than ~3 competing levels in a viewport destroys rather than enriches it. In financial/numeric surfaces, proportional figures jitter as values change and misalign columns; tabular figures (`tnum`) give every digit equal advance width so decimal points and magnitudes compare at a glance — alignment *is* comprehension for prices.

### Current evidence
- Body text line-height 1.4–1.6× font size; small labels need slightly open tracking, large text slightly tight — mobile typography guidance synthesis. SECONDARY ANALYSIS. https://createbytes.com/insights/Typography-rules-for-mobile-application
- `font-variant-numeric: tabular-nums` keeps right edge steady for prices/timers/tables; Inter/Roboto/system fonts ship tnum — multiple engineering references (MDN lineage). SECONDARY ANALYSIS. https://blog.authon.dev/tabular-numbers-in-css-font-variant-numeric-vs-monospace-hacks
- iOS: SF UI Text ≤19 pt / Display ≥20 pt auto-selected; built-in text styles auto-adjust tracking and leading per size — Apple HIG Typography. PLATFORM GUIDANCE. https://developer.apple.com/design/human-interface-guidelines/typography
- Dynamic Type: 7 default + 5 accessibility sizes; text that can't grow must offer Large Content Viewer — WWDC24 "Get started with Dynamic Type" + Mobile A11y guide. PLATFORM GUIDANCE. https://developer.apple.com/videos/play/wwdc2024/10074/
- Minimum text sizes: aim ≥11 pt iOS / ≥12 sp Android for secondary metadata; body 16–17 pt — platform guidance + convention. PLATFORM GUIDANCE/INFERENCE.

### Concrete thresholds/numbers
- Body: 16–17 pt, line-height 1.4–1.6×; captions/metadata ≥11 pt.
- Line length: ~35–75 characters; mobile sweet spot ~40–60.
- ≤3 type sizes per viewport; establish ratio (e.g., ~1.25–1.333 scale).
- Tabular numerals on any comparing/updating number (price, total, bid, timer).

### Implementation translation (React Native)
- RN: `fontVariant: ['tabular-nums']` on price/total/offer text styles — a one-line flagship tell.
- Build a single `Text` variant system (display/title/headline/body/caption) mapped to the platform type ramps; never ad-hoc `fontSize` literals in screens.
- Respect font scaling: don't set `allowFontScaling={false}` on content text; if a control truly can't scale, provide an accessible alternative. Test screens at the largest Dynamic Type size.
- Align mixed-size numerics to a shared baseline, not vertical center.

### Audit questions
- Do prices/totals in rows share a decimal axis (tabular), or do digits jitter/shift?
- Does the screen survive 200% text size without truncation or overlap?
- Are there >3 font sizes fighting in the first viewport?
- Is any body content below ~16 pt or metadata below ~11 pt?

---

## 7. Empty/error state psychology

### The mechanism
An empty state is a *test result the user ran on your system*: they asked for content and got nothing — the urgent question is "is it broken, still loading, my fault, or genuinely empty?" A good empty state answers that, then converts dead air into orientation (what this space is for), teaching (what it looks like populated), and a pathway (the single next action). Errors follow a parallel logic: users need to recognize what happened, understand who/what caused it without blame, and get a constructive next step. The emotional frame matters — five distinct empty-state situations (first-run, cleared, no-results, error, permission-denied) demand different copy and different jobs, not one generic component.

### Current evidence
- NN/g: empty states must communicate system status, increase learnability, provide direct pathways; inaccurate status messages are "particularly harmful" — NN/g 2021. SECONDARY ANALYSIS. https://www.nngroup.com/articles/empty-state-interface-design/
- Five distinct empty-state situations with different emotional states and jobs (orient/activate, celebrate, disambiguate/recover, be transparent, explain access) — Milakovic 2024/25 analysis. SECONDARY ANALYSIS. https://www.tamaramilakovic.com/thinking/empty-states-are-not-one-thing
- Contextual honesty ("empty because IMAP hasn't synced in 45 min") is the rarest and most valuable job — 137Foundry analysis. SECONDARY ANALYSIS. https://137foundry.com/articles/how-to-design-empty-states-that-earn-trust
- Error messages: human-readable, precise, constructive, no blame; match severity (inline < banner < modal); don't show errors prematurely ("grading a test before the student answers") — NN/g error-message guidelines + 2024 video. SECONDARY ANALYSIS. https://www.nngroup.com/articles/error-message-guidelines/
- Structure: problem → cause → recommendation; active voice; "don't say sorry unless it's definitely our fault"; imperative CTA verbs not "OK" — Elastic EUI / Atlassian / PatternFly. PLATFORM/SECONDARY GUIDANCE. https://eui.elastic.co/v106.1.0/docs/patterns/error-messages/how-to-write-good-error-messages/

### Concrete thresholds/numbers
- Empty state anatomy: 1 headline (name the state), ≤1 sentence context, 1 primary action. Optional illustration; never illustration-only.
- Error copy: title scannable in 3–4 words; body 1–2 sentences; CTA 1–2 imperative words.

### Implementation translation (React Native)
- A single `<EmptyState>` component parameterized by *situation* (firstRun / cleared / noResults / error / offline / noPermission) with required `title`, `context`, `action` props — not a generic "nothing here."
- Inline field validation on blur/submit for error-prone inputs; never error on first focus/keystroke.
- Retry buttons must actually retry the same query (React Query `refetch`), in place, preserving scroll/context.
- Marketplace-specific: "No results" states should offer filter-clear or saved-search creation; a sold-out listing state should offer "similar items."

### Audit questions
- Does every empty state say *why* it's empty and what to do next, in that order?
- Can the user distinguish "still loading" from "genuinely empty" from "failed"?
- Do error messages say what happened + what to do, without "Oops," "Invalid," or blame?
- Are non-blocking errors kept non-modal (toast/inline/banner), with modals reserved for true blockers?

---

## 8. Thumb-zone & ergonomics 2026

### The mechanism
One-handed use makes the thumb the sole pointer, and its reachable arc covers only ~30–50% of large screens — shrinking further as grip span increases. The bottom-center/bottom-third of the screen is the comfort zone; top-left is the hardest reach for right-handers. Fitts' law governs the rest: small or distant targets cost time and errors (the "fat finger" problem). Primary actions therefore gravitate to the bottom; destructive or rare actions can afford distance. Modern mitigation: bottom-anchored toolbars/sheets, large edge-to-edge targets, and OS reachability features — but the winning pattern is simply putting the important stuff low.

### Current evidence
- Natural thumb zone: ~30% of screen for small/medium thumbs, >50% for large-thumb users; lowermost and upper-left regions excluded for many users — Yonsei ergonomic study (4.7–5.2" devices). PRIMARY RESEARCH. https://yonsei.elsevierpure.com/en/publications/natural-thumb-zone-on-smartphone-with-one-handed-interaction-effe/
- Increasing grip span significantly reduced hit count and increased displacement — iPhone 5S/6/6+ study, HFES 2013. PRIMARY RESEARCH. https://doi.org/10.1177/1541931213601243
- Minimum target 1 cm × 1 cm (≈44pt/48dp) for quick accurate selection; view–tap asymmetry (seeable but untappable) is the classic failure — NN/g touch targets + Parhi/Karlson/Bederson 2006. PRIMARY RESEARCH. https://www.nngroup.com/articles/touch-target-size/
- Most Acceptable Target Size ~7.4 mm (young and elder users similar) — Applied Ergonomics 2021 zoom-and-click study. PRIMARY RESEARCH. https://www.sciencedirect.com/science/article/pii/S0169814121001694
- Dynamic adaptations (moving controls into reach) perceived as faster, less exhausting, more comfortable — Buschek et al., INTERACT 2017, N=35. PRIMARY RESEARCH. https://www.mmi.ifi.lmu.de/pubdb/publications/pub/buschek2017interact/buschek2017interact.pdf

### Concrete thresholds/numbers
- Min touch target: **44 × 44 pt (iOS) / 48 × 48 dp (Android)**, ~1 cm physical; preferred MATS ~7.4 mm+.
- Primary CTA: bottom third, thumb arc; secondary/destructive: above or behind confirmation.
- Hit area ≠ visible shape: a 44 pt target can render a 20–24 pt glyph.

### Implementation translation (React Native)
- Anchor primary actions in a bottom dock/sheet within `SafeAreaView`; marketplace pattern: buy/offer bar pinned at bottom of product detail.
- `hitSlop` generously on icon buttons — visible 20–24 pt glyph, 44 pt hit area; do not draw a big grey circle to fake size.
- Keep frequent filters/actions out of the top-left corner on tall devices; use bottom sheets for secondary action menus rather than top-anchored dropdowns.
- Destructive actions (delete listing) separated spatially + confirmation, since slips are worst in the comfort zone's crowded bottom area.

### Audit questions
- Is the primary action reachable one-handed without regrip on a 6.7"+ device?
- Are all targets ≥44/48 pt including hitSlop — and is any visible element falsely huge just to satisfy that?
- Are frequent controls in the top-left "hard reach" zone? Is the bottom edge used for the real action?

---

## 9. Trust mechanics in commerce

### The mechanism
Transaction confidence is largely a *visual gut judgment*, not a technical assessment. Baymard's repeated finding: users treat some parts of the same HTTPS form as "more secure" than others based purely on visual robustness — encapsulation, padlock icons, reassuring microcopy near the sensitive fields. Trust is also state honesty over time: accurate totals, visible fees, order state labels, and recoverable errors. In a peer marketplace, trust additionally flows through provenance signals (seller history, ratings, verified badges) and reversibility signals (returns, buyer protection, escrow language).

### Current evidence
- **19% of users abandoned a checkout in the last quarter** due to not trusting the site with card info (n=1,026 US adults, 2025); perceived security driven by visual cues near payment fields — Baymard 2025 update. PRIMARY RESEARCH. https://baymard.com/blog/perceived-security-of-payment-form
- Visually reinforcing credit-card fields (encapsulation, background, padlock, seal adjacency) measurably increased perceived security; historically 89% of top-100 ecommerce sites failed this — Baymard. PRIMARY RESEARCH. https://baymard.com/blog/visually-reinforce-sensitive-fields
- Order summary must stay visible/accessible on the payment step; uncertainty *before* paying is the friction — Baymard payment UX standards. SECONDARY ANALYSIS. https://baymard.com/learn/payment-ux
- Trust factors: design quality, up-front disclosure, comprehensive/current content, connection to the rest of the web — NN/g trustworthiness. SECONDARY ANALYSIS. https://www.nngroup.com/articles/trustworthy-design/
- Site-seal trust varies by brand recognition (Norton > others); fake seals score non-trivially — i.e., the *cue* works even when hollow, which is why misuse erodes category trust — Baymard seal study (2013/2016/2022). PRIMARY RESEARCH. https://baymard.com/blog/site-seal-trust

### Concrete thresholds/numbers
- 19% checkout abandonment from distrust (2025).
- Up-front disclosure: total price incl. fees/shipping visible *before* payment entry (Baymard consistently finds hidden costs the #1 abandonment driver).

### Implementation translation (React Native)
- Payment sheet: visually distinct container (subtle fill + hairline + lock icon) around card fields; Apple Pay/Google Pay native sheets where possible (borrowed trust).
- Order summary line-itemized above the pay button — item, shipping, fees, total; never a bare number.
- Seller surfaces: rating count + recency, response-time stats, verified-identity badge, buyer-protection microcopy adjacent to the buy CTA — near the decision point, not buried in a profile tab.
- After purchase: an explicit, honest order state ("Paid · Awaiting seller shipment") with what-happens-next, not a generic success toast.
- Prices/currency tabular + right-aligned; consistent decimal handling.

### Audit questions
- Does the pay surface *look* more secure than the rest of checkout (encapsulation + lock + reassurance near fields)?
- Is the full total with fees visible before the user commits?
- Are reversibility signals (returns, protection, escrow) adjacent to the buy decision?
- Does post-purchase state honestly label where the money/goods are?

---

## 10. Anti-AI-design literature (2025–2026)

### The mechanism
AI-generated UI converges on the *statistical center* of its training distribution: Inter, violet-to-indigo gradients, three identical cards, `rounded-2xl` + `backdrop-blur` everything, emoji-as-icons, centered hero, "Welcome to our platform." Each choice is defensible alone; the ensemble is a fingerprint because it represents *no decisions*. This is "distributional convergence" — the model optimizes for "looks like a real app" with no constraints on *which* app, for whom. Human-authored signal = deliberate deviation with intent: an opinionated type choice, an asymmetric composition, a dominant object, copy that names specifics, restraint where convention expects decoration. Craft researchers (Saarinen/Linear, Artman) frame taste — the judgment to reject the technically-adequate — as the remaining differentiator when generation cost → 0.

### Current evidence
- "AI slop" = convergent default output; detectable fingerprint (specific utilities, font stacks, easing); measurable "slop scores" across tools — Sailop 2026 analysis. SECONDARY ANALYSIS. https://sailop.com/blog/ai-slop-definitive-guide-2026
- Slop = "statistically average version of every decision"; fix is structure/constraints, not prompt adjectives — uxskill analysis. SECONDARY ANALYSIS. https://uxskill.laithjunaidy.com/what-is-ai-slop.html
- "New Skeuomorphism": AI-era interchangeable generic UX passes review but erodes trust like skeuomorphic cringe did — Built In, Jun 2026. SECONDARY ANALYSIS. https://builtin.com/articles/ai-design-slop-era
- Distributional convergence named and mechanized (model → safe center; coding agent → easy-to-build subset) — Superdesign 2026. SECONDARY ANALYSIS. https://superdesign.dev/blog/why-ai-design-looks-generic
- Credibility judgment in ~50 ms means looking like tool-default output signals "no visual decisions made" to design-literate users — designpixil analysis citing Lindgaard/Adobe. SECONDARY ANALYSIS. https://designpixil.com/blog/ai-slop-design
- Linear: "craft can never be fully outsourced"; taste as moat; AI used to expand thinking, not generate finished UI — Saarinen Config keynote + stateofaidesign case. SECONDARY ANALYSIS. https://linear.app/now/why-is-quality-so-rare and https://stateofaidesign.com/cases/linear

### Concrete thresholds/numbers (fingerprint heuristics)
- ≥4 of {Inter-or-default font, purple/blue gradient, 3 identical cards, emoji icons, generic "Welcome/Platform" copy, uniform pill/roundness on everything} on one screen ⇒ reads as generated.
- Thumbnail test: at 25% zoom, a human-authored screen shows a dominant object + intentional asymmetry; slop shows uniform grey grid.

### Implementation translation (React Native / ThryftVerse)
- One owned typeface (or platform system font deliberately tuned), one radius grammar, one stroke grammar, one icon family, one press feedback, one motion language — consistency reads as *someone decided*.
- Asymmetry + dominant object per screen: a hero listing image, a big number, an oversized title — something leads.
- Copy names specifics ("Sold 2h ago · Ships from Porto"), never platform-generic filler ("Welcome back! Explore items").
- Real imagery as the visual anchor; no grey placeholder boxes, no decorative gradients standing in for content.
- Show less: remove eyebrows/subtitles/badges that restate; the object is the label.

### Audit questions
- Thumbnail test: does the screen silhouette look like a specific product or like every dashboard?
- Could this screen belong to any app, or only ThryftVerse (brand/type/content specificity)?
- Count defaults: uniform cards? gradient header? emoji/placeholder icons? duplicated headings? Restated labels?
- Is anything on screen that no human designer would choose twice — decoration that communicates nothing?

---

# The 20 flagship signatures

Highest-signal details distinguishing flagship sub-screens, each with its evidence base.

| # | Signature | Evidence |
|---|-----------|----------|
| 1 | **First paint arrives composed** — no layout shift, image pop-in, or late header within the first second | 50 ms aesthetic judgment (Lindgaard/NN/g); M3 "coherent and stable" transitions |
| 2 | **Every touch acknowledged on press-in** — visible feedback within ~1 frame (<85 ms visual simultaneity window) | ACM TAP latency study (visual 30–85 ms); Nielsen 0.1 s direct-manipulation limit |
| 3 | **Pressed-scale microfeedback (~0.95–0.98) with springy return** on all tappables, driven off the JS thread | Platform convention (iOS system buttons); RN community (pressable-scale 0.95) |
| 4 | **Springs, not linear/ease curves, for all interruptible motion** — velocity preserved on retarget | WWDC23 "Animate with springs"; M3 Expressive physics system |
| 5 | **Semantic haptic grammar** — light tick for selection, medium for commit, notification for outcomes; sparse | Android haptics UX principles; tactile simultaneity 5–50 ms window |
| 6 | **Skeletons that mirror final geometry** — shimmer on real layout silhouette, never bare spinner for content loads | IHC 2025 & Applied Sciences 2025 perceived-wait studies; M3 skeleton guidance |
| 7 | **Loading strategy escalates with duration** — <100 ms none, ~1 s skeleton, >10 s determinate progress | Nielsen response-time limits; feedback-combination research |
| 8 | **Shared-element continuity** — tapped card's image becomes the detail header | M3 container-transform pattern; spatial-model guidance |
| 9 | **Motion budget** — entrances ~250–400 ms, exits ~200 ms; routine transitions quiet, hero moments expressive; reduced-motion honored | M3 easing/duration table; M3 accessibility guidance |
| 10 | **Layer-cake hierarchy** — headings/subheads alone convey the screen; ≤3 type sizes per viewport | NN/g eyetracking (500+ participants); scanning-pattern research |
| 11 | **First viewport = the point** — primary object/action visible without scroll; ~4–6 list rows | F-pattern/top-left fixation data; density/Fitts trade-off |
| 12 | **One decision per screen in flows** — stepped forms, early inline validation, visible progress | PLOS ONE one-at-a-time study; GDS "one thing per page" |
| 13 | **Tabular numerals on every comparing number** — prices, totals, bids right-aligned on a decimal axis | `tnum` typography literature; financial-UI convention |
| 14 | **Text that scales** — ≥16 pt body, ≥11 pt metadata, survives 200% Dynamic Type without truncation | Apple HIG/WWDC24 Dynamic Type; mobile legibility guidance |
| 15 | **Typed empty states** — distinct first-run / cleared / no-results / error / offline variants, each naming the cause + one action | NN/g empty-state guidelines; five-situation framework (Milakovic) |
| 16 | **Errors = problem + cause + next step** — blame-free, severity-matched (inline < banner < modal), never premature | NN/g error guidelines; Elastic/Atlassian/PatternFly structure |
| 17 | **Honest offline** — scoped banner, cached content usable, queued writes labeled, online-only actions disabled with reasons | web.dev + Material offline guidelines; UX Patterns offline pattern |
| 18 | **Bottom-third gravity** — primary CTA in thumb zone, 44/48 pt targets via hitSlop (visible glyph stays small) | Thumb-zone heat-map studies; NN/g 1 cm target; HFES grip-span data |
| 19 | **Visually reinforced payment surface** — encapsulated card fields, lock icon, line-itemized total before commit, native pay sheets | Baymard: 19% abandonment on distrust; perceived-security experiments |
| 20 | **Authored, not assembled** — dominant object, intentional asymmetry, brand-specific copy, one radius/stroke/icon/feedback grammar; passes the thumbnail test | Anti-AI-slop literature (2025–26); Linear craft thesis; aesthetic–usability effect |

---

## Source index (28 distinct sources)

1. NN/g — First Impressions / Automaticity (2017) — https://www.nngroup.com/articles/first-impressions-human-automaticity/
2. NN/g — Trustworthy Design (2016) — https://www.nngroup.com/articles/trustworthy-design/
3. NN/g — Perceived Value — https://www.nngroup.com/articles/perceived-value/
4. NN/g — Response Times: 3 Important Limits (1993) — https://www.nngroup.com/articles/response-times-3-important-limits/
5. NN/g — Powers of 10 (2009) — https://www.nngroup.com/articles/powers-of-10-time-scales-in-ux/
6. NN/g — F-Shaped Pattern Revisited (2017/2026) — https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/
7. NN/g — Text Scanning Patterns (2019) — https://www.nngroup.com/articles/text-scanning-patterns-eyetracking/
8. NN/g — Touch Target Size — https://www.nngroup.com/articles/touch-target-size/
9. NN/g — Empty States (2021) — https://www.nngroup.com/articles/empty-state-interface-design/
10. NN/g — Error-Message Guidelines — https://www.nngroup.com/articles/error-message-guidelines/
11. ACM TAP — Temporally Perfect Virtual Button (2014) — https://dl.acm.org/doi/10.1145/2611387
12. Perceptual & Motor Skills — Optimal delay (2004) — https://journals.sagepub.com/doi/10.2466/pms.99.3.924-930
13. Kurosu & Kashimura — Apparent Usability (CHI'95) — http://masui.org.s3.amazonaws.com/b/d/bdd052e6233fbeb0380491c7af408502.pdf
14. Tractinsky et al. — What Is Beautiful Is Usable (2000) — https://doi.org/10.1016/s0953-5438(00)00031-x
15. Tuch et al. — Is beautiful really usable? (2012) — https://www.sciencedirect.com/science/article/abs/pii/S0747563212000908
16. IHC 2025 — Loading strategies perception — https://doi.org/10.5753/ihc_estendido.2025.13255
17. Applied Sciences 2025 — Click-and-load waiting — https://doi.org/10.3390/app15126717
18. APJCRI 2025 — Loading microinteraction by service purpose — https://doi.org/10.47116/apjcri.2025.10.28
19. Feedback-combination study (n=134) — https://doi.org/10.17918/00010606
20. Apple WWDC23 — Animate with springs — https://developer.apple.com/videos/play/wwdc2023/10158/
21. Material 3 — Motion overview / transitions / easing-duration — https://m3.material.io/styles/motion/overview/how-it-works
22. Android — Haptics design principles & UX — https://developer.android.com/develop/ui/views/haptics/haptics-principles
23. web.dev — Offline UX guidelines — https://web.dev/articles/offline-ux-design-guidelines
24. Google Design — Offline design (Material) — https://design.google/library/offline-design
25. PLOS ONE — One-at-a-time survey format — https://journals.plos.org/plosone/article/file?id=10.1371/journal.pone.0036771&type=printable
26. GDS/Smashing — One thing per page — https://www.smashingmagazine.com/2017/05/better-form-design-one-thing-per-page/
27. Yonsei — Natural thumb zone — https://yonsei.elsevierpure.com/en/publications/natural-thumb-zone-on-smartphone-with-one-handed-interaction-effe/
28. HFES 2013 — Grip span — https://doi.org/10.1177/1541931213601243
29. Baymard — Perceived security of payment form (2025) — https://baymard.com/blog/perceived-security-of-payment-form
30. Baymard — Visually reinforce credit card fields — https://baymard.com/blog/visually-reinforce-sensitive-fields
31. Linear — Why is quality so rare? (2025) — https://linear.app/now/why-is-quality-so-rare
32. Sailop — AI Slop definitive guide (2026) — https://sailop.com/blog/ai-slop-definitive-guide-2026
33. uxskill — What is AI slop — https://uxskill.laithjunaidy.com/what-is-ai-slop.html
34. Superdesign — Why AI design looks generic (2026) — https://superdesign.dev/blog/why-ai-design-looks-generic
35. Built In — The new skeuomorphism (2026) — https://builtin.com/articles/ai-design-slop-era
36. Elastic EUI — Error message writing — https://eui.elastic.co/v106.1.0/docs/patterns/error-messages/how-to-write-good-error-messages/
37. Milakovic — Empty states are not one thing — https://www.tamaramilakovic.com/thinking/empty-states-are-not-one-thing
38. WWDC24 — Dynamic Type — https://developer.apple.com/videos/play/wwdc2024/10074/
