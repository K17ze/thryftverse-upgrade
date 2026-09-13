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
import { Motion } from '../theme/motionTokens';
import { isVideoUri } from '../utils/media';
import type { ListingMediaDerivative } from '../contracts/listingMedia';
import { ImageEmptyGraphic } from './ImageEmptyGraphic';
import { useAppTheme } from '../theme/ThemeContext';
import { Radius, Stroke} from '../theme/designTokens';

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
   * original URI is used as-is — unless `derivatives` is supplied, which
   * takes precedence over CDN-param rewriting on any host.
   */
  downscaleWidth?: number;
  /**
   * Pre-rendered rendition ladder from the listing media contract
   * (`media[].derivatives`). When `downscaleWidth` is set, the component
   * serves the smallest rendition that covers the physical pixel target
   * (largest available when the target exceeds the ladder). This works on
   * plain S3/MinIO origins where CDN resize parameters are a no-op.
   *
   * Format preference is jpeg → webp → png → avif → other so the chosen
   * rendition stays decodable on every supported platform.
   */
  derivatives?: ListingMediaDerivative[];
  /**
   * Optional Reanimated shared-element transition tag. When set, the
   * image's animated wrapper participates in a shared-element transition
   * (e.g. card → PDP hero). Allows focal-point art-directed images to
   * retain the transition that `SharedTransitionImage` provides.
   */
  sharedTransitionTag?: string;
  /** Accessibility role for screen readers (e.g. 'image'). */
  accessibilityRole?: 'image' | 'button' | 'link' | 'none';
  /** Accessibility label describing the image for screen readers. */
  accessibilityLabel?: string;
  /** When true, hides this element and its descendants from the screen reader. */
  accessibilityElementsHidden?: boolean;
  /** When false, removes this element from the accessibility tree. */
  accessible?: boolean;
}

const AnimatedLinearGradient = Reanimated.createAnimatedComponent(LinearGradient);

// Image resolution policy: physical-pixel buckets the CDN / derivative
// ladder can cache efficiently. `downscaleWidth` callers pass logical dp;
// the policy multiplies by PixelRatio and snaps to the nearest bucket.
const DERIVATIVE_BUCKETS = [160, 240, 360, 540, 720, 1080, 1440, 2048, 2560];

// Format preference keeps the chosen rendition decodable on every
// supported platform: jpeg → webp → png → avif → other.
const DERIVATIVE_FORMAT_RANK: Record<string, number> = {
  jpeg: 0, jpg: 0, webp: 1, png: 2, avif: 3,
};

/**
 * Resolve the delivery URI `CachedImage` will request for a source.
 *
 * Resolution order when `downscaleWidth` is set:
 *   1. `media[].derivatives` — the pre-rendered rendition ladder from the
 *      listing media contract. The smallest rendition covering the
 *      physical pixel target wins (largest available when the target
 *      exceeds the ladder). These are real processed files (correct EXIF
 *      orientation, preserved ICC) and work on plain S3/MinIO origins
 *      where CDN resize parameters are a silent no-op. The `lqip` variant
 *      is a 20px placeholder, never a delivery source, so it is excluded.
 *   2. CDN resize parameters for supported providers — Cloudinary
 *      (`/upload/` → `/upload/w_<w>,f_auto,q_auto/`), Imgix (`?w=`),
 *      Supabase Storage (`?width=`), CloudFront (`?w=`).
 *   3. The original URI unchanged for unsupported hosts.
 *
 * Exported so prefetch schedulers (e.g. PinterestMasonryGrid's
 * viewability prefetch) can warm the exact disk-cache key the rendered
 * image will use — warming the raw `uri` misses the cache entirely when
 * the render path swaps in a derivative rendition or appends CDN resize
 * parameters.
 */
