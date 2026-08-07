# THRYFTVERSE — FLAGSHIP PRODUCT EXECUTION CHARTER

This file defines the working principles for every AI agent operating inside the ThryftVerse repository.

These principles apply to all implementation, UI/UX, debugging, refactoring and validation tasks unless the user explicitly overrides a principle in the current task.

The native mobile application is the product. Every decision must serve the user's experience at the highest possible quality.

---

## 1. WORKSPACE VERIFICATION

Work inside the repository currently opened by the user.

Before editing, verify:

```bash
pwd
git rev-parse --show-toplevel
git remote -v
git branch --show-current
git rev-parse HEAD
git status --short
```

At the start of every task, report:

```text
Workspace root:
Git root:
Remote:
Branch:
HEAD:
AGENTS.md path:
Execution mode:
```

Begin implementation once the repository is verified.

---

## 2. DEEP SYSTEM RESEARCH — THINK END-TO-END BEFORE ACTING

Every meaningful change requires ultra-deep system understanding before implementation.

### Research methodology

**Top-down (user experience → data):**
```
route → page → container → orchestration → state → hooks → services → API → DB
```

**Bottom-up (data → user experience):**
```
DB → API → serializers → contracts → services → hooks → state → UI → page → route
```

### Diagnostic principles

- Do not fix symptoms before identifying the root cause.
- Fix at the source-of-truth (owner layer), not where the symptom appears.
- Avoid child-layer compensation (fallbacks, patches, duplicated logic, branching).
- When a bug appears in a child, inspect the parent/owner layer first.
- When changing a mechanic, align all directly coupled layers: contracts, handlers, queries, cache, serializers, loading/error states.
- Be skeptical of one-file fixes; justify why other layers are unaffected.
- For frontend issues, inspect the full flow: route → layout → page → hooks → API → backend.
- Prefer systemic fixes, but keep changes proportional.
- If re-architecture is required, define scope, risks, compatibility, and rollout order.

### Layer diagnosis

Diagnose by layers in this order:

```
data/contracts → business logic → async/timing → UI state → integration → architecture
```

When a layer is the root cause, fix it there. When multiple layers are coupled, align all of them in the same pass.

---

## 3. CASE STUDY BEFORE IMPLEMENTATION

Before implementing any UI/UX upgrade, conduct a proper case study of the relevant surface.

### What to study

Study the current implementation deeply:

- What is the screen trying to accomplish for the user?
- What is the first-viewport experience?
- Where does hierarchy fail?
- Where does composition feel assembled rather than authored?
- What interactions feel prototype-level?
- What state transitions are missing or jarring?
- Where does media treatment fall short?
- Where does information density hurt readability?
- Where does the page feel like a generic dashboard instead of a crafted product surface?

### What to study from references

When reference apps or images are provided, study them seriously:

- hierarchy and visual weight
- density and breathing room
- spacing rhythm and grid system
- typography relationships and scale
- media treatment and art direction
- alignment and edge behaviour
- control placement and interaction patterns
- first-viewport usefulness
- state transitions and motion language
- how information architecture guides the eye

References are quality benchmarks to exceed, not surfaces to photocopy. Study the underlying design thinking, then produce something that belongs to ThryftVerse.

### Case study output

The case study informs implementation. It is not the deliverable. Move from study to implementation quickly:

```
study → identify highest-impact improvements → implement → render → criticise → correct → render again
```

Do not spend the task producing documentation instead of product improvement. A case study that doesn't lead to visible implementation is not completion.

---

## 4. PUSH TO MAXIMUM QUALITY

Every UI/UX task must be pushed to the highest quality the codebase and agent capability can produce.

### Quality bar

A production-quality screen must achieve:

