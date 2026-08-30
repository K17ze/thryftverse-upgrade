import { useEffect, useRef } from 'react';

const marks = new Map<string, number>();
const milestones = new Map<string, Map<string, number>>();

export type ReadinessMilestone =
  | 'mounted'
  | 'data-ready'
  | 'first-media'
  | 'interaction-ready';

export const MILESTONE_ORDER: ReadinessMilestone[] = [
  'mounted',
  'data-ready',
  'first-media',
  'interaction-ready',
];

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export function markVisuallyComplete(surface: string): void {
  const ts = now();
  marks.set(surface, ts);
  if (__DEV__) {
    console.info(`[visually-complete] ${surface}: ${ts.toFixed(1)}ms`);
  }
}

/** Report a specific readiness milestone for a surface. */
export function markMilestone(surface: string, milestone: ReadinessMilestone): void {
  if (!milestones.has(surface)) milestones.set(surface, new Map());
  const surfaceMilestones = milestones.get(surface)!;
  if (surfaceMilestones.has(milestone)) return;
  surfaceMilestones.set(milestone, now());
  if (__DEV__) {
    console.info(`[visually-complete] ${surface} → ${milestone}: ${now().toFixed(1)}ms`);
  }
}

/** Get the timestamp for a specific milestone, or undefined if not yet reached. */
export function getMilestone(surface: string, milestone: ReadinessMilestone): number | undefined {
  return milestones.get(surface)?.get(milestone);
}

/** Check whether a surface has reached a given milestone. */
export function isReady(surface: string, milestone: ReadinessMilestone): boolean {
  return milestones.get(surface)?.has(milestone) ?? false;
}

/**
 * Legacy hook — marks the surface as visually complete on mount.
 * Kept for backward compatibility. Prefer useReadiness for new surfaces.
 */
export function useVisuallyComplete(surface: string): void {
  useEffect(() => {
    markMilestone(surface, 'mounted');
    markVisuallyComplete(surface);
  }, [surface]);
}

/**
 * Enhanced hook — reports the 'mounted' milestone on mount, and exposes
 * a stable `report` callback that the surface can call when data/media/
 * interaction readiness events occur.
 *
 * Usage:
 *   const report = useReadiness('Discover');
 *   // when data loads:
 *   report('data-ready');
 *   // when first image decodes:
 *   report('first-media');
 *   // when controls are enabled:
 *   report('interaction-ready');
 */
export function useReadiness(surface: string): (milestone: ReadinessMilestone) => void {
  useEffect(() => {
    markMilestone(surface, 'mounted');
    markVisuallyComplete(surface);
  }, [surface]);

  const report = useRef((milestone: ReadinessMilestone) => {
    markMilestone(surface, milestone);
  }).current;

  return report;
}

/** Clear milestones for a surface (e.g. on refresh or unmount). */
export function resetMilestones(surface: string): void {
  milestones.delete(surface);
}
