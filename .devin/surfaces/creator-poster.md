# Creator/Poster Surface Contract

> Second surface in the Visual Flagship Convergence Loop (AGENTS.md §31). This contract is the active visual context for the Creator/Poster implementation unit — not a department-wide research dump.

---

## Surface

**Name:** Creator / Poster (camera → media picker → editor → publish → viewer)
**Route:** Create tab → `CreateCamera` → `CreatorStudio` (type: 'poster') → `PosterComposerScreen` + `CreatorEntryScreen` → `PosterViewer`
**Files:** `frontend/src/creator/poster/PosterComposerScreen.tsx`, `frontend/src/creator/CreatorEntryScreen.tsx`, `frontend/src/creator/tools/MediaBrowser/MediaBrowserSheet.tsx`, `frontend/src/creator/surfaces/ContextToolRail.tsx`, `frontend/src/screens/PosterViewerScreen.tsx`

## User goal

A creator opens the camera to **just make something** — capture or pick media, lightly enhance it, share it as a poster story. The complexity of a full creative editor should disappear behind a simple, approachable workspace.

## Current state (the structural problem)

The editor exposes **30+ tools** across 6 selection contexts. A single photo's default tool group shows Text, Stickers, Music, Effects, Draw, Timeline (6 primary); its overflow contains Product, Add Frame, Transitions, Layers, Preview, Safe Zone, Templates, Drafts, Settings. Selecting media exposes Replace, Crop, Auto, Adjust, Effects + Cutout, Animation, Speed Curve, Reverse, Freeze Frame, Audio Fade, z-ordering, duplicate/delete. That is technologically impressive but reads as "prove every feature exists" rather than "what does the user need at this precise creative moment?"

Additionally, `MediaBrowserSheet` calculates thumbnail geometry from module-level `Dimensions.get('window')` — a frozen-dimension defect that breaks rotation/adaptive layout.

## Implementation status — 20 August 2026

- The live Poster path renders `ContextToolRail`; `CreatorToolDock` is not a production Poster dependency.
- The rail is capped at four primary actions plus More.
- More is a grouped, bounded, vertically scrollable bottom sheet with 48dp rows and modal accessibility containment.
- Text selection uses the bottom context rail only; the duplicate inline styling toolbar was removed from Poster.
- MediaBrowser geometry is responsive. Native capture of the final More-sheet state remains required before this surface can be marked complete.

## Before→after visual delta

```text
Current: 30+ tools across 6 contexts. 6 primary tools + 10+ overflow items.
         Timeline button shown even for single-photo documents.
         Full tool-set replacement on context switch (disorienting).
         MediaBrowserSheet dimensions frozen at module load.
Target:  ≤4 immediately relevant actions before More (Meta Edits / Instagram / CapCut pattern).
         Primary layer = canvas + preview (ruthlessly guarded).
         Context-sensitive toolbar adds tools based on selection, not full replacement.
         Timeline hidden for single-photo documents (canvas dominant).
         Overflow grouped into logical submenus with specific labels (not "More...").
         MediaBrowserSheet uses useWindowDimensions (responsive).
```

## Observable visual outcomes (testable, not "flagship")

- The editor exposes no more than 4 immediately relevant actions before More.
- The primary layer (canvas + preview) is never cluttered by tool chrome.
- Selecting a layer adds context tools to the rail, not replaces the whole rail.
- Timeline is not visible for single-photo documents.
- Overflow items are grouped with specific labels ("Accessibility", "Advanced editing", "Project") not "More...".
- The media picker grid responds to rotation (dimensions not frozen).
- The camera entry feels native (prefetched lenses/effects, no waiting on tap).
- No more than 5-6 immediate actions on the camera surface (shutter, flip, flash, gallery, effects).
- Text selection renders exactly one styling surface; Font, Color, Align and More are never duplicated.
- More is grouped and vertically scrollable, keeps no more than 5-6 rows visible, and remains contained above the safe-area inset on small Android phones.
- Every More row is at least 48dp and the outside backdrop dismisses from anywhere beyond the sheet.

## Interaction hierarchy

```text
Primary layer:   canvas + preview (the creative surface — ruthlessly guarded)
Secondary layer: context-sensitive tool rail (≤4 tools, adds based on selection)
Tertiary layer:  grouped overflow (Accessibility, Advanced editing, Project)
```

## States to cover

- camera idle / capturing / reviewing
- picker empty / loading / populated / permission-denied / limited-access
- editor empty (blank start) / single-photo / multi-frame / video / publishing / failure
- viewer loading / playing / paused / ended / error

## Upload-department observable outcomes (per `.devin/workflows/upload-department-convergence-loop.md` §5)

These outcomes govern the camera → gallery → editor-seeding flow specifically:

- **Continuity:** the captured/selected media's position does not jump between camera and editor. The same pixels stay in place while chrome fades in (220–280ms ease-in-out). No black/white flash, no spinner. Reduced motion: instant swap, same landing position.
- **Camera chrome restraint:** the gallery thumbnail has no text label (the thumbnail IS the label). The gallery placeholder is a transparent 44pt hit target + 22–24pt glyph, not a bordered box. ≤6 immediate actions on the camera surface at idle.
- **Multi-snap staging:** while multi-capture is active, a persistent tray of captured thumbnails is visible on the camera surface; each is tappable to retake/drop. The tray is multi-snap only.
- **Single-capture direct-to-edit:** in poster/look mode a single capture goes direct-to-editor (no quick-review overlay). Retake/undo lives in the editor. Visual search retains a confirm step.
- **Gallery picker:** selection count shown in exactly one place (confirm button "Next (3)"). Tabs: Recents + Albums only from the camera. Camera tile is the first grid cell. Numbered order badges on selected thumbnails.
- **Look assembly:** open-look-creator → first composed look with 3 images is ≤4 taps / ≤2 screens.
- **Poster seeding:** `addPosterFrames` produces no flash of unstyled content; the first frame renders before editor chrome is interactive.
- **States:** camera (permission-denied, limited, capturing, recording, idle), picker (skeleton, empty, error, denied, limited, populated), seeding (loading, failure+retry, offline) — all art-directed.

## Out of scope (this iteration)

- Look composer (CreatorToolDock) — separate surface
- PosterViewerScreen playback logic — separate surface
- Backend data sources for effects/lenses — the renderer is wired, data is not
- Tool pinning personalization (2026 roadmap) — future iteration after the workspace is simplified