- **Authored composition** — the screen feels designed as one product surface, not assembled from reusable parts
- **Clear visual hierarchy** — the user's eye knows where to look first, second, third
- **Useful first viewport** — the most important content and actions are visible without scrolling
- **Deliberate spacing** — every gap communicates relationship; no random padding
- **Consistent alignment** — edges, baselines, and centres are intentional
- **Readable typography** — type scale has clear relationships; no competing weights
- **Strong media treatment** — images are art-directed, not blindly covered; focal points preserved
- **Coherent action placement** — primary actions are obvious; secondary actions are restrained; destructive actions are separated
- **Appropriate information density** — enough to be useful, not so much that it overwhelms
- **Native interaction patterns** — press feedback, haptics, motion, and transitions feel native
- **Complete state coverage** — loading, empty, error, partial, offline, populated states are all designed

### Quality comes from composition, not decoration

Visual elevation must come from:

- **composition** — how elements relate spatially
- **hierarchy** — what dominates and what recedes
- **rhythm** — the cadence of spacing and scale
- **contrast** — the difference between primary and secondary
- **restraint** — the courage to show less

Not from:

- shadows on every surface
- cards around every element
- pills around every control
- gradients everywhere
- glass effects
- excessive animation
- decorative subtitles
- repeated labels
- duplicate titles
- excessive badges

### Exceed references

When reference apps are studied, the goal is to match or exceed their quality, not to match their surface appearance. Study why they feel premium:

- information architecture decisions
- spacing rhythm
- typography relationships
- media art direction
- interaction restraint
- motion language
- state transition quality

Then produce a ThryftVerse surface that embodies those same principles.

### Comparative visual-fidelity protocol

Flagship quality is judged by the rendered silhouette and small geometry, not by the presence of tokens. Before changing a visual surface, compare the current native render with the supplied benchmark at the same approximate viewport width and record the delta in these terms:

```text
dominant object → content density → visible surfaces → radii → strokes → icon chrome → typography → media crop → motion → states
```

The following are hard implementation constraints:

- **Separate hit area from visible shape.** A control may require a 44pt target while showing only a 20–24pt glyph. Do not render a 44pt grey circle or square merely to satisfy accessibility.
- **Visible containment must have meaning.** Use a persistent fill or outline only for selection, primary action, input boundary, status, media contrast, or grouping that is unclear without it. Ordinary Back, search, overflow, camera, notification and chevron controls default to transparent 44pt targets.
- **Surface budget.** Above the fold, use at most one dominant non-media panel. Do not wrap every row, icon, filter and section in separate grey surfaces. Flat canvas, spacing and hairlines are the default utility structure.
- **Radius budget.** Use no more than two non-avatar radius sizes in one viewport unless a modal is present. Radius communicates role: 8–12pt compact utility, 12–16pt media/fields, 20pt+ only for a genuinely dominant panel or dock.
- **Stroke grammar.** Separators are hairline; fields and explicit outlines are 1pt; 2pt is reserved for focus or selection. Never mix arbitrary 0.5, 1, 1.5 and 2pt outlines in the same component family.
- **Icon grammar.** A region uses one icon family, one optical size band and a stable outline/filled-state rule. Standard navigation glyphs are 20–24pt. Small metadata glyphs are 14–18pt. Novelty symbols do not replace clear product language.
- **Density target.** A normal list viewport should expose roughly 4–6 useful rows. A discovery viewport should expose at least two meaningful media objects or the beginning of the next module. Empty space must support focus, not compensate for oversized chrome.
- **Text budget.** The first viewport normally uses no more than three type sizes and one eyebrow. Remove duplicate headings, decorative subtitles and labels that merely name an obvious object.
- **Media storytelling.** On discovery, profile and creator surfaces, real media must be the primary colour and visual anchor. Generic grey placeholder cards never become the dominant first-viewport story.
- **No card-on-card composition.** A nested surface requires a distinct interaction or state boundary. Otherwise flatten it.
- **Light/dark parity.** Geometry, hierarchy and information density remain identical across themes. Dark mode is not permission to add translucent containers or glow.

Before accepting a screen, perform both checks:

1. **Thumbnail test:** at roughly 25% scale, the primary object and reading order remain obvious; repeated rounded rectangles do not dominate the silhouette.
2. **Squint test:** blur or squint at the screen; media/identity/content should dominate, while navigation and utility chrome recede.

If three or more screens exhibit the same visual defect, inspect and correct the shared primitive first. Screen-local compensation is allowed only when that screen has a genuinely different information hierarchy.

