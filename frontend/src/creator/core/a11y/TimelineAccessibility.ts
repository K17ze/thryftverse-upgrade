/**
 * TimelineAccessibility — timeline-specific accessibility label generators
 * and announcement helpers for the ThryftVerse creator timeline.
 *
 * Provides descriptive, screen-reader-friendly labels for:
 *   - Clips (index, duration, start position)
 *   - Transitions (type, duration)
 *   - Playhead (current position, total duration)
 *   - Timeline accessibility actions (scrub, jump, select)
 *
 * Also provides `announceTimelineChange` which uses
 * `AccessibilityInfo.announceForAccessibility` to speak timeline state
 * changes to VoiceOver / TalkBack users.
 *
 * Per AGENTS.md §18: accessibility is a first-class requirement.
 * Pattern follows CanvasAccessibilityLabels.ts.
 */

import { AccessibilityInfo } from 'react-native';
import type { PosterClip, Transition } from '../../poster/timeline/TimelineTypes';

// ── Types ─────────────────────────────────────────────────────────────

/**
 * Accessibility action descriptor for the `accessibilityActions` prop.
 * Mirrors the React Native `AccessibilityActionInfo` shape but defined
 * locally to avoid coupling to the platform type name.
 */
interface AccessibilityActionDescriptor {
  name: string;
  label: string;
}

// ── Clip labels ───────────────────────────────────────────────────────

/**
 * Generate a descriptive accessibility label for a timeline clip.
 *
 * Format: "Clip {index} of {total}, {duration} seconds, starting at {start} seconds"
 *
 * Example: "Clip 2 of 5, 3.2 seconds, starting at 1.5 seconds"
 *
 * @param clip     The clip to label.
 * @param index    Zero-based index of the clip in the timeline.
 * @param total    Total number of clips in the timeline.
 * @param startMs  Absolute start position of this clip in the timeline (ms).
 *                 If omitted, the start is computed from preceding clips.
 */
export function getClipAccessibilityLabel(
  clip: PosterClip,
  index: number,
  total: number,
  startMs?: number,
): string {
  const position = index + 1;
  const durationSec = (clip.durationMs / 1000).toFixed(1);
  const startSec = ((startMs ?? 0) / 1000).toFixed(1);
  return `Clip ${position} of ${total}, ${durationSec} seconds, starting at ${startSec} seconds`;
}

// ── Transition labels ─────────────────────────────────────────────────

/**
 * Capitalize the first letter of a transition type name.
 */
function capitalizeType(type: string): string {
  if (type.length === 0) return type;
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Generate a descriptive accessibility label for a transition between clips.
 *
 * Format: "{Type} transition, {duration} seconds"
 *
 * Example: "Fade transition, 0.5 seconds"
 *
 * @param transition The transition to label.
 */
export function getTransitionAccessibilityLabel(transition: Transition): string {
  const typeName = capitalizeType(transition.type);
  const durationSec = (transition.durationMs / 1000).toFixed(1);
  return `${typeName} transition, ${durationSec} seconds`;
}

// ── Playhead labels ───────────────────────────────────────────────────

/**
 * Generate a descriptive accessibility label for the playhead position.
 *
 * Format: "Playhead at {current} seconds of {total} seconds"
 *
 * Example: "Playhead at 2.3 seconds of 10 seconds"
 *
 * @param currentTimeMs Current playhead position in milliseconds.
 * @param durationMs    Total timeline duration in milliseconds.
 */
export function getPlayheadAccessibilityLabel(
  currentTimeMs: number,
  durationMs: number,
): string {
  const currentSec = (currentTimeMs / 1000).toFixed(1);
  const totalSec = (durationMs / 1000).toFixed(1);
  return `Playhead at ${currentSec} seconds of ${totalSec} seconds`;
}

// ── Accessibility actions ─────────────────────────────────────────────

/**
 * Timeline accessibility actions for use with the `accessibilityActions`
 * prop on the timeline container. These let screen-reader users perform
 * timeline gestures without needing to find and drag the playhead.
 *
 * Actions:
 *   - scrubLeft  — move the playhead left by a small increment
 *   - scrubRight — move the playhead right by a small increment
 *   - jumpToStart — move the playhead to the beginning of the timeline
 *   - jumpToEnd   — move the playhead to the end of the timeline
 *   - selectNextClip     — select the clip after the current playhead position
 *   - selectPreviousClip — select the clip before the current playhead position
 */
export const TIMELINE_ACCESSIBILITY_ACTIONS: readonly AccessibilityActionDescriptor[] = [
  { name: 'scrubLeft', label: 'Scrub left' },
  { name: 'scrubRight', label: 'Scrub right' },
  { name: 'jumpToStart', label: 'Jump to start' },
  { name: 'jumpToEnd', label: 'Jump to end' },
  { name: 'selectNextClip', label: 'Select next clip' },
  { name: 'selectPreviousClip', label: 'Select previous clip' },
] as const;

/**
 * Type for timeline accessibility action names.
 */
export type TimelineAccessibilityActionName =
  (typeof TIMELINE_ACCESSIBILITY_ACTIONS)[number]['name'];

/**
 * Get the timeline accessibility actions array for use with the
 * `accessibilityActions` prop.
 */
export function getTimelineAccessibilityActions(): AccessibilityActionDescriptor[] {
  return [...TIMELINE_ACCESSIBILITY_ACTIONS];
}

/**
 * Handle a timeline accessibility action event.
 * Returns the action name to perform, or null if unrecognized.
 */
export function handleTimelineAccessibilityAction(
  event: { actionName?: string },
): TimelineAccessibilityActionName | null {
  const actionName = event.actionName as TimelineAccessibilityActionName | undefined;
  if (actionName && TIMELINE_ACCESSIBILITY_ACTIONS.some((a) => a.name === actionName)) {
    return actionName;
  }
  return null;
}

// ── Announcements ─────────────────────────────────────────────────────

/**
 * Announce a timeline state change to screen-reader users via
 * `AccessibilityInfo.announceForAccessibility`.
 *
 * This is used to communicate meaningful timeline transitions: playhead
 * jumps, clip selection, split/trim operations, playback start/stop.
 *
 * @param message The message to announce.
 */
export function announceTimelineChange(message: string): void {
  try {
    AccessibilityInfo.announceForAccessibility(message);
  } catch {
    // AccessibilityInfo may be unavailable on some platforms — no-op.
  }
}
