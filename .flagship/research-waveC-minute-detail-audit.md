# Wave C — Minute-Detail Competitive Audit: Creator Department

Date: September 2026. Method: live source research (official help/newsroom/creator pages, App Store copy, independent technical analyses, IMG.LY timeline UX research) cross-verified against the working tree with file/line evidence. Classification tags: **[P]** primary doc, **[S]** secondary analysis, **[O]** observed in code.

## What competitors do that we verified, point by point

### Instagram Edits (primary: creators.instagram.com/blog/workflow-editing, Aug 2026 update)
- Frame-accurate trimming; multi-track timeline; clip **trim / split / reorder / duplicate / replace / lock** [P]
- Keyframes with easing; overlay templates; **item-to-item alignment guides** on canvas [P]
- Project versions + folders; auto captions; bilingual caption translation [P]
- Voice enhancement / noise reduction; green screen; cutout [P]
- 4K watermark-free export, up to 15 min (iOS) [P]
- Performance insights + Instagram-oriented publish flow [P]

### Snapchat (primary: help.snapchat.com + newsroom)
- Timeline Editor: single main video track + separate music/text/sticker layers; trim handles; split/duplicate/replace/speed/volume/crop-rotate/delete; **press-and-hold reorder**; layer appearance windows [P]
- Director Mode: hands-free/multi-clip recording, speed while recording [P]
- Quick Cut: auto clip selection + music sync [P]
- Lightweight, progressive-disclosure editing UI [P]

### Timeline micro-interaction layer (IMG.LY research + editor analyses) [S]
- Pinch-to-zoom timeline, fixed-playhead scrub, frame-quantized snapping
- **Edge auto-scroll while trimming/dragging near viewport edge**
- Snap to playhead + adjacent clip edges (magnetic)
- Track locking and linked tracks; transactional gesture commits with undo
- Waveform + thumbnail caching; proxy/low-res preview strategies
- Slip editing (drag clip body to shift source window without moving its timeline position)

## Cross-verification vs current tree [O]

| Competitor detail | Status | Evidence |
|---|---|---|
| Pinch-zoom timeline | ✅ present | `PosterComposerScreen.tsx` ~674–751, 1591–1604 (shared scale across clip/ruler/waveform/playhead) |
| Magnetic snap (playhead + neighbors) | ✅ present | `usePosterTimeline.ts` SNAP_MS=150, playhead + adjacent-edge snapping |
| Smart alignment guides on canvas | ✅ present | `CreatorCanvas.tsx` 601–1152 (smart guides, center guides, snap-on-drop, O(n²) throttled off UI thread) |
| Press-and-hold reorder | ✅ present | `ClipThumb.tsx` reorderGesture activateAfterLongPress(300) |
| Waveform track | ✅ present | `WaveformTrack.tsx`; WAV real extraction, honest flat-line otherwise |
| Canvas lock flag | ✅ enforced | `CreatorCanvas.tsx` gesture `.enabled(!layer.locked)`; layers sheet lock toggle; a11y labels |
| **Clip lock on timeline ops** | ❌ **gap** | `usePosterTimeline.handleTimelineOperation` — trim/split/duplicate/delete/replace/speed/volume/reorder all bypass `layer.locked`; a canvas-locked clip can still be split/deleted/reordered via timeline. `PosterClip` doesn't even carry `locked`. |
| Lock affordance on selected clip | ❌ **gap** | `TimelineToolbar.tsx` — no lock toggle; user must open layers sheet |
| **Edge auto-scroll during trim/reorder** | ❌ **gap** | `ClipThumb` pan gestures have no scroll feedback; timeline `ScrollView` (PosterComposerScreen ~1601) is static during drags. Trimming past the viewport edge is impossible when zoomed. |
| Frame-quantized snap | ⚠️ partial | Snap is wall-clock 150ms; export renders at 30fps (`mediaExportService` fps:30) — snap targets aren't frame-aligned. Parked: needs source-fps metadata for truth. |
| **Camera-roll export** | ❌ **gap** | `mediaExportService` renders only for the upload pipeline; no Save affordance in composer/viewer. `expo-media-library` IS installed. Edits' signature feature is 4K export to camera roll. |
| Slip editing | ❌ absent | no source-window drag. P2 — pro feature. |
| Project versions/folders | ❌ absent | draft autosave only. P2 — product-scope. |
| Async publish processing | ❌ known | W12-P1-6, largest remaining lift. Parked for dedicated wave. |
| Capture grammar | ✅ mostly | tap=photo/hold=video (250ms), zoom steps, double-tap flip, countdown, hands-free mode (`CreatorCamera.tsx`) |
| Speed curve → constant speed sync | ✅ fixed | Wave B: `speed = averageSpeed(curve)` |
| Viewer/export parity | ✅ fixed | Wave B: `pageWithRenderedMedia` |

## Wave C implementation targets

- **C1 Clip-lock parity** — carry `locked` through PosterClip; guard every mutation op in `handleTimelineOperation` (trim/split/duplicate/delete/replace/speed/volume/reorder/moveOverlay); Lock/Unlock in TimelineToolbar; lock badge + trim-handle suppression in ClipThumb; block reorder drag of locked clips.
- **C2 Edge auto-scroll** — auto-scroll the timeline ScrollView when a trim handle or reorder drag approaches the viewport edge (animated ref + worklet scrollTo, scroll offset via animated scroll handler).
- **C3 Save to camera roll** — post-publish Save affordance on PosterViewerScreen downloading the baked `media_url` via expo-media-library (truthful: saves exactly what was published; pre-publish video export stays native-module-gated).
