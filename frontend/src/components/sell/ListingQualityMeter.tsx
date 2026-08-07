/**
 * ListingQualityMeter — visual quality score for a listing draft.
 *
 * Inspired by eBay "Magical Listing" quality meter and Poshmark "Smart List AI"
 * completeness indicator. Shows an overall 0–100 score with a linear progress
 * bar, expandable sub-score breakdowns (photo, title, description, pricing,
 * completeness), and an actionable suggestions list with severity icons.
 *
 * TRUTHFUL UI (AGENTS.md §11):
 *   While `LISTING_QUALITY_DEMO_MODE` is true, a "Demo mode" indicator is
 *   shown so the seller knows the score is a heuristic preview, not a real
 *   backend audit.
 *
 * Design (AGENTS.md §4):
 *   - One dominant panel (the meter), flat canvas elsewhere.
 *   - Two radius sizes: Radius.md for the panel, Radius.sm for sub-bars.
 *   - Colour communicates state: danger (<40), warning (40–70), success (70+).
 *   - Severity icons reinforce colour (never colour alone — §13).
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, AccessibilityInfo } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import {
  Space,
  Radius,
  Stroke,
  Type,
  TypeStyles,
  Control,
} from '../../theme/designTokens';
import {
  LISTING_QUALITY_DEMO_MODE,
  type ListingQualityScore,
  type QualitySeverity,
  type QualitySuggestionType,
} from '../../services/listingQualityApi';

export interface ListingQualityMeterProps {
  /** The current quality score for the listing draft. */
  score: ListingQualityScore;
}

/** Sub-score row metadata. */
interface SubScoreRow {
  key: string;
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
}

/** Severity → icon + colour token name. */
const SEVERITY_ICON: Record<
  QualitySeverity,
  { icon: keyof typeof Ionicons.glyphMap; label: string }
> = {
  critical: { icon: 'alert-circle', label: 'Critical' },
  warning: { icon: 'warning', label: 'Warning' },
  info: { icon: 'information-circle', label: 'Info' },
};

/** Suggestion type → icon. */
const TYPE_ICON: Record<QualitySuggestionType, keyof typeof Ionicons.glyphMap> = {
  photo: 'camera-outline',
  title: 'text-outline',
  description: 'document-text-outline',
  pricing: 'pricetag-outline',
  shipping: 'cube-outline',
};

/** Resolve a 0–100 score to a colour token from the theme. */
function scoreColor(
  score: number,
  colors: ReturnType<typeof useAppTheme>['colors'],
): string {
  if (score < 40) return colors.danger;
  if (score < 70) return colors.warning;
  return colors.success;
}

/** Human-readable quality band label. */
function scoreBand(score: number): string {
  if (score < 40) return 'Needs work';
  if (score < 70) return 'Getting there';
  return 'Strong listing';
}

