import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, ImageStyle, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from './CachedImage';
import { useAppTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { isVideoUri } from '../utils/media';

interface MediaPreviewProps {
  uri: string;
  posterUri?: string;
  blurhash?: string;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  priority?: 'low' | 'normal' | 'high';
  isVisible?: boolean;
  cacheBuster?: string;
  focalPoint?: { x: number; y: number };
  /**
   * Autoplay control for video sources. When true the video plays muted +
   * looped (ambient preview). When false it shows the poster frame with a
   * small play badge. Wire this to a viewability hook
   * (e.g. `useViewabilityPlayback`) so only the most-visible card plays.
   */
  shouldPlay?: boolean;
  /** Tap handler — usually opens the fullscreen media viewer. */
  onPress?: () => void;
  /** Long-press handler — usually opens the quick-action sheet. */
  onLongPress?: () => void;
  /** Show a play badge over video poster frames (default true). */
  showPlayBadge?: boolean;
  emptyLabel?: string;
  emptyIcon?: keyof typeof Ionicons.glyphMap;
  /**
   * Image resolution policy: target display width in pixels.
   * Passed through to CachedImage for CDN-aware downscaling so grid
   * thumbnails do not download full-resolution images.
   * (LIST_RENDERING_POLICY.md §5.1 / audit §Caching/prefetch)
   */
  downscaleWidth?: number;
}

/**
 * MediaPreview — the canonical media surface for feed cards, discovery tiles,
 * and any context where media is the primary visual anchor.
 *
 * Design intent (audit §Media pipeline, AGENTS §15, §27.4):
 *   - images load with crossfade + blurhash/preview placeholder (no pop);
 *   - video shows a poster frame in tiny cards — no native video chrome;
 *   - video autoplays only when `shouldPlay` is true (viewability-driven),
 *     muted by default, looped for ambient surfaces;
 *   - offscreen / not-playing video releases the player (shouldPlay=false);
 *   - tap and long-press are routed without accidental media-tap closes;
 *   - reduced motion collapses the load crossfade to instant.
 *
 * This wraps `CachedImage` (the shared media pipeline) and adds the
 * press-handling + play-badge layer appropriate for card contexts. For
 * full-bleed media stages (product detail, viewer) use `CachedImage` or the
 * dedicated viewer components directly.
 */
export function MediaPreview({
  uri,
  posterUri,
  blurhash,
  style,
  containerStyle,
  contentFit = 'cover',
  priority = 'normal',
  isVisible = true,
  cacheBuster,
  focalPoint,
  shouldPlay = false,
  onPress,
  onLongPress,
  showPlayBadge = true,
  emptyLabel,
  emptyIcon,
  downscaleWidth,
}: MediaPreviewProps) {
  const { colors } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const isVideo = isVideoUri(uri);

  const media = (
    <CachedImage
      uri={uri}
      previewUri={posterUri}
      blurhash={blurhash}
      style={style}
      containerStyle={containerStyle}
      contentFit={contentFit}
      priority={priority}
      isVisible={isVisible}
      cacheBuster={cacheBuster}
      focalPoint={focalPoint}
      shouldPlay={shouldPlay}
      isLooping
      showPlayBadge={isVideo && showPlayBadge}
      emptyLabel={emptyLabel}
      emptyIcon={emptyIcon}
      downscaleWidth={downscaleWidth}
    />
  );

  if (!onPress && !onLongPress) {
    return media;
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      hitSlop={0}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={isVideo ? 'Play video' : 'View image'}
      accessibilityHint={onPress ? 'Opens the full media view' : undefined}
      style={({ pressed }) => [
        styles.pressRoot,
        pressed && !reducedMotionEnabled && styles.pressed,
      ]}
    >
      {media}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressRoot: {
    position: 'relative',
  },
  pressed: {
    opacity: 0.96,
  },
});
