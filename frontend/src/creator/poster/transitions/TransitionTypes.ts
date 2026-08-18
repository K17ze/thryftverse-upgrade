/**
 * TransitionTypes — frame-to-frame transition model for the Poster composer.
 *
 * A Poster can be composed of multiple frames (pages) played in sequence as a
 * short video. The transition between two consecutive frames is described by
 * a {@link TransitionPreset} (the visual style + default duration) and a
 * {@link FrameTransition} instance (which preset is applied to a specific
 * frame pair, with an optional duration override).
 *
 * Design references:
 *   - AGENTS.md §17: motion is deliberate and bounded; transition durations
 *     stay within the 160–500ms band except for `cut` (0ms).
 *   - 09_VISUAL_SYSTEM: transitions are a creator tool, not a decorative
 *     effect — every preset maps to a real, renderable animation.
 */

import type { Ionicons } from '@expo/vector-icons';

/** The set of supported transition styles. */
export type TransitionType =
  | 'cut'
  | 'fade'
  | 'dissolve'
  | 'slide'
  | 'zoom'
  | 'wipe'
  | 'flash'
  | 'spin';

/**
 * A reusable transition definition. Presets are static catalog entries
 * surfaced by the {@link TransitionPreviewRail}; the user picks one to apply
 * to a frame boundary.
 */
export interface TransitionPreset {
  /** Stable unique id (matches the preset's type for the built-in set). */
  id: string;
  /** Visual style. */
  type: TransitionType;
  /** Human-readable label shown under the preview. */
  name: string;
  /** Default duration in milliseconds. `cut` is 0. */
  durationMs: number;
  /** Ionicons glyph used in the preview rail and the timeline strip. */
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

/**
 * The transition applied between two consecutive frames. `fromFrameId` and
 * `toFrameId` identify the boundary; `presetId` selects the style; the
 * duration may override the preset default.
 */
export interface FrameTransition {
  fromFrameId: string;
  toFrameId: string;
  presetId: string;
  durationMs: number;
}
