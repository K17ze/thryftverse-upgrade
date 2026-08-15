/**
 * SellerEarningsScreen — dedicated seller earnings surface.
 *
 * Shows the seller wallet summary (available / pending / in-reserve) and the
 * per-order release schedule for pending sale proceeds. Reached from the
 * Wallet home earnings summary row (`Seller earnings · £X available · £Y pending`).
 *
 * Financial truth is preserved verbatim from the previous inline wallet card:
 * `getSellerWalletBalances` remains the single source of seller money.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { useToast } from '../context/ToastContext';
import { Space, Radius, Type, Typography, Stroke, DockConstants } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { CoOwnStateCanvas, CoOwnWalletBreakdownSkeleton } from '../components/coown';
import { getSellerWalletBalances, type SellerWalletBalanceItem } from '../services/walletApi';
import { parseApiError } from '../lib/apiClient';
import { haptics } from '../utils/haptics';

type Props = NativeStackScreenProps<RootStackParamList, 'SellerEarnings'>;

interface SellerBalances {
  availableGbp: number;
  pendingGbp: number;
  heldInReserveGbp: number;
  pendingBreakdown: SellerWalletBalanceItem[];
}

export default function SellerEarningsScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const currentUser = useStore((state) => state.currentUser);
  const { currencyCode } = useCurrencyContext();
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();

  const [balances, setBalances] = React.useState<SellerBalances | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const loadBalances = React.useCallback(() => {
    if (!currentUser?.id) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setIsError(false);

    getSellerWalletBalances(currentUser.id)
      .then((sellerWallet) => {
        if (cancelled) return;
        setBalances({
          availableGbp: sellerWallet.balances.availableGbp,
          pendingGbp: sellerWallet.balances.pendingGbp,
          heldInReserveGbp: sellerWallet.balances.heldInReserveGbp,
          pendingBreakdown: sellerWallet.pendingBreakdown,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err, 'Unable to load seller earnings');
        show(parsed.message, 'error');
        setIsError(true);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
          setRefreshing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, show]);

  React.useEffect(() => {
    const cleanup = loadBalances();
    return cleanup;
  }, [loadBalances]);

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    loadBalances();
  }, [loadBalances]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Wallet');
  }, [navigation]);

  const handleWithdraw = React.useCallback(() => {
    haptics.tap();
    navigation.navigate('Withdraw');
  }, [navigation]);

  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + DockConstants.dualActionHeight;
  const hasEarnings =
    balances !== null &&
    (balances.pendingGbp > 0 || balances.availableGbp > 0 || balances.heldInReserveGbp > 0);

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Seller earnings"
          subtitle="Sale proceeds & release schedule"
          onBack={handleBack}
        />
      }
      scrollEnabled={false}
    >
      {isLoading ? (
        <CoOwnWalletBreakdownSkeleton />
      ) : isError ? (
        <CoOwnStateCanvas variant="error" actionLabel="Try again" onAction={loadBalances} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.textSecondary} />
          }
        >
          {/* ── Summary: available / pending / in-reserve ── */}
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.summaryHeader}>
              <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>
                Sale proceeds
              </Text>
              <View style={[styles.summaryChip, { backgroundColor: colors.brand + '12' }]}>
                <Ionicons name="pricetag-outline" size={11} color={colors.brand} />
                <Text style={[styles.summaryChipText, { color: colors.brand }]}>Seller balance</Text>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                  Available
                </Text>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                  {formatFromFiat(balances?.availableGbp ?? 0, currencyCode, { displayMode: 'fiat' })}
                </Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                  Pending
                </Text>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                  {formatFromFiat(balances?.pendingGbp ?? 0, currencyCode, { displayMode: 'fiat' })}
                </Text>
              </View>
              {(balances?.heldInReserveGbp ?? 0) > 0 && (
                <>
                  <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                      In reserve
                    </Text>
                    <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                      {formatFromFiat(balances?.heldInReserveGbp ?? 0, currencyCode, { displayMode: 'fiat' })}
                    </Text>
                  </View>
                </>
              )}
            </View>

            {(balances?.availableGbp ?? 0) > 0 && (
              <Pressable
                style={({ pressed }) => [styles.withdrawRow, pressed && { opacity: 0.6 }]}
                onPress={handleWithdraw}
                accessibilityRole="button"
                accessibilityLabel="Withdraw available sale proceeds"
                accessibilityHint="Opens the withdrawal flow"
              >
                <Text style={[styles.withdrawRowText, { color: colors.brand }]}>
                  Withdraw available proceeds
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.brand} />
              </Pressable>
            )}
          </View>

          {/* ── Per-order release schedule ── */}
          <View style={styles.scheduleSection}>
            <Text style={[styles.scheduleTitle, { color: colors.textPrimary }]}>
              Pending release schedule
            </Text>
            <Text style={[styles.scheduleHint, { color: colors.textMuted }]}>
              Funds release after buyer delivery confirmation plus the holding window.
            </Text>

            {!hasEarnings || (balances?.pendingBreakdown.length ?? 0) === 0 ? (
              <View style={[styles.emptySchedule, { borderColor: colors.border }]}>
                <Ionicons name="checkmark-circle-outline" size={22} color={colors.textMuted} />
                <Text style={[styles.emptyScheduleText, { color: colors.textMuted }]}>
                  No pending sale proceeds. Earnings will appear here as orders complete.
                </Text>
              </View>
            ) : (
              <View style={styles.scheduleList}>
                {balances!.pendingBreakdown.map((item) => {
                  const releaseIn = item.releaseScheduledAt
                    ? Math.max(
                        0,
                        Math.ceil(
                          (new Date(item.releaseScheduledAt).getTime() - Date.now()) /
                            (1000 * 60 * 60 * 24)
                        )
                      )
                    : null;
                  return (
                    <View key={item.orderId} style={[styles.scheduleItem, { borderColor: colors.border }]}>
                      <View style={styles.scheduleItemInfo}>
                        <Text
                          style={[styles.scheduleItemTitle, { color: colors.textPrimary }]}
                          numberOfLines={1}
                        >
                          {item.listingTitle ?? 'Order'}
                        </Text>
                        <Text style={[styles.scheduleItemMeta, { color: colors.textMuted }]}>
                          {item.orderStatus === 'delivered'
                            ? releaseIn !== null && releaseIn > 0
                              ? `Releases in ${releaseIn}d`
                              : 'Releasing soon'
                            : `Awaiting ${item.orderStatus === 'shipped' ? 'delivery' : 'shipment'}`}
                        </Text>
                      </View>
                      <Text style={[styles.scheduleItemAmount, { color: colors.textPrimary }]}>
                        {formatFromFiat(item.amountGbp, currencyCode, { displayMode: 'fiat' })}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  summaryCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
    gap: Space.sm,
  },
  summaryTitle: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  summaryChipText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.meta.letterSpacing,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  summaryItem: {
    flex: 1,
    paddingVertical: Space.xs,
  },
  summaryDivider: {
    width: Stroke.standard,
    marginVertical: Space.xs,
  },
  summaryLabel: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
    marginBottom: Space.xs / 2,
  },
  summaryValue: {
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceList.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  withdrawRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm,
    marginTop: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
  withdrawRowText: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  scheduleSection: {
    marginTop: Space.lg,
    gap: Space.sm,
  },
  scheduleTitle: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  scheduleHint: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight + 2,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  emptySchedule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyScheduleText: {
    flex: 1,
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight + 2,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  scheduleList: {
    gap: Space.xs,
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  scheduleItemInfo: {
    flex: 1,
    marginRight: Space.sm,
  },
  scheduleItemTitle: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
  },
  scheduleItemMeta: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
    marginTop: Space.xs / 2,
  },
  scheduleItemAmount: {
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceList.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
});
