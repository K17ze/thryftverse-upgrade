/**
 * usePosterPlayback — Playback clock & transport hook for the Poster
 * composer.
 *
 * Extracted from PosterComposerScreen to separate the playback pipeline
 * (the single PlaybackClock, timeline projection, video adapter
 * registration, per-tick source-time mapping, playhead state, and
 * transport controls) from the screen's rendering orchestration.
 *
 * The hook owns:
 *   - `playbackClock` — the single source of truth for timeline time
 *     (PlaybackClock instance). Per AGENTS.md §11 and the Zero-Gap audit,
 *     one clock drives active clip, video seek/play/pause, overlay
 *     visibility, text animation, transitions, and keyframes.
 *   - `projectedTimeline` — the document projected into a canonical
 *     timeline (clips + overlays + total duration).
 *   - `playbackState` — the UI-facing snapshot (isPlaying, currentTimeMs,
 *     totalDurationMs, playbackRate) derived from clock subscriptions.
 *   - `visibleOverlayIds` — the set of overlay layer ids visible at the
 *     current playhead (for timeline overlay track highlighting).
 *   - `applyTimelineToPlayer` — the per-tick source-time mapping adapter
 *     (Wave 7 video preview adapter). Maps absolute timeline time →
 *     source-media time (trim + speed aware, with forward-only fallback
 *     for reverse/freeze edits the native player cannot truthfully
 *     preview) and drives the native expo-video player.
 *   - The video adapter registration — issues imperative
 *     play/pause/seek/rate commands to the native player.
 *   - `handlePlayPause` / `handleSeek` / `setClockRate` — transport
 *     controls wrapping the clock with haptic feedback.
 *
 * Pattern follows usePosterSession.ts and usePosterEffects.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';

import type { VideoPlayer } from 'expo-video';

import type { CreatorDocument } from '../composition';
import {
  PlaybackClock,
  projectTimeline,
  findVisibleOverlays,
  findActiveClip,
  computeSourceTime,
} from '../core/playback';
import type { PlaybackState, ProjectedTimeline } from '../core/playback';
import type { useHaptic } from '../../hooks/useHaptic';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The haptic engine returned by useHaptic.
 */
type Haptic = ReturnType<typeof useHaptic>;

export interface UsePosterPlaybackInput {
  /** The composition document (for timeline projection). */
  document: CreatorDocument;
  /** Ref to the Expo VideoPlayer (set by the canvas for the current page). */
  videoPlayerRef: RefObject<VideoPlayer | null>;
  /** The active page index (reserved for future per-page playback reset). */
  activePageIndex: number;
  /** Haptic engine (for transport control feedback). */
  haptic: Haptic;
}

