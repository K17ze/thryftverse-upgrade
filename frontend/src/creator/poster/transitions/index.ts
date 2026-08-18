// Barrel export for the Poster transitions module.
// Frame-to-frame transition types, built-in preset catalog, and the
// horizontal preview rail used in the Poster composer.

export type {
  TransitionType,
  TransitionPreset,
  FrameTransition,
} from './TransitionTypes';

export { TRANSITION_PRESETS, getPresetById } from './TransitionPresets';

export { TransitionPreviewRail } from './TransitionPreviewRail';
export type { TransitionPreviewRailProps } from './TransitionPreviewRail';
