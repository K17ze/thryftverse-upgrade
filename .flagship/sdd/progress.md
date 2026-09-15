# SDD ledger — plan: .flagship/sdd (Editor & Upload campaign)

BASE: 03153b2 (feat/product-detail-contract-media-device-closure)

## Rulings
- Ruling: Full migration = shared XHR transport (extracted from UploadManager) adopted by listing queue + profile upload; NOT wholesale adoption of creator UploadManager for listings — couples listing publication contract (finalizationId/publicUrl, scope listing_media) to creator finalization semantics without backend verification. Cost if wrong: listing publish breaks; follow-up requires backend work.
- Ruling: Video trim deferred — no trim capability in expo-video ~57; native module decision required; fabricated trim UI would violate honesty charter. Wave 2C ships real poster-frame thumbnails instead.
- Ruling: Wave 1A fix round 1 (memory): xhrPutFile must use native streaming send({uri}) on native, fetch→blob on web only; queue size probe via FileSystem.getInfoAsync on native. Cost if wrong: none — restores original creator behavior exactly.

## Task 1A (upload transport migration)
- Task 1A: fix round 1/5 (3 addressed, 0 open — native streaming restored, blob option added, queue size probe via FileSystem; commits: uncommitted working tree)
- Task 1A: review verdict SPEC ❌ / QUALITY NOT APPROVED — 2 Critical, 7 Important, 9 Minor
- Task 1A: minor (deferred): #10 jitter +0-25% not ±25% (consistent with UploadManager; acceptable)
- Task 1A: minor (deferred): #11 retry loop 4 total attempts vs "3 attempts" wording (pre-existing bound)
- Task 1A: minor (deferred): #13 getState/getItems return live items array
- Task 1A: minor (deferred): #14 snapshot persists live asset object with stale fileSize
- Task 1A: minor (deferred): #15 web fetch response.ok not validated in transport
- Task 1A: minor (deferred): #16 xhr onload/onerror/ontimeout not nulled in cleanup
- Task 1A: minor (deferred): #17 addAssets unreachable URI-conflict branch (pre-existing)
- Task 1A: minor (deferred): #18 processQueue recursive self-spawn (pre-existing pattern)

## Task 1B (crop integration)
- Task 1B: complete (uncommitted working tree, review pending final wave review)

## Wave 2
- 2A focal previews: brief written, pending dispatch
- 2B straighten+reset: brief written, pending dispatch
- 2C video thumbnails: brief pending; trim deferred per ruling

## Wave 2 progress
- Task 1A: fix round 3/5 (3 addressed, 0 open � native blob fallback removed w/ throw, opId bump atomic before abort, per-type AbortController wired into uploadMedia)
- Task 2A: complete (FocalImage + strip/cover consumption + focal threading; focal re-normalization delegated to sheet owner)
- Task 2B: complete (straighten + reset + readouts stripped; then focal re-normalization follow-up complete via mapFocalToOutput)
- Task 2C: complete (videoPoster.ts + VideoPosterThumb; cover poster skipped � compat Video posterSource never unmounts, compat bug noted)
- Ruling: focal is presentation-only for now (stored on draft item, not sent to backend) � media-attach contract extension requires backend work; parked.
- Ruling: straighten at theta!=0 outputs centered max-inscribed rect of current crop aspect; drag/pinch suspended while straightened; preview === output exactly. Cost if wrong: power users lose offset control while straightening � acceptable, honest.
- Wave 1+2 verification: typecheck PASS; vitest 7 failed/1730 passed = exact pre-existing baseline; zero new failures.
- Adversarial review of Waves 1+2 dispatched (agent 50332af7)

