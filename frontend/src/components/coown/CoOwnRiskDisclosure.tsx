import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Type, Typography } from '../../theme/designTokens';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface CoOwnRiskDisclosureProps {
  risks?: string[];
  onReportIssue?: () => void;
}

const DEFAULT_RISKS = [
  'Co-Own units are not guaranteed to increase in value. You may receive less than you paid.',
  'Liquidity is not guaranteed. Selling units depends on buyer demand.',
  'You own units in a shared asset, not the physical item itself.',
  'Buyout of the full asset is not currently supported.',
  'Fees apply to both buying and selling transactions.',
];

const PREVIEW_COUNT = 2;

export function CoOwnRiskDisclosure({ risks = DEFAULT_RISKS, onReportIssue }: CoOwnRiskDisclosureProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  const visibleRisks = expanded ? risks : risks.slice(0, PREVIEW_COUNT);
  const hiddenCount = Math.max(0, risks.length - PREVIEW_COUNT);

  const toggleExpanded = () => {
    if (!reducedMotion) haptic.light();
    setExpanded((prev) => !prev);
  };

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {risks.length} key risks
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
          accessibilityLabel={expanded ? 'Hide remaining risks' : `View all ${risks.length} risks`}
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
          <Ionicons name="flag-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.reportText, { color: colors.textMuted }]}>Report an issue</Text>
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
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
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
    borderRadius: 3,
    marginTop: 7,
  },
  riskText: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: 20,
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Space.xs,
    alignSelf: 'flex-start',
  },
  pressed: {
    opacity: 0.6,
  },
  expandText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Space.xs,
    alignSelf: 'flex-start',
  },
  reportText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
});
