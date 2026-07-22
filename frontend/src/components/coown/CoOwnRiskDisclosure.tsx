import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';

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

export function CoOwnRiskDisclosure({ risks = DEFAULT_RISKS, onReportIssue }: CoOwnRiskDisclosureProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Risk & limitations</Text>
      </View>

      <View style={styles.risksList}>
        {risks.map((risk, i) => (
          <View key={i} style={styles.riskRow}>
            <View style={[styles.riskDot, { backgroundColor: colors.textMuted }]} />
            <Text style={[styles.riskText, { color: colors.textSecondary }]}>{risk}</Text>
          </View>
        ))}
      </View>

      {onReportIssue ? (
        <Pressable
          onPress={onReportIssue}
          style={[styles.reportBtn, { borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel="Report an issue with this Co-Own asset"
        >
          <Ionicons name="flag-outline" size={15} color={colors.textSecondary} />
          <Text style={[styles.reportText, { color: colors.textSecondary }]}>Report an issue</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  title: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.3,
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
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  reportText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
});
