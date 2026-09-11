import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { MediaUploadAsset } from '../utils/mediaUploadAsset';
import { finalizeUpload, presignUpload, uploadToPresignedUrl, type PresignResponse } from './mediaUpload';
import {
  MULTIPART_THRESHOLD_BYTES,
  uploadMultipart,
} from './mediaUploadMultipart';
import { resizeForUpload } from '../platform/media/mediaTransforms';
import { isAbortError } from '../platform/media/xhrUploadTransport';

export type UploadQueueItemState =
  | 'pending'
  | 'preparing'
  | 'uploading'
  | 'uploaded'
  | 'failed'
  | 'cancelled';

export interface UploadQueueItem {
  id: string;
  asset: MediaUploadAsset;
  order: number;
  state: UploadQueueItemState;
  /** Real byte progress (0-1) for the current upload attempt. */
  progress: number;
  attemptCount: number;
  publicUrl: string | null;
  finalizationId: string | null;
  error: string | null;
  retryable: boolean;
  /** Internal flag: cancellation requested while in-flight. */
  _cancelRequested?: boolean;
  /** Internal flag: bytes already on the origin, only finalize remains on retry. */
  _needsFinalizationOnly?: boolean;
  /** Internal: cached presign for finalization-only retry. */
  _presign?: PresignResponse;
}

export interface UploadQueueState {
  items: UploadQueueItem[];
  inProgress: boolean;
  completedCount: number;
  failedCount: number;
  totalCount: number;
}

export interface UploadQueueResult {
  state: UploadQueueItemState;
  publicUrl: string | null;
  finalizationId: string | null;
  error: string | null;
}

export type UploadQueueListener = (state: UploadQueueState) => void;

const MAX_CONCURRENCY = 2;
const MAX_RETRIES = 3;
const STORAGE_KEY_PREFIX = 'thryftverse.mediaUploadQueue.v1';
/** Per-instance snapshot isolation — parallel queues must not clobber each other. */
let queueInstanceCounter = 0;
/** Progress emits are throttled to ~10/s per item to avoid render storms. */
const PROGRESS_EMIT_INTERVAL_MS = 100;
/** Snapshot writes are debounced so byte-tick emits never storm AsyncStorage. */
const PERSIST_DEBOUNCE_MS = 250;

export interface MediaUploadQueueConfig {
  /** Durable snapshot key. Omit for an isolated per-instance key. */
  storageKey?: string;
}

/** Minimal durable metadata — never the media payload or byte offsets. */
type UploadQueueSnapshot = Pick<
  UploadQueueItem,
  'id' | 'asset' | 'order' | 'state' | 'attemptCount' | 'publicUrl' | 'finalizationId' | 'error' | 'retryable'
>;

const ITEM_STATES: readonly UploadQueueItemState[] = [
  'pending',
  'preparing',
  'uploading',
  'uploaded',
  'failed',
  'cancelled',
];

/** Extract an HTTP status from an upload/API error, or undefined for a
 *  network-level failure that never reached the server. */
