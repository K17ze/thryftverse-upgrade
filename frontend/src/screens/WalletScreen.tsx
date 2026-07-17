import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { useToast } from '../context/ToastContext';
import { Space, Radius, Type, Typography, DockConstants } from '../theme/designTokens';
import { AppButton } from '../components/ui/AppButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { haptics } from '../utils/haptics';
import { toIze } from '../utils/currency';
import { parseApiError } from '../lib/apiClient';
import { getIzePosition } from '../services/walletApi';
import {
  CoOwnMarketHeader,
  CoOwnWalletBreakdown,
  CoOwnWalletBreakdownSkeleton,
  CoOwnStateCanvas,
  CoOwnOfflineBanner,
  CoOwnReconciliationBanner,
  type CoOwn1ZeBalance,
} from '../components/coown';
import { useConnectivity } from '../hooks/useConnectivity';

type Props = StackScreenProps<RootStackParamList, 'Wallet'>;

export default function WalletScreen({ navigation }: Props) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const currentUser = useStore((state) => state.currentUser);
  const { currencyCode, goldRates } = useCurrencyContext();
  const { formatFromIze } = useFormattedPrice();
  const { show } = useToast();
  const { isOffline } = useConnectivity();

  const [balance, setBalance] = React.useState<CoOwn1ZeBalance>({
    available: 0,
    reservedForOrders: 0,
    redemptionInProgress: 0,
    otherHolds: 0,
    pendingDeposit: 0,
    unsettledSaleProceeds: 0,
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const loadBalance = React.useCallback(() => {
    if (!currentUser?.id) { setIsLoading(false); return; }
    let cancelled = false;
    setIsLoading(true);
    setIsError(false);

    getIzePosition(currentUser.id, currencyCode)
      .then((position) => {
        if (cancelled) return;
        const availableIze = position.balances.userIze / 1000; // mg → 1ZE
        setBalance({
          available: availableIze,
          reservedForOrders: 0, // Backend does not yet expose this split
          redemptionInProgress: 0,
          otherHolds: 0,
          pendingDeposit: 0,
          unsettledSaleProceeds: 0,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err, 'Unable to load wallet');
        show(parsed.message, 'error');
        setIsError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [currentUser?.id, currencyCode, show]);

  React.useEffect(() => {
    const cleanup = loadBalance();
    return cleanup;
  }, [loadBalance]);

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    loadBalance();
    setTimeout(() => setRefreshing(false), 800);
  }, [loadBalance]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('CoOwnHub');
  }, [navigation]);

  const handleAdd1ZE = React.useCallback(() => {
    haptics.tap();
    // Navigate to the existing Balance screen for the add flow
    navigation.navigate('Balance');
  }, [navigation]);

  const handleRedeem1ZE = React.useCallback(() => {
    haptics.tap();
    // Navigate to the existing Balance screen for the convert/redeem flow
    navigation.navigate('Balance');
  }, [navigation]);

  const handleViewActivity = React.useCallback(() => {
    haptics.tap();
    navigation.navigate('CoOwnOrderHistory');
  }, [navigation]);

  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + DockConstants.dualActionHeight;

  // Local-fiat indication
  const localFiatRate = toIze(1, currencyCode, goldRates) > 0 ? 1 / toIze(1, currencyCode, goldRates) : 0;
  const localFiatLabel = balance.available > 0 && localFiatRate > 0
    ? `≈ ${formatFromIze(balance.available)}`
    : undefined;

  // ── Loading state ──
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <CoOwnMarketHeader
          title="Wallet"
          subtitle="Your 1ZE settlement balance"
          onBack={handleBack}
        />
        <CoOwnWalletBreakdownSkeleton />
      </SafeAreaView>
    );
  }

  // ── Error state ──
  if (isError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <CoOwnMarketHeader
          title="Wallet"
          subtitle="Your 1ZE settlement balance"
          onBack={handleBack}
        />
        <CoOwnStateCanvas
          variant="error"
          actionLabel="Try again"
          onAction={loadBalance}
        />
      </SafeAreaView>
    );
  }

  // ── Empty state ──
  if (balance.available === 0 && balance.reservedForOrders === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <CoOwnMarketHeader
          title="Wallet"
          subtitle="Your 1ZE settlement balance"
          onBack={handleBack}
        />
        <CoOwnStateCanvas
          variant="empty"
          title="No 1ZE yet"
          subtitle="Add 1ZE to start trading Co-Own units."
          actionLabel="Add 1ZE"
          onAction={handleAdd1ZE}
          emptyGraphicVariant="bag"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <CoOwnMarketHeader
        title="Wallet"
        subtitle="Your 1ZE settlement balance"
        onBack={handleBack}
        actions={[
          { icon: 'receipt-outline', label: 'Activity', onPress: handleViewActivity },
        ]}
      />

      <CoOwnOfflineBanner isOffline={isOffline} />
      <CoOwnReconciliationBanner
        isActive={balance.reconciliationState === 'reconciling' || balance.reconciliationState === 'break'}
        lastReliableTimestamp={balance.serverTimestamp}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textSecondary}
          />
        }
      >
        {/* Wallet breakdown — spendable hero + sub-balances + safeguarding */}
        <CoOwnWalletBreakdown
          balance={balance}
          localFiatLabel={localFiatLabel}
          localFiatSource={currencyCode}
        />

        {/* Add / Redeem — separate flows, never combined */}
        <View style={styles.actionRow}>
          <AppButton
            title="Add 1ZE"
            icon={<Ionicons name="add-circle-outline" size={18} color={colors.background} />}
            onPress={handleAdd1ZE}
            variant="primary"
            size="md"
            accessibilityLabel="Add 1ZE to your wallet"
            hapticFeedback="medium"
            style={styles.actionBtn}
          />
          <AppButton
            title="Redeem 1ZE"
            icon={<Ionicons name="arrow-down-circle-outline" size={18} color={colors.textPrimary} />}
            onPress={handleRedeem1ZE}
            variant="secondary"
            size="md"
            accessibilityLabel="Redeem 1ZE to your bank"
            hapticFeedback="medium"
            style={styles.actionBtn}
          />
        </View>

        {/* Bank / payment source — placeholder for future */}
        <View style={[styles.paymentSourceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.paymentSourceHeader}>
            <Ionicons name="card-outline" size={15} color={colors.textMuted} />
            <Text style={[styles.paymentSourceTitle, { color: colors.textPrimary }]}>
              Bank / payment source
            </Text>
          </View>
          <Text style={[styles.paymentSourceNote, { color: colors.textMuted }]}>
            Payment source management is available in the Balance screen.
          </Text>
          <AnimatedPressable
            onPress={() => { haptics.tap(); navigation.navigate('Balance'); }}
            accessibilityRole="button"
            accessibilityLabel="Manage payment sources"
            scaleValue={0.97}
            hapticFeedback="light"
          >
            <Text style={[styles.paymentSourceLink, { color: colors.textSecondary }]}>
              Manage in Balance →
            </Text>
          </AnimatedPressable>
        </View>

        {/* Activity — link to order history */}
        <AnimatedPressable
          style={[styles.activityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={handleViewActivity}
          accessibilityRole="button"
          accessibilityLabel="View wallet activity"
          scaleValue={0.98}
          hapticFeedback="light"
        >
          <View style={styles.activityLeft}>
            <Ionicons name="receipt-outline" size={15} color={colors.textSecondary} />
            <Text style={[styles.activityTitle, { color: colors.textPrimary }]}>Activity</Text>
          </View>
          <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
        </AnimatedPressable>

        {/* Statements — placeholder for future */}
        <View style={[styles.statementsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.statementsTitle, { color: colors.textPrimary }]}>Statements</Text>
          <Text style={[styles.statementsNote, { color: colors.textMuted }]}>
            PDF and CSV statements will be available here.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.lg,
  },
  actionBtn: {
    flex: 1,
  },
  paymentSourceCard: {
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
    gap: Space.sm,
    marginTop: Space.lg,
  },
  paymentSourceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  paymentSourceTitle: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  paymentSourceNote: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  paymentSourceLink: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    marginTop: Space.lg,
  },
  activityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  activityTitle: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  statementsCard: {
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
    gap: Space.xs,
    marginTop: Space.lg,
  },
  statementsTitle: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  statementsNote: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
});
