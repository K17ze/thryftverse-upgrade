# 13 — Screen-by-Screen / Component-by-Component Gap Matrix

| Current surface / file | Current useful behavior | Why it still feels behind | Target |
|---|---|---|---|
| `CreatorEntryScreen.tsx` | camera-first, gallery, ordered multi-select, Aa blank | intent is too binary; gallery/browser duplicated elsewhere | intent-aware camera/photos/items/template entry using one media browser |
| `CreatorCamera.tsx` | real capture, recording, focus, timer, grid, multi | 15s raw cap, digital zoom labels, early media permission | durable capture session, truthful capabilities, longer source capture |
| `camera/ControlsRail.tsx` | isolated controls | tool hierarchy should adapt to capture mode | contextual top/side rail, progressive disclosure |
| `CreatorAssetPicker.tsx` | broad feature coverage | mega mode router makes every tool feel like a sheet | tool registry + dedicated experiences |
| `PosterComposerScreen.tsx` | full-screen stage, frame navigation, context actions | frames are not a real temporal editor | canvas + always-available timeline for video |
| `FrameTray` | frame management | not equivalent to clip editing | remain for photo/frame overview; coexist with timeline |
| `LookComposerScreen.tsx` | 4:5 spatial model, auto arrange, product source | blind layout cycling, no real cutout, extra tray competition | preview-first layout rail + direct commerce drawer |
| `LookSourceTray` | commerce discovery | consumes chrome, tap-add rather than direct spatial action | collapsed peek + drag-to-canvas |
| `CreatorCanvas.tsx` | normalized transforms and layer rendering | must become canonical renderer with masks/effects/timing | shared render core editor/viewer/export |
| `CreatorCropSheet.tsx` | crop workflow | full separate sheet can break continuity | in-canvas crop mode + precision sheet |
| `CreatorCutoutSheet.tsx` | manual rectangular trace crop | product-level Cutout wording overpromises | truthful Crop now; alpha-mask segmentation later |
| `CreatorLayersSheet.tsx` | global layer management | overkill for routine object selection/order | local context + layer sheet only for advanced stack |
| `CreatorTemplateBrowser.tsx` | templates | template often treated as selection artifact | inspectable project templates |
| `CreatorPublishSheet.tsx` | validation, upload, success/error | upload coupled to foreground sheet; progress is synthetic fractions | observes durable upload jobs + real bytes |
| `mediaUploadPipeline.ts` | local URI scan, retry | sequential foreground uploads | persistent resumable job manager |
| `drafts.ts` | local JSON drafts | references may outlive source media; no project package | durable project directory + asset registry |
| `history.ts` | simple undo/redo snapshots | full snapshots scale poorly; 50 states | semantic commands/patches + coalesced continuous changes |
| `composition.ts` | rich layer union | temporal/effect/mask model incomplete | v2 time ranges, masks, effect graph, asset registry |
