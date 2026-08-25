/**
 * Eyedropper — color sampling tool for the CreatorColorPicker.
 *
 * Per spec 04_COLOR_SYSTEM_ZERO_GAP §3:
 * Sample the actual composition:
 * - Skia/canvas snapshot or GPU readback strategy;
 * - magnifying loupe;
 * - crosshair;
 * - current pixel preview;
 * - light haptic on commit;
 * - video samples current displayed frame.
 *
 * Alternative accessibility path: expose dominant/media palette swatches
 * without spatial sampling.
 *
 * ── Current implementation ──
 * The full spatial eyedropper (canvas pixel sampling) requires platform-
 * specific GPU readback via Skia. This is documented below for future
 * implementation. For now, the eyedropper button activates a media-palette
 * mode that shows dominant color swatches extracted from the current
 * media. This is the accessibility alternative path from the spec.
 *
 * ── Full eyedropper architecture (future Skia implementation) ──
 *
 * 1. SNAPSHOT: Use Skia's `Surface.makeImageSnapshot()` to capture the
 *    current composition canvas as an SkImage. For video, sample the
 *    current displayed frame via `expo-video`'s frame API.
 *
 * 2. READBACK: Use `SkImage.readPixels(0, 0, width, height)` to get a
 *    Uint8Array of pixel data (RGBA). This runs on the UI thread.
 *
 * 3. LOUPE: Render a magnifying loupe overlay using a Skia Canvas that
 *    shows a zoomed-in region of the snapshot around the user's finger.
 *    The loupe is a circular clip with a 5x-8x zoom factor.
 *
 * 4. CROSSHAIR: Draw a 1px crosshair at the center of the loupe using
 *    Skia `Path` with `strokeWidth=1` and a contrasting color (white
 *    with black outline or vice versa, determined by local luminance).
 *
 * 5. GESTURE: Use `Gesture.Pan()` from RNGH. On `onChange`, read the
 *    pixel at `(e.x, e.y)` from the snapshot data. Update a shared
 *    value with the sampled color for real-time loupe preview.
 *
 * 6. COMMIT: On `onEnd`, fire `Haptics.impactAsync(Light)` and call
 *    `onCommit(sampledColor)`. This creates one undo entry.
 *
 * 7. CANCEL: A dedicated close button or tap outside the sampling area
 *    cancels eyedropper mode without committing.
 *
 * 8. PERFORMANCE: The snapshot is taken once when eyedropper mode
 *    activates. Pixel reads during drag are O(1) array lookups.
 *    The loupe is rendered via Skia on the UI thread for 60fps.
 *
 * 9. PLATFORM NOTES:
 *    - iOS: Skia GPU readback works via Metal.
 *    - Android: Skia GPU readback works via Vulkan/OpenGL ES.
 *    - Web: Use canvas `getImageData()` as a fallback.
 *    - expo-pixel-sampler (community lib) provides synchronous pixel
 *      sampling if Skia readback is unavailable.
 */

import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, Typography, Stroke, Control } from '../../theme/designTokens';
import { IconGrammar } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { PressScale } from '../CreatorAnimations';
import { extractMediaPalette, fallbackPalette } from './MediaPalette';
import { toHexString } from './ColorMath';
import type { CreatorColor, MediaPaletteEntry } from './ColorTypes';

// ── Props ────────────────────────────────────────────────────────────
interface EyedropperProps {
  /** Media URIs to extract colors from (e.g. canvas image layers) */
  mediaUris: string[];
  /** Called when a color is picked from the media palette */
  onPick: (color: CreatorColor) => void;
  /** Style override */
  style?: ViewStyle | ViewStyle[];
}

// ── Component ────────────────────────────────────────────────────────
export function Eyedropper({
  mediaUris,
  onPick,
  style,
}: EyedropperProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = useEyedropperStyles(colors);

  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [palette, setPalette] = useState<MediaPaletteEntry[]>([]);

  const handleActivate = useCallback(async () => {
    haptic.light();
    setActive(true);

    if (mediaUris.length === 0) {
      // No media — show fallback palette
      setPalette(fallbackPalette());
      return;
    }

    setLoading(true);
    try {
      // Extract from the first available media URI
      const extracted = await extractMediaPalette(mediaUris[0]!);
      setPalette(extracted.length > 0 ? extracted : fallbackPalette());
    } catch {
      setPalette(fallbackPalette());
    } finally {
      setLoading(false);
    }
  }, [mediaUris, haptic]);

  const handlePick = useCallback((color: CreatorColor) => {
    haptic.light();
    onPick(color);
  }, [haptic, onPick]);

  const handleCancel = useCallback(() => {
    haptic.selection();
    setActive(false);
    setPalette([]);
  }, [haptic]);

  if (!active) {
    return (
      <PressScale
        onPress={handleActivate}
        style={StyleSheet.flatten([styles.trigger, style])}
        accessibilityLabel="Eyedropper — pick color from media"
        accessibilityHint="Extracts dominant colors from your media to pick from"
        accessibilityRole="button"
      >
        <Ionicons name="eyedrop-outline" size={IconGrammar.standard} color={colors.textSecondary} />
      </PressScale>
    );
  }

  return (
    <View style={[styles.panel, style]}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Pick from media</Text>
        <Pressable
          onPress={handleCancel}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Close eyedropper"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={IconGrammar.metadata} color={colors.textSecondary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.brand} />
          <Text style={styles.loadingText}>Extracting colors…</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.swatchRow}
        >
          {palette.map((entry, index) => (
            <Pressable
              key={`eyedropper-${index}`}
              onPress={() => handlePick(entry.color)}
              style={[
                styles.swatch,
                { backgroundColor: toHexString(entry.color) },
              ]}
              accessibilityLabel={`Pick color ${toHexString(entry.color).toUpperCase()}`}
              accessibilityRole="button"
              hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
            />
          ))}
          {palette.length === 0 && (
            <Text style={styles.emptyText}>No colors could be extracted</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────
function useEyedropperStyles(colors: ThemeColors) {
  return React.useMemo(
    () =>
      StyleSheet.create({
        trigger: {
          width: Control.hit,
          height: Control.hit,
          borderRadius: Radius.md,
          borderWidth: Stroke.standard,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        },
        panel: {
          gap: Space.sm,
        },
        panelHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        panelTitle: {
          fontFamily: Typography.family.semibold,
          fontSize: Type.caption.size,
          color: colors.textPrimary,
        },
        loadingContainer: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.sm,
          paddingVertical: Space.sm,
        },
        loadingText: {
          fontFamily: Typography.family.regular,
          fontSize: Type.caption.size,
          color: colors.textSecondary,
        },
        swatchRow: {
          gap: Space.xs,
          paddingVertical: Space.xs,
        },
        swatch: {
          width: 36,
          height: 36,
          borderRadius: Radius.md,
          borderWidth: Stroke.hairline,
          borderColor: 'rgba(0,0,0,0.1)',
        },
        emptyText: {
          fontFamily: Typography.family.regular,
          fontSize: Type.caption.size,
          color: colors.textMuted,
        },
      }),
    [colors],
  );
}