### Visual delta evidence

For a meaningful flagship pass, retain local before/after captures and compare at least:

```text
first useful content Y-position
number of useful objects above fold
visible rounded-container count
largest non-media control size
icon optical size and line-weight consistency
content occluded by sticky navigation/docks
loading vs final geometry shift
```

Do not commit captures unless requested. A TypeScript pass cannot override an obviously inferior native render.

---

## 5. REFERENCE HIERARCHY

When visual references are supplied, use this priority:

1. user-supplied reference images
2. user's explicit written requirements
3. current successful product patterns
4. existing design tokens and components
5. general platform conventions

Do not claim reference matching based only on:

- similar colours
- rounded corners
- shadows
- gradients
- glass effects
- token replacements
- animation

Reference matching is about the underlying design quality, not surface similarity.

---

## 6. SCOPE AND PROPORTIONALITY

Touch the files required by the current task. Minimal supporting changes are permitted when they make a visible interaction or route work correctly.

When a systemic issue spans multiple layers, fix all coupled layers in the same pass. Proportional means:

- fix the root cause and all directly coupled layers
- do not expand into unrelated screens, navigation, or backend work
- do not begin another product department after completing the requested scope
- do not refuse to fix a coupled layer just because it's "out of scope" — coupled layers are in scope

When re-architecture is required:

1. define the scope clearly
2. identify risks and compatibility concerns
3. plan the rollout order
4. implement proportionally

---

## 7. CANONICAL IMPLEMENTATION

Modify the existing canonical screen or component.

Before creating a new screen or component:

1. search for an existing implementation
2. inspect active imports
3. inspect navigator registration
4. confirm no canonical implementation already exists

Do not create `ScreenV2.tsx`, `ScreenFinal.tsx`, `ScreenRedesign.tsx`, `ScreenFlagship.tsx` as replacements for existing production screens unless the user explicitly requests a parallel implementation.

Creating focused new components (e.g. a purpose-built tile for a specific layout) is encouraged when the information hierarchy genuinely differs and a shared component would be forced to serve too many masters.

---

## 8. PRESERVE AND ELEVATE

When upgrading UI/UX:

- preserve working functionality
- preserve navigation
- preserve existing integrations
- improve the real rendered composition
- work directly in the production TSX files

Preserve working:

- handlers, callbacks, navigation, selectors, mutations, store actions
- API integrations, loading states, error states, empty states
- accessibility properties, list virtualization, keyboard behaviour, media behaviour, route parameters

Before removing a JSX block, determine:

```
State powering it:
Handler powering it:
Route or action:
User capability affected:
```

When a real capability would disappear, do not remove it. When functionality is broken, repair it or honestly disable it — do not hide it.

When a component or pattern is genuinely better replaced by a new purpose-built component, the replacement is justified if:

- the new component serves the layout's information hierarchy better
- all existing functionality is preserved or improved
- the diff is reviewed and committed with explanation

---

## 9. LOC IS NOT A METRIC

LOC reduction is not a success metric. LOC increase is not a failure metric.

For UI/UX upgrade tasks:

- additions should normally equal or exceed deletions when adding product depth
- do not replace feature-rich JSX with a smaller generic wrapper
- do not delete styles without tracing their current usage
- do not remove controls merely because they are difficult to improve
- justify every substantial deletion

Before and after significant edits:

```bash
git diff --numstat -- <file>
git diff -- <file>
```

The correct outcome is a richer, clearer, more coherent product — not merely a smaller codebase.

---

## 10. IMPLEMENTATION OVER AUDITING

Inspect enough to understand the current implementation deeply, then implement.

Use this loop:

```
study current screen → identify highest-impact improvements → implement → render → criticise → correct → render again
```

An audit is not completion. A case study is not completion. Documentation is not completion. Visible product improvement is completion.

---

## 11. TRUTHFUL UI

Every visible control must:

1. perform the represented action
2. navigate to the correct screen
3. show a truthful disabled state
4. or be removed

Never expose controls that only produce "Coming soon", "Backend required", or generic explanation toasts.

Never fabricate:

