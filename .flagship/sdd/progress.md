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