export function resolveCachedImageSourceUri(
  uri: string,
  options: {
    downscaleWidth?: number;
    derivatives?: ListingMediaDerivative[];
    cacheBuster?: string;
  } = {},
): string {
  const { downscaleWidth, derivatives, cacheBuster } = options;
  if (!uri) return uri;
  let result = uri;

  if (downscaleWidth && downscaleWidth > 0) {
    // Convert logical dp → physical pixels with a small overscan factor
    // (1.1×) to handle minor scale changes without a re-request.
    const physicalWidth = Math.ceil(downscaleWidth * PixelRatio.get() * 1.1);
    const bucketWidth = DERIVATIVE_BUCKETS.find((b) => b >= physicalWidth) ?? physicalWidth;

    if (derivatives && derivatives.length > 0) {
      const candidates = derivatives
        .filter(
          (d) => typeof d.url === 'string' && d.url.length > 0
            && d.variant !== 'lqip'
            && typeof d.width === 'number' && d.width > 0,
        )
        .sort((a, b) => {
          const dw = (a.width ?? 0) - (b.width ?? 0);
          if (dw !== 0) return dw;
          return (DERIVATIVE_FORMAT_RANK[a.format] ?? 4) - (DERIVATIVE_FORMAT_RANK[b.format] ?? 4);
        });
      const covering = candidates.find((d) => (d.width ?? 0) >= bucketWidth);
      if (covering) {
        result = covering.url;
      } else if (candidates.length > 0) {
        // Target exceeds the ladder — serve the widest rendition in the
        // most broadly decodable format (candidates are sorted by width,
        // then format rank, so the first of the widest entries is the
        // preferred format at maximum width).
        const maxWidth = candidates[candidates.length - 1].width ?? 0;
        const widest = candidates.find((d) => (d.width ?? 0) === maxWidth);
        if (widest) result = widest.url;
      }
    }
    // Cloudinary: /upload/ → /upload/w_<width>,f_auto,q_auto/
    else if (/cloudinary\.com|res\.cloudinary\.com/i.test(uri)) {
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
}

function CachedImageComponent({
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
  derivatives,
  sharedTransitionTag,
  accessibilityRole,
  accessibilityLabel,
  accessibilityElementsHidden,
  accessible,
}: CachedImageProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
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
        withTiming(1, { duration: Motion.duration.crawl, easing: Easing.inOut(Easing.ease) }),
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

  // Image resolution policy — resolved through the shared
  // `resolveCachedImageSourceUri` so the rendered source and any prefetch
  // scheduler agree on the exact disk-cache key. The `downscaleWidth` prop
  // is logical dp; the resolver handles dp → physical px conversion, the
  // `media[].derivatives` ladder, and CDN-param fallback.
  const sourceUri = React.useMemo(
    () => resolveCachedImageSourceUri(uri, { downscaleWidth, derivatives, cacheBuster }),
    [uri, cacheBuster, downscaleWidth, derivatives],
  );

  // Video resize follows the media contract's `fit`, forwarded by callers
  // via `contentFit` — a media item that declares 'contain' must not be
  // force-cropped to COVER.
  const videoResizeMode = React.useMemo(() => {
    switch (contentFit) {
      case 'fill':
        return ResizeMode.STRETCH;
      case 'contain':
      case 'none':
      case 'scale-down':
        return ResizeMode.CONTAIN;
      case 'cover':
      default:
        return ResizeMode.COVER;
    }
  }, [contentFit]);

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
    previewOpacity.value = withTiming(0, { duration: Motion.duration.touch });
    onError?.();
  }, [imageOpacity, previewOpacity, onError]);

  // Honest placeholder for missing images — no blank rectangles
  if (!uri) {
    return (
      <View
        style={[styles.container, style as StyleProp<ViewStyle>, { backgroundColor: colors.surface }, containerStyle]}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityElementsHidden={accessibilityElementsHidden}
        accessible={accessible}
      >
        <ImageEmptyGraphic
          label={emptyLabel}
          icon={emptyIcon}
          style={[styles.image, style]}
        />
      </View>
    );
  }

  return (
    <View
      style={[styles.container, style as StyleProp<ViewStyle>, { backgroundColor: colors.surface }, containerStyle]}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={accessibilityElementsHidden}
      accessible={accessible}
    >
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
            // Match the main image's focal crop so the LQIP → full-res
            // crossfade doesn't visibly shift the framing.
            contentPosition={contentPosition}
            transition={0}
            cachePolicy="memory-disk"
            priority={effectivePriority}
            recyclingKey={`preview-${sourceUri}`}
            enforceEarlyResizing
          />
        </Reanimated.View>
      )}

      <Reanimated.View
        style={[StyleSheet.absoluteFill, imageStyle]}
        sharedTransitionTag={sharedTransitionTag}
      >
        {isVideoSource ? (
          <Video
            source={{ uri: sourceUri }}
            style={[styles.image, style as StyleProp<ViewStyle>]}
            resizeMode={videoResizeMode}
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
          <View style={[styles.playBadgeCircle, { backgroundColor: colors.overlay }]}>
            <Ionicons name="play" size={14} color={colors.surfaceElevated} />
          </View>
        </View>
      )}
      </>
      )}
    </View>
  );
}