- success states
- IDs
- data
- persistence
- presence
- activity
- order or tracking state

Do not claim that an operation succeeded when only local temporary state changed.

Use truthful labels:

```
Delete for me     → when deletion is local
Delete message    → when the message is genuinely deleted from the shared system
```

---

## 12. NAVIGATION QUALITY

Every route must have:

- correct destination
- correct parameters
- correct presentation style
- correct Back behaviour
- correct return destination
- no fabricated route IDs
- no duplicate screens
- no dead chevrons

Use pushed screens for normal hierarchy. Use modal presentation for creation, selection, or temporary tasks. Use full-screen modal for immersive media.

After destructive actions, navigate to the correct explicit destination.

---

## 13. CONTROL QUALITY

Every interactive control must have:

- a minimum practical touch target (44pt recommended)
- clear enabled state
- clear disabled state
- loading state when asynchronous
- pressed feedback (scale, opacity, or both)
- accessibility role
- accessibility label
- correct haptic level when haptics are used

Primary actions must be visually dominant. Secondary actions must be restrained. Destructive actions must be clearly separated and confirmed.

Do not use icon-only controls without accessible labels. Do not use colour alone to communicate state.

---

## 14. STATE COMPLETENESS

Every screen touched must account for relevant states:

- loading
- populated
- empty
- filtered-empty
- offline
- error
- retry
- disabled
- submitting
- success
- partial data
- missing media
- permission denied

Skeletons should resemble the final layout. Do not use a generic centred spinner for every state. Do not fabricate data to avoid designing an empty state.

---

## 15. MEDIA RULES

A supported media flow:

```
select or capture → local optimistic preview → upload → receive remote URL → send remote URL → progress → failure → retry
```

Do not fabricate upload success. Do not treat temporary local URIs as delivered remote media.

Media viewers must:

- use explicit close or Back controls
- respect safe areas
- handle loading and failure
- avoid exposing internal IDs
- avoid closing from accidental media taps
- use responsive dimensions

### Image art direction

Audit image crops on the physical device:

- fashion objects remain visible
- shoes and bags are not cropped at critical edges
- portrait garments retain silhouette
- square jewellery/watch images remain centred
- low-quality or missing images receive a restrained placeholder
- featured and supporting crops should not look identical

Do not rely on `cover` blindly. Use category-sensitive focal positioning when supported safely. Do not fabricate alternate media.

---

## 16. PERFORMANCE

Preserve or improve:

- FlashList, FlatList, or equivalent virtualization
- stable keys
- memoized expensive derived data
- smooth typing
- limited rerenders
- efficient image rendering
- stable keyboard transitions
- deterministic skeletons
- reduced-motion behaviour

Do not:

- render large data sets inside unvirtualized Views
- use random values during render
- reanimate entire lists for small updates
- remount large screens unnecessarily
- animate every historical item on initial load

---

## 17. MOTION AND INTERACTION

Use restrained native motion to elevate the product:

### Encouraged

- press scale (0.97–0.985)
- slight opacity response on press
- animated segment indicators with spring physics
- content crossfade or directional slide on mode change
- watch icon state transition
- countdown colour interpolation at genuine threshold changes
- haptic selection feedback
- reduced-motion fallbacks for all motion

### Prohibited

- bounce
- continuous pulsing
- floating cards
- decorative shimmer after loading
- large spring movement
- dramatic parallax
- excessive blur dependency
- animating the entire page

Motion duration: 160–240ms for most transitions. Respect reduced motion by changing instantly or using a simple fade.

---

## 18. ACCESSIBILITY

For all edited screens, verify:

- controls have labels
- state is announced
- selected states are exposed
- unread state is exposed
- loading and failure are exposed
- destructive actions are clear
- text has sufficient contrast
- touch targets are practical
- Back and Close are distinguishable
- screen-reader order follows visual order

Accessibility labels must be state-aware. Do not append "left" to states where countdown text already says "Ended", "Starts tomorrow", or "Closed".

Test with large text enabled. Do not rely only on `numberOfLines` — verify that titles remain understandable, header actions remain reachable, and prices do not overlap at large font sizes.

