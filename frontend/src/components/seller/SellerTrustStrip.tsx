import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AppIcon } from '../common/AppIcon';
import { IconSize, type IconConcept } from '../../theme/iconTokens';
import type { SellerHubTrust } from '../../services/sellerHubApi';

export interface SellerTrustStripProps {
  /** Backend-evidenced trust posture. Null (or all-empty) renders nothing. */
  trust: SellerHubTrust | null;
  /** True when the projection is older than the recompute cadence. Qualifies, never hides. */
  stale?: boolean;
}

interface TrustChip {
  id: string;
  icon: IconConcept;
  text: string;
}

function formatDispatch(days: number): string {
  if (days <= 0) return 'Same-day dispatch';
  if (days === 1) return 'Ships in ~1 day';
  return `Ships in ~${Math.round(days)} days`;
}

/**
 * SellerTrustStrip — the seller's own evidenced reputation, one quiet row
 * under the money panel. 2026 marketplace grammar: score always ships with
 * count ("96% positive · 212 sales"), response and dispatch are stated as
 * facts, and anything without a backend row is omitted — never placeholder.
 */
export const SellerTrustStrip: React.FC<SellerTrustStripProps> = ({ trust, stale = false }) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const chips: TrustChip[] = useMemo(() => {
    if (!trust) return [];
    const out: TrustChip[] = [];
    if (trust.positiveRatingPct != null && trust.totalSales > 0) {
      out.push({
        id: 'rating',
        icon: 'star',
        text: `${Math.round(trust.positiveRatingPct)}% positive · ${trust.totalSales} sale${trust.totalSales === 1 ? '' : 's'}`,
      });
    } else if (trust.totalSales > 0) {
      out.push({
        id: 'sales',
        icon: 'star',
        text: `${trust.totalSales} sale${trust.totalSales === 1 ? '' : 's'}`,
      });
    }
    if (trust.responseRatePct != null) {
      out.push({
        id: 'response',
        icon: 'chat',
        text: `${Math.round(trust.responseRatePct)}% response rate`,
      });
    }
    if (trust.avgDispatchDays != null) {
      out.push({ id: 'dispatch', icon: 'package', text: formatDispatch(trust.avgDispatchDays) });
    }
    return out;
  }, [trust]);

  if (chips.length === 0) return null;

  const accessibilityLabel = `Seller reputation: ${chips.map((c) => c.text).join(', ')}${stale ? ', may be out of date' : ''}`;

  return (
    <View
      style={styles.container}
      accessible={true}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
    >
      {chips.map((chip) => (
        <View key={chip.id} style={styles.chip}>
          <AppIcon concept={chip.icon} size={IconSize.xs} color="textMuted" opticalCenter accessible={false} />
          <Text style={[styles.chipText, { color: colors.textSecondary }]} numberOfLines={1}>
            {chip.text}
          </Text>
        </View>
      ))}
      {stale ? (
        <View style={styles.chip}>
          <AppIcon concept="pending" size={IconSize.xs} color="textMuted" opticalCenter accessible={false} />
          <Text style={[styles.chipText, { color: colors.textMuted }]} numberOfLines={1}>
            May be out of date
          </Text>
        </View>
      ) : null}
    </View>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      columnGap: Space.md,
      rowGap: Space.xxs,
      paddingHorizontal: Space.md,
      marginTop: Space.smMd,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    chipText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.medium,
      letterSpacing: TypographyV2.meta.letterSpacing,
      fontVariant: ['tabular-nums'],
    },
  });
}
