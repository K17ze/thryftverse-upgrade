import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

// ============================================================================
// Visit-scoped visual-completion instrumentation
// ============================================================================
// Each route focus/visit gets a unique visit ID. Milestone timestamps are
// tracked per visit (`${surface}#${visitId}`) so navigating away and back
// starts a fresh measurement instead of reusing stale mount-time data.
//
// `visually-complete` is DERIVED, never asserted on mount: it is recorded
// only after every milestone in the surface's required set has been hit.
// Surfaces report real lifecycle events through the `report` callback:
//
//   mounted            — screen mounted (JS execution started)
//   data-ready         — critical data loaded (or terminally failed)
//   first-media        — first image/media decoded on screen
//   interaction-ready  — controls are interactive
//   visually-complete  — all required milestones achieved (auto-derived)
// ============================================================================

export type ReadinessMilestone =
  | 'mounted'
  | 'data-ready'
  | 'first-media'
  | 'interaction-ready'
  | 'visually-complete';

export const MILESTONE_ORDER: ReadinessMilestone[] = [
  'mounted',
  'data-ready',
  'first-media',
  'interaction-ready',
  'visually-complete',
];

/**
 * Default required milestones for visual completion. `first-media` is
 * intentionally NOT required by default — media-free or video-first feeds
 * may never decode an image, and gating completion on a milestone a surface
 * legitimately cannot produce would leave it permanently incomplete.
 * Surfaces that always render imagery can opt in via
 * `useReadiness(surface, { required: [...] })` or `setRequiredMilestones`.
 */
export const DEFAULT_REQUIRED_MILESTONES: readonly ReadinessMilestone[] = [
  'data-ready',
  'interaction-ready',
];

interface VisitRecord {
  id: string;
  surface: string;
  startedAt: number;
  ended: boolean;
}

const visits = new Map<string, VisitRecord>();
const currentVisits = new Map<string, string>(); // surface -> active visitId
const marks = new Map<string, number>(); // visitKey (or legacy surface) -> completion ts
const milestones = new Map<string, Map<ReadinessMilestone, number>>(); // visitKey -> milestone -> ts
const requiredMilestones = new Map<string, readonly ReadinessMilestone[]>();

let visitSeq = 0;
/** Bounded history — ended visits are pruned FIFO so long sessions don't
 *  accumulate per-visit milestone maps indefinitely. */
const MAX_TRACKED_VISITS = 200;

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function visitKey(surface: string, visitId: string): string {
  return `${surface}#${visitId}`;
}

/** Resolve the storage key for a surface + optional visit. Without an
 *  explicit visit ID the surface's current visit is used; if no visit is
 *  active (e.g. non-hook callers) the legacy surface-scoped bucket applies. */
function resolveKey(surface: string, visitId?: string): string {
  const id = visitId ?? currentVisits.get(surface);
  return id ? visitKey(surface, id) : surface;
}

function pruneVisitHistory(): void {
  while (visits.size > MAX_TRACKED_VISITS) {
    const oldestId = visits.keys().next().value;
    if (oldestId === undefined) return;
    const record = visits.get(oldestId)!;
    // The FIFO head is always an ended visit — the current visit is the
    // most recently inserted entry.
    visits.delete(oldestId);
    const key = visitKey(record.surface, oldestId);
    milestones.delete(key);
    marks.delete(key);
  }
}

// ============================================================================
// VISIT LIFECYCLE
// ============================================================================

/**
 * Begin a new visit for a surface. Returns the unique visit ID and makes it
 * the surface's current visit. Called automatically by `useVisitId` /
 * `useReadiness` on route focus; exposed for non-hook instrumentation.
 */
export function beginVisit(surface: string): string {
  const id = `v${++visitSeq}`;
  visits.set(id, { id, surface, startedAt: now(), ended: false });
  currentVisits.set(surface, id);
  pruneVisitHistory();
  return id;
}

/**
 * End a visit (on unmount or route change). Without an explicit visit ID the
 * surface's current visit is ended. Recorded milestone data is retained for
 * telemetry until pruned by history limits or `resetMilestones`.
 */
export function endVisit(surface: string, visitId?: string): void {
  const id = visitId ?? currentVisits.get(surface);
  if (!id) return;
  const record = visits.get(id);
  if (record) record.ended = true;
  if (currentVisits.get(surface) === id) currentVisits.delete(surface);
}

/** The surface's currently active visit ID, or undefined when no visit is
 *  in progress (navigated away / never mounted). */
export function getCurrentVisitId(surface: string): string | undefined {
  return currentVisits.get(surface);
}

