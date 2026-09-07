# Task 1A Report — Durable upload transport for listings + profile

**Status:** DONE_WITH_CONCERNS
**Branch:** feat/product-detail-contract-media-device-closure (HEAD 03153b2)
**Working tree:** changes left uncommitted as instructed. No commit hash — see `git status` for the five owned files.
**Owned files touched (only these):**

- `frontend/src/platform/media/xhrUploadTransport.ts` (NEW, 102 lines)
- `frontend/src/services/mediaUpload.ts`
- `frontend/src/services/mediaUploadQueue.ts`
- `frontend/src/hooks/useProfileMediaUpload.ts`
- `frontend/src/creator/core/upload/UploadManager.ts`

Not touched (verified): ListingMediaStudio.tsx, SortablePhotoStrip.tsx, CreatorCropSheet.tsx, InCanvasCropOverlay.tsx, any screen file.

---

## 1. New shared transport — `platform/media/xhrUploadTransport.ts`

- `export interface XhrPutOptions { signal?, onProgress?, headers? }` and
  `export async function xhrPutFile(url, fileUri, mimeType, opts?): Promise<void>` — exactly the
  brief's signature.
- File resolution: `fetch(fileUri, { signal }).then(r => r.blob())` (the pattern mediaUpload.ts
  already used; works for `file://` and `content://` on this stack), then XHR PUT of the blob.
- XHR mechanics ported 1:1 from `UploadManager.ts:743-805`: `Content-Type` from `mimeType`,
  `xhr.upload.onprogress` → `onProgress(e.loaded, e.total)` (guarded by `lengthComputable`),
  `onload` 2xx-check → `Error('Upload PUT failed: HTTP <status>')`, `onerror` →
  `'Network error during upload'`, `ontimeout` → `'Upload timed out'`, `settled` latch +
  `cleanup()` removing the abort listener and nulling `onprogress`.
- Abort: `signal.addEventListener('abort', () => xhr.abort(), { once: true })` with cleanup;
  pre-aborted signal short-circuits. Rejection is a `DOMException('…', 'AbortError')` when
  DOMException exists, else an `Error` with `name = 'AbortError'` (same detection contract as
  fetch). Also attaches `err.status = xhr.status` on non-2xx so callers can keep the
  5xx-only retry rule.
- Extra exports used by both consumers: `isAbortError(err)` (name-based, inheritance-agnostic)
  and `createAbortError()`.

## 2. `services/mediaUpload.ts`

- `uploadToPresignedUrl(url, fileUri, contentType, preparedBlob?, opts?: MediaUploadOptions)`:
  fetch-PUT replaced with `xhrPutFile`. Retry loop kept (3 retries, 5xx/network only) — the
  transport's `err.status` preserves the 4xx-deterministic vs 5xx-retryable split, and
  `httpStatusToMessage()` copy is preserved for both throw paths. Backoff now
  `computeBackoff()` = `round(min(30_000, 1000·2^attempt) + random·capped·0.25)` — identical
  formula to `UploadManager.computeBackoff` (UploadManager.ts:954-963). `isAbortError` errors
  are rethrown immediately, never retried; `opts.signal` is threaded into the backoff `sleep`
  so cancellation during backoff exits immediately.
- `uploadMedia(...)`: additive third param `opts?: MediaUploadOptions` on both overloads;
  threads `opts` into `uploadToPresignedUrl`. All existing call sites (profile, chat, KYC,
  review, evidence, reports, creator mediaUploadPipeline) compile untouched.
- `presignUpload` / `finalizeUpload` contracts unchanged.
- `MediaUploadOptions { signal?, onProgress? }` is exported for consumers.

## 3. `services/mediaUploadQueue.ts` — durable behaviors, same public API

All public signatures unchanged (addAssets, retryFailed, retryItem, cancelItem, removeItem,
reorder, getState, getItems, getUploadedUrls, hasPendingOrUploading, hasFailed, allCompleted,
reset, subscribe, run, getResultMap). Additive only:

a) **progress**: `UploadQueueItem.progress: number` (0-1 real bytes). Init 0 in `addAssets`;
   set from `onProgress(loaded/total)` during `uploading` (falls back to `asset.fileSize` when
   `totalBytes === 0`); set to 1 on `uploaded`; reset to 0 on every retry/requeue path
   (processItem start, retryFailed, retryItem, offline recovery).
