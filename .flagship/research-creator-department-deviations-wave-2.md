# Creator Department — Wave 2 Research Report: Deep Engineering Deviations

**Date:** 2025-11-17
**Scope:** Timeline model coherence, capture-to-edit continuity, preview/export parity, PosterComposerScreen decomposition, backend upload contract.
**Method:** Static code audit + parallel subagent research across three tracks.

---

## Executive Summary

Wave 1 fixed five surface-level deviations (focal-point persistence, crop zoom model, AI-powered publish pipeline, safe-zone preview, timeline drag-to-reorder). Wave 2 reveals **deeper structural problems** in the timeline editing model that cause silent data loss, broken playback, and divergent UI vs. export behavior. The most critical finding is that the timeline operates on **two parallel projections** that drift: a UI derivation (`timelineClips`/`timelineOverlays`) and a canonical playback projection (`projectTimeline`). When they disagree, the user sees one thing, playback shows another, and export renders a third.

The PosterComposerScreen monolith (3,893 LOC, ~20 sub-domains) is the root enabler: the divergent derivations exist because the screen manually re-derives timeline state instead of consuming the canonical projection.

---

## P0 Findings (Critical — silent data loss or broken behavior)

### P0-1: Split is not page-aware and creates unrenderable document state

**Evidence:** `PosterComposerScreen.tsx:1133-1207`, `CreatorContext.tsx:491-513`, `TimelineProjector.ts:140-147`

Split calls `splitClip()` on the UI `timelineClips` snapshot, then mutates the document via `updateLayer` + `addLayer`. Both `updateLayer` and `addLayer` target `activePageIndex`, **not the clip's owning page**. If the selected clip belongs to another page, the edit no-ops or writes to the wrong page. Even when on the correct page, `addLayer` appends a second media layer to the same page, but `TimelineProjector.findMediaLayer` only returns the **first** visible media layer per page — the second half is invisible in playback. Meanwhile the UI track shows both clips. The user sees two clips; playback shows one.

**Impact:** Silent data corruption. The user splits a clip, sees two clips in the timeline, but playback and export only render the first half. The second half is a ghost.

**Fix:** Split must resolve the clip's owning page, create a new page for the second half, update `page.durationMs`, and route all clip mutations through a clip-to-page resolver.

### P0-2: Replace loses trim, speed, volume, effects, and selection

**Evidence:** `PosterComposerScreen.tsx:1222-1227`, `CreatorAssetPicker.tsx:735-746`, `TimelineOperations.ts:249-267`

Replace ignores its typed payload (`op.newAssetId`/`op.newUri`) and just opens the media picker. The picker constructs a **brand-new layer** with a new id and default trim/speed/volume — it does not preserve the existing clip's `trimStartMs`/`trimEndMs`/`speed`/`volume`/`effects`. `replaceClipAsset` and `replacePosterFrameMedia` exist but are **never called**. After replace, `selectedClipId` points to the old (now-replaced) id and is stale.

**Impact:** Replacing a clip silently discards all the user's trim/speed/volume work. The user has to re-trim, re-speed, and re-adjust every time they replace a clip.

**Fix:** Implement a real replace flow: keep the existing layer id, copy `trimStartMs`/`trimEndMs`/`speed`/`volume`/`effects`/`zIndex`, update `mediaUri`/`mediaType`/`videoDurationMs`, clear `thumbnailUri`. Call `replaceClipAsset` for validation. Update `selectedClipId` to the preserved id.

### P0-3: Overlay timeRange semantics are inconsistent (broken overlay timing)

**Evidence:** `PosterComposerScreen.tsx:761-802`, `OverlayTrack.tsx:152-178`, `TimelineProjector.ts:247-250`, `CreatorCanvas.tsx:974-978`

Four different interpretations of `layer.timeRange`:
1. `timelineOverlays` derivation ignores `layer.timeRange` and recomputes from `page.durationMs`.
2. `OverlayTrack` commits **absolute timeline** `timeRange` values.
3. `TimelineProjector` treats `layer.timeRange` as **clip-relative** and adds `clipStartMs`.
4. `CreatorCanvas` compares global `timeMs` directly against `layer.timeRange` as if **absolute**.

