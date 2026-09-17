/**
 * Audio core module — barrel export for the ThryftVerse creator audio system.
 *
 * Per spec 09_POSTER_TIMELINE_CAMERA_AUDIO §10:
 *  P0: source clip volume, music track, mute, offset/trim, fades
 *  P1: real waveform extraction, voiceover, ducking
 *
 * Usage:
 *   import { extractWaveform, computeVolumeAtTime } from '../core/audio';
 */

// ── Waveform extraction ──────────────────────────────────────────────
export {
  extractWaveform,
  clearWaveformCache,
  type WaveformData,
} from './WaveformExtractor';

// ── Audio mixing ─────────────────────────────────────────────────────
// Only the volume-at-time fade computation is exported — it is consumed
// by CreatorCanvas for fade-in/out preview parity with export's afade
// filters. The wider mix API (ducking, mix curves) lives in AudioMixer
// for the future multi-track audio surface.
export {
  computeVolumeAtTime,
} from './AudioMixer';