b) **Abortable cancel**: per-item `AbortController` in a private `Map<string, AbortController>`.
   `cancelItem` sets `_cancelRequested` (existing flag kept) **and** aborts the controller;
   the blob fetch and the PUT reject with AbortError → `processItem` catch maps
   `_cancelRequested || isAbortError(err)` → state `'cancelled'` (existing semantics). The
   post-presign/post-upload flag checks are retained; controller + progress-tick map are
   cleaned in `finally`.
c) **Progress emits**: throttled to ~10/s per item (`PROGRESS_EMIT_INTERVAL_MS = 100`);
   every state transition still emits immediately.
d) **NetInfo**: one subscription per instance via guarded dynamic import
   (`await import('@react-native-community/netinfo')` in try/catch — the established
   apiClient.ts pattern; static import would crash web/test runtimes without the native
   module). `isInternetReachable === false` → `processQueue` stops starting new items
   (in-flight items fail naturally, as today). On `true` after `false` → retryFailed()
   semantics: failed-and-retryable → pending, `start()`, plus a direct `processQueue()` kick
   (needed because a paused queue is still `running === true`, so `start()` alone would
   no-op — this avoids a stuck queue). `reset()` unsubscribes; `start()` re-subscribes so a
   reused queue stays offline-aware. Unknown/`null` reachability never gates the queue.
e) **Durable metadata**: snapshot `{ id, asset, order, state, attemptCount, publicUrl,
   finalizationId, error, retryable }` persisted to AsyncStorage key
   `thryftverse.mediaUploadQueue.v1` after every emit, debounced 250 ms (trailing write
   guaranteed; byte-tick emits never storm storage — same rationale as UploadManager's
   500 ms progress-persist throttle). Static `import AsyncStorage from
   '@react-native-async-storage/async-storage'` per UploadJobStore.ts. On construction the
   snapshot is loaded and merged by id: `pending/preparing/uploading` restore as `'pending'`
   (re-upload is safe; presign creates a fresh key), `uploaded/failed/cancelled` restore
   as-is with `progress` 1/0 respectively. Corrupt/invalid entries are dropped; storage
   failures are swallowed (best-effort metadata). `reset()`'s emit persists `[]`,
   clearing stale state.
f) **Event-driven slots**: the 100 ms-polling `waitForSlot` is now a promise resolver list;
   `notifySlots()` drains waiters while `activeCount < MAX_CONCURRENCY`, called from the
   `processItem.finally` after `activeCount--`. `reset()` resolves all waiters so no
   waiter can hang. Picking + `activeCount++` remain synchronous per loop iteration, so
   concurrent `processQueue()` invocations cannot double-pick.

## 4. `creator/core/upload/UploadManager.ts` — refactor to delegate

- `performSinglePutUpload` now calls the shared `xhrPutFile(presign.url, job.localPath,
  job.mimeType, { signal, onProgress → emitProgress(job.id, loaded, total) })`.
- The private `xhrPutFile` duplicate (former lines 743-805) is deleted; no
  `XMLHttpRequest` usage remains in the file (doc comments aside).
- Behavior parity: abort path still ends as `{ ok: false, error: 'Aborted' }` because
  `runWithRetry` checks `signal.aborted` before inspecting the error (the AbortError
  name change is invisible to the manager); progress totals are equivalent
  (`event.total` = resolved blob size = job.sizeBytes); non-2xx message format unchanged.
  One mechanical difference, judged safe: the body is now a resolved Blob instead of
  `xhr.send({ uri })` native streaming. Single-PUT only runs for files ≤
  MULTIPART_THRESHOLD_BYTES (10 MB) unless multipart is disabled, so the JS-memory blob
  is bounded; noted below as a concern for the `multipartEnabled: false` edge case.

## 5. `hooks/useProfileMediaUpload.ts`

- `ProfileMediaState` gains additive `progress?: number`.
- `performUpload` passes `onProgress` into `uploadMedia`, throttled to ~10/s per media type
  (avatar/cover tick refs), stale-op guarded by `opId`; `progress: 0` on entering
  `uploading`, `progress: 1` on `confirmed`. No UI files touched (Wave 3 owns rendering) —
  the value is simply exposed in the existing state machine.

---

## Verification (all run)

1. `cd frontend && npm run typecheck` → **PASS** (exit 0, no output).
2. `npx eslint --max-warnings 0 src/platform/media/xhrUploadTransport.ts
   src/services/mediaUpload.ts src/services/mediaUploadQueue.ts
   src/hooks/useProfileMediaUpload.ts src/creator/core/upload/UploadManager.ts` → **PASS**
   (exit 0, zero warnings).
