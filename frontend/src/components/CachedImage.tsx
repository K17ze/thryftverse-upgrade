import React, { useState } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, ImageStyle, Image as NativeImage, PixelRatio } from 'react-native';
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
import { useReducedMotion } from '../hooks/useReducedMotion';
import { isVideoUri } from '../utils/media';
import { ImageEmptyGraphic } from './ImageEmptyGraphic';
import { useAppTheme } from '../theme/ThemeContext';

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
  /**
   * Phase 6: Focal point for art-directed crops.
   * Values 0-1 for both x and y. Used with contentFit='cover' to
   * preserve the most important part of the image (e.g. fashion
   * objects, shoe silhouettes, jewellery centres).
   *
   * Source §15: "Do not rely on `cover` blindly. Use category-sensitive
   * focal positioning when supported safely."
   */
  focalPoint?: { x: number; y: number };
  /**
   * Video playback control. For video sources, when true the video plays
   * (muted, looped); when false it shows the poster frame / placeholder.
   * Defaults to false so cards/thumbnails never autoplay — pass true from a
   * viewability-driven surface (e.g. MediaPreview) to play when visible.
   */
  shouldPlay?: boolean;
  /** Loop video playback (default true for ambient preview surfaces). */
  isLooping?: boolean;
  /** Show a small play glyph over video poster frames (default false). */
  showPlayBadge?: boolean;
  /**
   * Image resolution policy: target display width in logical dp (layout points).
   *
   * When set, the component converts to physical pixels using PixelRatio,
   * snaps to a derivative bucket, and appends CDN resize parameters for
   * supported providers (Cloudinary, Imgix, Supabase Storage, CloudFront)
   * so grid thumbnails do not download full-resolution images.
   *
   * Pass the layout width of the tile/card in dp (e.g. `downscaleWidth={180}`).
   * The component handles DPR conversion internally — callers always pass
   * logical dp, never physical pixels.
   *
   * Leave undefined for detail/gallery surfaces that need full resolution.
   *
   * For providers not in the supported list, the prop is a no-op and the
   * original URI is used as-is.
   */
  downscaleWidth?: number;
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
  focalPoint,
  shouldPlay = false,
  isLooping = true,
  showPlayBadge = false,
  downscaleWidth,
}: CachedImageProps) {
  const { colors } = useAppTheme();
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

  // Phase 6: focal point → contentPosition for Expo Image
  const contentPosition = focalPoint
    ? { top: `${Math.round(focalPoint.y * 100)}%`, left: `${Math.round(focalPoint.x * 100)}%` }
    : undefined;

  // Image resolution policy: append CDN resize parameters for thumbnails.
  // Avoids downloading full-resolution images for small grid tiles (audit
  // §Caching/prefetch / LIST_RENDERING_POLICY.md §5.1).
  // Supported: Cloudinary (/upload/ → /upload/w_<width>/), Imgix (?w=),
  // Supabase Storage (?width=). Others pass through unchanged.
  //
  // Phase 6 P0 (§04_MEDIA_FIDELITY_NORTH_STAR): The `downscaleWidth` prop
  // is in logical dp (layout points). CDN resize parameters expect physical
  // pixels. On a 3× device, requesting a 180px image for a 180dp tile
  // produces visibly soft results. We multiply by PixelRatio and snap to
  // a derivative bucket to avoid requesting arbitrary widths.
  const sourceUri = React.useMemo(() => {
    if (!uri) return uri;
    let result = uri;

    // Apply downscale for supported CDNs
    if (downscaleWidth && downscaleWidth > 0) {
      // Convert logical dp → physical pixels with a small overscan factor
      // (1.1×) to handle minor scale changes without a re-request, then
      // snap to the nearest derivative bucket so the CDN can cache efficiently.
      const DERIVATIVE_BUCKETS = [160, 240, 360, 540, 720, 1080, 1440, 2048, 2560];
      const physicalWidth = Math.ceil(downscaleWidth * PixelRatio.get() * 1.1);
      const bucketWidth = DERIVATIVE_BUCKETS.find((b) => b >= physicalWidth) ?? physicalWidth;

      // Cloudinary: /upload/ → /upload/w_<width>,f_auto,q_auto/
      if (/cloudinary\.com|res\.cloudinary\.com/i.test(uri)) {
        result = uri.replace(
          /\/upload\//i,
          `/upload/w_${bucketWidth},f_auto,q_auto/`,
        );
      }
      // Imgix: append ?w=<width>&auto=format,compress
      else if (/imgix\.net/i.test(uri)) {
        const sep = uri.includes('?') ? '&' : '?';
        result = `${uri}${sep}w=${bucketWidth}&auto=format,compress`;
      }
      // Supabase Storage: append ?width=<width>
      else if (/supabase\.co\/storage/i.test(uri)) {
        const sep = uri.includes('?') ? '&' : '?';
        result = `${uri}${sep}width=${bucketWidth}`;
      }
      // AWS CloudFront with Lambda edge: append ?w=<width> (common pattern)
      else if (/cloudfront\.net/i.test(uri) && !uri.includes('?w=')) {
        const sep = uri.includes('?') ? '&' : '?';
        result = `${uri}${sep}w=${bucketWidth}`;
      }
    }

    // Apply cache buster
    if (cacheBuster) {
      const separator = result.includes('?') ? '&' : '?';
      result = `${result}${separator}cb=${encodeURIComponent(cacheBuster)}`;
    }

    return result;
  }, [uri, cacheBuster, downscaleWidth]);

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

  // Honest placeholder for missing images — no blank rectangles
  if (!uri) {
    return (
      <View style={[styles.container, style as StyleProp<ViewStyle>, { backgroundColor: colors.surface }, containerStyle]}>
        <ImageEmptyGraphic
          label={emptyLabel}
          icon={emptyIcon}
          style={[styles.image, style]}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, style as StyleProp<ViewStyle>, { backgroundColor: colors.surface }, containerStyle]}>
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
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceAlt }]}>
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
            enforceEarlyResizing
          />
        </Reanimated.View>
      )}

      <Reanimated.View style={[StyleSheet.absoluteFill, imageStyle]}>
        {isVideoSource ? (
          <Video
            source={{ uri: sourceUri }}
            style={[styles.image, style as StyleProp<ViewStyle>]}
            resizeMode={ResizeMode.COVER}
            shouldPlay={shouldPlay && isVisible}
            isMuted
            isLooping={isLooping}
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
            contentPosition={contentPosition}
            transition={effectiveTransition}
            placeholder={blurhash ? { blurhash } : undefined}
            cachePolicy="memory-disk"
            priority={effectivePriority}
            onLoad={handleLoad}
            onError={handleError}
            recyclingKey={sourceUri}
            enforceEarlyResizing
          />
        )}
      </Reanimated.View>

      {/* Subtle play badge for video poster frames in tiny cards — no native
          video chrome (audit §Media pipeline / AGENTS §15). */}
      {isVideoSource && showPlayBadge && !shouldPlay && (
        <View pointerEvents="none" style={styles.playBadge}>
          <View style={[styles.playBadgeCircle, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
            <Ionicons name="play" size={14} color="#fff" />
          </View>
        </View>
      )}
      </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  playBadge: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadgeCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
});