Result: dragging an overlay in the UI snaps back visually (because the derivation ignores the stored value), while playback double-offsets or miscompares. Overlays on pages with video are dropped entirely from the timeline UI (the derivation `break`s after the first video layer).

**Impact:** Overlay timing is broken. The user drags an overlay to a time position, it snaps back. Overlays on video pages don't appear in the timeline at all.

**Fix:** Store overlay `timeRange` as **clip-relative** in the document. Convert to absolute in `OverlayTrack` and `TimelineProjector`. Add an owning `clipId` to overlays so they follow clips on reorder/trim/split.

### P0-4: Selection is not kept coherent with active page

**Evidence:** `PosterComposerScreen.tsx:694`, `PosterComposerScreen.tsx:2639`, `CreatorContext.tsx:491-513`

`onSelectClip` sets only `selectedClipId`; it does not set `activePageIndex`. All mutations (`updateLayer`, `addLayer`, `removeLayer`, `duplicateLayer`) use `activePageIndex`. If the user selects a clip on page 3 while `activePageIndex` is 0, every edit (trim, speed, volume, split, delete) targets page 0 — the wrong page.

After split, `selectedClipId` stays on the original (first half); the new clip is not selected. After replace, the layer id changes, so `selectedClipId` points to a non-existent id. After delete, it is set to `null` (correct).

**Impact:** Edits silently target the wrong page. The user trims a clip and nothing happens (or a different clip on the active page is trimmed).

**Fix:** On clip selection, also `setActivePageIndex` to the clip's page. After split/duplicate/replace, update `selectedClipId` to the new clip id. After any mutation, validate `selectedClipId` against current `timelineClips` and reset if missing.

---

## P1 Findings (Significant — wrong behavior, no silent data loss)

### P1-1: Two divergent timeline derivations

**Evidence:** `PosterComposerScreen.tsx:702-737` (UI) vs `TimelineProjector.ts:127-131` (playback)

The UI derives `timelineClips` by iterating every media layer in every page, using `page.durationMs` fallbacks and ignoring `speedCurve`. The playback projection uses `projectTimeline` with `averageSpeed(speedCurve)` and only the first media per page. They diverge whenever a clip has a speed curve or a page contains multiple video layers.

**Fix:** Use a single canonical projection (`projectTimeline` or `PosterSequence`) for both the timeline UI and playback. Remove the divergent `timelineClips`/`timelineOverlays` derivation.

### P1-2: Transitions are page-level, not clip-pair, and break on split/reorder

**Evidence:** `composition.ts:512`, `PosterComposerScreen.tsx:746-759`, `TimelineOperations.ts:469-507`

Transitions are stored as `page.transitionId`. After a split (which adds a second clip to the same page), the within-page boundary is `null`. After reorder, clip indices are passed to `reorderPages` (which expects page indices) — if a page has multiple clips after a split, the wrong page is moved. `addTransition`/`removeTransition` exist in `TimelineOperations` but are never used.

**Fix:** Model transitions as clip-pair objects (`fromClipId`, `toClipId`, `durationMs`). Update/remove on split/duplicate/delete/reorder. Clamp duration to the shorter adjacent clip.

### P1-3: Volume bypasses the pure timeline model

**Evidence:** `PosterComposerScreen.tsx:1121-1132`, `TimelineOperations.ts`

Volume changes call `updateLayer` directly with `payload.volume`. There is no `setClipVolume` in `TimelineOperations.ts`. No clamping/validation, and the pure model is skipped (unlike speed, which routes through `setClipSpeed`).

**Fix:** Add `setClipVolume` to `TimelineOperations.ts` (clamp 0..1, no duration change). Route the `volume` operation through it before `updateLayer`.

### P1-4: Undo/redo does not restore timeline UI state

**Evidence:** `PosterComposerScreen.tsx:468-477`, `CreatorContext.tsx`/`history.ts:21-32`

Document-level undo/redo works, but `selectedClipId`, `selectedOverlayId`, playhead position, `bottomSurface`, and picker mode are local state and not restored on undo. After undo, selection may point to a removed clip. Split creates **two** history entries (`updateLayer` + `addLayer`), so undoing a split requires two undo actions.

