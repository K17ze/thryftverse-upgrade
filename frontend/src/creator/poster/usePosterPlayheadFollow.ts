/**
 * usePosterPlayheadFollow — playhead auto-follow during playback for the
 * Poster composer (CapCut/Edits/Snap behavior).
 *
 * Extracted from PosterComposerScreen (pure extraction — no behavioral
 * change). When the track is zoomed wider than the viewport, keeps the
 * playhead visible: crossing the right edge scrolls it back to ~35% from
 * the left; crossing the left edge pulls it back into view. Throttled
 * and playback-only so it never fights a user's manual scroll.
 */
import { useEffect, useRef } from 'react';
import type { ScrollView } from 'react-native';
import type { AnimatedRef, SharedValue } from 'react-native-reanimated';

import type { PlaybackState } from '../core/playback';

export interface UsePosterPlayheadFollowInput {
  /** Playback state (isPlaying + currentTimeMs drive the follow). */
  playbackState: PlaybackState;
  /** Current zoomed track width in px. */
  scaledTrackWidth: number;
  /** Total timeline duration in ms. */
  timelineTotalDurationMs: number;
  /** Viewport width in px. */
  screenWidth: number;
  /** UI-thread scroll offset of the timeline ScrollView. */
  timelineScrollXSV: SharedValue<number>;
  /** Animated ref to the timeline ScrollView. */
  timelineScrollRef: AnimatedRef<ScrollView>;
}

export function usePosterPlayheadFollow({
  playbackState,
  scaledTrackWidth,
  timelineTotalDurationMs,
  screenWidth,
  timelineScrollXSV,
  timelineScrollRef,
}: UsePosterPlayheadFollowInput): void {
  // Playhead auto-follow during playback (CapCut/Edits/Snap behavior):
  // when the track is zoomed wider than the viewport, keep the playhead
  // visible ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â crossing the right edge scrolls it back to ~35% from the
  // left; crossing the left edge pulls it back into view. Throttled and
  // playback-only so it never fights a user's manual scroll.
  const playheadFollowAtRef = useRef(0);
  useEffect(() => {
    if (!playbackState.isPlaying) return;
    const pxPerMs = timelineTotalDurationMs > 0 ? scaledTrackWidth / timelineTotalDurationMs : 0;
    if (pxPerMs <= 0 || scaledTrackWidth <= screenWidth) return;
    const playheadPx = playbackState.currentTimeMs * pxPerMs;
    const scrollX = timelineScrollXSV.value;
    const edge = 48;
    if (playheadPx > scrollX + screenWidth - edge || playheadPx < scrollX + edge) {
      const now = Date.now();
      if (now - playheadFollowAtRef.current < 350) return;
      playheadFollowAtRef.current = now;
      timelineScrollRef.current?.scrollTo({
        x: Math.max(0, playheadPx - screenWidth * 0.35),
        animated: true,
      });
    }
  }, [playbackState.currentTimeMs, playbackState.isPlaying, scaledTrackWidth, timelineTotalDurationMs, screenWidth, timelineScrollXSV, timelineScrollRef]);
}
