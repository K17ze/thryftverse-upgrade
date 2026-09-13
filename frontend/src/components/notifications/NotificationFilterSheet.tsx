import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { BottomSheet } from '../BottomSheet';
import { haptics } from '../../utils/haptics';
import { Radius, Space, Control, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import {
  OVERFLOW_FILTERS,
  type NotificationFilter } from './notificationViewModels';

export interface NotificationFilterSheetProps {
  visible: boolean;
  onDismiss: () => void;
  activeFilter: NotificationFilter;
  filterCounts: Record<NotificationFilter, number>;
  onSelect: (filter: NotificationFilter) => void;
}

/**
 * Filter sheet — all filters behind a single overflow funnel icon.
 * No per-filter icons — the label is the object (AGENTS.md §4 anti
 * label-everything). The filter sheet is a selection list, not a settings
 * catalogue: label + count + checkmark is the complete grammar.
 */
export function NotificationFilterSheet({
  visible,
  onDismiss,
  activeFilter,
  filterCounts,
  onSelect,
}: NotificationFilterSheetProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      snapPoint={0.65}
    >
      <View style={styles.overflowSheetContent}>
        <View style={styles.overflowSheetHeader}>
          <Text style={styles.overflowSheetTitle}>Filter notifications</Text>
          <AnimatedPressable
            onPress={onDismiss}
            style={styles.overflowCloseBtn}
            accessibilityRole="button"
            accessibilityLabel="Close filter sheet"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </AnimatedPressable>
        </View>
        <View style={styles.overflowList}>
          {OVERFLOW_FILTERS.map((filter) => {
            const isActive = activeFilter === filter.key;
            const count = filterCounts[filter.key] ?? 0;
            return (
              <AnimatedPressable
                key={filter.key}
                style={[
                  styles.overflowRow,
                  isActive && styles.overflowRowActive,
                ]}
                onPress={() => {
                  haptics.tap();
                  onSelect(filter.key);
                }}
                activeOpacity={0.7}
                scaleValue={0.985}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel={`Filter: ${filter.label}${count > 0 ? `, ${count} items` : ''}`}
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    styles.overflowRowText,
                    isActive && styles.overflowRowTextActive,
                  ]}
                >
                  {filter.label}
                </Text>
                <View style={styles.overflowRowRight}>
                  {count > 0 ? (
                    <Text style={styles.overflowCountText}>{count}</Text>
                  ) : null}
                  {isActive ? (
                    <Ionicons name="checkmark" size={16} color={colors.brand} />
                  ) : null}
                </View>
              </AnimatedPressable>
            );
          })}
        </View>
      </View>
    </BottomSheet>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  overflowSheetContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.xs,
    paddingBottom: Space.xl },
  overflowSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.md,
    paddingHorizontal: Space.xs },
  overflowSheetTitle: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: FontFamily.bold,
    color: colors.textPrimary },
  overflowCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center' },
  overflowList: {
    gap: Space.xs },
  // Selection row — the row IS the 44pt touch target. No icon container,
  // no count pill: label left, count + checkmark right (Telegram/Instagram
  // filter-sheet grammar). Count is quiet tabular metadata, not a badge.
  overflowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: Control.hit,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.sm + 2,
    borderRadius: Radius.lg,
    backgroundColor: 'transparent' },
  overflowRowActive: {
    backgroundColor: colors.surfaceAlt },
  overflowRowText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    color: colors.textPrimary },
  overflowRowTextActive: {
    fontFamily: FontFamily.semibold,
    color: colors.brand },
  overflowRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  overflowCountText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'] },
  });
}
