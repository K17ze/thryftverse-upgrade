import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Space, Radius, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useAppTheme } from '../../theme/ThemeContext';

/**
 * Ownership structure stacked bar — shows supply breakdown as a
 * 3-segment bar: your position (brand), other holders (textSecondary),
 * available (surfaceAlt). Flat canvas element, no card chrome.
 * Extracted verbatim from AssetDetailScreen; behaviour unchanged.
 */
export interface OwnershipStructureBarProps {
  yourSegmentPct: number;
  otherHoldersSegmentPct: number;
  availableSegmentPct: number;
  isHolder: boolean;
  holderCount: number | null | undefined;
}

export function OwnershipStructureBar({
  yourSegmentPct,
  otherHoldersSegmentPct,
  availableSegmentPct,
  isHolder,
  holderCount,
}: OwnershipStructureBarProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.ownershipStructureWrap}>
      <View style={[styles.ownershipBar, { backgroundColor: colors.surfaceAlt }]}>
        {yourSegmentPct > 0 && (
          <View style={{
            width: `${yourSegmentPct}%`,
            height: '100%',
            backgroundColor: colors.brand,
          }} />
        )}
        {otherHoldersSegmentPct > 0 && (
          <View style={{
            width: `${otherHoldersSegmentPct}%`,
            height: '100%',
            backgroundColor: colors.textSecondary,
          }} />
        )}
      </View>
      <View style={styles.ownershipLegend}>
        {yourSegmentPct > 0 && (
          <View style={styles.ownershipLegendItem}>
            <View style={[styles.ownershipLegendDot, { backgroundColor: colors.brand }]} />
            <Text style={[styles.ownershipLegendText, { color: colors.textSecondary }]} numberOfLines={1}>
              You {yourSegmentPct.toFixed(1)}%
            </Text>
          </View>
        )}
        {otherHoldersSegmentPct > 0 && (
          <View style={styles.ownershipLegendItem}>
            <View style={[styles.ownershipLegendDot, { backgroundColor: colors.textSecondary }]} />
            <Text style={[styles.ownershipLegendText, { color: colors.textSecondary }]} numberOfLines={1}>
              {holderCount != null && holderCount > 0 ? `${holderCount - (isHolder ? 1 : 0)} other holders` : 'Holders'} {otherHoldersSegmentPct.toFixed(0)}%
            </Text>
          </View>
        )}
        {availableSegmentPct > 0 && (
          <View style={styles.ownershipLegendItem}>
            <View style={[styles.ownershipLegendDot, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }]} />
            <Text style={[styles.ownershipLegendText, { color: colors.textSecondary }]} numberOfLines={1}>
              Available {availableSegmentPct.toFixed(0)}%
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ownershipStructureWrap: {
    marginTop: Space.md,
    gap: Space.xs,
  },
  ownershipBar: {
    height: Space.sm,
    borderRadius: RadiusRoleValue.pillAvatar,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  ownershipLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  ownershipLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2,
  },
  ownershipLegendDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
  },
  ownershipLegendText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
});
