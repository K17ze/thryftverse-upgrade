import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
import { ListingQualityResult } from '../../utils/listingQuality';

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
  const barColor = score >= 80 ? Colors.success : score >= 55 ? Colors.brand : Colors.warning;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name={TIER_ICON[tier] as keyof typeof Ionicons.glyphMap} size={15} color={barColor} />
          <Text style={styles.title}>Listing quality</Text>
        </View>
        <View style={styles.scoreWrap}>
          <Text style={[styles.score, { color: barColor }]}>{score}%</Text>
          <View style={[styles.tierBadge, { backgroundColor: `${barColor}15` }]}>
            <Text style={[styles.tierText, { color: barColor }]}>{tierLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${score}%`, backgroundColor: barColor }]} />
      </View>

      {!compact && missingItems.length > 0 && (
        <View style={styles.itemsRow}>
          {missingItems.slice(0, 5).map((item) => (
            <View key={item.key} style={styles.missingChip}>
              <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={10} color={Colors.textMuted} />
              <Text style={styles.missingChipText}>{item.label}</Text>
            </View>
          ))}
        </View>
      )}

      {!compact && tips.length > 0 && (
        <View style={styles.tipsCol}>
          {tips.slice(0, 3).map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <Ionicons name="bulb-outline" size={11} color={Colors.warning} />
              <Text style={styles.tipText}>{tip}</Text>
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
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
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
    color: Colors.textPrimary,
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
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceAlt,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
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
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.sm,
  },
  missingChipText: {
    fontSize: 10,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  tipsCol: {
    gap: 4,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
  },
  tipText: {
    flex: 1,
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    lineHeight: 15,
  },
});
