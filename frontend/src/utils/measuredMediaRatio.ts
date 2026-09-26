/**
 * Measured Media Ratio — session-scoped geometry feedback for masonry grids.
 *
 * The Pinterest approach to honest masonry: when a feed row carries no
 * server-provided media geometry (no mediaAspectRatio/mediaWidth/mediaHeight
 * and no processed `media[]` record dims — e.g. the /recommendations For-You
 * feed, which does not join `listing_images`), the tile still reserves the
 * honest 3:4 portrait frame, renders, and lets the image decode. The first
 * successful `onLoad` reports the real pixel dimensions here; subscribed
 * tiles re-render with the measured ratio and FlashList's masonry layout
 * re-packs, so column heights diverge into a true stagger instead of a
 * uniform 2-column grid.
 *
 * Rules (AGENTS.md §11 — truthful UI):
 *   - Never fabricate: only decoded pixel dimensions are recorded, through
 *     the same 0.55–1.8 clamp as server geometry (`normalizeMediaAspectRatio`).
 *   - Server truth always wins: callers must not report measurements for
 *     rows that already carry geometry (`hasServerListingMediaGeometry`).
 *   - Measure once: a recorded ratio is never overwritten; repeated onLoad
 *     events for the same key are no-ops (no measure → render loops).
 *   - Session persistence: the Map lives for the app session, so a tile
 *     recycled or revisited later renders its real ratio on first paint.
 *   - No layout thrash: notifications are coalesced into one microtask so a
 *     first-viewport burst of image loads produces a single render pass /
 *     masonry re-pack rather than N sequential reflows.
 *
 * Keys are the rendered unit's stable id (`listing.id` for listing tiles,
 * `unit.id` for look/poster units). The cache is media-agnostic — any
 * surface may share it.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { normalizeMediaAspectRatio } from './listingMediaGeometry';

/** listingId/unitId → measured width÷height, normalized through the clamp. */
const ratios = new Map<string, number>();
/** key → subscribers (normally a single rendered tile). */
const listeners = new Map<string, Set<() => void>>();
/** Listeners scheduled for the next microtask flush. */
let pendingNotify: Set<() => void> | null = null;
let flushScheduled = false;

function notifyKey(key: string): void {
  const subs = listeners.get(key);
  if (!subs || subs.size === 0) return;
  if (!pendingNotify) pendingNotify = new Set();
  subs.forEach((cb) => pendingNotify!.add(cb));
  if (flushScheduled) return;
  flushScheduled = true;
  // Coalesce a burst of near-simultaneous image loads (the first viewport
  // decodes ~6–10 covers together) into one notification round, so React
  // batches the tile re-renders into a single FlashList re-pack.
  void Promise.resolve().then(() => {
    flushScheduled = false;
    const batch = pendingNotify;
    pendingNotify = null;
    batch?.forEach((cb) => cb());
  });
}

/**
 * Record the decoded pixel geometry for a media unit. Idempotent per key —
 * the first valid measurement wins and later reports are ignored. Values
 * that fail validation (non-finite, non-positive, or outside the shared
 * 0.55–1.8 clamp) are dropped rather than clamped into a lie.
 */
export function recordMeasuredMediaRatio(
  key: string | null | undefined,
  width: unknown,
  height: unknown,
): void {
  if (!key || ratios.has(key)) return;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return;
  }
  const ratio = normalizeMediaAspectRatio(width / height);
  if (ratio == null) return;
  ratios.set(key, ratio);
  notifyKey(key);
}

/** The measured ratio for a key, or null when nothing has been recorded. */
export function getMeasuredMediaRatio(key: string | null | undefined): number | null {
  if (!key) return null;
  return ratios.get(key) ?? null;
}

/**
 * Subscribe to measurements for one key. Returns the unsubscribe function.
 * Keyed subscriptions keep re-renders local — a tile re-renders only when
 * ITS media resolves, never on unrelated measurements.
 */
export function subscribeMeasuredMediaRatio(
  key: string,
  onChange: () => void,
): () => void {
  let subs = listeners.get(key);
  if (!subs) {
    subs = new Set();
    listeners.set(key, subs);
  }
  subs.add(onChange);
  return () => {
    subs.delete(onChange);
    if (subs.size === 0) listeners.delete(key);
  };
}

/**
 * React hook: the session-measured aspect ratio for a media unit, or null.
 * Pass a null key to opt out (no subscription) — e.g. when server geometry
 * or an explicit reservation already decides the frame.
 */
export function useMeasuredMediaRatio(key: string | null | undefined): number | null {
  const subscribe = useCallback(
    (onChange: () => void) =>
      key ? subscribeMeasuredMediaRatio(key, onChange) : () => {},
    [key],
  );
  const getSnapshot = useCallback(() => getMeasuredMediaRatio(key), [key]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/** Test hook — clears the session cache. Production code never calls this. */
export function resetMeasuredMediaRatios(): void {
  ratios.clear();
}
