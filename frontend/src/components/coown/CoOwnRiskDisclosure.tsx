import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { CoOwnRiskDisclosures } from '../../services/marketApi';

export interface CoOwnRiskDisclosureProps {
  /** Structured risk disclosures from the backend. When provided, these
   * replace the generic defaults so the user sees issuer-published,
   * versioned risk language instead of boilerplate. */
  disclosures?: CoOwnRiskDisclosures | null;
  risks?: string[];
  onReportIssue?: () => void;
}

const DEFAULT_RISKS = [
  'Co-Own units are not guaranteed to increase in value. You could receive less than you paid.',
  'Liquidity is not guaranteed. Selling units depends on buyer demand.',
  'You own units in a shared asset, not the physical item itself.',
  'Buyout of the full asset is not currently supported.',
  'Fees apply to both buying and selling transactions.',
];

const PREVIEW_COUNT = 2;

/** Builds the risk list from structured disclosures, falling back to
 * the generic defaults when the backend hasn't published any. */
function buildRisks(disclosures: CoOwnRiskDisclosures | null | undefined): string[] {
  if (!disclosures) return DEFAULT_RISKS;
  const structured: string[] = [];
  if (disclosures.marketRisk) structured.push(`Market: ${disclosures.marketRisk}`);
  if (disclosures.liquidityRisk) structured.push(`Liquidity: ${disclosures.liquidityRisk}`);
  if (disclosures.custodyRisk) structured.push(`Custody: ${disclosures.custodyRisk}`);
  if (disclosures.regulatoryRisk) structured.push(`Regulatory: ${disclosures.regulatoryRisk}`);
  if (disclosures.counterpartyRisk) structured.push(`Counterparty: ${disclosures.counterpartyRisk}`);
  if (disclosures.otherRisks) structured.push(`Other: ${disclosures.otherRisks}`);
  return structured.length > 0 ? structured : DEFAULT_RISKS;
}

export function CoOwnRiskDisclosure({ disclosures, risks, onReportIssue }: CoOwnRiskDisclosureProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  const resolvedRisks = risks ?? buildRisks(disclosures);
  const visibleRisks = expanded ? resolvedRisks : resolvedRisks.slice(0, PREVIEW_COUNT);
  const hiddenCount = Math.max(0, resolvedRisks.length - PREVIEW_COUNT);

  const toggleExpanded = () => {
    if (!reducedMotion) haptic.light();
    setExpanded((prev) => !prev);
  };

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {resolvedRisks.length} key risks
        </Text>
      </View>

      <View style={styles.risksList}>
        {visibleRisks.map((risk, i) => (
          <View key={i} style={styles.riskRow}>
            <View style={[styles.riskDot, { backgroundColor: colors.textMuted }]} />
            <Text style={[styles.riskText, { color: colors.textSecondary }]}>{risk}</Text>
          </View>
        ))}
      </View>

      {hiddenCount > 0 && (
        <Pressable
          onPress={toggleExpanded}
          style={({ pressed }) => [styles.expandBtn, pressed && styles.pressed]}
          accessibilityLabel={expanded ? 'Hide remaining risks' : `View all ${resolvedRisks.length} risks`}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={[styles.expandText, { color: colors.textSecondary }]}>
            {expanded ? 'Show fewer' : `View all risks`}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.textSecondary}
          />
        </Pressable>
      )}

      {onReportIssue ? (
        <Pressable
          onPress={onReportIssue}
          style={({ pressed }) => [styles.reportBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Report an issue with this Co-Own asset"
          hitSlop={8}
        >
          <Ionicons name="flag-outline" size={14} color={colors.textSecondary} />
          <Text style={[styles.reportText, { color: colors.textSecondary }]}>Report an issue</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Space.sm,
    paddingTop: Space.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  title: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: -0.2,
  },
  risksList: {
    gap: Space.sm,
  },
  riskRow: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'flex-start',
  },
  riskDot: {
    width: 5,
    height: 5,
    borderRadius: Radius.sm,
    marginTop: 7,
  },
  riskText: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    lineHeight: 20,
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Space.xs,
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  pressed: {
    opacity: 0.6,
  },
  expandText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Space.xs,
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  reportText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
  },
});
