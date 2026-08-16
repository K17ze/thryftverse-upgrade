# 12 — Agent Implementation Prompts

These prompts are designed to be executed sequentially. Each one must begin by reading `AGENTS.md`, `Design.md`, the entire creator reconstruction pack, and the current branch before changing code.

---

## PROMPT 01 — Creator interaction shell reconstruction

You are upgrading the ThryftVerse creator department on branch `feat/product-detail-contract-media-device-closure`.

Mission:
Reconstruct the Poster and Look editor shells so they feel like focused creative instruments rather than multi-sheet utility editors.

Read first:
- `frontend/src/creator/poster/PosterComposerScreen.tsx`
- `frontend/src/creator/look/LookComposerScreen.tsx`
- `frontend/src/creator/CreatorAssetPicker.tsx`
- `frontend/src/creator/CreatorAnimations.tsx`
- `AGENTS.md`
- `Design.md`
- this reconstruction pack.

Requirements:
1. Create a reusable `ContextToolRail` with mode/context-driven tool definitions.
2. Limit default visible actions to maximum 6.
3. Selected object must replace global tools with type-specific controls.
4. Keep canvas visible through routine edits.
5. Replace system draft/discard alert with an app-native continuity sheet showing autosave state and small project preview.
6. Remove any default action that is disabled or a no-op without a selection.
7. Preserve all functionality behind More where it is no longer primary.
8. Do not add decorative gradients or permanent glass containers.
9. Minimum project target 44×44 pt; preferred 48 pt high-frequency targets.
10. Include reduced-motion behavior.

Acceptance:
- screenshots before/after on real devices;
- interaction recording;
- no regression in creator tests;
- typecheck;
- documented file-by-file change report.

---

## PROMPT 02 — Decompose CreatorAssetPicker into tool architecture

Mission:
Remove `CreatorAssetPicker.tsx` as the implementation home for unrelated creator tools without causing a big-bang rewrite.

Create:
- tool registry;
- dedicated media browser;
- text editor;
- sticker browser/editors;
- product browser;
- drawing workspace;
- audio browser;
- generic precision-sheet primitive only where legitimately shared.

Rules:
- migrate one domain at a time;
- old entry points may temporarily adapt to new implementations;
- no generic mode switch with 20 UI implementations at end-state;
- visual tools show rendered previews wherever possible;
- all tool commits use semantic history.

Acceptance:
- CreatorAssetPicker responsibility substantially reduced;
- direct tests for each extracted tool;
- no visible feature loss.

---

## PROMPT 03 — Poster Timeline P0

Mission:
Implement a genuine timeline editor for Poster video.

Required:
- primary clip track;
- scrub/playhead;
- trim handles;
- split;
- duplicate;
- replace;
- reorder;
- speed;
- volume;
- crop/rotate;
- delete;
- text/sticker/music overlay tracks with start/end timing.

Interaction:
- timeline appears automatically when video/temporal media is active;
- canvas remains above;
- drag handles update preview continuously;
- gesture updates are UI-thread/transient;
- one semantic history commit on gesture end.

Do not:
- hide core video editing in separate generic sheets;
- build the timeline from full-resolution decoded thumbnails on JS;
- make users understand pages.

Acceptance:
- 3-clip fixture edited end-to-end on iOS/Android;
- app restart restores exact timeline;
- publish/viewer matches preview.

---

## PROMPT 04 — Look preview-first reconstruction

Mission:
Make Look creation immediately beautiful after media selection.

Required:
- 2–6 assets auto-compose;
- render visual layout alternatives using actual assets;
- tap preview commits one history event;
- temporary preview does not destroy current composition;
- replace blind Hero/Pair/Dominant/Collage cycling;
- source tray becomes compact peek drawer;
- support direct drag of product into canvas;
- improve overlap selection.

Acceptance:
- no blank/manual-work default after multi-select;
- screenshots for 2, 3, 4, 6 assets;
- under 2 seconds project target from selection completion to usable first composition on target devices (measure and report, do not fake).

---

