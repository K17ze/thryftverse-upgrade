import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { Sentry } from './sentry';
import { createStableId } from '../utils/createStableId';

/** Maximum number of retry attempts before an item is moved to the dead-letter queue. */
const MAX_RETRIES = 8;
/** Maximum number of items retained in the offline queue. */
const MAX_QUEUE_SIZE = 100;
/** Base delay (ms) for exponential backoff between retries. */
const BASE_DELAY = 2000;
/** Upper bound (ms) for exponential backoff between retries. */
const MAX_DELAY = 60000;

/**
 * Error code attached to `ApiRequestError` when a write mutation was enqueued
 * for later replay instead of being submitted immediately. Callers can inspect
 * `error.details.code` (or `parseApiError`) to distinguish a queued write from
 * a hard failure and surface an appropriate "saved offline" message.
 */
export const OFFLINE_WRITE_QUEUED_CODE = 'OFFLINE_WRITE_QUEUED';

export interface QueuedRequest {
  id: string;
  url: string;
  options: RequestInit;
  timestamp: number;
  retryCount: number;
  /** Timestamp of the most recent fetch attempt; used for exponential backoff. */
  lastAttemptAt?: number;
}

interface OfflineQueueState {
  queue: QueuedRequest[];
  deadLetterQueue: QueuedRequest[];
  isProcessing: boolean;
  pushToQueue: (url: string, options: RequestInit) => void;
  removeFromQueue: (id: string) => void;
  flushQueue: (fetchImplementation: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>) => Promise<void>;
  clearQueue: () => void;
}

/**
 * Builds a stable signature for deduplication based on url + method + body.
 * Body is stringified when possible; unserialisable bodies fall back to a
 * best-effort string representation so equivalent mutations still collapse.
 */
function requestSignature(url: string, options: RequestInit): string {
  const method = (options.method ?? 'GET').toUpperCase();
  let body = '';
  if (options.body != null) {
    if (typeof options.body === 'string') {
      body = options.body;
    } else {
      try {
        body = JSON.stringify(options.body);
      } catch {
        body = String(options.body);
      }
    }
  }
  return `${method}:${url}:${body}`;
}

/** Computes the exponential backoff delay (ms) for a given retry count. */
function backoffDelay(retryCount: number): number {
  const delay = BASE_DELAY * Math.pow(2, retryCount);
  return Math.min(delay, MAX_DELAY);
}

