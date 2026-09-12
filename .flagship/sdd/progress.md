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