3. `npm test` (vitest, `--dir src`) → **identical to baseline**:
   `Test Files 2 failed | 82 passed (84); Tests 7 failed | 1729 passed | 2 skipped (1738)`.
   Baseline was captured before any edit and shows the exact same 7 pre-existing failures
   (`groupChatInfoParity.test.tsx` ×6, `pricingDisplayModes.test.ts` ×1 — group-chat UI
   parity + a pricing snapshot, both unrelated to uploads). Zero new failures.
4. Grep checks: no `fetch(presignedUrl` / `method: 'PUT'` remains in mediaUpload.ts (only the
   `xhrPutFile` import + call); UploadManager.ts has no `xhrPutFile` implementation and no
   direct `XMLHttpRequest` usage — only the shared-transport import and call site.

## Concerns / notes for the parent agent

1. **Double file-read (spec-faithful trade-off).** The brief fixes `xhrPutFile(url, fileUri,
   mimeType, opts)` with file resolution via `fetch(fileUri) → blob`, and `uploadToPresignedUrl`
   keeps its `preparedBlob?` param for call-site compatibility — so callers that already hold a
   Blob (mediaUploadQueue, uploadMedia, creator mediaUploadPipeline) now trigger one extra
   file read inside the transport; the PUT body is no longer the caller's Blob. For resized
   listing images this is negligible; for max-size videos (~100 MB) it transiently doubles
   peak memory vs the old single-fetch path. If this matters on low-end devices, a follow-up
   can add an optional `blob?: Blob` field to `XhrPutOptions` (one-line, additive) — I did not
   deviate from the brief's specified interface unilaterally. `void preparedBlob;` marks the
   retained param intentionally unused.
2. **Offline publish now waits instead of failing fast.** With NetInfo gating, a publish
   attempted while `isInternetReachable === false` pauses the queue with items `pending`, so
   `queue.run()` (awaited by `executePublication`) stays unresolved until connectivity
   returns — then uploads resume and publish proceeds. Previously offline uploads failed
   after ~3 retries and surfaced an error in ~10 s. This matches the brief's pause/resume
   design, but the publish-offline UX (no immediate feedback while the queue waits) belongs
   to the screens/pipeline owner — flagging so Wave 3 can decide whether to surface a
   "waiting for network" state.
3. **UploadManager `multipartEnabled: false` edge.** With multipart disabled, large files
   (>10 MB) take the single-PUT path and are now buffered as a Blob rather than streamed from
   disk via `send({ uri })`. Default config (multipart on) is unaffected. Creator flow
   behavior is otherwise identical (same retry/abort/progress semantics).
4. **Pre-existing working-tree edits.** `useProfileMediaUpload.ts` (and several repo files)
   carried uncommitted campaign changes before this task; the git diff for that file includes
   those pre-existing edits plus mine. My edits there are limited to the `progress` field,
   the throttle ref, and the `onProgress` threading.

---

# Fix Round 1 — review findings

## Finding 1 (memory regression) — native streaming restored — FIXED

`platform/media/xhrUploadTransport.ts` no longer unconditionally does `fetch(fileUri) → blob →
xhr.send(blob)`:

- `import { Platform } from 'react-native'`; when `Platform.OS !== 'web'` the transport sends
  via `xhr.send({ uri: fileUri })` — native disk streaming, no JS-memory copy (the exact
  mechanism the original UploadManager transport used). `xhr.upload.onprogress` wiring is
  unchanged and fires identically for `send({ uri })` in React Native.
- Only on web is the file resolved via `fetch(fileUri, { signal }) → blob` before entering the
  promise executor, then sent as the blob body.
- Abort semantics unchanged on both paths (pre-aborted short-circuit + `once` listener with
  cleanup; AbortError rejection).

## Finding 2 (double read) — caller-provided Blob support — FIXED

- `XhrPutOptions` gains optional `blob?: Blob` (additive). When provided it is sent directly
  and file resolution is skipped entirely — it takes precedence over the native `send({ uri })`
  path.
- `services/mediaUpload.ts` now passes `preparedBlob` through to the transport
  (`blob: preparedBlob`), so callers that already hold the bytes (uploadMedia's MIME-probe
  blob, creator mediaUploadPipeline) no longer force a second read. The `void preparedBlob`
  compatibility shim from round 1 is removed — the param is genuinely used again.

## Finding 3 (caller-side memory) — queue size probe without a Blob on native — FIXED