/** Whether a visit has ended (or is unknown). */
export function isVisitEnded(visitId: string): boolean {
  return visits.get(visitId)?.ended ?? true;
}

/** Configure which milestones a surface must achieve before it is recorded
 *  as visually complete. `visually-complete` itself is ignored if passed. */
export function setRequiredMilestones(
  surface: string,
  required: readonly ReadinessMilestone[],
): void {
  requiredMilestones.set(
    surface,
    required.filter((m) => m !== 'visually-complete'),
  );
}

// ============================================================================
// MARKING
// ============================================================================

function recordCompletion(
  surface: string,
  key: string,
  visitMilestones: Map<ReadinessMilestone, number>,
): void {
  const ts = now();
  marks.set(key, ts);
  // Surface-level mirror so legacy `surface`-keyed readers see the latest
  // visit's completion time.
  marks.set(surface, ts);
  visitMilestones.set('visually-complete', ts);
  if (__DEV__) {
    console.info(`[visually-complete] ${surface}: ${ts.toFixed(1)}ms`);
  }
}

function requiredFor(surface: string): readonly ReadinessMilestone[] {
  return requiredMilestones.get(surface) ?? DEFAULT_REQUIRED_MILESTONES;
}

function missingRequired(
  surface: string,
  visitMilestones: Map<ReadinessMilestone, number> | undefined,
): ReadinessMilestone[] {
  return requiredFor(surface).filter((m) => !visitMilestones?.has(m));
}

function maybeComplete(
  surface: string,
  key: string,
  visitMilestones: Map<ReadinessMilestone, number>,
): void {
  if (marks.has(key)) return;
  if (missingRequired(surface, visitMilestones).length > 0) return;
  recordCompletion(surface, key, visitMilestones);
}

/**
 * Mark the surface visually complete for the given (or current) visit.
 *
 * GATED: this is a no-op until every milestone in the surface's required
 * set has been reported. Mount alone never completes a visit — callers must
 * report real readiness via `markMilestone` / the `report` callback.
 */
export function markVisuallyComplete(surface: string, visitId?: string): void {
  const key = resolveKey(surface, visitId);
  if (marks.has(key)) return;
  const visitMilestones = milestones.get(key);
  const missing = missingRequired(surface, visitMilestones);
  if (missing.length > 0) {
    if (__DEV__) {
      console.warn(
        `[visually-complete] ${surface}: completion ignored — missing required milestones: ${missing.join(', ')}`,
      );
    }
    return;
  }
  let mm = visitMilestones;
  if (!mm) {
    mm = new Map();
    milestones.set(key, mm);
  }
  recordCompletion(surface, key, mm);
}

/**
 * Report a specific readiness milestone for a surface's visit. First report
 * wins — subsequent reports of the same milestone in the same visit are
 * ignored. When the last required milestone lands, `visually-complete` is
 * recorded automatically.
 *
 * Passing `'visually-complete'` delegates to `markVisuallyComplete` (gated).
 */
export function markMilestone(
  surface: string,
  milestone: ReadinessMilestone,
  visitId?: string,
): void {
  if (milestone === 'visually-complete') {
    markVisuallyComplete(surface, visitId);
    return;
  }
  const key = resolveKey(surface, visitId);
  let visitMilestones = milestones.get(key);
  if (!visitMilestones) {
    visitMilestones = new Map();
    milestones.set(key, visitMilestones);
  }
  if (visitMilestones.has(milestone)) return;
  const ts = now();
  visitMilestones.set(milestone, ts);
  if (__DEV__) {
    console.info(`[visually-complete] ${surface} → ${milestone}: ${ts.toFixed(1)}ms`);
  }
  maybeComplete(surface, key, visitMilestones);
}

// ============================================================================
// READS
// ============================================================================

/** Get the timestamp for a specific milestone in a visit, or undefined if
 *  not yet reached. Defaults to the surface's current visit. */
export function getMilestone(
  surface: string,
  milestone: ReadinessMilestone,
  visitId?: string,
): number | undefined {
  return milestones.get(resolveKey(surface, visitId))?.get(milestone);
}

/** Check whether a surface's visit has reached a given milestone. Defaults
 *  to the current visit. */
export function isReady(
  surface: string,
  milestone: ReadinessMilestone,
  visitId?: string,
): boolean {
  return milestones.get(resolveKey(surface, visitId))?.has(milestone) ?? false;
}

/** Completion timestamp for a visit (or the surface's latest completed
 *  visit). Undefined when the visit has not completed. */
