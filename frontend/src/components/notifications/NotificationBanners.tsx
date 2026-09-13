import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface QuietHoursBadgeProps {
  onPress: () => void;
}

/**
 * Quiet hours indicator — the only persistent meta row. The unread
 * count already lives in the Unread filter pill and section headers;
 * restating it here duplicates the heading (AGENTS.md §4).
 */
export function QuietHoursBadge({ onPress }: QuietHoursBadgeProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.summaryBannerRow}>
      <Pressable
        style={styles.quietHoursBadge}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Quiet hours active. Tap to manage."
      >
        <Ionicons name="moon" size={12} color={colors.textMuted} />
        <Text style={styles.quietHoursText}>Quiet hours on</Text>
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  summaryBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm + 2,
    paddingBottom: Space.xs },
  quietHoursBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1 },
  quietHoursText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  });
}