function getErrorStatus(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null) {
    const status = (err as { status?: number }).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

/** Classify whether an upload error is worth retrying. 4xx client errors
 *  (except 408/429) are deterministic and must not burn the retry budget. */
function isRetryableUploadError(err: unknown): boolean {
  const status = getErrorStatus(err);
  if (status === undefined) return true; // network/transport error
  if (status === 0 || status === 408 || status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

function reviveSnapshotEntry(entry: unknown): UploadQueueItem | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const raw = entry as Record<string, unknown>;
  const asset = raw.asset as MediaUploadAsset | null;
  if (
    typeof raw.id !== 'string' ||
    !asset ||
    typeof asset.uri !== 'string' ||
    typeof asset.fileName !== 'string' ||
    typeof asset.mimeType !== 'string' ||
    (asset.kind !== 'image' && asset.kind !== 'video')
  ) {
    return null;
  }
  const state = raw.state as UploadQueueItemState;
  if (!ITEM_STATES.includes(state)) return null;
  // A process kill cannot leave the JS XHR attached — transient work re-enters
  // as pending (re-upload is safe; presign creates a fresh object key). The
  // interrupted attempt already consumed its retry budget, so give it back.
  const wasInFlight = state === 'preparing' || state === 'uploading';
  const restoredState = wasInFlight ? 'pending' : state;
  const rawAttemptCount = typeof raw.attemptCount === 'number' ? raw.attemptCount : 0;
  return {
    id: raw.id,
    asset,
    order: typeof raw.order === 'number' ? raw.order : 0,
    state: restoredState,
    progress: restoredState === 'uploaded' ? 1 : 0,
    attemptCount: wasInFlight ? Math.max(0, rawAttemptCount - 1) : rawAttemptCount,
    publicUrl: typeof raw.publicUrl === 'string' ? raw.publicUrl : null,
    finalizationId: typeof raw.finalizationId === 'string' ? raw.finalizationId : null,
    error: typeof raw.error === 'string' ? raw.error : null,
    retryable: raw.retryable === true,
  };
}

export class MediaUploadQueue {
  private items: UploadQueueItem[] = [];
  private listeners: UploadQueueListener[] = [];
  private running = false;
  private activeCount = 0;
  private completionResolver: ((state: UploadQueueState) => void) | null = null;
  private runPromise: Promise<UploadQueueState> | null = null;
  private abortControllers = new Map<string, AbortController>();
  private lastProgressEmitMs = new Map<string, number>();
  /** Resolves when an in-flight item reaches a terminal state after cancelItem. */
  private cancelResolvers = new Map<string, () => void>();
  private slotResolvers: Array<() => void> = [];
  /** null = unknown (treat as reachable); only `false` gates the queue. */
  private internetReachable: boolean | null = null;
  private unsubscribeNetInfo: (() => void) | null = null;
  /** Bumped on every teardown so in-flight NetInfo setup is discarded. */
  private connectivityGeneration = 0;
  /** Hydration gate: snapshot restored + connectivity attached. start()/run()
   *  await it so work never begins against an un-hydrated queue. */
  private ready: Promise<void>;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private storageKey: string;

  constructor(config?: MediaUploadQueueConfig) {
    this.storageKey = config?.storageKey ?? `${STORAGE_KEY_PREFIX}.${++queueInstanceCounter}`;
    this.ready = this.initialize();
  }

  /* ── public API ── */

  async addAssets(assets: MediaUploadAsset[]): Promise<UploadQueueItem[]> {
    await this.ready;
    const added: UploadQueueItem[] = [];
    for (const asset of assets) {
      const existing = this.items.find((i) => i.id === asset.id);
      if (existing) {
        if (existing.state === 'uploaded') {
          // already uploaded: do not re-add
          continue;
        }
        if (existing.state === 'pending' || existing.state === 'uploading' || existing.state === 'preparing') {
          // already in progress: do not duplicate
          continue;
        }
        if (existing.state === 'failed') {
          // retryable: reset existing item to pending
          if (existing.retryable && existing.attemptCount < MAX_RETRIES) {
            existing.state = 'pending';
            existing.error = null;
          }
          continue;
        }
        if (existing.state === 'cancelled') {
          // cancelled items require explicit restore; do not re-add
          continue;
        }
        if (existing.asset.uri !== asset.uri) {
          // conflicting same ID with different URI: reject
          throw new Error(`Conflicting asset ID ${asset.id}: existing URI ${existing.asset.uri} vs new URI ${asset.uri}`);
        }
        continue;
      }
      const item: UploadQueueItem = {
        id: asset.id,
        asset,
        order: this.items.length,
        state: 'pending',
        progress: 0,
        attemptCount: 0,
        publicUrl: null,
        finalizationId: null,
        error: null,
        retryable: true,
      };
      this.items.push(item);
      added.push(item);
    }
    this.renumber();
    this.emit();
    return added;
  }

  retryFailed(): void {
    for (const item of this.items) {
      if (item.state === 'failed' && item.retryable && item.attemptCount < MAX_RETRIES) {
        item.state = 'pending';
        item.error = null;
        item.progress = 0;
      }
    }
    this.emit();
    this.start();
  }

  retryItem(itemId: string): boolean {
    const item = this.items.find((i) => i.id === itemId);
    if (!item) return false;
    if (item.state === 'uploaded') return false;
    // Cancelled is terminal for addAssets (re-adding is ambiguous), but an
    // explicit user retry restores it with a fresh attempt budget.
    if (item.state === 'cancelled') {
      item.state = 'pending';
      item.attemptCount = 0;
      item.error = null;
      item.progress = 0;
      item.retryable = true;
      delete item._cancelRequested;
      this.emit();
      this.start();
      return true;
    }
    if (item.attemptCount >= MAX_RETRIES) return false;
    item.state = 'pending';
    item.error = null;
    item.progress = 0;
    item.retryable = true;
    this.emit();
    this.start();
    return true;
  }

  /**
   * Cancel a pending item immediately.
   * For in-flight items, mark as 'finishing' (processItem will transition to cancelled
   * after the network request completes, without mutating uploaded state).
   */
  async cancelItem(itemId: string): Promise<boolean> {
    const item = this.items.find((i) => i.id === itemId);
    if (!item) return false;
    if (item.state === 'uploaded') return false;
    if (item.state === 'pending') {
      item.state = 'cancelled';
      item.error = null;
      item.retryable = false;
      this.emit();
      await this.flushSnapshot();
      return true;
    }
    // In-flight (preparing/uploading): request cancellation and abort the
    // transport so the in-flight XHR rejects immediately.
    const wasInFlight = item.state === 'preparing' || item.state === 'uploading';
    item._cancelRequested = true;
    this.abortControllers.get(item.id)?.abort();
    this.emit();
    // Wait for the worker to reach a terminal state so callers observe the
    // final `cancelled` (or `uploaded`/`failed`) state synchronously.
    if (wasInFlight) {
      await new Promise<void>((resolve) => {
        this.cancelResolvers.set(item.id, resolve);
      });
    }
    return true;
  }

  removeItem(itemId: string): boolean {
    const idx = this.items.findIndex((i) => i.id === itemId);
    if (idx === -1) return false;
    // Kill any in-flight work; the settle path no-ops safely on a removed item.
    this.abortControllers.get(itemId)?.abort();
    this.items.splice(idx, 1);
    this.renumber();
    this.emit();
    return true;
  }

  reorder(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || fromIndex >= this.items.length) return;
    if (toIndex < 0 || toIndex >= this.items.length) return;
    const [moved] = this.items.splice(fromIndex, 1);
    this.items.splice(toIndex, 0, moved);
    this.renumber();
    this.emit();
  }

  getState(): UploadQueueState {
    return {
      items: this.items,
      inProgress: this.running,
      completedCount: this.items.filter((i) => i.state === 'uploaded').length,
      failedCount: this.items.filter((i) => i.state === 'failed').length,
      totalCount: this.items.length,
    };
  }

  getItems(): UploadQueueItem[] {
    return this.items;
  }

  getUploadedUrls(): string[] {
    return this.items
      .filter((i) => i.state === 'uploaded' && i.publicUrl)
      .sort((a, b) => a.order - b.order)
      .map((i) => i.publicUrl!);
  }

  hasPendingOrUploading(): boolean {
    return this.items.some((i) => i.state === 'pending' || i.state === 'uploading' || i.state === 'preparing');
  }

  hasFailed(): boolean {
    return this.items.some((i) => i.state === 'failed');
  }

  allCompleted(): boolean {
    return this.items.length > 0 && this.items.every((i) => i.state === 'uploaded');
  }

  async reset(): Promise<void> {
    this.connectivityGeneration++;
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    for (const resolve of this.slotResolvers) resolve();
    this.slotResolvers = [];
    // Abort all in-flight controllers so background uploads don't continue
    // after the queue is reset (e.g. on screen unmount).
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();
    this.lastProgressEmitMs.clear();
    for (const resolve of this.cancelResolvers.values()) resolve();
    this.cancelResolvers.clear();
    this.items = [];
    this.running = false;
    this.activeCount = 0;
    this.completionResolver = null;
    this.runPromise = null;
    // Unknown until the next NetInfo event — a stale `false` would block a
    // reset queue with no listener attached to observe the recovery.
    this.internetReachable = null;
    // Re-arm the hydration gate (connectivity re-watch only — the snapshot
    // was just cleared, re-restoring it would resurrect stale items).
    this.ready = this.watchConnectivity();
    this.emit();
    await this.flushSnapshot();
  }

  /**
   * Stop the queue without clearing items. Aborts all in-flight uploads,
   * resolves pending cancellation promises, and tears down connectivity
   * listeners. The persisted AsyncStorage snapshot is preserved so a new
   * queue instance can restore and resume on the next screen mount.
   *
   * Use this on screen unmount to prevent orphaned workers from uploading
   * in the background after the UI that owns them is gone.
   */
  destroy(): void {
    this.connectivityGeneration++;
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    // Abort all in-flight controllers — the fetch/XmlHttpRequest will throw
    // an AbortError, which processItem's catch block handles as cancellation.
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();
    this.lastProgressEmitMs.clear();
    for (const resolve of this.cancelResolvers.values()) resolve();
    this.cancelResolvers.clear();
    for (const resolve of this.slotResolvers) resolve();
    this.slotResolvers = [];
    this.running = false;
    this.activeCount = 0;
    this.completionResolver = null;
    this.runPromise = null;
  }

  subscribe(listener: UploadQueueListener): () => void {
    this.listeners.push(listener);
    listener(this.getState());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** Start processing and return a promise that resolves exactly once when the queue finishes. */
  async run(): Promise<UploadQueueState> {
    await this.ready;
    if (this.runPromise) {
      return this.runPromise;
    }
    this.runPromise = new Promise((resolve) => {
      this.completionResolver = resolve;
      this.start();
    });
    return this.runPromise;
  }

  /** Return a deterministic result map keyed by stable asset ID. */
  getResultMap(): Map<string, UploadQueueResult> {
    const map = new Map<string, UploadQueueResult>();
    for (const item of this.items) {
      map.set(item.id, {
        state: item.state,
        publicUrl: item.publicUrl,
        finalizationId: item.finalizationId,
        error: item.error,
      });
    }
    return map;
  }

  start(): void {
    void this.startWhenReady();
  }

  private async startWhenReady(): Promise<void> {
    await this.ready;
    if (this.running) return;
    this.running = true;
    this.emit();
    this.processQueue();
  }

  /* ── internal ── */

  private renumber(): void {
    this.items.forEach((item, i) => {
      item.order = i;
    });
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {
        // swallow listener errors
      }
    }
    this.persistSnapshot();
  }

  /** Restore durable metadata and attach connectivity awareness. */
  private async initialize(): Promise<void> {
    await Promise.all([this.restoreSnapshot(), this.watchConnectivity()]);
  }

  /** Subscribe once per queue instance; `false` pauses, recovery resumes. */
  private async watchConnectivity(): Promise<void> {
    if (this.unsubscribeNetInfo) return;
    const generation = this.connectivityGeneration;
    try {
      const NetInfo = (await import('@react-native-community/netinfo')).default;
      // A reset() during the in-flight import must not attach a stale
      // subscription alongside the one the new gate is setting up.
      if (generation !== this.connectivityGeneration || this.unsubscribeNetInfo) return;
      this.unsubscribeNetInfo = NetInfo.addEventListener((state) => {
        if (state.isInternetReachable === false) {
          this.internetReachable = false;
          return;
        }
        if (state.isInternetReachable === true && this.internetReachable === false) {
          this.internetReachable = true;
          this.resumeAfterOffline();
        }
      });
    } catch {
      // NetInfo is unavailable on web/test runtimes — the queue runs un-gated.
    }
  }

  /**
   * retryFailed() semantics on connectivity recovery. start() alone is not
   * enough — a queue paused mid-run is still `running`, so the loop is
   * kicked directly. Gated on hydration so restored items are visible.
   */
  private resumeAfterOffline(): void {
    void this.ready.then(() => {
      for (const item of this.items) {
        if (item.state === 'failed' && item.retryable && item.attemptCount < MAX_RETRIES) {
          item.state = 'pending';
          item.error = null;
          item.progress = 0;
        }
      }
      this.emit();
      this.start();
      void this.processQueue();
    });
  }

  private async restoreSnapshot(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(this.storageKey);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      for (const entry of parsed) {
        const item = reviveSnapshotEntry(entry);
        if (!item) continue;
        if (this.items.some((existing) => existing.id === item.id)) continue;
        this.items.push(item);
      }
      this.renumber();
      this.emit();
    } catch {
      // Corrupt snapshot — start fresh rather than blocking the sell flow.
    }
  }

  private persistSnapshot(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.writeSnapshot();
    }, PERSIST_DEBOUNCE_MS);
  }

  /** Terminal states must survive a process kill — bypass the debounce and
   *  await the write. Callers at terminal transitions must await this. */
  private async flushSnapshot(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    await this.writeSnapshot();
  }

  private writeSnapshot(): Promise<void> {
    const snapshot: UploadQueueSnapshot[] = this.items.map((item) => ({
      id: item.id,
      asset: item.asset,
      order: item.order,
      state: item.state,
      attemptCount: item.attemptCount,
      publicUrl: item.publicUrl,
      finalizationId: item.finalizationId,
      error: item.error,
      retryable: item.retryable,
    }));
    return AsyncStorage.setItem(this.storageKey, JSON.stringify(snapshot)).catch(() => {
      // Storage failures must not break the upload flow — metadata is best-effort.
    });
  }

  private updateProgress(item: UploadQueueItem, loadedBytes: number, totalBytes: number): void {
    const total = totalBytes > 0 ? totalBytes : item.asset.fileSize ?? 0;
    item.progress = total > 0 ? Math.min(1, loadedBytes / total) : 0;
    const now = Date.now();
    if (now - (this.lastProgressEmitMs.get(item.id) ?? 0) < PROGRESS_EMIT_INTERVAL_MS) return;
    this.lastProgressEmitMs.set(item.id, now);
    this.emit();
  }

  private checkDone(): void {
    const hasPending = this.items.some(
      (i) => (i.state === 'pending' || i.state === 'preparing') && i.attemptCount < MAX_RETRIES
    );
    if (!hasPending && this.activeCount === 0) {
      this.running = false;
      this.emit();
      if (this.completionResolver) {
        this.completionResolver(this.getState());
        this.completionResolver = null;
      }
      this.runPromise = null;
    }
  }

  private async processQueue(): Promise<void> {
    while (true) {
      const pending = this.items.filter(
        (i) => i.state === 'pending' && i.attemptCount < MAX_RETRIES
      );
      if (pending.length === 0) break;
      // Offline: stop starting new items. In-flight work fails naturally and
      // resumeAfterOffline() restarts the loop when connectivity returns.
      if (this.internetReachable === false) break;
      if (this.activeCount >= MAX_CONCURRENCY) {
        await this.waitForSlot();
        continue;
      }
      const item = pending[0];
      this.activeCount++;
      this.processItem(item).finally(() => {
        this.activeCount--;
        this.notifySlots();
        this.checkDone();
        this.processQueue();
      });
    }
    this.checkDone();
  }

  private waitForSlot(): Promise<void> {
    return new Promise((resolve) => {
      this.slotResolvers.push(resolve);
    });
  }

  private notifySlots(): void {
    while (this.slotResolvers.length > 0 && this.activeCount < MAX_CONCURRENCY) {
      const resolve = this.slotResolvers.shift();
      resolve?.();
    }
  }

  private async processItem(item: UploadQueueItem): Promise<void> {
    if (item.state === 'uploaded' || item.state === 'cancelled') return;

    const controller = new AbortController();
    this.abortControllers.set(item.id, controller);
    const { signal } = controller;

    item.state = 'preparing';
    item.attemptCount++;
    item.error = null;
    item.progress = 0;
    this.emit();

    const { asset } = item;
    const originalAssetUri = asset.uri;
    const originalAssetFileName = asset.fileName;
    const originalAssetMimeType = asset.mimeType;
    // Temp resized file URI to delete once the bytes are on the origin.
    let resizedTempUri: string | null = null;

    try {
      // A previous attempt uploaded the bytes but finalization failed: the
      // object already exists on the origin, so retry only the finalize call
      // instead of re-uploading the entire file.
      if (item._needsFinalizationOnly && item._presign) {
        const presign = item._presign;
        if (item._cancelRequested) {
          item.state = 'cancelled';
          item.error = null;
          item.retryable = false;
          delete item._cancelRequested;
          delete item._needsFinalizationOnly;
          delete item._presign;
          this.emit();
          await this.flushSnapshot();
          return;
        }
        item.state = 'uploading';
        this.emit();
        const finalization = await finalizeUpload({
          objectKey: presign.key,
          bucket: presign.bucket,
          fileName: asset.fileName,
          contentType: presign.contentType,
          sizeBytes: presign.sizeBytes,
          publicUrl: presign.publicUrl,
          folder: 'listings',
          scope: 'listing_media',
          verifyObject: true,
          signal,
        });
        item.state = 'uploaded';
        item.progress = 1;
        item.publicUrl = finalization.publicUrl;
        item.finalizationId = finalization.id;
        item.error = null;
        item.retryable = false;
        delete item._needsFinalizationOnly;
        delete item._presign;
        this.emit();
        await this.flushSnapshot();
        return;
      }

      // Resize images before upload to reduce bandwidth. Videos are uploaded as-is.
      // On any resize failure, fall back to the original asset so uploads never block.
      let uploadUri = asset.uri;
      let uploadFileName = asset.fileName;
      let uploadMimeType = asset.mimeType;
      const isImage =
        asset.kind === 'image' || asset.mimeType.toLowerCase().startsWith('image/');

      if (isImage) {
        try {
          const resized = await resizeForUpload(asset.uri, 'listing');
          uploadUri = resized.uri;
          uploadMimeType = resized.mimeType;
          const baseName = asset.fileName.replace(/\.[^.]+$/, '') || 'media';
          uploadFileName = `${baseName}.${resized.fileExtension}`;
          if (uploadUri !== originalAssetUri) resizedTempUri = uploadUri;
          // Reflect the resized asset on the item so downstream consumers see the
          // actual bytes that were uploaded.
          asset.uri = uploadUri;
          asset.fileName = uploadFileName;
          asset.mimeType = uploadMimeType;
          asset.width = resized.width;
          asset.height = resized.height;
        } catch {
          // Resize failed: keep using the original asset verbatim.
          uploadUri = asset.uri;
          uploadFileName = asset.fileName;
          uploadMimeType = asset.mimeType;
        }
      }

      // Resolve the upload size without loading the file into JS memory.
      // Native uploads stream from disk via the XHR transport, so only the
      // byte count is needed for presign; web must read a Blob to send one.
      let sizeProbeBlob: Blob | undefined;
      let sizeBytes = 0;
      if (Platform.OS === 'web') {
        const blob = await fetch(uploadUri, { signal }).then((response) => response.blob());
        sizeProbeBlob = blob;
        sizeBytes = blob.size || asset.fileSize || 0;
      } else {
        try {
          const info = await FileSystem.getInfoAsync(uploadUri);
          if (info.exists && typeof info.size === 'number' && info.size > 0) {
            sizeBytes = info.size;
          }
        } catch {
          // getInfoAsync may not support ph:// or content:// URIs.
        }
        if (!sizeBytes) sizeBytes = asset.fileSize || 0;
        if (!sizeBytes) {
          // Last resort: read the file as a Blob to obtain its size.
          const blob = await fetch(uploadUri, { signal }).then((response) => response.blob());
          sizeProbeBlob = blob;
          sizeBytes = blob.size;
        }
      }
      // Large files use the S3 multipart (resumable) path so a network
      // interruption retries only the affected part instead of restarting
      // from byte 0. The backend's complete endpoint assembles the object
      // and creates the finalization record, so no separate finalize call is
      // needed. Small files keep the single-presign PUT + finalize path.
      const useMultipart = sizeBytes >= MULTIPART_THRESHOLD_BYTES;

      if (useMultipart) {
        // If cancellation was requested before uploading, transition early.
        if (item._cancelRequested) {
          item.state = 'cancelled';
          item.error = null;
          item.retryable = false;
          delete item._cancelRequested;
          this.emit();
          await this.flushSnapshot();
          return;
        }

        item.state = 'uploading';
        this.emit();

        const multipartResult = await uploadMultipart({
          fileUri: uploadUri,
          fileName: uploadFileName,
          contentType: uploadMimeType,
          folder: 'listings',
          sizeBytes,
          wholeBlob: sizeProbeBlob,
          signal,
          onProgress: (loadedBytes, totalBytes) =>
            this.updateProgress(item, loadedBytes, totalBytes || sizeBytes),
        });

        // If cancellation was requested mid-upload, the multipart helper
        // aborted the session and threw an AbortError (handled by the catch
        // block below). Reaching here means the upload completed.
        if (item._cancelRequested) {
          item.state = 'cancelled';
          item.error = null;
          item.retryable = false;
          delete item._cancelRequested;
          this.emit();
          await this.flushSnapshot();
          return;
        }

        item.state = 'uploaded';
        item.progress = 1;
        item.publicUrl = multipartResult.publicUrl;
        item.finalizationId = multipartResult.finalizationId;
        item.error = null;
        item.retryable = false;
      } else {
        const presign = await presignUpload(
          uploadFileName,
          uploadMimeType,
          'listings',
          sizeBytes,
          signal
        );

        // If cancellation was requested while presigning, transition to cancelled and abort
        if (item._cancelRequested) {
          item.state = 'cancelled';
          item.error = null;
          item.retryable = false;
          delete item._cancelRequested;
          this.emit();
          await this.flushSnapshot();
          return;
        }

        item.state = 'uploading';
        this.emit();

        await uploadToPresignedUrl(presign.url, uploadUri, uploadMimeType, sizeProbeBlob, {
          signal,
          // RN can report a zero event.total for send({ uri }) streams — fall
          // back to the size resolved for presign so progress never freezes.
          onProgress: (loadedBytes, totalBytes) => this.updateProgress(item, loadedBytes, totalBytes || sizeBytes),
        });

        // Bytes are on the origin; cache the presign so a finalization failure
        // can retry only the finalize call instead of re-uploading the file.
        item._presign = presign;

        // If cancellation was requested while uploading, transition to cancelled and ignore result
        if (item._cancelRequested) {
          item.state = 'cancelled';
          item.error = null;
          item.retryable = false;
          delete item._cancelRequested;
          delete item._presign;
          this.emit();
          await this.flushSnapshot();
          return;
        }

        const finalization = await finalizeUpload({
          objectKey: presign.key,
          bucket: presign.bucket,
          fileName: uploadFileName,
          contentType: presign.contentType,
          sizeBytes: presign.sizeBytes,
          publicUrl: presign.publicUrl,
          folder: 'listings',
          scope: 'listing_media',
          verifyObject: true,
          signal,
        });

        item.state = 'uploaded';
        item.progress = 1;
        item.publicUrl = finalization.publicUrl;
        item.finalizationId = finalization.id;
        item.error = null;
        item.retryable = false;
        delete item._presign;
      }
    } catch (err: unknown) {
      // Cancellation (flag or aborted transport) transitions to cancelled, not failed
      if (item._cancelRequested || isAbortError(err)) {
        item.state = 'cancelled';
        item.error = null;
        item.retryable = false;
        delete item._cancelRequested;
        delete item._presign;
        delete item._needsFinalizationOnly;
        this.emit();
        await this.flushSnapshot();
        return;
      }
      // Upload landed but finalization failed: the object already exists on
      // the origin, so the next retry only needs to re-call finalize.
      // However, if THIS was already a finalize-only retry that failed, the
      // cached presign may be stale (object deleted, URL expired) — clear it
      // so the next retry does a full re-upload instead of looping on a
      // broken finalize call.
      if (item._presign && !item._needsFinalizationOnly) {
        item._needsFinalizationOnly = true;
      } else if (item._needsFinalizationOnly) {
        delete item._presign;
        delete item._needsFinalizationOnly;
      }
      const message = err instanceof Error ? err.message : 'Upload failed';
      item.state = 'failed';
      item.error = message;
      item.retryable = isRetryableUploadError(err) && item.attemptCount < MAX_RETRIES;
    } finally {
      // Clean up the temporary resized file. On a non-terminal outcome the
      // asset is restored to its original URI so a retry re-resizes from the
      // source rather than reading a deleted temp file.
      if (resizedTempUri) {
        if (item.state !== 'uploaded') {
          asset.uri = originalAssetUri;
          asset.fileName = originalAssetFileName;
          asset.mimeType = originalAssetMimeType;
        }
        FileSystem.deleteAsync(resizedTempUri).catch(() => {
          // Temp cleanup is best-effort.
        });
      }
      this.abortControllers.delete(item.id);
      this.lastProgressEmitMs.delete(item.id);
      const resolveCancel = this.cancelResolvers.get(item.id);
      if (resolveCancel) {
        this.cancelResolvers.delete(item.id);
        resolveCancel();
      }
    }

    this.emit();
    await this.flushSnapshot();
  }
}
