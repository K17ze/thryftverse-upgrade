/**
 * ProjectPalette — row of colors currently used in the project.
 *
 * Per spec 04_COLOR_SYSTEM_ZERO_GAP §4:
 * - Currently used project colors.
 * - Derive from composition document.
 *
 * This component is purely presentational. The parent derives the palette
 * from the composition document and passes it in.
 */

import React from 'react';
import { StyleSheet, ScrollView, Pressable, View, ViewStyle } from 'react-native';
import { Space, Radius, Stroke, Typography } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { toHexString } from './ColorMath';
import type { ProjectPaletteEntry, CreatorColor } from './ColorTypes';

// ── Props ────────────────────────────────────────────────────────────
interface ProjectPaletteProps {
  palette: ProjectPaletteEntry[];
  onPick: (color: CreatorColor) => void;
  style?: ViewStyle | ViewStyle[];
}

// ── Component ────────────────────────────────────────────────────────
export function ProjectPalette({
  palette,
  onPick,
  style,
}: ProjectPaletteProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = useProjectPaletteStyles(colors);

  if (palette.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, style]}
      accessibilityRole="list"
      accessibilityLabel="Colors used in this project"
    >
      {palette.map((entry, index) => {
        const hex = toHexString(entry.color).toUpperCase();
        return (
          <Pressable
            key={`project-${index}-${hex}`}
            onPress={() => {
              haptic.selection();
              onPick(entry.color);
            }}
            style={[
              styles.swatch,
              { backgroundColor: toHexString(entry.color) },
            ]}
            accessibilityLabel={`${entry.source} color ${hex}`}
            accessibilityRole="button"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          />
        );
      })}
    </ScrollView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────
function useProjectPaletteStyles(colors: ThemeColors) {
  return React.useMemo(
    () =>
      StyleSheet.create({
        row: {
          gap: Space.xs,
          paddingVertical: Space.xs,
          minHeight: 44,
          alignItems: 'center',
        },
        swatch: {
          width: 36,
          height: 36,
          borderRadius: Radius.md,
          borderWidth: Stroke.hairline,
          borderColor: colors.borderSubtle,
        },
      }),
    [colors],
  );
}