/**
 * Custom comparator for React.memo — checks the props that actually affect
 * the rendered output, skipping `style`/`containerStyle` when they are
 * StyleSheet references (referentially stable). This prevents the 565
 * CachedImage instances from re-rendering on every parent update (research
 * doc §5: "76 React.memo usages for 565 CachedImage usages").
 */
function cachedImagePropsEqual(prev: CachedImageProps, next: CachedImageProps): boolean {
  if (
    prev.uri !== next.uri ||
    prev.previewUri !== next.previewUri ||
    prev.contentFit !== next.contentFit ||
    prev.transition !== next.transition ||
    prev.blurhash !== next.blurhash ||
    prev.priority !== next.priority ||
    prev.isVisible !== next.isVisible ||
    prev.cacheBuster !== next.cacheBuster ||
    prev.downscaleWidth !== next.downscaleWidth ||
    prev.derivatives !== next.derivatives ||
    prev.sharedTransitionTag !== next.sharedTransitionTag ||
    prev.shouldPlay !== next.shouldPlay ||
    prev.isLooping !== next.isLooping ||
    prev.showPlayBadge !== next.showPlayBadge ||
    prev.emptyLabel !== next.emptyLabel ||
    prev.emptyIcon !== next.emptyIcon ||
    prev.accessibilityRole !== next.accessibilityRole ||
    prev.accessibilityLabel !== next.accessibilityLabel ||
    prev.accessibilityElementsHidden !== next.accessibilityElementsHidden ||
    prev.accessible !== next.accessible ||
    prev.onError !== next.onError ||
    prev.onLoad !== next.onLoad
  ) {
    return false;
  }
  // Focal point is an object — shallow compare
  const pf = prev.focalPoint;
  const nf = next.focalPoint;
  if (pf && nf) {
    if (pf.x !== nf.x || pf.y !== nf.y) return false;
  } else if (pf !== nf) {
    return false;
  }
  // Skip style comparison when both are StyleSheet references (numbers —
  // StyleSheet.create returns opaque numeric IDs that are referentially
  // stable). Only deep-check when at least one side is a dynamic object.
  if (prev.style !== next.style) {
    // If either is a number (StyleSheet ID), they're stable — only
    // re-render if the reference actually changed, which the !== above
    // already caught. For dynamic style objects/arrays we let React's
    // default shallow compare handle it by returning false.
    if (typeof prev.style !== 'number' && typeof next.style !== 'number') {
      return false;
    }
  }
  if (prev.containerStyle !== next.containerStyle) {
    if (typeof prev.containerStyle !== 'number' && typeof next.containerStyle !== 'number') {
      return false;
    }
  }
  return true;
}

/**
 * Memoized CachedImage — prevents unnecessary re-renders across the 565
 * usage sites. The custom comparator checks content-affecting props and
 * skips style comparison when styles are StyleSheet references (research
 * doc §6: "Wrap CachedImage in React.memo with a custom comparator").
 */
export const CachedImage = React.memo(CachedImageComponent, cachedImagePropsEqual);

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
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
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Stroke.standard,
    borderColor: colors.surfaceElevated,
  },
});
