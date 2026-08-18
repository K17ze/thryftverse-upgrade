/**
 * SustainabilityBadge — estimated-impact indicator for ThryftVerse listings.
 *
 * TRUTHFUL LABELING (AGENTS.md §11): every surface labels the score as an
 * "Estimated impact". The grade is a heuristic composite, and the CO2 / water
 * figures are industry-average approximations — never claimed as precise
 * scientific measurements.
 *
 * Two variants:
 *  - `compact`  — a single grade chip (A/B/C/D) for cards and inline rows.
 *  - `detailed` — a full breakdown card with factors, CO2 and water saved.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography, Stroke } from '../../theme/designTokens';
import type { SustainabilityScore } from '../../utils/sustainabilityScore';

export type SustainabilityBadgeVariant = 'compact' | 'detailed';

export interface SustainabilityBadgeProps {
  score: SustainabilityScore;
  variant?: SustainabilityBadgeVariant;
  /**
   * Compact-only: render on top of media and use a legible solid fill +
   * inverse text. Defaults to false (canvas placement).
   */
  onMedia?: boolean;
}

type GradeColorKey = 'A' | 'B' | 'C' | 'D';

interface GradeMeta {
  /** Solid fill for the chip. */
  fill: string;
  /** Foreground (text / icon) for the chip. */
  onFill: string;
  /** Soft tint used for the detailed card accent. */
  tint: string;
  /** Human label for the grade. */
  label: string;
}

function gradeMeta(grade: GradeColorKey, colors: ThemeColors): GradeMeta {
  switch (grade) {
    case 'A':
      // Green — strongest positive signal.
      return {
        fill: colors.success,
        onFill: '#FFFFFF',
        tint: `${colors.success}22`,
        label: 'Excellent',
      };
    case 'B':
      // Light green — positive, slightly less.
      return {
        fill: `${colors.success}CC`,
        onFill: '#FFFFFF',
        tint: `${colors.success}14`,
        label: 'Good',
      };
    case 'C':
      // Amber — moderate.
      return {
        fill: colors.warning,
        onFill: colors.textInverse,
        tint: `${colors.warning}1F`,
        label: 'Moderate',
      };
    case 'D':
    default:
      // Grey — low / unknown impact.
      return {
        fill: colors.surfaceAlt,
        onFill: colors.textSecondary,
        tint: colors.surfaceAlt,
        label: 'Low',
      };
  }
}

export function SustainabilityBadge({
  score,
  variant = 'compact',
  onMedia = false,
}: SustainabilityBadgeProps) {
  const { colors } = useAppTheme();
  const meta = gradeMeta(score.grade, colors);

  if (variant === 'compact') {
    return (
      <View
        style={[
          styles.compactChip,
          { backgroundColor: meta.fill },
          onMedia && styles.compactChipOnMedia,
        ]}
        accessibilityLabel={`Estimated sustainability grade ${score.grade}`}
        accessibilityRole="text"
      >
        <Ionicons name="leaf" size={11} color={meta.onFill} />
        <Text style={[styles.compactLabel, { color: meta.onFill }]}>
          {score.grade}
        </Text>
      </View>
    );
  }

  // Detailed breakdown card.
  return (
    <View
      style={[styles.detailedCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
      accessibilityLabel={`Estimated sustainability grade ${score.grade}, ${meta.label}. ${score.summary}`}
      accessibilityRole="text"
    >
      <View style={styles.detailedHeader}>
        <View style={[styles.gradeChipLarge, { backgroundColor: meta.fill }]}>
          <Ionicons name="leaf" size={14} color={meta.onFill} />
          <Text style={[styles.gradeChipLabel, { color: meta.onFill }]}>
            {score.grade}
          </Text>
        </View>
        <View style={styles.detailedHeaderText}>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>
            ESTIMATED IMPACT
          </Text>
          <Text style={[styles.detailedTitle, { color: colors.textPrimary }]}>
            {meta.label} sustainability
          </Text>
        </View>
      </View>

      <Text style={[styles.summary, { color: colors.textSecondary }]}>
        {score.summary}
      </Text>

      {/* Factor breakdown — transparent, readable rows. */}
      {score.factors.length > 0 ? (
        <View style={[styles.factorList, { borderTopColor: colors.borderSubtle }]}>
          {score.factors.map((factor, i) => (
            <View
              key={`${factor.label}-${i}`}
              style={[styles.factorRow, { borderBottomColor: colors.borderSubtle }]}
            >
              <View style={styles.factorLabelWrap}>
                <Ionicons
                  name={factor.positive ? 'checkmark-circle' : 'ellipse-outline'}
                  size={15}
                  color={factor.positive ? colors.success : colors.textMuted}
                />
                <Text style={[styles.factorLabel, { color: colors.textPrimary }]}>
                  {factor.label}
                </Text>
              </View>
              <Text
                style={[styles.factorValue, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {factor.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* CO2 + water savings — two stat cells. */}
      <View style={[styles.statRow, { borderTopColor: colors.borderSubtle }]}>
        <View style={styles.statCell}>
          <Ionicons name="cloud-outline" size={16} color={colors.success} />
          <Text style={[styles.statValue, { color: colors.textPrimary }]}>
            ~{score.co2SavedKg} kg
          </Text>
          <Text style={[styles.statCaption, { color: colors.textMuted }]}>
            CO₂e saved
          </Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.borderSubtle }]} />
        <View style={styles.statCell}>
          <Ionicons name="water-outline" size={16} color={colors.success} />
          <Text style={[styles.statValue, { color: colors.textPrimary }]}>
            ~{score.waterSavedL.toLocaleString('en-GB')} L
          </Text>
          <Text style={[styles.statCaption, { color: colors.textMuted }]}>
            Water saved
          </Text>
        </View>
      </View>

      <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
        Estimates based on industry averages. Not a precise measurement.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Compact chip ──────────────────────────────────────────────────────────
  compactChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: Space.xs,
    borderRadius: Radius.md,
  },
  compactChipOnMedia: {
    // Legibility on photography — subtle dark backing is provided by the
    // solid grade fill itself, so no extra scrim is needed.
    shadowColor: 'rgba(0,0,0,0.45)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 2,
  },
  compactLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: 0.2,
  },

  // ── Detailed card ──────────────────────────────────────────────────────────
  detailedCard: {
    borderRadius: Radius.lg,
    padding: Space.md,
    borderWidth: Stroke.hairline,
  },
  detailedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  gradeChipLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
  },
  gradeChipLabel: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: 0.2,
  },
  detailedHeaderText: {
    flex: 1,
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  detailedTitle: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
    marginTop: 1,
  },
  summary: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: -0.1,
    marginTop: Space.sm,
  },

  // ── Factor rows ───────────────────────────────────────────────────────────
  factorList: {
    marginTop: Space.sm,
    borderTopWidth: Stroke.hairline,
  },
  factorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm - 2,
    borderBottomWidth: Stroke.hairline,
    gap: Space.sm,
  },
  factorLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    flexShrink: 1,
  },
  factorLabel: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: -0.1,
  },
  factorValue: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    textAlign: 'right',
    flexShrink: 0,
  },

  // ── Stat row ──────────────────────────────────────────────────────────────
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: Stroke.hairline,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: Space.xs,
  },
  statDivider: {
    width: Stroke.hairline,
    alignSelf: 'stretch',
  },
  statValue: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  statCaption: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: 0.1,
  },

  disclaimer: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight + 2,
    fontFamily: Typography.family.regular,
    letterSpacing: 0.1,
    marginTop: Space.sm,
    textAlign: 'center',
  },
});