**Fix:** Either include transient timeline UI state in history entries, or reset them to safe defaults on undo. Wrap multi-step operations like split in a single history transaction.

### P1-5: Reorder maps clip indices to page indices (breaks after split)

**Evidence:** `PosterComposerScreen.tsx:1239-1244`

Reorder passes clip indices to `reorderPages` (which expects page indices). If a page has multiple clips after a split, the wrong page is moved. The drag-to-reorder added in Wave 1 inherits this bug.

**Fix:** Move to a clip-centric canonical timeline model where reorder operates on clips, not pages.

### P1-6: `page.durationMs` goes stale after mutations

**Evidence:** `PosterComposerScreen.tsx:702-737`, `composition.ts`

`page.durationMs` is never updated after trim/split/speed changes, but it is used for overlay offsets and trim fallbacks (`p.durationMs ?? 5000`). It becomes stale, causing overlays and trim fallbacks to use wrong durations.

**Fix:** Recompute `page.durationMs` from clip durations after every mutation, or remove it from the model and derive it always.

---

## P2 Findings (Decomposition / architecture)

### P2-1: PosterComposerScreen is 3,893 LOC with ~20 sub-domains

**Evidence:** `PosterComposerScreen.tsx` — `PosterComposerInner` spans lines 136–3,323 (~3,188 LOC). Violates AGENTS.md §4 (400 LOC screen budget, max 3 sub-domains).

**Decomposition plan** (from subagent audit):

| Step | New file | Lines extracted | Difficulty | LOC removed |
|------|----------|-----------------|------------|-------------|
| 1 | `usePosterSession.ts` | 838–934 | Easy | ~70 |
| 2 | `usePosterEntryTransition.ts` | 1255–1301, 2138–2156 | Easy | ~100 |
| 3 | `usePosterEffects.ts` | 1528–1676, 1308–1346, 3247–3286 | Easy | ~160 |
| 4 | `posterToolRailConfig.ts` | 1808–2136 | Medium | ~250 |
| 5 | `usePosterFrameNavigation.ts` | 1303–1401 | Medium | ~120 |
| 6 | `usePosterTimeline.ts` + `usePosterPlayback.ts` | 508–685, 687–1248 | Medium | ~450 |
| 7 | `usePosterTopBarActions.ts` | 316–344, 346–373 | Easy | ~90 |
| 8 | `usePosterTextColor.ts` | 209, 3109–3146 | Easy | ~60 |

**Total potential reduction:** ~1,300–1,500 LOC, bringing the screen closer to the 400 LOC budget.

### P2-2: Backend multipart upload exists but frontend doesn't use it

**Evidence:** `backend/api/src/routes/uploads.ts:719-894` (multipart initiate/parts/complete/abort), `frontend/src/services/mediaUploadQueue.ts` (no multipart references)

The backend already supports S3 multipart resumable uploads (`/uploads/multipart/initiate`, `/uploads/multipart/:id/parts`, `/uploads/multipart/:id/complete`, `/uploads/multipart/:id/abort`). The frontend queue only uses single-presign PUT. Large videos cannot resume from a network interruption — they must restart from byte 0.

**Fix:** Extend `mediaUploadQueue.ts` to use multipart for files above a threshold (e.g., 10MB). The backend contract already exists.

---

## Snapchat / Instagram Parity Gaps (from research)

### Snapchat Timeline Editor gaps
- Replace resets trim/speed/volume (Snapchat preserves them)
- Reorder breaks after split (Snapchat operates on clips, not pages)
- Overlay timing is broken (Snapchat has clip-anchored overlays)
- Transitions are page-level (Snapchat has clip-pair transitions)
- Crop & rotate per clip not exposed in timeline toolbar
- Undo/redo doesn't restore selection/playhead

### Instagram Reels gaps
- No multi-track audio (Reels supports 20 tracks)
- No beat markers / audio-to-beat alignment
- No clip-anchored overlays
- No clip-pair transitions with duration
- Speed curves exist in the model but the timeline UI ignores them
- No volume curves
- No Align tool
- Selection/playhead not part of undo stack

---

## Implementation Priority (Wave 2)

