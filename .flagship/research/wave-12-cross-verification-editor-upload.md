# Wave 12 — Cross-Verification Report: Editor & Media Upload Department

**Date:** 2026-09-11
**Benchmarks:** Snapchat (main app + Timeline Editor 2025 + Quick Cut), Instagram (Edits app + Reels editor + Stories + upload pipeline), CapCut / VN / TikTok, BytePlus NLE SDK + video-editor SDK consensus.
**Method:** Live web research (4 parallel tracks, ~105 sources, evidence-classed) + direct repo verification (file:line evidence below). Prior wave-2 deviations doc re-validated against current code.

Research inputs:
- `.flagship/research/wave-12-snapchat-creator-stack.md`
- `.flagship/research/wave-12-instagram-edits-stack.md`
- `.flagship/research/wave-12-capcut-vn-tiktok-editors.md`
- `.flagship/research/wave-12-rn-technical-stack-2026.md`

---

## 1. What the benchmarks actually engineer (verified mechanisms)

| Mechanism | Snapchat | Instagram/Meta | CapCut/VN | Why it matters |
|---|---|---|---|---|
| Render model | Media + separate overlay PNG shipped together (`MediaReferenceType.OVERLAY`); same overlay renders in preview, on recipient devices, in Memories — WYSIWYG structural | Single Meta AV engine powers Edits + IG preview AND export ("ops-list replayed to encoder") | One immutable doc + transaction log; single render graph consumed by preview and export; preview degradation is explicit (proxy mode) | **One render truth.** Edits are data; preview and export consume the same description. |
| Upload pipeline | Durable SQLite send queue; enumerated step states (RESOLVE→SAVE→ENCRYPT→TRIM→TRANSCODE→ZIP→UPLOAD→POST_UPLOAD_UPDATE); survives process death; per-recipient failure granularity | Segmented upload: per-segment encode+upload overlap, segment-level resume/retry → **>2× latency cut, ~5× failure reduction**; container handshake: create → rupload → poll `uploading/processing/publishing_phase` → publish | (client editors; publish delegated to host apps) | Upload is a **persisted state machine**, not a promise chain. |
| Network resilience | QUIC/Cronet connection migration survives Wi-Fi↔WWAN handoff (+20% send success); chunked fMP4 parallel transcode+encrypt+upload (patent US12610072) — upload starts before export finishes | rupload byte-offset resume; EXPIRED containers (24h) | — | Treats the mobile network as hostile; assumes process death mid-upload. |
| Posting UX | Non-blocking post; status visible on profile/story surface (fix cut Spotlight upload complaints 30%→<10%); Pending vs "Failed → Tap to Retry" | Optimistic post-on-profile + per-item retry; background-post push notification; explicit "processing" phase label | — | Posting is optimistic, visible, resumable — never a blocking modal. |
| Timeline model | Single video track + separate lanes for music/captions/stickers; drag clip ends to trim; tap → Split/Duplicate/Replace/Speed/Volume/Crop/Delete; hold to reorder; drag layer = appearance window | Edits: multi-track timeline, keyframes w/ easing, **track linking** toggle, beat markers, clip locking, safe-zone overlay showing destination chrome | CapCut: gapless-magnetic main track + free overlay lanes; segments carry `target_timerange` + `source_timerange`; speed/mask/transition = companion materials; keyframes auto-insert on property change; frame-quantized snapping | The timeline is a **document projection**, not a parallel UI model. Overlay anchoring is explicit. |
| Speed curves | Speed control in timeline actions | Edits keyframe easing | CapCut curve editor: presets + custom points 0.1×–10×; smooth slow-mo via frame blending/optical flow | Curves are first-class data, rendered in preview AND export. |
| Undo | Scoped LIFO per tool (no global undo — deliberate) | Reels editor: undo ×20 | CapCut: transaction-log undo/redo unbounded; VN: non-destructive autosave drafts | Undo is cheap when the doc is immutable + transactional. |
| Drafts | Memories-save (no formal drafts surface) | Local-only, 7-day TTL, no cloud sync (**documented weakness**) | CapCut autosaves every edit (crash-safe to last save); deleted projects → Trash | Draft durability is a flagship differentiator none of them fully solve. |
| Capture | tap=photo/hold=video; drag-lock/flip/zoom mid-record; auto-segmented Long Snap; Director Mode; camera-failure watchdog self-heals stalled AVCaptureSession; capture latency is a governed p90 metric | Align (onion-skin), Gesture Control, Dual; "First Draft" auto-cut (Aug 2026) | — | Capture is gesture-dense and failure-tolerant. |
| Processing states | Submitted→Live moderation states; Memories Backup Progress | IN_PROGRESS/FINISHED/ERROR/EXPIRED/PUBLISHED; "processing" phase explains the 99%-stall | Determinate export progress (added Aug 2025, CapCut-killer feature) | Honest multi-stage status beats fake progress. |

