import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { Pressable } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, TypeStyles, Radius, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTranslation } from '../../i18n/useAppTranslation';

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
  sellingCount = 0 }: MessagingSegmentRailProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('messaging');
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Only 3 scopes are visible in the first viewport (Primary, Buying,
  // Selling). Additional classifiers (Requests, Unread, Archived, Groups)
  // are surfaced behind a filter icon in the InboxScreen header.
  const segments: { key: MessagingSegment; label: string; badge?: number }[] = [
    { key: 'all', label: t('inbox.primary') },
    { key: 'buying', label: t('inbox.buying'), badge: buyingCount > 0 ? buyingCount : undefined },
    { key: 'selling', label: t('inbox.selling'), badge: sellingCount > 0 ? sellingCount : undefined },
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
    borderBottomColor: colors.border },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.smMd,
    paddingVertical: Space.xs },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.xs,
    position: 'relative',
    minHeight: 44 },
  tabActive: {},
  tabPressed: {
    opacity: 0.6 },
  label: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypeStyles.body.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  labelActive: {
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.textPrimary },
  labelInactive: {
    color: colors.textMuted },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: Radius.full,
    backgroundColor: colors.brandSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.xs + 1 },
  badgeActive: {
    backgroundColor: colors.brand },
  badgeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.brand },
  badgeTextActive: {
    color: colors.textInverse },
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: Space.xs,
    right: Space.xs,
    height: 2,
    borderRadius: Radius.full,
    backgroundColor: 'transparent' },
  indicatorActive: {
    backgroundColor: colors.textPrimary,
    height: 2.5 } });
