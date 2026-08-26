/**
 * Video — drop-in compatibility shim for the legacy `expo-av` `Video` component.
 *
 * Why this exists:
 *   `expo-av` was fully removed in Expo SDK 55. The video playback
 *   functionality was replaced by `expo-video` (SDK 54+). This wrapper
 *   exposes the same surface (`Video` + `ResizeMode`) that the rest of the
 *   codebase already consumes, but is internally implemented on top of
 *   `expo-video`, so existing call sites stay unchanged.
 */
import React, { useEffect, useMemo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle, ImageStyle, AppState, AppStateStatus } from 'react-native';
import { Image as ExpoImage, ImageContentFit } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';

export enum ResizeMode {
  CONTAIN = 'contain',
  COVER = 'cover',
  STRETCH = 'stretch',
}

interface VideoSource {
  uri?: string;
}

export interface VideoProps {
  source: VideoSource | number | { uri: string };
  style?: StyleProp<ViewStyle>;
  resizeMode?: ResizeMode | 'contain' | 'cover' | 'stretch';
  shouldPlay?: boolean;
  isMuted?: boolean;
  isLooping?: boolean;
  /** When true, the `posterSource` image is shown until the video is ready. */
  usePoster?: boolean;
  posterSource?: { uri: string } | number;
  posterStyle?: StyleProp<ImageStyle>;
  onLoad?: () => void;
  onReadyForDisplay?: () => void;
  onError?: (error: unknown) => void;
  /** Legacy `expo-av`-style prop — toggles native playback controls on/off. */
  useNativeControls?: boolean;
  /** Accessibility role for screen readers (e.g. 'image'). */
  accessibilityRole?: 'image' | 'button' | 'link' | 'none';
  /** Accessibility label describing the video for screen readers. */
  accessibilityLabel?: string;
  /** Legacy `expo-av`-style status callback — fires periodically with position/duration. */
  onPlaybackStatusUpdate?: (status: { positionMillis: number; durationMillis: number; isPlaying: boolean }) => void;
  /** Exposes the underlying expo-video player instance to the parent for seeking. */
  playerRef?: React.MutableRefObject<any>;
}

function resolveSourceUri(source: VideoProps['source']): string | null {
  if (!source) {
    return null;
  }

  if (typeof source === 'number') {
    return null;
  }

  if (typeof source === 'object' && 'uri' in source && typeof source.uri === 'string') {
    return source.uri;
  }

  return null;
}

function toContentFit(resizeMode: VideoProps['resizeMode']): 'contain' | 'cover' | 'fill' {
  const value = (resizeMode ?? '').toString();

  if (value === 'stretch') {
    return 'fill';
  }

  if (value === 'contain') {
    return 'contain';
  }

  return 'cover';
}

/**
 * `<Video>` — API-compatible facade over `expo-video`.
 *
 * Translates the legacy declarative props (`shouldPlay`, `isMuted`, `isLooping`)
 * to the imperative `useVideoPlayer` setup used by `expo-video`, while keeping
 * `<VideoView>` rendered in the same layout slot the call site provided.
 */
export const Video: React.FC<VideoProps> = ({
  source,
  style,
  resizeMode,
  shouldPlay = false,
  isMuted = true,
  isLooping = false,
  usePoster = false,
  posterSource,
  posterStyle,
  onLoad,
  onReadyForDisplay,
  onError,
  useNativeControls = false,
  accessibilityRole,
  accessibilityLabel,
  onPlaybackStatusUpdate,
  playerRef,
}) => {
  const sourceUri = useMemo(() => resolveSourceUri(source), [source]);

  const player = useVideoPlayer(sourceUri ?? null, (instance) => {
    try {
      instance.muted = isMuted;
      instance.loop = isLooping;
      if (shouldPlay) {
        instance.play();
      }
    } catch (error) {
      onError?.(error);
    }
  });

  useEffect(() => {
    if (playerRef) {
      playerRef.current = player;
    }
  }, [player, playerRef]);

  // ── Playback status via native timeUpdate event (no JS-thread polling) ──
  // expo-video emits 'timeUpdate' at a configurable interval. We set
  // `timeUpdateEventInterval` to 0.2s (matching the legacy 200ms polling) and
  // subscribe via addListener — the event fires from the native player, not a
  // JS setInterval. This eliminates per-instance JS-thread timers.
  useEffect(() => {
    if (!player || !onPlaybackStatusUpdate) {
      return;
    }

    try {
      player.timeUpdateEventInterval = shouldPlay ? 0.2 : 0;
    } catch {
      // Property may not be writable on all platforms — safe to ignore.
    }

    if (!shouldPlay) {
      return;
    }

    const subscription = player.addListener?.('timeUpdate', (payload: { currentTime?: number }) => {
      try {
        onPlaybackStatusUpdate({
          positionMillis: (payload?.currentTime ?? player.currentTime ?? 0) * 1000,
          durationMillis: (player.duration ?? 0) * 1000,
          isPlaying: true,
        });
      } catch (error) {
        onError?.(error);
      }
    });

    return () => {
      subscription?.remove?.();
      try {
        player.timeUpdateEventInterval = 0;
      } catch {
        // Player may already be released.
      }
    };
  }, [player, shouldPlay, onPlaybackStatusUpdate, onError]);

  // ── AppState listener — pause video when app is backgrounded ──
  // VideoManager and MediaStage both handle AppState; this shim must too,
  // since it creates its own useVideoPlayer outside the pool.
  useEffect(() => {
    if (!player) {
      return;
    }

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState !== 'active') {
        try {
          player.pause();
        } catch {
          // Player may already be released.
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [player]);

  useEffect(() => {
    if (!player) {
      return;
    }

    try {
      player.muted = isMuted;
    } catch (error) {
      onError?.(error);
    }
  }, [isMuted, onError, player]);

  useEffect(() => {
    if (!player) {
      return;
    }

    try {
      player.loop = isLooping;
    } catch (error) {
      onError?.(error);
    }
  }, [isLooping, onError, player]);

  useEffect(() => {
    if (!player) {
      return;
    }

    try {
      if (shouldPlay) {
        player.play();
      } else {
        player.pause();
      }
    } catch (error) {
      onError?.(error);
    }
  }, [shouldPlay, onError, player]);

  useEffect(() => {
    if (!player || (!onLoad && !onReadyForDisplay)) {
      return;
    }

    let disposed = false;

    const subscription = player.addListener?.('statusChange', ({ status }: { status: string }) => {
      if (disposed) {
        return;
      }

      if (status === 'readyToPlay') {
        onLoad?.();
        onReadyForDisplay?.();
      }
    });

    return () => {
      disposed = true;
      subscription?.remove?.();
    };
  }, [onLoad, onReadyForDisplay, player]);

  const contentFit = toContentFit(resizeMode);
  const showPoster = usePoster && !!posterSource;

  return (
    <View style={[styles.container, style]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        nativeControls={useNativeControls}
      />

      {showPoster ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <ExpoImage
            source={posterSource as { uri: string }}
            style={[StyleSheet.absoluteFill, posterStyle]}
            contentFit={contentFit === 'fill' ? 'fill' : (contentFit as ImageContentFit)}
            cachePolicy="memory-disk"
            recyclingKey={(posterSource as { uri: string })?.uri}
            enforceEarlyResizing
          />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});

export default Video;