---

## 2. What we have now (verified current state)

**Upload/publish (strong after Waves 1-3, 11 + recent edits):**
- `UploadManager`: AsyncStorage-persisted jobs, AbortController cancel, jittered backoff, multipart >10MB with per-part ETag capture + resume, `reconcileOnStartup()` once-per-session, `pauseJob`/`resumeJob`, paused-vs-failed distinction preserved across aborts.
- `mediaUploadQueue` (listing path): XHR real byte progress (STATUS_PROGRESS fake-percent deleted), NetInfo-gated with generation-guarded teardown, `destroy()`, finalization-only retry, retryable error classification.
- Publish workflow (`useCreatorPublishWorkflow`): discriminated-union state machine (review/saving/uploading/processing/publishing/error/success/scheduled/unknown/scheduleUnknown/conflict), persisted idempotency keys + `reconcilePublicationAttempts` on mount, real byte progress mapped 0.15–0.7, dismiss-to-background (IG pattern), AppState toast, cache invalidation + draft cleanup, lock-version + doc-hash optimistic concurrency, humanized errors.

**Editor/timeline (strong after decomposition + recent fixes):**
- `usePosterTimeline` extracted (727 LOC): page-aware split via `clipPageIndices` + atomic `commitDocument` (one undo entry), magnetic trim snap (150ms to playhead + adjacent boundaries), speed/volume through pure ops, overlay moveOverlay → absolute timeRange, selection coherence effect, transition boundary taps navigate to source page.
- `usePosterPlayback`: canonical `projectTimeline`, single PlaybackClock, video adapter with 100ms-throttled source-time mapping (trim+speed aware), honest forward-only fallback for reverse/freeze (labeled, timeline badge).
- TimelineProjector: `averageSpeed(speedCurve)`, absolute overlay timeRange (P0-3 fixed), `computeSourceTime` handles reverse/freeze/curve.
- Canvas: full UI-thread gesture stack (89 worklet refs), trash-zone SharedValue + haptic, safe-zone overlay, multi-drag, freeze-frame Skia preview (`useFreezeFramePreview` decodes actual frame), keyframe + speed-curve editors, 63 keyframe/animation consumers.
- Undo/redo UI: top bar + timeline, labeled, accessible.
- Draft autosave: 5s idle-debounce, truthful idle/saving/saved/failed, CrashJournal.
- Cross-renderer filter parity: 10 matrices byte-identical JS↔backend (11 tests).
- Backend `compositionRenderer`: image path complete (focal crop, effects, filter matrices, text w/ stroke/shadow/bg, all sticker types, draw paths); video path has remux (trim/mute stream-copy) + transcode classification with defensive per-layer skip + no-overlay retry.

---

## 3. The gap registry (cross-verified, evidence-backed)

### P0 — truthfulness violations (silent data loss / fabricated behavior)

**W12-P0-1 · Published video silently drops ALL authored edits**
- Evidence: `creatorPublicationService.ts:612-615` — `renderCompositionMedia` returns `{renderedUrl: null}` for `mediaType==='video'` ("deferred"). `renderPosterFrameCompositions:746-748` skips video frames. `renderVideoComposition` (the entire FFmpeg remux/transcode engine, ~300 LOC) is **unreachable dead code** on the publish path.
- Worse: the early return sets NO `renderFailed` flag — a video carrying authored trim/speed/text/stickers publishes the raw source with zero signal.
- Viewer side: `PosterViewerScreen.tsx:844` renders CreatorCanvas when `compositionDocument` exists, but the trim/speed playback adapter lives in `usePosterPlayback` (editor screen hook) — the viewer's canvas has no clock driving source-time mapping; `:851` direct `<Video source={mediaUrl}>` path ignores `trimStartMs/trimEndMs/speed` entirely (fields are carried in frame data, unused).
- Competitor bar: Instagram SVE transcodes during upload; Edits/IG preview and export share one engine. Snap ships media+overlay pair so recipients re-render. **Our published artifact matches neither model for video.**
- Fix: (a) wire `renderVideoComposition` into `renderCompositionMedia` for video + set `renderFailed`/`nonTrivial` on failure (fail-closed, matching image path); (b) OR keep video edits viewer-applied by driving the viewer's canvas with a playback clock (trim/speed honored at view time). (a) is required regardless for non-app surfaces (share cards, OG, thumbnails, downloads) and single-source truth; (b) additionally needed so in-app playback matches.

