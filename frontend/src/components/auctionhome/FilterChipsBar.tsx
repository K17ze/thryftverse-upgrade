import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import type { AuctionFilterChip } from '../../hooks/auctionhome';

/**
 * Active filter chips — individually removable, with result count.
 * Renders nothing when no filters are active.
 */
export function FilterChipsBar({
  chips,
  resultCount,
  onRemoveChip,
  onClearAll }: {
  chips: AuctionFilterChip[];
  resultCount?: number;
  onRemoveChip: (chipType: AuctionFilterChip['type'], value?: string) => void;
  onClearAll: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (chips.length === 0) return null;

  return (
    <View style={styles.filterChipsBar}>
      {resultCount != null && (
        <Text style={styles.filterResultSummary}>
          {resultCount} {resultCount === 1 ? 'result' : 'results'}
        </Text>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChipsContent}
      >
        {chips.map((chip) => (
          <AnimatedPressable
            key={chip.key}
            style={styles.filterChip}
            onPress={() => onRemoveChip(chip.type, chip.value)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`Remove filter ${chip.label}`}
            scaleValue={0.97}
            hapticFeedback="light"
          >
            <Text style={styles.filterChipText} numberOfLines={1}>{chip.label}</Text>
            <Ionicons name="close" size={13} color={colors.textSecondary} />
          </AnimatedPressable>
        ))}
        <AnimatedPressable
          style={styles.filterChipClear}
          onPress={onClearAll}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Clear all filters"
          scaleValue={0.95}
        >
          <Text style={styles.filterChipClearText}>Clear all</Text>
        </AnimatedPressable>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    filterChipsBar: {
      paddingVertical: Space.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    filterResultSummary: {
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: 0,
      fontVariant: ['tabular-nums'],
      paddingHorizontal: Space.md,
      paddingBottom: Space.xs },
    filterChipsContent: {
      paddingHorizontal: Space.md,
      gap: Space.xs,
      alignItems: 'center' },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.xs + 1,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      minHeight: 32 },
    filterChipText: {
      fontSize: TypographyV2.meta.size,
      color: colors.textPrimary,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: 0,
      maxWidth: 160 },
    filterChipClear: {
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs + 1,
      minHeight: 32,
      justifyContent: 'center' },
    filterChipClearText: {
      fontSize: TypographyV2.meta.size,
      color: colors.brand,
      fontFamily: TypographyV2.meta.fontFamily } });
}
