type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenMaxCalls?: number;
}

export interface CircuitBreakerStatus {
  name: string;
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureAt: number | null;
  halfOpenSuccesses: number;
}

interface CircuitBreakerInternal {
  name: string;
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureAt: number | null;
  halfOpenSuccesses: number;
  halfOpenCalls: number;
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxCalls: number;
}

const breakers = new Map<string, CircuitBreakerInternal>();

function logTransition(name: string, from: CircuitBreakerState, to: CircuitBreakerState): void {
  console.warn(
    `[circuit-breaker] "${name}" transitioned ${from} -> ${to}`
  );
}

function getOrCreateBreaker(name: string, options: CircuitBreakerOptions): CircuitBreakerInternal {
  const existing = breakers.get(name);
  if (existing) {
    return existing;
  }

  const breaker: CircuitBreakerInternal = {
    name,
    state: 'closed',
    failureCount: 0,
    lastFailureAt: null,
    halfOpenSuccesses: 0,
    halfOpenCalls: 0,
    failureThreshold: options.failureThreshold ?? 5,
    resetTimeoutMs: options.resetTimeoutMs ?? 30_000,
    halfOpenMaxCalls: options.halfOpenMaxCalls ?? 3,
  };

  breakers.set(name, breaker);
  return breaker;
}

function maybeTransitionToHalfOpen(breaker: CircuitBreakerInternal): void {
  if (breaker.state !== 'open') {
    return;
  }

  const elapsed = breaker.lastFailureAt !== null
    ? Date.now() - breaker.lastFailureAt
    : Infinity;

  if (elapsed >= breaker.resetTimeoutMs) {
    const previous = breaker.state;
    breaker.state = 'half-open';
    breaker.halfOpenCalls = 0;
    breaker.halfOpenSuccesses = 0;
    logTransition(breaker.name, previous, 'half-open');
  }
}

function handleSuccess(breaker: CircuitBreakerInternal): void {
  if (breaker.state === 'half-open') {
    breaker.halfOpenSuccesses += 1;
    if (breaker.halfOpenSuccesses >= breaker.halfOpenMaxCalls) {
      const previous = breaker.state;
      breaker.state = 'closed';
      breaker.failureCount = 0;
      breaker.lastFailureAt = null;
      breaker.halfOpenCalls = 0;
      breaker.halfOpenSuccesses = 0;
      logTransition(breaker.name, previous, 'closed');
    }
  } else if (breaker.state === 'closed') {
    breaker.failureCount = 0;
  }
}

function handleFailure(breaker: CircuitBreakerInternal): void {
  breaker.failureCount += 1;
  breaker.lastFailureAt = Date.now();

  if (breaker.state === 'half-open') {
    const previous = breaker.state;
    breaker.state = 'open';
    breaker.halfOpenCalls = 0;
    breaker.halfOpenSuccesses = 0;
    logTransition(breaker.name, previous, 'open');
  } else if (
    breaker.state === 'closed'
    && breaker.failureCount >= breaker.failureThreshold
  ) {
    const previous = breaker.state;
    breaker.state = 'open';
    logTransition(breaker.name, previous, 'open');
  }
}

/**
 * Error thrown when a circuit breaker is open and calls are being rejected
 * without invoking the wrapped function.
 */
export class CircuitBreakerOpenError extends Error {
  readonly breakerName: string;
  readonly retryAfterMs: number;

  constructor(breakerName: string, retryAfterMs: number) {
    super(`Circuit breaker "${breakerName}" is open — retry in ${retryAfterMs}ms`);
    this.name = 'CircuitBreakerOpenError';
    this.breakerName = breakerName;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Wraps an async function with circuit-breaker logic. When the wrapped
 * function fails repeatedly (up to `failureThreshold`), the breaker opens and
 * immediately rejects subsequent calls with a {@link CircuitBreakerOpenError}.
 * After `resetTimeoutMs` the breaker enters a half-open state, allowing a
 * limited number of test calls; if they succeed the breaker closes, otherwise
 * it reopens. All errors are caught and rethrown — the breaker never crashes
 * the host process.
 *
 * @param name - Human-readable identifier for observability/logging.
 * @param fn - The async function to protect.
 * @param options - Optional tuning parameters.
 * @returns A wrapped async function with the same signature as `fn`.
 */
export function createCircuitBreaker<
  Args extends readonly unknown[],
  Result,
>(
  name: string,
  fn: (...args: Args) => Promise<Result>,
  options: CircuitBreakerOptions = {}
): (...args: Args) => Promise<Result> {
  return async (...args: Args): Promise<Result> => {
    const breaker = getOrCreateBreaker(name, options);
    maybeTransitionToHalfOpen(breaker);

    if (breaker.state === 'open') {
      const elapsed = breaker.lastFailureAt !== null
        ? Date.now() - breaker.lastFailureAt
        : 0;
      const retryAfterMs = Math.max(breaker.resetTimeoutMs - elapsed, 0);
      throw new CircuitBreakerOpenError(name, retryAfterMs);
    }

    if (breaker.state === 'half-open') {
      if (breaker.halfOpenCalls >= breaker.halfOpenMaxCalls) {
        const elapsed = breaker.lastFailureAt !== null
          ? Date.now() - breaker.lastFailureAt
          : 0;
        const retryAfterMs = Math.max(breaker.resetTimeoutMs - elapsed, 0);
        throw new CircuitBreakerOpenError(name, retryAfterMs);
      }
      breaker.halfOpenCalls += 1;
    }

    try {
      const result = await fn(...args);
      handleSuccess(breaker);
      return result;
    } catch (error) {
      handleFailure(breaker);
      throw error;
    }
  };
}

/**
 * Returns the current status of a named circuit breaker, or null if the
 * breaker has never been created.
 */
export function getCircuitBreakerStatus(name: string): CircuitBreakerStatus | null {
  const breaker = breakers.get(name);
  if (!breaker) {
    return null;
  }

  return {
    name: breaker.name,
    state: breaker.state,
    failureCount: breaker.failureCount,
    lastFailureAt: breaker.lastFailureAt,
    halfOpenSuccesses: breaker.halfOpenSuccesses,
  };
}

/**
 * Resets a named circuit breaker to its initial closed state. Useful for
 * testing or manual operational recovery.
 */
export function resetCircuitBreaker(name: string): void {
  const breaker = breakers.get(name);
  if (!breaker) {
    return;
  }

  const previous = breaker.state;
  breaker.state = 'closed';
  breaker.failureCount = 0;
  breaker.lastFailureAt = null;
  breaker.halfOpenCalls = 0;
  breaker.halfOpenSuccesses = 0;
  if (previous !== 'closed') {
    logTransition(breaker.name, previous, 'closed');
  }
}
