import React, { memo } from 'react';
import {
  View,
  useWindowDimensions,
  ViewStyle,
  StyleSheet,
  DimensionValue,
} from 'react-native';
import Reanimated from 'react-native-reanimated';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Radius } from '../../../theme/designTokens';
import { useSkeletonShimmer } from './useSkeletonShimmer';

/**
 * SkeletonPrimitives — the base building blocks for the flagship skeleton
 * system.
 *
 * 2026 research (August):
 *   - Skeletons must match the final layout geometry exactly (same spacing,
 *     radius, density).
 *   - Static placeholders are underrated — for short loads, gray blocks are
 *     enough. Shimmer is opt-in via the `shimmer` prop.
 *   - Shimmer must respect reduced motion and be subtle in dark mode.
 *
 * All colors come from theme tokens (`colors.surfaceAlt`). No hardcoded
 * values. The shimmer overlay is a subtle opacity pulse (not a gradient
 * sweep) so it is cheap on low-end devices and reads as a gentle "still
 * loading" breath rather than decoration.
 */

/** Resolve a width that may be a number or a percentage string. */
function resolveWidth(width: number | string): DimensionValue {
  return width as DimensionValue;
}

/**
 * Base skeleton block — a gray placeholder with an optional subtle shimmer
 * overlay (opacity pulse, not a gradient sweep).
 *
 * The block fills its declared `width` × `height` with `colors.surfaceAlt`
 * and rounds the corners with `radius` (default `Radius.sm`). When `shimmer`
 * is true and motion is not reduced, a subtle opacity pulse overlay breathes
 * on top of the block to signal "still loading".
 */
export const SkeletonBlock = memo(function SkeletonBlock({
  width,
  height,
  radius = Radius.sm,
  style,
  shimmer = true,
}: {
  width: number | string;
  height: number;
  radius?: number;
  style?: ViewStyle;
  shimmer?: boolean;
}) {
  const theme = useAppTheme();
  const { shimmerStyle, enabled } = useSkeletonShimmer(!shimmer);

  return (
    <View
      style={[
        {
          width: resolveWidth(width),
          height,
          borderRadius: radius,
          backgroundColor: theme.colors.surfaceAlt,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {enabled ? (
        <Reanimated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: theme.colors.scrimTextPrimary },
            shimmerStyle,
          ]}
        />
      ) : null}
    </View>
  );
});

/**
 * Skeleton circle — for avatars and icons. Renders a square block with a full
 * radius so it reads as a circular placeholder.
 */
export const SkeletonCircle = memo(function SkeletonCircle({
  size,
  style,
  shimmer = true,
}: {
  size: number;
  style?: ViewStyle;
  shimmer?: boolean;
}) {
  return (
    <SkeletonBlock
      width={size}
      height={size}
      radius={size / 2}
      style={style}
      shimmer={shimmer}
    />
  );
});

/**
 * Skeleton text line — for text placeholders. Defaults to a 14pt-tall line
 * (matching `TypographyV2.body.size`) with a small radius so it reads as a
 * line of text rather than a card.
 */
export const SkeletonTextLine = memo(function SkeletonTextLine({
  width,
  height = 14,
  style,
  shimmer = true,
}: {
  width: number | string;
  height?: number;
  style?: ViewStyle;
  shimmer?: boolean;
}) {
  return (
    <SkeletonBlock
      width={width}
      height={height}
      radius={Math.min(height / 2, Radius.sm)}
      style={style}
      shimmer={shimmer}
    />
  );
});

/**
 * Skeleton image — for media placeholders with a correct aspect ratio. The
 * height is derived from the width and aspect ratio so the skeleton occupies
 * the same space the final image will, preventing layout shift.
 *
 * For percentage widths, the height is computed from the screen width at
 * render time via `useWindowDimensions` so the skeleton matches the final
 * image footprint.
 */
export const SkeletonImage = memo(function SkeletonImage({
  aspectRatio = 1,
  width = '100%',
  radius = Radius.lg,
  style,
  shimmer = true,
}: {
  aspectRatio?: number;
  width?: number | string;
  radius?: number;
  style?: ViewStyle;
  shimmer?: boolean;
}) {
  const { width: screenWidth } = useWindowDimensions();

  let computedHeight: number;
  if (typeof width === 'number') {
    computedHeight = width / aspectRatio;
  } else {
    // Percentage width — approximate from screen width. The parent container
    // is responsible for the actual layout; this gives a close-enough height
    // for the skeleton to match the final image footprint.
    const pct = parseFloat(width);
    const px = (screenWidth * pct) / 100;
    computedHeight = px / aspectRatio;
  }

  return (
    <SkeletonBlock
      width={width}
      height={computedHeight}
      radius={radius}
      style={style}
      shimmer={shimmer}
    />
  );
});