## Adversarial review remediation (Waves 1+2)
- Review verdict: FINDINGS � 2 P0, 7 P1, 8 Minor
- Task 1A: fix round 4/5 (P0-1 per-instance storage keys, PUT timeout 120s, guarded performance.mark, cancelled-retryable restore path, addAssets hydration await, removeItem abort, restore attemptCount fix, 3-attempt loop, profile stale-abort removed)
- Task 2B: fix round 2 (crop-frame rotation layer, focal tap surface moved inside transform wrapper for source-space coords, fake Auto-Detect button removed)
- Ruling: reviewer's preview-transform reorder REJECTED by implementer with RN 0.86 Transform.cpp/TouchTargetHelper evidence (row-vector application; last entry acts first; current order = flip-first = matches output). Accepted on mechanical simulation + numeric parity. Cost if wrong: flip+rotate preview mismatch � final reviewer re-adjudicates.
- Task 2A: fix round 2 (P0-2 coverUri from queue result, P1-7 no stale focal overwrite, P1-12 queue reset on save/unmount, P1-13 ph:// copyAsync + kind!=='video' guard)
- Task 1A: minor (deferred): #15 other uploadMedia consumers (chat/review/report/verification/support/appeal) not wired to progress/abort � different departments, out of Editor & Upload scope
- Task 1A: minor (deferred): #16 non-null assertions partially pre-existing; runtime validation deferred to contract-hardening pass
- Task 2A: minor (deferred): focal not sent to backend (media-attach contract extension) � parked with UploadManager-for-listings follow-up
- Task 1A note: unnamed queues restore across restart only in same construction order; surfaces needing guaranteed durability pass explicit storageKey

## Final review remediation
- Final review verdict: FIX-FIRST (2 High engineering, 3 High hygiene, 4 Medium, dead API)
- Task 1A: fix round 5/5 (snapshot writes awaited incl. cancelItem->Promise<boolean>, reset->Promise<void>; lengthComputable guard removed + queue total fallback fixed to presign size; typed NativeStackNavigationProp adopted)
- Task 3A: fix round 2/2 (focal-only edits no longer re-queue uploads; full AppIcon migration in studio+strip, zero Ionicons kept; onSetCover dead prop + host handlers removed; SellScreen any refs typed; EditListingScreen local-uri fallback removed w/ explicit failure; addAssets awaited)
- Ruling: CreatorAssetPicker.tsx ruled OUT of campaign scope � file grew to ~4,460 lines mid-campaign from the parallel seller-hub workstream actively editing it; re-authoring would collide. Our 3B icon swaps there are intact. Cost if wrong: picker keeps legacy chrome until that workstream lands.
- Ruling: cover model = drag-to-reorder (first = cover), platform-native pattern (Instagram/Depop); explicit Set-cover button removed as dead API. Cost if wrong: cover-change discoverability drops for users who never drag � mitigated by the dominant cover render.
- FINAL VERIFICATION: typecheck clean (whole project); vitest 7 failed/1730 passed/2 skipped = exact pre-existing baseline; eslint 0 errors on all campaign files; zero Ionicons/STATUS_PROGRESS remnants; zero InCanvasCropOverlay refs.
- Campaign status: COMPLETE (all 3 waves + 2 adversarial review cycles + remediation)

## Wave 11 — Reference-implementation research & flagship upgrades

### Research
- Documented in `.flagship/research-wave-11-reference-implementations.md`
- References: Snapchat/Lens Studio, Instagram Stories, CapCut, TikTok, VN, Lightroom, React Native Skia, Expo Video, AVFoundation/Media3, Nitro Modules, resumable upload architecture

### T11-1: Cross-renderer filter agreement ✅
- Created `frontend/modules/thryft-media-export/src/filterMatrices.ts` — canonical JS-side source of truth for all 10 flagship filter matrices
- Re-exported from `thryft-media-export/src/index.ts`
- Test (`filterMatrixAgreement.test.ts`) parses backend source as text and compares all 10 matrices + interpolation across 3 sources (filterConfig, JS export, backend)
- 11 tests pass — all matrices byte-identical

### T11-3: Upload reconciliation on app relaunch ✅
- Added `reconcileOnStartup()` to `UploadManager` — counts recoverable jobs (queued/uploading/initiating/stalled), requeues non-queued recoverable states, leaves terminal jobs untouched, idempotent
- Added `reconcileCreatorUploads()` and `ensureReconciledOnStartup()` to `useUploadManager.ts` with module-level guard for once-per-session execution
- Wired into `useUploadManager` hook's mount effect
- 3 tests pass (mixed statuses, terminal-only, idempotency)

### T11-5: Frame-accurate timeline pinch-zoom ✅
- `useTimelineZoom` hook with Reanimated SharedValue for UI-thread pinch tracking (1x–30x range)
- Pinch gesture, imperative zoom-in/out/reset helpers
- Wired into PosterComposerScreen — `scaledTrackWidth` passed to TimelineTrack, session persistence

### T11-7: Idle-debounce draft autosave ✅
- CreatorContext has debounce-based autosave (5s timeout, cleared on dirty change, compares to last saved doc)
- `useDraftAutosave` hook as reusable abstraction with 5 tests
- Truthful status reporting (idle/saving/saved/failed)

### T11-8: Native video export contract ✅
- `VideoExportModule.nitro.ts` — typed Nitro HybridObject spec with `VideoExportRequest`, `VideoExportResult`, `VideoExportError`
- JS wrapper (`index.ts`) with truthful capability detection, cancellation via session ID, progress polling
- 3 tests pass

### T11-9: Cheapest-path FFmpeg export ✅
- `getVideoRenderPath()` classifies videos as trivial/remux/transcode
- Remux: `-c copy` for trim/mute-only edits (no re-encode)
- Transcode: `-c:v libx264` for speed/reverse/freeze/overlays/filters
- 48 backend tests pass (classification + FFmpeg command construction)

### T11-10: Truthful freeze-frame preview ✅
- `useFreezeFramePreview` uses Skia `useVideo` to decode the actual frame at the freeze point
- Seeks to freeze timestamp, pauses, holds frame during freeze interval
- Graceful degradation if codec can't decode (warns + falls back to paused native player)
- Wired into CreatorCanvas

### Additional fixes
- Added `setClipVolume` to `TimelineOperations.ts` (was imported but missing)
- Added `creator` namespace to `en.json` + `i18next.d.ts` (CreatorCropSheet was using unregistered namespace)
- Fixed filter matrix test import to avoid Nitro module runtime dependency
- Fixed backend test to use `-c:v` instead of `-c` (matching actual FFmpeg args)
- Added `compositionRenderer.test.ts` to backend vitest config

### Verification
- Frontend typecheck: 5 pre-existing errors (all in CoOwn/trade/mediaUploadMultipart — user-owned concurrent changes, NOT Wave 11)
- Frontend tests: 89 files passed, 1786 tests passed, 2 skipped, 0 failures
- Backend typecheck: clean (exit 0)
- Backend tests: 48 compositionRenderer tests passed; 3 pre-existing test files failed (visualSearchRoute, vectorSearchIntegration, safeRemoteMediaFetch — unrelated to Wave 11)
- Adversarial re-audit: all 7 Wave 11 tasks verified for truthful behavior, proper wiring, and anti-AI design compliance

## Wave A — Publication render parity + editor timeline unification + offline uploads

### A1: Video render wired into publish path ✅
- `renderCompositionMedia` no longer stubs out videos — `renderComposition` routes primary video media through `renderVideoComposition` (FFmpeg) alongside Sharp/SVG for images
- `creatorPublicationService` selects the primary expected media regardless of image/video type; poster frames render non-trivial video pages too
- Fail-closed: non-trivial render failure aborts publish with `MEDIA_RENDER_FAILED` (never silently publishes unedited source); source fallback preserved only for genuinely trivial docs
- Bounded render deadline on all FFmpeg calls (`runFfmpeg` accepts `timeoutMs`, kills the child process on expiry)

### A2: Backend transcode edits ✅
- Segment-graph model (`buildVideoSegments`): play/freeze segments → per-segment FFmpeg chains → `concat` graph
- `volume=` + `afade` (in/out) applied in output time after the segment graph
- Timed overlays gated via `enable='between(t,…)'` (drawtext + sticker PNG groups)
- Reverse: per-segment `reverse`/`areverse` + reversed concat order (bounds the frame buffer per segment)
- Freeze: 2-frame window + `select='eq(n,0)'` + `tpad stop_mode=clone`; audio hold emits `anullsrc` silence (skip-under semantics matching preview `computeSourceTime`)
- Speed curves: 24 piecewise-constant segments sampled at midpoints (mirrors `sampleSpeedAtPosition` incl. smooth/hold easing)
- Bug fixes found by real-FFmpeg smoke: freeze at position 0 was silently dropped (`freezeFrameMs > 0` gate — now `>= 0`); second-based `trim` boundaries double-counted the shared edge frame at every segment junction (~1 frame/boundary) — now frame-indexed `trim=start_frame/end_frame`

### A3: Timeline derivation unified ✅
- `usePosterTimeline` now consumes `projectTimeline` (TimelineProjector) — the same projection the playback clock uses — instead of a parallel derivation that ignored speedCurve, freeze, reverse, and image pages
- Image pages are now timeline clips (`mediaType: 'image'`) honoring `page.durationMs` as hold time — matching `migrateDocumentToSequence` semantics and Instagram Edits' all-segments strip
- Overlay anchor offsets rebase onto projected clip `timelineStartMs` + projected page spans (was raw `page.durationMs` → drifted from playback under speed edits)
- `timelineTotalDurationMs` = `projectedTimeline.totalDurationMs` (playback parity)
- `PosterClip.speedCurve` retyped to the authored `SpeedCurve` shape (was dead `SpeedCurvePoint[]`); `TimelineOperations.recomputeDuration`/`setClipSpeedCurve` now use `SpeedCurveTypes.averageSpeed` — same math as the projector
- Trim handles + trim/split ops gated to video clips (image clips have no source window)

### A4: Replace preserves authored edits ✅
- `handlePickerAddLayer` replace branch now clamps `trimStartMs`/`trimEndMs` to the replacement `videoDurationMs` (shorter media no longer stretches the clip beyond real source)
- Clears stale upload receipts (`mediaFinalizationId`/`mediaAssetId`/`thumbnailFinalizationId`/`thumbnailMediaAssetId`) — the old receipt bound to a different URL would fail server `MEDIA_RECEIPT_MISMATCH`
- Video→image replace clears source-window fields; trim/speed/volume/effects preserved (undo restores fully)

### A5: NetInfo gating in UploadManager ✅
- `setOnline(online)` connectivity gate (host-agnostic; `useUploadManager` wires `@react-native-community/netinfo` once for the shared singleton)
- Going offline aborts in-flight controllers → jobs unwind back to `queued` (never `failed`, never user-`paused`); `activeUploads` entries released by each `processJob` finally → no double-start on fast flap
- `processQueue` no-ops while offline; `checkStalledJobs` skips while offline; reconnect kicks the queue
- New `connectivityChanged` event + `isOffline` on `useUploadManager` for honest "waiting for connection" UI
- User-paused jobs stay paused across flaps (user intent ≠ connectivity)

### Verification
- Backend: `compositionRenderer.test.ts` 57/57 pass; `tsc --noEmit` clean
- Frontend: `tsc --noEmit` clean; creator tests 25/25 (19 existing + 6 new connectivity-gate tests)
- Real FFmpeg 9.0 smoke (`.flagship/smoke/`): reverse+freeze+volume+fades → 4.000s exact; freeze@0 → 4.000s; 6-segment speed curve → 4.733s vs 4.667 target (±1 frame ≈ 0.04%, was +133ms before frame-indexed trim); remux `-ss/-t/-c copy` → 2.1s (keyframe tolerance, expected)
- Known P3: remux trim is keyframe-approximate (±~0.1s); frame-exact trim requires transcode — intentional lossless/fast tradeoff

## Wave B (2026-09) � Research refresh + remaining depth

### B1: Sept-2026 research refresh � done.
- `.flagship/research-waveB-2026-09.md` � current competitive bar: Instagram Edits (Aug 2026: 15-min 4K export, folders, overlay templates + clip lock; Jul: bilingual captions), Snapchat (Quick Cut + Sounds Sync for Camera Roll expanding, Director Mode timeline), RN stack (expo-video 57.0.2 for playback/thumbs, Nitro modules + react-native-video-pipeline for client export; ffmpeg-kit dead � unaffected, our FFmpeg is server-side).
- Upload guidance: native background session (iOS NSURLSession background, Android UIDT/WorkManager) + S3 multipart/TUS resume. Our durable job store + multipart implements the resume half; native background session remains the known gap (parked � needs native module work).

### B2: Publication-service render path tests � done.
- `creatorPublicationRender.test.ts`: 9 tests mocking compositionRenderer/s3 � trivial-skip, image jpg upload, video mp4 ext, fail-closed on render null/throw, `videoPageRenderPath` single-page isolation, per-frame parallelism + trivial-video skip, aggregate renderFailed/nonTrivial propagation.
- `__testables` export seam added to creatorPublicationService (no behavior change).
- Learned: `backend/api/vitest.config.ts` uses an explicit `include` whitelist � new test files must be registered there.

### B3: Preview parity � computeSourceTime freeze+reverse � done.
- `computeSourceTime` now maps reversed output through a freeze-aware forward-position mapping (forwardOffset = durationMs - offset), matching the export graph's "build forward, reverse concat order" semantics. Reversed clip freeze holds the frame at the mirrored output position.
- `useFreezeFramePreview.isInFreezeWindow` mirrors the freeze window for reversed clips (`durationMs - freezeEnd .. durationMs - freezeStart`) so the Skia held-frame overlay lands where export puts it.
- `handleSpeedCurveChange` now writes `speed: averageSpeed(curve)` alongside `speedCurve` � payload.speed stays the effective speed for consumers that read the constant field directly.

### B4: Legacy listing queue connectivity � done.
- `mediaUploadQueue` already had NetInfo gating + durable snapshots; added proactive offline parking: on `isInternetReachable ? false`, `parkForOffline()` aborts in-flight items with `_offlineAborted` flag ? catch requeues as `pending` with attempt budget refunded (not cancelled, not failed). Preserves `_needsFinalizationOnly` checkpoint when bytes already landed.
- User cancel during offline abort still wins (`_cancelRequested` precedence).

### Multipart pipelining (Wave-B roadmap B1) � done.
- `MultipartUploader.resume` now uploads parts through a bounded worker pool (`partConcurrency`, default 3 � S3/cellular sweet spot). Meta's segmented-upload analysis attributes >2� latency cut + ~5� failure reduction to part overlap. First exhausted part fails the session; siblings finish in-flight parts so progress checkpoints (skipped on next resume).

### Viewer parity (W12-P0-1b) � done.
- `renderedViewDocument.pageWithRenderedMedia`: when a frame's published `media_url` differs from the doc's media URI (i.e. rendered artifact exists), the viewer canvas plays the BAKED artifact � full-canvas identity geometry, all baked edit fields cleared � instead of the raw source. Static overlays already burned in are dropped; interactive/dynamic layers (vote/quiz/question/emojiSlider/link/product/look/music/mention/time/weather) stay live on top.
- Multi-clip concat ruled unnecessary for publish: looks are contract-enforced single-page (`compositionContract.ts:81`); posters are a paged deck � every page renders its own frame artifact. Concat would matter only for a future "export poster as single video" feature.

## Wave C (2026-09) - Minute-detail competitive audit + interaction-depth pass

### C0: Research - done.
- `.flagship/research-waveC-minute-detail-audit.md` - point-by-point verification vs Instagram Edits (Aug 2026), Snapchat Timeline Editor/Director Mode, CapCut/IMG.LY timeline-UX research. Verified PRESENT: pinch-zoom, magnetic snap, smart canvas guides, long-press reorder, waveform track, canvas lock enforcement, capture grammar, speed-curve sync, viewer parity.

### C1: Clip-lock parity (Edits Jul-2026 feature) - done.
- `PosterClip.locked` carried from `CreatorLayer.locked` in the page-to-clip projection.
- `handleTimelineOperation` lock guard: trim/split/duplicate/delete/replace/speed/volume on a locked clip, moveOverlay on a locked overlay, and reorder touching a locked clip at EITHER endpoint all reject with haptic.error + "Clip is locked" toast. Previously the canvas honored lock but the timeline bypassed it - invariant leak.
- `toggleClipLock(clipId)` added to usePosterTimeline - page-aware via clipPageIndices (context's toggleLayerLock only targets the active page), single history entry via commitDocument.
- TimelineToolbar: Lock/Unlock tool + `isLocked` disables Split/Duplicate/Replace/Delete/sliders/curve (a11y disabled states).
- ClipThumb: lock badge (persistent, width>44), trim handles suppressed, reorder drag disabled on locked clips.

### C2: Edge auto-scroll during trim/reorder - done.
- Timeline ScrollView upgraded to Reanimated.ScrollView + useAnimatedRef + useAnimatedScrollHandler (UI-thread scrollXSV).
- ClipThumb trim + reorder pan worklets call scrollTo() when the finger enters the 44px edge zone (16px/frame step) - matches CapCut/Edits edge-scroll. Previously trimming past the viewport edge was impossible while zoomed.

### C3: Save to camera roll - done (+P1 bug fix).
- PosterViewerScreen more-menu now uses real PosterOptionsMenu (LookOverflowMenu anatomy: handle, icon+label rows, 48pt, hairlines, destructive last).
- Save to camera roll: downloads baked `mediaUrl` via FileSystem to cache, saves via MediaLibrary (write-scoped permission), honest toasts.
- FIXED P1: the old handleMoreMenu collapsed ALL options into a single-confirm dialog showing only "Copy link" - Archive story and Delete story were unreachable. Now a real option sheet; delete/archive still route through ConfirmationSheet (deferred 250ms to avoid Modal-during-Modal race).

### Verification
- Frontend tsc clean. Creator tests 26/26.

### C4 (2026-09 cont.): Playhead + waveform honesty + async publish - done.
- Playhead seek math: `e.absoluteX` (screen space) -> `e.x` (view-local). Inside the scrolled/zoomed timeline, absoluteX produced wrong seek positions whenever content offset > 0. All three pan phases fixed; comment added so it doesn't regress.
- Playhead auto-follow: during playback with zoom > 1, a throttled (350ms) UI-thread scrollTo keeps the playhead inside the viewport (re-anchors at ~35% from left). Skips when track fits the viewport or playback paused.
- Waveform honesty: WaveformExtractor marks compressed-source output `isSynthetic: true`; WaveformTrack now drops synthetic samples -> honest flat line instead of fabricated amplitude bars (AGENTS.md truthful-data rule). Dead `isSynthetic` state removed after review.
- Async publish ("publish now, process on server") � W12-P1-6 landed using existing infra:
  * `POST /creator/documents/:id/schedule` accepts `immediate: true` -> due_at=NOW(), doc status 'publishing' (not 'scheduled' � in-flight renders aren't cancellable), manual sweep trigger post-commit (skips the 30s interval).
  * Sweep handler: claim returns due_at/created_at; immediate rows get "Post published / failed" notification copy instead of "Scheduled�"; terminal failures now also reset `creator_documents.status='failed'` (was stuck 'scheduled' forever).
  * `GET /schedule` + `GET /schedule/:key` now LEFT JOIN creator_publications for `targetId`.
  * `publishCreatorDocumentAsync()` client API: schedule-immediate + poll fetchScheduleInfo (1.5s, 150s budget) -> PublicationResult shape; PublishAsyncFailedError/PublishAsyncTimeoutError.
  * Workflow: `documentMayRequireRender` (any video media layer OR multi-page) routes publish-now through async; trivial single-image docs keep the sync fast path. Attempts persist commandType 'schedule' so unknown-outcome reconciliation resolves via schedule lookup.
  * Catch mapping: PublishAsyncFailedError -> retryable error with server reason; PublishAsyncTimeoutError -> scheduleUnknown "still processing" (push notification covers late completion); handleCheckSchedule resolves published->success(targetId), failed->error, cancelled->superseded error, pending->still-processing.
  * reconcilePublicationAttempts: 'failed'/'cancelled' schedules now mark the attempt failed (was blindly 'committed'); 'published' carries real targetId.
- Verification: backend tsc clean, frontend tsc clean, creator tests 26/26, publication render tests 66/66.


### C5 (2026-09 cont.): Slip editing - done.
- PosterClip.sourceDurationMs added; projector sources it from payload.videoDurationMs (fallback: current trim end = no provable forward headroom).
- slipClip() pure op: shifts trimStart+trimEnd together, clamps [0, sourceDuration], duration invariant via withUpdates, no-op returns identity.
- usePosterTimeline 'slip' case: page-aware via clipPageIndices + updateLayerInPage, single history entry, images rejected, locked clips rejected by the existing clipId lock guard.
- ClipThumb: dedicated slip chip (swap-horizontal glyph) on selected video clips only, width>72; pan converts px->SOURCE ms (window span, not speed-adjusted); thumbnail translates opposite finger (filmstrip under fixed window), clamped to real headroom; 44pt hit target via gesture hitSlop; commits once on end.
- TimelineTrack/PosterComposerScreen: onSlipClip prop -> handleTimelineOperation({type:'slip'}).
- Tests: 7 new slipClip unit tests (window shift, both clamps, no-ops, unknown-source bound, speed invariance).
- Verification: frontend tsc clean, creator tests 33/33.


### C6 (2026-09 cont.): Draft export + crop-sheet undo + registry reconciliation - done.
- Slip editing landed end-to-end (C5): PosterClip.sourceDurationMs, slipClip pure op, page-aware hook dispatch, dedicated slip chip on selected video clips (source-ms conversion, headroom-clamped preview, 44pt hitSlop), 7 unit tests.
- W12-P1-5 resolved by ADOPTION: mediaExportService wired as draft export - 'Export image' in Poster overflow (Project section) + Look overflow (project group). jsExportImage renders the composition; saves to camera roll via MediaLibrary. Video docs omit the control (JS Skia can't decode video; native module deferred) - honest absence, no fake affordance.
- EU-P1-5 closed: CreatorCropSheet undo - CropEditSnapshot stack (crop frame SVs are source of truth, image zoom/pan, rotation, flips, straighten, ratio). Gesture/slider transactions: capture-at-start, push-at-commit only when changed (no tap noise). Discrete edits push at press. Reset is undoable; stack clears per session; undo button left of Reset in top bar.
- NEW GAP recorded: KF-P0 keyframe export - layer.keyframes animate in preview but never reach CompositionLayer/the ffmpeg graph; published video drops authored animation. Fix path documented in registry (per-frame expressions or native export module).
- Registry reconciliation: EU-P0-2/EU-P1-3/EU-P1-4/EU-P2-1..6/W12-P1-6 verified closed (stale entries); EU-P1-2 closed (focal honored on all surfaces that can author it).
- Verification: frontend tsc clean, creator tests 33/33.


### Wave D (2026-09-14): Architecture reorg + capture grammar + project fps + native upload session - done.
- Capture grammar (W12-P2): slide-to-lock recording (measured lock-pill hit-test via measureInWindow, recordLocked survives release, lockHot highlight, haptic + honest toast, tap-to-stop) and slide-to-zoom while holding (vertical drag -> pinchZoomDeltaSV pipeline, 160pt ~= +2x, clamped). Pressable onTouch* pass-through on ShutterButton. Lock pill pointerEvents='none' keeps responder on the shutter.
- Safe-zone parity: shared/safeZone.ts single contract (TOP_BAR_HEIGHT=52, BOTTOM_CHROME=120, +4pt top margin). Both composers had identical chrome but Look padded 56 vs Poster 52 - unified via safeZoneInsets(insets); Poster bottomOffset uses BOTTOM_CHROME_HEIGHT.
- canvas.fps (CapCut draft.fps semantics): optional, default 30 - the project output frame grid. Trim deltas frame-quantized in TIMELINE space then converted to source ms via clip.speed (fixed a real bug: gestures emitted timeline-ms consumed as source-ms - wrong at speed!=1). Split point quantized on timeline grid then mapped to source. Slip quantized to source frames. Neighbor-boundary magnetic snap now gated to same-source clips (source-time adjacency only meaningful for split siblings).
- ARCH-P1 reorg: 34 flat creator root files rehomed - canonical model/persistence -> core/projectStore/ (composition, compositionContract, drafts, history, useHistoryStack, mediaReferenceWalker), sheets -> surfaces/ (10 files), publish pipeline -> publish/ (4 files), shell/screens/context/canvas -> studio/ (7 files), camera -> capture/ (2 files), shared -> shared/ (CreatorAnimations, creatorAnalytics), adapters -> export/ (2 files). 438 import specifiers rewritten programmatically (both directions); barrel index.ts rewritten; AppNavigator deep path updated. git mv preserved history.
- Native background upload session (W12-P1-4 partial): platform/media/nativeUploadTransport.ts - putFile() dispatches to expo-file-system File.createUploadTask (sessionType:'background' = iOS URLSession survives suspension; Android always-background) on native, xhrPutFile on web/blob/multipart. Built-in AbortSignal, onProgress passthrough, ETag from response headers, 120s watchdog preserving stall-safety. Wired into UploadManager single-PUT + services/mediaUpload (listing + profile flows). Multipart stays XHR (Blob parts; native API uploads whole files only).
- KF-P0 feasibility mapped: position+rotation realizable via ffmpeg t-expressions (drawtext/overlay x,y; rotate a=); scale needs zoompan/sendcmd; opacity needs fade chains. Recommended path: native export module (per-frame evaluateKeyframes = preview parity by construction).
- Verification: frontend tsc clean, creator tests 33/33.


### Wave I (2026-09-15): upload crash-recovery + multipart contract repair — implemented, reviewed, tests green.
- Reviewer-dispositioned findings into fixes: `UploadedObjectPolicyError` class replaces message-string matching (422 policy mismatch vs 500 transient); deterministic S3 manifest rejections (InvalidPart/InvalidPartOrder/EntityTooSmall/EntityTooLarge/InvalidRequest) map to 400; `complete`/`abort` status updates are now guarded (`WHERE status='active'`) so a lost lifecycle race returns 409 instead of overwriting the winner; malformed completion receipt throws typed `UploadContractError` classified non-retryable in UploadManager.
- Reviewer objections overruled with rationale: contiguous 1..N manifest is our contract (initiate computes contiguous parts — non-contiguous manifests are malformed by definition); NoSuchUpload→HEAD recovery is sound because object keys are server-generated UUIDs only writable via our presigned/session paths; legacy-session lifetime extension is the intended migration; duplicate-receipt replay without re-HEAD is correct idempotency; helper bucket omission is consistent (all helpers use config.s3Bucket, which is what sessions store).
- Evidence: frontend upload tests 30/30, backend mediaContract 28/28, both `tsc --noEmit` clean, `git diff --check` clean. Native process-kill + real PG/S3 concurrency remain unverified (no ADB device attached).

### Wave I-cont (2026-09-15): capture lifecycle + gesture safety repair — implemented.
- Dismiss pan: `onTouchesDown`+`manager.fail()` origin gate (top 120pt, fails while recording via `isRecordingSV`), `activeOffsetY(30)`/`failOffsetY(-15)`/`failOffsetX(±30)` directional grammar; removed bogus `activateAfterLongPress(0)`.
- Lifecycle: auto-stop calls `recorderRef.current` directly (stale closure could observe isRecording=false and never fire); `pressHeldRef` aborts start when finger released during mic-await; photo + hands-free countdowns are token-cancellable; locked release resets `isLongPressRef` (next tap was swallowed); flip refused while recording.
- Permissions: `micState` now derives from native `status` (not-determined→denied/re-askable, denied/restricted→blocked) — a single soft denial no longer disables re-asking.
- Surfaces: review overlay plays video captures via compat/Video (was broken `<Image>` on file://mp4); staging tray renders duration-tile video thumbs; listing camera arms multi-capture + enforces `maxCaptures` (previously dead `maxPhotos`); listing batches forward video captures instead of dropping them; web prop parity + moodboard noun fixed.
- Evidence: `tsc --noEmit` clean, eslint 0 errors (pre-existing size/i18n warnings only), creator suite 57/57. Gesture worklets and recording races need device validation — no ADB device attached.

### Wave E (2026-09-14): UI-thread ownership pass — per-frame runOnJS elimination - done.
- Audit: ~200 runOnJS in creator tree; ~42 inside hot gesture paths (onUpdate/onChange/onBegin). Reviewed path-by-path — boundary calls (onEnd commits, haptics on threshold transitions, throttled seeks) are legitimate; the defects were per-frame JS state updates.
- CreatorCanvas multi-drag (P0 defect): was `runOnJS(onMultiDragUpdate)` EVERY frame -> useLookMultiSelect rebuilt an updates array + updateLayersLive re-rendered all selected layers per frame (JS churn + dropped frames). Now: canvas-level `multiDrag` channel {dx,dy,active,owner} shared values; owner writes delta on UI thread; peers follow via useAnimatedStyle offset; `layerPosSVs` registry lets the owner snap peers to committed positions + release the delta atomically in one synchronous block (no 1-frame flash either direction); JS sees only dragStart (snapshot) + commit (single history entry, clamps+snap preserved). `onMultiDragUpdate`/`updateLayersLive` consumer path deleted; updateLayersLive remains in CreatorContext as an unused-but-public primitive.
- CreatorCanvas gesture badges: pinch/rotation badge text was emitted per frame via runOnJS(setGestureBadge) — now deduped on the displayed integer (lastBadgeSV, reset per gesture) — crosses only when the %/deg value actually changes.
- Playhead scrub bubble: was runOnJS(setBubbleMs) every frame to re-render the timecode Text. Now `AnimatedTimecode = createAnimatedComponent(TextInput)` + `useAnimatedProps({text: formatTimecode(bubbleMsSV)})` — formatted and rendered entirely on the UI thread; zero crossings. onSeek remains throttled ~10Hz + final onEnd (already disciplined).
- CreatorSlider: `runOnJS(onValueChange)` per frame even when the step-quantized value didn't change — now deduped via lastEmittedSV (synced on external value writes so undo/reset can't wrongly suppress a re-emit).
- TimelineToolbar sliders: step-quantized value refired identically ~every event within a step — deduped via lastEmittedSV.
- Color controls (HueSlider, AlphaSlider, SVPlane, GradientEditor stop-position + angle): continuous onChange emitted per frame — now bucketed dedupe (1° hue/angle, 0.5% alpha/position, 1% S+V composite) emitting full-precision values only when the sub-perceptual bucket changes.
- Verified already-disciplined (no change): KeyframeEditor drag (SV + commit-on-end), timeline pinch zoom (SV scale + commit-on-end), ClipThumb trim/slip/reorder (commit-on-end), camera pinch zoom (50ms throttle), Playhead haptic tick (100ms buckets).
- Verification: frontend tsc clean, creator tests 33/33.


### Wave F (2026-09-14): KF-P0 keyframe export realization — server-side FFmpeg — done.
- Root cause: `layer.keyframes` serialized into `compositionDocument` and reached the backend, but `parseLayer` dropped them — authored animation baked static in export while preview animated (preview/export parity gap).
- Backend port: `lib/media/keyframeEvaluator.ts` — verbatim port of frontend `KeyframeEvaluator` (linear/ease-in/ease-out/ease-in-out/damped-spring, first/last holds, outgoing-keyframe easing per segment). `samplePropertyTrack` evaluates once per output frame; `samplesToStaircaseExpr` emits run-collapsed `if(between(t,…))` expressions → frame-exact parity with preview (preview only ever renders whole frames).
- Classification: any layer with parsed keyframes → `transcode` in both `isCompositionNonTrivial` and `getVideoRenderPath`; `parseKeyframes` defensively drops malformed entries (fail-closed contract).
- Render realization per property, correcting the earlier feasibility note: `scale=eval=frame` DOES evaluate per frame (no zoompan needed); `geq` alpha expr handles opacity per frame (no fade chains).
  - Text: drawtext `x` (position kf → staircase × W − text_w/2) + `alpha` (opacity kf × static opacity). Text with scale/rotation kfs rasterizes into the animated-PNG path where all 4 properties are expressible.
  - Stickers/emoji/etc.: per-layer tight PNG (scale/opacity neutralised in the raster when tracked) as `-loop 1 -framerate {fps}` input → `fps,trim,setpts,format=rgba,scale=eval=frame,rotate(rotw/roth center-preserving),geq alpha` → centre-anchored `overlay` with per-frame x. timeRange gates via overlay `enable`.
  - Media layer: when keyframed, the video stream runs the same transform chain then composites onto a `color=c=canvasBg` source so position/scale can move it off full-bleed; static scale/rotation/opacity fold into the same chain.
- Bonus fix: static sticker `rotation` was silently dropped by the composite path — now baked via sharp `rotate` on the tight PNG (rotated bounds re-centre).
- Residuals: static media scale/rotation WITHOUT keyframes still dropped (media is normally full-bleed; recorded in registry). Native `thryft-video-export` remains aspirational (on-device render = parity by construction).
- Verification: backend `tsc --noEmit` clean; `keyframeEvaluator.test.ts` 18/18 + `compositionRenderer.test.ts` 66/66 (registered in vitest include list — config uses an explicit list, not a glob).


### Wave F cont. (2026-09-14): transcode-upload overlap — server-side render→S3 pipeline — done.
- Prior shape: renderComposition transcodes to a temp file → readFile → putBinaryObject. Encode and upload ran serially.
- New path (opt-in via `RenderCompositionOptions.streamOutput {objectKey, contentType, cacheControl}` — minted by renderCompositionMedia before render):
  - `runFfmpegStreaming` (ffmpeg.ts): identical spawn/progress/timeout/error classification; output is `pipe:1`; stdout consumed via `for await` — natural backpressure (ffmpeg blocks on stdout write while an S3 part round-trips; bounded memory = one part).
  - Container: `-movflags frag_keyframe+empty_moov+default_base_moof -f mp4` — pipes aren't seekable so faststart's moov rewrite is impossible; fMP4 is append-only, which is exactly what makes range streaming safe (and it's what HLS fMP4/IG serve).
  - `StreamingMultipartUpload` (lib/media/streamingUpload.ts): 8MB parts (≥S3 5MB floor), sequential part uploads, `createMultipartUpload` lazy — whole stream <8MB completes as plain PutObject (no multipart overhead on small renders); `finish()` flushes tail part + completes; `abort()` releases partial sessions.
  - s3.ts: `uploadPartObject` (server-side UploadPart with Body — the existing helpers only presigned parts for clients); `createMultipartUpload` gained `cacheControl` so streamed renders keep the immutable/public headers.
  - Overlay-retry semantics preserved: failed attempt aborts its parts, retry without overlays opens a fresh session on the same key.
  - RenderedComposition: buffer now optional; streamed results return `url`+`sizeBytes`. Service uses `rendered.url ?? putBinaryObject(buffer)` — remux/trivial/image paths untouched.
- Verification: backend tsc clean; 97/97 green across compositionRenderer (incl. 4 new streaming tests: pipe-args/fMP4 flags, multipart part flow, abort-on-failure, buffered fallback), keyframeEvaluator (18), creatorPublicationRender (9). Suite-wide run: 145/152 — the 7 failures are pre-existing env-dependent files (vectorSearchIntegration embedder config, safeRemoteMediaFetch IPv6/SSRF), untouched by this change.
- Still parked: client→server overlap (device transcode → upload while exporting) needs a byte-range ingest protocol on the API (Content-Range sessions assembling to S3 parts) — the existing client multipart already maps cleanly to presigned S3 parts; a streaming export format (fMP4) would make device bytes append-only.


### Wave F verification pass (2026-09-15): real-FFmpeg smoke + static media transforms — done.
- New `scripts/smoke-keyframe-render.ts` renders a real composition end-to-end (testsrc clip → renderComposition → ffprobe). First run caught two bugs the mocked tests couldn't:
  1. `-map '[0:a]'` — when the complex graph had no audio chain, the passthrough was mapped as a filter pad label that doesn't exist → "Output with label '0:a' does not exist" → silent no-overlay retry (pre-existing bug, latent on any overlay+audio+speed-1 render). Fixed: bare `0:a` input spec.
  2. `rotw(a)`/`roth(a)` misuse — rotate's ow/oh take input dims, not the angle; also they're init-time only, so dynamic scale before rotate would break. Reordered to rotate-first (`ow=rotw(iw):oh=roth(ih)` full-rotation bounds, constant input dims) then `scale=eval=frame` — commutes exactly for uniform scale.
- Extracted frames visually confirm all four keyframed properties: text slides (x-centre animates) + fades in (opacity), sticker grows (spring scale) + tilts (rotation).
- Static media-layer transform residual closed: rotation/scale/position/size/opacity on the media layer now force `transcode` and wrap onto the canvas-colour bg (previously classified-but-dropped or trivial-path-dropped). Layer size≠canvas pre-scales before the transform chain.
- Verified: backend tsc clean; 100/100 across compositionRenderer(73)+keyframeEvaluator(18)+creatorPublicationRender(9); smoke green incl. fMP4 pipe output and static-transform render.


### Wave G (2026-09-15): rendered-video ABR parity + HLS packager repair — done.
- Gap: published composition renders served flat progressive MP4 while the ingest pipeline advertised an HLS ladder for uploads — edited video (the flagship surface) got the worst playback path.
- `uploadHlsOutput(hlsOutputDir, keyPrefix)` extracted from `processVideoAsset` (master playlist, per-rendition playlist/segment uploads, derivative + ABR-manifest records — identical upload shape for both callers).
- `generateRenderedVideoHls(sourceBuffer, keyPrefix, durationMs)` (pipeline.ts): writes render to tmp, probes it (audio flag + authoritative duration — `-map 0:a` fails on audio-less sources), runs `buildHlsArgs`, uploads under `renders/<doc>/<render>/hls/`, returns master URL or null; workdir always cleaned.
- `renderCompositionMedia`: after a video render, packages the ladder and swaps `renderedUrl` → `master.m3u8` on success; flat MP4 kept as fallback (packaging failure is logged-and-ignored) + `<24h` cache on the progressive object since the m3u8 becomes the served URL. Client needed zero changes — `VideoManager` already maps `.m3u8` → `contentType:'hls'` adaptive playback.
- **Pre-existing production bug found via smoke:** `buildHlsArgs` emitted `-vf:v:N scale=` per rendition alongside the `-filter_complex` chains — FFmpeg hard-rejects ("simple and complex filtering cannot be used together"), so the HLS ladder had never actually produced output for uploaded media either (progressive MP4 was serving everywhere). Also fixed: unconditional `-map 0:a` (dies on silent video; now probed per-source, `var_stream_map` drops `a:` when absent) and invalid x264 `closed-coder=1` → `open-gop=0`.
- Real-FFmpeg smoke (`scripts/smoke-rendered-hls.ts`) verifies both variants on the actual render output: audio ladder (master + 5 playlists + fMP4 segs, EXT-X-MAP + ENDLIST) and silent ladder (video-only CODECS).
- Verified: backend tsc clean (only error is in-flight sellerHub refactor, untouched); 102/102 across compositionRenderer(73)+keyframeEvaluator(18)+creatorPublicationRender(11 — new: m3u8 swap, failure fallback).


### Wave G cont. (2026-09-15): poster video-frame render discard — fixed.
- Found while auditing frame projection: `renderPosterFrameCompositions` rendered edited video pages (FFmpeg transcode + HLS ladder + upload all ran), but the frame builder gated `renderedMediaUrl` on `isImage` — the video render was computed then thrown away, and the frame's `media_url` fell back to the source upload. An edited video frame in a multi-page poster silently published unedited media — the W12-P0-1 defect class on the poster path.
- Fix: `media_url` now resolves `posterFrameRenders.renders.get(index) ?? verifiedMedia.resolvedUrl` for every media page. Trivial/skipped pages hold `null` in the map and keep the source URL; rendered video frames store the render URL (m3u8 when the ladder packaged — VideoManager plays it adaptively).
- Verified: backend tsc clean; 102/102 (compositionRenderer 73, keyframeEvaluator 18, creatorPublicationRender 11).
- Also confirmed the coherent chain end-to-end: video `canonical_url` = `abr.masterPlaylistUrl` (pipeline.ts:589) → `verifyMediaReceipt.resolvedUrl` already serves `.m3u8` for processed assets → trivial frames get ABR for free now that `buildHlsArgs` works. Pre-fix, broken `buildHlsArgs` meant every video processing job failed outright (runFfmpeg unguarded at the top of processVideoAsset) — video assets never reached publishable, so video publication receipts would have rejected with MEDIA_PROCESSING_FAILED. The packager repair unblocked the whole video publish path, not just the ladder.


### Wave Q (2026-09-15): marketplace-department fix wave — landed.
- 8 parallel audits → 10 fix agents → adversarial recovery after SWE-2 rate-limit kills. All scopes verified on disk + typechecks clean.
- **Notifications**: every emit site typed (zero-untyped contract test); `follow_received`→`new_follower` rename; ops fan-out → `ops_alert`; `filterCounts` server-side (GROUP BY + FILTER); 5 missing `auction_*` types added to frontend union + registry mirror + card map + filter buckets (frontend/backend mirrors now identical); `coown_verification_responded` registered end-to-end; banner actions route through `resolveNotificationRoute`; `CreatorDraftList` allowlist + `PARAM_VALIDATED_SCREENS`; `resolveCardActionLabel` wired into rows; `NotificationsScreen` filterCounts nullable-coalesce.
- **Discovery**: `categoryId:'all'` populated end-to-end; `promotionId`/`disclosure`/`promoted` through all contract boundaries; `/feed/home` live (reach + promoted blend); context-aware empty CTA.
- **Promotions**: full lifecycle panel (pause/resume/end, per-row stats, ledger aggregates); Sponsored chip on rows; idempotent create; NaN guards; real `endsAt` in success copy; fabricated peer-benchmark removed.
- **Chat**: offer cards persisted server-side (`chatmsg_offer_{offerId}`, ON CONFLICT, status via jsonb_set + `chat.message.edited`); sender echo reconciles; self-typing excluded both layers; poll votes publish+subscribe; `reconciling` honest state; forwards support matrix; pin capability-gated; blocked composer notice.
- **PDP**: `responseRate` ×100 bug; `returnPolicy` tri-state + summary; `reachState`→restricted dock; canonical media threaded (kind/focal/blurhash/poster); more-from-seller rail from server recs; price-alert purchasable-gate + auth; 403→unavailable; Smart Sell banner removed (device-local claim); `responseTimeLabel` gated on real hours; Q&A real names; 4 evidence columns added to PDP SELECT.
- **Checkout**: 1ZE rail — synchronous settle inside POST /payments/intents (in-tx debit + order settle, server `requiredOnezeUnits`, WALLET_INSUFFICIENT_BALANCE with required/available); `POST /orders/:id/shipping-label` + `/fulfilment/handoff-assertion` implemented (15/15 tests); `provider_submission_pending` reconciler + reservation sweep + markIntentFailed compensation; intent replay re-verifies payability; `canCancel` created-only + `canReportIssue`; receipt fee dedupe; `parsed.code` switch (SELLER_RESTRICTED terminal / LISTING_CHECKOUT_RESERVED transient / CHECKOUT_RESERVATION_EXPIRED); returns full state machine surfaced; fee `subtotal<=0` guard; a11y focus on payment error.
- **Seller hub**: `catalogue_awaiting` + `verification_demand` tasks (real tables); away row + trust-strip suppression; task deep-link params; Standards module + appeals; `SellerHubScreen` decomposed 456→388 (gate green).
- **Co-own**: `GET /co-own/seller/:userId/verification-demands` + `GET /co-own/assets/:assetId/recourse` + `POST /co-own/assets/:assetId/verification-demand/:demandId/respond` — three dead callers now live (10/10 tests).
- **Lot-settle reach gate** (inline): suspended seller's lot can't settle into a payable order.
- **Identity**: native in-app review prompt; `expo-constants` version; dead Feature-flags row removed; session-expiry notice on AuthLanding; `attemptsRemaining` on password login.
- **Frontier**: React Compiler enabled (`experiments.reactCompiler`); dead FlashList v1 prop removed.
- Verified: backend tsc clean; frontend tsc clean; `git diff --check` clean; notificationContract 7/7; orderFulfilment 15/15; notifications 13/13; offerChatCards 8/8; coownVerificationDemands 10/10; promotions 22/22; checkout 96/96; PDP 268; chat 62/62.
- Flagged: `backendWorkflowClosure` 2 failures pre-existing (no local Redis/Postgres); `coownMatchingProperty.test.ts` vitest/node-test runner mismatch pre-existing; upstream co-own write path (createVerificationDemand/signRecourseAgreement) still stubbed — demands can't be created yet.

### Wave H (2026-09-15): video artifact 3-URL contract — landed.
- The single `media_url` field was doing three jobs (playback/poster/download). With `canonical_url` now an m3u8 playlist for every processed video, every image-context consumer broke silently.
- **Backend**: `posters.poster_url`/`download_media_url` + `look_media` same columns (migration 304); `enrichPosterFrames` emits `posterUrl`/`downloadUrl`/`previewUrl` (COALESCE poster_url→media_url for highlight covers); `LOOK_SELECT_COLUMNS` + look serialization emit `posterUrl`/`downloadUrl` + per-slide carousel fields; `VerifiedLookMedia` carries `posterUrl`/`progressiveUrl` (`asset.metadata->>'posterUrl'` + `public_url`); look create/PATCH/repost/`look_media` writes all carry the columns; repost now copies `look_media` slides (previously dropped carousel slides silently); legacy `POST /posters` joins `media_assets` → canonical m3u8 as media_url + poster/download columns; feed.ts `media_url` selects COALESCE'd to poster for image contexts; `mediaAssets` serializer emits `posterUrl`/`downloadUrl`; creatorAnalytics top-content thumbnails COALESCE'd.
- **Frontend**: `isVideoUrl`/`isVideoUri` match `.m3u8` (query-string safe); `PosterViewerScreen` saves `downloadUrl` (progressive MP4) not the playlist; `LooksTab`/`ProfileLooksGrid`/`ProfileLookTile`/`LookMasonryTile`/`PosterStoryArtwork`/`PosterHighlightsRail`/`PosterArchiveScreen`/`CreatePosterHighlightScreen`/`HomeScreen` looks rail all prefer `posterUrl` for video tiles; `discoveryFeedAssembly` no longer drops video looks/posters from covers (uses posterUrl); `useLookMedia` detects m3u8 + carries `posterUri` per slide; `LookMediaCarousel` shows a still poster over `VideoView` until `onFirstFrameRender` (no black viewport); `CreatorAssetPicker` look stickers snapshot `posterUrl`; `viewerAdapters` poster adapter maps `posterUrl`→`thumbnailUri`.
- Verified: backend tsc clean; frontend tsc clean; 116/116 touched tests (compositionRenderer 73, creatorPublicationRender 11, mediaContract + parity 32).
- Service hardening: poster frame `isVideoFrame` falls back to `mediaLayer.payload.mediaType` when the receipt is missing — a rendered m3u8 can never be mislabelled `image`.

### Wave I (2026-09-15): listing/auction media poster parity — landed.
- The 3-URL contract existed for looks/posters but the *listing* gallery had the same latent defect: `listing_images.image_url` can hold the m3u8 `canonical_url` for video media, and every `images[]`/`imageUrl`/thumbnail projection fed it raw into image contexts.
- **Projection layer** (`listingMediaProjection.ts`): new `listingMediaImageUrl(item)` — poster still for `kind:'video'`, `uri` otherwise; `listingImageUrls` routes through it. `media[]` still carries the playable m3u8 + poster pair unchanged.
- **Consumers switched** — all `mediaItems.map(m => m.uri)` image arrays: index.ts ×5, feed.ts ×4, visualSearch.ts ×1, searchExtended.ts ×3 (via `listingImageUrls`). Primary `imageUrl` fields now resolve `listingImageUrls(media, row.image_url)[0]` — video-first listings surface the poster, matching `images[0]` and the PDP first page.
- **Attach path backfill** (index.ts): the finalization join now selects `asset.metadata->>'posterUrl'`; `listing_images.poster_url` falls back to the pipeline-generated poster when the client doesn't supply one — previously `poster_url` stayed null unless the client knew the server-generated URL (it couldn't — processing finishes after upload).
- **Raw-SQL thumbnail seams** got the same poster coalesce inline: 6 auction queries (live rail, rooms, bid transactions, detail, watchlist, my-bids), `orderChatCards` item_image, `moodboards` picker subselects ×2, `streaming` session-card thumbnail lateral, `visualSearch` feature-extraction source (decodes the URL — an m3u8 would fail decode as playlist text).
- Frontend: `productDetailViewModel.isVideo` now matches `.m3u8` (query-string safe).
- Verified: backend tsc clean; frontend tsc clean; mediaContract 11/11 (+3 new listingImageUrls tests); visualSearchRoute 12/12; full suite 152/159 (7 failures = pre-existing env-dependent embedder/IPv6 files, untouched).

### Wave J (2026-09-15): chat media poster parity — landed.
- Shared-conversation video tiles rendered as empty dark blocks and chat video bubbles fed the canonical m3u8 into `CachedImage` — same 3-URL defect, third surface.
- **Backend** (`routes/chat.ts`): canonical media-asset lookup + ownership check hoisted *before* `chat_messages` insert (a failed check previously left an orphan message row); voice sends reject non-audio assets; new video messages merge `posterUri` (from `media_assets.metadata->>'posterUrl'`) into message metadata; `serializeChatMessageRows` backfills `posterUri` for legacy video messages via `chat_message_attachments → media_assets` join; the shared-media endpoint emits `posterUri` per video item with the same attachment backfill.
- **Frontend**: `Message.posterUri` added to the domain type; `chatApi` mapper reads `meta.posterUri`; realtime `chat_message` payload mapper extracts it from metadata; `useConversationMessages` append path + `hydrateConversationMessages` carry it; `ChatMessageItem`→`MessageBubble` renders `posterUri ?? mediaUri` for video bubbles (mediaUri stays for playback/open); `SharedConversationMediaScreen` maps `posterUri`→`thumbnailUri` for both API and store paths.
- Forward path needs no change: re-sending the canonical URI re-derives `posterUri` server-side from `media_assets`.
- Verified: backend tsc clean; frontend tsc clean; mediaContract 11/11.
- **Regression coverage**: `chat.mediaPoster.test.ts` (node:test + real `registerChatRoutes` over a fake pool) — 6/6: poster merge on video send, insert-absent on unknown asset, insert-absent on foreign-owned asset, 422 on non-audio voice asset, GET-messages attachment backfill, shared-media `posterUri` emission.
- **Audit sweep closed**: promotions/liveLotEngine/coOwn/promotionServing/recommendations/storefronts/sellers/sync/extendedProjections all read `listings.image_url`/`shared_assets.image_url` — image-verified columns (cover gate requires `image/*` + verified upload). `mediaEmbeddings` enqueue is `media_kind='image'` gated. Galleria items are admin-curated image URLs. Listing share-compose uses `images[0]` → poster JPG for video-first listings (safe after Wave I). Instagram-story share takes composed local images only.

### Wave Q cont. (2026-09-15): adversarial-review hardening — landed.
- Read-only review of the 8 Wave Q surfaces found 6 defects; all closed.
- **Money integrity (backend)**: every cancel-on-reservation-expiry path (periodic sweep, POST /orders lazy reclaim, checkout-details PATCH, intent-creation gate, idempotent replay payability, offer sweep, lot-settle reclaim) now routes through `cancelOrderOnReservationExpiry` — row-lock → fresh in-flight check → guarded UPDATE. In-flight = provider_submission_pending/processing/unknown unconditionally + requires_confirmation/requires_payment_method within 2h recency; both link directions (`pi.order_id`, `orders.payment_intent_id`). Previously a captured-but-parked payment could settle against a cancelled order and silently no-op.
- **Orphaned capture detection**: `settlePaymentIntent` now flags `order.payment_orphaned` (deduped order_events row + `reconciliation_breaks` row + critical `OpsAlertCode.captured_payment_orphaned`) when a succeeded payment finds the order no longer 'created' — was a silent money-vs-state divergence.
- **Pause provenance**: migration 305 adds `listings.pause_source` ('seller'|'checkout_reservation'|'auction'|'coown_asset'), backfills in-flight pauses, repairs the 131 `payment_intents_status_check` (missing `provider_submission_pending`), replaces the 071 trigger so cancel-restore requires `pause_source='checkout_reservation'`; all pause write-sites stamped. Seller pause can no longer be silently undone by reservation expiry.
- **1ZE FX TOCTOU**: `computeOnezeDebitQuote` runs once in `oneze_internal` preflight; the same quote drives balance check, the 402 `requiredOnezeUnits` response, and the ledger debit via `resolvedOnezeDebitQuote` into `settlePaymentIntent` (validated, 0.5¢ tolerance). Two live FX reads → one.
- **Chat reconciliation (frontend)**: resnapshot now drops `sending`/`draft` echoes the server already carries (id or clientMessageId match) — previously an offer card persisted server-side before the realtime event left a permanent duplicate 'sending' bubble.
- **Forward gate**: `isForwardableMessage` refuses offer/poll/commerce/document/system cards instead of degrading them to dead plaintext.
- **Typing self-echo**: `useTypingUsers` re-filters at the render boundary — a self-echo arriving while `selfId` is still null (store hydration) no longer lingers.
- Verified: backend tsc clean; frontend tsc clean; `git diff --check` clean; `checkoutMoneyPathGuards` 17/17; liveLotTiming + paymentP0Gates + reconciliation + commercePayments 75/75; chat 62/62.
- Caveat: migration 305 statically verified (up/down diffs vs 071/131 verbatim) but not executed against live Postgres.

### Wave R batch 1 (2026-09-15): reviews / saved / collections / follow — landed.
The Wave R reviews+saved audit found `/users/me/wishlist` had **no backend route** — every heart toggle was MMKV-local while the UI announced persistence, and `savedProducts` had no contract at all. Fixes:

- **Saved-lists contract (P0)**: migration 306 `user_saved_listings` (user×list×listing PK, `list` discriminates 'wishlist'|'saved', cascade FKs) + `GET/POST /users/me/wishlist` + `/users/me/saved` in users.ts — hydrated `ListingSummary` items alongside `itemIds` so saved surfaces never intersect with resident feed pages. `toggleWishlist`/`toggleSavedProduct` persist with local-first toggle + server reconcile; `hydrateSavedLists` adopts guest/offline saves on login; `logout()` clears wishlist/savedProducts/collections (account isolation). Focused test `savedLists.test.ts` 7/7.
- **Unfollow (P0)**: `useSellerFollow` is directional POST/DELETE with cache propagation (profile, followers, viewer-following). Auction detail + PDP share it. `useCreatorFollow` migrated off local useState/direct-API onto shared `usePublicProfileQuery` + `useFollowMutation` (optimistic cache, rollback, canonical mutationKey for non-RQ surfaces).
- **Review integrity**: seller profile rating average/distribution now exclude `is_auto` rows and count only `published`/`restored` publication states (joined `review_publication_state`); public review items filtered the same — moderated/auto feedback no longer inflates or leaks. `sellers.ts` now receives `queueUserNotification` so seller follows notify.
- **Media provenance (P1, latent runtime bug)**: `photoUrls` and support-ticket `evidenceMediaUrls` accepted arbitrary external URLs into publicly-rendered surfaces — now gated by `findUnownedMediaUrls` (upload_finalizations ⋈ media_assets). While implementing, discovered `upload_finalizations` has **no `canonical_url` column** — the pre-existing avatar/cover ownership checks would have thrown at runtime; fixed to join `media_assets`.
- **WriteReviewScreen**: load-error canvas, not-yet-reviewable canvas (delivered/completed gate), `Idempotency-Key: review_<orderId>`, `REVIEW_ALREADY_EXISTS` → refetch + read-only published state, unknown-outcome "Checking your review" reconciliation instead of fabricated success.
- **Orders `hasReview`**: list payload now computes `EXISTS(order_reviews WHERE NOT is_auto)`; MyOrdersScreen consumes it (was hardcoded `false` — every row looked unreviewed).
- **Collections**: private collections no longer render the share control (was toast-blocked after invocation → leaked dead URL); display count uses canonical `itemIds`; refresh reloads collections + listings; local collections merge with server rows on load; `POST /collections/:id/items` accepts `sold`/`paused` listings (bookmarks, not purchases) — only draft/deleted/risk_pending 404.
- **Profile unfollow**: destructive-confirm Alert before unfollow (stray tap no longer silently drops a follow).
- **Discovery**: double-tap checks current wishlist state — no longer unlikes an already-liked item.
- Verified: backend tsc clean; frontend tsc clean; `git diff --check` clean; savedLists 7/7.
- Outstanding: 5 Wave R auditors (orders, wallet/payouts, settings, sell-flow, a11y+offline) re-dispatched staggered after free-model rate limits killed the parallel batch.

### Wave R batch 2 (2026-09-15): orders/returns, settings, a11y, sell-flow — landed.

**Orders + returns integrity**
- Participant/ownership gates on order routes; escrow holds now account for `return` support topics + open `return_cases` at deliver-time and in the release sweep.
- Returns state machine: buyer post-approval transition, auto-linked refund execution on remedy accept, `resolved_at` stamped on reject/close, `remedy_accepted → appealed` escalates stalled remedies.
- Orders list: composite `(created_at, id)` cursor (timestamp-only dropped same-tick rows), `cursor` accepts `ts|id`, role-aware `needs_action`/`active` classification matching the frontend vocabulary, `refunding` added to client status vocabulary, append-path dedup by id.
- `view_review` navigates to WriteReview (receipt screen never rendered the review); auto reviews are supersedable through the form, not terminal.
- Focused suites 40/40 green.

**Settings depth**
- P0 account-deletion gate: `DELETE /users/me` now 409s with structured blockers (open orders, return cases, pending payouts, in-flight withdrawals) using `to_regclass` guards for partially-migrated DBs; DeleteAccountScreen surfaces blocker categories as explicit copy and keeps the form alive.
- P1 contract gap found by route-diff scan: `GET /users/me/privacy-preferences` was called on every PrivacySettingsScreen mount but never existed → permanent error canvas. Route added over `users.activity_status_visible`/`search_visibility`; `privacyPreferences.test.ts` 3/3.

**Accessibility + offline sweep**
- `AppInput` invalid/alert semantics (every form inherits), `FieldErrorRow`/AddressForm/OrderDetail error announcements, `HomeDiscoveryCard` save `selected` state, auction + make-offer offline mutation gates, legacy `utils/haptics` now respects the reduced-motion gate (~400 call sites), nav-push `haptics.tap()` removed from OrderDetail.
- `MakeOfferSheet` slider verified already-correct (`adjustable` + value + increment/decrement actions).

**Sell-flow + payout integrity**
- **P1 concurrent overpayout**: `POST /users/:userId/payout-requests` balance check read `seller_payable` unlocked — two same-seller requests (different idempotency keys) could both pass and overdraw. Now `ensureLedgerAccount` + `FOR UPDATE` on the account row serializes read→debit per seller.
- **P2 dispatch double-tap**: `isDispatching`/`isProposingExtension` were React state — stale-closure double-fire produced success + 409 toast pairs. `dispatchInFlightRef`/`extensionInFlightRef` close the window (mirrors publish pipeline).
- **P2 non-GBP payout honesty**: success screen displayed the client's FX conversion; the ledger debits the backend's own rate. Success + balance now use `payoutRequest.amountGbp` and `balance.sellerPayableAfterRequestGbp`; `reloadBalance` re-reads the ledger after success and after acknowledged unknown-outcomes.
- **P2 synthetic tracking**: `POST /orders/:id/ship` persisted `TV-<ORDERID>` as a tracking number when none was supplied → 422 `TRACKING_REQUIRED` instead (row-carried carrier tracking still honoured).
- P3s: co_own publish redirect now inside the `isPublishingRef` guard; dead `Idempotency-Key` header removed from `createListingOnApi` (upsert-by-body-id is the real contract — comment says so).
- Paste-from-clipboard affordance on the manual tracking input (sellers copy tracking from carrier sites).
- Verified: backend tsc clean; frontend tsc clean; `git diff --check` clean (CRLF-aware); privacyPreferences 3/3; ManualDispatchForm paste affordance in place.
- Outstanding: wallet backend P0 agent (463b928e) still in flight — convert-preview mutation, 1ZE mint replay (migration 307 staged), `oneze_internal` refund, dual-ledger divergence.

**Wallet/payments backend (agent batch — landed, reviewed)**
- **P0 convert-preview mutation**: `getConvertQuote` sent `preview: true` to the *executing* convert route — the debounced typing preview burned 1ZE per keystroke and confirmation converted a second time. Schema now accepts `preview`; a read-only branch returns the identical payload from the shared `computeOnezeToFiatConversionQuote` without persisting.
- **P0 mint replay**: `POST /wallet/1ze/mint` verified a settled payment intent but never consumed it — a fresh idempotency key reminted from the same intent. Migration 307 adds `UNIQUE(wallet_ize_operations.payment_intent_id)`; mint materializes the operation once via quote metadata and replays return the canonical `wallets.oneze_balance_units` position.
- **P0 `oneze_internal` refunds**: `createGatewayRefund` had no internal-rail branch — refunds wedged in `refunding` and the fiat ledger reversal never restored the buyer's 1ZE. `refundOnezeInternalWalletDebit` credits the buyer idempotently (stable `refundOperationId` required), joins the caller's transaction when one is live.
- **Dual-ledger divergence**: `applyWalletLedgerDelta` moved to `lib/walletMoneyPath.ts` as the canonical primitive (dropped the `workerRuntime → queues.ts → ioredis` import chain that hung every importing test); `index.ts`/`creatorAnalytics.ts` call sites unchanged.
- **Same-race found + fixed in sweep**: `/ops/payouts/schedule-sweep` took the identical `seller_payable` FOR UPDATE lock as the manual payout route.
- buy-1ze minor units now exponent-aware (`toFiatMinor`), not hardcoded ×100.
- Verified: backend tsc clean (combined index.ts edits); `walletMoneyPath.test` 13/13 + `refundAfterPayout` 7/7.
- Caveats: Redis-dependent halt paths code-reviewed not executed (no Redis in env); bank-destination creator earnings land `'held'` — nothing yet flips `held→paid` on payout settlement (follow-up gap); `mediaPipeline.test.ts` has a pre-existing Redis-at-import failure outside this scope.
- Note on `git diff --check`: repo blobs are committed verbatim-CRLF with `core.autocrlf=true` and no `.gitattributes`, so stock `diff --check` reports `\r` as trailing whitespace on every added line of a CRLF file. The CRLF-aware gate (`git -c core.whitespace=cr-at-eol diff --check`) is fully clean — all flags were the EOL artifact, none were real whitespace.

### Wave U (2026-09-15): creator department P1/P2 batch 2 — interaction, dead-data, templates, primitives — landed.
Six domain audits (timeline, studio, primitives, publish/export, backend-media, capture) fed this batch; all findings verified against source before fixing.

**Interaction repairs**
- `CreatorCanvas` multi-select drag: pan `onStart` called `handlePress`, which in multi-select mode toggles membership and collapses `selectedLayerIds` to one id mid-gesture — peers moved visually (captured `isMultiSelectActive`) but the commit path no longer matched selection. Drag-start now no-ops when the layer is already multi-selected; taps still toggle via `tapGesture`.
- `CreatorAnimations` sheet: pan gesture covered the whole sheet including `KeyboardAwareScrollView` — downward drags on scrolled content dragged the sheet instead of scrolling. Scroll content wrapped in `Gesture.Native()`; sheet pan uses `requireExternalGestureToFail` so it only wins when the scroll can't move. `isDismissingRef`/`sheetHeightRef` JS-refs read/mutated inside UI worklets → shared values; hardcoded `translateY=1000` exit → live `windowHeight` target.
- `CropSheet` focal-point leak: `handleFocalTap` wrote `onFocalPointChange` immediately — cancelling the sheet leaked a source-space focal point while confirm wrote output-space. Draft state now resets on sheet-open and only commits via `handleCrop`.
- Color primitives `HueSlider`/`SVPlane`/`GradientEditor`/`AlphaSlider`/`CreatorSlider`: `onEnd`-only commits lost the final value on gesture FAIL/CANCEL (system interrupt, sheet dismiss) → commit/state cleanup moved to `onFinalize`.
- History-per-frame verified already-correct: live `updateLayerLive` vs commit `updateLayer` split exists in look + poster effect hooks.

**Dead-data / persistence repairs**
- Text structured fields: schema/text-editor carry `fill`/`background`/`stroke`/`shadow` but `TextLayerContent` read only legacy `textColor`/`backgroundColor`/`textEffect` — stroke/shadow authored in the sheet never previewed. Canvas now prefers canonical fields (pill background, layered-stroke, multi-shadow glow/neon) with legacy fallback.
- AI effect recipe persistence (the headline P1): `applyFilterEffect` persisted only `id:'ai:...'` — every non-preview surface (view doc, backend image renderer, FFmpeg video path) looked it up in the named-preset table and failed closed to identity, silently discarding the authored grade on publish. Composition schema `filter` node now carries `recipe: EffectNode[]`; `filterNode.ts` `buildFilterEffectNode` maps AIEffectRegistry output → composition nodes; both `useLookEffects`/`usePosterEffects` select+swipe-preview paths persist recipes; `EffectEvaluator` folds recipe nodes; backend `applyPixelEffects`/`buildEffectOverlay` descend into recipes (matrix fold → LUT, adjust, blur, grain, vignette). Video path gained a full effect stage — `resolveVideoFilterChain` emits LUT/crop-blur/grain/vignette filters injected into both simple and complex graphs (previously any `effects[]` on video forced transcode but rendered ungraded).
- `CreatorSettingsSheet` flush-on-close: title/caption/alt-text committed only `onBlur` — swiping the sheet away dropped typed text. Dirty-tracked flush added to the `onClose` path.
- `renderedViewDocument` hidden-layer leak: hidden `vote`/`link`/`hashtag`/`product`/`audio` layers survived into the view doc — tappable/playable for viewers the author hid them from. Now dropped.

**Template repairs**
- `templates.ts` shipped `countdown`, `music`, `poll`, `productTag`, `photoContest`, `hashtagChallenge`, `nextDrop` layer types — none pass `validateForPublish`. All replaced with publishable equivalents (text, `product` with real listingId, `vote`, `hashtag`) preserving visual intent; unused `endDate` vars folded into replacement copy.
- `validateDocumentStructure` now rejects `product` layers with empty `listingId` (was allowed → published a dead tappable sticker).

**Verification**: frontend tsc clean; backend tsc clean; creator suite 66/66 (incl. new `effectRecipe.test.ts` 9/9); backend media suite 121/121; `git diff --check` clean; eslint 0 errors on touched files (warnings pre-existing). The 7 backend test failures are env-dependent (IPv6 SSRF DNS resolution, external embedder service) — pre-existing, unrelated.

### Wave V (2026-09-15): upload/media recovery residuals — UR-7..UR-14 closed or dispositioned.

**Backend lifecycle**
- UR-12 durable ingest enqueue: `listClaimableProcessingJobs` + `mediaIngestReconcileHandler` re-drive `pending`/`retry`/stale-`processing` media-processing rows that never reached BullMQ (DB insert commits before enqueue in `uploads.ts`; non-image assets had no inline fallback). Distinct reconcile jobId — a retained failed `media_ingest_${assetId}` record (`removeOnFail: 200`) can no longer suppress recovery. Wired through infra dispatch, standalone worker, and an API scheduler with startup invoke + shutdown cleanup.
- UR-8 multipart GC: `multipartSessionSweepHandler` claims expired `active` sessions via guarded status update *before* S3 abort (concurrent complete → clean 409, not an overwrite). `NoSuchUpload` marks expired cleanly; S3 failures keep the claim for the next sweep. 5-minute bucket jobId; API + standalone-worker schedulers.

**Frontend lifecycle**
- UR-13: `resumeJob`/`retryJob` now no-op on live attempts (`activeUploads`) and non-resumable statuses — a running job can't be flipped to `queued` mid-attempt and double-driven. `cancelJob` × in-flight `processJob` verified no-resurrect (store `updateJob` no-ops on missing rows).
- UR-7: finalize 404/410 drops the persisted `uploadedObject` checkpoint → next attempt re-presigns rather than replaying a dead intent (manual retry path covered).
- UR-11: `waitForProjectCompletion` accepts `{ signal, timeoutMs }`; both exits resolve with the latest job list — no more unbounded wait on paused work.
- UR-9: `MultipartUploader.resolveReadablePath` resolves `ph://`/`content://` → `file://` via MediaLibrary metadata, so ranged reads apply; the whole-file Blob fallback is now unreachable for media-picker URIs.
- UR-10 PARKED: native `createUploadTask` is whole-file only; ranged parts would need per-part temp-file staging + orphan-temp GC. Per-part ETag checkpointing already bounds kill cost to one part. Deferred pending device profiling.
- UR-14 PARTIAL: signal forwarding, dead-checkpoint clearance, stall→jobFailed, shared persist throttle, /parts bounds, manifest validation done. Residuals: throughput/ETA, enqueue dedup gap, reachability nuance, endpoint rate limits, orphan retention.

**Verification**: frontend tsc clean; backend tsc clean; creator suite 73/73 (UploadRecovery 31 + UploadManagerReconcile 6 — added the missing expo-media-library mock to the latter); backend media suite 127/127; eslint clean on touched frontend files (backend has no flat-config eslint). `git diff --check` flags are the repo-wide CRLF/`cr-at-eol` artifact documented in Wave U — verified via `git diff --numstat` (surgical 75/3) and byte-level line inspection (no real trailing whitespace).

### Wave W (2026-09-15): UR-14 closure + storage-hygiene findings from a parallel storage audit.

**UR-14 micro-state closure**
- Enqueue dedup async gap: `queueUpload` checks `findExistingJob` then awaits `resolveFileSize` — concurrent calls for the same asset both passed dedup and created duplicate jobs. `pendingEnqueues` promise-join keyed on (projectId, assetId, localPath) closes the window.
- Reachability vs connectivity: NetInfo wiring treated `isConnected !== false` as online; a captive portal (`isInternetReachable === false`) now parks the queue too.
- Orphan job retention: terminal (completed/failed) jobs older than 7 days are purged from AsyncStorage on hydrate — the store no longer grows unboundedly when `clearProjectJobs` is never called.
- Throughput/ETA: rolling 4s sample window per job emits real `bytesPerSecond`/`etaSeconds` on progress events (resets on retry un-reporting; never fabricates a single-tick rate). `getTransferStats(projectId)` aggregates across in-flight jobs; `useUploadManager` exposes both; `SharingStateView` shows a restrained "About Xs left" sublabel only while a measured rate exists.
- Endpoint rate limits: all four multipart routes now carry per-route `config.rateLimit` (initiate/complete/abort 20/min, parts 60/min) matching the `/uploads/presign` pattern.

**Storage audit findings fixed**
- `abortMultipartUpload` ignored the session's stored `bucket` — aborts after a bucket rotation would hit the wrong bucket → NoSuchUpload → row marked aborted while parts leak. Both the route and the sweep now pass `session.bucket`.
- `multipartSessionSweepHandler` gained a second pass: `listMultipartUploads` finds S3-side uploads with no `upload_multipart_sessions` row (initiate creates the S3 upload before the DB insert — a crash in the gap leaks invisibly) and aborts those older than a 1h grace window. Fixed a self-introduced early-return that skipped the orphan pass on empty claim batches.
- `POST /internal/media/orphans/cleanup` had no in-process caller (silently depended on external cron). `cleanupOrphanedUploadIntents` extracted from `mediaAssets.ts` and driven by a new `orphan_upload_intent_sweep` infra job (5-min bucket, API + standalone-worker schedulers).
- False-assurance comment in `mediaUploadMultipart.ts` ("reclaimed by the bucket lifecycle" — no lifecycle is configured) corrected to cite the server sweep.
- DEPLOYMENT.md §6.5 documents the required `AbortIncompleteMultipartUpload: 7d` bucket lifecycle rule for R2/S3 (ops apply; still open).

**Verification**: frontend tsc clean; backend tsc clean; creator suite 75/75 (incl. new dedup + retention tests); backend media suite 14/14 (incl. orphan-pass coverage); eslint clean on touched files. Remaining residuals: post-complete-crash orphan *objects* (S3 has the assembled object, no finalization row — needs a ListObjects-vs-DB reconciler, documented not built); MinIO dev lifecycle rule; Grafana alert on stuck `expired` rows.