**W12-P0-2 · Transcode path drops authored ops even when reached**
- Evidence (`compositionRenderer.ts` `buildArgs`, ~1417-1484): the filter graph implements ONLY `-ss`/`-t` trim, constant `setpts`/`atempo` speed, `drawtext`, PNG `overlay`. The classifier routes these to transcode but NO filter implements them:
  - `reversed` → no `reverse` filter (needs split decode+reverse+concat or areverse+reverse)
  - `freezeFrameMs/freezeDurationMs` → no `tpad=stop`/frame-loop
  - `speedCurve` → only constant `setpts=PTS/{speed}`; reads `payload.speed` not the curve (curve ignored entirely)
  - `fadeInMs/fadeOutMs` → no `afade`
  - `0<volume<1` → classified transcode but no `volume=` filter — audio plays at full level
  - overlay `timeRange` → `drawtext`/`overlay` lack `enable='between(t,a,b)'` — timed overlays burn for the whole duration
  - `keyframes`/`animation`/`textAnimation` → not consumed at all
  - page `transitionId` → no `xfade` between pages
  - multi-page video → only `doc.pages[pageIndex]` renders; no `concat` of clip sequence (a 3-clip poster video publishes only the cover clip)
  - layer `rotation`/`scale` → `layerTopLeft` ignores transform beyond x/y/scale on the composite path
- Competitor bar: parity via shared render graph — every authored op has an encoder realization. An authored op that silently no-ops is worse than an absent feature (user learns their edit was a lie at publish).
- Fix ordering (each independently shippable): volume + fades (trivial: `volume=v`, `afade`) → overlay `enable=` gating (moderate) → speedCurve (needs `setpts` expression or segment split) → reverse + freeze (needs filter graph segments) → multi-clip concat (`concat` demuxer/filter) → transitions (`xfade`) → keyframes (per-frame transform eval — biggest).

### P1 — materially below flagship

**W12-P1-1 · UI timeline derivation still diverges from canonical projection**
- `usePosterTimeline.ts:205` iterates ALL video media layers per page; `TimelineProjector.findMediaLayer:140-147` takes the FIRST visible media layer only. Multi-video page → UI shows N clips, playback/export play 1 (ghost clips).
- `usePosterTimeline.ts:214` uses `payload.speed ?? 1.0` — ignores `speedCurve`; `handleSpeedCurveChange:688-694` writes `speedCurve` but never updates `speed`. After a curve edit, UI clip duration ≠ projected duration → playhead scale, trim handles, transition positions, total duration all drift.
- Fix: derive `timelineClips` FROM `projectTimeline` output (single source) or share the projection function; write `speed = averageSpeed(curve)` alongside `speedCurve` in `handleSpeedCurveChange`.

**W12-P1-2 · Replace discards authored edits**
- `usePosterTimeline.ts:655-659` replace → picker → `CreatorContext.replacePosterFrameMedia:1216-1257` builds a FRESH payload (mediaUri/mediaType/contentFit/videoDurationMs only) — loses trim/speed/volume/effects/focalPoint/crop. `replaceClipAsset` (TimelineOperations:249, exported) remains dead code.
- Competitor bar: Snap timeline Replace preserves the clip slot; CapCut replace keeps timing + effects.
- Fix: preserve trim/speed/volume/effects/focal on replace, re-clamp trimEnd to new `videoDurationMs`, route through `replaceClipAsset` for validation.

