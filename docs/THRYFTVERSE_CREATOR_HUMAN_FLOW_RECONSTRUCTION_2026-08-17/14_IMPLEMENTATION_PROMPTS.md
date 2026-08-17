# Implementation Prompts — Human Flow Reconstruction

## Prompt 01 — Remove creator dashboard
Refactor `CreatorEntryScreen.tsx`. Delete the default 2×2 Camera / Photos / Items / Templates grid and Start with text primary entry. Make `CreatorCamera` the first rendered creator state. Preserve drafts/templates as secondary routes. Do not create a replacement splash page.

## Prompt 02 — Restore Look / Poster / Search switch
Build `CreatorModeSwitch` on the live camera. Tap/swipe, selected state, persisted last mode, no route transition. Avoid a bulky rounded segmented control.

## Prompt 03 — Direct acquisition router
Build `CaptureToEditorRouter`: Look media → Look editor; Poster media → Poster editor; Search media → search flow. No intermediate action page.

## Prompt 04 — Remove single-capture quick review
For normal Look/Poster single capture, transition directly into editor. Keep batching UI only for explicit multi-capture and confirmation only where Search quality requires it.

## Prompt 05 — Simplify camera chrome
Default only Close / Flash / Gallery / Shutter / Flip / mode switch / minimal zoom. Move Timer / Grid / Hands-free / Speed / Green Screen / Effects / Multi behind Tools.

## Prompt 06 — Remove duplicate Look layout surfaces
One Layout interaction only. Default renders neither AutoLayoutBar nor LayoutPreviewRail. Tap Layout to show real previews.

## Prompt 07 — Items drawer
Replace persistent LookSourceTray with an Items drawer opened from the Items tool. Closet / Listings / Search; tap or drag to canvas; temporarily replace bottom rail.

## Prompt 08 — Mutually exclusive bottom surfaces
Introduce a lower-surface state machine in Look and Poster. Never render layout rail, source tray, context rail and effects rail simultaneously.

## Prompt 09 — Humanize crop
Promote `InCanvasCropOverlay`: direct pan/zoom, precise handles, subtle grid, Reset/Done, one history commit. Remove normal `CreatorCropSheet` use.

## Prompt 10 — Fold AI into goals
AI effects live under Effects. Do not add a persistent AI destination. Post-capture-only camera effects move to editor or behind Tools.

## Prompt 11 — Poster photo mode without timeline
Single-photo Poster has no permanent timeline. Timeline expands for video, multiple clips or Edit Clip.

## Prompt 12 — Demote templates
Templates live in More/project starts, not first-screen creator choices.

## Prompt 13 — Anti-slop visual deletion pass
Remove unnecessary cards, subtitles, gradients, pills, duplicated rails and non-causal animation. Review screenshots for content dominance rather than “component polish.”

## Prompt 14 — Flow telemetry
Track creator_open → camera_visible → gallery/capture → editor_visible → first_edit → publish. Measure taps, latency and abandonment. Camera should require zero extra taps; capture-to-editor automatic.

## Prompt 15 — Human-flow verification
Run: (A) open → capture → add text → share; (B) open → Look → select four images → arrange → add item → share; (C) open → Search → capture → results. Any point where a tester has to stop and ask “which option should I choose now?” is a failure.
