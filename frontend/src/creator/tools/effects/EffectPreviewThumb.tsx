/**
 * EffectPreviewThumb — a native GPU-rendered thumbnail showing a filter
 * preset applied to the actual media being edited.
 *
 * Uses @shopify/react-native-skia Canvas + Image + ColorMatrix to render a
 * real preview. This replaces the legacy CSS-filter approach (which was
 * ignored on native) with true GPU rendering — the same matrix that Skia
 * executes here is used in the canvas, viewer, and export, guaranteeing
 * WYSIWYG (spec 07 §1, §3).
 *
 * Lightroom 2026 rail language:
 *   - 56×56pt thumbnails, 8px radius
 *   - Selected: 2pt brand border (not a heavy ring)
 *   - Name shown only for the selected filter (not every filter)
 *   - "Original" preset renders a crossed-circle glyph (close-circle-outline)
 *     instead of the source image — the Lightroom "no adjustment" signal
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
import { Ionicons } from '@expo/vector-icons';
import { Space, FontSize, FontFamily, Radius, Stroke, Control } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { withAlpha } from '../../../components/poster/shared/colorUtils';
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
  /** Thumbnail edge length in pt. Default 56. */
  size?: number;
  /** Effect intensity 0..1 (interpolates between identity and full effect). */
  intensity?: number;
  /** When true, show the original (unfiltered) image — used for before/after. */
  showOriginal?: boolean;
  /** When true (default), render the preset name below the thumbnail. */
  showName?: boolean;
}

/**
 * Render a native Skia preview with the preset's color matrix applied.
 * Selected state shows a 2pt brand border; unselected is borderless. The
 * 44pt touch target is enforced via the Pressable wrapper. The "original"
 * preset renders a crossed-circle glyph instead of the source image.
 */
export function EffectPreviewThumb({
  sourceUri,
  preset,
  selected,
  onPress,
  size = 56,
  intensity,
  showOriginal = false,
  showName = true,
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

  const isOriginal = preset.id === 'original';

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={isOriginal ? 'No filter' : `${preset.name} filter preview`}
      accessibilityHint={isOriginal ? 'Removes any applied filter' : `Applies the ${preset.name} filter to your photo`}
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
            backgroundColor: selected ? withAlpha(colors.brand, 0.15) : 'transparent',
          },
        ]}
      >
        {isOriginal ? (
          // Lightroom "no adjustment" signal — crossed-circle, not the image.
          <View style={[styles.noneGlyph, { width: size, height: size }]}>
            <Ionicons
              name="close-circle-outline"
              size={Math.round(size * 0.5)}
              color={selected ? colors.brand : colors.textMuted}
            />
          </View>
        ) : skiaImage ? (
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
          <View style={[styles.placeholder, { backgroundColor: colors.surfaceAlt }]} />
        )}
      </View>
      {showName && (
        <Text
          style={[
            styles.label,
            {
              color: selected ? colors.textSecondary : colors.textMuted,
              fontFamily: FontFamily.regular,
            },
          ]}
          numberOfLines={1}
        >
          {isOriginal ? 'None' : preset.name}
        </Text>
      )}
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
  noneGlyph: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    flex: 1,
  },
  label: {
    fontSize: FontSize.micro + 1,
    lineHeight: FontSize.micro + 4,
    textAlign: 'center',
    marginTop: Space.xs,
  },
});