**W12-P1-3 · UploadManager has no connectivity awareness**
- No NetInfo listener in `creator/core/upload/` (listing queue HAS it — `mediaUploadQueue.ts:497-515`). Creator uploads hit dead network → error → retry loop instead of pause-until-online.
- Competitor bar: Snap QUIC migration + durable queue; IG segmented resume. Ours persists (good) but doesn't gate on connectivity (burns retries, noisy failures).
- Fix: NetInfo subscription → auto-pause in-flight XHRs on disconnect, auto-resume on reconnect (mirroring mediaUploadQueue's generation-guarded pattern).

**W12-P1-4 · No segmented/overlapped upload (IG's biggest measured win)**
- Meta: per-segment encode+upload overlap → >2× latency, ~5× fewer failures. Ours: whole-file PUT, or multipart ≥10MB (parallelism? check). Single PUT on a large video = one stall = full restart.
- Fix: extend MultipartUploader to pipelined part upload (concurrency 3-4) + verify completion; or chunked fMP4 transcode-upload overlap on the backend render path.

**W12-P1-5 · mediaExportService is dead code — and a missing product feature**
- `export/mediaExportService.ts` (324 LOC): native + Skia fallback export exists, ZERO importers (publish moved server-side).
- Competitor bar: Edits' watermark-free 4K export + camera-roll save was a launch-killer feature; Snap saves to Memories/Camera Roll.
- Fix: wire as "Save to camera roll / share draft" (mediaStore save) — real on-device export IS the feature, not dead weight. Or delete if product says no.

**W12-P1-6 · Publish has no "processing → live" async stage**
- Backend publish is synchronous (render+transaction in-request). Video render (once wired) will add 10-60s to the request → timeout risk; the 'processing' state exists client-side but maps to an in-flight request, not a server-side processing job.
- Competitor bar: IG container model — publish returns immediately, poll processing phase, notify when live. Snapchat Submitted→Live.
- Fix: render job → async (queue), publish returns `processing` status, client polls/websocket, feed shows "Processing…" chip until ready. Bigger lift — stage it.

### P2 — design-language / polish

**W12-P2-1 · No preview "destination chrome" safe-zone in viewer contexts** — SafeZoneOverlay exists in composer; Edits renders destination player chrome in-preview. Verify preview shows the actual viewer's UI occlusion zones.

**W12-P2-2 · PosterComposerScreen still carries inline timeline chrome** — undo/redo buttons + styles inline at 1519-1540/2475 (residual orchestration detail after extraction).

**W12-P2-3 · Capture grammar** — CreatorCamera: verify tap=photo/hold=video/drag-lock/zoom parity vs Snap grammar; check camera-failure recovery (Snap's black-camera watchdog pattern).

---

## 4. Prioritized upgrade roadmap

**Wave A — Truthfulness (kill silent drops)**
- A1: Wire video render into publish path — `renderCompositionMedia` video branch calls `renderVideoComposition`; video non-trivial render failure sets `renderFailed`/`nonTrivial` (fail-closed parity with image path). Decide sync-in-request vs async based on timeout budget; if async, emit 'processing' status (A5).
- A2: Implement dropped transcode ops in priority order: partial volume (`volume=v`) + fades (`afade`) → overlay `enable=between(t)` → speedCurve (segmented setpts or average+segment) → freeze (tpad/loop) → reverse.
- A3: Unify timeline derivation — `usePosterTimeline` consumes `projectTimeline` (or shared projector); `handleSpeedCurveChange` writes `speed=averageSpeed(curve)`.
- A4: Replace preserves edits (clamp trim to new duration; call `replaceClipAsset`).
- A5: NetInfo gating in UploadManager (pause/resume on connectivity).

**Wave B — Upload depth (IG's measured wins)**
- B1: Multipart pipelining (concurrent parts) + segment-level resume verified end-to-end.
- B2: Publish processing phase as first-class async state (server job + client poll + "Processing…" feed chip).
- B3: mediaExportService → camera-roll/share export feature (or delete).

**Wave C — Editor depth**
- C1: Multi-page video concat on backend render (concat demuxer) + transitions (`xfade`) if schema keeps them.
- C2: Keyframe realization on export (biggest; may rule as native-export-module scope).
- C3: Timeline zoom polish, frame-quantized snapping (currently 150ms wall-clock snap — frame-align to source fps when known).
- C4: Capture grammar parity pass on CreatorCamera.

**Convergence gates:** typecheck clean · targeted tests green · zero silent-drop ops (every authored op either renders or fails closed) · UI timeline ≡ canonical projection · adversarial re-audit finds no new P0/P1.

## 5. Recommended first strikes (highest lift / lowest risk)

1. **A2-lite**: `volume=` + `afade` + overlay `enable=between()` — three filter args, one test file. Turns classified-but-dropped edits into real output today.
2. **A1**: wire video render into publish — makes the dead FFmpeg engine real, converts silent edit-loss into honest render-or-abort.
3. **A3**: unify timeline projection — kills the ghost-clip + curve-drift class permanently.
4. **A4**: replace-preserves-edits — one payload merge + clamp.
5. **A5**: NetInfo in UploadManager — mirrors existing queue pattern.
