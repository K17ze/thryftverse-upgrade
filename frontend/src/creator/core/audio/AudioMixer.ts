/**
 * AudioMixer — audio mixing logic for the creator editor.
 *
 * Per spec 09_POSTER_TIMELINE_CAMERA_AUDIO §10:
 *  P0: source clip volume, music track, mute, offset/trim, fades
 *  P1: ducking (auto-lower background music when voiceover is active)
 *
 * This module provides pure functions for computing the instantaneous
 * volume of an audio track at a given timeline position, accounting for:
 *  - Base track volume
 *  - Fade in (linear ramp from 0 to baseVolume over fadeInMs)
 *  - Fade out (linear ramp from baseVolume to 0 over fadeOutMs at end)
 *  - Ducking (multiply by duckingLevel when a priority track is active)
 *
 * These functions are used by the playback engine and the waveform
 * visualization to render accurate amplitude representations.
 */

// ── Types ────────────────────────────────────────────────────────────

export type AudioMixState = {
  /** Master volume applied to the entire mix (0..1). */
  masterVolume: number;
  /** Per-track base volume (0..1), keyed by track ID. */
  trackVolumes: Map<string, number>;
  /** Per-track fade configuration, keyed by track ID. */
  fades: Map<string, { fadeInMs: number; fadeOutMs: number }>;
};

/**
 * Ducking configuration. When a priority track (e.g. voiceover) is active,
 * the background tracks are lowered by the ducking level.
 */
export type DuckingConfig = {
  /** Whether ducking is enabled. */
  enabled: boolean;
  /**
   * How much to lower the background audio when the priority track plays.
   * 0 = fully mute background, 1 = no change. Typical: 0.2–0.4.
   */
  level: number;
  /**
   * The track ID that triggers ducking (e.g. the voiceover track).
   * When this track is active, other tracks are ducked.
   */
  priorityTrackId: string | null;
  /** Fade time for ducking transitions in ms (smooth ramp). */
  fadeMs: number;
};

// ── Volume computation ───────────────────────────────────────────────

/**
 * Compute the volume of a single track at a given time, accounting for
 * fade in and fade out ramps.
 *
 * The fade in ramps linearly from 0 to baseVolume over fadeInMs starting
 * at time 0. The fade out ramps linearly from baseVolume to 0 over
 * fadeOutMs ending at durationMs.
 *
 * @param trackId      Track identifier (for future per-track logic).
 * @param timeMs       Current playback position in milliseconds.
 * @param durationMs   Total track duration in milliseconds.
 * @param baseVolume   The track's base volume (0..1).
 * @param fadeInMs     Fade-in duration in milliseconds.
 * @param fadeOutMs    Fade-out duration in milliseconds.
 * @returns The computed volume at the given time (0..baseVolume).
 */
export function computeVolumeAtTime(
  trackId: string,
  timeMs: number,
  durationMs: number,
  baseVolume: number,
  fadeInMs: number,
  fadeOutMs: number,
): number {
  // Track ID is accepted for future per-track logic (e.g. custom curves).
  void trackId;

  // Outside the track's time range → silence
  if (timeMs < 0 || timeMs >= durationMs) return 0;

  let volume = baseVolume;

  // Fade in: linear ramp from 0 → baseVolume over [0, fadeInMs]
  if (fadeInMs > 0 && timeMs < fadeInMs) {
    const fadeProgress = timeMs / fadeInMs;
    volume = baseVolume * fadeProgress;
  }

  // Fade out: linear ramp from baseVolume → 0 over [duration - fadeOut, duration]
  if (fadeOutMs > 0 && timeMs > durationMs - fadeOutMs) {
    const fadeProgress = (durationMs - timeMs) / fadeOutMs;
    volume = Math.min(volume, baseVolume * Math.max(0, fadeProgress));
  }

  return Math.max(0, Math.min(baseVolume, volume));
}

/**
 * Compute the ducked volume for a background track, given the ducking
 * configuration and whether the priority track is currently active.
 *
 * When the priority track is active and ducking is enabled, the background
 * track volume is multiplied by the ducking level (e.g. 0.3 means the
 * background is lowered to 30% of its current volume).
 *
 * @param baseVolume      The background track's current volume (post-fade).
 * @param ducking         The ducking configuration.
 * @param priorityActive  Whether the priority (voiceover) track is active.
 * @returns The ducked volume (0..baseVolume).
 */
export function applyDucking(
  baseVolume: number,
  ducking: DuckingConfig,
  priorityActive: boolean,
): number {
  if (!ducking.enabled || !priorityActive || ducking.priorityTrackId === null) {
    return baseVolume;
  }
  // duckingLevel: 0 = mute background, 1 = no change
  return baseVolume * ducking.level;
}

/**
 * Compute the final mixed volume for a track at a given time, combining
 * fade ramps, ducking, and master volume.
 *
 * @param params All parameters needed for volume computation.
 * @returns The final volume (0..1).
 */
export function computeMixedVolume(params: {
  trackId: string;
  timeMs: number;
  durationMs: number;
  baseVolume: number;
  fadeInMs: number;
  fadeOutMs: number;
  masterVolume: number;
  ducking?: DuckingConfig;
  isPriorityTrack?: boolean;
  priorityTrackActive?: boolean;
}): number {
  const {
    trackId,
    timeMs,
    durationMs,
    baseVolume,
    fadeInMs,
    fadeOutMs,
    masterVolume,
    ducking,
    isPriorityTrack = false,
    priorityTrackActive = false,
  } = params;

  // Step 1: Apply fade ramps
  let volume = computeVolumeAtTime(
    trackId,
    timeMs,
    durationMs,
    baseVolume,
    fadeInMs,
    fadeOutMs,
  );

  // Step 2: Apply ducking (only to non-priority tracks)
  if (ducking && !isPriorityTrack) {
    volume = applyDucking(volume, ducking, priorityTrackActive);
  }

  // Step 3: Apply master volume
  volume *= masterVolume;

  return Math.max(0, Math.min(1, volume));
}

/**
 * Generate a volume curve (array of 0..1 values) for a track over its
 * entire duration, sampling at the given resolution. Useful for rendering
 * a visual representation of the fade/ducking envelope.
 *
 * @param durationMs  Total track duration.
 * @param baseVolume  Base volume.
 * @param fadeInMs    Fade-in duration.
 * @param fadeOutMs   Fade-out duration.
 * @param points      Number of sample points (default 100).
 * @returns Array of volume values (0..1).
 */
export function generateVolumeCurve(
  durationMs: number,
  baseVolume: number,
  fadeInMs: number,
  fadeOutMs: number,
  points: number = 100,
): number[] {
  if (durationMs <= 0 || points <= 0) return [];

  const curve: number[] = [];
  const stepMs = durationMs / points;

  for (let i = 0; i < points; i++) {
    const timeMs = i * stepMs;
    curve.push(
      computeVolumeAtTime(
        'curve',
        timeMs,
        durationMs,
        baseVolume,
        fadeInMs,
        fadeOutMs,
      ),
    );
  }

  return curve;
}

/**
 * Create a default AudioMixState.
 */
export function createDefaultMixState(): AudioMixState {
  return {
    masterVolume: 1,
    trackVolumes: new Map(),
    fades: new Map(),
  };
}

/**
 * Create a default DuckingConfig.
 */
export function createDefaultDuckingConfig(): DuckingConfig {
  return {
    enabled: false,
    level: 0.3,
    priorityTrackId: null,
    fadeMs: 300,
  };
}
