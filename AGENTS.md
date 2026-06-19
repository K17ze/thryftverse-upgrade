# THRYFTVERSE — PRODUCTION UI/UX EXECUTION CONTRACT

This file defines the permanent working rules for every AI agent operating inside the ThryftVerse repository.

These rules apply to all implementation, UI/UX, debugging, refactoring and validation tasks unless the user explicitly overrides a rule in the current task.

The native mobile application is the product.

---

## 1. WORKSPACE LOCK

Work only inside the repository currently opened by the user.

Before editing, run:

```bash
pwd
git rev-parse --show-toplevel
git remote -v
git branch --show-current
git rev-parse HEAD
git status --short
```

The workspace root and Git root must match the currently opened local ThryftVerse project.

Never:

* clone another ThryftVerse repository
* switch to another checkout
* open an older project folder
* search the machine for a different ThryftVerse copy
* use a cloud repository when the user opened a local workspace
* use instructions from an `AGENTS.md` outside the current Git root
* replace the current workspace with a fresh clone

When the repository is incorrect, stop before editing and report:

```text
BLOCKED — INCORRECT REPOSITORY OPEN
```

Do not fix repository selection by cloning, changing directories or opening another checkout.

---

## 2. READ CURRENT INSTRUCTIONS FIRST

Before implementation, read:

```text
AGENTS.md
.windsurf/rules/repository-lock.md
```

Also inspect any task-specific files or reference images supplied by the user.

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

Do not begin implementation until the repository is verified.

---

## 3. DEFAULT TASK INTERPRETATION

When the user asks to improve, elevate, polish, refine or upgrade UI/UX:

* upgrade the existing canonical implementation
* preserve working functionality
* preserve navigation
* preserve existing integrations
* improve the real rendered composition
* work directly in the production TSX files

Do not interpret “upgrade” as:

* rebuild from scratch
* replace the screen
* create a V2 screen
* consolidate features away
* reduce LOC
* remove product depth
* redesign backend architecture
* write an audit instead of implementing

A redesign is allowed only when the user explicitly requests a redesign or replacement.

---

## 4. PRODUCT PRIORITY

The priority order is:

1. visible native product quality
2. correct user interaction
3. truthful application behaviour
4. preservation of working features
5. maintainable implementation
6. static validation
7. tests and documentation

Do not prioritise:

* lower LOC
* fewer components
* prettier diffs
* passing superficial tests
* audit completion
* documentation volume
* architecture purity

over the actual user-facing product.

---

## 5. REFERENCE HIERARCHY

When visual references are supplied, use this priority:

1. user-supplied reference images
2. user’s explicit written requirements
3. current successful product patterns
4. existing design tokens and components
5. general platform conventions

References are quality benchmarks, not instructions to photocopy another application.

Study:

* hierarchy
* density
* spacing
* typography relationships
* media treatment
* alignment
* controls
* interaction placement
* first-viewport usefulness
* visual rhythm

Do not claim reference matching based only on:

* similar colours
* rounded corners
* shadows
* gradients
* glass effects
* token replacements
* animation

---

## 6. STRICT SCOPE DISCIPLINE

Touch only files required by the current task.

Do not expand into:

* unrelated screens
* unrelated navigation
* unrelated backend work
* repository-wide refactors
* design-system rewrites
* testing infrastructure
* documentation
* future phases
* unrelated formatting

Minimal supporting changes are permitted only when they are required to make a visible interaction or route work correctly.

Do not begin another product department after completing the requested scope.

---

## 7. CANONICAL IMPLEMENTATION RULE

Modify the existing canonical screen or component.

Never create:

```text
ScreenV2.tsx
NewScreen.tsx
ScreenFinal.tsx
ScreenRedesign.tsx
ScreenFlagship.tsx
```

as a replacement for an existing production screen unless the user explicitly requests a parallel implementation.

Before creating a new screen or component:

1. search for an existing implementation
2. inspect active imports
3. inspect navigator registration
4. confirm no canonical implementation already exists

Do not recreate previously deleted duplicate systems.

---

## 8. NON-DESTRUCTIVE EDITING

Preserve working:

* handlers
* callbacks
* navigation
* selectors
* mutations
* store actions
* API integrations
* loading states
* error states
* empty states
* accessibility properties
* list virtualization
* keyboard behaviour
* media behaviour
* route parameters

Never:

