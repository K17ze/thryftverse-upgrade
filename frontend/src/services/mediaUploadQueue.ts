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

export type UploadQueueListener = (state: UploadQueueState) => void;

const MAX_CONCURRENCY = 2;
const MAX_RETRIES = 3;

export class MediaUploadQueue {
  private items: UploadQueueItem[] = [];
  private listeners: UploadQueueListener[] = [];
  private running = false;
  private activeCount = 0;

  /* ── public API ── */

  addAssets(assets: MediaUploadAsset[]): UploadQueueItem[] {
    const startOrder = this.items.length;
    const newItems: UploadQueueItem[] = assets.map((asset, i) => ({
      id: asset.id,
      asset,
      order: startOrder + i,
      state: 'pending',
      attemptCount: 0,
      publicUrl: null,
      error: null,
      retryable: true,
    }));
    this.items.push(...newItems);
    this.emit();
    return newItems;
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

  cancelItem(itemId: string): boolean {
    const item = this.items.find((i) => i.id === itemId);
    if (!item) return false;
    if (item.state === 'uploaded') return false;
    item.state = 'cancelled';
    item.error = null;
    item.retryable = false;
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
    this.emit();
  }

  subscribe(listener: UploadQueueListener): () => void {
    this.listeners.push(listener);
    listener(this.getState());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
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
        this.processQueue();
      });
    }
    if (this.activeCount === 0) {
      this.running = false;
      this.emit();
    }
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

      item.state = 'uploading';
      this.emit();

      await uploadToPresignedUrl(presign.url, asset.uri, asset.mimeType);

      item.state = 'uploaded';
      item.publicUrl = presign.publicUrl;
      item.error = null;
      item.retryable = false;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      item.state = 'failed';
      item.error = message;
      item.retryable = item.attemptCount < MAX_RETRIES;
    }

    this.emit();
  }
}
