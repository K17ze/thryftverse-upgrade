/**
 * EffectPreviewThumb — a native GPU-rendered thumbnail showing a filter
 * preset applied to the actual media being edited.
 *
 * Uses @shopify/react-native-skia Canvas + Image + ColorMatrix to render a
 * real preview at 80×80pt. This replaces the legacy CSS-filter approach
 * (which was ignored on native) with true GPU rendering — the same matrix
 * that Skia executes here is used in the canvas, viewer, and export,
 * guaranteeing WYSIWYG (spec 07 §1, §3).
 *
 * Caching: thumbnails are cached by source URI + preset ID + preset version
 * to avoid re-rendering on every scroll. The cache is a module-level Map
 * (in-memory, per session).
 *
 * Per AGENTS.md §4: authored composition, clear hierarchy, restraint.
 * Per AGENTS.md §13/§18: light haptic on press, 44pt touch target,
 * accessibility label and selected state.
 * Per AGENTS.md §11: no CSS filter strings — real Skia rendering only.
 */
import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Canvas, Image as SkiaImage, ColorMatrix, Lerp, useImage } from '@shopify/react-native-skia';
import { Space, FontSize, FontFamily, Radius, Stroke, Control } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import {
  type EffectPreset,
  IDENTITY_MATRIX,
  getThumbnailMatrix,
  interpolateMatrix,
} from './EffectTypes';

// ── Thumbnail render cache ──────────────────────────────────────────────
// Keyed by source URI + preset ID + version. Stores the interpolated matrix
// so we skip re-computation on re-render. The Skia Canvas itself is GPU-
// cached by Skia's internal texture cache.

interface CacheEntry {
  matrix: number[];
  version: number;
}

const thumbCache = new Map<string, CacheEntry>();

function cacheKey(sourceUri: string, presetId: string, version: number): string {
  return `${sourceUri}::${presetId}::${version}`;
}

// ── Component ───────────────────────────────────────────────────────────

export interface EffectPreviewThumbProps {
  sourceUri: string;
  preset: EffectPreset;
  selected: boolean;
  onPress: () => void;
  /** Thumbnail edge length in pt. Default 80. */
  size?: number;
  /** Effect intensity 0..1 (interpolates between identity and full effect). */
  intensity?: number;
  /** When true, show the original (unfiltered) image — used for before/after. */
  showOriginal?: boolean;
}

/**
 * Render an 80×80pt (default) native Skia preview with the preset's color
 * matrix applied. Selected state shows a 2pt brand border; unselected is
 * borderless. The 44pt touch target is enforced via the Pressable wrapper.
 */
export function EffectPreviewThumb({
  sourceUri,
  preset,
  selected,
  onPress,
  size = 80,
  intensity,
  showOriginal = false,
}: EffectPreviewThumbProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();

  // Load the source image via Skia's useImage hook (returns SkImage | null).
  const skiaImage = useImage(sourceUri);

  // Resolve the effective intensity: explicit prop > preset default > 1.
  const effectiveIntensity = intensity ?? preset.intensity ?? 1;

  // Compute the interpolated matrix (identity ← → full effect).
  // Cached per source+preset+version to avoid re-computation.
  const matrix = useMemo(() => {
    if (showOriginal) return [...IDENTITY_MATRIX];

    const key = cacheKey(sourceUri, preset.id, preset.version);
    const cached = thumbCache.get(key);
    const targetMatrix = getThumbnailMatrix(preset);

    // If intensity is 1 (default), cache the raw target matrix.
    if (effectiveIntensity >= 1) {
      if (cached && cached.version === preset.version) {
        return cached.matrix;
      }
      const entry: CacheEntry = { matrix: targetMatrix, version: preset.version };
      thumbCache.set(key, entry);
      return targetMatrix;
    }

    // For non-default intensity, interpolate (not cached — rare path).
    return interpolateMatrix(targetMatrix, effectiveIntensity);
  }, [sourceUri, preset, effectiveIntensity, showOriginal]);

  const handlePress = useCallback(() => {
    if (!reducedMotion) haptic.light();
    onPress();
  }, [haptic, onPress, reducedMotion]);

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${preset.name} filter preview`}
      accessibilityHint={`Applies the ${preset.name} filter to your photo`}
      style={({ pressed }) => [
        styles.touch,
        { opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View
        style={[
          styles.thumbWrap,
          {
            width: size,
            height: size,
            borderRadius: Radius.md,
            borderColor: selected ? colors.brand : 'transparent',
            borderWidth: selected ? Stroke.emphasis : 0,
          },
        ]}
      >
        {skiaImage ? (
          <Canvas style={{ width: size, height: size }}>
            <SkiaImage
              image={skiaImage}
              x={0}
              y={0}
              width={size}
              height={size}
              fit="cover"
            >
              {showOriginal || effectiveIntensity <= 0 ? (
                // No filter — render identity (no ColorMatrix child).
                null
              ) : effectiveIntensity >= 1 ? (
                <ColorMatrix matrix={matrix} />
              ) : (
                <Lerp t={effectiveIntensity}>
                  <ColorMatrix matrix={[...IDENTITY_MATRIX]} />
                  <ColorMatrix matrix={matrix} />
                </Lerp>
              )}
            </SkiaImage>
          </Canvas>
        ) : (
          // Loading placeholder — flat, no spinner (matches final silhouette).
          <View style={styles.placeholder} />
        )}
      </View>
      <Text
        style={[
          styles.label,
          {
            color: selected ? colors.textPrimary : colors.textMuted,
            fontFamily: FontFamily.regular,
          },
        ]}
        numberOfLines={1}
      >
        {preset.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: {
    alignItems: 'center',
    minWidth: Control.hit,
    minHeight: Control.hit,
    justifyContent: 'center',
  },
  thumbWrap: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  placeholder: {
    flex: 1,
    backgroundColor: 'rgba(128,128,128,0.08)',
  },
  label: {
    fontSize: FontSize.micro,
    lineHeight: FontSize.micro + 4,
    textAlign: 'center',
    marginTop: Space.xs,
  },
});
