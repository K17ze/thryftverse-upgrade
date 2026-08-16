// Barrel export for the Poster timeline foundation.
// Genuine video timeline editor model + UI components.

export type {
  TimeRange,
  PosterClip,
  OverlayLayer,
  TimelineState,
  TimelineOperation,
} from './TimelineTypes';

export {
  computeTotalDuration,
  formatTimecode,
} from './TimelineTypes';

export { TimelineTrack } from './TimelineTrack';
export type { TimelineTrackProps } from './TimelineTrack';

export { ClipThumb } from './ClipThumb';
export type { ClipThumbProps } from './ClipThumb';

export { Playhead } from './Playhead';
export type { PlayheadProps } from './Playhead';

export { OverlayTrack } from './OverlayTrack';
export type { OverlayTrackProps } from './OverlayTrack';

export { TimelineToolbar } from './TimelineToolbar';
export type { TimelineToolbarProps } from './TimelineToolbar';

export { TimelineRuler } from './TimelineRuler';
export type { TimelineRulerProps } from './TimelineRuler';

export { WaveformTrack } from './WaveformTrack';
export type { WaveformTrackProps } from './WaveformTrack';