Accessibility is part of completion, not optional polish.

---

## 19. NATIVE VALIDATION

When a native device or emulator is available:

- use the actual development build
- inspect the real screen
- test keyboard behaviour, Back behaviour, touch targets, gestures
- capture before and after screenshots locally
- iterate based on the actual render — the device is the source of truth
- do not commit screenshots unless requested

Web rendering is not proof of native quality.

The required loop for flagship work:

```
render → capture → criticise → correct → capture again
```

When no native device or emulator is available:

- continue implementation
- use code, references, and existing screenshots
- run static validation
- do not claim native visual verification
- use the status: `IMPLEMENTED — NATIVE DEVICE VALIDATION PENDING`

---

## 20. TEST POLICY

Do not begin UI/UX tasks by writing tests.

Order:

1. inspect implementation
2. implement visible upgrade
3. verify interactions
4. review diff
5. run TypeScript
6. run existing tests
7. add only essential regression tests

Do not add source-string tests, file-existence tests, component-name tests, constant tests, tautological tests, or tests that only increase counts.

Report pre-existing test-environment failures honestly.

---

## 21. GIT SAFETY

Before editing:

```bash
git status --short
```

Before committing:

```bash
git status --short
git diff --stat
git diff --numstat
git diff
```

Do not commit screenshots, temporary scripts, audit files, generated reports, debug logs, unrelated formatting, or unrelated screens.

Use focused commits. Stage only the files relevant to the task.

Do not merge to `main` without explicit user instruction. Do not force-push. Do not execute destructive Git commands without explicit user confirmation.

---

## 22. COMPLETION STANDARD

A task is complete only when:

- requested screens were visibly improved to flagship quality
- working functionality was preserved
- navigation is correct
- every visible control is truthful
- relevant states are complete
- TypeScript passes
- the diff contains no unrelated work
- no fake success or fake data remains
- remaining blockers are explicitly reported

Passing TypeScript alone is not completion. Passing tests alone is not completion. Replacing tokens alone is not visual elevation. Adding shadows and radius alone is not visual elevation.

The improvement must be obvious at thumbnail size.

---

## 23. FINAL RESPONSE FORMAT

Every implementation report must include:

```text
Workspace:
Starting branch:
Starting HEAD:
Final branch:
Final HEAD:
Files changed:
Visible improvements:
Interactions preserved:
Interactions fixed:
Controls removed:
Navigation changes:
Loading/empty/error states:
Accessibility:
TypeScript:
Tests:
Native validation:
Remaining visual weaknesses:
Remaining interaction issues:
Backend blockers:
Commit SHAs:
Final status:
```

Use one honest status:

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

---

## 24. AGENT RUNTIME HYGIENE (WINDOWS / REACT NATIVE)

This repository runs on Windows with PowerShell as the default shell, and ships a React Native / Expo frontend with a large dependency tree. Two environmental culprits cause agentic IDEs to spin, freeze, or burn attention tokens on irrelevant code. The protections below are enforced via `.devin/config.json` (committed) and the user config; agents must respect them.

### 24.1 Shell — PowerShell, not bash

The default shell on this machine is **PowerShell**. Do not assume bash, zsh, or Unix coreutils.

- Use `Get-ChildItem` (alias `gci`, `dir`), not `ls -la`. `ls -la` fails in PowerShell.
- Use `Get-Content`, not `cat` (alias works, but prefer native cmdlets for flags).
- Use `Remove-Item`, not `rm`. Use `Copy-Item`/`Move-Item`, not `cp`/`mv`.
- Use `Select-String`, not `grep`, for shell-side text search. (Prefer the dedicated `grep`/`code_search` tools over shell search anyway.)
- Use `;` to chain commands, not `&&`. For conditional chaining use `if ($?) { ... }`.
- Quote paths containing spaces with double quotes: `Get-ChildItem "reference images"`.
- Forward slashes work in most cmdlets, but prefer backslashes for Windows-native paths when passing to native executables.
- `git` works identically; only the surrounding shell syntax differs.

If a Unix-style command fails with a parameter-binding error, stop and rewrite it in PowerShell syntax. Do not retry the same command in a loop.

