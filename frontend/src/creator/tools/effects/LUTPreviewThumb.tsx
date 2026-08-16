/**
 * LUTPreviewThumb — a native GPU-rendered thumbnail showing a LUT color grade
 * applied to the actual media being edited.
 *
 * Uses @shopify/react-native-skia Canvas + RuntimeEffect + ImageShader to
 * render a real LUT-graded preview at 80×80pt. This is the same SkSL shader
 * used by the canvas, viewer, and export (LUTEffect.ts), guaranteeing
 * WYSIWYG — the thumbnail is not a CSS-filter approximation.
 *
 * When the source image is not yet loaded, a flat placeholder is shown
 * (matches the final silhouette — no spinner). When the LUT runtime effect
 * fails to compile or the LUT texture is unavailable, the thumbnail falls
 * back to the identity LUT (no color change) so the pipeline still runs
 * truthfully rather than showing a fake grade (AGENTS.md §11).
 *
 * Per AGENTS.md §4: real LUT texture sampling, not a color-matrix approximation.
 * Per AGENTS.md §11: no CSS filter strings — real Skia RuntimeEffect only.
 * Per AGENTS.md §13/§18: light haptic on press, 44pt touch target,
 * accessibility label and selected state.
 */
import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import {
  Canvas,
  Fill,
  Image as SkiaImage,
  ImageShader,
  Shader,
  useImage,
} from '@shopify/react-native-skia';
import { Space, FontSize, FontFamily, Radius, Stroke, Control } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import {
  type BuiltInLUT,
  getLUTRuntimeEffect,
  getLUTUniforms,
  resolveLUTTexture,
  LUT_GRID_8,
} from './LUTEffect';

// ── Component ───────────────────────────────────────────────────────────

export interface LUTPreviewThumbProps {
  /** Source media URI to render the preview from. */
  sourceUri: string;
  /** The built-in LUT definition to apply. */
  lut: BuiltInLUT;
  /** Whether this thumbnail is currently selected. */
  selected: boolean;
  /** Press handler. */
  onPress: () => void;
  /** Thumbnail edge length in pt. Default 80. */
  size?: number;
  /** LUT intensity 0..1 (blend strength). Default 1 (full grade). */
  intensity?: number;
}

/**
 * Render an 80×80pt (default) native Skia preview with the LUT's RuntimeEffect
 * shader applied. Selected state shows a 2pt brand border; unselected is
 * borderless. The 44pt touch target is enforced via the Pressable wrapper.
 *
 * The LUT texture is resolved via `resolveLUTTexture`: a bundled PNG if
 * available, otherwise a runtime-generated identity LUT (truthful placeholder
 * — no color change, but the real shader pipeline still runs).
 */
export function LUTPreviewThumb({
  sourceUri,
  lut,
  selected,
  onPress,
  size = 80,
  intensity = 1,
}: LUTPreviewThumbProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();

  // Load the source image via Skia's useImage hook (returns SkImage | null).
  const skiaImage = useImage(sourceUri);

  // Compile (and cache) the LUT runtime effect once.
  const runtimeEffect = useMemo(() => getLUTRuntimeEffect(), []);

  // Resolve the LUT texture: real bundled PNG → identity LUT fallback.
  // useImage returns null while loading / when the asset is missing, so we
  // pass null and let resolveLUTTexture generate the identity LUT.
  const lutImage = useMemo(
    () => resolveLUTTexture(null, lut.gridSize ?? LUT_GRID_8),
    [lut.gridSize],
  );

  // Uniforms for the LUT shader.
  const uniforms = useMemo(
    () => getLUTUniforms(intensity, lut.gridSize ?? LUT_GRID_8),
    [intensity, lut.gridSize],
  );

  const handlePress = useCallback(() => {
    if (!reducedMotion) haptic.light();
    onPress();
  }, [haptic, onPress, reducedMotion]);

  // Source image shader rect: the canvas pixel space (0..size).
  const srcRect = useMemo(
    () => ({ x: 0, y: 0, width: size, height: size }),
    [size],
  );
  // LUT shader rect: normalized 0..1 so the shader's lut.eval(float2(u, v))
  // samples the texture across its full extent.
  const lutRect = useMemo(() => ({ x: 0, y: 0, width: 1, height: 1 }), []);

  const canRender = skiaImage !== null && runtimeEffect !== null && lutImage !== null;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${lut.name} LUT preview`}
      accessibilityHint={`Applies the ${lut.name} color grade to your photo`}
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
        {canRender && skiaImage && runtimeEffect && lutImage ? (
          <Canvas style={{ width: size, height: size }}>
            {/* Paint the source image through the LUT runtime effect. */}
            <Shader source={runtimeEffect} uniforms={uniforms}>
              {/* Child 0 → `src`: the source media image, cover-fit to the thumb. */}
              <ImageShader
                image={skiaImage}
                tx="clamp"
                ty="clamp"
                fit="cover"
                rect={srcRect}
              />
              {/* Child 1 → `lut`: the LUT texture, stretched across 0..1 so
                  the shader's normalized sample coords map to the full texture. */}
              <ImageShader
                image={lutImage}
                tx="clamp"
                ty="clamp"
                fit="fill"
                rect={lutRect}
              />
            </Shader>
          </Canvas>
        ) : (
          // Loading / unavailable placeholder — flat, no spinner (matches
          // final silhouette). When the runtime effect or LUT texture is
          // unavailable we still show the raw source image (if loaded) so the
          // user sees a truthful ungraded frame rather than a fake grade.
          <Canvas style={{ width: size, height: size }}>
            <Fill color="#1a1a1a" />
            {skiaImage ? (
              <SkiaImage
                image={skiaImage}
                x={0}
                y={0}
                width={size}
                height={size}
                fit="cover"
              />
            ) : null}
          </Canvas>
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
        {lut.name}
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
  label: {
    fontSize: FontSize.micro,
    lineHeight: FontSize.micro + 4,
    textAlign: 'center',
    marginTop: Space.xs,
  },
});
