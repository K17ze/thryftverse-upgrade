# ThryftVerse Creator — Human Flow Reconstruction Pack

**Audit date:** 17 August 2026  
**Branch:** `feat/product-detail-contract-media-device-closure`  
**Validated HEAD:** `c90f8c647516a42d4ec6cb5255c568b3102a84e2`

## Core verdict

The primary failure is now **interaction architecture**, not missing features. The current creator asks users to understand its feature taxonomy before they can create. `CreatorEntryScreen.tsx` explicitly replaced the older camera/gallery-oriented entry with a 2×2 dashboard for Camera / Photos / Items / Templates plus a separate Start with text action. Camera therefore became a subordinate option instead of the default creator state.

The latest HEAD also added Look auto-layout, an AI effect browser, camera effects and multi-clip capture. Those capabilities are not inherently wrong; the product problem is that new capability repeatedly becomes new visible chrome. In Look, the current implementation can place an Auto Layout bar, Layout Preview rail, commerce Source Tray and Context Tool Rail around the same canvas. That is feature accretion, not mature interaction design.

## Reconstruction thesis

**Creation is a continuous state, not a wizard.**

Target flow:

`open creator → camera/media → editor directly → share`

Not:

`open creator → choose intent → choose source → confirm → choose action → editor → choose tool family → edit`.

## Non-negotiables

1. Restore **camera-first entry**.
2. Restore visible **Look / Poster / Search** switching on the camera surface.
3. Gallery is one tap from camera.
4. Selecting media navigates **directly to the correct editor**.
5. Single capture navigates **directly to editor**; only explicit multi-capture justifies an intermediate batch state.
6. Delete the default 2×2 creator dashboard.
7. Templates, AI effects, Items and drafts become secondary/contextual.
8. Crop becomes direct manipulation on the media, not a separate artificial tool experience.
9. Default editor chrome must be reduced radically.
10. A feature earns permanent screen real estate only if it is necessary for the current user state.

## Pack

- `01_FLOW_FAILURE_AUDIT.md`
- `02_CAMERA_FIRST_INFORMATION_ARCHITECTURE.md`
- `03_LOOK_POSTER_SEARCH_SWITCH_SPEC.md`
- `04_MEDIA_SELECTION_TO_EDITOR_CONTINUITY.md`
- `05_EDITOR_HUMANIZATION_PSYCHOLOGY.md`
- `06_REDUCTION_AND_DELETION_MATRIX.md`
- `07_CROP_DIRECT_MANIPULATION_SPEC.md`
- `08_TOOL_DISCLOSURE_AND_CONTEXT.md`
- `09_LOOK_FLOW_RECONSTRUCTION.md`
- `10_POSTER_FLOW_RECONSTRUCTION.md`
- `11_CAMERA_FLOW_RECONSTRUCTION.md`
- `12_VISUAL_LANGUAGE_ANTI_SLOP.md`
- `13_CODEBASE_REFACTOR_ACTION_MATRIX.md`
- `14_IMPLEMENTATION_PROMPTS.md`
- `15_ACCEPTANCE_GATES.md`
- `16_SOURCE_REGISTER.md`

## Rule

Before adding creator UI, answer: **What user uncertainty does this eliminate?** If the answer is “it exposes another feature,” do not add it.
