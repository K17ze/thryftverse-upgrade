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
  Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { useToast } from '../context/ToastContext';
import { Space, Radius, DockConstants } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { CoOwnStateCanvas, CoOwnWalletBreakdownSkeleton } from '../components/coown';
import { getSellerWalletBalances, type SellerWalletBalanceItem } from '../services/walletApi';
import { parseApiError } from '../lib/apiClient';
import { haptics } from '../utils/haptics';
import { useScreenCaptureProtection } from '../platform/screenCapture';
import { OfflineBanner } from '../components/OfflineBanner';


type Props = NativeStackScreenProps<RootStackParamList, 'SellerEarnings'>;

interface SellerBalances {
  availableGbp: number;
  pendingGbp: number;
  heldInReserveGbp: number;
  pendingBreakdown: SellerWalletBalanceItem[];
}

export default function SellerEarningsScreen({ navigation }: Props) {
  useScreenCaptureProtection();
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
          pendingBreakdown: sellerWallet.pendingBreakdown });
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
          onBack={handleBack}
        />
      }
      scrollEnabled={false}
    >
      <OfflineBanner onRetry={() => void handleRefresh()} />
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
          {/* ── Hero: available balance — flat, no card ──
              One dominant object. The number IS the object.
              No card border, no chip, no decorative chrome. */}
          <View style={styles.heroBlock}>
            <Text style={[styles.heroEyebrow, { color: colors.textMuted }]}>
              Available
            </Text>
            <Text style={[styles.heroValue, { color: colors.textPrimary }]}>
              {formatFromFiat(balances?.availableGbp ?? 0, currencyCode, { displayMode: 'fiat' })}
            </Text>
            {(balances?.availableGbp ?? 0) > 0 && (
              <Pressable
                style={({ pressed }) => [styles.withdrawRow, pressed && { opacity: 0.6 }]}
                onPress={handleWithdraw}
                accessibilityRole="button"
                accessibilityLabel="Withdraw available sale proceeds"
                accessibilityHint="Opens the withdrawal flow"
              >
                <Text style={[styles.withdrawRowText, { color: colors.brand }]}>
                  Withdraw
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.brand} />
              </Pressable>
            )}
          </View>

          {/* ── Secondary balances — flat hairline rows, not a grid ──
              Per anti-AI design: no 3-column equal grid. Each balance is
              a flat row with a hairline divider. Only shown when non-zero. */}
          <View style={styles.secondaryBalances}>
            {(balances?.pendingGbp ?? 0) > 0 && (
              <View style={[styles.balanceRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>Pending</Text>
                <Text style={[styles.balanceValue, { color: colors.textPrimary }]}>
                  {formatFromFiat(balances!.pendingGbp, currencyCode, { displayMode: 'fiat' })}
                </Text>
              </View>
            )}
            {(balances?.heldInReserveGbp ?? 0) > 0 && (
              <View style={[styles.balanceRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>In reserve</Text>
                <Text style={[styles.balanceValue, { color: colors.textPrimary }]}>
                  {formatFromFiat(balances!.heldInReserveGbp, currencyCode, { displayMode: 'fiat' })}
                </Text>
              </View>
            )}
          </View>

          {/* ── Per-order release schedule ── */}
          <View style={styles.scheduleSection}>
            <Text style={[styles.scheduleTitle, { color: colors.textPrimary }]}>
              Pending release
            </Text>

            {!hasEarnings || (balances?.pendingBreakdown.length ?? 0) === 0 ? (
              <View style={styles.emptyScheduleWrap}>
                <Text style={[styles.emptyScheduleText, { color: colors.textMuted }]}>
                  No pending proceeds.
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
                  const isException = item.orderStatus === 'cancelled' || item.orderStatus === 'refunded' || item.orderStatus === 'returned' || item.orderStatus === 'delivery_failed';
                  const isDisputed = item.orderStatus === 'disputed' || item.orderStatus === 'under_review';
                  return (
                    <View key={item.orderId} style={[styles.scheduleItem, { borderTopColor: isException ? colors.dangerBorder : isDisputed ? colors.warningBorder : colors.border }]}>
                      <View style={styles.scheduleItemInfo}>
                        <Text
                          style={[styles.scheduleItemTitle, { color: colors.textPrimary }]}
                          numberOfLines={1}
                        >
                          {item.listingTitle ?? 'Order'}
                        </Text>
                        <Text style={[styles.scheduleItemMeta, { color: isException ? colors.danger : isDisputed ? colors.warning : colors.textMuted }]}>
                          {isException
                            ? 'Exception — funds on hold pending resolution'
                            : isDisputed
                              ? 'Under review — release paused during dispute'
                              : item.orderStatus === 'delivered'
                                ? releaseIn !== null && releaseIn > 0
                                  ? `Releases in ${releaseIn}d`
                                  : 'Releasing soon'
                                : `Awaiting ${item.orderStatus === 'shipped' || item.orderStatus === 'in transit' || item.orderStatus === 'out for delivery' ? 'delivery' : 'shipment'}`}
                        </Text>
                      </View>
                      <Text style={[styles.scheduleItemAmount, { color: isException ? colors.danger : colors.textPrimary }]}>
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
    paddingTop: Space.md },

  // ── Hero — flat, no card ──
  heroBlock: {
    paddingVertical: Space.md },
  heroEyebrow: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginBottom: Space.xs - 2 },
  heroValue: {
    fontSize: TypographyV2.priceHero.size,
    lineHeight: TypographyV2.priceHero.lineHeight,
    fontFamily: TypographyV2.priceHero.fontFamily,
    fontVariant: ['tabular-nums'] },
  withdrawRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: Space.sm,
    marginTop: Space.xs },
  withdrawRowText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },

  // ── Secondary balances — flat hairline rows ──
  secondaryBalances: {
    marginTop: Space.sm },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth },
  balanceLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily },
  balanceValue: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontVariant: ['tabular-nums'] },

  // ── Release schedule ──
  scheduleSection: {
    marginTop: Space.lg },
  scheduleTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    marginBottom: Space.sm },
  emptyScheduleWrap: {
    paddingVertical: Space.md },
  emptyScheduleText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  scheduleList: {
    gap: 0 },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth },
  scheduleItemInfo: {
    flex: 1,
    marginRight: Space.sm },
  scheduleItemTitle: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  scheduleItemMeta: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.xs / 2 },
  scheduleItemAmount: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: TypographyV2.priceList.fontFamily,
    letterSpacing: TypographyV2.priceList.letterSpacing,
    fontVariant: ['tabular-nums'] } });

