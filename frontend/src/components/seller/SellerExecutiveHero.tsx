import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { Motion } from '../../theme/motionTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { AnimatedNumber } from '../common/AnimatedNumber';
import { IconSize } from '../../theme/iconTokens';
import type { SellerHubOverview } from '../../services/sellerHubApi';

export interface SellerExecutiveHeroProps {
  money?: SellerHubOverview['money'] | null;
  /** Total value of the seller's live catalogue — the third sub-metric. */
  listedValueGbp?: number | null;
  formatMoney: (value: number | null | undefined) => string;
  onOpenWallet: () => void;
}

function formatPayoutDate(iso: string): string | null {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * SellerExecutiveHero — the dominant element of the hub: the payout the
 * seller can touch right now, at price-hero scale on flat canvas. No card
 * chrome — the number carries the weight (Vinted/Depop balance pattern).
 *
 * Beneath it, one hairline row of sub-metrics answers "what's the rest of
 * the money doing": escrow in flight, the next payout date, and the value
 * sitting live in the catalogue. Each is a verbatim backend figure — a
 * null renders '—' in place, never a fabricated zero.
 */
export const SellerExecutiveHero: React.FC<SellerExecutiveHeroProps> = ({
  money,
  listedValueGbp,
  formatMoney,
  onOpenWallet,
}) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  const availableGbp = money?.availableGbp ?? null;
  const processingGbp = money?.processingGbp ?? null;
  const heldGbp = money?.heldGbp ?? 0;
  const nextPayoutLabel = money?.nextPayoutAt ? formatPayoutDate(money.nextPayoutAt) : null;

  const subMetrics: { key: string; label: string; value: string }[] = [
    {
      key: 'escrow',
      label: 'In escrow',
      value: processingGbp != null ? formatMoney(processingGbp) : '—',
    },
  ];
  if (nextPayoutLabel) {
    subMetrics.push({ key: 'payout', label: 'Next payout', value: nextPayoutLabel });
  }
  if (listedValueGbp != null && listedValueGbp > 0) {
    subMetrics.push({ key: 'listed', label: 'Listed', value: formatMoney(listedValueGbp) });
  }

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Available payout</Text>
        <AnimatedPressable
          style={styles.transferHit}
          onPress={onOpenWallet}
          activeOpacity={0.7}
          scaleValue={0.97}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Withdraw funds in wallet"
        >
          <Text style={[styles.transferText, { color: colors.brand }]}>Transfer</Text>
          <AppIcon concept="forward" size={IconSize.xs} color="brand" opticalCenter accessible={false} />
        </AnimatedPressable>
      </View>

      {availableGbp != null ? (
        <AnimatedNumber
          value={availableGbp}
          format={formatMoney}
          duration={Motion.duration.slow}
          animateOnMount={false}
          style={[styles.heroValue, { color: colors.textPrimary }]}
        />
      ) : (
        <Text style={[styles.heroValue, { color: colors.textMuted }]}>—</Text>
      )}

      {/* Rolling reserve safeguard — only when money is actually held */}
      {heldGbp > 0 && (
        <Text style={[styles.reserveLine, { color: colors.textMuted }]}>
          {formatMoney(heldGbp)} in rolling reserve
        </Text>
      )}

      {/* Sub-metrics — one hairline row, label over tabular figure */}
      <View style={[styles.subRow, { borderTopColor: colors.borderSubtle }]}>
        {subMetrics.map((metric, index) => (
          <React.Fragment key={metric.key}>
            {index > 0 && (
              <View style={[styles.subDivider, { backgroundColor: colors.borderSubtle }]} />
            )}
            <View style={styles.subCell}>
              <Text style={[styles.subLabel, { color: colors.textMuted }]} numberOfLines={1}>
                {metric.label}
              </Text>
              <Text style={[styles.subValue, { color: colors.textPrimary }]} numberOfLines={1}>
                {metric.value}
              </Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: Space.md,
      paddingTop: Space.lg,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    label: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.semibold,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    transferHit: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xxs,
      minHeight: Control.hit,
      paddingLeft: Space.sm,
    },
    transferText: {
      fontSize: TypographyV2.caption.size,
      lineHeight: TypographyV2.caption.lineHeight,
      fontFamily: FontFamily.semibold,
      letterSpacing: TypographyV2.caption.letterSpacing,
    },
    heroValue: {
      marginTop: Space.xxs,
      fontSize: TypographyV2.priceHero.size,
      fontFamily: FontFamily.bold,
      lineHeight: TypographyV2.priceHero.lineHeight,
      letterSpacing: TypographyV2.priceHero.letterSpacing,
      fontVariant: ['tabular-nums'],
    },
    reserveLine: {
      marginTop: Space.xxs,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.regular,
      letterSpacing: TypographyV2.meta.letterSpacing,
      fontVariant: ['tabular-nums'],
    },
    subRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: Space.md,
      paddingTop: Space.smMd,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    subCell: {
      flex: 1,
      gap: Space.xxs,
    },
    subDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
      marginHorizontal: Space.smMd,
    },
    subLabel: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.medium,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    subValue: {
      fontSize: TypographyV2.numericMeta.size,
      lineHeight: TypographyV2.numericMeta.lineHeight,
      fontFamily: FontFamily.semibold,
      fontVariant: ['tabular-nums'],
    },
  });
}