### 24.2 Indexing scope — do not read dependency/build trees

`frontend/node_modules` contains ~70k files / 16 GB. Reading or searching it drowns the agent's context and triggers subagent research loops over standard-library code. The following paths are blocked by `.devin/config.json` deny rules and/or `.gitignore` + `respect_gitignore`:

- `node_modules/**`, `**/node_modules/**`
- `.expo/**`, `**/.expo/**`
- `dist/**`, `**/dist/**`
- `frontend/ios/**`, `frontend/android/**` (generated native output)
- `__pycache__/**`, `.venv/**`
- `thryftverse-payment-wallet-flagship-upgrade-prompts/**` (prompt archive, not source)
- `thryftverse_product_detail_competitive_closure_audit_2026-07-30/**` (audit archive, not source)

Do not attempt to work around these deny rules. If a dependency's behaviour is genuinely needed, read its public docs via `webfetch` or inspect the package's entry point listed in `frontend/package.json` — do not crawl `node_modules`.

`reference images/` is intentionally NOT blocked: it holds the benchmark images required for UI/UX case studies (see §3, §5). Treat it as a reference, not an index target.

### 24.3 When an agent spins

If you notice yourself looping on research without implementation:

1. Stop. Re-read §10 (implementation over auditing) and §22 (completion standard).
2. Confirm you are not searching inside a blocked path.
3. Confirm you are using PowerShell syntax, not retrying failed bash commands.
4. Move to the implementation loop: study → implement → render → criticise → correct.

---

## 25. MANDATORY RESEARCH-TO-IMPLEMENTATION PROTOCOL (EVERY PROMPT)

This section is non-negotiable. It applies to **every** prompt the agent executes, not only large UI/UX tasks. A prompt is not "done" because code was written. A prompt is done when the agent has researched the codebase, researched references and online best practices, pushed the work to maximum flagship production grade, and implemented it in the production files.

### 25.1 The mandatory execution sequence

For every prompt, run this sequence in order. Skipping a stage is a process failure, even if the output looks reasonable.

```
1. CODEBASE RESEARCH     → understand the current implementation end-to-end
2. REFERENCE RESEARCH    → study supplied reference images / apps deeply
3. ONLINE RESEARCH       → find the maximum best current practices and patterns
4. FLAGSHIP SYNTHESIS    → combine codebase + references + best practices into a target
5. IMPLEMENT             → write the change in the production TSX/files
6. VERIFY + CRITIQUE     → render, criticise, correct, render again
```

### 25.2 Stage 1 — Codebase research (always)

Before writing anything, inspect the real implementation. Do not work from assumptions or from the prompt text alone.

- Read the canonical screen/component file(s) named in the prompt.
- Trace the full flow per §2: route → page → container → hooks → services → API → DB (or bottom-up).
- Identify the data contract, state owner, loading/error/empty states, and navigation wiring.
- Note what is genuinely working and must be preserved (§8).
- Note the existing design tokens, component patterns, and conventions in use.

A change made without understanding the codebase is not flagship work — it is a guess.

### 25.3 Stage 2 — Reference research (when references exist)

When the user supplies reference images, apps, or links, study them seriously per §3 and §5. References are quality benchmarks to exceed, not surfaces to photocopy.

Study and record:

- hierarchy and visual weight
- density and breathing room
- spacing rhythm and grid system
- typography relationships and scale
- media treatment and art direction
- alignment and edge behaviour
- control placement and interaction patterns
- first-viewport usefulness
- state transitions and motion language

Then design a ThryftVerse surface that embodies the same underlying thinking, not a copy of the reference's appearance.

### 25.4 Stage 3 — Online research (always, to the maximum)

This is the stage agents most often skip. Do not. For every meaningful prompt, use `web_search` / `webfetch` to research the current maximum best practices relevant to the surface or mechanic being changed.

Research areas (pick what is relevant to the prompt):

