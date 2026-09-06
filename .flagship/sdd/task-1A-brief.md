# Task 1A Brief — Durable upload transport for listings + profile

Repo: C:\Users\User\Desktop\thryftverse-upgrade (branch feat/product-detail-contract-media-device-closure)
Stack: React Native + Expo (expo ~57), TypeScript strict, vitest, eslint.

## Mission

Give the listing upload flow and profile upload REAL byte-level progress, abortable
cancellation, offline pause/resume, and durable queue metadata — by extracting the
already-proven XHR transport from the creator upload system into a shared platform
module and migrating the legacy consumers onto it. Do NOT migrate listings onto the
creator UploadManager class itself (publication-contract coupling is out of scope).

## Context you need (read these first)

- frontend/src/creator/core/upload/UploadManager.ts lines ~743-805 — the proven
  `xhrPutFile` implementation (XMLHttpRequest PUT + upload.onprogress + AbortController).
  This is the source of truth for the transport logic.
- frontend/src/services/mediaUpload.ts — legacy transport. `uploadToPresignedUrl`
  (lines ~133-176) uses `fetch(url, { method:'PUT', body: blob })` → no progress, no
  abort. Retry loop lines ~98-101, ~142-176: exponential backoff 1s→30s, NO jitter.
  Also `presignUpload`, `finalizeUpload` — do not change their contracts.
- frontend/src/services/mediaUploadQueue.ts (432 lines) — the listing queue. Public API
  consumed by useSellScreenData.ts, useListingPublishPipeline.ts, listingPublication.ts,
  SellScreen.tsx, EditListingScreen.tsx, AIPoweredListingScreen.tsx via:
  addAssets, retryFailed, retryItem, cancelItem, removeItem, reorder, getState,
  getItems, getUploadedUrls, hasPendingOrUploading, hasFailed, allCompleted, reset,
  subscribe, run, getResultMap. KEEP ALL OF THESE SIGNATURES COMPATIBLE.
- frontend/src/hooks/useProfileMediaUpload.ts — `performUpload` calls
  `uploadMedia(entry.localUri, folder)` (line ~142). uploadMedia is in mediaUpload.ts.
- frontend/src/creator/core/upload/UploadManager.ts — after extracting, make its
  single-PUT path delegate to the shared transport (delete its private duplicate).

## Implementation

### 1. NEW frontend/src/platform/media/xhrUploadTransport.ts

Extract UploadManager's xhrPutFile into a shared, dependency-light module:

```ts
export interface XhrPutOptions {
  signal?: AbortSignal;
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
  headers?: Record<string, string>;
}
export async function xhrPutFile(url: string, fileUri: string, mimeType: string, opts?: XhrPutOptions): Promise<void>
```

- Resolve the file: existing code does `fetch(fileUri).then(r => r.blob())` — keep that
  pattern (works for file:// and content:// on this stack).
- XMLHttpRequest PUT with `xhr.upload.onprogress` → opts.onProgress(e.loaded, e.total).
- `opts.signal` → abort the XHR (addEventListener('abort', () => xhr.abort()) and clean
  up the listener). On abort, reject with a DOMException named 'AbortError' (match what
  fetch throws so callers can distinguish cancellation from failure).
- Non-2xx response → throw an Error with status text.
- Port the logic EXACTLY from UploadManager.ts:743-805 (headers, content type, etc.).
  No new behavior, no extra abstraction.

### 2. frontend/src/services/mediaUpload.ts

- `uploadToPresignedUrl(url, fileUri, mimeType, blob?, opts?: { signal?, onProgress? })`:
  replace the fetch PUT with `xhrPutFile`. Keep the existing retry loop (3 attempts,
  5xx/network errors only) but ADD jitter: delay = min(30_000, 1000 * 2^attempt) with
  ±25% jitter (same formula as UploadManager.ts:954-963). Never retry on AbortError —
  rethrow immediately. Thread opts through retries.
- `uploadMedia(...)` (the direct-call API used by profile/chat/etc.): add an optional
  opts param `{ signal?, onProgress? }` that reaches uploadToPresignedUrl. Keep
  backward compatibility (all existing call sites must keep compiling untouched).

### 3. frontend/src/services/mediaUploadQueue.ts — durable behaviors, same API

a) Add `progress: number` (0-1, real bytes) to `UploadQueueItem`. Initialize 0; set
   during 'uploading' from onProgress (loaded/total); set to 1 on uploaded; reset to 0
   on retry. Additive field — consumers that don't know about it are unaffected.