export function getCompletionTime(surface: string, visitId?: string): number | undefined {
  if (visitId) return marks.get(visitKey(surface, visitId));
  const current = currentVisits.get(surface);
  if (current) return marks.get(visitKey(surface, current));
  return marks.get(surface);
}

/** Clear milestone + completion data for a surface's current visit (or an
 *  explicit visit). Also clears the legacy surface-scoped buckets when no
 *  visit ID is given. */
export function resetMilestones(surface: string, visitId?: string): void {
  const key = resolveKey(surface, visitId);
  milestones.delete(key);
  marks.delete(key);
  if (!visitId) {
    milestones.delete(surface);
    marks.delete(surface);
  }
}

// ============================================================================
// HOOKS
// ============================================================================

export interface ReadinessOptions {
  /**
   * Milestones that must be achieved before the visit is recorded as
   * visually complete. Defaults to `DEFAULT_REQUIRED_MILESTONES`
   * (`['data-ready', 'interaction-ready']`).
   */
  required?: readonly ReadinessMilestone[];
}

/**
 * Per-visit identity for a surface. A new visit begins on each route focus
 * (including first mount) and ends on blur/unmount — navigating away and
 * returning starts fresh timing. The returned ID is stable for the lifetime
 * of the visit; the hook never triggers re-renders.
 *
 * Requires a navigation context (`useFocusEffect`). All instrumented
 * surfaces are screens or screen children inside navigators.
 */
function useVisitRef(surface: string): React.MutableRefObject<string | null> {
  const visitIdRef = useRef<string | null>(null);
  // beginVisit() mutates module-level visit state — a side effect, so it
  // must never run during render. The focus effect owns the lifecycle: on
  // focus (including first mount) it begins the visit, and on refocus it
  // replaces an ended visit so it never leaks across visits.
  useFocusEffect(
    useCallback(() => {
      if (
        visitIdRef.current === null
        || isVisitEnded(visitIdRef.current)
        || currentVisits.get(surface) !== visitIdRef.current
      ) {
        visitIdRef.current = beginVisit(surface);
      }
      const id = visitIdRef.current;
      return () => {
        endVisit(surface, id);
      };
    }, [surface]),
  );
  // Passive fallback: when no navigation focus callback ever fires (a
  // surface instrumented outside a navigator), begin the visit on mount.
  // Inside a navigator the focus effect above already ran, so the null
  // check makes this a no-op.
  useEffect(() => {
    if (visitIdRef.current === null) {
      visitIdRef.current = beginVisit(surface);
    }
  }, [surface]);
  return visitIdRef;
}

/** Public visit-identity hook — returns the surface's active visit ID, or
 *  null before the first focus/mount effect has begun the visit. The hook
 *  never triggers re-renders, so render-phase consumers must tolerate the
 *  initial null. */
export function useVisitId(surface: string): string | null {
  return useVisitRef(surface).current;
}

/**
 * Enhanced readiness hook — begins a visit on route focus, reports the
 * 'mounted' milestone, and exposes a stable `report` callback the surface
 * calls when data/media/interaction readiness events occur. Completion is
 * derived automatically once every required milestone is hit; mount alone
 * never completes the visit.
 *
 * Usage:
 *   const report = useReadiness('Discover');
 *   report('data-ready');         // when critical data loads
 *   report('first-media');        // when the first image/media decodes
 *   report('interaction-ready');  // when controls are interactive
 */
export function useReadiness(
  surface: string,
  options?: ReadinessOptions,
): (milestone: ReadinessMilestone) => void {
  const visitIdRef = useVisitRef(surface);
  // Ref-mirror the required set so the focus effect stays stable even when
  // the caller passes an inline array.
  const requiredRef = useRef(options?.required);
  requiredRef.current = options?.required;

  useFocusEffect(
    useCallback(() => {
      if (requiredRef.current) {
        setRequiredMilestones(surface, requiredRef.current);
      }
      markMilestone(surface, 'mounted', visitIdRef.current ?? undefined);
    }, [surface, visitIdRef]),
  );

  const report = useCallback(
    (milestone: ReadinessMilestone) => {
      markMilestone(surface, milestone, visitIdRef.current ?? undefined);
    },
    [surface, visitIdRef],
  );

  return report;
}

/**
 * Legacy entry point — now visit-scoped and milestone-gated. Marks
 * 'mounted' on route focus and returns the same `report` callback as
 * `useReadiness` so the surface can report real readiness. It does NOT
 * auto-complete: `visually-complete` is recorded only once the surface's
 * required milestones are achieved.
 */
export function useVisuallyComplete(
  surface: string,
  options?: ReadinessOptions,
): (milestone: ReadinessMilestone) => void {
  return useReadiness(surface, options);
}
