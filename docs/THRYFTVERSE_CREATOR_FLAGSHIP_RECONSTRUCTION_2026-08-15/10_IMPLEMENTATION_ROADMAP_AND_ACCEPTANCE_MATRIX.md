# 10 — Implementation Roadmap and Acceptance Matrix

## Strategy

Do not attempt all features in one giant pass.

Each phase must end with:
- device captures;
- interaction recording;
- benchmark comparison;
- tests;
- no regression of output truth.

## Phase 0 — Baseline and instrumentation

### Work
- capture current Poster/Look flows on 3 real devices;
- record tap-to-publish flow;
- create canonical fixture projects;
- add performance markers;
- create creator visual snapshot harness.

### Exit
- baseline images/video stored;
- measurable current timings;
- fixture corpus committed.

## Phase 1 — Interaction shell reconstruction

### Work
- introduce `ContextToolRail`;
- reduce permanent chrome;
- custom exit confirmation;
- split default vs selected context actions;
- remove disabled/default Cutout;
- remove long-press delay from normal frame swipe;
- create tool registry.

### Exit
- maximum 6 primary actions in each context;
- selected object always owns context rail;
- canvas remains visible during routine adjustments.

## Phase 2 — Asset picker decomposition

### Work
- extract media browser;
- extract text editor;
- extract sticker browser/editors;
- extract product browser;
- extract drawing workspace;
- extract audio browser;
- retire giant switch implementation gradually.

### Exit
- no unrelated tool depends on generic mega-picker UI;
- media browse reused by entry and replace/add flows.

## Phase 3 — Poster timeline P0

### Work
- clip track;
- scrub/playhead;
- trim;
- split;
- reorder;
- replace;
- speed;
- volume;
- crop/rotate;
- timed text/sticker/music tracks.

### Exit
- 3-clip real-device edit can be completed without leaving main composer.

## Phase 4 — Look preview-first P0

### Work
- live layout thumbnails;
- instant successful default;
- direct product drag from source drawer;
- overlap selection;
- source drawer redesign;
- remove misleading cutout until true segmentation.

### Exit
- 2–6 media inputs always enter a visibly coherent composition.

## Phase 5 — Durable projects

### Work
- project file package;
- stable asset registry;
- imported-media copy;
- thumbnails;
- atomic saves;
- crash journal;
- recovery.

### Exit
- kill app mid-edit → reopen → no lost project/media.

## Phase 6 — Upload manager

### Work
- persisted upload jobs;
- bounded concurrency;
- progress bytes;
- retry/backoff;
- idempotency;
- resume;
- cancel;
- publish dependency graph.

### Exit
- airplane mode mid-upload → reconnect → resume and publish.

## Phase 7 — Effects/text/crop visual quality

### Work
- rendered effect thumbnails;
- non-destructive adjustments;
- text family system;
- text effects;
- animation timing;
- in-canvas crop.

### Exit
- all visual preset pickers show real-media previews.

## Phase 8 — True cutout

### Work
- segmentation path;
- alpha mask storage;
- refinement;
- mask renderer;
- edge quality tests.

### Exit
- transparent subject extraction, not rectangular crop.

## Phase 9 — Personalization and advanced tools

### Work
- pinned/recent tools;
- speed curves;
- transitions;
- keyframes;
- template project introspection;
- optional AI effects.

### Exit
- advanced tools do not degrade first-run simplicity.

# Acceptance matrix

| Requirement | P0/P1 | Evidence |
|---|---|---|
| Media is dominant visual element | P0 | screenshots |
| ≤6 primary tools per context | P0 | UI inspection |
| Selected object gets context actions | P0 | interaction recording |
| Poster video has timeline | P0 | device recording |
| Trim/split/reorder/replace | P0 | tests + recording |
| Overlay timing | P0 | timeline fixture |
| Look successful default | P0 | 2–6 asset fixtures |
| Visual layout thumbnails | P0 | screenshots |
| No fake Cutout label | P0 | code/UI inspection |
| Durable project media | P0 | kill/restart test |
| Publish upload resume | P0 | offline/online test |
| WYSIWYG render | P0 | pixel/perceptual comparison |
| 44 pt minimum project target | P0 | automated layout audit |
| drag alternatives | P1 | accessibility audit |
| effect thumbnails | P1 | screenshot |
| true cutout | P1 | transparent export test |
| pinned/recent tools | P2 | interaction test |
| advanced keyframes | P2 | timeline test |

## Quality scoring gate

Do not declare "9/10" because tests pass.

Suggested release rubric:
- 20% interaction fluency;
- 20% visual hierarchy;
- 15% media quality;
- 15% output fidelity;
- 10% resilience;
- 10% performance;
- 5% accessibility;
- 5% architecture maintainability.

Any P0 failure caps overall creator department at 6/10 regardless of average.