export function ListingQualityMeter({ score }: ListingQualityMeterProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);

  const overallColor = scoreColor(score.overall, colors);
  const band = scoreBand(score.overall);

  const subScores: SubScoreRow[] = [
    { key: 'photo', label: 'Photos', value: score.photoScore, icon: 'camera-outline' },
    { key: 'title', label: 'Title', value: score.titleScore, icon: 'text-outline' },
    { key: 'description', label: 'Description', value: score.descriptionScore, icon: 'document-text-outline' },
    { key: 'pricing', label: 'Pricing', value: score.pricingScore, icon: 'pricetag-outline' },
    { key: 'completeness', label: 'Completeness', value: score.completenessScore, icon: 'checkmark-circle-outline' },
  ];

  const toggleExpanded = useCallback(() => {
    haptic.light();
    setExpanded((prev) => {
      AccessibilityInfo.announceForAccessibility(
        prev ? 'Quality details collapsed' : 'Quality details expanded',
      );
      return !prev;
    });
  }, [haptic]);

  const accessibleLabel = `Listing quality ${score.overall} out of 100. ${band}. ${
        score.suggestions.length
      } suggestions.`;

  return (
    <View
      style={styles.card}
      accessibilityLabel={accessibleLabel}
      accessibilityRole="text"
    >
      {/* Header — overall score + band */}
      <Pressable
        style={styles.header}
        onPress={toggleExpanded}
        accessibilityRole="button"
        accessibilityLabel={`Listing quality ${score.overall} out of 100, ${band}. ${
          expanded ? 'Collapse' : 'Expand'
        } details.`}
        accessibilityHint="Shows detailed sub-scores and suggestions"
        accessibilityState={{ expanded }}
      >
        <View style={styles.scoreBlock}>
          <Text style={[styles.scoreNumber, { color: overallColor }]}>
            {score.overall}
          </Text>
          <Text style={styles.scoreMax}>/100</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Listing Quality
          </Text>
          <Text style={[styles.band, { color: overallColor }]}>{band}</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={Control.icon}
          color={colors.textMuted}
        />
      </Pressable>

      {/* Overall progress bar */}
      <View
        style={styles.progressTrack}
        accessibilityLabel={`Overall quality ${score.overall} percent`}
        accessibilityRole="adjustable"
      >
        <View
          style={[
            styles.progressFill,
            { width: `${score.overall}%`, backgroundColor: overallColor },
          ]}
        />
      </View>

      {/* Expandable detail */}
      {expanded && (
        <View style={styles.detailWrap}>
          {/* Sub-scores */}
          <View style={styles.subScoreList}>
            {subScores.map((row) => {
              const rowColor = scoreColor(row.value, colors);
              return (
                <View key={row.key} style={styles.subScoreRow}>
                  <Ionicons
                    name={row.icon}
                    size={Control.iconCompact}
                    color={colors.textSecondary}
                    style={styles.subScoreIcon}
                  />
                  <Text
                    style={[styles.subScoreLabel, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {row.label}
                  </Text>
                  <View style={styles.subScoreBarWrap}>
                    <View
                      style={styles.subScoreBarTrack}
                    >
                      <View
                        style={[
                          styles.subScoreBarFill,
                          { width: `${row.value}%`, backgroundColor: rowColor },
                        ]}
                      />
                    </View>
                  </View>
                  <Text
                    style={[styles.subScoreValue, { color: rowColor }]}
                  >
                    {row.value}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Suggestions */}
          {score.suggestions.length > 0 && (
            <View style={styles.suggestionsWrap}>
              <Text style={[styles.suggestionsTitle, { color: colors.textSecondary }]}>
                Suggestions
              </Text>
              {score.suggestions.map((s, i) => {
                const sev = SEVERITY_ICON[s.severity];
                const typeIcon = TYPE_ICON[s.type];
                return (
                  <View
                    key={`${s.type}-${i}`}
                    style={[
                      styles.suggestionRow,
                      { borderLeftColor: scoreColor(
                        s.severity === 'critical' ? 20 : s.severity === 'warning' ? 50 : 90,
                        colors,
                      ) },
                    ]}
                  >
                    <Ionicons
                      name={sev.icon}
                      size={Control.iconCompact}
                      color={
                        s.severity === 'critical'
                          ? colors.danger
                          : s.severity === 'warning'
                            ? colors.warning
                            : colors.textMuted
                      }
                      style={styles.suggestionIcon}
                    />
                    <View style={styles.suggestionBody}>
                      <View style={styles.suggestionHeader}>
                        <Ionicons
                          name={typeIcon}
                          size={13}
                          color={colors.textMuted}
                        />
                        <Text
                          style={[styles.suggestionType, { color: colors.textMuted }]}
                        >
                          {s.type}
                        </Text>
                      </View>
                      <Text
                        style={[styles.suggestionMessage, { color: colors.textPrimary }]}
                      >
                        {s.message}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Demo mode indicator (truthful UI) */}
          {LISTING_QUALITY_DEMO_MODE && (
            <View style={styles.demoBadge}>
              <Ionicons
                name="information-circle-outline"
                size={12}
                color={colors.textMuted}
                style={styles.demoIcon}
              />
              <Text style={styles.demoText}>
                Demo mode — quality scores are heuristic estimates.
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      padding: Space.md,
      marginBottom: Space.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      minHeight: Control.hit,
    },
    scoreBlock: {
      flexDirection: 'row',
      alignItems: 'baseline',
    },
    scoreNumber: {
      fontSize: Type.priceLarge.size,
      lineHeight: Type.priceLarge.lineHeight,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      fontWeight: '700',
      letterSpacing: -0.5,
    },
    scoreMax: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      color: colors.textMuted,
      marginLeft: 2,
    },
    headerText: {
      flex: 1,
    },
    title: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      fontWeight: '600',
    },
    band: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      marginTop: 2,
    },
    progressTrack: {
      height: 6,
      borderRadius: Radius.sm,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
      marginTop: Space.sm,
    },
    progressFill: {
      height: '100%',
      borderRadius: Radius.sm,
    },
    detailWrap: {
      marginTop: Space.md,
    },
    subScoreList: {
      gap: Space.sm,
    },
    subScoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    subScoreIcon: {
      marginRight: 2,
    },
    subScoreLabel: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      width: 76,
    },
    subScoreBarWrap: {
      flex: 1,
    },
    subScoreBarTrack: {
      height: 4,
      borderRadius: Radius.sm,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
    },
    subScoreBarFill: {
      height: '100%',
      borderRadius: Radius.sm,
    },
    subScoreValue: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      fontWeight: '600',
      width: 28,
      textAlign: 'right',
    },
    suggestionsWrap: {
      marginTop: Space.md,
      paddingTop: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
    },
    suggestionsTitle: {
      fontSize: Type.captionElevated.size,
      fontFamily: TypeStyles.body.fontFamily,
      fontWeight: '500',
      marginBottom: Space.sm,
    },
    suggestionRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs,
      paddingVertical: Space.xs,
      paddingLeft: Space.sm,
      borderLeftWidth: Stroke.standard,
      marginBottom: Space.xs,
    },
    suggestionIcon: {
      marginTop: 1,
      marginRight: 2,
    },
    suggestionBody: {
      flex: 1,
    },
    suggestionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginBottom: 2,
    },
    suggestionType: {
      fontSize: Type.meta.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      fontWeight: '600',
      textTransform: 'capitalize',
      letterSpacing: 0.3,
    },
    suggestionMessage: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      lineHeight: 17,
    },
    demoBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Space.md,
      paddingTop: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
      gap: Space.xs,
    },
    demoIcon: {
      marginRight: 2,
    },
    demoText: {
      flex: 1,
      fontSize: Type.meta.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      fontWeight: '500',
      color: colors.textMuted,
      letterSpacing: 0.15,
    },
  });
}
