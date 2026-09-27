/**
 * retryWithBackoff — exponential backoff retry for recoverable async work.
 *
 * Web port of the retry discipline behind mobile's offline queue /
 * SyncRetryBanner: bounded attempts, exponential delay with optional
 * jitter, and a `shouldRetry` predicate so non-retryable failures (4xx,
 * auth, validation) exit immediately instead of burning attempts.
 *
 * This is infrastructure, not a UI primitive — components surface the
 * retry affordance (banner, button), this helper owns the attempt loop.
 */

export interface RetryOptions {
  /** Total attempts including the first call. Default 3. */
  attempts?: number;
  /** Delay before the second attempt. Default 400ms. */
  baseDelayMs?: number;
  /** Backoff multiplier per attempt. Default 2. */
  factor?: number;
  /** Ceiling for any single delay. Default 8000ms. */
  maxDelayMs?: number;
  /** Add ±25% jitter so queued retries don't stampede. Default true. */
  jitter?: boolean;
  /** Return false to stop retrying a given error. Default retries all. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Called before each retry sleep — wire telemetry/UI state here. */
  onAttempt?: (attempt: number, delayMs: number, error: unknown) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    attempts = 3,
    baseDelayMs = 400,
    factor = 2,
    maxDelayMs = 8000,
    jitter = true,
    shouldRetry,
    onAttempt,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      if (shouldRetry && !shouldRetry(error, attempt)) break;

      let delay = Math.min(baseDelayMs * factor ** (attempt - 1), maxDelayMs);
      if (jitter) {
        // ±25% jitter, applied symmetrically.
        delay = Math.round(delay * (0.75 + Math.random() * 0.5));
      }
      onAttempt?.(attempt, delay, error);
      await sleep(delay);
    }
  }
  throw lastError;
}
