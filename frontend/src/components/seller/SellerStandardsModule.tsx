/**
 * SellerStandardsModule — the Gate 12 performance-program surface on the
 * Seller Hub.
 *
 * Composition (flat canvas, hairline separators — same grammar as
 * SellerOrdersModule):
 *   1. Section header — shield glyph + "Standards" + the seller's real tier.
 *   2. Metrics line — the five recomputed program actuals, verbatim.
 *   3. Defect rows — threshold / actual / gap straight from the endpoint;
 *      the client never recomputes or fabricates a pass.
 *   4. Appeal — an inline form (defect, grounds, details) that posts to
 *      POST /sellers/:sellerId/standards/appeal. Shown only when the
 *      backend reports appealsAvailable.
 *
 * Null `standards` renders nothing (source failed or seller has no hub
 * data); metrics:null inside a loaded payload renders the honest
 * "no 90-day history" row — never a fabricated score.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { useHaptic } from '../../hooks/useHaptic';
import type {
  SellerStandards,
  SellerStandardsDefect,
  StandardsAppealGrounds,
  SubmitStandardsAppealInput,
} from '../../services/sellerStandardsApi';

export interface SellerStandardsModuleProps {
  /** Null while unfetched or after a failed load — the host renders the retry row. */
  standards: SellerStandards | null;
  isLoading?: boolean;
  isFailed?: boolean;
  formatMoney: (value: number | null | undefined) => string;
  onSubmitAppeal: (input: SubmitStandardsAppealInput) => Promise<{ appealId: string }>;
}

const TIER_LABEL: Record<SellerStandards['tier'], string> = {
  standard: 'Standard',
  performer: 'Performer',
  top_performer: 'Top performer',
};

interface MetricMeta {
  label: string;
  format: (value: number, formatMoney: SellerStandardsModuleProps['formatMoney']) => string;
}

/** Display labels + units for the backend's verbatim defect metric keys. */
const DEFECT_METRIC_META: Record<string, MetricMeta> = {
  ordersShipped: {
    label: 'Lifetime orders shipped',
    format: (v) => String(Math.round(v)),
  },
  ordersInWindow: {
    label: 'Orders in 90 days',
    format: (v) => String(Math.round(v)),
  },
  salesVolume: {
    label: 'Sales in 90 days',
    format: (v, formatMoney) => formatMoney(v),
  },
  averageShipTimeDays: {
    label: 'Avg ship time',
    format: (v) => `${v.toFixed(1)}d`,
  },
  cancellationRate: {
    label: 'Cancellation rate',
    format: (v) => `${v.toFixed(1)}%`,
  },
  returnCaseRate: {
    label: 'Return case rate',
    format: (v) => `${v.toFixed(1)}%`,
  },
};

const APPEAL_GROUNDS: { key: StandardsAppealGrounds; label: string }[] = [
  { key: 'factual_error', label: 'Factual error' },
  { key: 'carrier_delay', label: 'Carrier delay' },
  { key: 'system_error', label: 'System error' },
  { key: 'mitigating_circumstance', label: 'Mitigating circumstance' },
];

function defectMeta(metric: string): MetricMeta {
  return DEFECT_METRIC_META[metric] ?? { label: metric, format: (v) => String(v) };
}