export const useOfflineQueue = create<OfflineQueueState>()(
  persist(
    (set, get) => ({
      queue: [],
      deadLetterQueue: [],
      isProcessing: false,

      pushToQueue: (url, options) => {
        const newRequest: QueuedRequest = {
          id: createStableId(),
          url,
          options,
          timestamp: Date.now(),
          retryCount: 0,
        };

        const signature = requestSignature(url, options);

        set((state) => {
          // Deduplicate: replace any existing item with the same url + method + body,
          // keeping the newer request so the same mutation doesn't pile up.
          const duplicateIndex = state.queue.findIndex(
            (req) => requestSignature(req.url, req.options) === signature
          );

          if (duplicateIndex !== -1) {
            Sentry.addBreadcrumb?.({
              category: 'offline-queue',
              message: 'Duplicate queued mutation replaced',
              level: 'info',
              data: { url, method: options.method ?? 'GET' },
            });
            const queue = state.queue.filter((_, idx) => idx !== duplicateIndex);
            return { queue: [...queue, newRequest] };
          }

          // Queue size cap: evict the oldest item (FIFO) when at capacity.
          let queue = state.queue;
          if (queue.length >= MAX_QUEUE_SIZE) {
            const evicted = queue[0];
            console.warn(
              `[offlineQueue] Queue full (${MAX_QUEUE_SIZE}); evicting oldest item ${evicted?.id}`
            );
            Sentry.addBreadcrumb?.({
              category: 'offline-queue',
              message: 'Offline queue full; oldest item evicted',
              level: 'warning',
              data: { url: evicted?.url, method: evicted?.options.method ?? 'GET' },
            });
            queue = queue.slice(1);
          }

          return { queue: [...queue, newRequest] };
        });
      },

      removeFromQueue: (id) => {
        set((state) => ({
          queue: state.queue.filter((req) => req.id !== id),
        }));
      },

      clearQueue: () => set({ queue: [] }),

      flushQueue: async (fetchImplementation) => {
        const { queue, isProcessing, removeFromQueue } = get();

        if (isProcessing || queue.length === 0) return;

        // Verify native network state before flushing
        const networkState = await Network.getNetworkStateAsync();
        if (!networkState.isInternetReachable) return;

        set({ isProcessing: true });

        // Sort by timestamp (FIFO)
        const sortedQueue = [...queue].sort((a, b) => a.timestamp - b.timestamp);

        for (const req of sortedQueue) {
          // Exponential backoff: skip items whose backoff window has not elapsed
          // since their last attempt.
          if (req.lastAttemptAt !== undefined) {
            const elapsed = Date.now() - req.lastAttemptAt;
            const delay = backoffDelay(req.retryCount);
            if (elapsed < delay) continue;
          }

          // Record the attempt timestamp before firing.
          set((state) => ({
            queue: state.queue.map((qReq) =>
              qReq.id === req.id
                ? { ...qReq, lastAttemptAt: Date.now() }
                : qReq
            ),
          }));

          try {
            // Attempt to fire the stored request
            const response = await fetchImplementation(req.url, req.options);

            if (response.ok || (response.status >= 400 && response.status < 500)) {
              // If it succeeded or failed with a 4xx client error (unrecoverable),
              // we don't need to try it again.
              removeFromQueue(req.id);
            } else {
              // 5xx Server Error or network drop mid-flight: increment retry and keep in queue
              const nextRetryCount = req.retryCount + 1;
              if (nextRetryCount > MAX_RETRIES) {
                // Exceeded retry budget: move to dead-letter queue and emit telemetry.
                Sentry.addBreadcrumb?.({
                  category: 'offline-queue',
                  message: 'Queued mutation dropped after exceeding max retries',
                  level: 'error',
                  data: { url: req.url, method: req.options.method ?? 'GET', retryCount: nextRetryCount },
                });
                set((state) => ({
                  queue: state.queue.filter((qReq) => qReq.id !== req.id),
                  deadLetterQueue: [...state.deadLetterQueue, { ...req, retryCount: nextRetryCount }],
                }));
              } else {
                set((state) => ({
                  queue: state.queue.map((qReq) =>
                    qReq.id === req.id
                      ? { ...qReq, retryCount: qReq.retryCount + 1 }
                      : qReq
                  ),
                }));
              }
            }
          } catch (error) {
            // Network failure during fetch: keep in queue with incremented retry
            const nextRetryCount = req.retryCount + 1;
            if (nextRetryCount > MAX_RETRIES) {
              Sentry.addBreadcrumb?.({
                category: 'offline-queue',
                message: 'Queued mutation dropped after exceeding max retries',
                level: 'error',
                data: { url: req.url, method: req.options.method ?? 'GET', retryCount: nextRetryCount },
              });
              set((state) => ({
                queue: state.queue.filter((qReq) => qReq.id !== req.id),
                deadLetterQueue: [...state.deadLetterQueue, { ...req, retryCount: nextRetryCount }],
              }));
            } else {
              set((state) => ({
                queue: state.queue.map((qReq) =>
                  qReq.id === req.id
                    ? { ...qReq, retryCount: qReq.retryCount + 1 }
                    : qReq
                ),
              }));
            }
          }
        }

        set({ isProcessing: false });
      },
    }),
    {
      name: 'thryftverse-offline-queue',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ queue: state.queue }), // Only persist the queue array
    }
  )
);

/**
 * Convenience selector returning the current number of pending offline
 * actions. Components can subscribe via `useOfflineQueue(selectPendingCount)`
 * to re-render only when the count changes.
 */
export const selectPendingCount = (state: OfflineQueueState): number => state.queue.length;
