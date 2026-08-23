/**
 * Video subsystem barrel exports.
 *
 * The VideoManager is a singleton player pool that replaces per-component
 * `useVideoPlayer` instances with a shared, viewport-aware pool. This
 * module is the entry point for all video playback management.
 */

export { VideoManager } from './VideoManager';
export type {
  ViewportEntry,
  VideoQoESession as VideoQoESessionFromManager,
} from './VideoManager';
export type {
  VideoQoESession,
  VideoQoELiveEvent,
  VideoSurface,
  SlotRole,
} from './qoeSchema';
