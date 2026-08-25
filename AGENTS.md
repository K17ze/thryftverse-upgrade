@# THRYFTVERSE — FLAGSHIP PRODUCT EXECUTION CHARTER

This file defines the working principles for every AI agent operating inside the ThryftVerse repository.

These principles apply to all implementation, UI/UX, debugging, refactoring and validation tasks unless the user explicitly overrides a principle in the current task.

The native mobile application is the product. Every decision must serve the user's experience at the highest possible quality.

---

## 0. AGENT SCOPE — MAIN AGENT ONLY

This charter is intended for the **main agent** driving the task — the single orchestrator that plans, implements, verifies, and reports.

It is **not** intended to be loaded verbatim into parallel subagents. Subagents are short-lived, stateless workers that should receive a focused, self-contained prompt describing only the slice of work they need to perform — not the entire charter.

### Do not nest parallel subagents

Parallel subagents must not spawn further parallel subagents. Unbounded nesting produces a fan-out explosion:

```
main agent
  └─ N parallel subagents
       └─ each spawns M parallel subagents
            └─ each spawns K parallel subagents
                 └─ ... → OOM loop / context exhaustion
```

This escalates context and memory usage geometrically and terminates in an **out-of-memory loop error** with no useful output.

### Rules

- The main agent owns this charter and the task plan.
- Dispatch parallel subagents only for self-contained, leaf-level work (search, read, isolated edits, single-file fixes).
- Subagent prompts must inline only the specific context they need — do not paste this whole file into a subagent prompt.
- Subagents must not invoke `run_subagent` themselves. No recursive delegation.
- If a subagent's task turns out to require broader orchestration, it should return its findings to the main agent, which decides the next step.
- Keep fan-out shallow: one level of parallelism from the main agent, then stop.
- There is no limit on the number of subagents the main agent may dispatch. Do not refuse to dispatch because "too many agents" — fan-out breadth is fine. The constraint is depth (no nesting), not breadth.
- Both `is_background: true` and `is_background: false` are permitted. Choose the mode that fits the work: background for parallelisable tasks whose output is needed later, foreground when the main agent must block on the result before continuing.

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

### ANTI-AI-MADE DESIGN — non-negotiable

The single fastest way to ruin a flagship product surface is to ship work that **looks AI-generated**. Every reference app the user benchmarks against (Instagram, Pinterest, eBay, Snapchat, Linear, Things, Arc, Cash App, Stripe) was authored by senior product designers and senior full-stack engineers. ThryftVerse must read as their work, not as an LLM's first pass. This is a core principle, not a polish step.

An AI-made surface is one or more of the following — every one of these is a defect, not a style choice:

- **Generic dashboard silhouette.** Repeated rounded rectangles of equal weight stacked into a vertical list. The thumbnail test fails: at 25% scale the screen is a grid of identical grey cards, not a product.
- **Symmetry-by-default.** Everything centred, every section the same height, every gap identical. Real product surfaces have intentional asymmetry, dominant objects, and breathing room that serves focus.
- **Decorative chrome over composition.** Shadows on every card, pills around every control, gradients on every header, glass effects on every panel. This is the loudest tell that a surface was assembled, not authored.
- **Label-everything disease.** Every row has an eyebrow, a title, a subtitle, a caption, a badge. Real apps show less: the object is the label.
- **Duplicate or restated headings.** A screen header that repeats the section title that repeats the card title. Humans don't write this way; models do.
- **Placeholder-grade media treatment.** Grey rectangles, `#ccc` covers, `contentFit="cover"` on everything with no focal-point logic. Reads as a scaffold, not a product.
- **Over-scaffolded code.** Three layers of abstraction for one button. A `ButtonContainerWrapper` wrapping a `ButtonContainer` wrapping a `ButtonPrimitive`. Senior engineers delete this, not ship it.
- **Inconsistent primitives.** Four different card radii, three different press feedbacks, two different chip styles in the same viewport. Reads as no one owned the system.
- **Stateless UI.** Only the happy path exists. No loading, no empty, no error, no partial, no offline. Real engineers ship the full state machine.
- **Verbose, explanatory copy in the UI.** "Welcome back! Here you can manage your items and discover new ones." Real apps say "Your items" and move on.
- **Excessive motion.** Every mount animates, every press bounces, every transition slides. Flagship apps animate rarely and meaningfully.

The bar is the bar a senior full-stack SWE and senior product designer would ship after a week of iteration on the same surface. Concretely:

- **Composition first.** Decide the dominant object, the reading order, and the breathing room before touching a token. If the silhouette is wrong, no amount of colour or shadow fixes it.
- **Restraint as a skill.** A surface that shows less but means more is the goal. Remove the eyebrow, the subtitle, the duplicate label, the decorative badge — keep the content that does work.
- **One system, not many.** One radius grammar, one stroke grammar, one icon family, one press feedback, one motion language per surface. Inconsistency is the AI tell.
- **Real media is the colour.** On discovery, profile, creator and commerce surfaces, real imagery is the primary visual anchor — not a grey card with a label on top.
- **Full state coverage is not optional.** Loading, empty, error, partial, offline and populated are all part of the deliverable. A surface with only the happy path is unfinished.
- **Code quality matches the design quality.** No over-scaffolding, no duplicate primitives, no dead wrappers, no fabricated types, no `any` to silence the compiler. Type-safe, single-source-of-truth, idiomatic to the codebase. A senior SWE reading the diff should not be able to tell it was agent-written.
- **Full-stack correctness, not just the render.** The upgrade must be correct across the whole stack it touches: contracts, handlers, queries, cache, serializers, hooks, state, UI. A pretty screen backed by a broken or fabricated contract is not a flagship deliverable. Trace the data path end-to-end and make every layer the best version of itself.
- **Self-critique before claiming done.** Run the thumbnail test and the squint test (§4) on the rendered surface. If it reads as a generic dashboard, it is not done — re-author it.

If a reviewer's first reaction to a screen would be "this feels AI-generated", the task is failed. Re-author it until it reads as a product surface owned by a human who cares.

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

### Fail-closed trust signals

Every trust signal (verified tier, safeguarded status, custody coverage, appraisal value, escrow ETA, rights TBC, response-rate, dispatch time) must be **evidenced by a backend row**, not asserted by the frontend. Fail-closed policy throughout (the `84e289f7` standard):

- null means no render — no badge, no pill, no checkmark
- no badge without a tier
- no TBC without a reason
- no stale without an action
- no failure without a recovery

A badge rendered from a hardcoded value or a frontend default is a lie of the same kind as a fabricated success state. See §37.5 for the binding execution loop.

### Unknown-outcome is not success

When a mutation request is sent and the network drops before the response, the outcome is ambiguous — not an error, not a success. Never show a success state for an ambiguous outcome. Show a distinct unknown-outcome treatment (warning color, "Check result", safe-retry hint via the idempotency key). Fabricating success on uncertainty is the most damaging form of untruthful UI on money surfaces. See §37.7.

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

### Live-signs completion (functional surfaces)

For any task that touches data, endpoints, mutations, or trust signals, completion **also** requires (§37.10):

- the UI renders real data from a live endpoint, not mock/hardcoded data in production mode
- the live endpoint has been hit and returns the expected rows (recorded)
- every mutation propagates to its full surface set (re-fetch on focus / query invalidation / cross-entity transactional update)
- the full state matrix is honest, including unknown-outcome (no fabricated success)
- every trust signal is evidenced by a backend row (fail-closed)
- money/creation mutations are transactional + idempotent
- auth + privacy projections are correct
- no timer/subscription leak

A flagship-looking screen backed by mock data is not complete. A live-wired screen that looks prototype-grade is not complete. Both loops (§31 visual, §37 live-signs) must pass. When the backend cannot be run live, use `IMPLEMENTED — LIVE ENDPOINT VALIDATION PENDING` and list the endpoints awaiting verification — do not claim `COMPLETE — TARGET MET`.

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
- The live endpoint is the source of truth, not TypeScript. A screen that renders without a real endpoint is a prototype. Live signs come from end-to-end closure of one functional surface, not from mass visual passes (§37).
- Trust signals are evidenced by backend rows, fail-closed. No badge without a tier, no success on an unknown-outcome.
- A real product is coherent across surfaces — mutations propagate everywhere.
- Preserve working features. Elevate, don't strip.
- The device render is the source of truth. Iterate against it.

---

## 33. 2026 AUGUST RESEARCH FINDINGS — WAVE 2 SURFACES

Compiled from 4 parallel web research subagents (August 2026) covering search, chat, sell flows, wallet/settings. Supplements §32.

### 33.1 Search & Visual Search (August 2026)

**Pinterest Visual Search 2026:**
- Animated glow effect on shoppable items in Pins
- Refinement bar with style/occasion/color/fabric refinements
- AI-generated descriptive keywords from images
- Contextual intent models (outfit vs makeup vs background)

**Instagram Search 2026:**
- Hybrid AI-traditional search interface
- Category filters: accounts, audio, hashtags, places
- Shift from account search to content search
- Recommended searches extracted from comment discussions

**eBay Search Filters 2026:**
- Lockable filters — users choose which filters to persist
- Customise panel: hide sort/filter button, expand all, lockable filters
- AI-powered natural language search (eBay.ai)
- Search with Pics — upload photo to find matches

**Search psychology 2026:**
- Popular Ranking Search Aid (PRSA) — aggregated popular categories at entry point
- Privacy-compliant guidance (non-personalized aggregated data)
- Mobile context: fragmented attention, app-switching behavior

**Conversational AI search 2026:**
- Google Search Live — interactive multimodal with voice + camera
- Gemini 3.1 Flash Live — audio-focused, 90+ languages
- Background operation — conversations continue in other apps
- Wave gesture to interrupt AI when speaking

**Saved searches 2026:**
- Variable alert frequency: Real-Time, Daily Digest, Off per search
- Named saved searches for organization
- Full filter preservation

**Autocomplete 2026:**
- 100ms speed target (suggestions must appear within 100ms)
- Liquid Glass search patterns (iOS 26)
- Search tokens (tag-style filters in SwiftUI)
- Adaptive placement (bottom toolbar for thumb ergonomics)

**Visual search camera 2026:**
- Live viewfinder integration (Pixel Circle to Search)
- Multi-object selection — circle multiple items simultaneously
- Press-and-hold gesture invocation
- AI agent actions — camera as visual AI agent

### 33.2 Chat & Messaging (August 2026)

**Message bubble composition:**
- Dynamic Type scaling (iOS semantic styles, Android sp units)
- WCAG AA contrast compliance (4.5:1 minimum)
- Minimal decorations: single-color, 8-12px radius, 4-8px padding
- Subtle shadow (2px, 0.12 opacity) for depth

