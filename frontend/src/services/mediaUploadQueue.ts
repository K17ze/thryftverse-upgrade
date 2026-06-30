import { MediaUploadAsset } from '../utils/mediaUploadAsset';
import { presignUpload, uploadToPresignedUrl } from './mediaUpload';

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
  attemptCount: number;
  publicUrl: string | null;
  error: string | null;
  retryable: boolean;
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
  error: string | null;
}

export type UploadQueueListener = (state: UploadQueueState) => void;

const MAX_CONCURRENCY = 2;
const MAX_RETRIES = 3;

export class MediaUploadQueue {
  private items: UploadQueueItem[] = [];
  private listeners: UploadQueueListener[] = [];
  private running = false;
  private activeCount = 0;
  private completionResolver: ((state: UploadQueueState) => void) | null = null;
  private runPromise: Promise<UploadQueueState> | null = null;

  /* ── public API ── */

  addAssets(assets: MediaUploadAsset[]): UploadQueueItem[] {
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
        attemptCount: 0,
        publicUrl: null,
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
      }
    }
    this.emit();
    this.start();
  }

  retryItem(itemId: string): boolean {
    const item = this.items.find((i) => i.id === itemId);
    if (!item) return false;
    if (item.state === 'uploaded' || item.state === 'cancelled') return false;
    if (item.attemptCount >= MAX_RETRIES) return false;
    item.state = 'pending';
    item.error = null;
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
  cancelItem(itemId: string): boolean {
    const item = this.items.find((i) => i.id === itemId);
    if (!item) return false;
    if (item.state === 'uploaded') return false;
    if (item.state === 'pending') {
      item.state = 'cancelled';
      item.error = null;
      item.retryable = false;
      this.emit();
      return true;
    }
    // In-flight (preparing/uploading): mark with special state so processItem can handle it
    (item as any)._cancelRequested = true;
    this.emit();
    return true;
  }

  removeItem(itemId: string): boolean {
    const idx = this.items.findIndex((i) => i.id === itemId);
    if (idx === -1) return false;
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

  reset(): void {
    this.items = [];
    this.running = false;
    this.activeCount = 0;
    this.completionResolver = null;
    this.runPromise = null;
    this.emit();
  }

  subscribe(listener: UploadQueueListener): () => void {
    this.listeners.push(listener);
    listener(this.getState());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** Start processing and return a promise that resolves exactly once when the queue finishes. */
  run(): Promise<UploadQueueState> {
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
        error: item.error,
      });
    }
    return map;
  }

  start(): void {
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
      if (this.activeCount >= MAX_CONCURRENCY) {
        await this.waitForSlot();
        continue;
      }
      const item = pending[0];
      this.activeCount++;
      this.processItem(item).finally(() => {
        this.activeCount--;
        this.checkDone();
        this.processQueue();
      });
    }
    this.checkDone();
  }

  private waitForSlot(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.activeCount < MAX_CONCURRENCY) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  private async processItem(item: UploadQueueItem): Promise<void> {
    if (item.state === 'uploaded' || item.state === 'cancelled') return;

    item.state = 'preparing';
    item.attemptCount++;
    item.error = null;
    this.emit();

    try {
      const { asset } = item;
      const presign = await presignUpload(asset.fileName, asset.mimeType, 'listings');

      // If cancellation was requested while presigning, transition to cancelled and abort
      if ((item as any)._cancelRequested) {
        item.state = 'cancelled';
        item.error = null;
        item.retryable = false;
        delete (item as any)._cancelRequested;
        this.emit();
        return;
      }

      item.state = 'uploading';
      this.emit();

      await uploadToPresignedUrl(presign.url, asset.uri, asset.mimeType);

      // If cancellation was requested while uploading, transition to cancelled and ignore result
      if ((item as any)._cancelRequested) {
        item.state = 'cancelled';
        item.error = null;
        item.retryable = false;
        delete (item as any)._cancelRequested;
        this.emit();
        return;
      }

      item.state = 'uploaded';
      item.publicUrl = presign.publicUrl;
      item.error = null;
      item.retryable = false;
    } catch (err: unknown) {
      // If cancellation was requested during upload, transition to cancelled, not failed
      if ((item as any)._cancelRequested) {
        item.state = 'cancelled';
        item.error = null;
        item.retryable = false;
        delete (item as any)._cancelRequested;
        this.emit();
        return;
      }
      const message = err instanceof Error ? err.message : 'Upload failed';
      item.state = 'failed';
      item.error = message;
      item.retryable = item.attemptCount < MAX_RETRIES;
    }

    this.emit();
  }
}
