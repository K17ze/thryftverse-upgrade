/**
 * MoodboardThemeChip — selects the canvas background theme.
 *
 * Pill with a colour swatch + label; selected state uses the emphasis
 * stroke and the primary text colour.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Stroke, Control, Typography } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import type { MoodboardTheme } from '../../services/moodboardApi';

export interface ThemeChipProps {
  theme: MoodboardTheme;
  selected: boolean;
  onPress: () => void;
}

export const ThemeChip = React.memo(function ThemeChip({ theme, selected, onPress }: ThemeChipProps) {
  const { colors } = useAppTheme();
  return (
    <AnimatedPressable
      style={[
        styles.themeChip,
        { borderColor: colors.border, backgroundColor: colors.surface },
        selected && { borderWidth: Stroke.emphasis, borderColor: colors.textPrimary, backgroundColor: colors.surfaceAlt },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
      scaleValue={0.96}
      accessibilityRole="button"
      accessibilityLabel={`Theme: ${theme.label}${selected ? ', selected' : ''}`}
      accessibilityHint="Sets the canvas background theme"
    >
      <View
        style={[
          styles.themeChipSwatch,
          { backgroundColor: theme.backgroundColor, borderColor: theme.accentColor },
        ]}
      />
      <Text
        style={[
          styles.themeChipLabel,
          { color: selected ? colors.textPrimary : colors.textSecondary },
          selected && styles.themeChipLabelSelected,
        ]}
        numberOfLines={1}
      >
        {theme.label}
      </Text>
    </AnimatedPressable>
  );
});

// ---------------------------------------------------------------------------
// Static styles (no theme dependency — themed colors are applied inline)
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  themeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard },
  themeChipLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  themeChipLabelSelected: {
    fontFamily: Typography.family.semibold },
  themeChipSwatch: {
    width: Control.iconCompact,
    height: Control.iconCompact,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard } });
