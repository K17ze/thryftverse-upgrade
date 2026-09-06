import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { AnimatedNumber } from '../common/AnimatedNumber';
import { IconSize } from '../../theme/iconTokens';
import type { SellerHubOverview } from '../../services/sellerHubApi';

export interface SellerExecutiveHeroProps {
  money?: SellerHubOverview['money'] | null;
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

export const SellerExecutiveHero: React.FC<SellerExecutiveHeroProps> = ({
  money,
  formatMoney,
  onOpenWallet,
}) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  const availableGbp = money?.availableGbp ?? null;
  const processingGbp = money?.processingGbp ?? null;
  const heldGbp = money?.heldGbp ?? 0;
  const nextPayoutLabel = money?.nextPayoutAt ? formatPayoutDate(money.nextPayoutAt) : null;

  return (
    <View style={styles.container}>
      {/* Liquidity panel — the one dominant surface above the fold */}
      <View style={[styles.moneyPanel, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
        <View style={styles.availableSection}>
          <View style={styles.availableHeaderRow}>
            <View style={styles.availableLabelWrap}>
              <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
              <Text style={[styles.availableLabel, { color: colors.textSecondary }]}>
                Available payout
              </Text>
            </View>
            <AnimatedPressable
              style={[styles.transferBtn, { backgroundColor: colors.brand }]}
              onPress={onOpenWallet}
              activeOpacity={0.8}
              scaleValue={0.97}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Withdraw funds in wallet"
            >
              <Text style={[styles.transferBtnText, { color: colors.textInverse }]}>Transfer</Text>
              <AppIcon concept="forward" size={IconSize.xs} color="textInverse" opticalCenter accessible={false} />
            </AnimatedPressable>
          </View>

          {availableGbp != null ? (
            <AnimatedNumber
              value={availableGbp}
              format={formatMoney}
              style={[styles.availableHeroValue, { color: colors.textPrimary }]}
            />
          ) : (
            <Text style={[styles.availableHeroValue, { color: colors.textMuted }]}>—</Text>
          )}
        </View>

        <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

        {/* Liquidity split — escrow now, payout next */}
        <View style={styles.splitRow}>
          <View style={styles.splitCol}>
            <View style={styles.metricLabelRow}>
              <AppIcon concept="shield" size={IconSize.xs} color="textMuted" opticalCenter accessible={false} />
              <Text style={[styles.splitLabel, { color: colors.textSecondary }]}>In escrow</Text>
            </View>
            <Text style={[styles.splitValue, { color: colors.textPrimary }]}>
              {processingGbp != null ? formatMoney(processingGbp) : '—'}
            </Text>
          </View>

          {nextPayoutLabel && (
            <>
              <View style={[styles.verticalDivider, { backgroundColor: colors.border }]} />
              <View style={styles.splitCol}>
                <View style={styles.metricLabelRow}>
                  <AppIcon concept="pending" size={IconSize.xs} color="textMuted" opticalCenter accessible={false} />
                  <Text style={[styles.splitLabel, { color: colors.textSecondary }]}>Next payout</Text>
                </View>
                <Text style={[styles.splitValue, { color: colors.textPrimary }]}>
                  {nextPayoutLabel}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Rolling reserve safeguard — only when money is actually held */}
        {heldGbp > 0 && (
          <View style={[styles.safeguardFooter, { borderTopColor: colors.borderSubtle }]}>
            <AppIcon concept="lock" size={IconSize.xs} color="textMuted" opticalCenter accessible={false} />
            <Text style={[styles.safeguardText, { color: colors.textMuted }]}>
              {formatMoney(heldGbp)} in rolling reserve
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: Space.md,
      paddingTop: Space.md,
    },
    moneyPanel: {
      borderRadius: Radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
    },
    availableSection: {
      gap: Space.xs,
    },
    availableHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    availableLabelWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: Radius.full,
    },
    availableLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    transferBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.full,
      minHeight: Control.hit,
    },
    transferBtnText: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.bold,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    availableHeroValue: {
      fontSize: TypographyV2.priceHero.size,
      fontFamily: FontFamily.bold,
      lineHeight: TypographyV2.priceHero.lineHeight,
      letterSpacing: TypographyV2.priceHero.letterSpacing,
      fontVariant: ['tabular-nums'],
    },
    cardDivider: {
      height: StyleSheet.hairlineWidth,
      marginVertical: Space.md,
    },
    splitRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    splitCol: {
      flex: 1,
      gap: Space.xxs,
    },
    verticalDivider: {
      width: StyleSheet.hairlineWidth,
      height: '100%',
      marginHorizontal: Space.md,
    },
    metricLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    splitLabel: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.medium,
    },
    splitValue: {
      fontSize: TypographyV2.numericMeta.size,
      lineHeight: TypographyV2.numericMeta.lineHeight,
      fontFamily: FontFamily.semibold,
      fontVariant: ['tabular-nums'],
      marginTop: Space.xxs,
    },
    safeguardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingTop: Space.sm,
      marginTop: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    safeguardText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
    },
  });
}
