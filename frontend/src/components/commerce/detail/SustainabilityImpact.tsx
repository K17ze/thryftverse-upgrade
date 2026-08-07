/**
 * SustainabilityImpact — sustainability impact section for the product page.
 *
 * Surfaces the estimated CO2 / water / waste impact of buying this item
 * secondhand instead of new. Reuses the canonical `SustainabilityBadge`
 * (detailed variant) for the grade breakdown so the heuristic stays
 * truthfully labelled "Estimated impact" per AGENTS.md §11.
 *
 * Per AGENTS.md §4: flat canvas section, hairline divider, no nested
 * card. Stat cells are flat with hairline separators — not bordered
 * tiles. The detailed badge is the one permitted contained surface.
 */
import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../../theme/designTokens';
import { SustainabilityBadge } from '../../product/SustainabilityBadge';
import type { SustainabilityScore } from '../../../utils/sustainabilityScore';

export interface SustainabilityImpactProps {
  score: SustainabilityScore;
}

interface ImpactStat {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
}

export function SustainabilityImpact({ score }: SustainabilityImpactProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // ── Stat cells — truthful, derived from the heuristic score ──
  const stats: ImpactStat[] = [
    {
      icon: 'cloud-outline',
      value: `~${score.co2SavedKg} kg`,
      label: 'CO₂e saved',
    },
    {
      icon: 'water-outline',
      value: `~${score.waterSavedL.toLocaleString('en-GB')} L`,
      label: 'Water saved',
    },
    {
      icon: 'trash-outline',
      // Buying any secondhand item diverts it from landfill — truthful,
      // qualitative (no fabricated weight).
      value: '1 item',
      label: 'Waste diverted',
    },
  ];

  // ── Inline sustainability tags — derived from positive factors ──
  const tags = score.factors.filter((f) => f.positive).map((f) => f.label);

  return (
    <View style={styles.container}>
      <Text
        style={styles.sectionLabel}
        accessibilityRole="header"
        accessibilityLabel="Sustainability Impact"
      >
        Sustainability Impact
      </Text>

      {/* Hero message */}
      <Text style={[styles.heroMessage, { color: colors.textPrimary }]}>
        By buying secondhand, you save ~{score.co2SavedKg} kg CO₂ vs buying new.
      </Text>

      {/* Stat cells — flat, hairline-separated */}
      <View style={[styles.statRow, { borderTopColor: colors.borderSubtle, borderBottomColor: colors.borderSubtle }]}>
        {stats.map((stat, i) => (
          <React.Fragment key={stat.label}>
            <View style={styles.statCell}>
              <Ionicons name={stat.icon} size={18} color={colors.success} />
              <Text style={[styles.statValue, { color: colors.textPrimary }]} numberOfLines={1}>
                {stat.value}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]} numberOfLines={1}>
                {stat.label}
              </Text>
            </View>
            {i < stats.length - 1 ? (
              <View style={[styles.statDivider, { backgroundColor: colors.borderSubtle }]} />
            ) : null}
          </React.Fragment>
        ))}
      </View>

      {/* Inline sustainability tags */}
      {tags.length > 0 ? (
        <View style={styles.tagsRow}>
          {tags.map((tag) => (
            <View key={tag} style={[styles.tag, { backgroundColor: `${colors.success}14` }]}>
              <Ionicons name="checkmark-circle" size={11} color={colors.success} />
              <Text style={[styles.tagText, { color: colors.success }]} numberOfLines={1}>
                {tag}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Detailed grade breakdown — the one permitted contained surface */}
      <View style={styles.badgeWrap}>
        <SustainabilityBadge score={score} variant="detailed" />
      </View>

      <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
        Estimates based on industry averages. Not a precise measurement.
      </Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: Space.md,
      paddingTop: Space.md,
      paddingBottom: Space.sm,
      gap: Space.sm,
    },
    sectionLabel: {
      fontSize: Type.bodyEmphasis.size,
      lineHeight: Type.bodyEmphasis.lineHeight,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    heroMessage: {
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight + 2,
      fontFamily: Typography.family.medium,
    },
    statRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingVertical: Space.md,
    },
    statCell: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.xs,
    },
    statValue: {
      fontSize: Type.bodyLarge.size,
      lineHeight: Type.bodyLarge.lineHeight,
      fontFamily: Typography.family.bold,
      fontVariant: ['tabular-nums'],
    },
    statLabel: {
      fontSize: Type.meta.size,
      lineHeight: Type.meta.lineHeight,
      fontFamily: Typography.family.regular,
    },
    statDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
    },
    tagsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs,
    },
    tag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs + 1,
      borderRadius: Radius.md,
    },
    tagText: {
      fontSize: Type.captionElevated.size,
      lineHeight: Type.captionElevated.lineHeight,
      fontFamily: Typography.family.semibold,
    },
    badgeWrap: {
      marginTop: Space.xs,
    },
    disclaimer: {
      fontSize: Type.meta.size,
      lineHeight: Type.meta.lineHeight + 2,
      fontFamily: Typography.family.regular,
    },
  });
}