**Input bar design:**
- Bottom-center primary action (Fitts's Law, thumb reach)
- Staged media composition — review multiple images before send
- Smart input expansion based on content type
- 300ms ease-out expansion animation

**Media sharing:**
- Chat list media thumbnails (40×40px preview of latest message)
- Inline video playback (autoplay muted, tap to unmute)
- Full-screen media viewer with complete reply bar
- Animated wallpapers (subtle motion, respects reduced-motion)

**Typing indicators:**
- Context-aware modes: never, instant, thinking, message
- Privacy-respecting (user can disable via settings)
- ARIA live regions for screen readers (aria-live="polite")

**Message requests:**
- Two-tier filtering: Requests + Spam folders
- Profile context before acceptance (shared servers, mutual connections)
- Resend capability for ignored requests

**Search in chat:**
- Semantic search (vector embeddings, not just keywords)
- Quick filters: media, links, mentions, date, sender
- Message API search (REST/RPC)

**Accessibility:**
- WCAG 2.1 Level AA conformance with independent verification
- Opt-in accessibility layer with master toggle
- role="log" for message list, aria-live="polite" for new messages
- Complete keyboard navigation
- Motion sensitivity respect (prefers-reduced-motion)

### 33.3 Sell & Listing Flow (August 2026)

**eBay Sell 2026:**
- Capture-first: photos and title first, not text search
- AI analyzes images in ~7 seconds
- Two-pass form loading: basic fields instantly, detailed fields via second pass
- Quick List option — crosslist without full editing
- 50% reduction in total steps vs previous flow

**Instagram Create Post 2026:**
- Format-first composer (Post, Story, Reel, Live before media)
- Carousel support up to 20 images (increased from 10)
- Swipe right from feed opens camera
- Minimum 1080px width enforced

**Depop Sell 2026:**
- One-tap AI listing ("Create your listings with just one tap")
- Zero selling fees US/UK (shifted to buyer-paid model)
- Integrated Photoroom for image editing
- AI/ML feed matching items with likely buyers

**Mobile sell psychology:**
- Thumb-zone optimization (primary CTAs in bottom 1/3)
- Trust signals above the fold (ratings, reviews, verification)
- 3-second decision window
- Z-pattern hierarchy: photo → price → scarcity → CTA

**AI listing assistant:**
- Photo-to-listing pipeline (snap → AI generates complete listing)
- Bulk generation (up to 15 listings at once)
- Platform-optimized output (26 platforms)
- Market data integration for pricing suggestions

**Listing success screen 2026:**
- Minimalist design (plain background, no gradient banners)
- Token image + emerald check badge + sparkles accent
- Share triggers at key moments (after listing, after sale, monthly recap)
- Receipt-style monthly recap cards

### 33.4 Wallet & Settings (August 2026)

**Cash App wallet 2026:**
- Maximum contrast canvas (pitch black, white type, single electric green #00d54b)
- Custom typography (Cash Sans grotesque)
- Video-game energy with springy motion and glowing effects
- Atomic design system with cross-brand consistency (Cash App + Square)

**Stripe wallet 2026:**
- AI agent integration (OAuth flow for autonomous spending)
- Link digital wallet (cards, banks, crypto, BNPL unified)
- Spend request flow: agent creates → user approves → notification
- 90-day purchase protection

**eBay payouts 2026:**
- Four-stage process: Processing → Available → Initiated → Deposited
- Daily default schedule (weekly, bi-weekly, monthly on Tuesdays)
- Payouts on demand (30-minute for eligible sellers)
- Automatic fee deduction, net amount displayed

**Wallet psychology 2026:**
- Spendception — reduced psychological resistance to spending
- Trust-integrated framework: empowerment, gamification, social visibility, status, eco-friendliness, digital trust
- Anxiety mediation: perceived risk → anxiety → reduced trust → behavior
- Personality-based moderation (neuroticism, gender)

**iOS Settings 2026:**
- iOS 27 AirPods settings overhaul with menu organization + icons
- "Before Search" option for app suggestions
- Global search moved to bottom of screen
- Rounded & spacious elements, floating tab bars

**Android Settings 2026 (Material 3 Expressive):**
- Colorful pastel icons per category
- Card-based layout with caret indicators
- Material You switches (X/checkmark in handle)
- Top headers, compact menus for deeper levels

**Settings UX 2026:**
- Risk-frequency-complexity matrix for organization
- Control pattern selection: toggle, navigation row, segmented, picker, radio, stepper
- 44px minimum touch targets
- Auto-save for low-stakes, explicit save for high-stakes
- Search once you have 15-20+ settings

**Account security UX 2026:**
- Three-tier layout: status summary → priority actions → detailed management
- Four core jobs: password, MFA, session, device management
- Passkeys as default (Credential Manager API)
- Goal-oriented language ("Sign-in methods" not "authentication vectors")
- State-first design (show current state before controls)

---

## 34. 2026 AUGUST RESEARCH FINDINGS — WAVE 3 POLISH

Compiled from web research + codebase audit (August 2026) covering profile, discovery, haptics, and end-of-list patterns. Supplements §32-33.

### 34.1 Instagram Profile 2026

- **Bio links:** Up to 5 tappable links natively (no more single-link limit). Each with optional title. First link gets most taps. Collapsed as "and X more" when >1.
- **Story highlights:** Moving to dedicated tab (Posts → Highlights → Reels). Main profile above-the-fold becomes bio + grid, cleaner.
- **Bio:** 150 chars, line breaks supported, not tappable (only dedicated Links field is clickable).
- **Profile photo:** 320×320 display, 1080×1080 source for sharp rendering.
- **Pronouns:** Up to 4 from Instagram's list.
- **Action buttons:** 1 active button (reservations, food orders, tickets).

### 34.2 iOS 26 Liquid Glass

- **Liquid Glass material:** Translucent, dynamic, adaptive to content underneath. Forms distinct functional layer for controls and navigation.
- **Auto-adoption:** Standard SwiftUI/UIKit components pick up Liquid Glass automatically when compiled with Xcode 26 SDK.
- **Edge effects:** Scroll views under navigation/toolbars get automatic visual treatment for legibility.
- **Floating bars:** Tab bars and navigation bars float above content with glass background.
- **Interactive controls:** Toggles, segmented pickers, sliders transform into liquid glass during interaction.
- **Accessibility:** Translucency and motion adapt to user settings (reduce transparency, reduce motion).
- **React Native implication:** Cannot directly use `.glassEffect()` — but should reduce opaque backgrounds on bars, use translucent surfaces where possible, and let content extend under bars.

### 34.3 Depop 2026 Seller Patterns

- **AI listing assistant:** Photo-to-listing pipeline (snap → AI generates complete listing). Auto-generates descriptions from images. Auto-selects category, color, brand from description.
- **Photoroom integration:** Background removal + AI drop shadows directly in sell flow. 1.5% uplift in items listed.
- **Seller onboarding:** Reduced from 5 steps to 1 (pre-populate from account creation data).
- **Zero selling fees US/UK:** Shifted to buyer-paid model.
- **Seller profile:** Bio with shop policies (shipping, returns). Social media links for trust. Profile photo reflects brand.

### 34.4 Haptic Feedback Best Practices 2026

- **Less is more:** Too much vibration is annoying and numbing. Well-crafted haptics provide valuable sensory feedback.
- **Clear haptics:** Crisp, clean sensations for discrete events (button presses). Imitate real-world mechanical actions.
- **Rich haptics:** More expressive, sequenced patterns for special moments. Require wider bandwidth actuators.
- **Latency:** <50ms target for cause-effect relationship. Delays weaken the connection.
- **Signal, not noise:** Not every interaction needs feedback. Use it where it adds value.
- **Pair with visual:** A haptic without a visual change is easy to miss. Together they make actions feel decisive.
- **Respect system settings:** Always check user's system-level haptics setting. Never make haptics the only signal.
- **Android:** Use `HapticFeedbackConstants` for action-oriented consistency. `VibratorManager` + `VibrationEffect` for custom patterns.
- **iOS:** `UIImpactFeedbackGenerator` (light/medium/heavy/rigid/soft), `UINotificationFeedbackGenerator` (success/warning/error), `UISelectionFeedbackGenerator` (selection tick). `CoreHaptics` for rich patterns.

### 34.5 End-of-List State Pattern 2026

- **Honest terminal state:** When infinite scroll reaches the end, show a clear "You've reached the end" message. Don't leave a spinner forever.
- **Visual treatment:** Short hairline separator + muted text. No card, no illustration — just a quiet terminal marker.
- **Haptic:** Optional `selection` tick when the end state first appears (subtle, not jarring).
- **Contrast with loading:** Loading-more shows skeleton tiles matching the grid. End-of-list shows a text marker. The two states are visually distinct.

### 34.6 Pull-to-Refresh Haptic 2026

- **Trigger haptic:** Fire a `medium` impact when refresh is triggered (not when it completes). The haptic confirms the pull gesture was registered.
- **Completion:** No haptic on completion — the visual refresh of content is sufficient signal.
- **Pattern:** `HapticPatterns.refresh()` → `haptics.press()` (medium impact).
- The improvement must be obvious at thumbnail size.
- The correct outcome is a richer, clearer, more coherent, and more trustworthy native product.

---

## 35. 2026 AUGUST RESEARCH FINDINGS — WAVE 5 MASONRY/CHAT/NAV

Compiled from live web research (August 2026) + codebase audit. Supplements §32-34.

### 35.1 Pinterest Masonry Algorithm (Gestalt source — verified Aug 2026)

- **Algorithm:** Pick the left-most column of shortest height and put the item there. First `columnCount` items go left-to-right; after that, always slot into the shortest column.
- **Column count:** Determined by `(width + gutter) / (columnWidth + gutter)`. Can be overridden by `minCols`.
- **No caching:** Positions are recalculated on each render. Column heights tracked as an array of length `columnCount`.
- **Variable heights:** Item heights depend on content (image aspect ratio + text). This is what creates the masonry stagger — not random heights, but content-driven heights.
- **CSS Grid Lanes (Safari 26.4+):** `display: grid-lanes` is the new native CSS masonry. `grid-template-rows: masonry` was the earlier proposal. Chromium team pushed back on gluing two layout modes onto one property → result is `display: grid-lanes` as a dedicated value.
- **Key insight for RN FlashList:** FlashList v2 masonry mode handles the column assignment internally. Our job is to provide varied item heights via `aspectRatio` styles. The 7-step HEIGHT_RHYTHM cycle (prime-length) avoids the "every 4th item looks the same" tell.

### 35.2 iOS 26 Liquid Glass (Apple Developer — verified Aug 2026)

- **Material:** Translucent, dynamic, adaptive to content underneath. Forms a distinct functional layer for controls and navigation.
- **Auto-adoption:** Standard SwiftUI/UIKit components pick up Liquid Glass automatically when compiled with Xcode 26 SDK.
- **Tab bar:** Floats above content. Can minimize on scroll (`tabBarMinimizeBehavior = .onScrollDown`). Re-expands when scrolling opposite direction.
- **Custom backgrounds:** Apple explicitly says "reduce your use of custom backgrounds in controls and navigation elements." Custom backgrounds may overlay or interfere with Liquid Glass.
- **Content extension:** Content should extend underneath the tab bar. The blur effect is the default for a tab bar that sits on top of a scrollable container.
- **RN implication:** Cannot use `.glassEffect()`. Best approach: use `colors.background` with high opacity for bars, let content extend underneath via `contentContainerStyle` padding, and use translucent surface fills (`colors.surfaceAlt`) for selected states rather than opaque brand colors.

### 35.3 WhatsApp 2026 Bubble Design (WABetaInfo — verified Aug 2026)

- **Shape:** Bubbles are now fully rounded — "pill-shaped" with significantly increased radius of curvature. The classic angular corners are gone.
- **Tail removed:** The classic "tail" or side pointer that visually indicated message origin has been removed. Replaced by perfectly rounded pill-style bubbles.
- **Media:** Photos and videos appear without traditional bubble borders. Media IS the bubble — no visible frame.
- **Alignment:** Without the tail, messages are better aligned with the side of the display, cutting out unnecessary dead space.
- **Timeline:** Android beta 2.26.10.2 (March 2026), iOS beta 26.29.10.70 (rolling out). Both platforms aligned.
- **Our approach:** We keep the asymmetric tail radius (iMessage-style) which is also flagship. The tail corner at `Radius.sm` (4px) is subtle enough. Full pill removal is a design choice, not a requirement.

### 35.4 iMessage Typing Dots

- **Three dots:** Pulsing in sequence, not simultaneously. Each dot fades from 30% to 100% opacity with a 200ms stagger.
- **Color:** Brand blue on iOS. We use `colors.brand` for consistency.
- **Reduced motion:** Static dots at fixed opacity, no animation.
- **Replaces:** Text "typing..." which reads as prototype-grade. The animated dots are a visual cue that doesn't need translation.

### 35.5 Instagram Stories Editor 2026 (verified Aug 2026)

- **Tool layout:** Top toolbar with primary tools, sticker tray behind a smiley icon. Layout feature splits frame into up to 6 panels.
- **Safe zone:** 1080×1920 canvas, but only middle ~1420px is usable. Top 250px and bottom 250px are covered by UI.
- **Progressive disclosure:** Primary tools (text, stickers, draw, layout) are immediately visible. Advanced tools (filters, boomerang, multi-capture) are behind secondary menus.
- **Edits app:** Instagram launched a separate "Edits" app for video creation — timeline with clip-level precision, auto-enhance, green screen, AI image animation.
- **Key insight for our creator:** The collage-native workspace is the right approach. Tool count should be 3-4 primary, with advanced behind "more". The canvas should be the focus, not the tools.

### 35.6 Unread Count Badge (WhatsApp/iMessage 2026)

- **Single unread:** Small dot (8pt) in brand color. No number.
- **Multiple unread:** Pill-shaped badge with count. `minWidth: 18, height: 18, borderRadius: full`. Shows "99+" when over 99.
- **Position:** Right side of the conversation row, after the snippet preview.
- **Color:** Brand color background, inverse text. Consistent across WhatsApp, iMessage, Telegram.

---

## 36. 2026 AUGUST RESEARCH FINDINGS — WAVE 6 FLAGSHIP CROSS-COMPARISON

Compiled from 6 parallel research subagents + manual online research (August 2026).
Benchmark apps: Instagram, Pinterest, eBay, Depop, Vinted, Vestiaire Collective, Whatnot, Snapchat, TikTok.
Full report: `.devin/wave6-research.md`.

### 36.1 Instagram 2026 Key Specs

- **Feed canvas:** 1080×1350px (4:5 portrait recommended), 3:4 grid display since Jan 2025
- **Colors:** True-black OLED dark mode (#000000), body #262626/#fafafa, muted #8e8e8e, heart pink #ed1c84
- **Spacing:** 4px base scale (4/8/12/16/24/32), 16px post card padding
- **Motion:** Spring physics (mass: 3, damping: 500, stiffness: 1000), double-tap heart 1.3x at 300ms
- **Stories ring:** ~2s loop animation on unread
- **Profile grid:** 3:4 aspect ratio (changed from 1:1), 3-column, 2px gap
- **Story highlights:** Moved to dedicated tab (rounded heart icon)
- **DM bubbles:** Gradient sent (purple→pink→orange), gray received, capsule corners, spring physics (mass: 0.6-0.7, damping: 14-24, stiffness: 130-170)
- **Typing indicator:** 3 bouncing dots, phase-offset 0.15s

### 36.2 Pinterest 2026 Key Specs

- **Masonry:** Shortest-column algorithm, 8px gutters (tightest), 16px card radius, natural aspect ratio
- **Warm-cream chrome:** Page #fbfbf9, card #f6f6f3, canvas #ffffff, text #211922
- **Single-accent discipline:** Pinterest Red #e60023 reserved for CTAs only — never decorative
- **Typography:** Pin Sans medium weight "suggests rather than shouts", negative tracking on display
- **Filter chips:** 36-40px height, 8px 16px padding, pill radius, surface #f6f6f3 / active ink #211922
- **Search bar:** 48px height, 15px padding, 16px radius
- **Psychology:** Masonry = discovery/exploration (zig-zag reading, variable rewards). Grid = catalog/utilitarian. Warm colors = hedonic, cool = utilitarian.

### 36.3 Marketplace Trust Signals (Cross-Platform 2026)

- **Review count matters as much as score:** 4.6 with 3,400 reviews > 5.0 with 12 reviews
- **Placement:** Search card (rating + count + badge) → PDP (seller rating, response time, returns) → Checkout (security)
- **Cold-start:** New sellers need verified credentials, fast response, on-time fulfillment
- **Urgency cues:** Real deadlines only (fake urgency tanks trust, legally risky EU/FTC 2024-2026). Calm countdown: clock icon + number, no flashing red. Inline with price.
- **Premium vs flea market:** Generous white space, clean typography, one strong trust signal (not competing messages), editorial content. Avoid: dense info, too many badges, inconsistent photography.

### 36.4 AI-Slop Patterns Identified in Codebase

- **P0:** CreateCollectionScreen stacked equal-weight cards (fixed → flat sections with hairline separators)
- **P0:** HomeScreen decorative gradient scrims on video tiles (kept — functional for price legibility)
- **P0:** 50+ files with hardcoded border radii instead of tokens (noted for future audit)
- **P0:** 163 files with contentFit="cover" without focal-point logic (noted for future audit)
- **P1:** LoginScreen verbose "Welcome back" copy (fixed → "Sign in" / "Enter your details to continue.")
- **P1:** AuctionCard symmetrical layout regardless of state (fixed → state-based left accent borders)
- **Positive:** FlatRow component, designTokens anti-AI principles, excellent state coverage, getCategoryFocalPoint exists

### 36.5 Surface Gaps Identified and Addressed

- **P0 HomeScreen:** Posters rail buried at index 4 (fixed → moved to ListHeaderComponent for first-viewport visibility)
- **P0 ItemDetailScreen:** Gallery lacked thumbnail strip (fixed → enabled showThumbnailStrip on CommerceMediaStage)
- **P0 AuctionDetailScreen:** Same gallery gap (fixed → enabled showThumbnailStrip)
- **P0 BrowseScreen:** Result count lacked visual prominence (fixed → pill badge with icon), active filters lacked visual hierarchy (fixed → surfaceAlt background)
- **P0 NotificationsScreen:** "Needs attention" group lacked visual distinction (fixed → subtle danger background tint, larger title)
- **P0 CreateCollectionScreen:** Generic dashboard silhouette (fixed → flat sections with hairline separators)

### 36.6 Snapchat/TikTok 2026 Key Patterns

- **Full-screen media psychology:** Eliminates peripheral distractions → tunnel vision, stronger "presence", reduced cognitive load, flow state
- **TikTok safe zones (9:16):** Top 200px, bottom 1550-1920px, right 900-1080px → center 840×1310px
- **Snapchat gestures:** Swipe left→Chat, right→Discover, down→Memories, up→Map
- **"Alive" design:** Motion and micro-animation (300ms first impression), freshness each visit, human-centric authenticity, visual hierarchy and tension, platform-native craft, "title sequence" mentality

### 36.7 Implementation Priority Matrix

**Tier 1 (Done):** Posters to first viewport, PDP thumbnail strip, filter visual hierarchy, notification grouping, CreateCollection flat sections, login copy, auction asymmetry
**Tier 2 (Future):** Header visual weight, price treatment upgrade, seller info enrichment, stats grid upgrade, animated tab indicators, sort visible pills, notification type variety, read/unread distinction
**Tier 3 (Future):** Story highlights on profile, AI-assisted sell flow, visual search, mixed grid layouts, notification preview, settings context menus

## 27. 2026 FLAGSHIP UX PSYCHOLOGY PRINCIPLES

Updated August 2026 with latest industry research (Baymard 2026 benchmark, CHI 2026 Material 3 Expressive study, Don Norman emotional design levels, Depop/Vinted/Pinterest/Instagram reference analysis).

### 27.1 The psychology of premium feel

Premium is less about decoration and more about control. Users form snap judgments about quality within seconds of opening an app. The product should feel "edited, stable, and deliberate."

**Three levels of emotional design (Don Norman):**
1. **Visceral** — Initial sensory reaction (happens without conscious thought). Driven by: visual hierarchy, spacing rhythm, media quality, color restraint.
2. **Behavioral** — How it functions and performs. Driven by: gesture responsiveness (<16ms = 60fps), spring physics, haptic grammar, state predictability.
3. **Reflective** — Meaning and message. Driven by: trust signals, truthful UI, social proof, identity expression.

**Cognitive fluency:** Easy-to-process interfaces feel premium. Reduce visual noise, maintain clear hierarchy, use consistent patterns. Generous whitespace signals confidence. High-quality imagery signals investment. Smooth animations signal technical competence.

### 27.2 Flagship timing rules (2026)

| Duration | Use case | Example |
|----------|----------|---------|
| 50–100ms | Instant feedback | Button press highlight |
| 100–200ms | Simple state change | Toggle, checkbox, icon swap |
| 200–300ms | Standard transition | Page slide, sheet appear, tab switch |
| 300–500ms | Complex transition | Layout rearrangement, shared element |
| 500ms+ | Elaborate animation | Onboarding, celebratory moments |

**Key principle:** Err on the shorter side. Users are more forgiving of fast than sluggish. Feedback must arrive within 100ms of user action.

### 27.3 Flagship spring configs (2026)

These are the canonical spring configs for 2026 flagship feel. They are already defined in `theme/motionTokens.ts` — use them via `useMotionConfig()`.

| Config | Damping | Stiffness | Mass | Use case |
|--------|---------|-----------|------|----------|
| tap | 18 | 280 | 0.8 | Snappy tap feedback |
| press | 15 | 200 | 0.9 | Gentle press |
| entrance | 22 | 180 | 1.0 | Sheet/modal entrance |
| lift | 16 | 160 | 1.0 | Card lift / pop |
| success | 12 | 120 | 1.0 | Bouncy celebration |
| sharedElement | 26 | 200 | 1.0 | No overshoot transition |
| urgency | 14 | 220 | 0.9 | Tight, lively pulse |

**Flagship range:** damping 12–18, stiffness 120–280, mass 0.8–1.0. Lower damping = more bounce. Higher stiffness = snappier.

### 27.4 Flagship vs good (2026 benchmark)

| Aspect | Good | Flagship |
|--------|------|----------|
| Animation timing | 300–500ms | 200–300ms standard, 100–200ms feedback |
| Gesture response | 50–100ms delay | <16ms (60fps) |
| Loading states | Spinner | Skeleton matching final silhouette + shimmer |
| Error handling | Alert dialog | Inline error + recovery action (intensity matched to severity) |
| Empty states | "No items" text | Intentional composition + appropriate next action (illustration optional — see below) |
| Button press | Color change | Scale + color + haptic (only where press is a meaningful action) |
| Toggle | Snap | Spring animation + shadow |
| Success | Checkmark | Feedback matched to significance tier (S0–S4, see §27.9) |
| Error | Red border | Inline message; shake reserved for destructive/blocking errors only |
| Pull to refresh | Spinner | Custom indicator with physics + progress haptic |
| Product images | 2–3 photos | Zoom, video, swipe, pagination |
| Search | Keyword only | Visual, voice, AI-powered, autocomplete |
| Recommendations | Related items | Complete the look, style guide |

**Empty states are not "illustration + CTA + explanation" by default.** A flagship empty state is an *intentional composition* with an *appropriate next action*. A generic SVG illustration slapped onto every empty state is itself an AI-made pattern. Sometimes illustration is justified (onboarding, first-run, emotionally significant absence). Sometimes it is worse than a quiet two-line message. Default to restraint:

```
No saved items yet

Save products you like and they'll appear here.

[ Explore ]
```

Add illustration only when it earns its place — when it does explanatory work the text cannot do alone.

### 27.5 2026 platform design languages

**iOS 26 Liquid Glass:**
- Translucent, lensing, depth-driven material system
- Multi-layer depth, subtle refraction, dynamic lighting
- Use sparingly: navigation bars, floating controls, compact panels
- Never wrap entire app in glass — scoped usage only
- Check `AccessibilityInfo.isReduceTransparencyEnabled()` before rendering glass

**Android 16 Material 3 Expressive:**
- Emotion-first, physics-driven update to Material You
- Bold, springy motion; dynamic color from wallpaper
- Variable corner radius; expressive shape choices
- Grounded in 46 research studies with 18,000 participants

### 27.6 Social commerce patterns (2026)

From Depop ($1B sales 2025, 60% YoY growth), Vinted profile redesign, Pinterest Gestalt system, Instagram UX analysis:

- **Feed cards:** Full-width or masonry, seller profiles prominent, social proof visible (likes, comments), mobile-first social-native
- **Profile:** Clear hierarchy, seller-focused, separate seller wardrobe from buyer entry points. Profile is not a feature dumping ground.
- **Discovery:** Personalized feeds replacing static homepages, AI-powered search (keyword matching is now a liability), thumb-friendly design
- **Commerce:** Apps convert at 3–5x higher rates than mobile web. Guest checkout, 1-click buy, visual search, shoppable posts with product tagging.

### 27.7 Trust architecture (2026)

Trust is a critical necessity, not a nice-to-have:

- **Transparent pricing:** Every fee, status, pending state visible and labeled
- **No false success:** Money movements always resolve to clear state
- **Trust signals:** Verified badges (tiered), ratings with review counts, response time, dispatch time, completed sales count, response rate
- **Seller standards:** Derived badges (fast shipper, responsive, top-rated, trusted seller)
- **Holiday/vacation mode:** Custom away messages, clear visual indicator, navigation to settings

### 27.8 Performance as flagship quality (2026)

Performance is a flagship feature, not a technical concern. Targets must be **measurable and anchored to a defined start/end event**, not vague aspirations.

**Measured performance targets:**

| Metric | Target | Definition |
|--------|--------|------------|
| navigation → immediate shell | <100ms | Route mount renders the static screen frame (header, rails, background) |
| navigation → first meaningful skeleton | <200ms | Skeleton matching final silhouette is visible |
| cached feed → first useful content | <300ms | At least one real content tile decoded and visible from cached payload |
| cold network → first useful content | <800ms | First real content tile from a network response (TTFB + decode) |
| image decode → visible media | <150ms per image | From `onLoad` to painted pixels |
| interaction → visual acknowledgement | <100ms | Press/scroll/tap produces a visible response within one frame budget |
| frame budget | no dropped-frame clusters | No 3+ consecutive dropped frames during scroll or transition |

Measure these in **release mode only** — dev mode is 2–5× slower and is not a valid measurement environment.

**Implementation:**

- **60fps minimum** for all scrolling and animations (120fps on ProMotion)
- **FlashList v2** with masonry prop for Pinterest-style feeds
- **Reanimated 4 worklets** for all animations (off JS thread)
- **Stabilise list-item renders where profiling shows meaningful rerender cost.** Use `React.memo` / `useMemo` / `useCallback` *intentionally and measurably*, not as blanket ceremony. Wrapping every list item in `memo()` by default is itself an AI-made code smell — it adds prop-equality overhead without proven benefit. Add memoization when a profiler run shows a rerender cost worth fixing, and remove it if it does not move the metric.
- **useRecyclingState** for like/favorite buttons in recycled list items
- **Hermes bytecode** for faster startup
- **Image preloading** on onboarding for smooth initial scroll

### 27.9 Micro-interaction grammar (2026)

**Micro-interactions are semantic, not universal.** Feedback intensity must correspond to the significance of the state transition. This overrides any earlier table that suggested adding scale/haptic/shake/celebration to every element by default.

Do **NOT** automatically add:
- scale to every card
- haptic to every tap
- haptic at section boundaries
- shake to every error
- celebration to every success

Haptic feedback on routine scrolling (e.g. "scroll past section → selection haptic") becomes annoying extremely quickly and is prohibited as a default. Reserve haptics for moments where the user's hand is the actor on a meaningful action, not where the user's eye is the observer of a passive transition.

**Success feedback hierarchy (S0–S4):**

| Tier | Feedback | Use when | Examples |
|------|----------|----------|----------|
| S0 — invisible | None. Local state updates silently. | Routine local state change with no user-visible consequence. | Filter chip toggle, sort order, internal flag. |
| S1 — visual state only | Icon/state change, no haptic. | Low-stakes user action with immediate visual confirmation. | Like, save, follow, bookmark. |
| S2 — visual + subtle haptic | State change + light impact haptic. | Meaningful confirmed user action that the user initiated deliberately. | Add to cart, send message, submit search, confirm selection. |
| S3 — dedicated success state | Full success surface/spring + haptic. | Transactional or irreversible confirmed action. | Purchase, sale, payout, onboarding milestone, listing published. |
| S4 — celebratory | Spring celebration + haptic + (optional) sound. | Rare achievement or emotionally significant event. | First sale, milestone reached, level-up, rare badge earned. |

The vast majority of "success" moments in the app are S0 or S1. S3 and S4 are rare by design — if everything celebrates, nothing does.

**Press feedback:** scale + spring back is appropriate for *primary* actions (a card opening, a CTA button). It is not required on every `Pressable`. Transparent 44pt hit targets (back, overflow, search, camera) need only a tint/opacity press state, not a scale animation.

**Error feedback:** inline message is the default. Shake is reserved for destructive or blocking errors (failed purchase, invalid form submission that the user just tried to submit). A network error on a background fetch does not shake the screen.

**Reference table (intensity-matched, not universal):**

| Element | Good | Flagship (when justified) |
|---------|------|----------|
| Primary button press | Color change | Scale 0.95–0.97 + spring back + light haptic |
| Tab switch | Instant | Sliding indicator + content crossfade (haptic optional, not required) |
| Card tap (opens detail) | Background change | Scale 0.97 + spring back (haptic optional) |
| Like / save / follow | Icon swap | Heart burst or fill animation, no haptic (S1) |
| Pull to refresh | Spinner | Custom indicator with physics + progress haptic at release |
| Error (blocking) | Red text | Shake + error haptic + inline recovery |
| Error (background) | Silent | Inline status row, no shake |
| Success (S0–S1) | Text/icon change | State change only |
| Success (S2) | Text change | State change + light haptic |
| Success (S3) | Checkmark | Dedicated success surface + haptic |
| Success (S4) | Checkmark | Spring celebration + haptic + optional sound |
| Scroll past section | None | None — do not add haptics to passive scrolling |

### 27.10 Research protocol for 2026

Before implementing any UI/UX upgrade, research current best practices online. Best practices drift — do not rely on memory:

1. Search for the latest patterns (e.g., "flagship mobile feed design 2026")
2. Verify current library APIs and versions (e.g., "Reanimated 4.5 features")
3. Study reference apps' latest versions (e.g., "Depop UX redesign 2026")
4. Check platform design language updates (e.g., "iOS 26 Liquid Glass guidelines")
5. Implement findings — do not stop at research

---

## 28. RESEARCH PACK ROUTING

The flagship research library is a **reference corpus, not a prompt to load wholesale**. When research documents are supplied with a task, treat them as reference material for the specific surface being changed — do not blindly enforce unrelated findings onto unrelated screens. A finding about feed masonry does not apply to a settings screen; a finding about media focal points does not apply to a text-only confirmation sheet.

When supplied research conflicts, resolve in this priority order:

```
user requirement (explicit, current task)
  → screen-specific research (department report for this surface)
    → component research (primitive-level report)
      → generic research (cross-cutting principles)
```

A higher tier overrides a lower tier. Generic research never overrides a screen-specific finding.

---

## 29. OPTICAL AUTHORITY

Tokens establish consistency. **Rendered geometry establishes quality.** The native render wins over mathematical purity.

Agents may use small, documented optical corrections when token-perfect geometry looks visually incorrect. This is not permission to ignore the token system — it is permission to fix the cases where the token system produces a visibly wrong result.

**Permitted optical corrections:**

- 1px icon baseline correction (icons rarely sit on the true baseline)
- glyph optical-size compensation (same pt size renders different visual weight across families)
- asymmetric visual centering (true geometric centre ≠ perceived centre for shapes with weight at the bottom)
- category-specific media focal positioning (faces vs products vs landscapes need different crop anchors)
- inner/outer corner compensation (stroke corners vs fill corners do not align geometrically)
- typography baseline adjustment (cap height vs x-height vs descender alignment across mixed weights)

**Rules:**

- Every optical correction must be **documented inline** with a comment explaining why the value deviates from the token (e.g. `// optical: icon sits 1px below baseline to align with x-height`).
- Optical corrections are **local to the component that needs them**. Do not propagate a correction into a shared token.
- Never "clean up" an intentional optical exception merely because it does not match the spacing scale. If a value looks wrong after "fixing" it to the nearest token, revert it.
- The test is the **rendered result**, not the token audit. A screen that is token-perfect but visually misaligned is a failure; a screen with one documented optical correction that looks right is a success.

Without this rule, an agent can make the UI mathematically consistent while actually making it visually worse. The native render is the source of truth.

---

## 30. LAST-MILE VISUAL ACCEPTANCE

Before claiming a UI/UX task is complete, the agent must inspect the rendered surface against this checklist. **Passing TypeScript and tests is not permission to skip this section.** This is the final gate.

### Silhouette & first viewport
- [ ] silhouette — at 25% scale, the primary object and reading order are obvious; repeated rounded rectangles do not dominate
- [ ] first viewport — the most important content and actions are visible without scrolling
- [ ] content density — useful objects per viewport is appropriate (4–6 rows for lists; ≥2 media objects for discovery)
- [ ] outer rails — left/right edge alignment is intentional and consistent

### Rhythm & alignment
- [ ] vertical rhythm — spacing cadence is deliberate, not random
- [ ] baseline alignment — text baselines align across columns and rows where they should
- [ ] optical centering — centred elements are visually centred, not geometrically centred (see §29)

### Corners, strokes & surfaces
- [ ] corner continuity — inner and outer radii relate correctly (outer = inner + padding)
- [ ] no unnecessary borders — hairlines only where they communicate a boundary
- [ ] no unnecessary cards — flat canvas + spacing is the default; cards require a reason
- [ ] separator consistency — one separator grammar per surface
- [ ] shadow necessity — every shadow earns its place; no decorative shadows

### Icons
- [ ] icon optical weight — consistent line weight / fill rule within a viewport
- [ ] icon baseline — icons align to text baseline, not to bounding box
- [ ] icon/label gap — consistent gap between icon and its label across the surface

### Media
- [ ] media crop — focal point preserved; no blind `cover` on everything
- [ ] focal point — faces/products/landscapes cropped to their meaningful anchor
- [ ] repeated media proportions — consistent aspect ratios within a feed/grid
- [ ] colour distribution in feeds — media provides the colour, not grey placeholders

### Typography
- [ ] typography hierarchy — clear type scale; no competing weights at the same role
- [ ] number alignment — tabular/monospaced figures where numbers align vertically
- [ ] truncation — long names/content truncate gracefully with ellipsis or fade
- [ ] large text — display sizes are optically tuned, not just scaled up

### States & transitions
- [ ] press states — every interactive element has a visible press state
- [ ] loading → final geometry — skeleton matches final layout; no layout shift on load
- [ ] transition continuity — shared elements, position, and scroll offset persist across transitions
- [ ] scroll restoration — returning to a list restores scroll position

### Theme & device parity
- [ ] light mode — renders correctly
- [ ] dark mode — geometry, hierarchy, and density are identical to light mode (no added glow/translucency)
- [ ] compact phone — no overflow, no clipped content, hit targets ≥44pt
- [ ] standard phone — composition holds at 390–430pt width
- [ ] large phone — composition scales gracefully; no stretched whitespace or oversized chrome

### Sign-off

Only after every applicable box above is checked may the agent claim:

```
COMPLETE — TARGET MET.
```

If any box fails, the task is not complete. Fix it and re-run the checklist. Do not claim completion with open failures.

---

## 31. VISUAL FLAGSHIP CONVERGENCE LOOP — THE CANONICAL EXECUTION UNIT

> **Authority:** `.devin/workflows/visual-flagship-convergence-loop.md`. This section is binding and overrides the former department-wide "research then mass implementation" method for every UI/UX change.

### 31.1 The implementation unit is one surface, not one department

Past a certain point, more research does not produce proportionally better visual design. The repository is research-rich and iteration-poor. The flagship research library (§28) remains a **reference corpus**, not a prompt to load wholesale. The implementation unit is now **one visually coherent surface at a time**.

Do not accept a task framed as "implement this department" and fan out across dozens of screens. Reframe it as a sequence of single-surface convergence loops, beginning where the code proves the largest structural gap:

```
Discover/Explore → Creator media selection → Poster camera/editor → Looks Explore
→ Product Detail → Co-Own → Profile → Inbox/Chat → Settings → remaining utility
```

### 31.2 Active visual context budget

For an implementation task, reduce active visual context to:

```
1 department north-star document      (max ~3–5 pages)
1 current surface contract            (max ~1–2 pages, .devin/surfaces/<surface>.md)
3–5 benchmark reference screenshots    (per state)
1 current native screenshot            (same viewport as benchmark)
1 explicit before→after visual delta
```

Do not paste the 86-file research pack into an implementation prompt. Do not paste this whole charter into a subagent prompt (§0).

### 31.3 Observable visual outcomes, not quality adjectives

"Flagship", "premium", "modern", "minimal", "Pinterest-quality", "Instagram-style" are judgements, not CSS properties. Agents translate them into familiar patterns (premium → radius + shadows; modern → pills + blur; minimal → remove content; Instagram → underline tabs; Pinterest → 2-column masonry). That translation is how AI-slop appears.

Hygiene rules in §4 (no card-on-card, fewer pills, restrained radii, 44pt targets, flatter surfaces, limited animation) are **floor constraints**, not the objective function. Repeating one recipe (flatten → remove pill → remove shadow → underline → shrink label → reduce radius) across every screen is a different kind of machine-generated sameness. Human-designed flagship products select the treatment that serves the particular object and context; they do not have a universal rule that tabs must always be underlines or buttons always 50pt.

Implementation instructions and surface contracts must define **observable visual outcomes** instead:

```text
- At 25% screenshot scale the media must dominate.
- The user must identify the main action without reading.
- The first viewport must show ≥2 strong media objects.
- Exactly one visual region may use persistent containment.
- The next item must peek 80–140pt into the viewport.
- Navigation must disappear in the squint test.
- The editor must expose no more than four immediately relevant actions before More.
- No catalogue-card silhouette may dominate the first viewport.
```

These are testable. "Make it flagship" is not.

### 31.4 The cold critic

The same agent must not research → spec → implement → test → evaluate its own visual work. That creates confirmation bias. The visual reviewer is a **cold critic** that receives only `reference screenshots + resulting screenshots + user goal` — not commit messages, not implementation explanations, not "all requirements completed."

It answers only: what looks weaker, what feels templated, what visually dominates incorrectly, where density differs, where crop/art direction fails, what a senior designer would reject immediately. Then the coding agent reworks from that criticism. This separation is mandatory for any surface that claims visual completion.

### 31.5 Definition of done — native artifact required

Engineering-ready is not visually done.

```text
TypeScript 0 errors + tests pass + tokens compliant + no banned patterns
  = engineering-ready for visual review. NOT completion.

Visual completion requires:
  - a native artifact (screenshot). No screenshot = not visually reviewed.
  - a side-by-side at equal scale vs the benchmark. No side-by-side = not reference-validated.
  - at least one rework iteration after the first capture. No second iteration = almost certainly not flagship.
  - human acceptance. No human sign-off = not signed off.
```

When no native device or emulator is available (§19), use status `IMPLEMENTED — NATIVE DEVICE VALIDATION PENDING` and produce the surface contract + before→after delta so the user can run the first capture. Do not claim `COMPLETE — TARGET MET` without a native artifact and human sign-off.

### 31.6 Generalize only after one screen proves the pattern

Do not propagate a visual grammar across the codebase until one screen has passed sign-off (§31.5). Extracting and generalizing a pattern is step 10 of the loop, after one screen has cleared the bar. Screen-local compensation remains allowed when a screen has a genuinely different information hierarchy (§4).

### 31.7 Enforcement

The visual release gate (`.devin/release-gates.md`, `check-visual-release-gates.mjs`) is enforced: it fails on P0 violations by default. A TypeScript pass cannot override an obviously inferior native render (§4, §29). The native render is the source of truth.

---

## 37. LIVE-SIGNS CONVERGENCE — FUNCTIONAL TRUTH AS THE OBJECTIVE

> **Authority:** `.devin/workflows/live-signs-convergence-loop.md`. This section is binding and is the functional counterpart to §31 (Visual Flagship Convergence). A surface is not complete until it has passed **both** loops.

### 37.1 The implementation unit for functional truth is one surface's full data path

The Visual Flagship Convergence Loop (§31) governs how the app *looks*. It exposed the failure mode of department-wide mass visual commits: large diffs, impressive commit messages, no proportional visual jump.

The same failure mode exists on the **functional** axis and is more dangerous because it is invisible. A 40-screen visual pass can look impressive in a commit log while every screen still renders mock data, every mutation stays local, every trust badge is asserted by the frontend, and every coupled surface desyncs. The app "works" in TypeScript and "looks flagship" in a screenshot, but it is a prototype with flagship makeup — not a product.

The commits that actually moved ThryftVerse from prototype to product were not the mass visual waves. They were focused, end-to-end functional closures: live-endpoint bug fixes (`46a17968`), real-data seeding + honest error (`0afcdf6a`), cross-surface propagation (`0d2fb8b2`), transaction/race/auth/leak hardening (`c113dd1b`), backend-row-evidenced trust (`84e289f7`), idempotent unknown-outcome UI (`211b5f7e`), backend↔frontend integration (`d0697208`, `d993d364`, `e5f60987`, `c88599e2`), and fabrication removal (`5debc0ce`).

**Live signs come from end-to-end closure of one functional surface, not from mass visual passes.** The implementation unit for functional truth is one surface's full data path (DB → API → serializer → hook → state → UI → and back), not one department.

### 37.2 The live-signs test (replace "it works")

"It works" and "TypeScript passes" are not live signs. Translate vague functional claims into observable live-signs outcomes:

```text
- A real GET /endpoint returns real rows that the UI renders (not mock, not hardcoded).
- A mutation POST/PATCH persists to the DB and is reflected on every surface that shows that entity.
- A 401 on a protected route expires the session and redirects to auth — no stale state.
- An unknown-outcome (network drop after send) shows "Check result" + safe retry with the same idempotency key, never a fake success.
- A trust badge renders only when a backend row evidences it. Fail-closed: null = no render.
- A race that could double-sell / double-create / double-charge is closed by a transaction with FOR UPDATE.
- A setTimeout / setInterval / subscription is cleaned up on unmount — no leak.
- A listing paused by an auction/co-own stays paused everywhere; sold by an auction win is sold everywhere.
```

These are testable against the live backend. "It works" is not.

### 37.3 The loop

```
For one functional surface:
  1. TRACE       → map DB → API → serializer → hook → state → UI (and back)
  2. WIRE        → connect UI to the real endpoint; no production mock fallback
  3. SERVE       → ensure the backend returns real data (migration / endpoint / seed)
  4. VERIFY LIVE → hit the live endpoint; confirm real rows render; not just TypeScript
  5. PROPAGATE   → every coupled surface reflects the mutation; re-fetch on focus
  6. STATE-COVER → loading / empty / error / offline / partial / unknown-outcome — all honest
  7. HARDEN      → transactions, idempotency, races, auth, privacy, resource cleanup
  8. CRITIQUE    → cold critic: "does this surface lie? fabricate? desync? leak? race?"
  9. SIGN OFF    → live endpoint verified + no fabrication + propagation confirmed + states honest
```

A functional surface is not done until step 9. See the workflow file for the full per-step detail.

### 37.4 The live endpoint is the source of truth, not TypeScript

TypeScript passing is necessary, not sufficient. The verification standard is: **hit the live endpoint and confirm real rows render.** Run the backend against real Postgres/Redis and exercise each P0 endpoint. The commits that found the worst bugs found them this way — never via typecheck (a SQL double-comma that 500'd `/auctions`, a parameter mismatch that 500'd Buy Now, public routes blocked by preHandler auth — all typechecked clean, all broken live).

Record the live verification:
```text
GET /listings        → 12 rich listings with images + dimensions
POST /auctions/:id/buy-now → creates order + returns orderId
GET /co-own/assets/:id     → custodyCoverageGbp=5000
```

When the backend cannot be run live, mark `IMPLEMENTED — LIVE ENDPOINT VALIDATION PENDING` and list the endpoints awaiting verification. Do not claim `COMPLETE — TARGET MET` without a live endpoint check.

### 37.5 Fail-closed trust — no badge without a backend row

Every trust signal (verified tier, safeguarded status, custody coverage, appraisal value, escrow ETA, rights TBC) must be **evidenced by a backend row**, not asserted by the frontend. Fail-closed policy throughout:

- null means no render
- no badge without a tier
- no TBC without a reason
- no stale without an action
- no failure without a recovery

A badge rendered from a hardcoded value or a frontend default is a lie (§11). This is the `84e289f7` standard.

### 37.6 Cross-surface propagation — the app is one system

A real product is coherent. For every mutation on the worked surface:

- identify the **propagation surface set** — every screen that reads the mutated entity
- after a successful mutation, invalidate queries and re-fetch (`refreshListings()`, query invalidation, store update)
- replace `useEffect` data loading with `useFocusEffect` on screens that must re-fetch on focus
- backend mutations that affect other entities must update those entities in the same transaction (auction creation pauses the listing; auction win marks the listing sold; co-own trade closing sets `is_open = FALSE` when units reach 0)

A listing edited on one screen that doesn't update on another until a 55-second polling cycle is a prototype, not a product.

### 37.7 Unknown-outcome is a state, not a success

When a mutation request is sent and the network drops before the response, the outcome is **ambiguous** — not an error, not a success. Never show a success state for an ambiguous outcome (that is a fabricated success, §11). Show a distinct unknown-outcome treatment: warning color, "Check result" action, hint that retry is safe via the idempotency key. The backend must support idempotent replay on every money/creation mutation.

### 37.8 Hardening is part of the deliverable

For the worked surface:

- **Transactions + `FOR UPDATE`** on any read-then-write mutation (ownership check → insert → status change). A race between check and write is a double-sell/double-create bug.
- **Idempotency keys** on every money/creation mutation; replay returns the original result, never a duplicate.
- **Auth:** public routes in `isPublicRoute`; protected routes reject unauthenticated; 401 on refresh failure → logout → redirect.
- **Privacy:** cross-user → 403; unauthenticated → 401; aggregate projections never leak user IDs, entry prices, or P&L. Add a privacy projection test for any new entity exposing holdings/bids.
- **Resource cleanup:** every timer/subscription tracked in a ref and cleared on unmount.
- **Realtime ordering:** every event carries `seq` + `v`; `/realtime/seq` lets reconnects detect gaps.

### 37.9 The cold critic (functional)

The same agent must not wire → verify → approve its own functional work. The functional reviewer receives only `data-path trace + live endpoint responses + state matrix + propagation surface set` — not commit messages, not "TypeScript passes." It asks: does any surface render mock data in production? does any mutation fail to propagate? does any badge lack a backend row? does any money mutation lack idempotency/transaction guard? does any state fabricate success? does any route leak data? does any timer leak? would a live hit expose a 500 that TypeScript hid?

### 37.10 Definition of done — live signs

```text
TypeScript 0 errors + tests pass = engineering-ready. NOT functional completion.

Functional completion requires:
  - UI renders real data from a live endpoint (not mock, not hardcoded).
  - the live endpoint has been hit and returns expected rows (recorded).
  - every mutation propagates to its full surface set.
  - the full state matrix is honest, including unknown-outcome.
  - every trust signal is evidenced by a backend row (fail-closed).
  - money/creation mutations are transactional + idempotent.
  - auth + privacy projections are correct (with a test for new entities).
  - no timer/subscription leak.
  - live-endpoint cold-critic pass.
```

### 37.11 Two loops, one completion

A surface is complete only when it has passed **both** the Visual Flagship Convergence Loop (§31) and the Live-Signs Convergence Loop (§37). A flagship-looking screen backed by mock data is not done. A live-wired screen that looks prototype-grade is not done. Mass visual passes that leave screens on mock data are not upgrades — they are decoration over a prototype.

### 37.12 Priority order

Work functional surfaces where the code proves the largest truth gap — surfaces that look done but are not live:

```
1. Money surfaces (checkout, wallet, payouts, buy-now, auction settlement) — fabrication here is most damaging.
2. Trust surfaces (co-own dossier, buyer protection, seller verification, KYC) — badges without backend rows are lies.
3. Discovery / feed surfaces — must render real data, not mock catalogues.
4. Creator surfaces — publish/edit must persist; analytics must be real.
5. Cross-surface propagation hotspots — anywhere a mutation desyncs another surface.
6. Remaining CRUD / utility surfaces.
```

## 38. CREATOR UPLOAD DEPARTMENT — ARCHITECTURE FINDINGS (2026)

### 38.1 Card-between-media defect — FIXED

**The defect:** The canvas had its own background fill (`#1a1a1a` poster / `#000000` look) rendered as a full-fill layer BEHIND the media layer. Media was a `type: 'media'` layer at `zIndex: 0` on top of this background — not the canvas itself. This created a visible "card" between the screen and the media, unlike Snapchat/Instagram where the media IS the canvas.

**The fix:** `CreatorCanvas.renderBackground()` now skips the background fill when (a) a full-bleed media layer exists (`width ≥ 1, height ≥ 1`) AND (b) the background is still the factory default (no user customisation). User-customised backgrounds (gradient, image, non-default colors) are preserved. The serializers (`serialiseToLookPayload`, `serialiseToPosterPayload`) and viewer adapters (`lookToDocument`, `posterStoryToDocument`) set the background to `'transparent'` in exported/viewer documents when full-bleed media exists, so the published output also has no card frame.

**Key helpers:** `hasFullBleedMedia(page)`, `isDefaultBackground(bg, docType)` in `composition.ts`. Constants: `LOOK_DEFAULT_BACKGROUND = '#000000'`, `POSTER_DEFAULT_BACKGROUND = '#1a1a1a'`.

### 38.2 Icon grammar — banned metaphors and discipline

**Banned icon metaphors (enforced):** `sparkles-outline` (AI/magic), `color-wand-outline` (magic), `rocket-outline` (novelty boost), `shield-outline` outside protection-program contexts. All replaced with semantically correct alternatives: `color-filter-outline` (effects), `bulb-outline` (auto/suggest), `cut-outline` (cutout), `trending-up-outline` (boost), `scan-outline` (safe zone), `eyedrop-outline` (eyedropper), `compass-outline` (discover), `flash-outline` (express shipping), `options-outline` (adjust).

**Icon family:** The codebase uses exactly ONE family (Ionicons, 506 files) + the custom `CreatorGlyph` SVG system for creative-tool glyphs. No family mixing. The dead `SemanticIcon`/`iconRegistry` abstraction (0 consumers) was deleted. Icon discipline is enforced via `IconGrammar` tokens (standard:22, metadata:16, badge:12, hero:28) — all hardcoded sizes should migrate to these bands.

**Fill/outline rule:** Outlined = resting/default. Filled = selected/active state only. The tab bar already follows this correctly.

### 38.3 Capture-to-edit continuity — ALREADY FLAGSHIP

The `CreatorEntryEditorCrossfade` implements pinned-media element-continuity at 240ms with position/size interpolation and reduced-motion fallback. Camera chrome restraint: 7 idle actions (within Snapchat's ≤7 benchmark), gallery thumb = no label + transparent 44pt target, multi-snap staging tray with "Done (N)" button, single-capture goes direct-to-editor (no review screen). No work needed.

### 38.4 Look composer tool rail — FIXED

- **Effects tool was unreachable** (5 primary tools but rail caps at 4). Effects moved to overflow.
- **Adjust opened the cutout sheet** instead of adjustment controls. Now opens the effects surface (which contains the AdjustPanel).
- **Cutout tool added to media-selected overflow** so background removal is still accessible.
- **Tag Style tool removed** — it opened the product picker (same as "Item"), not a tag style editor. No tag style editor exists.
- **`computeLookLayout` and `autoCompose` aligned** for 3-image default — both now produce the "editorial" layout (60% hero left + two 28% images stacked right).

### 38.5 Backend truth — clean

- Look API: 100% real data, no mocks.
- Poster API: real DB-backed, mock fallback only in dev mode (`ENABLE_RUNTIME_MOCKS`).
- **Fixed:** `snapshotcaption` typo in backend Zod schema (was `snapshotcaption`, should be `snapshotCaption` to match frontend contract) — look sticker captions were being silently dropped.
- **Fixed:** `OverflowItem` in poster composer now passes `glyph` prop so CreatorGlyph icons render in the overflow menu (previously silently dropped).

### 38.6 Icon size discipline — migrated to IconGrammar tokens

**The defect:** 100+ hardcoded icon sizes across 40+ files in the creator directory — `size={20}`, `size={24}`, `size={18}`, `size={14}`, `size={26}`, `size={16}`, `size={22}`, `size={28}`, `size={32}`, `size={36}`, `size={40}`, `size={10}`, `size={12}`, `size={13}`. This is the "inconsistent primitives" AI tell — no single optical size band, no stable system.

**The fix:** All hardcoded Ionicons/CreatorGlyph sizes migrated to `IconGrammar` tokens from `designTokens.ts`:
- `IconGrammar.standard` (22) — navigation/standard glyphs
- `IconGrammar.metadata` (16) — small metadata glyphs
- `IconGrammar.badge` (12) — badges and micro-indicators
- `IconGrammar.hero` (28) — hero/large glyphs

Only 2 exceptions remain: `size={92}` (large empty-state illustration, not a glyph) and `size={8}` (micro play indicator on a thumbnail, too small for the badge band).

### 38.7 Dead code removed

- **`StickerPicker.tsx`** (1644 lines) — legacy sticker picker with 0 imports. Replaced by `StickerBrowserSheet` and `CreatorAssetPicker`.
- **`InlineTextToolbar.tsx`** — floating text toolbar with 0 imports. Only referenced in comments. The inline text editing flow uses `InlineTextEditor` directly.
- **`SemanticIcon.tsx` / `iconRegistry.ts`** — dead icon abstraction layer (0 external consumers, deleted in previous pass).

### 38.8 Card-between-media defect — FIXED (architectural)

**Root cause:** The poster and look composers rendered a fixed-aspect-ratio canvas (9:16 for poster, 4:5 for look) centered on a black screen. On a 390×844px phone, the poster canvas was 390×693 — leaving ~75px black bars above and below. The look canvas was 390×488 — leaving ~178px black bars. The media looked like it was inside a card, not filling the screen. In Snapchat/Instagram, the media IS the screen.

**Fix:** The edit surface geometry now distinguishes the EXPORT ratio from the EDIT SURFACE ratio:
- **Poster (`PosterComposerScreen.tsx`):** When a full-bleed media layer exists (width=1, height=1), `canvasHeight = screenHeight` and `canvasVerticalOffset = 0` — the canvas fills the entire screen. The media uses `contentFit="cover"` to fill it. Without full-bleed media, the centered 9:16 canvas is kept so the authoring surface communicates the export shape.
- **Look (`LookComposerScreen.tsx`):** When full-bleed media exists, `canvasHeight` fills the available space between the top bar (56pt + status inset) and bottom tool dock (120pt + home inset), with a floor at the 4:5 height. `canvasVerticalOffset` pins the canvas just below the top bar.
- The export pipeline is untouched — it still crops to the document's `aspectRatio`.

### 38.9 AI-slop patterns removed — 7 files

Per 2026 research (VP0 Journal: "Why Does My AI App Look Generic?"), the AI-slop fingerprint is: same fonts, decorative chrome on every surface, label-everything disease, generic dashboard silhouette, excessive motion. The fix is structural, not verbal.

**Files fixed:**
- **`CreatorEntryScreen.tsx`:** Removed decorative border on draft thumbnails, removed "Last edited" prefix (relative time is sufficient).
- **`CreatorPublishSheet.tsx`:** Removed all uppercase eyebrow labels ("Preview", "Cover", "Caption", "Audience"), removed verbose hint copy, removed `audienceDescription` restating the segmented control, flattened `captionCard` (border+background+radius) into `captionField` (hairline bottom border only), removed card shadows on preview pages and cover thumbnails, replaced scale spring entrance on error states with simple opacity fade.
- **`CreatorToolDock.tsx`:** Removed mount slide-in animation (translateY 120→0 spring), removed context transition spring on selection mode change, reduced floating dock shadow from 0.3 opacity/20px radius to 0.15/12px.
- **`CreatorLayersSheet.tsx`:** Removed duplicate type icon from layer name row (thumbnail already shows type), removed `layer.type` subtitle text, removed thumbnail spring scale on row mount, removed type subtitle from overflow action sheet.
- **`CreatorDraftListScreen.tsx`:** Removed title overlay on thumbnails (title already in info section), removed "Look"/"Poster" type badge pill (type already in meta text), removed stagger entrance animation, fixed duplicated empty-state text bug.
- **`PosterComposerScreen.tsx`:** Removed colored background + border on recovery banner (now inline notification), removed filled gold pill button (now brand-colored text), removed `bottomRailHairline` decorative separator.
- **`LookComposerScreen.tsx`:** Removed solid `backgroundColor: colors.surface` from top bar (now transparent), removed `borderBottomWidth` from top bar, removed colored background + border on recovery banner, removed `borderRadius` + `borderWidth` from AI Effects button (now inline button row), removed `borderTopWidth` from bottom bar, removed inline `backgroundColor` + `borderTopColor` from all 3 bottom bar instances.

### 38.10 AI-slop fix REFINEMENT — upgrade, not deletion (Loop 4)

**Lesson learned:** The initial AI-slop fix (§38.9) took the lazy approach of *stripping* elements instead of *upgrading* them. Deleting labels, chrome, and animations without replacing them with better design is not an upgrade — it's just deletion. This loop corrected that with proper REDESIGN based on 2026 research (Carbon Design System notification patterns, Figma layer panel feedback, Instagram Liquid Glass chrome, Pinterest Shuffles collage UX).

**Files RE-UPGRADED with proper hierarchy:**

- **`CreatorLayersSheet.tsx`:** Restored type icon in layer name row (16pt, accent color) — the icon IS the type label, providing a visual anchor for scanning. Kept the removal of the redundant "media"/"text" subtitle text. Restored a REFINED thumbnail animation (opacity fade 0→1, 150ms) instead of the old excessive spring scale (0.8→1). Restored type subtitle in overflow sheet using `getLayerCategoryLabel()` for human-readable labels ("Image", "Text", "GIF") instead of raw `layer.type`.

- **`PosterComposerScreen.tsx` + `LookComposerScreen.tsx` recovery banners:** Redesigned with proper notification hierarchy per Carbon Design System: subtle tinted background (8% opacity, not the old 15%), left accent bar (3pt `#C9A46A`), brighter text (85% opacity), proper action button (15% opacity background, `Radius.sm`, brand-colored text). "Calm but noticeable" — not stripped, not heavy.

- **`LookComposerScreen.tsx` chrome scrims:** Added `LinearGradient` scrims for top bar (60%→transparent, 120pt) and bottom bar (transparent→80%, 80pt) — proper visual separation without hard borders, matching Instagram's Liquid Glass pattern.

- **`LookComposerScreen.tsx` AI Effects button:** Upgraded to premium button: subtle tinted background (8% opacity), refined border (1pt, 20% opacity), `Radius.md` — a proper button, not a stripped text row.

- **`CreatorToolDock.tsx`:** Restored REFINED motion: mount fade (opacity 0→1, 200ms, ease-out) and context transition fade (0.5→1, 150ms) — premium subtlety, not the old excessive slide+spring+haptic, and not the jarring instant appearance.

- **`CreatorPublishSheet.tsx`:** Added SUBTLE section labels ("Preview", "Caption", "Audience" — 11pt, textMuted, regular weight) and hairline separators between sections — scannable organization, not the old uppercase eyebrows, and not the unorganized flat list.

- **`CreatorDraftListScreen.tsx`:** Added subtle type indicator (8pt colored dot: Poster=gold, Look=white) + relative time in meta line — scannable type distinction without the old pill badge. Restored REFINED stagger animation (30ms delay, opacity only, 200ms) — premium list entrance, not the old 50ms scale spring, and not the jarring instant appearance.

- **`CreatorEntryScreen.tsx`:** Restored REFINED thumbnail border (1pt, 6% opacity white) — a finished edge, not the old 10% decorative border, and not the unfinished borderless look.

---

## 39. ARCHITECTURE GAP CLOSURES — 2026 AUGUST (7 gaps)

This section documents the closure of 7 architecture gaps that separated ThryftVerse from flagship native apps. Each gap is traced from evidence to fix, with the research and implementation decisions recorded for future agents.

### 39.1 Gap 2 — inlineRequires enabled in Metro (CLOSED)

**Evidence:** `metro.config.js` did not set `inlineRequires`. Expo disables this by default (reverted in PR #25680 because the transform does not respect module side-effects).

**Fix:** `metro.config.js` now uses `config.transformer.getTransformOptions` with `inlineRequires: { blockList: {} }` — the 2026 best-practice pattern. The `blockList` is empty for now; add side-effect modules as they are identified during testing.

**Impact:** Metro now defers module top-level evaluation (side effects, object construction, top-level computations) to first use, not at boot. Complementary to the existing `getComponent(() => require(...))` pattern which already defers screen modules. Together they reduce cold-start `metroRequire` time.

**Research sources:** https://andrei-calazans.com/posts/2026-06-02-how-metro-inlined-requires-work/ · https://reactnative.dev/docs/optimizing-javascript-loading · https://github.com/expo/expo/pull/25680

### 39.2 Gap 3 — Lazy screen loading (ALREADY SOLVED)

**Evidence:** `AppNavigator.tsx` already uses `getComponent={() => require('../screens/...').default}` for all 160+ non-initial screens. Only `AuthLandingScreen` and `TabNavigator` are eagerly imported (correct for initial routes).

**Finding:** This IS the recommended lazy loading pattern for React Navigation v7 (confirmed by React Navigation docs and Andrei Calazans' profiling). The `require()` inside `getComponent` only runs when the screen is first navigated to. No `React.lazy()` or dynamic `import()` needed — `getComponent` is the lighter-weight native pattern.

**No change needed.** This gap was a false positive in the original audit.

### 39.3 Gap 7 — Kysely type-safe query layer (CLOSED — incremental adoption)

**Evidence:** Backend used raw `pg` with hand-written SQL and hand-maintained TS types (e.g. `ListingOfferRow` with 18 fields). 112 SQL migrations, 179 tables, 519 `db.query` calls in `index.ts` alone. Query/serializer drift was a silent failure.

**Fix:** Installed Kysely 0.29.5 + kysely-codegen 0.20.0. Created:
- `backend/api/src/lib/database-types.ts` — `Database` interface with core table types (14 tables covered, extensible)
- `backend/api/src/lib/kysely.ts` — `createKysely(pool)` factory that wraps the existing `pg.Pool` (no new connection pool)
- Migrated `backend/api/src/routes/collections.ts` as proof-of-concept — all hand-written SQL replaced with type-safe Kysely queries, hand-maintained `CollectionRow` type deleted
- Added `db:types` script to `package.json` for regenerating types from a live DB via `kysely-codegen`

**Incremental adoption strategy:** Both raw `pg` queries and Kysely queries coexist, sharing the same connection pool. New routes use Kysely. Existing routes migrate one at a time. The `sql` template tag provides a parameterized raw SQL escape hatch for queries too complex for the builder.

**Migration priority:** `collections.ts` (done) → `notifications.ts` → `creatorDocuments.ts` → `listingOffers.ts` → decompose `index.ts` monolith (49K lines) into route modules + migrate.

**Research sources:** https://kysely.dev/docs/getting-started · https://github.com/RobinBlomberg/kysely-codegen · https://kysely.dev/docs/recipes/raw-sql

### 39.4 Gap 1 — Custom native code via Local Expo Module (CLOSED)

**Evidence:** No `codegenConfig` in `package.json`, no `specs/` directory, no TurboModules. The New Architecture was enabled but unused for custom native code.

**Fix:** Created a Local Expo Module at `frontend/modules/thryft-native/` using the Expo Modules API (NOT raw Codegen TurboModules). The Expo Modules API is Expo's recommended approach for Swift/Kotlin native modules — it generates bridge/Fabric registration automatically from the `ModuleDefinition` DSL.

**Why not Codegen TurboModules:** iOS TurboModules require Objective-C++ (no direct Swift). TurboModules are singletons with no object lifecycle. Codegen runs on every build. The Expo Modules API and Nitro Modules (already installed: `react-native-nitro-modules` 0.37.0) are both better choices for an Expo app.

**Module structure:**
- `expo-module.config.json` — Expo module config
- `src/index.ts` — TypeScript entry with `requireNativeModule<ThryftNativeModuleType>('ThryftNative')`
- `android/.../ThryftNativeModule.kt` — Kotlin module with `AsyncFunction` + `Constants`
- `ios/ThryftNativeModule.swift` — Swift module with `AsyncFunction` + `Constants`
- `frontend/src/platform/nativeModules.ts` — typed wrapper with JS fallbacks

**Autolinking:** The module is autodiscovered by Expo during prebuild — no manual `MainApplication.kt` registration, no config plugin needed for the source code.

**Research sources:** https://docs.expo.dev/workflow/customizing · https://docs.expo.dev/more/create-expo-module · https://nitro.margelo.com/docs/resources/comparison

### 39.5 Gap 6 — Native shared element transitions (CLOSED — infrastructure ready)

**Evidence:** `ENABLE_SHARED_ELEMENT_TRANSITIONS: true` in `package.json` enabled Reanimated's JS-driven (worklet-driven) shared element transitions. These run on the UI thread but still commit prop updates through the shadow tree every frame, causing jank on mid-range Android. Known bugs: #9945 (permanent SET disabling after cancelled close on iOS), #9944 (intermittent missing back-animations on Android).

**Fix:** Installed `react-native-shared-hero` 1.0.3 — a fully native (Swift + Kotlin) Fabric component library. It runs the entire measure→clone→animate→unhide cycle in native code with zero JS bridge passes and zero per-frame shadow tree commits. Router-agnostic (matches by `id` + `namespace`), works with Native Stack/modals/sheets/FlatList, and has interactive gesture returns on iOS.

**Wrapper component:** `frontend/src/components/SharedHeroWrapper.tsx` provides a typed API with graceful degradation (falls back to plain `View` on web or when the native module is not linked).

**Migration status:** The `ENABLE_SHARED_ELEMENT_TRANSITIONS` flag remains `true` because 18 files currently use `sharedTransitionTag`. The migration to `SharedHeroWrapper` is a surface-by-surface task:
- Replace `<SharedTransitionView sharedTransitionTag="photo-{id}">` with `<SharedHeroWrapper id={`photo-${id}`} namespace="gallery">`
- Replace `<SharedTransitionImage sharedTransitionTag="photo-{id}">` with `<SharedHeroWrapper id={`photo-${id}`} namespace="gallery">` wrapping an `Image`
- Once all 18 files are migrated, set `ENABLE_SHARED_ELEMENT_TRANSITIONS: false`

**Research sources:** https://github.com/maitrungduc1410/react-native-shared-hero · https://dev.to/expo/the-real-cost-of-react-native-animations-benchmarking-every-approach-3bej · https://reactnavigation.org/docs/shared-element-transitions/

### 39.6 Gap 4 — iOS native project (PARTIALLY CLOSED — platform limitation)

**Evidence:** No `ios/` directory. This is normal for Expo managed workflow — `expo prebuild` generates it on demand.

**Finding:** `expo prebuild --platform ios` cannot run on Windows (requires macOS for iOS project generation). The `app.json` iOS config is complete and correct: `bundleIdentifier`, Info.plist permissions (camera, photo library, Face ID, microphone, tracking), associated domains, and EAS Build config with iOS profiles.

**Resolution:** iOS native project is generated by EAS Build cloud workers (macOS). Run `eas build --profile development --platform ios` to generate and build in the cloud. Local iOS prebuild requires a macOS machine.

**No code change needed** — the config is correct; the platform limitation is a Windows development environment constraint, not a project gap.

### 39.7 Gap 5 — expo-video vs react-native-video v7 (TRACKED — not switchable today)

**Evidence:** `expo-video` 57.0.2 in dependencies. No `react-native-video`.

**Finding:** `react-native-video` v7 (Nitro-powered) benchmarks 19% faster first-frame (174ms vs 216ms) and 3× less FPS drop on player creation (2.25 vs 7.56). However, v7 is still in alpha as of August 2026 and not production-ready.

**Decision:** Tracked gap, not switched. When `react-native-video` v7 reaches stable, evaluate the migration. For now, `expo-video` is the correct choice for a production app.

### 39.8 Native code architecture decision matrix

For future agents needing to add custom native code, use this decision matrix (from 2026 research):

| Need | Approach | Why |
|------|----------|-----|
| General custom native code (SDK wrappers, config) | Local Expo Module (`modules/`) | Best DX, Swift+Kotlin, autolinked, no manual registration |
| Performance-critical native (image processing, sync calls) | Nitro Module | 15× faster than TurboModules, sync methods, Hybrid Objects |
| Hero/shared-element image transitions | `react-native-shared-hero` | Fabric-native, router-agnostic, zero JS-thread animation |
| Native project configuration (permissions, plist) | Config plugin (`with...` functions) | Idempotent, survives prebuild regeneration |
| Cross-platform C++ library to publish to npm | Codegen TurboModule | Zero dependencies, but requires ObjC++ on iOS |

**Do NOT** create raw Codegen TurboModules for ThryftVerse internal use. Use Expo Modules API or Nitro Modules instead.

---

## 40. FLAGSHIP UPGRADE — IMPLEMENTATION LEDGER (VALIDATION PENDING)

> **Status correction — 23 August 2026:** Sections 40–44 are a historical
> implementation inventory, not production or flagship sign-off. File presence
> is not evidence that a capability is live, reachable, correct, deployable, or
> visually accepted. Every `Closed`, `Complete`, and `Production` label in these
> sections means **implemented candidate — validation pending** until it passes
> `.devin/workflows/flagship-production-readiness-loop.md`. The binding
> completion rules in §§19, 22, 31, and 37 override the historical labels.
> See `.devin/reports/flagship-production-readiness-2026-08-23.md`.

This section documents intended implementations and architecture patterns. It does not claim runtime or release closure.

### 40.1 Original Gaps (1–7)

| Gap | Status | Implementation |
|-----|--------|----------------|
| Gap 1: Zero custom native code | Closed | Local Expo Module `modules/thryft-native/` scaffolded. `SharedHeroWrapper` component + `nativeModules.ts` graceful degradation layer. `react-native-shared-hero` installed for Fabric-native shared element transitions. |
| Gap 2: No `inlineRequires` in Metro | Closed | `metro.config.js` uses `getTransformOptions` with `inlineRequires: true` and `lazyImportBottomTabRoutes: true`. |
| Gap 3: No lazy screen loading | Closed (pre-existing) | `AppNavigator.tsx` already lazy-loads screens via `getComponent={() => require('...').default}`. |
| Gap 4: No iOS native project | Closed | `expo prebuild` for iOS handled by EAS Build in the cloud. `app.json` iOS config (bundleIdentifier, Info.plist permissions, associatedDomains) is correct. Windows dev machines cannot run `expo prebuild --platform ios` locally. |
| Gap 5: `expo-video` instead of Nitro video | Tracked | `expo-video` retained as the correct production choice. `react-native-video` v7 Nitro not yet stable. Re-evaluate when v7 ships. |
| Gap 6: JS-driven shared element transitions | Closed | `react-native-shared-hero` installed. Reanimated `ENABLE_SHARED_ELEMENT_TRANSITIONS` flag remains active — 18 files using `sharedTransitionTag` to be migrated to `react-native-shared-hero` incrementally. |
| Gap 7: Backend raw `pg` without type-safe query layer | Closed | Kysely installed. `src/lib/database-types.ts` and `src/lib/kysely.ts` created. `src/routes/collections.ts` migrated as the reference implementation. `db:types` script added to `package.json`. Remaining 518 `db.query` calls to be migrated incrementally. |

### 40.2 Platform Gaps (A–K)

| Gap | Package(s) | Implementation Location | Architecture Pattern |
|-----|-----------|------------------------|---------------------|
| A+B: PostHog analytics + feature flags | `posthog-react-native` | `src/analytics/PostHogProvider.tsx`, `src/analytics/track.ts`, `src/analytics/useFeatureFlag.ts` | Provider wraps app in `App.tsx`. Typed tracking functions integrate with existing `telemetry.ts`. Screen tracking via navigation state change. |
| D: MMKV storage | `react-native-mmkv` | `src/storage/mmkv.ts`, `src/storage/mmkvPersister.ts`, `src/storage/useMMKV.ts` | Four named instances: app, auth, cache, session. Typed hooks. React Query persister available. |
| E: React Query offline persistence | `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister` | `src/platform/server/ServerStateProvider.tsx`, `src/platform/server/queryClient.ts` | `ServerStateProvider` upgraded to `PersistQueryClientProvider` with AsyncStorage persister. `networkMode: 'offlineFirst'`, 7-day max age, 2s throttle. `useIsQueryOnline()` hook exported from `src/platform/server/`. |
| F: Victory Native charts | `victory-native`, `@shopify/react-native-skia` | `src/components/charts/` (CandleChart, LineChart, BarChart, ChartTooltip, types, index) | Skia-rendered charts with `useChartPressState` crosshair. Theme-aware colors from `DIRECTION_COLORS`. `LineDataRow` type with index signature for `CartesianChart` generic constraint. |
| G: Lottie/Rive animations | `lottie-react-native` | `src/components/animations/` (LottieAnimation, AnimatedEmptyState, AnimatedLoadingState, AnimatedSuccessState, animationAssets, index) | Component-based, no provider needed. Lottie JSON assets loaded via `animationAssets.ts`. |
| H: expo-av → expo-audio | `expo-audio` | 6 files migrated from `expo-av` to `expo-audio` | Hook-first API (`useAudioRecorder`, `useAudioPlayer`) and imperative API for recording. |
| I: MLKit on-device ML | `react-native-vision-camera-mlkit` | `src/platform/mlkit/` (useBarcodeScanner, useTextRecognizer, useImageLabeler, types, index) | Frame processor hooks for VisionCamera v5. `useImageLabeler` is a forward-compatible stub (MLKit v2 doesn't export image labeling API yet). Config plugin enables `barcodeScanning` + `textRecognition`. |
| J: react-native-share | `react-native-share` | `src/platform/share/` (ShareSheet, SocialShare, useShareListing, types, index) | `ShareSheet` component + `useShareListing` hook. Skia image composition for Instagram Story sharing. Config plugin registered. |
| K: Core Haptics | `react-native-haptic-feedback` | `src/platform/haptics/` (haptics.ts, useHaptics.ts, ahap patterns) | Core Haptics with AHAP patterns, rate limiting, `useHaptics` hook. Config plugin registered (no-op, CNG compatibility). |

### 40.3 Config plugins registered in `app.config.js`

```
'react-native-vision-camera-mlkit'  — barcodeScanning: true, textRecognition: true
'react-native-share'                — social sharing
'react-native-haptic-feedback'      — Core Haptics (CNG compatibility)
```

### 40.4 Provider hierarchy in `App.tsx`

```
AccessibilityPreferencesProvider
  ThemeProvider
    AppErrorBoundary
      GestureHandlerRootView
        SafeAreaProvider
          PostHogProvider
            KeyboardProvider
              ServerStateProvider (PersistQueryClientProvider + offlineFirst)
                RealtimeProvider
                  ToastProvider
                    BackendDataProvider
                      CurrencyProvider
                        SettingsPreferencesProvider
                          TabScrollProvider
                            NavigationContainer
```

### 40.5 Architecture patterns established

- **Graceful degradation**: All native modules use try/catch + feature availability checks (`isFeatureAvailable`, `NativeModules?.X`) so missing native modules never crash the app.
- **Offline-first React Query**: `networkMode: 'offlineFirst'` + AsyncStorage persistence + `refetchOnReconnect` + online-aware retry policy.
- **Type-safe backend queries**: Kysely with generated `Database` type. `db:types` script regenerates types from the database schema.
- **Local Expo Modules**: `modules/thryft-native/` for custom native code. Swift + Kotlin, autolinked, no manual registration.
- **Skia-rendered charts and share images**: Victory Native for charts, `@shopify/react-native-skia` for image composition in share module.
- **MMKV for fast key-value storage**: Four named instances (app, auth, cache, session) with typed hooks.
- **PostHog for analytics + feature flags**: Typed tracking functions, `useFeatureFlag` hooks, screen tracking via navigation integration.

---

## 41. PRODUCTION SERVICE ACTIVATION LEDGER (VALIDATION PENDING)

These production-service candidates require live provider, worker, security, and deployment evidence before activation can be considered complete.

### 41.1 Content Moderation — AWS Rekognition + Sightengine

| Component | Location | Status |
|-----------|----------|--------|
| Provider abstraction | `backend/api/src/lib/moderation/` | Pre-existing (interface + 3 implementations) |
| Moderation service | `backend/api/src/lib/moderation/moderationService.ts` | New — `moderateImageAsset()`, `moderateListingText()`, `moderateUserProfile()` |
| Moderation routes | `backend/api/src/routes/moderation.ts` | New — `POST /moderation/image/:assetId`, `POST /moderation/text`, `GET /moderation/status/:assetId`, `POST /moderation/review/:assetId` |
| Media pipeline wiring | `backend/api/src/routes/mediaAssets.ts`, `uploads.ts` | Wired — post-upload background moderation + double-check on processing completion |
| Listing text moderation | `backend/api/src/index.ts` | Wired — `moderateListingText()` called before listing creation; 422 on rejection, flag on review |
| AWS SDK | `@aws-sdk/client-rekognition` | Installed in backend |
| Config | `config.ts` | `MODERATION_PROVIDER`, `MODERATION_THRESHOLD`, `MODERATION_REVIEW_THRESHOLD` |

**Activation**: Set `MODERATION_PROVIDER=rekognition` + AWS credentials in production env.

### 41.2 Live Streaming — LiveKit WebRTC

| Component | Location | Status |
|-----------|----------|--------|
| Provider abstraction | `backend/api/src/lib/streaming/streamProvider.ts` | Pre-existing — `LiveKitStreamProvider` fixed with proper `AccessToken` from `livekit-server-sdk` |
| Streaming routes | `backend/api/src/routes/streaming.ts` | New — `POST /streaming/sessions`, `POST /streaming/sessions/:roomId/start`, `POST /streaming/sessions/:roomId/end`, `GET /streaming/sessions`, `GET /streaming/sessions/:roomId`, `POST /streaming/sessions/:roomId/token` |
| Database migration | `backend/api/src/db/migrations/113_live_shopping_sessions.sql` | New — `live_shopping_sessions` table |
| Frontend LiveKit hook | `frontend/src/platform/streaming/useLiveKitRoom.ts` | New — connection state, participant tracks, graceful degradation |
| Frontend API wiring | `frontend/src/services/liveShoppingApi.ts` | Updated — real backend calls when demo mode is off |
| SDKs | `livekit-server-sdk` (backend), `@livekit/react-native` + `livekit-client` (frontend) | Installed |

**Activation**: Set `LIVE_STREAM_PROVIDER=livekit` + `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` in production env.

### 41.3 Customer Support — Intercom

| Component | Location | Status |
|-----------|----------|--------|
| Platform abstraction | `frontend/src/platform/support/SupportProvider.tsx` | Pre-existing — `IntercomAdapter` implemented with lazy-loaded `@intercom/intercom-react-native` |
| Config plugin | `frontend/app.config.js` | Conditional `@intercom/intercom-react-native` plugin (only when `EXPO_PUBLIC_INTERCOM_APP_ID` is set) |
| Provider wiring | `frontend/App.tsx` | `SupportProvider` added to hierarchy: `PostHogProvider > SupportProvider > KeyboardProvider` |
| SDK | `@intercom/intercom-react-native` v10.6.0 | Installed |

**Activation**: Set `EXPO_PUBLIC_INTERCOM_APP_ID`, `EXPO_PUBLIC_INTERCOM_ANDROID_API_KEY`, `EXPO_PUBLIC_INTERCOM_IOS_API_KEY`, `EXPO_PUBLIC_INTERCOM_REGION` in EAS env. Run `expo prebuild`.

### 41.4 Search — Meilisearch Index Sync

| Component | Location | Status |
|-----------|----------|--------|
| Search adapter | `backend/api/src/lib/searchAdapter.ts` | Pre-existing — `MeilisearchSearchAdapter` with in-memory fallback |
| Index sync service | `backend/api/src/lib/searchSync.ts` | New — `syncListingsToSearchIndex()`, `syncSingleListing()`, `removeListingFromIndex()`, `configureSearchIndex()` |
| Sync script | `backend/api/src/scripts/searchSync.ts` | New — standalone reindex script (`npm run search:sync`) |
| Search routes | `backend/api/src/routes/search.ts` | New — `GET /search`, `GET /search/autocomplete`, `GET /search/health`, `POST /search/reindex` (admin) |
| Listing lifecycle wiring | `backend/api/src/index.ts` | Wired — fire-and-forget `syncSingleListing()` on create/update, `removeListingFromIndex()` on delete |
| Startup config | `backend/api/src/index.ts` | `configureSearchIndex()` called on startup |
| SDK | `meilisearch` | Installed in backend |

**Activation**: Meilisearch already in docker-compose. Set `MEILISEARCH_URL`, `MEILISEARCH_KEY`, `MEILISEARCH_INDEX` in production env. Run `npm run search:sync` for initial index population.

### 41.5 SMS Notifications — Twilio

| Component | Location | Status |
|-----------|----------|--------|
| Provider abstraction | `backend/api/src/lib/sms/smsProvider.ts` | Pre-existing — `TwilioSmsProvider` with raw Twilio REST API |
| SMS templates | `backend/api/src/lib/sms/templates.ts` | New — 5 typed templates (`ORDER_SHIPPED`, `ORDER_DELIVERED`, `ORDER_EXCEPTION`, `SECURITY_CODE`, `ACCOUNT_ALERT`), all < 160 chars |
| Notification service | `backend/api/src/lib/sms/notificationService.ts` | New — `notifyOrderShipped()`, `notifyOrderDelivered()`, `notifyOrderException()`, `sendSecurityCode()`, `sendAccountAlert()` |
| SMS routes | `backend/api/src/routes/sms.ts` | New — `POST /sms/send` (admin), `POST /sms/security-code` (rate-limited), `GET /sms/status/:messageId` (admin) |
| Order lifecycle wiring | `backend/api/src/index.ts` | Wired — fire-and-forget SMS on shipped/delivered/exception status changes in 3 order routes |

**Activation**: Set `SMS_PROVIDER=twilio` + `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` in production env.

### 41.6 Bundle Analysis — Expo Atlas + Hermes Profiling

| Component | Location | Status |
|-----------|----------|--------|
| Atlas scripts | `frontend/package.json` | New — `bundle:analyze` (Android), `bundle:analyze:ios`, `bundle:profile` |
| Hermes profiling plugin | `frontend/plugins/withHermesProfiling.js` | New — custom Expo config plugin for Android + iOS heap profiling infrastructure |
| Plugin registration | `frontend/app.config.js` | Conditional — activated via `EXPO_HERMES_PROFILING=true` env var |
| Documentation | `frontend/docs/BUNDLE_ANALYSIS.md` | New — Atlas usage, Hermes heap snapshots, performance targets, CI integration |

**Activation**: Run `npm run bundle:analyze` for Atlas report. Set `EXPO_HERMES_PROFILING=true` for heap profiling builds.

### 41.7 Architecture patterns established (Phase 2)

- **Fire-and-forget indexing/notifications**: All search indexing and SMS notifications use `void fn().catch(() => {})` to never block the request flow.
- **Lazy SDK loading**: `@aws-sdk/client-rekognition`, `livekit-server-sdk`, `meilisearch`, `@intercom/intercom-react-native` all use dynamic `import()` so missing packages never crash the app.
- **Typed SMS templates**: Template params are type-checked at compile time via `SmsTemplateParams` mapped type.
- **Moderation double-check**: Even when an external processor reports `approved`, the backend re-runs moderation via the configured provider to catch edge cases.
- **Conditional config plugins**: Intercom and Hermes profiling plugins are only registered when their env vars are set, following the Sentry plugin pattern.
- **Graceful degradation across all services**: Every service falls back to a no-op/mock when credentials are absent — the app always boots.

---

## 42. P1 PARITY IMPLEMENTATION LEDGER (VALIDATION PENDING)

These P1 candidates require live, native, migration, security, and release evidence before closure.

### 42.1 Navigation Architecture (N1, N2, N3, F1)

| Gap | Implementation | Location |
|-----|---------------|----------|
| N1: Per-tab stack navigators | 4 tab stack navigators (Home, Explore, Inbox, Profile) with independent history. Shared screens stay in root stack. | `src/navigation/tabStacks/*.tsx`, `AppNavigator.tsx`, `types.ts` |
| N2: Navigation state persistence | MMKV-backed persistence adapter. Throttled saves (500ms). Restores last tab on relaunch. Clears on logout. | `src/navigation/navigationPersistence.ts`, `AppNavigator.tsx` |
| N3: Tab bar hide-on-scroll | `AnimatedTabBar` component reads `tabBarVisible` SharedValue, animates `translateY` with Reanimated spring. | `TabNavigator.tsx` |
| F1: Lazy-load tab screens | All 4 tab screens use `getComponent={() => require(...)}` for lazy loading. | `TabNavigator.tsx` |
| P2: freezeOnBlur | `freezeOnBlur: true` on all tab screens. | `TabNavigator.tsx` |
| P2: formSheet presentation | `formSheet` on iOS for MakeOffer, WriteReview, Filter screens. | `AppNavigator.tsx`, `ExploreStack.tsx` |
| P2: Android predictive back | Documented — requires `android:enableOnBackInvokedCallback` in manifest. | `app.config.js` (noted) |

### 42.2 Form Primitives + Haptics (U1, U2)

| Gap | Implementation | Location |
|-----|---------------|----------|
| U1: AppSwitch | 52×32pt pill track, Reanimated spring thumb, haptic on toggle, accessible. | `src/components/primitives/AppSwitch.tsx` |
| U1: AppCheckbox | 24×24pt box, SVG check mark with spring scale, haptic, accessible. | `src/components/primitives/AppCheckbox.tsx` |
| U1: AppRadio | 24pt outer circle, 12pt inner dot spring, haptic, accessible. | `src/components/primitives/AppRadio.tsx` |
| U2: Android haptics | `ANDROID_IMPACT_ENABLED = true`. 50ms rate limiter on haptics hook. | `src/hooks/useHaptic.ts`, `src/platform/haptics/useHaptics.ts` |
| P2: AHAP support | 3 AHAP patterns (success, error, warning). `playAhapPattern()` with Android VibrationEffect mapping. | `src/platform/haptics/ahap/`, `ahapLoader.ts` |

### 42.3 Data Fetching Patterns (D1, D2, D3, D4)

| Gap | Implementation | Location |
|-----|---------------|----------|
| D1: Data prefetching | `usePrefetchListing`, `usePrefetchUserProfile`, `usePrefetchNextPage`, `usePrefetchOnScroll` hooks. 30s staleTime. | `src/hooks/usePrefetch.ts` |
| D2: MMKV persister | Replaced AsyncStorage persister with synchronous MMKV persister. 500ms throttle. | `ServerStateProvider.tsx`, `mmkvPersister.ts` |
| D3: Wishlist React Query | `useWishlist()`, `useToggleWishlist()` with optimistic update + rollback. Mirrors to Zustand. | `src/hooks/useWishlist.ts`, `useProductSocialState.ts` |
| D4: Server state hooks | 7 React Query hooks replacing Zustand+useEffect: inbox, bots, closet, support tickets, profile. | `src/hooks/useServerData.ts` |
| P2: Signal forwarding | `fetchJson` accepts `AbortSignal`, passed to `fetch()`. Auto-cancellation on inactive queries. | `src/lib/apiClient.ts` |
| P2: Zustand MMKV persist | Replaced AsyncStorage with MMKV `appStorage` for Zustand persist. | `src/store/useStore.ts` |

### 42.4 Backend Security (B1, B2, B3)

| Gap | Implementation | Location |
|-----|---------------|----------|
| B1: JWT EdDSA | Ed25519 key pair signing via `jose`. Backward compatible (falls back to HS256). | `src/lib/auth.ts`, `config.ts` |
| B2: Rate-limit headers | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After` on all 429s. | `src/index.ts` |
| B3: Per-endpoint rate limits | 5 write routes: listings (20/min), bids (30/min), messages (60/min), offers (20/min), disputes (5/min). | `src/index.ts` |
| P2: Refresh token reuse detection | Redis-backed SHA-256 token tracking. Invalidates all sessions on reuse. | `src/lib/tokenRefresh.ts`, `src/index.ts` |
| P2: Circuit breakers | `createCircuitBreaker()` with closed/open/half-open states. `CircuitBreakerOpenError`. | `src/lib/circuitBreaker.ts` |

### 42.5 Backend Scaling (B5-B10)

| Gap | Implementation | Location |
|-----|---------------|----------|
| B5: PgBouncer | Docker service + opt-in connection routing. `POOL_MODE=transaction`. Pool cap 10 when enabled. | `docker-compose*.yml`, `src/db/pool.ts`, `config.ts` |
| B6: Redis realtime sequence | `getNextSequence()` via Redis `INCR`. In-memory fallback on Redis failure. | `src/lib/realtimeSequence.ts`, `redisClient.ts`, `realtime.ts` |
| B7: Per-topic pub/sub | `realtime:pubsub:{topic}` channels. Topic ref counting. Wildcard `PSUBSCRIBE` support. | `src/lib/realtime.ts` |
| B8: Worker extraction | Standalone worker process entry point. Graceful shutdown. Docker worker service. | `src/workers/index.ts`, `docker-compose.production.yml` |
| B9: Dead-letter queue | DLQ queues with 7-day retention. `moveToDlq()` on exhausted retries. `dlqMonitor.ts` for stats/replay/purge. | `src/lib/queues.ts`, `dlqMonitor.ts` |
| B10: Keyset pagination | `WHERE id > $lastId ORDER BY id LIMIT $batchSize` — O(log n) per batch. | `src/lib/searchSync.ts` |

### 42.6 Infrastructure Hardening (I1-I5)

| Gap | Implementation | Location |
|-----|---------------|----------|
| I1: OTA staged rollout | 5-stage pipeline: staging → canary 1% → 10% → 50% → 100%. Manual approval gates. Rollback workflow. | `.github/workflows/build-and-deploy.yml` |
| I2: OTA code signing | Conditional on `EXPO_PUBLIC_OTA_CODE_SIGNING_KEY`. Uncommented and env-configured. | `frontend/app.config.js` |
| I3: Android network security | `network_security_config.xml` with CT enforcement. `backup_rules.xml` + `data_extraction_rules.xml` excluding MMKV/SQLite. | `frontend/android/app/src/main/res/xml/` |
| I4: Automated backups | Node.js + bash backup scripts. AES-256-CBC encryption. 30-day S3 retention. Docker backup sidecar. Webhook alerts. | `backend/scripts/`, `docker-compose.production.yml` |
| I5: Placeholder credentials | Removed from `eas.json`. Replaced with env var references + `_secrets` documentation. | `frontend/eas.json` |
| P2: TLS termination | Caddy reverse proxy with automatic HTTPS. HSTS + COOP/COEP/CORP security headers. | `backend/Caddyfile`, `docker-compose.production.yml` |
| P2: Container hardening | `read_only`, `no-new-privileges`, `cap_drop: ALL`, tmpfs, log limits, resource limits on all services. | `docker-compose.production.yml` |

### 42.7 Architecture patterns established (Phase 3)

- **Per-tab stack isolation**: Each tab owns its navigation history; tab switches preserve per-tab state. Shared screens remain in root stack for cross-tab navigation.
- **MMKV everywhere**: React Query persister, Zustand persist, and navigation state all use MMKV's JSI-direct synchronous path — zero AsyncStorage bridge overhead.
- **Optimistic mutations with rollback**: Wishlist toggles update cache instantly, rollback on error. Haptic feedback on every toggle.
- **Prefetch-on-interaction**: `onPressIn` triggers prefetch with 30s staleTime so navigated screens are already cached.
- **EdDSA JWT with HS256 fallback**: Production uses Ed25519 (8x faster, no shared secret); dev falls back to HS256 for zero-config.
- **Redis-backed realtime sequence**: Atomic `INCR` for sequence numbers. Instance restart no longer resets sequence to 0.
- **Per-topic Redis pub/sub**: O(nodes × subscribed_topics) fan-out instead of O(nodes × all_events).
- **Circuit breakers for external services**: Closed/open/half-open state machine prevents cascading failures.
- **DLQ with 7-day retention**: Failed jobs isolated from main queue. Replay and purge utilities for ops.
- **Keyset pagination for batch sync**: O(log n) per batch instead of O(n²) OFFSET pagination.
- **Staged OTA with approval gates**: 1% → 10% → 50% → 100% with manual approval between stages. Rollback workflow.
- **Defense-in-depth container security**: read_only, no-new-privileges, cap_drop ALL, log limits, resource limits.

---

## 43. P2 PARITY IMPLEMENTATION LEDGER (VALIDATION PENDING)

These P2 candidates require live, native, migration, security, and release evidence before closure.

### 43.1 Frontend Performance + Consolidation

| Gap | Implementation | Location |
|-----|---------------|----------|
| ProMotion 120fps | `CADisableMinimumFrameDurationOnPhone: true` in iOS infoPlist. | `app.config.js` |
| Reanimated 4 CSS Transitions | `CssTransition` component using `createCSSAnimatedComponent(View)`. Native UI thread transitions. | `src/components/animations/CssTransition.tsx` |
| Production perf telemetry | 1% sampling in production. PostHog integration. `useScreenPerformance()` hook. `__DEV__` gate removed. | `performanceMonitor.ts`, `frameTracker.ts`, `useScreenPerformance.ts` |
| Dual color source | `colors.ts` exports `DARK_COLORS`/`LIGHT_COLORS`. `ThemeContext.tsx` imports from it. 109 lines of duplicates removed. | `colors.ts`, `ThemeContext.tsx` |
| Dual MMKV | `platform/storage/mmkv.ts` re-exports from `storage/mmkv.ts`. Single canonical implementation. | `platform/storage/mmkv.ts` |

### 43.2 Deep Links + Primitives + Bundle

| Gap | Implementation | Location |
|-----|---------------|----------|
| Deep link coverage | Expanded from 36 to 61 screens (37.4%, exceeding 30% target). All lowercase, hyphenated patterns. | `src/navigation/linking.ts` |
| AppHeader primitive | Unified header with `title`, `subtitle`, `leftAction`, `rightAction`, `variant` (default/large/compact), `onBack`. Accessible. | `src/components/primitives/AppHeader.tsx` |
| AppEmptyState primitive | Unified empty state with `icon`, `title`, `description`, `action`, `variant` (default/compact/illustrated). FadeIn entrance. | `src/components/primitives/AppEmptyState.tsx` |
| Bundle lazy-loading | Skia imports in `useShareListing.ts` converted to dynamic `import()` with cached module. LiveKit/VisionCamera already dynamic. | `src/platform/share/useShareListing.ts` |

### 43.3 Backend Performance + Search

| Gap | Implementation | Location |
|-----|---------------|----------|
| Materialized views | 4 views: `mv_seller_analytics`, `mv_user_engagement`, `mv_category_performance`, `mv_auction_analytics`. CONCURRENTLY refresh. | `migrations/114_materialized_views.sql`, `materializedViews.ts` |
| LISTEN/NOTIFY | Triggers on `listings`, `users`, `orders`. Dedicated `pg.Client` for LISTEN. Cache invalidation channel. | `migrations/116_listen_notify.sql`, `listenNotify.ts` |
| N+1 query fixes | `batchLoadByIds`, `batchLoadRelation`, `batchLoadTopBidsByAuction`, `batchOrdersWithOpenDisputes`, `batchLoadSellerPayableBalances`. | `n1QueryFixes.ts` |
| Vector/semantic search | `semanticSearch()` using Meilisearch hybrid search. Falls back to text search. `POST /search/semantic` route. | `vectorSearch.ts`, `routes/search.ts` |
| Table partitioning | Monthly RANGE partitioning for `analytics_events`, `notifications`, `audit_logs`. Auto-partition function. | `migrations/115_table_partitioning.sql`, `partitionManager.ts` |

### 43.4 Backend Realtime + Rate Limiting

| Gap | Implementation | Location |
|-----|---------------|----------|
| Presence registry | Redis-backed with TTL. `setPresence`, `removePresence`, `getOnlineUsers`, `isUserOnline`, `getSubscribedTopics`. Per-topic sets. | `presenceRegistry.ts`, `migrations/117_presence_registry.sql` |
| Sliding window rate limiting | Redis sorted sets for true sliding window. `createSlidingWindowLimiter()`. In-memory fallback. Fail-open. | `slidingWindowRateLimit.ts` |

### 43.5 Infrastructure Compliance + Monitoring

| Gap | Implementation | Location |
|-----|---------------|----------|
| SSL pinning | `enforce: true` for production domains. Primary + backup pins. SPKI hash generation docs. iOS ATS config. | `network_security_config.xml`, `app.config.js` |
| Privacy policy URL | `privacyPolicyUrl` and `termsOfServiceUrl` in app config + `extra`. | `app.config.js` |
| CCPA endpoint | `GET /compliance/privacy-policy`, `GET /compliance/data-categories`, `POST /compliance/ccpa/request-data`, `POST /compliance/ccpa/request-deletion`, `POST /compliance/ccpa/opt-out-sale`, `GET /compliance/ccpa/status`. | `routes/compliance.ts`, `migrations/118_ccpa_compliance.sql` |
| Uptime monitoring | `checkHealth()`, `sendHeartbeat()`, `startHeartbeatLoop()`. GitHub Actions health check every 5 min. Slack alerts. | `uptimeMonitor.ts`, `.github/workflows/health-check.yml` |
| SLO tracking | `SloTracker` class. 99.9% SLO. Error budget tracking. Redis-backed 30-day window. In-memory fallback. | `sloTracker.ts` |
| Fingerprint build-vs-OTA | Documented — EAS auto-generates fingerprints in SDK 57. | `app.config.js` (JSDoc) |

### 43.6 Architecture patterns established (Phase 4)

- **CSS Transitions for simple state**: Reanimated 4's `createCSSAnimatedComponent` runs on native UI thread — no worklet overhead for opacity/color changes.
- **1% production sampling**: Performance telemetry sampled at 1% in production to avoid overhead, 100% in dev.
- **Single source of truth**: Colors and MMKV both consolidated to one canonical implementation. No more dual sources.
- **Materialized views with CONCURRENTLY**: Analytics dashboards query pre-aggregated views. Unique indexes enable non-locking refresh.
- **LISTEN/NOTIFY cache invalidation**: PostgreSQL triggers emit NOTIFY on data changes. Redis cache can be invalidated in real-time.
- **Batch query pattern**: `WHERE id = ANY($1::text[])` replaces N+1 loops. 5 specific N+1 queries identified for migration.
- **Hybrid semantic search**: Meilisearch hybrid search combines text + vector embeddings. Falls back to text search.
- **Monthly table partitioning**: Time-series tables partitioned by month. Auto-partition manager creates future partitions.
- **Redis sorted set sliding window**: True sliding window rate limiting via `ZADD`/`ZREMRANGEBYSCORE`/`ZCARD`. No fixed-window bursts.
- **Presence registry with TTL**: 30-second TTL auto-expires stale presence. Heartbeat refreshes. Per-topic sets for targeted delivery.
- **CCPA compliance**: Full CCPA endpoint suite. Data export, deletion, opt-out sale. Data categories disclosure.
- **SLO error budgets**: 99.9% SLO with error budget tracking. Redis-backed sliding window. Automatic in-memory fallback.

---

## 44. P3 ENHANCEMENT IMPLEMENTATION LEDGER (VALIDATION PENDING)

These P3 candidates are forward-looking implementations, not evidence that the production system has reached current platform parity.

### 44.1 Frontend Primitives (P3)

| Gap | Implementation | Location |
|-----|---------------|----------|
| Date picker | Cross-platform `AppDatePicker` with `@expo/ui` lazy-load + wheel fallback. | `primitives/AppDatePicker.tsx` |
| Story progress bar | `AppStoryProgress` with Reanimated animated segments. | `primitives/AppStoryProgress.tsx` |
| Tooltip | `AppTooltip` with measure-based positioning, auto-flip, fade entrance. | `primitives/AppTooltip.tsx` |
| Popover | `AppPopover` with auto-positioning, backdrop dismiss, spring entrance. | `primitives/AppPopover.tsx` |
| ThumbHash | Full TypeScript decoder + Skia renderer. Falls back to solid color. | `primitives/ThumbHash.tsx` |
| M3 Expressive tokens | Android 16 (API 36+) color roles, motion springs, shape tokens. | `theme/m3ExpressiveTokens.ts` |
| iOS 26 scroll-edge tokens | Scroll-edge effect styles (solid/translucent/transparent). | `theme/ios26ScrollEdgeTokens.ts` |
| InteractionManager | `useRunAfterInteractions`, `useInteractionManagerState` hooks. | `hooks/useInteractionManager.ts` |

### 44.2 Frontend Data + Deep Linking (P3)

| Gap | Implementation | Location |
|-----|---------------|----------|
| queryOptions() helper | 7 type-safe `queryOptions()` factories with signal forwarding. | `hooks/useQueryOptions.ts` |
| refetchOnFocus | `useRefetchOnFocus`, `useRefetchOnFocusMultiple` with 5s debounce. | `hooks/useRefetchOnFocus.ts` |
| Deferred deep linking | Branch/AppsFlyer adapter with graceful degradation. Provider via env var. | `platform/deepLinking/deferredDeepLinking.ts` |

### 44.3 Backend Data + Search (P3)

| Gap | Implementation | Location |
|-----|---------------|----------|
| UUID v7 | Pure TS `generateUuidV7()` + PostgreSQL `uuid_v7()` function. | `lib/uuidV7.ts`, `migrations/119_uuid_v7.sql` |
| updated_at triggers | Generic trigger function + auto-creation for all tables with `updated_at`. | `migrations/120_updated_at_triggers.sql` |
| Row-Level Security | RLS on 5 user-owned tables. `current_setting('app.current_user_id')`. | `migrations/121_row_level_security.sql` |
| Postgres tuning | `ALTER SYSTEM SET` for shared_buffers, work_mem, etc. | `migrations/122_postgres_tuning.sql` |
| Meilisearch typo/synonyms | Typo tolerance config + fashion/brand/condition synonyms. | `lib/meilisearchConfig.ts` |
| Meilisearch search-only key | `createMeilisearchSearchOnlyKey()` — scoped search key. | `lib/meilisearchConfig.ts` |

### 44.4 Backend Security + Queues (P3)

| Gap | Implementation | Location |
|-----|---------------|----------|
| API key auth | `createApiKey`, `verifyApiKey`, `authenticateApiKey`. SHA-256 hashed. | `lib/apiKeyAuth.ts`, `migrations/123_api_keys.sql` |
| Permission scopes | 14 scopes, `hasScope` with wildcards, `requireScopes` preHandler. | `lib/permissionScopes.ts` |
| Admin audit logging | `logAdminAction` (fire-and-forget), `queryAuditLogs` with filters. | `lib/auditLog.ts`, `migrations/124_audit_logs.sql` |
| Admin audit routes | `GET /admin/audit-logs`, `GET /admin/audit-logs/stats`. | `routes/adminAudit.ts` |
| WebSocket rate limiting | Redis sorted set limiter. 20/IP/min, 5/user/min. In-memory fallback. | `lib/websocketRateLimit.ts` |
| Job priorities | 5 priority levels (payout=9, image=7, push=5, email=3, search=2). | `lib/queuePriorities.ts` |
| Job rate limits | Per-queue rate limits (push=100/s, email=10/s, payout=1/s). | `lib/queuePriorities.ts` |
| Scheduled repeatable jobs | 6 repeatable jobs (auction, escrow, payout, search, analytics, backup). | `lib/queuePriorities.ts` |

### 44.5 Infrastructure + CI/CD (P3)

| Gap | Implementation | Location |
|-----|---------------|----------|
| CI gates | 11-check workflow: TypeScript, ESLint, bundle-size, visual gates, Maestro, tests, SBOM. | `.github/workflows/ci-gates.yml` |
| Release train channels | Development → staging → production with approval gates. | `.github/workflows/release-train.yml` |
| Secrets rotation | Monthly check script. Lists all secrets, alerts if > 90 days. | `backend/scripts/secrets-rotation.sh` |
| DR runbook | 8 scenarios: DB, Redis, API, S3, search, region, corruption, security. | `backend/scripts/dr-runbook.md` |
| COPPA age gate | `AgeGate` component with soft/hard mode. MMKV verification storage. | `platform/compliance/AgeGate.tsx` |
| AI transparency | `AITransparencyDisclosure` for EU AI Act. Feature list + opt-out. | `platform/compliance/AITransparencyDisclosure.tsx` |
| SDK privacy manifest | `PrivacyManifest` listing all third-party SDKs + data practices. | `platform/compliance/PrivacyManifest.tsx` |
| RUM dashboard | `getRumMetrics`, `correlatePostHogSentry`, `getRumSummary`. | `platform/monitoring/rumDashboard.ts` |
| SBOM generation | CycloneDX format for frontend + backend. | `frontend/scripts/generate-sbom.sh` |
| Dead dep cleanup | Safe removal of `@react-navigation/stack` + `ElasticsearchSearchAdapter`. | `frontend/scripts/cleanup-dead-deps.sh` |

### 44.6 Architecture patterns established (Phase 5)

- **ThumbHash over BlurHash**: Smaller hashes, full TypeScript decoder, Skia rendering.
- **Platform-specific token systems**: M3 Expressive (Android 16) and iOS 26 scroll-edge tokens with availability checks.
- **InteractionManager deferral**: Heavy work deferred until after navigation animations.
- **queryOptions() factories**: Type-safe, reusable query configs with signal forwarding.
- **Deferred deep linking**: Branch/AppsFlyer adapter with provider selection via env var.
- **UUID v7**: Time-ordered UUIDs for better index locality. Pure TS + PostgreSQL function.
- **Row-Level Security**: Database-enforced data isolation. `SET LOCAL app.current_user_id` per connection.
- **API key auth with scopes**: SHA-256 hashed keys. Fine-grained scope system with wildcards.
- **Admin audit trail**: Fire-and-forget logging of all admin actions. Partitioned by month.
- **WebSocket rate limiting**: Redis sorted set connection limiting per IP and per user.
- **Job priorities + repeatable schedules**: 5 priority levels, per-queue rate limits, 6 scheduled jobs.
- **CI gates**: 11 automated checks on every PR. SBOM generation for supply chain security.
- **Release train**: Multi-channel release pipeline with approval gates.
- **Compliance suite**: COPPA age gate, EU AI Act transparency, SDK privacy manifest.
- **RUM + PostHog-Sentry correlation**: Real user monitoring with error correlation.

---

## 38. BUILD & VERIFICATION COMMANDS

### Backend API (`backend/api/`)

```bash
# Typecheck (PowerShell — npx is blocked by execution policy)
node node_modules/typescript/bin/tsc --noEmit

# Run tests
node node_modules/vitest/vitest.mjs run --dir src
```

### Frontend (`frontend/`)

```bash
# Typecheck
node node_modules/typescript/bin/tsc --noEmit

# Run tests
npm test

# CI gate checks
npm run check:ssl-pins          # SSL pin validation (placeholder hash guard)
npm run check:residue           # Production residue check
npm run check:bundle-size       # Bundle size budget
npm run check:visual-gates      # Visual release gates
npm run check:animated-scroll   # Animated scroll usage
npm run lint:design-tokens      # Design token lint

# Full phase verification
npm run verify:phase
```

### SSL Pin Validation

```bash
# Non-production (warnings only, exit 0)
node scripts/validate-ssl-pins.mjs

# Production mode (fails on placeholder hashes, exit 1)
EXPO_PUBLIC_ENVIRONMENT=production EXPO_PUBLIC_SSL_PINNING_ENABLED=true node scripts/validate-ssl-pins.mjs
```

### Fastify Plugin Decomposition Pattern

Route files in `backend/api/src/routes/` follow this pattern:

```typescript
// routes/example.ts
type ExampleRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  // ... other dependencies
};

export const registerExampleRoutes = ({
  app,
  db,
}: ExampleRouteDependencies) => {
  app.get('/example', async (request, reply) => { ... });
};
```

In `index.ts`, import and register:
```typescript
import { registerExampleRoutes } from './routes/example.js';
// ...
registerExampleRoutes({ app, db });
```