## PROMPT 05 — Correct Cutout/Crop semantics and implement masking contract

Mission:
Immediately remove misleading Cutout semantics, then establish architecture for true transparent subject extraction.

Phase A:
- rename current rectangular trace result to Manual Crop;
- no `Cutout` label routes to rectangular crop;
- ensure old drafts remain compatible.

Phase B:
- add `MaskRef` / alpha mask support to document schema;
- renderer supports masked media non-destructively;
- build an interface for a future segmentation provider.

Do not claim segmentation until a real mask is generated.

---

## PROMPT 06 — Durable creator project store

Mission:
Replace AsyncStorage-only project persistence with durable project packages.

Required:
- stable project directory;
- atomic `project.json`;
- project-managed media copies;
- asset registry;
- thumbnail generation;
- crash recovery journal;
- schema migrations;
- garbage collection;
- AsyncStorage only for lightweight index/preferences if useful.

Test:
- import media;
- edit;
- kill app;
- delete original gallery item where platform permits;
- reopen project;
- project remains intact.

---

## PROMPT 07 — Creator upload manager

Mission:
Decouple publishing from foreground sequential upload.

Build:
- persistent upload jobs;
- bounded parallelism;
- retries with exponential backoff+jitter;
- idempotent remote keys;
- byte progress;
- cancel/resume;
- app background behavior;
- project state integration.

`CreatorPublishSheet` should observe jobs, not run the whole pipeline itself.

Acceptance:
- network loss/recovery test;
- retry test;
- app restart test;
- no duplicate remote asset.

---

## PROMPT 08 — Media browser and permission reconstruction

Mission:
Create a single high-quality media browser used by entry, add and replace flows.

Required:
- recents/albums/photos/videos;
- ordered multi-select;
- large preview;
- video duration;
- camera tile;
- limited-library state;
- truthful permission recovery;
- progressive thumbnail loading;
- FlashList or equivalent virtualization.

Do not request full photo access simply to decorate camera entry.

---

## PROMPT 09 — Camera quality pass

Mission:
Elevate current already-refactored camera without rewriting it.

Keep existing camera child components.

Fix:
- raw recording limit architecture;
- truthful zoom semantics;
- permission timing;
- gesture arbitration;
- rapid capture review;
- multi-capture → Poster timeline connection.

Measure:
- first frame time;
- shutter response;
- capture-to-preview;
- record start/stop response.

---

## PROMPT 10 — Text and visual effect system

Mission:
Build a curated flagship text/effect experience.

Text:
- 8–12 coherent style families;
- rendered preview with current words;
- color;
- background;
- stroke;
- shadow/glow;
- alignment;
- spacing;
- Poster text animation/timing.

Effects:
- actual-media thumbnail rail;
- non-destructive adjust stack;
- intensity;
- reset;
- compare before/after.

No filter choice may be represented only by an abstract name when a live preview is feasible.

---

## PROMPT 11 — Canonical renderer / WYSIWYG gate

Mission:
Guarantee editor → preflight → export/viewer fidelity.

Required:
- one versioned render contract;
- canonical fixture documents;
- same transform anchors/bounds;
- same text font/effects;
- same crop/mask;
- same timed state;
- render version/migration.

Add visual parity tests between:
- editor;
- preview;
- viewer/export.

Any significant mismatch is P0.

---

## PROMPT 12 — Final flagship visual QA pass

Mission:
Do a human visual QA after all structural work, not before.

Capture:
- all fixture states in `11_VISUAL_QA_AND_DEVICE_TEST_PLAN.md`.

Audit:
- hierarchy;
- content dominance;
- spacing;
- hit targets;
- font/icon consistency;
- sheet geometry;
- motion;
- keyboard;
- dark/light;
- reduced motion;
- permission/error/empty.

Then make **small art-directed corrections** only. Do not reopen architecture unless evidence proves it is needed.

Final report must include:
- before/after;
- remaining gaps;
- measured performance;
- test results;
- exact changed files;
- no self-assigned 9/10 score without evidence.
