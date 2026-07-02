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

## 24. CORE PRINCIPLES

- The product is the native mobile application. Every decision serves the user's experience.
- Fix at the source-of-truth, not at the symptom layer.
- Ultra-deep system research before acting. Diagnose end-to-end.
- When changing a mechanic, align all directly coupled layers.
- Push every UI/UX task to maximum quality. Exceed references, don't photocopy them.
- Composition over decoration. Hierarchy over ornament.
- Motion is restrained and purposeful, not decorative.
- Truthful UI always. No fabricated success, data, or capability.
- Preserve working features. Elevate, don't strip.
- The device render is the source of truth. Iterate against it.
- The improvement must be obvious at thumbnail size.
- The correct outcome is a richer, clearer, more coherent, and more trustworthy native product.
