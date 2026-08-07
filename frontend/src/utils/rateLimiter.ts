import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Client-side rate limiting for sensitive actions.
 *
 * Protects against brute-force / scripted abuse of:
 *  - login attempts
 *  - signup attempts
 *  - bid placement
 *  - listing creation
 *  - withdrawal requests
 *
 * This is a DEFENCE-IN-DEPTH layer only. The authoritative rate limit lives on
 * the server. Client-side limiting improves UX (immediate feedback, no network
 * round-trip) and reduces load on the backend, but a determined attacker can
 * clear app storage to reset the counter. Server enforcement is mandatory.
 *
 * OWASP Mobile Top 10 (2024) — M5: Insecure Authentication.
 */

export interface RateLimitResult {
  /** True when the action is allowed within the current window. */
  allowed: boolean;
  /** Milliseconds until the next attempt is allowed (0 when allowed). */
  retryAfterMs: number;
  /** Remaining attempts in the current window. */
  remaining: number;
}

interface Bucket {
  /** Timestamps (ms since epoch) of each attempt in the current window. */
  attempts: number[];
}

const STORAGE_KEY_PREFIX = '@thryftverse_ratelimit/';
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 60_000; // 1 minute

// In-memory cache so checks are synchronous-fast and survive re-renders without
// re-reading AsyncStorage on every call. Persisted to AsyncStorage so limits
// survive app restarts.
const memoryBuckets = new Map<string, Bucket>();

/** Pre-configured limits per sensitive action. */
export const RATE_LIMITS = {
  login: { maxAttempts: 5, windowMs: 60_000 },
  signup: { maxAttempts: 3, windowMs: 60_000 },
  bid: { maxAttempts: 10, windowMs: 60_000 },
  listing: { maxAttempts: 10, windowMs: 5 * 60_000 },
  withdraw: { maxAttempts: 3, windowMs: 60_000 },
  passwordReset: { maxAttempts: 3, windowMs: 5 * 60_000 },
  otpVerify: { maxAttempts: 5, windowMs: 60_000 },
} as const;

export type RateLimitedAction = keyof typeof RATE_LIMITS;

function storageKey(action: RateLimitedAction, userId: string): string {
  return `${STORAGE_KEY_PREFIX}${action}:${userId}`;
}

function pruneWindow(bucket: Bucket, windowMs: number, now: number): Bucket {
  const cutoff = now - windowMs;
  return { attempts: bucket.attempts.filter((t) => t > cutoff) };
}

/**
 * Check whether an action is allowed without consuming an attempt.
 */
export function checkRateLimit(
  action: RateLimitedAction,
  userId: string,
  now: number = Date.now()
): RateLimitResult {
  const config = RATE_LIMITS[action];
  const key = storageKey(action, userId);
  const bucket = pruneWindow(memoryBuckets.get(key) ?? { attempts: [] }, config.windowMs, now);

  if (bucket.attempts.length >= config.maxAttempts) {
    const oldest = bucket.attempts[0];
    const retryAfterMs = Math.max(0, oldest + config.windowMs - now);
    return {
      allowed: false,
      retryAfterMs,
      remaining: 0,
    };
  }

  return {
    allowed: true,
    retryAfterMs: 0,
    remaining: config.maxAttempts - bucket.attempts.length,
  };
}

/**
 * Record an attempt and return whether it is allowed.
 *
 * Call this right BEFORE performing the sensitive action. If `allowed` is
 * false, do not perform the action — surface `retryAfterMs` to the user.
 */
export function consumeRateLimit(
  action: RateLimitedAction,
  userId: string,
  now: number = Date.now()
): RateLimitResult {
  const config = RATE_LIMITS[action];
  const key = storageKey(action, userId);
  const pruned = pruneWindow(memoryBuckets.get(key) ?? { attempts: [] }, config.windowMs, now);

  if (pruned.attempts.length >= config.maxAttempts) {
    const oldest = pruned.attempts[0];
    const retryAfterMs = Math.max(0, oldest + config.windowMs - now);
    memoryBuckets.set(key, pruned);
    void persistBucket(key, pruned);
    return { allowed: false, retryAfterMs, remaining: 0 };
  }

  const next: Bucket = { attempts: [...pruned.attempts, now] };
  memoryBuckets.set(key, next);
  void persistBucket(key, next);

  return {
    allowed: true,
    retryAfterMs: 0,
    remaining: config.maxAttempts - next.attempts.length,
  };
}

/** Reset the counter for an action (e.g. after a successful login). */
export function resetRateLimit(action: RateLimitedAction, userId: string): void {
  const key = storageKey(action, userId);
  memoryBuckets.delete(key);
  if (Platform.OS !== 'web') {
    void AsyncStorage.removeItem(key).catch(() => {});
  }
}

async function persistBucket(key: string, bucket: Bucket): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await AsyncStorage.setItem(key, JSON.stringify(bucket));
  } catch {
    // Best-effort persistence — in-memory state still enforces the limit.
  }
}

/**
 * Hydrate persisted buckets from AsyncStorage on app launch.
 * Call once during app initialisation.
 */
export async function hydrateRateLimits(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const keys = await AsyncStorage.getAllKeys();
    const rateLimitKeys = keys.filter((k) => k.startsWith(STORAGE_KEY_PREFIX));
    const pairs = await AsyncStorage.multiGet(rateLimitKeys);
    for (const [key, value] of pairs) {
      if (!key || !value) continue;
      try {
        const parsed = JSON.parse(value) as Bucket;
        if (parsed && Array.isArray(parsed.attempts)) {
          memoryBuckets.set(key, parsed);
        }
      } catch {
        // Ignore corrupt entries.
      }
    }
  } catch {
    // Best-effort hydration.
  }
}

/**
 * Format `retryAfterMs` into a human-readable duration string.
 */
export function formatRetryDelay(retryAfterMs: number): string {
  if (retryAfterMs <= 0) return 'now';
  const seconds = Math.ceil(retryAfterMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes}m`;
}
