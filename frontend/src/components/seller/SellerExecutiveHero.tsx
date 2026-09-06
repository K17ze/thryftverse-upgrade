import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { AppIcon } from '../common/AppIcon';
import { AnimatedNumber } from '../common/AnimatedNumber';
import { IconSize } from '../../theme/iconTokens';
import type { SellerHubOverview } from '../../services/sellerHubApi';

export interface SellerExecutiveHeroProps {
  currentUser: {
    id?: string;
    displayName?: string | null;
    username?: string | null;
    avatar?: string | null;
  } | null;
  sellerTrust?: {
    rating?: number | null;
    completedSales?: number | null;
    verified?: boolean | null;
  } | null;
  money?: SellerHubOverview['money'] | null;
  formatMoney: (value: number | null | undefined) => string;
  onOpenStorefront: () => void;
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
  currentUser,
  sellerTrust,
  money,
  formatMoney,
  onOpenStorefront,
  onOpenWallet,
}) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  const isVerified = sellerTrust?.verified === true;
  const availableGbp = money?.availableGbp ?? null;
  const processingGbp = money?.processingGbp ?? null;
  const heldGbp = money?.heldGbp ?? 0;
  const nextPayoutLabel = money?.nextPayoutAt ? formatPayoutDate(money.nextPayoutAt) : null;

  const ratingLabel = sellerTrust?.rating ? `${sellerTrust.rating.toFixed(1)} ★` : null;
  const salesLabel = sellerTrust?.completedSales ? `${sellerTrust.completedSales} sales` : null;
  const shopMeta = [ratingLabel, salesLabel].filter(Boolean).join(' · ') || null;

  return (
    <View style={styles.container}>
      {/* ── Shop identity — the row itself opens the storefront ── */}
      <AnimatedPressable
        style={styles.identityBar}
        onPress={onOpenStorefront}
        activeOpacity={0.7}
        scaleValue={0.99}
        hapticFeedback="light"
        accessibilityRole="button"
        accessibilityLabel={
          shopMeta
            ? `Open your storefront, ${shopMeta}`
            : 'Open your storefront'
        }
      >
        <View style={[styles.avatarWrap, { borderColor: colors.border }]}>
          {currentUser?.avatar ? (
            <CachedImage uri={currentUser.avatar} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.avatarInitials, { color: colors.textPrimary }]}>
                {(currentUser?.displayName || currentUser?.username || 'S').slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.identityInfo}>
          <View style={styles.nameRow}>
            <Text style={[styles.shopName, { color: colors.textPrimary }]} numberOfLines={1}>
              {currentUser?.displayName || currentUser?.username || 'My Store'}
            </Text>
            {isVerified && (
              <AppIcon concept="verified" size={IconSize.xs} color="brand" opticalCenter accessible={false} />
            )}
          </View>
          {shopMeta && (
            <Text style={[styles.shopMeta, { color: colors.textSecondary }]}>
              {shopMeta}
            </Text>
          )}
        </View>

        <AppIcon concept="forward" size={IconSize.xs} color="textMuted" opticalCenter accessible={false} />
      </AnimatedPressable>

      {/* ── Liquidity panel — the one dominant surface above the fold ── */}
      <View style={[styles.moneyPanel, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
        <View style={styles.availableSection}>
          <View style={styles.availableHeaderRow}>
            <View style={styles.availableLabelWrap}>
              <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
              <Text style={[styles.availableLabel, { color: colors.textSecondary }]}>
                Available Payout
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
              <Text style={[styles.splitLabel, { color: colors.textSecondary }]}>In Escrow</Text>
            </View>
            <Text style={[styles.splitValue, { color: colors.textPrimary }]}>
              {processingGbp != null ? formatMoney(processingGbp) : '—'}
            </Text>
            <Text style={[styles.splitSub, { color: colors.textMuted }]}>
              Clears on delivery
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
                <Text style={[styles.splitSub, { color: colors.textMuted }]}>
                  Automatic
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
              Reserved: {formatMoney(heldGbp)} held in rolling reserve
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
      paddingTop: Space.xs,
    },
    identityBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm,
      minHeight: 56,
    },
    avatarWrap: {
      width: 46,
      height: 46,
      borderRadius: Radius.full,
      overflow: 'hidden',
      borderWidth: 1,
    },
    avatar: {
      width: '100%',
      height: '100%',
    },
    avatarFallback: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitials: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: FontFamily.bold,
      letterSpacing: 0.5,
    },
    identityInfo: {
      flex: 1,
      gap: 2,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    shopName: {
      fontSize: TypographyV2.itemTitle.size,
      fontFamily: FontFamily.bold,
      letterSpacing: -0.2,
    },
    shopMeta: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.regular,
    },

    // ── Liquidity panel — the one dominant surface above the fold ──
    moneyPanel: {
      borderRadius: Radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
      marginTop: Space.xs,
    },
    availableSection: {
      gap: 4,
    },
    availableHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    availableLabelWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: Radius.full,
    },
    availableLabel: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    transferBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
      borderRadius: Radius.full,
      minHeight: Control.hit,
    },
    transferBtnText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.bold,
      letterSpacing: 0.2,
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
      gap: 3,
    },
    verticalDivider: {
      width: StyleSheet.hairlineWidth,
      height: '100%',
      marginHorizontal: Space.md,
    },
    metricLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    splitLabel: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.medium,
    },
    splitValue: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: FontFamily.bold,
      fontVariant: ['tabular-nums'],
      marginTop: 2,
    },
    splitSub: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
    },

    safeguardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
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
