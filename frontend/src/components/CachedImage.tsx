import React, { useState } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, ImageStyle, Image as NativeImage } from 'react-native';
import { Image as ExpoImage, ImageContentFit } from 'expo-image';
import { Video, ResizeMode } from './compat/Video';
import Reanimated, {
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { isVideoUri } from '../utils/media';
import { ImageEmptyGraphic } from './ImageEmptyGraphic';

interface CachedImageProps {
  uri: string;
  previewUri?: string;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  transition?: number;
  blurhash?: string;
  priority?: 'low' | 'normal' | 'high';
  isVisible?: boolean;
  cacheBuster?: string;
    emptyLabel?: string;
  emptyIcon?: keyof typeof Ionicons.glyphMap;
  onError?: () => void;
  onLoad?: (event: { source: { width: number; height: number } }) => void;
}

const AnimatedLinearGradient = Reanimated.createAnimatedComponent(LinearGradient);

export function CachedImage({
  uri,
  previewUri,
  style,
  containerStyle,
  contentFit = 'cover',
  transition = 280,
  blurhash,
  priority = 'normal',
  isVisible = true,
  cacheBuster,
    emptyLabel,
  emptyIcon,
  onError,
  onLoad,
}: CachedImageProps) {
  const { colors } = useAppTheme();
  // Honest placeholder for missing images — no blank rectangles
  if (!uri) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }, containerStyle]}>
        <ImageEmptyGraphic
          label={emptyLabel}
          icon={emptyIcon}
          style={[styles.image, style]}
        />
      </View>
    );
  }
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const reducedMotionEnabled = useReducedMotion();
  const shimmerX = useSharedValue(-1);
  const imageOpacity = useSharedValue(0);
  const previewOpacity = useSharedValue(previewUri ? 1 : 0);

  React.useEffect(() => {
    setLoaded(false);
    setFailed(false);
    imageOpacity.value = 0;
    previewOpacity.value = previewUri ? 1 : 0;
  }, [imageOpacity, previewOpacity, previewUri, uri]);

  React.useEffect(() => {
    if (loaded || reducedMotionEnabled) {
      cancelAnimation(shimmerX);
      shimmerX.value = -1;
      return;
    }

    shimmerX.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
        withTiming(-1, { duration: 0 })
      ),
      -1,
      false
    );
  }, [loaded, reducedMotionEnabled, shimmerX]);

  const imageStyle = useAnimatedStyle(() => ({
    opacity: imageOpacity.value,
  }));

  const previewStyle = useAnimatedStyle(() => ({
    opacity: previewOpacity.value,
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value * 120 }],
    opacity: loaded ? 0 : 0.55,
  }));

  const effectivePriority = isVisible ? priority : 'low';
  const effectiveTransition = reducedMotionEnabled ? 0 : transition;
  const isVideoSource = isVideoUri(uri);
  const useNativeImage = !isVideoSource && /^content:\/\//i.test(uri);

  const sourceUri = React.useMemo(() => {
    if (!cacheBuster || !uri) return uri;
    const separator = uri.includes('?') ? '&' : '?';
    return `${uri}${separator}cb=${encodeURIComponent(cacheBuster)}`;
  }, [uri, cacheBuster]);

  const nativeResizeMode = React.useMemo(() => {
    switch (contentFit) {
      case 'contain':
        return 'contain';
      case 'fill':
        return 'stretch';
      case 'none':
        return 'center';
      case 'scale-down':
        return 'contain';
      case 'cover':
      default:
        return 'cover';
    }
  }, [contentFit]);

  const handleLoad = React.useCallback((e?: any) => {
    setLoaded(true);
    imageOpacity.value = withTiming(1, { duration: reducedMotionEnabled ? 0 : 200 });
    previewOpacity.value = withTiming(0, { duration: reducedMotionEnabled ? 0 : 180 });
    if (onLoad && e?.source) {
      onLoad({ source: { width: e.source.width, height: e.source.height } });
    }
  }, [imageOpacity, previewOpacity, reducedMotionEnabled, onLoad]);

    const handleError = React.useCallback(() => {
    setFailed(true);
    setLoaded(true);
    imageOpacity.value = withTiming(1, { duration: 0 });
    previewOpacity.value = withTiming(0, { duration: 80 });
    onError?.();
  }, [imageOpacity, previewOpacity, onError]);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }, containerStyle]}>
      {/* Premium fallback for failed loads (404, network error, etc.) —
          never leaves a broken/blank image rectangle. */}
      {failed ? (
        <ImageEmptyGraphic
          label={emptyLabel}
          icon={emptyIcon}
          style={[styles.image, style]}
        />
      ) : (
      <>
      {/* Shimmer placeholder */}
      {!loaded && (
        <View style={[StyleSheet.absoluteFill, styles.shimmerBase, { backgroundColor: colors.surface }]}>
          <AnimatedLinearGradient
            colors={['transparent', 'rgba(255,255,255,0.06)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[StyleSheet.absoluteFill, shimmerStyle]}
          />
        </View>
      )}

      {previewUri && !loaded && (
        <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, previewStyle]}>
          <ExpoImage
            source={{ uri: previewUri }}
            style={[styles.image, style]}
            contentFit={contentFit}
            transition={0}
            cachePolicy="memory-disk"
            priority={effectivePriority}
            recyclingKey={`preview-${sourceUri}`}
          />
        </Reanimated.View>
      )}

      <Reanimated.View style={[StyleSheet.absoluteFill, imageStyle]}>
        {isVideoSource ? (
          <Video
            source={{ uri: sourceUri }}
            style={[styles.image, style as StyleProp<ViewStyle>]}
            resizeMode={ResizeMode.COVER}
            shouldPlay={false}
            isMuted
            isLooping={false}
            usePoster={!!previewUri}
            posterSource={previewUri ? { uri: previewUri } : undefined}
            onLoad={handleLoad}
            onReadyForDisplay={handleLoad}
            onError={handleError}
          />
        ) : useNativeImage ? (
          <NativeImage
            source={{ uri: sourceUri }}
            style={[styles.image, style]}
            resizeMode={nativeResizeMode}
            onLoad={handleLoad}
            onError={handleError}
          />
        ) : (
          <ExpoImage
            source={{ uri: sourceUri }}
            style={[styles.image, style]}
            contentFit={contentFit}
            transition={effectiveTransition}
            placeholder={blurhash ? { blurhash } : undefined}
            cachePolicy="memory-disk"
            priority={effectivePriority}
            onLoad={handleLoad}
            onError={handleError}
            recyclingKey={sourceUri}
          />
        )}
      </Reanimated.View>
      </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  shimmerBase: {
  },
  image: {
    width: '100%',
    height: '100%',
  },
});