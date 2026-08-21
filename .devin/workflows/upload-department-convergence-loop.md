# Upload Department Convergence Loop (Poster + Look)

> **Authority:** Department-specific application of the Visual Flagship Convergence Loop (`.devin/workflows/visual-flagship-convergence-loop.md`) and the Research-Driven Upgrade Loop (`.devin/workflows/research-driven-upgrade-loop.md`), bound by AGENTS.md §31. This file is the canonical execution workflow for **every camera → gallery → editor-seeding change** in the Poster and Look upload department. It overrides the former department-wide "research then mass implementation" method for this department.
>
> **One-line summary:** One upload sub-surface at a time → one exact benchmark comparison (Snapchat camera + Instagram story/carousel upload) → one ruthless critique → one redesign → another artifact → repeat. Propagate the grammar only after one sub-surface proves the pattern.
>
> **Benchmark apps:** Snapchat (camera, multi-snap, capture-to-edit), Instagram (story camera, carousel upload, layout/animated collage 2026, "Select Multiple"). These are quality benchmarks to exceed, not surfaces to photocopy.

---

## 0. Why this department needs its own loop

The Poster/Look upload department is the **front door of creation**. Every creator enters through the camera. The single fastest way to make the product feel non-flagship is to add friction, chrome, or a jarring transition between *intent* (I want to make something) and *artifact* (I am editing something).

The generic convergence loop governs *how* to iterate one surface at a time. This file governs *what* "flagship" means concretely for the upload department, the exact observable outcomes, the sub-surface iteration order, and the benchmark-specific design thinking to study. Past iterations produced technically impressive commits (30+ tools tamed, frozen-dimension fixes) without the proportional *capture-flow* jump because the unit was the editor, not the **camera → editor continuity**.

The upload department's quality bar is not measured in the editor. It is measured in the **first 5 seconds**: from opening the creator to a composed, editable artifact with 3 media objects.

---

## 1. The loop (department-specialized)

```
For one upload sub-surface:
  1. ESTABLISH CONTEXT   → the current camera/picker/seeding render + the benchmark at equal scale
  2. DEFINE OUTCOMES      → the observable capture-flow deltas in §5 (not "flagship")
  3. DESIGN COMPOSITION   → the viewfinder must dominate; chrome recedes in the squint test
  4. IMPLEMENT            → one sub-surface + directly coupled primitives only
  5. CAPTURE              → native artifact at 320 / 390 / 430 + representative Android
  6. COMPARE              → Snapchat/Instagram and ThryftVerse side-by-side at equal scale
  7. CRITIQUE             → cold critic (benchmark + result + user goal only)
  8. REWORK               → reject and rework until the continuity reads as one gesture
  9. SIGN OFF             → artifact + side-by-side + visual score + human acceptance
  10. PROPAGATE           → extract the pattern only after one sub-surface proves it
```

A sub-surface is not done until step 9. A pattern is not generalized until one sub-surface has passed step 9.

---

## 2. Sub-surface priority order (upload department)

Work sub-surfaces in this order, where the code proves the largest structural gap vs the benchmark:

```
1. Capture-to-edit continuity   ← flat opacity crossfade does not pin media; biggest gap
2. Camera chrome restraint      ← gallery label + placeholder containment = AI-tells
3. Multi-snap staging tray       ← accumulating captures invisible while shooting
4. Single-capture direct-to-edit ← quick-review overlay breaks the continuous gesture
5. Gallery picker de-duplication ← triple count restatement; tab over-chrome
6. Look source tray + auto-layout entry ← the look assembly first-5-seconds
7. Poster frame seeding          ← addPosterFrames jank / flash of unstyled content
8. Permission + empty + error states ← art-directed, not generic
```

Continuity is first because every other sub-surface is experienced *through* the transition. If the media jumps between camera and editor, no amount of shutter polish recovers the flagship feel.

---

## 3. Active visual context budget (per sub-surface)

Do not give an implementation pass the whole department. Reduce active context to:

```
1 this workflow file                       (the department north-star)
1 sub-surface contract slice               (from §5, the specific outcomes)
3–5 Snapchat/Instagram benchmark screenshots (per state, same viewport)
1 current native screenshot                 (same viewport as benchmark)
1 explicit before→after continuity delta    (§4)
```

The 86-file research pack is the knowledge base, not the prompt.