`services/mediaUploadQueue.ts` `processItem` no longer loads the whole file into JS memory just
to obtain `sizeBytes` for presign:

- Native (`Platform.OS !== 'web'`): `FileSystem.getInfoAsync(uploadUri)` → `info.size`
  (import style matches UploadManager.ts: `import * as FileSystem from 'expo-file-system/legacy'`).
  Fallback chain per review: `getInfoAsync` failure/zero → `asset.fileSize` → web-style
  fetch→blob probe as last resort.
- Web: unchanged fetch→blob probe (`blob.size || asset.fileSize || 0`).
- The probe Blob (which now only exists on web or the native last-resort path) is passed to
  `uploadToPresignedUrl` as `preparedBlob`, so it is reused as the PUT body instead of
  re-reading. On the normal native path no Blob exists at any point: size comes from
  `getInfoAsync`, and the transport streams from `uploadUri` — the listing queue's native
  upload path is now zero-JS-memory-copy end to end.

Net effect: the listing-queue native path (any file size, including 60s videos) and the
creator single-PUT path (≤10 MB, or multipart disabled) both stream from disk with no JS-memory
blob copy, restoring the original transport's memory profile while keeping real byte progress,
abortable cancel, and the retry/jitter semantics from round 1.

## Fix-round verification (all re-run)

1. `npm run typecheck` → **PASS** (exit 0, zero errors repo-wide). Note: one intermediate run
   surfaced transient errors in `src/components/seller/*` — files owned by parallel campaign
   work, mid-edit at that moment; they were resolved by that work before the final run and are
   unrelated to this task. My five owned files have zero type errors in every run.
2. Scoped eslint `--max-warnings 0` on the five owned files → **PASS** (exit 0).
3. `npm test` (vitest) → **identical to baseline**: `Test Files 2 failed | 82 passed (84)`;
   the same 7 pre-existing failures (`groupChatInfoParity.test.tsx` ×6,
   `pricingDisplayModes.test.ts` ×1), zero new failures.
4. Public API surface unchanged from round 1 except the additive `XhrPutOptions.blob?`;
   no new dependencies; no files outside the five owned paths touched.

---

# Fix Round 2 — review findings (2 Critical + 7 Important)

## CRITICAL 1 — abort during retry backoff now surfaces as AbortError — FIXED

`services/mediaUpload.ts`: `sleep()`, `waitFor()` and the aborted-check inside
`waitForPublishableMedia()` now reject/throw `createAbortError()` (imported from the shared
transport) instead of `new Error('Upload cancelled')`. Cancellation is now uniformly
detectable by `err.name === 'AbortError'` across the whole upload pipeline — the PUT
transport, the backoff sleep, and the media-processing poll all speak the same contract.
(Structural note: the backoff `sleep` sits outside the retry `try`, so a backoff abort was
already not retried; the defect was the error type, which made cancellation indistinguishable
from failure for callers — e.g. the queue's `isAbortError` check and any consumer inspecting
`err.name`.)

## CRITICAL 2 — queue hydration race — FIXED

`services/mediaUploadQueue.ts`:

- Single `this.ready: Promise<void>` gate created in the constructor via
  `initialize()` = `Promise.all([restoreSnapshot(), watchConnectivity()])`. Both inner steps
  swallow their own failures, so `ready` never rejects.
- `start()` keeps its public `void` signature and sequences through
  `startWhenReady()`: `await this.ready` → running-guard → emit → `processQueue()`. The
  post-await running-guard makes concurrent `start()` calls idempotent.
- `run()` is now `async` (same `Promise<UploadQueueState>` signature) and awaits
  `this.ready` **before** creating `runPromise` — a `run()` that resolves before hydration
  could otherwise complete with zero items while restored pending items were still loading.
- `watchConnectivity()` takes a generation snapshot and re-checks
  `generation !== this.connectivityGeneration || this.unsubscribeNetInfo` after the dynamic
  import resolves — concurrent calls and a `reset()` during the in-flight import can no
  longer attach duplicate `NetInfo.addEventListener` subscriptions.
- `reset()` recreates `this.ready` as a fresh connectivity re-watch (restore is deliberately
  NOT re-run: the snapshot was just cleared, and re-restoring before the debounced empty
  write lands would resurrect stale items) and bumps the generation so an in-flight
  constructor-era import is discarded.
- `resumeAfterOffline()` is now gated on `this.ready` so a reconnect during the hydration
  window cannot kick the loop before restored items are merged.

## IMPORTANT 3 — UploadManager progress denominator — FIXED