### P0 (must fix — silent data loss / broken behavior)
1. **Fix selection coherence** — sync `activePageIndex` on clip select; update `selectedClipId` after split/replace
2. **Fix replace** — preserve id, trim, speed, volume, effects; clear thumbnail
3. **Fix overlay timeRange semantics** — clip-relative in document, absolute in UI/projector
4. **Fix split page-awareness** — create new page for second half, don't add second media layer

### P1 (should fix — wrong behavior, no silent data loss)
5. Add `setClipVolume` to `TimelineOperations.ts`
6. Unify timeline derivation (use `projectTimeline` for both UI and playback)
7. Move transitions to clip-pair objects
8. Reset selection/playhead on undo
9. Wrap split in a single history transaction

### P2 (architecture — enables future fixes)
10. Begin PosterComposerScreen decomposition (start with `usePosterSession`, `usePosterEffects`)
11. Extend upload queue to use backend multipart for large files

---

## What This Report Does NOT Cover

### Capture-to-edit and preview/export parity (from subagent 3)

The third research track revealed additional **P0 findings** about the export pipeline:

**P0-5: Native export module is a spec, not an implementation.** `frontend/modules/thryft-media-export/` contains only the Nitro TypeScript spec (`ThryftMediaExport.nitro.ts`) and a JS wrapper (`index.ts`). No Swift/Kotlin native implementation files exist. `isMediaExportAvailable()` returns `false` in all builds. The "native export pipeline" described in the spec does not exist at runtime.

**P0-6: Exported render PNG is produced but never used as published media.** `useCreatorPublishWorkflow.ts:685-694` writes `exportedRenderUrl` to `workingDoc.metadata`, but `compositionContract.ts:222-314` sets `mediaUrl` from the source upload. No backend route consumes `exportedRenderUrl`. The user's edited composition is silently discarded at publish time.

**P0-7: Export failure silently falls back to source media.** `useCreatorPublishWorkflow.ts:696-699` catches export errors with `console.warn` and continues publishing the unedited source file. The user is not informed that their edits were lost.

**P0-8: Backend does not render composition_document.** `backend/api/src/services/creatorPublicationService.ts:586-606` stores `media_url` (source) + `composition_document` (JSONB) but no FFmpeg/sharp pipeline burns edits into the media. Feed/carousel surfaces use the source `mediaUrl`, so authored layers are lost in discovery.

**P1-7: Video preview does not reflect trim/speed/reverse/freeze/effects.** `CreatorCanvas.tsx:1675-1747` falls back to native `VideoView` which ignores trim, speed, reverse, freeze, and per-pixel effects. The user sees none of their video edits in the preview.

**P1-8: InstantCut selected layout is ignored before publish.** `LookComposerScreen.tsx:1878-1889` defines `onPublish={(_layoutId) => ...}` and `onOpenEditor={(_layoutId) => ...}` — both ignore the layout ID. The user picks a layout and it is silently discarded.

**P1-9: Export progress is faked / cancellation doesn't cancel export.** `useCreatorPublishWorkflow.ts:655-699` maps export progress into a range but only when `isExportAvailable()` is true (which is never). `handleCancelUpload` aborts uploads but never calls `cancelExport`.

**P1-10: Video capture forces static-image review.** `CreatorCamera.tsx:1632-1676` always renders `<Image>` for the review overlay, even for video captures. Labels say "Use this photo" regardless of media type.

### Updated implementation priority

The export pipeline findings (P0-5 through P0-8) are the most critical: **the user's edits are silently discarded at publish time**. However, implementing a full native export module is out of scope for this wave. The immediate fixes are:

1. **P0-4: Fix selection coherence** (sync activePageIndex on clip select)
2. **P0-2: Fix replace** (preserve trim/speed/volume/effects)
3. **P0-3: Fix overlay timeRange semantics** (clip-relative in document)
4. **P0-7: Fail closed on export failure** (don't silently fall back to source)
5. **P1-8: Wire InstantCut selected layout** (commit before publish)
6. **P1-3: Add setClipVolume** (route volume through pure model)
7. **P2-1: Begin PosterComposerScreen decomposition** (start with safe extractions)
