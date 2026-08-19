# Visual Flagship Convergence Loop

> **Authority:** This is the canonical execution workflow for every UI/UX change in ThryftVerse. It overrides the former department-wide "research then mass implementation" method. AGENTS.md §31 makes this binding.
>
> **One-line summary:** One visually coherent surface at a time → one exact visual comparison → one ruthless critique → one redesign → another screenshot → repeat. Propagate the grammar only after one screen proves the pattern.

---

## 0. Why this exists

The former workflow was research-rich and iteration-poor. It produced technically impressive commits without the proportional visual jump because it rewarded **number of problems fixed** instead of **magnitude of visible improvement**. A 300-line change converting 20 sheets from pills to underlines can produce a smaller visual gain than moving one image 28px upward, deleting one competing panel, and changing one media crop.

Past a certain point, more research does not produce proportionally better visual design. The research library remains a reference corpus. The **implementation unit** is now one visually coherent surface at a time.

---

## 1. The loop

```
For one surface:
  1. ESTABLISH CONTEXT   → small, visual, current-state
  2. DEFINE OUTCOMES      → observable visual deltas, not adjectives
  3. DESIGN COMPOSITION   → silhouette + interaction hierarchy before tokens
  4. IMPLEMENT            → one primary screen + directly coupled primitives
  5. CAPTURE              → native artifact at 320 / 390 / 430 + representative Android
  6. COMPARE              → reference and ThryftVerse side-by-side at equal scale
  7. CRITIQUE             → cold critic (reference + result + goal only)
  8. REWORK               → reject and rework the same screen until it clears the bar
  9. SIGN OFF             → screenshot artifact + visual score + human acceptance
  10. PROPAGATE           → extract/generalize the pattern only after one screen proves it
```

A surface is not done until step 9. A pattern is not generalized until one screen has passed step 9.

---

## 2. Active visual context budget

Do not give an implementation agent the entire research pack. Reduce active visual context to:

```
1 department north-star document      (max ~3–5 pages)
1 current surface contract            (max ~1–2 pages, see §3)
3–5 benchmark reference screenshots    (per state)
1 current native screenshot            (same viewport as benchmark)
1 explicit before→after visual delta   (see §4)
```

The 86-file research pack is the knowledge base. It is **not** the implementation unit. Surface contracts live in `.devin/surfaces/<surface>.md`.

---

## 3. Surface contract

Every surface worked on gets a contract at `.devin/surfaces/<surface>.md` containing:

- **Surface name** and route.
- **User goal** — what the user is trying to accomplish on this surface (one sentence).
- **Current state** — what the screen looks like now (the structural problem, not a token inventory).
- **Observable visual outcomes** — the testable targets (§5). Not "make it flagship."
- **Before→after delta** — the explicit, measurable visual change (§4).
- **Benchmarks** — 3–5 reference screenshots per state, with the specific design thinking to study (not surfaces to photocopy).
- **Feed-unit / data model** — if the surface is a feed/list, the unit model and span grammar.
- **States to cover** — loading, empty, error, offline, populated, partial.
- **Out of scope** — what this iteration does not touch.

---

## 4. Before→after visual delta

State the change as an observable, measurable delta, not a quality adjective. Example for Discovery:

```text
Current: 2-column catalogue. Every unit is a listing. span = 1. Variable heights only.
Target:  visual-discovery canvas where listings are one feed-unit type among several.
         First viewport contains ≥2 strong media objects and no catalogue-card silhouette.
         Mixed feed-unit schema: listing, look, editorial, board, creator cluster, auction/live moment.
         1×1 and 2×1 spans used deliberately. Context breaks (eyebrows) rhythm the feed.
         FlashList owns scrolling (no enclosing ScrollView).
```

A delta like "make the grid more Pinterest flagship" is not acceptable. It is not testable.

---

## 5. Observable visual outcomes (replace "flagship")

"Flagship" is a judgement, not a CSS property. Agents translate vague quality adjectives into familiar patterns (premium → larger radius + shadows; modern → pills + blur; minimal → remove content; Instagram → underline tabs; Pinterest → 2-column masonry; Snapchat → black chrome). That is how AI-slop appears.

Prompts and contracts must define **observable visual outcomes** instead:

```text
- At 25% screenshot scale the media must dominate.
- The user must identify the main action without reading.
- The first viewport must show ≥2 strong media objects.
- Exactly one visual region may use persistent containment.
- This photograph must retain the full shoe silhouette.
- The next item must peek 80–140pt into the viewport.
- Navigation must disappear in the squint test.
- Selection may increase chrome; idle mode may not.
- The editor must expose no more than four immediately relevant actions before More.
- No catalogue-card silhouette may dominate the first viewport.
```

These are testable. "Make it flagship" is not.

---

## 6. The cold critic

The same agent must not research → spec → implement → test → evaluate its own work. That creates confirmation bias: it already knows why every decision was "correct."

The visual reviewer is a **cold critic** that receives only:

```
reference screenshots + resulting screenshots + user goal
```

— not commit messages, not implementation explanations, not "all requirements completed."

It answers only:

- What looks weaker?
- What feels templated?
- What visually dominates incorrectly?
- Where does density differ from the reference?
- Where does crop / art direction fail?
- What would a senior designer reject immediately?

Then the coding agent gets that criticism and reworks. This separation is mandatory for every surface that claims visual completion.

---

## 7. Definition of done

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

This matches Apple's guidance that craft requires prototyping, discarding, and refinement — not a single correct implementation pass.

---

## 8. Surface priority order

Work surfaces in this order, where the code proves the largest structural gap:

```
1. Discover / Explore        ← feed-unit model is structurally catalogue-only; first
2. Creator media selection   ← interaction model needs art direction
3. Poster camera / editor    ← too much system complexity visible to the user
4. Looks Explore
5. Product Detail
6. Co-Own
7. Profile
8. Inbox / Chat
9. Settings
10. remaining utility surfaces
```

Discovery is first because the current implementation is structurally incapable of the authored feed described by the research while it remains a span-1 listing-only grid. Creator/Poster follows because it has the opposite problem: too much implementation is visible to the user instead of disappearing behind a simple creative experience.

---

## 9. Anti-patterns (process failures)

- Department-wide "research then mass implementation" across dozens of files/screens at once.
- Using "flagship" / "premium" / "Pinterest-quality" as an implementation instruction.
- Treating hygiene rules (no card-on-card, fewer pills, restrained radii) as the objective function instead of floor constraints.
- Repeating one recipe (flatten → remove pill → remove shadow → underline → shrink label → reduce radius) across every screen. That is a different kind of machine-generated sameness.
- Claiming completion after TypeScript passes without a native artifact and a side-by-side.
- The same agent researching, specifying, implementing, and approving its own visual work.
- Generalizing a pattern to the whole codebase before one screen has passed sign-off.
- Producing research/audit documentation instead of visible product improvement.

---

## 10. Relationship to existing rules

- AGENTS.md §4 (anti-AI design, thumbnail/squint tests) — remains the quality bar. This loop is **how** that bar is reached and enforced, one surface at a time.
- AGENTS.md §25 (research-to-implementation protocol) — the research stages remain, but the **implementation unit** is now one surface, not one department. The research pack is reference material, not the prompt.
- AGENTS.md §28 (research pack routing) — reinforced: the pack is a corpus, never loaded wholesale into an implementation task.
- `.devin/visual-qa-gates.md` and `.devin/release-gates.md` — remain the gate definitions. The visual release gate is now **enforced** (fails on P0 by default).
