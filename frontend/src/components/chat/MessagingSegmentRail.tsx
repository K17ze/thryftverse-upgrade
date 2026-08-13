import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { Pressable } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Type, TypeStyles, Typography, Radius, Stroke } from '../../theme/designTokens';

export type MessagingSegment = 'all' | 'buying' | 'selling' | 'requests';

export interface MessagingSegmentRailProps {
  active: MessagingSegment;
  onChange: (segment: MessagingSegment) => void;
  requestCount?: number;
  buyingCount?: number;
  sellingCount?: number;
}

export function MessagingSegmentRail({
  active,
  onChange,
  requestCount = 0,
  buyingCount = 0,
  sellingCount = 0,
}: MessagingSegmentRailProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const segments: { key: MessagingSegment; label: string; badge?: number }[] = [
    { key: 'all', label: 'All' },
    { key: 'buying', label: 'Buying', badge: buyingCount > 0 ? buyingCount : undefined },
    { key: 'selling', label: 'Selling', badge: sellingCount > 0 ? sellingCount : undefined },
    { key: 'requests', label: 'Requests', badge: requestCount > 0 ? requestCount : undefined },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.root}
      contentContainerStyle={styles.content}
    >
      {segments.map((seg) => {
        const isActive = seg.key === active;
        return (
          <Pressable
            key={seg.key}
            onPress={() => onChange(seg.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${seg.label} tab${seg.badge ? `, ${seg.badge} new` : ''}`}
            style={({ pressed }) => [
              styles.tab,
              isActive && styles.tabActive,
              pressed && styles.tabPressed,
            ]}
          >
            <Text
              style={[
                styles.label,
                isActive ? styles.labelActive : styles.labelInactive,
              ]}
              numberOfLines={1}
            >
              {seg.label}
            </Text>
            {seg.badge ? (
              <View style={[styles.badge, isActive && styles.badgeActive]}>
                <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>
                  {seg.badge > 99 ? '99+' : seg.badge}
                </Text>
              </View>
            ) : null}
            {/* Underline indicator — active segment only (Instagram native pattern) */}
            <View style={[styles.indicator, isActive && styles.indicatorActive]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  root: {
    paddingHorizontal: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.smMd,
    paddingVertical: Space.xs,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.xs,
    position: 'relative',
    minHeight: 44,
  },
  tabActive: {},
  tabPressed: {
    opacity: 0.6,
  },
  label: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: TypeStyles.body.fontFamily,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  labelActive: {
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.textPrimary,
  },
  labelInactive: {
    color: colors.textMuted,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: Radius.full,
    backgroundColor: `${colors.brand}1F`,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.xs + 1,
  },
  badgeActive: {
    backgroundColor: colors.brand,
  },
  badgeText: {
    fontSize: Type.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.brand,
  },
  badgeTextActive: {
    color: colors.textInverse,
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: Space.xs,
    right: Space.xs,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'transparent',
  },
  indicatorActive: {
    backgroundColor: colors.textPrimary,
    height: 2.5,
  },
});
