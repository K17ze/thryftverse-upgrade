import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Space, Radius } from '../../theme/designTokens';
import { ListingQualityResult } from '../../utils/listingQuality';
import { useAppTheme } from '../../theme/ThemeContext';

export interface ListingQualityMeterProps {
  result: ListingQualityResult;
  compact?: boolean;
}

const TIER_ICON: Record<string, string> = {
  basic: 'ellipse-outline',
  good: 'star-half-outline',
  excellent: 'star',
};

/**
 * Shows a listing quality progress bar with tier label and missing-item chips.
 * Guides sellers toward higher-quality listings while composing.
 */
export function ListingQualityMeter({ result, compact }: ListingQualityMeterProps) {
  const { score, tier, tierLabel, missingItems, tips } = result;
  const { colors } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name={TIER_ICON[tier] as keyof typeof Ionicons.glyphMap} size={14} color={colors.textSecondary} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>Listing quality</Text>
        </View>
        <View style={styles.scoreWrap}>
          <Text style={[styles.score, { color: colors.textPrimary }]}>{score}%</Text>
          <View style={[styles.tierBadge, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.tierText, { color: colors.textSecondary }]}>{tierLabel}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.barTrack, { backgroundColor: colors.surfaceAlt }]}>
        <View style={[styles.barFill, { width: `${score}%`, backgroundColor: colors.brand }]} />
      </View>

      {!compact && missingItems.length > 0 && (
        <View style={styles.itemsRow}>
          {missingItems.slice(0, 5).map((item) => (
            <View key={item.key} style={[styles.missingChip, { backgroundColor: colors.surfaceAlt, borderWidth: 0 }]}>
              <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={10} color={colors.textMuted} />
              <Text style={[styles.missingChipText, { color: colors.textSecondary }]}>{item.label}</Text>
            </View>
          ))}
        </View>
      )}

      {!compact && tips.length > 0 && (
        <View style={styles.tipsCol}>
          {tips.slice(0, 3).map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <Text style={[styles.tipBullet, { color: colors.textMuted }]}>•</Text>
              <Text style={[styles.tipText, { color: colors.textSecondary }]}>{tip}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
  },
  scoreWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  score: {
    fontSize: 15,
    fontFamily: Typography.family.bold,
  },
  tierBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  tierText: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
  },
  barTrack: {
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 1,
  },
  itemsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  missingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: 'transparent',
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  missingChipText: {
    fontSize: 10,
    fontFamily: Typography.family.medium,
  },
  tipsCol: {
    gap: 4,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  tipBullet: {
    fontSize: 12,
    lineHeight: 15,
    fontFamily: Typography.family.bold,
  },
  tipText: {
    flex: 1,
    fontSize: 11,
    fontFamily: Typography.family.regular,
    lineHeight: 15,
  },
});
