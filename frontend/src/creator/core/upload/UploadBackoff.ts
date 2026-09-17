/**
 * Backoff + abortable sleep helpers shared by the upload manager's
 * retry loops. Extracted so `UploadManager` stays focused on job
 * lifecycle and concurrency — these are pure timing primitives.
 */

/** Base delay (ms) for exponential backoff between retry attempts. */
const BASE_BACKOFF_MS = 1000;
/** Upper bound (ms) for exponential backoff. */
const MAX_BACKOFF_MS = 30_000;

/**
 * Exponential backoff with jitter:
 * `min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2^attempt) + random jitter`.
 */
export function computeBackoff(attempt: number): number {
  const exp = BASE_BACKOFF_MS * Math.pow(2, attempt);
  const capped = Math.min(MAX_BACKOFF_MS, exp);
  const jitter = Math.random() * (capped * 0.25);
  return Math.round(capped + jitter);
}

/** Promise-based sleep that rejects early if the signal aborts. */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