---

## 4. Before→after continuity delta (the department's core metric)

State the change as an observable continuity delta, not a quality adjective.

```text
Current: Camera capture → full-screen quick-review overlay (Retake/Edit/Save)
         → flat 200ms opacity crossfade between two full screens.
         Media does not stay in place; the viewfinder and editor canvas are
         different elements at different positions, so the media jumps.
         Accumulating multi-snap captures are invisible while shooting
         (only "Done (N)" in the review overlay).
Target:  Capture commits → media stays pinned in place while editor chrome
         fades in around it (shared-element continuity, 220–280ms, ease-in-out).
         Single capture in poster/look mode goes direct-to-editor (no review
         overlay); retake/undo live in the editor, not a separate screen.
         Multi-snap shows a persistent staging tray of captured thumbnails on
         the camera surface (Snapchat staging area); the user sees their
         sequence accumulate while shooting.
```

A delta like "make the capture-to-edit feel like Snapchat" is not acceptable. It is not testable.

---

## 5. Observable outcomes (replace "flagship" for the upload department)

These are the testable targets for the department. An iteration is not done until the worked sub-surface's outcomes are met.

### Continuity (sub-surface 1)
- The captured/selected media's position does not jump between camera and editor. The same pixels stay in place while chrome fades in around them.
- The transition duration is 220–280ms (Apple/Google motion guidance for element-continuity transitions), ease-in-out, not the 200ms linear-ish opacity swap.
- No black/white flash, no spinner page, no blank frame between capture and editor.
- Reduced motion: instant swap (no fade), media still lands in the same position.

### Camera chrome restraint (sub-surface 2)
- The gallery thumbnail has **no text label**. The thumbnail IS the label (Snapchat/Instagram pattern). "Gallery" text below the thumb is banned.
- The gallery placeholder (no recent image) is a transparent 44pt hit target with a 22–24pt glyph, **not a bordered box**. Visible containment without meaning is banned (AGENTS.md §4).
- At most 5–6 immediate actions on the camera surface: shutter, flip, flash, gallery, effects, (mode switch). Nothing else visible at idle.
- In the squint test, navigation and utility chrome recede; the viewfinder dominates.

### Multi-snap staging (sub-surface 3)
- While multi-capture is active, a persistent horizontal tray of captured thumbnails is visible on the camera surface (above the shutter or top-left). The user sees their sequence accumulate.
- Each staged thumbnail is tappable (to retake/drop that frame).
- The tray does not appear for single capture (it is multi-snap only).
- The "Done" action shows the count once, in one place.

### Single-capture direct-to-edit (sub-surface 4)
- In poster/look mode, a single capture goes directly to the editor. No quick-review overlay.
- Retake/undo is available inside the editor (one tap), not on a separate review screen.
- Visual search retains a confirm step (it is a different intent — search, not create).

### Gallery picker (sub-surface 5)
- The selection count is shown in **exactly one place** (the confirm button: "Next (3)"). The title count + count badge + confirm count triple restatement is banned.
- Tabs: Recents + Albums only when the picker is reached from the camera. Photos/Videos filters collapse into a single toggle or are removed if Recents already mixes types.
- The camera tile is the first grid cell (Snapchat/Instagram live-camera-as-first-cell pattern).
- Selected thumbnails show a numbered order badge (1st, 2nd, …) — the verified multi-select pattern.

### Look assembly (sub-surface 6)
- From "open look creator" to "first composed look with 3 images" is ≤ 4 taps and ≤ 2 screens (camera/picker → composer with auto-laid-out look).
- Auto-layout reads as authored, not algorithmic: the first layout is a deliberate default (e.g. stacked / 2-up hero), not a generic grid.

### Poster seeding (sub-surface 7)
- `addPosterFrames` does not produce a flash of unstyled content. The first frame is rendered before the editor chrome is interactive.
- The crossfade covers the seeding render.

### States (sub-surface 8)
- Camera: permission-denied, limited-access, capturing, recording, idle — all art-directed, no generic grey cards.
- Picker: loading (skeleton), empty, error, permission-denied, limited-access, populated.
- Seeding: loading, failure (with retry), offline.

---

## 6. The cold critic (department-specific)

The visual reviewer is a **cold critic** that receives only:

```
Snapchat/Instagram benchmark screenshots + resulting screenshots + the user goal
("from opening the creator to an editable artifact with 3 media objects, in one continuous gesture")
```

