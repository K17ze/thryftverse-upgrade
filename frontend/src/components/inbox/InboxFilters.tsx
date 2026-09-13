import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppSearchBar } from '../ui/AppSearchBar';
import { useHaptic } from '../../hooks/useHaptic';
import { RootStackParamList } from '../../navigation/types';
import type { InboxSegment } from '../../hooks/inbox';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export interface InboxFiltersProps {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  segment: InboxSegment;
  /** Primary rail tabs (All / Buying / Selling / Requests). */
  onSelectSegment: (segment: InboxSegment) => void;
  /** Expanded secondary chips (Unread / Archived / Groups) — also collapses the row. */
  onSelectSecondaryFilter: (segment: InboxSegment) => void;
  filterExpanded: boolean;
  buyingUnreadCount: number;
  sellingUnreadCount: number;
  requestsCount: number;
}

export function InboxFilters({
  searchQuery,
  onSearchQueryChange,
  segment,
  onSelectSegment,
  onSelectSecondaryFilter,
  filterExpanded,
  buyingUnreadCount,
  sellingUnreadCount,
  requestsCount,
}: InboxFiltersProps) {
  const { colors } = useAppTheme();
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const t = useMemo(() => ({
    searchWrap: { backgroundColor: colors.surfaceAlt },
    filterChipSecondary: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
    filterChipSecondaryActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
    filterChipSecondaryText: { color: colors.textSecondary },
    filterChipSecondaryTextActive: { color: colors.textInverse },
    unreadBadgePill: { backgroundColor: colors.brand },
    unreadBadgeText: { color: colors.textInverse },
  }), [colors]);

  return (
    <View style={styles.header}>
      <AppSearchBar
        placeholder="Search messages"
        value={searchQuery}
        onChangeText={onSearchQueryChange}
        onCameraPress={() => navigation.navigate('VisualSearch')}
        containerStyle={[styles.searchWrap, t.searchWrap]}
        inputProps={{
          autoCapitalize: 'none',
          autoCorrect: false,
          accessibilityLabel: 'Search conversations',
        }}
      />
      <View style={styles.filterChipRail}>
        {([
          { key: 'all' as const, label: 'All' },
          { key: 'buying' as const, label: 'Buying', badge: buyingUnreadCount },
          { key: 'selling' as const, label: 'Selling', badge: sellingUnreadCount },
          { key: 'requests' as const, label: 'Requests', badge: requestsCount },
        ]).map((tab) => {
          const isActive = segment === tab.key;
          return (
            <AnimatedPressable
              key={tab.key}
              style={[
                styles.filterChip,
                t.filterChipSecondary,
                isActive && t.filterChipSecondaryActive,
              ]}
              onPress={() => {
                haptic.light();
                onSelectSegment(tab.key);
              }}
              activeOpacity={0.85}
              scaleValue={0.96}
              hapticFeedback="light"
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${tab.label} tab${tab.badge ? `, ${tab.badge} pending` : ''}`}
            >
              <Text
                style={[
                  styles.filterChipText,
                  t.filterChipSecondaryText,
                  isActive && t.filterChipSecondaryTextActive,
                ]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
              {(tab.badge ?? 0) > 0 ? (
                <View style={[styles.unreadBadgePill, t.unreadBadgePill, isActive && { backgroundColor: colors.textInverse }]}>
                  <Text style={[styles.unreadBadgeText, t.unreadBadgeText, isActive && { color: colors.textPrimary }]}>
                    {tab.badge! > 99 ? '99+' : tab.badge}
                  </Text>
                </View>
              ) : null}
            </AnimatedPressable>
          );
        })}
      </View>
      {filterExpanded && (
        <View style={styles.filterChips}>
          {([
            { key: 'unread' as const, label: 'Unread' },
            { key: 'archived' as const, label: 'Archived' },
            { key: 'groups' as const, label: 'Groups' },
          ]).map((chip) => {
            const isActive = segment === chip.key;
            return (
              <AnimatedPressable
                key={chip.key}
                style={[
                  styles.filterChip,
                  t.filterChipSecondary,
                  isActive && t.filterChipSecondaryActive,
                ]}
                onPress={() => {
                  haptic.light();
                  onSelectSecondaryFilter(chip.key);
                }}
                activeOpacity={0.85}
                scaleValue={0.96}
                hapticFeedback="light"
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`${chip.label} filter`}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    t.filterChipSecondaryText,
                    isActive && t.filterChipSecondaryTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {chip.label}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Space.md,
    paddingTop: Space.xs + 2,
    paddingBottom: 0,
    gap: Space.sm,
  },
  searchWrap: {
    borderRadius: RadiusRoleValue.pillAvatar,
    paddingHorizontal: Space.md,
    minHeight: Space.xxl,
  },
  filterChipRail: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingTop: Space.xs,
    paddingBottom: Space.xs,
  },
  filterChips: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingTop: Space.xs,
    paddingBottom: Space.xs,
  },
  filterChip: {
    paddingVertical: Space.xs + 1,
    paddingHorizontal: Space.sm + Space.xs,
    borderRadius: RadiusRoleValue.pillAvatar,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterChipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
  },
  unreadBadgePill: {
    borderRadius: RadiusRoleValue.pillAvatar,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 6,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    fontSize: 11,
    fontFamily: FontFamily.bold,
  },
});