`UploadManager.ts` single-PUT closure is now
`(loadedBytes, _totalBytes) => this.emitProgress(job.id, loadedBytes, job.sizeBytes)` —
restoring the original transport's behaviour of using the job's resolved file size as the
denominator, so RN `send({ uri })` reporting `event.total === 0` can no longer collapse
progress to 1 on the first tick. (The queue's `updateProgress` already guarded `totalBytes`
with an `asset.fileSize` fallback; the profile hook already guards `totalBytes > 0`.)

## IMPORTANT 4 — stale progress in idle/pending states — FIXED

`useProfileMediaUpload.ts`: `pickMedia`'s two `updateState` calls (legacy `'uploading'` path
and new `'pending'` path) and `revertMedia`'s `updateState` call now include
`progress: undefined`, so stale progress no longer leaks into idle/pending states.

## IMPORTANT 5 — reset() connectivity state — FIXED

`reset()` sets `this.internetReachable = null` (unknown → optimistic). Without this, a queue
reset while offline kept the stale `false` with no listener attached (reset unsubscribes), so
new work would block forever even after connectivity returned.

## IMPORTANT 6 — uploadMedia() no longer preloads a Blob on native — FIXED

`uploadMedia()` now resolves size via a shared `resolveUploadSize()` helper:

- Native: `FileSystem.getInfoAsync(fileUri)` → `info.size` (import style
  `expo-file-system/legacy`, matching UploadManager). MIME comes from the existing
  extension-inference chain. `preparedBlob` stays `undefined`, so `uploadToPresignedUrl` →
  `xhrPutFile` streams via `send({ uri })` — no JS-memory copy for profile/chat/KYC/review/
  evidence uploads.
- Web: Blob preload kept (web must send a Blob); `blob.type` still refines the
  extension-inferred MIME, preserving the original ph:///content:// behaviour.
- `MediaUploadAsset` inputs: `source.fileSize` is preferred (`knownSizeBytes > 0` short-
  circuits before any fetch); only when no size is known does native fall back to
  `getInfoAsync`, and only as a last resort to a Blob probe (which is then reused as the PUT
  body, never read twice).
- `opts.signal` now also aborts the size-probe fetch on the paths that read one.

## IMPORTANT 7 — terminal snapshot flush — FIXED

`persistSnapshot` split into `persistSnapshot()` (250 ms debounce — now only ever reached via
`emit()`, i.e. progress ticks and non-terminal transitions), `flushSnapshot()` (clears any
pending timer, writes immediately) and `writeSnapshot()`. `processItem` calls
`flushSnapshot()` on every terminal transition — uploaded, failed, and all three cancelled
paths — as does `cancelItem`'s immediate pending→cancelled transition and `reset()`'s
clear-to-empty write. A process kill can no longer lose uploaded/failed/cancelled metadata.

## IMPORTANT 8 — presign/finalize are abortable in the queue — FIXED

- `presignUpload()` gains an optional 5th param `signal?: AbortSignal` (additive; existing
  callers compile untouched) and forwards it to `fetchJson`.
- `mediaUploadQueue.processItem` passes its per-item `signal` to both `presignUpload` and
  `finalizeUpload` (which already accepted one). `cancelItem` during presign or finalize now
  aborts the in-flight request; the AbortError lands in the existing
  `_cancelRequested || isAbortError(err)` → `'cancelled'` path.

## IMPORTANT 9 — uploadMedia forwards opts.signal to presign/finalize — FIXED

`uploadMedia()` passes `opts?.signal` to `presignUpload(...)` and to
`finalizePresignedMedia({ ..., signal: opts?.signal })`, so cancellation covers the full
presign → PUT → finalize pipeline, not just the PUT.

## Fix-round verification (all re-run)

1. `npm run typecheck` → **PASS** (exit 0, zero errors). One intermediate run showed
   transient errors in `src/components/seller/SellerExecutiveHero.tsx` (parallel campaign
   work, mid-edit; resolved by that work before the final run — unrelated to this task) plus
   one real error of mine (`resolveUploadSize` initially placed between the `uploadMedia`
   overloads and their implementation → TS2389; moved above the overload block).
2. Scoped eslint `--max-warnings 0` on the five owned files → **PASS** (exit 0).
3. `npm test` (vitest) → **identical to baseline**: `Test Files 2 failed | 82 passed (84)`;
   the same 7 pre-existing failures (`groupChatInfoParity.test.tsx` ×6,
   `pricingDisplayModes.test.ts` ×1), zero new failures.