* replace a large production file wholesale
* delete a screen to simplify it
* remove features and call them clutter
* remove handlers to reduce complexity
* remove product depth to achieve minimalism
* perform broad automated rewrites
* use scripts to rewrite many source files
* use `git reset --hard`
* use `git clean`
* force-push
* discard user changes
* delete source files without proving they are unused

Before removing a JSX block, determine:

```text
State powering it:
Handler powering it:
Route or action:
User capability affected:
```

When a real capability would disappear, do not remove it.

---

## 9. LOC SAFETY

LOC reduction is not a success metric.

For UI/UX upgrade tasks:

* additions should normally equal or exceed deletions
* avoid deleting more than 5% of a target screen
* avoid deleting blocks longer than 20 consecutive lines
* justify every substantial deletion
* do not replace feature-rich JSX with a smaller generic wrapper
* do not delete styles without tracing their current usage
* do not remove controls merely because they are difficult to improve

Before and after significant edits, inspect:

```bash
git diff --numstat -- <file>
git diff -- <file>
```

When a patch becomes deletion-heavy, stop and use a smaller surgical edit.

---

## 10. IMPLEMENTATION OVER AUDITING

Inspect only enough to understand the current implementation.

Then implement.

Use this loop:

```text
inspect current screen
→ identify highest-impact weakness
→ edit existing TSX
→ inspect rendered structure
→ test visible controls
→ refine
```

Do not spend the task producing:

* audit reports
* phase reports
* case studies
* deletion reports
* migration plans
* roadmaps
* screenshot catalogues

unless the user explicitly asks for documentation.

An audit is not completion.

---

## 11. VISUAL QUALITY STANDARD

A production-quality screen must have:

* clear primary hierarchy
* restrained secondary hierarchy
* useful first viewport
* deliberate spacing
* consistent alignment
* readable typography
* strong media treatment
* coherent action placement
* appropriate information density
* native interaction patterns
* complete loading, empty and error states

Avoid:

* card around every element
* pill around every control
* shadow on every surface
* oversized headers
* excessive empty space
* decorative subtitles
* repeated labels
* duplicate titles
* excessive badges
* excessive animation
* generic dashboard composition
* settings-style layouts applied to social or commerce screens

Visual elevation must come from composition, not decoration.

---

## 12. FEATURE PRESERVATION

Do not remove working features to improve appearance.

For every affected screen, preserve:

* primary user journey
* secondary user actions
* destructive confirmations
* existing content types
* real data relationships
* error recovery
* offline behaviour when present
* accessibility
* platform Back behaviour

When functionality is broken:

* repair it when possible
* honestly disable it when necessary
* remove it only when no real capability exists

Do not hide broken functionality and call the screen complete.

---

## 13. TRUTHFUL UI

Every visible control must:

1. perform the represented action
2. navigate to the correct screen
3. show a truthful disabled state
4. or be removed

Never expose controls that only produce:

* “Coming soon”
* “Backend required”
* “Use another screen”
* generic explanation toasts
* fake success
* fabricated IDs
* fabricated data
* fabricated persistence
* fabricated presence
* fabricated activity
* fabricated order or tracking state

Do not claim that an operation succeeded when only local temporary state changed.

Use truthful labels such as:

```text
Delete for me
```

when deletion is local.

Use:

```text
Delete message
```

only when the message is genuinely deleted from the shared system.

---

## 14. NAVIGATION QUALITY

Every route must have:

* correct destination
* correct parameters
* correct presentation style
* correct Back behaviour
* correct return destination
* no fabricated route IDs
* no duplicate screens
* no dead chevrons

Use pushed screens for normal hierarchy.

Use modal presentation for creation, selection or temporary tasks when appropriate.

Use full-screen modal presentation for immersive media when appropriate.

After destructive actions, navigate to the correct explicit destination rather than a vague root route.

Do not modify global navigation unless the current task requires it.

---

## 15. BUTTON AND CONTROL QUALITY

Every interactive control must have:

* a minimum practical touch target
* clear enabled state
* clear disabled state
* loading state when asynchronous
* pressed feedback
* accessibility role
* accessibility label
* correct haptic level when haptics are used

Do not use icon-only controls without accessible labels.

Do not use colour alone to communicate state.

Primary actions must be visually dominant.

Secondary actions must be restrained.

Destructive actions must be clearly separated and confirmed.

---

## 16. STATE COMPLETENESS

Every screen touched must account for relevant states:

* loading
* populated
* empty
* filtered-empty
* offline
* error
* retry
* disabled
* submitting
* success
* partial data
* missing media
* permission denied