It answers only:
- Does the media jump between camera and editor? (continuity fail)
- Is there a text label under the gallery thumb? (AI-tell)
- Is there a bordered placeholder box for the gallery? (containment-without-meaning)
- Does a single capture show a review overlay before the editor? (broken gesture)
- Are accumulating multi-snap captures visible while shooting? (staging fail)
- Is the selection count restated in 2+ places? (label-everything)
- Does the viewfinder dominate the squint test, or does chrome compete?
- Where does the flow feel like a file picker instead of a creative gesture?

Then the coding agent reworks. This separation is mandatory for every sub-surface that claims visual completion.

---

## 7. Definition of done (upload department)

```text
TypeScript 0 errors + tests pass + tokens compliant + no banned patterns
  = engineering-ready for visual review. NOT completion.

Visual completion for an upload sub-surface requires:
  - a native artifact (screenshot / screen recording of the capture flow).
  - a side-by-side at equal scale vs Snapchat/Instagram.
  - at least one rework iteration after the first capture.
  - the continuity delta in §4 is observable in the recording (media stays pinned).
  - human acceptance.
```

A screen recording is required for continuity sub-surfaces — a static screenshot cannot show whether the media jumped.

---

## 8. Anti-patterns (department-specific process failures)

- Treating the camera and the editor as two separate surfaces and polishing each independently. The **continuity between them** is the deliverable.
- Adding a review/confirm screen between capture and editor "for safety". Flagship apps commit the capture and put retake in the editor.
- Labeling the gallery thumbnail ("Gallery" text). The thumbnail is the label.
- Rendering a bordered placeholder box for the gallery control. Transparent 44pt target + glyph.
- Restating the selection count in the title, a badge, and the confirm button. One place.
- Showing 4 equal tabs (Recents/Albums/Photos/Videos) when 2 suffice.
- A flat opacity crossfade masquerading as "media stays in place". If the media element is not pinned/shared, it is not continuity.
- Hiding accumulating multi-snap captures behind a "Done (N)" button. Show the tray.
- Claiming completion after TypeScript passes without a screen recording of the capture flow.

---

## 9. Benchmark design thinking to study (not photocopy)

### Snapchat camera (2026)
- **Time-to-camera-ready** is the primary metric (Snap Engineering measures app-icon-press to camera-ready). The camera must be instant.
- **Shutter**: single large circle, bottom-center. Tap = photo, hold = video. The ring fills clockwise over the recording duration. One control, two intents, discovered by gesture.
- **Multi-snap staging**: captures are held in a temporary staging area visible while shooting; the user reviews the sequence before posting. The staging tray is the continuity bridge.
- **Lens carousel**: playful, central to brand, but grouped; the chrome recedes in the squint test.
- **Hidden gestures** (zoom, focus, dual capture) are a known weakness — ThryftVerse should expose focus-tap with a reticle but not overload the surface.

### Instagram story camera + carousel upload (2026)
- **Swipe-right from feed → camera**. The camera is one gesture away.
- **Left-side mode rail**: Boomerang, Layout, Hands-free, AI images, Collage. Progressive disclosure — the viewfinder is default, modes are a swipe.
- **Select Multiple** (March 2026 Animated Collages): pick 5–20 photos in tap order, auto-generate. The selection order is preserved and visible.
- **Layout**: 2–6 photos in one grid frame, chosen before capture. The grid shape is decided first, then filled.
- **Capture → story editor**: the media stays in place; creative tools fade in around it.

### Cognitive fluency principles in play
- **Processing fluency**: fewer immediate actions feels premium. The viewfinder must dominate so the user's cognitive load is on the scene, not the chrome.
- **Csikszentmihalyi flow**: the gap between intent and artifact should be a continuous gesture, not a wizard. Every intermediate screen (review, confirm, action) is a flow interruption.
- **Hick's Law**: too many visible choices on the camera slows the capture. ≤6 immediate actions.
- **One decision per step** (progressive disclosure): flagship upload flows never show all editing tools during upload. Upload, then enhance.

### Haptic + motion language
- Shutter press: a light, snappy haptic (Snapchat uses a single light tick on capture).
- Mode switch: a selection haptic.
- Capture complete → editor: the media stays pinned; chrome fades in 220–280ms ease-in-out. No bounce, no slide. Reduced motion: instant.
- The transition is **element-continuity**, not a page transition. Apple WWDC24 zoom transition is the reference: the tapped/captured element morphs into the incoming view.

