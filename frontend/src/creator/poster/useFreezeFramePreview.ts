/**
 * useFreezeFramePreview — truthfully previews a freeze-framed clip.
 *
 * expo-video cannot hold a single frame while timeline time advances, so
 * usePosterPlayback plays freeze-framed clips as normal forward playback.
 * Skia's `useVideo` hook CAN show a specific frame by seeking and pausing,
 * so this hook decodes the frozen frame through Skia and exposes it as a
 * `SharedValue<SkImage | null>` overlay that the canvas renders on top of
 * the (paused) native player. The preview is therefore truthful for freeze.
 * Reverse is still not previewed (it plays forward); only freeze is handled.
 *
 * Reference: https://mintlify.wiki/shopify/react-native-skia/images/video
 * Seeking while paused does not reliably update `currentFrame`; the
 * workaround re-asserts the seek via `useAnimatedReaction` once a frame
 * decodes.
 */
import { useEffect } from 'react';
import { useSharedValue, useAnimatedReaction, type SharedValue } from 'react-native-reanimated';
import { useVideo, type SkImage } from '@shopify/react-native-skia';

import type { ProjectedClip } from '../core/playback';

export interface UseFreezeFramePreviewInput {
  activeClip: ProjectedClip | null;
  playheadMs: number;
  isPlaying: boolean;
}

export interface UseFreezeFramePreviewResult {
  frozenFrame: SharedValue<SkImage | null> | null;
  isFrozen: boolean;
}

// Skia's useVideo returns currentFrame/time/etc. The seek-while-paused
// workaround issues an imperative seek on the handle; the real API exposes
// seeking via the `seek` SharedValue option, so we model both surfaces.
type SkiaVideoHandle = ReturnType<typeof useVideo> & { seek?: (ms: number) => void };

export function useFreezeFramePreview({
  activeClip,
  playheadMs,
  isPlaying,
}: UseFreezeFramePreviewInput): UseFreezeFramePreviewResult {
  const seekSV = useSharedValue<number | null>(null);
  const pausedSV = useSharedValue(true);

  const isFrozen = isInFreezeWindow(activeClip, playheadMs);
  const sourceUri = isFrozen && activeClip ? activeClip.sourceUri : null;

  // Always call useVideo (rules of hooks). When not frozen the source is
  // null, so no decoder is instantiated and currentFrame stays null.
  const video = useVideo(sourceUri, {
    seek: seekSV,
    paused: pausedSV,
    looping: false,
  }) as SkiaVideoHandle;

  // Seek to the freeze frame and pause so the held frame decodes.
  useEffect(() => {
    if (!isFrozen || !activeClip) {
      seekSV.value = null;
      pausedSV.value = true;
      return;
    }
    const freezeFrameMs = activeClip.freezeFrameMs ?? 0;
    seekSV.value = freezeFrameMs / 1000;
    pausedSV.value = true;
    // Seek-while-paused workaround: imperatively re-assert the target.
    video.seek?.(freezeFrameMs);
  }, [isFrozen, activeClip, isPlaying, seekSV, pausedSV, video]);

  // Re-assert the seek once a frame has decoded so the hold is reliable.
  useAnimatedReaction(
    () => video.currentFrame.value,
    (frame) => {
      if (isFrozen && frame !== null && activeClip) {
        video.seek?.(activeClip.freezeFrameMs ?? 0);
      }
    },
    [isFrozen, activeClip, video],
  );

  // Graceful degradation: if the source cannot decode (unsupported codec),
  // currentFrame stays null. Warn once so the overlay is invisible and the
  // underlying paused native player shows its last frame instead.
  useEffect(() => {
    if (!isFrozen) return undefined;
    const t = setTimeout(() => {
      if (video.currentFrame.value === null) {
        console.warn(
          '[useFreezeFramePreview] Skia useVideo could not decode the freeze-frame source; falling back to the paused native player.',
        );
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [isFrozen, video]);

  return {
    frozenFrame: isFrozen ? video.currentFrame : null,
    isFrozen,
  };
}

// Mirrors computeSourceTime's freeze mapping: the freeze window begins at
// `freezeFrameMs / speed` (timeline offset) and lasts `freezeDurationMs`.
function isInFreezeWindow(clip: ProjectedClip | null, playheadMs: number): boolean {
  if (!clip) return false;
  if (clip.freezeFrameMs == null || clip.freezeDurationMs == null) return false;
  if (clip.speed <= 0) return false;
  const offsetMs = playheadMs - clip.timelineStartMs;
  if (offsetMs < 0) return false;
  const freezeStart = clip.freezeFrameMs / clip.speed;
  const freezeEnd = freezeStart + clip.freezeDurationMs;
  return offsetMs >= freezeStart && offsetMs < freezeEnd;
}