export interface UsePosterPlaybackResult {
  /** The PlaybackClock instance (passed to CreatorCanvas and timeline ops). */
  playbackClock: PlaybackClock;
  /** The projected timeline (clips + overlays + total duration). */
  projectedTimeline: ProjectedTimeline;
  /** The full playback state snapshot (isPlaying, currentTimeMs, etc.). */
  playbackState: PlaybackState;
  /** Whether playback is currently active. */
  isPlaying: boolean;
  /** The current playhead position in milliseconds. */
  playheadPosition: number;
  /** The current playback rate. */
  clockRate: number;
  /** Sets the playback rate (clamped to 0.25x–4x). */
  setClockRate: (rate: number) => void;
  /** Toggles play/pause with haptic feedback. */
  handlePlayPause: () => void;
  /** Seeks to an absolute timeline position (ms). */
  handleSeek: (ms: number) => void;
  /** Set of overlay layer ids visible at the current playhead. */
  visibleOverlayIds: Set<string>;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function usePosterPlayback({
  document,
  videoPlayerRef,
  haptic,
}: UsePosterPlaybackInput): UsePosterPlaybackResult {
  // ── Playback clock — the single source of truth for timeline time ──
  // Per AGENTS.md §11 and the Zero-Gap audit, one playback clock drives:
  // active clip, video seek/play/pause, overlay visibility, text animation,
  // transitions, and keyframes. The clock owns wall-clock time and emits
  // snapshots via a subscriber model. UI state (playhead position, play/pause)
  // is derived from the clock — no separate isPlaying state that can desync.
  const playbackClock = useMemo(() => new PlaybackClock(), []);

  // Project the document into a canonical timeline (clips + overlays + total
  // duration). This replaces the legacy page-based derivation with correct
  // speed-adjusted clip durations and overlay time ranges.
  const projectedTimeline = useMemo(() => projectTimeline(document), [document]);

  // Set the clock's total duration whenever the projected timeline changes.
  useEffect(() => {
    playbackClock.setTotalDurationMs(projectedTimeline.totalDurationMs);
  }, [projectedTimeline.totalDurationMs, playbackClock]);

  // Subscribe to clock updates to drive UI state (playhead position, play/pause).
  // The clock emits on every frame during playback (RAF/interval) and on every
  // transport control call (play/pause/seek/scrub/setRate).
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    currentTimeMs: 0,
    totalDurationMs: 0,
    playbackRate: 1,
  });
  useEffect(() => {
    const unsubscribe = playbackClock.subscribe((state) => {
      setPlaybackState(state);
    });
    return unsubscribe;
  }, [playbackClock]);

  // Determine which overlays are visible at the current playback position.
  // The CreatorCanvas also handles temporal visibility internally via the
  // currentTimeMs prop (checking layer.timeRange), but this computed set
  // is available for timeline overlay track highlighting and future
  // features that need to know which overlays are active.
  const visibleOverlayIds = useMemo(
    () => new Set(findVisibleOverlays(projectedTimeline, playbackState.currentTimeMs).map((o) => o.layerId)),
    [projectedTimeline, playbackState.currentTimeMs],
  );

  // ── Per-tick video source-time mapping ──────────────────────────────
  // The PlaybackClock advances timeline time on every tick but only calls
  // the adapter's onSeek on explicit scrub gestures — not during playback.
  // Without continuous scrubbing the native player plays from its own
  // position at 1×, ignoring trim and speed. The subscriber below drives
  // the player to the mapped source time on every clock state change so
  // the preview reflects trim and speed edits in real time.
  //
  // Seeks are throttled to ~100ms to avoid excessive native bridge traffic
  // (matching the clock's own SEEK_COALESCE_MS). Between seeks the native
  // player plays at clip.speed × clock.playbackRate so playback is smooth
  // rather than choppy; the periodic seeks correct any drift.
  //
  // Reverse and freeze-frame are NOT reflected in the preview. expo-video's
  // playbackRate is clamped to [0, 16] — it cannot play backward, so reverse
  // would require frame-by-frame backward seeks. Those seeks are async
  // (native bridge latency ± a single frame interval) and platform-
  // dependent (the API's ScrubbingMode suppresses playback on Android and
  // recommends pausing on iOS), so they cannot produce a truthful smooth
  // reverse — only a janky slideshow that misrepresents the edit. Freeze-
  // frame likewise cannot hold a single frame while timeline time advances
  // without a choppy seek-and-yank loop.
  //
  // Rather than fabricate a choppy fake, the preview plays reversed and
  // freeze-framed clips as normal forward playback (forward-only source
  // mapping below). The edits are still authored on the layer payload and
  // applied on export — the ReverseToggle and FreezeFramePicker sheets
  // label this honestly, and the timeline clip shows a badge so the user
  // can see the edit is authored. computeSourceTime() (used by the export
  // pipeline) retains the correct reverse/freeze mapping.
  const lastVideoSeekMs = useRef(0);

  // Map a timeline position to the corresponding source-media time and
  // drive the native player: seek to the mapped position, set the
  // playback rate to clip.speed × clockRate, and play/pause as needed.
  const applyTimelineToPlayer = useCallback(
    (timelineMs: number, isPlaying: boolean, clockRate: number) => {
      const player = videoPlayerRef.current;
      if (!player) return;

      const activeClip = findActiveClip(projectedTimeline, timelineMs);

      if (!activeClip) {
        // Outside any clip (gap or past the end) — pause the player.
        try { player.pause(); } catch { /* player may be released */ }
        return;
      }

      // Map timeline position → source-media time (trim + speed aware).
      // computeSourceTime handles constant speed, speed curves (via the
      // average), reverse, and freeze — returning the correct source
      // position for export. However, the native player cannot play in
      // reverse or hold a freeze frame (see the note above), so for clips
      // with those edits the preview falls back to a forward-only mapping
      // — clean forward playback rather than a choppy fake. The edits
      // remain authored on the payload and are applied on export.
      const hasPreviewUnsupportedEdit =
        activeClip.reversed ||
        (activeClip.freezeFrameMs != null && activeClip.freezeDurationMs != null);
      const sourceMs = hasPreviewUnsupportedEdit
        ? activeClip.sourceStartMs +
          (timelineMs - activeClip.timelineStartMs) * activeClip.speed
        : (computeSourceTime(activeClip, timelineMs) ?? timelineMs);

      // Effective native playback rate = clip speed × clock transport rate.
      // clip.speed is already the average speed (constant or from a curve),
      // computed during projection. This keeps playback smooth between
      // periodic seeks; the seeks themselves correct any drift.
      const effectiveRate = Math.max(0.25, Math.min(4, activeClip.speed * clockRate));

      try {
        // expo-video's player.currentTime is settable in seconds.
        player.currentTime = sourceMs / 1000;
        player.playbackRate = effectiveRate;
        if (isPlaying) {
          player.play();
        }
      } catch {
        // Player may be released or not yet ready — ignore.
      }
    },
    [projectedTimeline],
  );

  // Register a video adapter so the clock can control video playback.
  // CreatorCanvas reads `playbackClock.isPlaying` to drive the Video
  // component's `shouldPlay` prop (declarative play/pause), and
  // `currentTimeMs` drives temporal visibility + keyframe evaluation.
  // This adapter issues the *imperative* commands the declarative prop
  // path cannot cover:
  //   - onPlay: seeks to the mapped source time, sets the clip's speed as
  //     the native playback rate, and starts playback — so pressing play
  //     starts from the correct trimmed position at the right speed.
  //   - onPause: pauses the native player.
  //   - onSeek: scrubs the native player to the source-time position
  //     matching the timeline playhead (trim + speed aware). Called on
  //     explicit scrub gestures, coalesced to ~100ms by the clock.
  //   - onRateChange: sets the native playback rate to clip.speed × the
  //     clock's transport rate.
  // For image-only posters the player ref is null, so all callbacks are
  // no-ops (backward compatible).
  useEffect(() => {
    playbackClock.registerVideoAdapter({
      onPlay: () => {
        applyTimelineToPlayer(
          playbackClock.currentTimeMs,
          true,
          playbackClock.playbackRate,
        );
      },
      onPause: () => {
        const player = videoPlayerRef.current;
        if (player) {
          try { player.pause(); } catch { /* player may be released */ }
        }
      },
      onSeek: (ms: number) => {
        applyTimelineToPlayer(ms, playbackClock.isPlaying, playbackClock.playbackRate);
      },
      onRateChange: (rate: number) => {
        const player = videoPlayerRef.current;
        if (!player) return;
        const activeClip = findActiveClip(projectedTimeline, playbackClock.currentTimeMs);
        if (activeClip) {
          const effectiveRate = Math.max(0.25, Math.min(4, activeClip.speed * rate));
          try { player.playbackRate = effectiveRate; } catch { /* released */ }
        }
      },
    });
    return () => {
      playbackClock.unregisterVideoAdapter();
    };
  }, [playbackClock, projectedTimeline, applyTimelineToPlayer]);

  // Per-tick subscriber: drive the native player to the mapped source
  // time on every clock state change. The clock emits on every frame
  // during playback (RAF/interval) and on every transport control call
  // (play/pause/seek/scrub/setRate). Seeks are throttled to ~100ms to
  // avoid excessive native bridge traffic. This is what makes the video
  // preview reflect trim and speed edits during playback — without it
  // the native player would play from its own position at 1×, ignoring
  // the clip's trim start and speed.
  useEffect(() => {
    const unsubscribe = playbackClock.subscribe((state) => {
      const now = Date.now();
      if (now - lastVideoSeekMs.current < 100) return;
      lastVideoSeekMs.current = now;
      applyTimelineToPlayer(state.currentTimeMs, state.isPlaying, state.playbackRate);
    });
    return unsubscribe;
  }, [playbackClock, applyTimelineToPlayer]);

  // Dispose the clock on unmount to stop any running RAF/interval loops.
  useEffect(() => {
    return () => {
      playbackClock.dispose();
    };
  }, [playbackClock]);

  // ── Transport controls ─────────────────────────────────────────────
  // Convenience wrappers around the clock with haptic feedback. The
  // play/pause toggle fires a light haptic on both play and pause
  // (matching the prior handleTimelineOperation 'play'/'pause' cases).
  // Seek is silent (no haptic) — matching the prior 'seek' case.
  const handlePlayPause = useCallback(() => {
    playbackClock.togglePlayPause();
    haptic.light();
  }, [playbackClock, haptic]);

  const handleSeek = useCallback((ms: number) => {
    playbackClock.seek(ms);
  }, [playbackClock]);

  const setClockRate = useCallback((rate: number) => {
    playbackClock.setRate(rate);
  }, [playbackClock]);

  return {
    playbackClock,
    projectedTimeline,
    playbackState,
    isPlaying: playbackState.isPlaying,
    playheadPosition: playbackState.currentTimeMs,
    clockRate: playbackState.playbackRate,
    setClockRate,
    handlePlayPause,
    handleSeek,
    visibleOverlayIds,
  };
}