---

## 10. Relationship to existing rules

- AGENTS.md §4 (anti-AI design, thumbnail/squint tests) — the quality bar. This loop is how it is reached for the upload department.
- AGENTS.md §0 (subagent scope) — parallel subagents for research are encouraged; no nesting.
- `.devin/workflows/visual-flagship-convergence-loop.md` — the generic loop. This file specializes it for the upload department; where they conflict on department specifics, this file wins.
- `.devin/workflows/research-driven-upgrade-loop.md` — the research methodology that feeds each iteration.
- `.devin/surfaces/creator-poster.md` — the surface contract, updated with the §5 outcomes.

---

## 11. 2026 August research update — AI-slop diagnosis and the card-between-media fix

### 11.1 The AI-slop fingerprint (VP0 Journal, 2026)

The 2026 research on "why AI apps look generic" confirms the diagnosis: AI-generated UIs revert to the **statistical average** of every interface the model has seen — same fonts, same purple gradients, three rounded cards, generic icons. The fix is **structural, not verbal**: give the AI a specific design to converge on, not adjectives to interpret. "Make it flagship" is useless; "the canvas fills the screen, chrome floats with gradient scrim, no labels under universally-understood icons" is actionable.

The AI-slop fingerprint in the creator upload department:
- **Card-between-media**: The canvas has a fixed aspect ratio (9:16 or 4:5) centered on a black screen, leaving visible bars. The media looks like it's inside a card. In Snapchat/Instagram, the media IS the screen.
- **Label-everything**: Tool rail icons have text labels underneath. Snapchat and Instagram don't label their close, undo, flash, flip, gallery icons — the icon IS the label.
- **Decorative chrome on chrome**: Top bars with visible borders, tool docks with background colors, undo/redo in visible containers. Flagship chrome is transparent with gradient scrim only.
- **Generic dashboard silhouette**: The layers sheet and drafts list use equal-height cards in a grid. Real apps use flat lists with hairline separators.

### 11.2 The card-between-media fix (architectural)

**Root cause:** The canvas geometry computes `canvasHeight = screenWidth / aspectRatio`, which for 9:16 on a 390×844 phone gives 390×693 — leaving 75px black bars above and below. The 9:16 ratio is the EXPORT ratio, but the EDIT surface should fill the screen.

**Fix:** When a full-bleed media layer exists (width=1, height=1), the canvas fills the entire screen height. The media uses `contentFit="cover"` to fill the screen (cropping if needed). The export pipeline still crops to 9:16. This is the Snapchat/Instagram architecture: SCREEN = MEDIA, edits are siblings on the media, chrome floats over.

For documents WITHOUT full-bleed media (blank canvas, text-only), the fixed aspect ratio canvas is still used — the user hasn't added media yet, so the canvas shape communicates the export ratio.

### 11.3 Shared element transitions (Reanimated 2026)

The 2026 research on React Native shared element transitions confirms:
- Reanimated's `sharedTransitionTag` is the designated future for capture-to-edit continuity
- React Native 0.85 shipped a Shared Animation Backend unifying Animated and Reanimated
- The manual overlay ("magic move") technique remains the production fallback that always works
- The current 240ms pinned-media crossfade in `CreatorEntryEditorCrossfade` is a manual overlay implementation — this is correct and production-safe

### 11.4 Pinterest Shuffles benchmark (2026)

Pinterest Shuffles is the collage benchmark for the look composer:
- **Snap** objects with camera → **cut out** with single tap → **layer, rotate, resize** → **animate** → **remix**
- The collage surface is the screen — no card frame
- Cutout is a first-class tool, not buried in overflow
- The creative tools float over the collage, not in a separate panel

### 11.5 Instagram March 2026 animated collages

Instagram's March 2026 "Select Multiple" + animated collages pattern:
- Pick 5–20 photos in tap order, auto-generate
- Selection order is preserved and visible (numbered badges)
- Auto-layout reads as authored, not algorithmic
- The first layout is a deliberate default, not a generic grid
- `.devin/visual-qa-gates.md` and `.devin/release-gates.md` — the gate definitions. The visual release gate is enforced.
