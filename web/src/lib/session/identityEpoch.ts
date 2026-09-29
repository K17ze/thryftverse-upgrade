'use client';

/**
 * Session-identity epoch — the sequencing primitive that keeps async
 * hydration writes honest across login / logout / session-expiry.
 *
 * The problem this solves: `hydrateSavedLists`/`hydrateFollows` resolve
 * *after* `fetchMe`. If the identity changes while the read is in flight
 * (logout, expiry, a different account signing in), the late resolution
 * would setState another account's truth onto the current session.
 * Every hydration captures `sessionEpoch()` + the user id at call time;
 * `sessionIdentityIsCurrent` vetoes the write when either moved on.
 *
 * `markSessionIdentity` also persists the last resolved user id so a
 * reload can tell "same account came back" (keep local slices) from "a
 * different account resolved" (reset slices before hydrating).
 */

const MARKER_KEY = 'thryftverse.web.account-identity';

/** This-mount resolved user id. `undefined` = unresolved, `null` = guest. */
let resolvedUserId: string | null | undefined;
let epoch = 0;

function readMarker(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(MARKER_KEY);
  } catch {
    return null;
  }
}

function writeMarker(userId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (userId) window.localStorage.setItem(MARKER_KEY, userId);
    else window.localStorage.removeItem(MARKER_KEY);
  } catch {
    // Storage full/blocked — the epoch guard still protects this mount.
  }
}

/** Monotonic counter — bumps on every identity resolution/reset. */
export function sessionEpoch(): number {
  return epoch;
}

/** The user id this mount has resolved — `undefined` while unresolved. */
export function sessionUserId(): string | null | undefined {
  return resolvedUserId;
}

/** The last resolved identity across reloads (the persisted marker) —
 *  null when no account has resolved or the last resolution was guest.
 *  Storage namespaces use it so a reload hydrates the same account's
 *  bucket before the session re-resolves. */
export function persistedSessionUserId(): string | null {
  return readMarker();
}

/**
 * Record a resolved identity (or `null` for guest/expired). Returns true
 * when the resolved identity differs from the previous owner — meaning
 * persisted account slices and the query cache belong to someone else and
 * must be reset before any hydration writes land.
 *
 * Baseline is the identity resolved earlier this mount, falling back to
 * the persisted marker so a hard reload still detects an account switch.
 */
export function markSessionIdentity(userId: string | null): boolean {
  epoch += 1;
  const baseline = resolvedUserId !== undefined ? resolvedUserId : readMarker();
  resolvedUserId = userId;
  writeMarker(userId);
  return baseline !== undefined && baseline !== userId;
}

/**
 * True while `userId` is still the resolved identity AND no newer
 * resolution has happened since `capturedEpoch` — the late-write guard
 * every account hydration must pass before touching a store.
 */
export function sessionIdentityIsCurrent(
  userId: string,
  capturedEpoch: number,
): boolean {
  return epoch === capturedEpoch && resolvedUserId === userId;
}
