/**
 * Audio tools — extracted audio browser for the creator department.
 *
 * Per AGENTS.md §11 (truthful UI): the audio library backend does not yet
 * exist, so the browser surfaces an honest empty state rather than a
 * fabricated song list.
 */
export { AudioBrowserSheet } from './AudioBrowserSheet';
export type { AudioBrowserSheetProps } from './AudioBrowserSheet';
export {
  type AudioTrack,
  type AudioConfig,
  DEFAULT_AUDIO_CONFIG,
} from './AudioTypes';