4. Public API deltas this round (all additive): `presignUpload(..., signal?)`,
   `XhrPutOptions.blob?` (round 1), `MediaUploadOptions` unchanged. `start(): void` and
   `run(): Promise<UploadQueueState>` signatures preserved. No new dependencies; no files
   outside the five owned paths touched.

---

# Fix Round 3 — remaining findings

## ITEM 1 — no Blob preload on native, ever — FIXED

`services/mediaUpload.ts` `resolveUploadSize()`: the native last-resort
`fetch(fileUri) → blob` branch is removed. On native, when `getInfoAsync` fails/returns no
usable size AND `knownSizeBytes` (e.g. `source.fileSize`) is unavailable, it now **throws**
`Error('Could not determine file size. The file may be inaccessible.')` — the same message
and philosophy as `UploadManager.resolveFileSize`. A clean failure through the caller's
retry/error path beats uploading unknown-size garbage. The Blob path is now web-only, so
`uploadMedia` can no longer produce a `preparedBlob` on any native path — the transport
always streams via `send({ uri })` on native. (The queue's own size probe keeps its
round-1-prescribed `asset.fileSize` → blob last-resort chain, where the Blob is reused as
the PUT body — that was explicitly prescribed by the round-1 review and is not part of this
item.)

## ITEM 2 — new save-flow pick invalidates in-flight uploads — FIXED

`useProfileMediaUpload.ts` `pickMedia`: the op ID is now bumped for BOTH branches, at a
single atomic invalidation point right after validation passes:

```
const opIdRef = type === 'avatar' ? avatarOpIdRef : coverOpIdRef;
opIdRef.current++;
abortInFlight(type);
```

The legacy branch still takes a fresh `opId` for its new `performUpload`; the new save-flow
branch relies on the shared bump. A prior in-flight `performUpload` can no longer clobber a
newly picked asset — its stale-guard (`opId !== opIdRef.current`) fires before any state
write. Bump-before-abort ordering guarantees the aborted upload's `AbortError` always lands
on the stale guard, so no transient `'failed'` state can flicker from the cancellation.

## ITEM 3 — profile uploads are actually abortable — FIXED

`useProfileMediaUpload.ts`:

- `abortControllersRef` (`{ avatar?: AbortController; cover?: AbortController }`) sits
  alongside the op-ID refs, plus a small `abortInFlight(type)` helper.
- `performUpload` aborts any previous controller for the type (every caller bumps the op ID
  first, so the previous invocation is by definition stale), creates a fresh
  `AbortController`, stores it on the ref, and passes `signal: controller.signal` into
  `uploadMedia` — which threads it through presign → PUT → finalize (round 2 wiring).
- Both stale-guard return paths (post-upload and catch) abort the controller as prescribed;
  a `finally` deletes the ref entry only when it still belongs to this invocation, so a
  superseding upload's controller is never clobbered.
- Supersede points abort explicitly: `pickMedia` (both flows, via the shared invalidation
  point) and `revertMedia` (next to its existing op-ID bump). `retryMedia` and `commitMedia`
  are covered automatically by `performUpload`'s supersede-abort. Because every abort is
  paired with an op-ID bump, an aborted upload always exits via the stale guard — no failed
  state, no error surfaced for an intentional cancel.

## Fix-round verification (all re-run)

1. `npm run typecheck` → **PASS** (exit 0, zero errors).
2. Scoped eslint `--max-warnings 0` on the five owned files → **PASS** (exit 0).
3. `npm test` (vitest) → **identical to baseline**: the same 7 pre-existing failures
   (`groupChatInfoParity.test.tsx` ×6, `pricingDisplayModes.test.ts` ×1), zero new failures.
