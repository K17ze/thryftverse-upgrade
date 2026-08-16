# File-by-File Action Matrix

| File / area | Validation | Required action |
|---|---|---|
| `CreatorAssetPicker.tsx` | mega-router still alive | finish decomposition; deprecate/remove adapter |
| `tools/text/TextEditorSheet.tsx` | weak color + coarse effects | shared full color picker; real effect params; tighter inline editing |
| `tools/text/textStylePresets.ts` | font breadth but inconsistent editorial taste | curate central font registry; avoid novelty count-chasing |
| `surfaces/ContextToolRail.tsx` | hierarchy good, craft weak | CreatorToolButton + active state + specialized glyphs |
| `core/toolRegistry.ts` | good foundation | add/derive selected/active state |
| `tools/drawing/DrawingWorkspace.tsx` | HEX good; legacy slider/path behavior | shared color; RNGH/Reanimated; pinch size; hit-target audit |
| `look/BackgroundSheet.tsx` | partial | validated shared color; custom gradients; implement/remove Image |
| `tools/effects/EffectTypes.ts` | web/CSS-oriented preset data | native matrix/LUT effect graph |
| `tools/effects/EffectPreviewThumb.tsx` | native preview unreliable | Skia/native preview renderer |
| `tools/effects/AdjustPanel.tsx` | PanResponder slider | shared CreatorSlider |
| `tools/effects/AutoAdjust.ts` | static constants | rename Enhance or implement real analysis |
| `surfaces/CutoutPreviewSheet.tsx` | polished UI shell | real provider + real refinement |
| `core/cutout/CutoutService.ts` | probes missing modules | install/own one backend; eliminate speculative runtime list |
| `CreatorCanvas.tsx` | canonical candidate, but ignores advanced media state | implement effects/masks/keyframes/time/playback controller |
| `compositionContract.ts` | full composition persisted | keep; add vNext schema/render validation |
| `PosterViewerScreen.tsx` | reuses CreatorCanvas | good architecture; benefits once Canvas becomes truly canonical |
| `poster/PosterComposerScreen.tsx` | huge orchestration; timeline projection | extract controller/playback; canonical temporal state |
| `poster/timeline/TimelineTypes.ts` | useful vocabulary | move into composition schema vNext |
| `poster/timeline/*` | real surface components | bind to one native playback clock and actual audio data |
| `CreatorContext.tsx` | growing monolith | split session/history/project/selection/domain controllers |
| `core/projectStore/ProjectStore.ts` | real foundation | canonical path; true checkpoint; validation; explicit migrations |
| `core/projectStore/AssetRegistry.ts` | real media copy | wire every acquisition path; video proxy/thumb/waveform |
| `core/upload/UploadManager.ts` | persistent retry | multipart/TUS/native background transfer |
| `CreatorPublishSheet.tsx` | job wiring with transport bugs | remove bytesTotal=0; proper MIME; observe actual bytes; no fake resume copy |
| `mediaUploadPipeline.ts` | legacy duplicate | retire only after replacement is production-proven |
| `CreatorAnimations.tsx` | useful primitives | unify press/control motion; consider interactive sheet detents |
| `LookComposerScreen.tsx` | large | split orchestration/controller/panels |