- **Platform conventions** — current iOS / Android Human Interface Guidelines and Material 3 patterns for the surface type (list, detail, checkout, settings, media viewer, etc.).
- **Production-grade patterns** — how top-shipping apps solve the same problem (e.g. Stripe, Airbnb, Vinted, Depop, Grailed, Etsy, GOAT, StockX for marketplace surfaces).
- **React Native / Expo best practices** — current recommended patterns for the libraries already in `frontend/package.json` (FlashList, Reanimated, expo-image, expo-router, etc.). Verify against the library's current docs, not memory.
- **Accessibility best practices** — WCAG 2.2, Apple HIG accessibility, current RN Accessibility API patterns.
- **Performance best practices** — current guidance on list virtualization, image loading, reanimation, and render budget for the libraries in use.
- **Design system / token practice** — current thinking on spacing scales, type scales, radius grammar, and colour systems for production mobile apps.

Do not rely on memory for library APIs or platform guidance — they drift. Verify against current online sources. Cite the source when it changes a decision.

The goal of online research is to find the **maximum best** practice, not the first acceptable one. Compare at least two credible sources when the answer is non-obvious.

### 25.5 Stage 4 — Flagship synthesis

Combine the three research streams into a concrete target for this prompt:

```
codebase truth  +  reference quality  +  online best practice  =  flagship target
```

The flagship target is the highest-quality version of the change that the codebase and agent capability can produce, informed by real references and real current best practices — not a generic improvement, not a token swap, not a memory-based guess.

If the three streams conflict, prioritise in this order: user's explicit written requirements → user-supplied references → online best practice → existing codebase pattern.

### 25.6 Stage 5 — Implement (always)

Research without implementation is not completion (§10). Implement the flagship target directly in the production files.

- Modify the canonical screen/component (§7). No `ScreenV2`, `ScreenFinal`, `ScreenFlagship` parallel files.
- Preserve working functionality (§8).
- Push to the quality bar in §4: authored composition, clear hierarchy, useful first viewport, deliberate spacing, readable typography, strong media treatment, coherent action placement, complete state coverage.
- Use truthful UI (§11), correct navigation (§12), control quality (§13), state completeness (§14).

### 25.7 Stage 6 — Verify and critique

After implementing:

- Run TypeScript (§20, §22).
- Run existing tests if present.
- Critique the result against the flagship target and the references. Be honest about gaps.
- Correct and re-render. The loop is: implement → render → criticise → correct → render again (§10).
- If a native device is available, validate on device (§19). If not, mark `IMPLEMENTED — NATIVE DEVICE VALIDATION PENDING`.

### 25.8 Anti-patterns (process failures)

- Writing code without reading the current implementation.
- Implementing from memory without verifying current library APIs or platform guidance online.
- Treating references as surfaces to copy instead of quality benchmarks to exceed.
- Stopping at "the first acceptable pattern" instead of researching the maximum best.
- Producing research/audit documentation instead of visible product improvement.
- Claiming completion after TypeScript passes without a real critique against the flagship target.
- Skipping online research because "the answer is obvious" — verify anyway; best practices drift.

### 25.9 Proportionality

This protocol scales with the prompt. A one-line fix still requires codebase research (stage 1) and a quick online check if it touches a library API (stage 3), but does not require a full reference study. A UI/UX upgrade requires the full sequence. Use judgment on depth — but never skip a stage entirely; if a stage is genuinely not applicable, state why in one line and proceed.

---

## 26. CORE PRINCIPLES

- The product is the native mobile application. Every decision serves the user's experience.
- Fix at the source-of-truth, not at the symptom layer.
- Ultra-deep system research before acting. Diagnose end-to-end.
- Every prompt: research the codebase, study references, research online best practices, then implement to flagship grade (§25).
- When changing a mechanic, align all directly coupled layers.
- Push every UI/UX task to maximum quality. Exceed references, don't photocopy them.
- Composition over decoration. Hierarchy over ornament.
- Motion is restrained and purposeful, not decorative.
- Truthful UI always. No fabricated success, data, or capability.
- Preserve working features. Elevate, don't strip.
- The device render is the source of truth. Iterate against it.
- The improvement must be obvious at thumbnail size.
- The correct outcome is a richer, clearer, more coherent, and more trustworthy native product.
