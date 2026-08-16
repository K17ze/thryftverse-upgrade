/**
 * Audio core module — barrel export for the ThryftVerse creator audio system.
 *
 * Per spec 09_POSTER_TIMELINE_CAMERA_AUDIO §10:
 *  P0: source clip volume, music track, mute, offset/trim, fades
 *  P1: real waveform extraction, voiceover, ducking
 *
 * Usage:
 *   import { extractWaveform, computeVolumeAtTime, VoiceoverRecorder } from '../core/audio';
 */

// ── Waveform extraction ──────────────────────────────────────────────
export {
  extractWaveform,
  clearWaveformCache,
  type WaveformData,
} from './WaveformExtractor';

// ── Audio mixing ─────────────────────────────────────────────────────
export {
  computeVolumeAtTime,
  applyDucking,
  computeMixedVolume,
  generateVolumeCurve,
  createDefaultMixState,
  createDefaultDuckingConfig,
  type AudioMixState,
  type DuckingConfig,
} from './AudioMixer';

// ── Voiceover recording ──────────────────────────────────────────────
export {
  VoiceoverRecorder,
  VoiceoverDependencyError,
  type VoiceoverClip,
} from './VoiceoverRecorder';
