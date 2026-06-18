/**
 * Video — drop-in compatibility shim for `expo-av`'s `Video` component.
 *
 * Why this exists:
 *   `expo-av` was removed from Expo Go in SDK 54. Importing `Video` from
 *   `expo-av` triggers `requireNativeModule('ExponentAV')` at module-load time,
 *   which throws synchronously when the native module is missing — crashing
 *   the JS bundle right after the splash screen in Expo Go.
 *
 *   This wrapper exposes the same surface (`Video` + `ResizeMode`) that the
 *   rest of the codebase already consumes, but is internally implemented on
 *   top of `expo-video` (the SDK 54 replacement), so existing call sites stay
 *   unchanged.
 */
import React, { useEffect, useMemo } from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle, ImageStyle } from 'react-native';
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
  /** Legacy `expo-av` prop — toggles native playback controls on/off. */
  useNativeControls?: boolean;
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
          <Image
            source={posterSource as { uri: string }}
            style={[StyleSheet.absoluteFill, posterStyle]}
            resizeMode={contentFit === 'fill' ? 'stretch' : contentFit}
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