b) Abortable cancel: keep an `AbortController` per in-flight item (private WeakMap or
   field on item prefixed `_`). `cancelItem` calls `controller.abort()` for in-flight
   items; processItem catches AbortError → state 'cancelled' (existing semantics).
c) Real progress → emit: onProgress updates item.progress and emits (throttle emits to
   ~10/s per item to avoid render storms; final state changes always emit immediately).
d) NetInfo awareness: subscribe once per queue instance using
   '@react-native-community/netinfo' (already a dependency, v12). When
   `isInternetReachable === false` → stop starting new items (in-flight may fail
   naturally; mark them failed as today). When it returns → `retryFailed()` semantics:
   reset failed-and-retryable items to pending and `start()`. Clean up the subscription
   in `reset()`. Guard the import so web/test environments without the module don't
   crash (dynamic import with try/catch, or optional require — match how the repo
   already imports NetInfo elsewhere; check apiClient.ts for the established pattern).
e) Durable metadata: after each emit, persist a minimal snapshot (id, asset, order,
   state, attemptCount, publicUrl, finalizationId, error, retryable) to AsyncStorage
   under a namespaced key (e.g. 'thryftverse.mediaUploadQueue.v1'). On construction,
   load the snapshot and restore items whose state was pending/preparing/uploading as
   'pending' (their local files still exist; re-upload is safe and idempotent at the
   object level because presign creates a fresh key). Uploaded/failed/cancelled restore
   as-is. Keep it simple — this is metadata durability, not byte-level resume.
   Check how the repo imports AsyncStorage (look at creator/core/upload/UploadJobStore.ts)
   and follow the same pattern.
f) Replace the 100ms-polling `waitForSlot` with a small event-driven resolver (resolve
   promises when activeCount drops) — keep behavior identical otherwise.

### 4. frontend/src/creator/core/upload/UploadManager.ts

- Make the single-PUT path (performSinglePutUpload / its private xhrPutFile) delegate
  to the shared `xhrPutFile`. Delete the duplicated private implementation. Behavior
  must be identical — this is a refactor, not a rewrite. If any subtle behavior can't
  be preserved safely, leave UploadManager untouched and note it in your report
  (do not risk the creator flow).

### 5. frontend/src/hooks/useProfileMediaUpload.ts

- Thread real progress: pass `onProgress` into `uploadMedia` and surface it in the
  existing state machine (there is an `uploading` status — add `progress?: number` to
  that state shape if the type allows; keep it additive). If ProfileMediaEditor renders
  a spinner only, do NOT change its UI in this task (UI is Wave 3's job) — just expose
  the progress value in the hook's state.

## Constraints

- TypeScript strict; no `any`; no new dependencies (NetInfo + AsyncStorage already installed).
- Do NOT touch ListingMediaStudio.tsx, SortablePhotoStrip.tsx, CreatorCropSheet.tsx,
  InCanvasCropOverlay.tsx (owned by the next task).
- Do NOT change the UploadQueueItem consumers' compile-time contract (additive only).
- Follow repo code style: 2-space indent, trailing commas, single quotes, no comments
  unless they carry non-obvious context (match existing file comment style).
- Anti-AI policy: no verbose JSDoc restating the obvious; no defensive try/catch per line.

## Verification (run all, report output)

1. `cd frontend && npm run typecheck` — must pass.
2. `npm run lint -- --max-warnings 0 src/platform/media/xhrUploadTransport.ts src/services/mediaUpload.ts src/services/mediaUploadQueue.ts src/hooks/useProfileMediaUpload.ts src/creator/core/upload/UploadManager.ts` (or repo-equivalent scoping) — must pass.
3. `npm test` (vitest) — must pass or be no worse than baseline (run baseline first if unsure).
4. Grep to confirm: no remaining `fetch(presignedUrl` style PUT in mediaUpload.ts; UploadManager has no duplicate xhrPutFile left.

## Report

Write your full report to .flagship/sdd/task-1A-report.md and return ONLY:
status (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED), commit hash(es),
one-line test summary, concerns if any.