4. No public API changes this round (all edits are internal to `resolveUploadSize` and the
   hook's internals); no new dependencies; no files outside the five owned paths touched.

---

# Fix Round 4 — adversarial campaign review (1 P0 + 3 P1 + 5 minor)

## P0-1 — per-instance snapshot isolation — FIXED

`services/mediaUploadQueue.ts`: the single global `STORAGE_KEY` is gone. The constructor now
accepts `MediaUploadQueueConfig { storageKey?: string }`; when omitted it generates
`thryftverse.mediaUploadQueue.v1.<n>` from a module-level counter, so parallel queue
instances (SellScreen / EditListingScreen / AIPoweredListingScreen) can no longer clobber
each other's snapshots or restore each other's items. Existing `new MediaUploadQueue()` call
sites are untouched and gain isolation automatically; `storageKey` is honored verbatim when
provided for intentional sharing. Restore/persist logic otherwise unchanged.

## P1-3 — PUT timeout — FIXED

`xhrUploadTransport.ts`: `xhr.timeout = opts?.timeoutMs ?? 120_000` is set before
`open()`/`send()`, configurable via the new additive `XhrPutOptions.timeoutMs`. The existing
`ontimeout → 'Upload timed out'` handler (retryable, non-abort) now actually fires instead
of a hung PUT blocking a queue slot forever.

## P1-4 — guarded performance.mark — FIXED

`mediaUpload.ts` (`upload:start`, `upload:complete`) and
`hooks/sell/useListingPublishPipeline.ts` (`listing:create:start`, `listing:create:complete`)
now mark through a local `safeMark` helper — the exact CheckoutScreen.tsx:90-94 precedent:
`if (typeof performance !== 'undefined' && typeof performance.mark === 'function')`.

## P1-8 — cancelled items have an explicit restore path — FIXED

`retryItem` restores a `cancelled` item to `pending` with `attemptCount = 0` (fresh attempt
budget for explicit user intent), clearing error/progress/`_cancelRequested`. `addAssets`
still skips cancelled items (re-adding remains ambiguous, per the finding).

## P1-9 — addAssets awaits hydration — FIXED

`addAssets` is now `async`, awaits `this.ready`, then mutates + emits + starts. Return type
is `Promise<UploadQueueItem[]>`. All four call sites verified fire-and-forget
(`queue.addAssets(...)` followed by `await queue.run()` in EditListingScreen,
AIPoweredListingScreen and listingPublication; useSellScreenData has no addAssets call) —
no call-site changes needed, EditListingScreen untouched. Ordering is safe: `addAssets`'
`ready` continuation registers before `run()`'s, so mutations land before the queue starts.

## MINOR-10 — removeItem aborts in-flight work — FIXED

`removeItem` aborts the item's controller before splicing. Verified the settle path no-ops
safely on a removed item: the AbortError lands in `processItem`'s cancelled branch, the
detached item's state mutation is invisible (emit reads `this.items`), the snapshot is
written without it, and the `finally` cleans up the controller/progress maps.

## MINOR-11 — restore gives back the interrupted attempt — FIXED

`reviveSnapshotEntry` decrements `attemptCount` by 1 (floor 0) when resetting persisted
`preparing`/`uploading` entries to `pending`, so a process kill doesn't burn a retry.

## MINOR-14 — 3 total PUT attempts — FIXED

`uploadToPresignedUrl` loop is now `attempt < UPLOAD_MAX_RETRIES` (3 attempts total; the
loop-end `throw lastError` is live and surfaces the final error). The queue's `MAX_RETRIES =
3` with `attemptCount < MAX_RETRIES` gating already meant 3 attempts total — verified
consistent, no queue change needed.

## MINOR-17 — stale path discards without aborting — FIXED

`performUpload`'s two stale-guard return paths no longer call `controller.abort()` (the
request has already finished; the result is simply discarded). Aborts happen only via the
supersede paths before completion: `pickMedia`'s invalidation point, `revertMedia`, and
`performUpload`'s leading supersede-abort.

## Lint debt fixed in the newly-scoped file

`useListingPublishPipeline.ts` carried two pre-existing warnings that surfaced under the
scoped `--max-warnings 0` gate once it entered my scope this round: `navigation: any` now
carries the same inline eslint-disable used by its sibling `useSellScreenData.ts:40-41`
(repo precedent for untyped navigation), and the eslint-verified-unnecessary `photos` dep
was removed from `handlePublish`'s deps and destructuring (params interface unchanged —
callers unaffected).

## Fix-round verification (all re-run)

1. `npm run typecheck` → **PASS** (exit 0, zero errors).
2. Scoped eslint `--max-warnings 0` on the six touched/owned files → **PASS** (exit 0).
3. `npm test` (vitest) → **identical to baseline**: `Test Files 2 failed | 82 passed (84)`;
   the same 7 pre-existing failures (`groupChatInfoParity.test.tsx` ×6,
   `pricingDisplayModes.test.ts` ×1), zero new failures.
4. API deltas (all additive): `MediaUploadQueueConfig` + optional constructor param,
   `XhrPutOptions.timeoutMs?`, `addAssets` returns `Promise<UploadQueueItem[]>` (verified
   compile-safe at every call site), `retryItem` gains cancelled-restore semantics. No new
   dependencies; EditListingScreen.tsx / ListingMediaStudio.tsx / CreatorCropSheet.tsx not
   touched.

---

# Fix Round 5 — final-review blockers

## BLOCKER A — terminal snapshots are awaited writes — FIXED

`mediaUploadQueue.ts` persistence chain reworked so terminal states are genuinely durable:

- `writeSnapshot()` now **returns** the `AsyncStorage.setItem` promise (with its
  storage-failure `.catch` attached, so it never rejects).
- `flushSnapshot()` is `async` and awaits `writeSnapshot()` (after clearing any pending
  debounce timer).
- Every terminal-transition call site awaits it: `processItem`'s uploaded/failed tail and all
  three cancelled early-returns (`await this.flushSnapshot()`), `cancelItem`'s
  pending→cancelled path (now `async cancelItem(itemId): Promise<boolean>` — verified it has
  zero external callers, so the return-type change is compile-safe), and `reset()` (now
  `async reset(): Promise<void>`, awaiting its clear-to-empty flush — verified all
  `MediaUploadQueue.reset()` call sites are fire-and-forget, including EditListingScreen's
  unmount cleanup, so no call-site edits were needed).
- The debounced progress path (`persistSnapshot`'s timer → `void this.writeSnapshot()`)
  remains the only fire-and-forget write, per the finding.
- The per-instance `storageKey` scheme is unchanged.

## BLOCKER B — progress no longer gated on lengthComputable — FIXED

`xhrUploadTransport.ts`: the `event.lengthComputable` guard is removed — `onProgress` now
fires for every progress event, since some RN XHR implementations report
`lengthComputable=false` for `send({ uri })` file streams. Consumer fallbacks verified and
hardened:

- **UploadManager**: already immune — its closure ignores `event.total` and passes
  `job.sizeBytes` (round 3 fix), so a zero total cannot reach `emitProgress`.
- **Queue**: found a real gap — `updateProgress` fell back to `item.asset.fileSize`, which is
  often `undefined` for picked assets on native (the real size lives in the presign-resolved
  `sizeBytes`). Fixed: the `onProgress` closure now passes `totalBytes || sizeBytes`, so a
  zero event total falls back to the size actually resolved for presign; `updateProgress`'s
  `asset.fileSize` fallback remains as the final layer. Progress can no longer freeze at 0%.
- **Profile hook**: handles `total === 0` by design (progress holds at 0 — honest, no wrong
  value); no change needed.

## MEDIUM — typed navigation — FIXED

`useListingPublishPipeline.ts`: `navigation: any` (and its eslint-disable) is replaced with
`NativeStackNavigationProp<RootStackParamList>` — the repo's established typed pattern
(78 usages; sibling hook `useSellerAnalytics.ts` uses exactly this import pair). Verified
before switching: all three `navigation.replace` targets exist in `RootStackParamList`
(`CreateCoOwn` — whose prefill type is literally
`NonNullable<RootStackParamList['CreateCoOwn']>`; `ListingSuccess`; `CreateAuction`) and the
passed params match their declared shapes. The sole caller chain passes `any`-typed
navigation, so no call-site friction. The eslint-disable is gone.

## Fix-round verification (all re-run)

1. `npm run typecheck` → **PASS** (exit 0, zero errors). One intermediate run showed a
   transient error in `SellerHubScreen.tsx` — parallel campaign work, mid-edit, resolved by
   that work before the final run; unrelated to this task.
2. Scoped eslint `--max-warnings 0` on the six owned/touched files → **PASS** (exit 0).
3. `npm test` → **7 baseline failures + 1 parallel-work failure**: the baseline 7
   (`groupChatInfoParity.test.tsx` ×6, `pricingDisplayModes.test.ts` ×1) are unchanged; the
   extra failure is `sellerAnalyticsAndHubUpgrade.test.ts` asserting
   `SellerHubScreen.tsx` stays under 400 lines (`expected 419 to be less than 400`) — a file
   owned by concurrent campaign work that was mid-edit during this run (it also broke
   typecheck transiently minutes earlier). None of my three touched files appear in any
   failure; my diff footprint this round is exactly `mediaUploadQueue.ts`,
   `xhrUploadTransport.ts`, `useListingPublishPipeline.ts`.
4. API deltas (all additive/compile-safe): `cancelItem` → `Promise<boolean>` (zero external
   callers), `reset` → `Promise<void>` (all callers fire-and-forget). No new dependencies;
   ListingMediaStudio / SortablePhotoStrip / screens / useSellScreenActions untouched.