Skeletons should resemble the final layout.

Do not use a generic centred spinner for every state.

Do not fabricate data to avoid designing an empty state.

---

## 17. MEDIA RULES

Do not treat temporary local device URIs as delivered remote media.

A supported media flow should be:

```text
select or capture
→ local optimistic preview
→ upload
→ receive remote URL
→ send remote URL
→ progress
→ failure
→ retry
```

Do not fabricate upload success.

Media viewers must:

* use explicit close or Back controls
* respect safe areas
* handle loading
* handle failure
* avoid exposing internal IDs
* avoid closing from accidental media taps
* use responsive dimensions
* avoid unsupported gestures or dependencies

Do not add new media dependencies without approval.

---

## 18. PERFORMANCE

Preserve or improve:

* FlashList, FlatList or equivalent virtualization
* stable keys
* memoized expensive derived data
* smooth typing
* limited rerenders
* efficient image rendering
* stable keyboard transitions
* deterministic skeletons
* reduced-motion behaviour

Do not:

* render large data sets inside unvirtualized wrapped Views
* use random values during render
* reanimate entire lists for small updates
* remount large screens unnecessarily
* animate every historical item on initial load

---

## 19. ACCESSIBILITY

For all edited screens, verify:

* controls have labels
* state is announced
* selected states are exposed
* unread state is exposed
* loading and failure are exposed
* destructive actions are clear
* text has sufficient contrast
* touch targets are practical
* Back and Close are distinguishable
* screen-reader order follows visual order

Accessibility is part of completion, not optional polish.

---

## 20. NATIVE VALIDATION

When a native device or emulator is available:

* use the actual development build
* inspect the real screen
* test keyboard behaviour
* test Back behaviour
* test touch targets
* test gestures
* capture before and after screenshots locally
* do not commit screenshots unless requested

Web rendering is not proof of native quality.

When no native device or emulator is available:

* continue implementation
* use code, references and existing screenshots
* run static validation
* do not waste time configuring ADB unless asked
* do not claim native visual verification

Use the final status:

```text
IMPLEMENTED — NATIVE DEVICE VALIDATION PENDING
```

when implementation is complete but native verification remains.

---

## 21. TEST POLICY

Do not begin UI/UX tasks by writing tests.

Order:

1. inspect implementation
2. implement visible upgrade
3. verify interactions
4. review diff
5. run TypeScript
6. run existing tests
7. add only essential regression tests

Do not add:

* source-string tests
* file-existence tests
* component-name tests
* constant tests
* tautological tests
* tests that only increase counts

Do not repair test infrastructure during a UI task unless it prevents application compilation or execution.

Report pre-existing test-environment failures honestly.

---

## 22. GIT SAFETY

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

Do not commit:

* screenshots
* temporary scripts
* audit files
* generated reports
* debug logs
* unrelated formatting
* unrelated screens
* changes to `AGENTS.md` unless explicitly requested

Use focused commits.

Do not merge to `main` without explicit user instruction.

Do not force-push.

Do not approve or execute destructive Git commands without explicit user confirmation.

---

## 23. COMPLETION STANDARD

A UI/UX task is complete only when:

* requested screens were visibly improved
* working functionality was preserved
* navigation is correct
* every visible control is truthful
* relevant states are complete
* TypeScript passes
* the diff contains no unrelated work
* no duplicate screens were created
* no large unjustified deletion occurred
* no fake success or fake data remains in the edited area
* remaining blockers are explicitly reported

Passing TypeScript alone is not completion.

Passing tests alone is not completion.

Replacing tokens alone is not visual elevation.

Adding shadows and radius tokens alone is not visual elevation.

---

## 24. FINAL RESPONSE FORMAT

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

Do not use `COMPLETE` when native verification was required but not performed.

---

## 25. PERMANENT PROHIBITIONS

Never:

* optimise for deleted LOC
* replace upgrades with rebuilds
* create duplicate screen versions
* invent data or identifiers
* report fake success
* hide unsupported actions behind toasts
* mix unrelated departments into one task
* rewrite architecture during visual work
* modify backend systems without scope
* claim native validation without a native device
* call token migration flagship elevation
* call audit completion product completion
* damage existing product depth for minimalism

The correct outcome is a richer, clearer, more coherent and more trustworthy native product—not merely a smaller or cleaner codebase.

 explicitly not take out LOC's unnecessirily  while upgrading ! it will degrade  the project quality the LOC's might have been left for future upgradation ! if you find any check and analyse why thats there !





