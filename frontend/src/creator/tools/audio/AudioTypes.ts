/**
 * AudioTypes — contracts for the creator audio browser.
 *
 * Per AGENTS.md §11 (truthful UI): the audio library backend does not yet
 * exist, so the browser presents an honest empty state rather than a
 * fabricated song list. These types describe the shape a future library
 * track will take so the composition layer can consume audio config without
 * coupling to the browser's internal state.
 */

/**
 * A resolved audio track ready for composition layer creation.
 *
 * `sourceType` distinguishes where the audio originates:
 *  - `library`   — a curated sound from the (future) audio library
 *  - `original`  — the video's own recorded audio track
 *  - `voiceover` — a creator-recorded voiceover clip
 *
 * No fabricated instances of this type are rendered in the UI today.
 */
export interface AudioTrack {
  id: string;
  title: string;
  artist?: string;
  durationMs: number;
  uri: string;
  sourceType: 'library' | 'original' | 'voiceover';
  /** Cached waveform samples (0..1 normalized amplitudes). Populated
   *  by the WaveformExtractor when the track is loaded. */
  waveform?: number[];
}

/**
 * Audio configuration applied to a composition.
 *
 *  - `trackId`         — selected library/voiceover track id, or null when
 *                        only original video audio is used.
 *  - `volume`          — mix volume for the selected track (0.0–1.0).
 *  - `startOffsetMs`   — offset into the track where playback begins
 *                        (0 to track duration). Clamped to the track's
 *                        duration when applied.
 *  - `originalVolume`  — mix volume for the video's original audio
 *                        (0.0–1.0). 0 mutes original audio entirely.
 */
export interface AudioConfig {
  trackId: string | null;
  volume: number;        // 0.0-1.0
  startOffsetMs: number; // 0 to track duration
  originalVolume: number; // 0.0-1.0 for original video audio
  // Audio fade (P1). Smooth volume ramp at start/end of the track.
  fadeInMs: number;      // 0 to track duration
  fadeOutMs: number;     // 0 to track duration
  // Audio ducking (P1). When enabled, the original/background audio is
  // automatically lowered when a voiceover or priority track is active.
  duckingEnabled?: boolean;
  /** 0..1 — how much to lower original audio when the track plays.
   *  0 = fully mute original, 1 = no change. Default: 0.3 */
  duckingLevel?: number;
  // ── Timeline integration (spec 09 §10 P0) ──
  // Trim: where in the source track playback starts/ends. When absent,
  // the full track (from startOffsetMs) is used.
  trimStartMs?: number;
  trimEndMs?: number;
}

/**
 * Default audio config: no library track, full original audio volume.
 */
export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  trackId: null,
  volume: 1,
  startOffsetMs: 0,
  originalVolume: 1,
  fadeInMs: 0,
  fadeOutMs: 0,
};
