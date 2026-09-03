/**
 * FilterPreview — Skia GPU-accelerated filter preview components.
 *
 * Extracted from the original FilterStrip.tsx as part of the shared-abstraction
 * split. Contains:
 *   - SkiaFilterPreview: renders a filter thumbnail using Skia Canvas + ColorMatrix
 *   - FilterThumbnail: circular thumbnail with gradient ring, staggered entrance,
 *     and live intensity-interpolated Skia preview
 *
 * @module FilterPreview
 */

import React, { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  useDerivedValue,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import {
  Canvas as SkiaCanvas,
  Image as SkiaImage,
  ColorMatrix,
  useImage,
} from '@shopify/react-native-skia';

import { Typography, Stroke, Space } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { AnimatedPressable } from '../../AnimatedPressable';
import { useMotionConfig } from '../../../hooks/useMotionConfig';
import {
  IDENTITY_MATRIX,
  type FilterConfig,
} from './filterConfig';

// ── Thumbnail diameter (circular, Instagram-style) ─────────────────
export const THUMB_SIZE = 64;
export const THUMB_GAP = Space.sm + 2;

// ── Skia GPU-accelerated filter preview ────────────────────────────
// Renders a filter thumbnail using Skia Canvas + ColorMatrix for
// GPU-accelerated color processing. Replaces the legacy CSS filter
// overlay approach. Falls back to a gradient placeholder when no
// image is available or the image is still loading.

interface SkiaFilterPreviewProps {
  previewUri?: string;
  /**
   * Color matrix — either a Reanimated SharedValue<number[]> for
   * real-time intensity interpolation on the UI thread, or a static
   * number[] for fixed-intensity previews.
   */
  colorMatrix: SharedValue<number[]> | number[];
  size: number;
}

const SkiaFilterPreview = React.memo(function SkiaFilterPreview({
  previewUri,
  colorMatrix,
  size,
}: SkiaFilterPreviewProps) {
  // useImage is a hook — always call it unconditionally (hooks rule).
  // When previewUri is null/undefined, it returns null immediately.
  const skiaImage = useImage(previewUri ?? null, () => {
    // Silently handle load errors — the gradient placeholder will display
  });

  // No image available (no URI or still loading / failed) → gradient placeholder
  if (!previewUri || !skiaImage) {
    return (
      <LinearGradient
        colors={['#c9a46a', '#8a6a3a', '#3c2a1a']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    );
  }

  return (
    <SkiaCanvas style={{ width: size, height: size }}>
      <SkiaImage
        image={skiaImage}
        x={0}
        y={0}
        width={size}
        height={size}
        fit="cover"
      >
        <ColorMatrix matrix={colorMatrix} />
      </SkiaImage>
    </SkiaCanvas>
  );
});

// ── Filter thumbnail (circular, real preview, gradient ring) ───────
interface FilterThumbnailProps {
  filter: FilterConfig;
  isActive: boolean;
  previewUri?: string;
  intensitySV: SharedValue<number>;
  onPress: () => void;
  spring: ReturnType<typeof useMotionConfig>['spring'];
  reduceMotion: boolean;
  staggerIndex: number;
  mounted: boolean;
  accessibilityLabel: string;
  accessibilityHint: string;
}

export function FilterThumbnail({
  filter,
  isActive,
  previewUri,
  intensitySV,
  onPress,
  spring,
  reduceMotion,
  staggerIndex,
  mounted,
  accessibilityLabel,
  accessibilityHint,
}: FilterThumbnailProps) {
  // Stagger entrance: each filter fades in with 50ms delay
  const appearSV = useSharedValue(mounted ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) {
      appearSV.value = 1;
    } else {
      appearSV.value = withDelay(staggerIndex * 50, withSpring(1, spring.entrance));
    }
  }, [appearSV, reduceMotion, spring, staggerIndex]);

  const appearStyle = useAnimatedStyle(() => ({
    opacity: interpolate(appearSV.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(appearSV.value, [0, 1], [0.8, 1], Extrapolation.CLAMP) }],
  }));

  // Active scale up (1.1x) + inactive 0.8 opacity
  const activeScaleSV = useSharedValue(isActive ? 1.1 : 1);
  const activeOpacitySV = useSharedValue(isActive ? 1 : 0.8);
  useEffect(() => {
    activeScaleSV.value = withSpring(isActive ? 1.1 : 1, spring.entrance);
    activeOpacitySV.value = withSpring(isActive ? 1 : 0.8, spring.entrance);
  }, [isActive, spring, activeScaleSV, activeOpacitySV]);

  const activeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: activeScaleSV.value }],
    opacity: activeOpacitySV.value,
  }));

  // Gradient ring spring (Instagram-style) — animates in/out on selection
  const ringScaleSV = useSharedValue(isActive ? 1 : 0);
  const ringOpacitySV = useSharedValue(isActive ? 1 : 0);
  useEffect(() => {
    ringScaleSV.value = withSpring(isActive ? 1 : 0, spring.entrance);
    ringOpacitySV.value = withSpring(isActive ? 1 : 0, spring.entrance);
  }, [isActive, spring, ringScaleSV, ringOpacitySV]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScaleSV.value }],
    opacity: ringOpacitySV.value,
  }));

  // GPU-accelerated color matrix — interpolates between identity and
  // the filter's target matrix by live intensity (0..1) on the UI thread
  // via Reanimated shared value. At intensity 0 → identity (original),
  // at intensity 1 → full filter effect.
  const filterMatrix = filter.colorMatrix ?? IDENTITY_MATRIX;
  const colorMatrixSV = useDerivedValue<number[]>(() => {
    const t = intensitySV.value;
    return IDENTITY_MATRIX.map((id, i) => id + (filterMatrix[i] - id) * t);
  });

  return (
    <Reanimated.View style={[thumbnailStyles.filterCard, appearStyle]}>
      <Reanimated.View style={activeStyle}>
        <AnimatedPressable
          style={thumbnailStyles.thumbBtn}
          onPress={onPress}
          scaleValue={0.95}
          activeOpacity={0.85}
          hapticFeedback="selection"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          accessibilityRole="button"
          accessibilityState={{ selected: isActive }}
        >
          {/* Gradient ring (Instagram-style) */}
          <Reanimated.View style={[thumbnailStyles.ringWrap, ringStyle]} pointerEvents="none">
            <LinearGradient
              colors={['#feda75', '#fa7e1e', '#d62976', '#962fbf', '#4f5bd5']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={thumbnailStyles.ringGradient}
            />
          </Reanimated.View>

          {/* Circular thumbnail — GPU-accelerated Skia ColorMatrix preview */}
          <View style={thumbnailStyles.thumbWrap}>
            <SkiaFilterPreview
              previewUri={previewUri}
              colorMatrix={colorMatrixSV}
              size={THUMB_SIZE}
            />
          </View>
        </AnimatedPressable>
      </Reanimated.View>
      <Text style={[thumbnailStyles.filterLabel, isActive && thumbnailStyles.filterLabelActive]}>
        {filter.label}
      </Text>
    </Reanimated.View>
  );
}

// ── Thumbnail styles ───────────────────────────────────────────────
const thumbnailStyles = StyleSheet.create({
  filterCard: {
    alignItems: 'center',
    gap: 6,
  },
  thumbBtn: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringWrap: {
    position: 'absolute',
    width: THUMB_SIZE + 6,
    height: THUMB_SIZE + 6,
    borderRadius: (THUMB_SIZE + 6) / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringGradient: {
    width: THUMB_SIZE + 6,
    height: THUMB_SIZE + 6,
    borderRadius: (THUMB_SIZE + 6) / 2,
    padding: Stroke.emphasis,
  },
  thumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: '#333',
    borderWidth: Stroke.standard,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  filterLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: Typography.family.medium,
    color: 'rgba(255,255,255,0.65)',
  },
  filterLabelActive: {
    color: '#fff',
    fontFamily: Typography.family.bold,
  },
});