export const SellerStandardsModule: React.FC<SellerStandardsModuleProps> = ({
  standards,
  isLoading = false,
  isFailed = false,
  formatMoney,
  onSubmitAppeal,
}) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();

  const [appealOpen, setAppealOpen] = useState(false);
  const [appealMetric, setAppealMetric] = useState<string | null>(null);
  const [appealGrounds, setAppealGrounds] = useState<StandardsAppealGrounds>('factual_error');
  const [appealDetails, setAppealDetails] = useState('');
  const [appealSubmitting, setAppealSubmitting] = useState(false);
  const [appealResult, setAppealResult] = useState<'submitted' | 'error' | null>(null);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <AppIcon concept="shield" size={IconSize.xs} color="textSecondary" accessible={false} />
          <Text style={styles.sectionTitle}>Standards</Text>
        </View>
        <View style={styles.skeletonBlock}>
          <View style={[styles.skeletonLine, { width: '55%' }]} />
          <View style={[styles.skeletonLine, { width: '80%' }]} />
        </View>
      </View>
    );
  }

  if (!standards || isFailed) return null;

  const { metrics, tier, defects, appealsAvailable } = standards;
  const selectedMetric = appealMetric ?? defects[0]?.metric ?? null;
  const detailsReady = appealDetails.trim().length > 0;

  const handleSubmit = async () => {
    if (!selectedMetric || !detailsReady || appealSubmitting) return;
    setAppealSubmitting(true);
    setAppealResult(null);
    try {
      await onSubmitAppeal({
        defectMetric: selectedMetric,
        grounds: appealGrounds,
        details: appealDetails.trim(),
      });
      haptic.success();
      setAppealResult('submitted');
      setAppealOpen(false);
      setAppealDetails('');
    } catch {
      haptic.error();
      setAppealResult('error');
    } finally {
      setAppealSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* ── Section header — title + real tier ── */}
      <View style={styles.headerRow}>
        <View style={styles.headerLead}>
          <AppIcon concept="shield" size={IconSize.xs} color="textSecondary" accessible={false} />
          <Text style={styles.sectionTitle}>Standards</Text>
        </View>
        <Text style={[styles.tierLabel, { color: tier === 'standard' ? colors.textSecondary : colors.brand }]}>
          {TIER_LABEL[tier]}
        </Text>
      </View>

      {/* ── Program actuals, verbatim ── */}
      {metrics ? (
        <Text style={styles.metricsLine}>
          {`${metrics.ordersShipped} shipped · ${formatMoney(metrics.salesVolume)} sold · ${metrics.averageShipTimeDays.toFixed(1)}d ship · ${metrics.cancellationRate.toFixed(1)}% cancel · ${metrics.returnCaseRate.toFixed(1)}% returns`}
        </Text>
      ) : (
        <Text style={styles.metricsLine}>No shipped orders in the last 90 days</Text>
      )}

      {/* ── Defect rows — threshold / actual / gap verbatim ── */}
      {defects.length > 0 ? (
        <View style={styles.rowList}>
          {defects.map((defect: SellerStandardsDefect) => {
            const meta = defectMeta(defect.metric);
            return (
              <View key={defect.metric} style={styles.defectRow}>
                <View style={styles.defectInfo}>
                  <Text style={styles.defectLabel}>{meta.label}</Text>
                  <Text style={styles.defectNumbers}>
                    {`${meta.format(defect.actual, formatMoney)} vs ${meta.format(defect.threshold, formatMoney)} needed · ${meta.format(defect.gap, formatMoney)} to close`}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : metrics ? (
        <Text style={styles.clearLine}>All program criteria met</Text>
      ) : null}

      {/* ── Appeal entry point + submitted/error states ── */}
      {appealResult === 'submitted' ? (
        <Text style={styles.appealDone}>Appeal submitted — under review</Text>
      ) : null}
      {appealResult === 'error' && !appealOpen ? (
        <Text style={[styles.appealDone, { color: colors.danger }]}>
          Appeal couldn't be submitted — try again
        </Text>
      ) : null}

      {appealsAvailable && appealResult !== 'submitted' ? (
        appealOpen ? (
          <View style={styles.appealForm}>
            {defects.length > 1 ? (
              <View style={styles.optionList}>
                {defects.map((defect) => (
                  <AnimatedPressable
                    key={defect.metric}
                    onPress={() => setAppealMetric(defect.metric)}
                    activeOpacity={0.7}
                    scaleValue={0.99}
                    hapticFeedback="selection"
                    accessibilityRole="button"
                    accessibilityLabel={`Appeal ${defectMeta(defect.metric).label}`}
                    style={styles.optionRow}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        { color: selectedMetric === defect.metric ? colors.brand : colors.textSecondary },
                      ]}
                    >
                      {defectMeta(defect.metric).label}
                    </Text>
                    {selectedMetric === defect.metric ? (
                      <AppIcon concept="check" size={IconSize.xs} color="brand" accessible={false} />
                    ) : null}
                  </AnimatedPressable>
                ))}
              </View>
            ) : null}

            <View style={styles.optionList}>
              {APPEAL_GROUNDS.map((ground) => (
                <AnimatedPressable
                  key={ground.key}
                  onPress={() => setAppealGrounds(ground.key)}
                  activeOpacity={0.7}
                  scaleValue={0.99}
                  hapticFeedback="selection"
                  accessibilityRole="button"
                  accessibilityLabel={`Grounds: ${ground.label}`}
                  style={styles.optionRow}
                >
                  <Text
                    style={[
                      styles.optionText,
                      { color: appealGrounds === ground.key ? colors.brand : colors.textSecondary },
                    ]}
                  >
                    {ground.label}
                  </Text>
                  {appealGrounds === ground.key ? (
                    <AppIcon concept="check" size={IconSize.xs} color="brand" accessible={false} />
                  ) : null}
                </AnimatedPressable>
              ))}
            </View>

            <TextInput
              value={appealDetails}
              onChangeText={setAppealDetails}
              placeholder="What happened? Keep it factual."
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={2000}
              style={[styles.detailsInput, { color: colors.textPrimary, borderColor: colors.borderSubtle }]}
              accessibilityLabel="Appeal details"
            />

            {appealResult === 'error' ? (
              <Text style={[styles.appealDone, { color: colors.danger }]}>
                Appeal couldn't be submitted — try again
              </Text>
            ) : null}

            <View style={styles.appealActions}>
              <AnimatedPressable
                onPress={() => {
                  setAppealOpen(false);
                  setAppealResult(null);
                }}
                activeOpacity={0.7}
                scaleValue={0.98}
                accessibilityRole="button"
                accessibilityLabel="Cancel appeal"
                style={styles.appealActionHit}
              >
                <Text style={[styles.appealActionText, { color: colors.textSecondary }]}>Cancel</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => void handleSubmit()}
                activeOpacity={0.7}
                scaleValue={0.98}
                hapticFeedback="medium"
                accessibilityRole="button"
                accessibilityLabel="Submit appeal"
                accessibilityState={{ disabled: !detailsReady || appealSubmitting }}
                style={styles.appealActionHit}
              >
                <Text
                  style={[
                    styles.appealActionText,
                    { color: detailsReady && !appealSubmitting ? colors.brand : colors.textMuted },
                  ]}
                >
                  {appealSubmitting ? 'Submitting…' : 'Submit appeal'}
                </Text>
              </AnimatedPressable>
            </View>
          </View>
        ) : (
          <AnimatedPressable
            onPress={() => {
              setAppealMetric(defects[0]?.metric ?? null);
              setAppealResult(null);
              setAppealOpen(true);
            }}
            activeOpacity={0.7}
            scaleValue={0.985}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Appeal a defect"
            style={styles.appealRow}
          >
            <AppIcon concept="flag" size={IconSize.xs} color="textSecondary" accessible={false} />
            <Text style={[styles.appealRowText, { color: colors.textSecondary }]}>Appeal a defect</Text>
            <AppIcon concept="forward" size={IconSize.xs} color="textMuted" accessible={false} />
          </AnimatedPressable>
        )
      ) : null}
    </View>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      marginTop: Space.lg,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      marginBottom: Space.xs,
    },
    headerLead: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    sectionTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      fontFamily: FontFamily.bold,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      color: colors.textPrimary,
    },
    tierLabel: {
      fontSize: TypographyV2.caption.size,
      lineHeight: TypographyV2.caption.lineHeight,
      fontFamily: FontFamily.semibold,
    },
    metricsLine: {
      paddingHorizontal: Space.md,
      marginTop: Space.xxs,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.regular,
      fontVariant: ['tabular-nums'],
      color: colors.textMuted,
    },
    clearLine: {
      paddingHorizontal: Space.md,
      marginTop: Space.sm,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
    },
    rowList: {
      paddingHorizontal: Space.md,
      marginTop: Space.xs,
    },
    defectRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.sm,
      minHeight: Control.hit,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    defectInfo: {
      flex: 1,
      gap: 1,
    },
    defectLabel: {
      fontSize: TypographyV2.caption.size,
      lineHeight: TypographyV2.caption.lineHeight,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
    },
    defectNumbers: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.regular,
      fontVariant: ['tabular-nums'],
      color: colors.textMuted,
    },
    appealRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginHorizontal: Space.md,
      marginTop: Space.xs,
      paddingVertical: Space.sm,
      minHeight: Control.hit,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    appealRowText: {
      flex: 1,
      fontSize: TypographyV2.caption.size,
      lineHeight: TypographyV2.caption.lineHeight,
      fontFamily: FontFamily.medium,
    },
    appealForm: {
      paddingHorizontal: Space.md,
      marginTop: Space.sm,
      gap: Space.sm,
    },
    optionList: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm,
      minHeight: Control.hit,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    optionText: {
      fontSize: TypographyV2.caption.size,
      lineHeight: TypographyV2.caption.lineHeight,
      fontFamily: FontFamily.medium,
    },
    detailsInput: {
      minHeight: 72,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: Radius.md,
      paddingHorizontal: Space.smMd,
      paddingVertical: Space.sm,
      fontSize: TypographyV2.caption.size,
      lineHeight: TypographyV2.caption.lineHeight,
      fontFamily: FontFamily.regular,
      textAlignVertical: 'top',
    },
    appealActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: Space.lg,
    },
    appealActionHit: {
      minHeight: Control.hit,
      justifyContent: 'center',
    },
    appealActionText: {
      fontSize: TypographyV2.caption.size,
      lineHeight: TypographyV2.caption.lineHeight,
      fontFamily: FontFamily.semibold,
    },
    appealDone: {
      paddingHorizontal: Space.md,
      marginTop: Space.sm,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
    },
    skeletonBlock: {
      paddingHorizontal: Space.md,
      gap: Space.sm,
      paddingVertical: Space.xs,
    },
    skeletonLine: {
      height: 10,
      borderRadius: Radius.sm,
      backgroundColor: colors.surfaceAlt,
    },
  });
}
