/**
 * RecentColors — row of last 12 committed colors.
 *
 * Per spec 04_COLOR_SYSTEM_ZERO_GAP §4:
 * - Last 12 colors.
 * - Persist via AsyncStorage (see useCreatorColorHistory).
 * - Deduplicate by normalized RGBA.
 *
 * The recents are managed by the parent via useCreatorColorHistory.
 * This component is purely presentational — it renders the swatches
 * and calls onPick when one is tapped.
 */

import React from 'react';
import { StyleSheet, ScrollView, Pressable, Text, ViewStyle } from 'react-native';
import { Space, Radius, Stroke, Type, Typography } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { toHexString } from './ColorMath';
import type { RecentColor, CreatorColor } from './ColorTypes';

// ── Props ────────────────────────────────────────────────────────────
interface RecentColorsProps {
  recents: RecentColor[];
  onPick: (color: CreatorColor) => void;
  style?: ViewStyle | ViewStyle[];
}

// ── Component ────────────────────────────────────────────────────────
export function RecentColors({
  recents,
  onPick,
  style,
}: RecentColorsProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = useRecentColorsStyles(colors);

  if (recents.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, style]}
      accessibilityRole="list"
      accessibilityLabel="Recent colors"
    >
      {recents.map((entry, index) => {
        const hex = toHexString(entry.color).toUpperCase();
        return (
          <Pressable
            key={`recent-${entry.committedAt}-${index}`}
            onPress={() => {
              haptic.selection();
              onPick(entry.color);
            }}
            style={[
              styles.swatch,
              { backgroundColor: toHexString(entry.color) },
            ]}
            accessibilityLabel={`Recent color ${hex}`}
            accessibilityRole="button"
            hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
          />
        );
      })}
    </ScrollView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────
function useRecentColorsStyles(colors: ThemeColors) {
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
          borderColor: 'rgba(0,0,0,0.1)',
        },
      }),
    [colors],
  );
}
