import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  RefreshControl,
  Pressable,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { useToast } from '../context/ToastContext';
import { Space, Radius, Type, Typography, DockConstants, LetterSpacing } from '../theme/designTokens';
import { AppButton } from '../components/ui/AppButton';
import { haptics } from '../utils/haptics';
import { convertGbpToDisplayAmount } from '../utils/currencyAuthoringFlows';
import { parseApiError } from '../lib/apiClient';
import {
  getIzePosition,
  getWalletSnapshot,
  getSellerWalletBalances,
  type SellerWalletBalanceItem,
} from '../services/walletApi';
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
import { useBiometricGate } from '../hooks/useBiometricGate';
import { BiometricGatePrompt } from '../components/security/BiometricGate';
import { WalletTransactionHistory } from '../components/wallet/WalletTransactionHistory';
import { AddMoneySheet } from '../components/wallet/AddMoneySheet';

type Props = NativeStackScreenProps<RootStackParamList, 'Wallet'>;

export default function WalletScreen({ navigation }: Props) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const currentUser = useStore((state) => state.currentUser);
  const { currencyCode, goldRates } = useCurrencyContext();
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const { isOffline } = useConnectivity();

  // ── Biometric gate (OWASP M5) ──
  // Wallet balances are sensitive. Require biometric re-authentication before
  // revealing any wallet content. Falls through when biometric is unavailable.
  const biometricGate = useBiometricGate();

  // ── Balance state (canonical 1ZE sub-balances) ──
  const [balance, setBalance] = React.useState<CoOwn1ZeBalance>({
    available: 0,
    reservedForOrders: 0,
    redemptionInProgress: 0,
    otherHolds: 0,
    pendingDeposit: 0,
    unsettledSaleProceeds: 0,
    settledCustomerClaim: 0,
    withdrawable: 0,
    safeguarded: false,
    safeguardingPartner: undefined,
    safeguardingEvidenceUrl: null,
    safeguardingTermsUrl: null,
    snapshotSequence: 0,
    serverTimestamp: '',
    reconciliationState: 'reconciled',
  });
  // Fiat balance kept in parallel for the "Buy 1ZE with fiat balance" flow.
  const [availableFiatBalance, setAvailableFiatBalance] = useState(0);
  // Seller wallet: pending vs available balance with per-order breakdown.
  const [sellerBalances, setSellerBalances] = useState<{
    availableGbp: number;
    pendingGbp: number;
    heldInReserveGbp: number;
    pendingBreakdown: SellerWalletBalanceItem[];
  } | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  // ── Inline flow state ──
  // Add money is handled by the extracted AddMoneySheet (spec 17).
  // Convert is handled by the dedicated WalletConvertScreen (Phase 3.1).
  const [addMoneyVisible, setAddMoneyVisible] = useState(false);
  // ── Privacy eye (spec 17 viewport 1) ──
  const [balanceHidden, setBalanceHidden] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  // ── Balance hydration ──
  const loadBalance = React.useCallback(() => {
    if (!currentUser?.id) { setIsLoading(false); return; }
    let cancelled = false;
    setIsLoading(true);
    setIsError(false);

    Promise.all([
      getIzePosition(currentUser.id, currencyCode),
      getWalletSnapshot(currentUser.id).catch(() => null),
      getSellerWalletBalances(currentUser.id).catch(() => null),
    ])
      .then(([position, fiatWallet, sellerWallet]) => {
        if (cancelled) return;
        setBalance({
          available: position.balances.availableIze,
          reservedForOrders: position.balances.reservedForOrders,
          redemptionInProgress: position.balances.redemptionInProgress,
          otherHolds: position.balances.otherHolds,
          pendingDeposit: position.balances.pendingDeposit,
          unsettledSaleProceeds: position.balances.unsettledSaleProceeds,
          settledCustomerClaim: position.balances.settledCustomerClaim,
          withdrawable: position.balances.withdrawable,
          safeguarded: position.balances.safeguarded,
          safeguardingPartner: position.balances.safeguardingPartner ?? undefined,
          safeguardingEvidenceUrl: position.balances.safeguardingEvidenceUrl ?? null,
          safeguardingTermsUrl: position.balances.safeguardingTermsUrl ?? null,
          snapshotSequence: position.balances.snapshotSequence,
          serverTimestamp: position.balances.serverTimestamp,
          reconciliationState: position.balances.reconciliationState,
        });
        setAvailableFiatBalance(fiatWallet?.snapshot.availableGbp ?? 0);
        if (sellerWallet) {
          setSellerBalances({
            availableGbp: sellerWallet.balances.availableGbp,
            pendingGbp: sellerWallet.balances.pendingGbp,
            heldInReserveGbp: sellerWallet.balances.heldInReserveGbp,
            pendingBreakdown: sellerWallet.pendingBreakdown,
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err, 'Unable to load wallet');
        show(parsed.message, 'error');
        setIsError(true);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
          // Finish refresh when the request settles — no fixed timer (spec 17).
          setRefreshing(false);
        }
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
  }, [loadBalance]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('CoOwnHub');
  }, [navigation]);

  // ── Flow expansion — now navigates to dedicated screens ──
  const handleConvert = React.useCallback(() => {
    haptics.tap();
    navigation.navigate('WalletConvert');
  }, [navigation]);

  // ── Derived values ──
  const isWalletOperational = balance.reconciliationState === 'reconciled' && !isOffline;

  // ── Local-fiat indication for spendable hero ──
  const localFiatRate = convertGbpToDisplayAmount(1, currencyCode, goldRates);
  const localFiatLabel = balance.available > 0 && localFiatRate > 0
    ? `≈ ${formatFromFiat(balance.available, 'GBP', { displayMode: 'fiat' })}`
    : undefined;

  // ── Add money (extracted AddMoneySheet — spec 17 dedicated flow) ──
  const handleAddMoney = React.useCallback(() => {
    haptics.tap();
    setAddMoneyVisible(true);
  }, []);

  // ── Privacy eye toggle (spec 17 viewport 1) ──
  const handleTogglePrivacy = React.useCallback(() => {
    setBalanceHidden((prev) => !prev);
  }, []);

  // ── Activity (canonical WalletActivityScreen — spec 17) ──
  const handleViewActivity = React.useCallback(() => {
    haptics.tap();
    navigation.navigate('WalletActivity');
  }, [navigation]);

  // ── Seller earnings (extracted SellerEarningsScreen — spec 17) ──
  const handleViewEarnings = React.useCallback(() => {
    haptics.tap();
    navigation.navigate('SellerEarnings');
  }, [navigation]);

  const handleWithdraw = React.useCallback(() => {
    haptics.tap();
    navigation.navigate('Withdraw');
  }, [navigation]);

  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + DockConstants.dualActionHeight;

  // Auto-prompt biometric once availability is confirmed.
  React.useEffect(() => {
    if (biometricGate.status === 'locked' && !biometricGate.isAuthenticating) {
      void biometricGate.authenticate('Authenticate to view your wallet');
    }
  }, [biometricGate.status, biometricGate.isAuthenticating, biometricGate.authenticate]);

  // ── Biometric gate: block sensitive content until authenticated ──
  if (biometricGate.status === 'pending' || biometricGate.status === 'locked') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <BiometricGatePrompt
          gate={biometricGate}
          reason="Authenticate to view your wallet"
          header={
            <CoOwnMarketHeader
              title="Wallet"
              onBack={handleBack}
            />
          }
          onBack={handleBack}
        />
      </SafeAreaView>
    );
  }

  // ── Loading state ──
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <CoOwnMarketHeader
          title="Wallet"
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
          onBack={handleBack}
        />
        <CoOwnStateCanvas
          variant="empty"
          title="No 1ZE yet"
          subtitle="Add money to start trading Co-Own units."
          actionLabel="Add money"
          onAction={handleAddMoney}
          emptyGraphicVariant="bag"
        />
        <AddMoneySheet
          visible={addMoneyVisible}
          onDismiss={() => setAddMoneyVisible(false)}
          availableFiatBalance={availableFiatBalance}
          isWalletOperational={isWalletOperational}
          onCompleted={loadBalance}
          userId={currentUser?.id}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <CoOwnMarketHeader
        title="Wallet"
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
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textSecondary}
          />
        }
      >
        {/* ── Wallet breakdown — spendable hero + sub-balances (spec 17 viewport 1+2) ── */}
        <CoOwnWalletBreakdown
          balance={balance}
          localFiatLabel={localFiatLabel}
          localFiatSource={currencyCode}
          balanceHidden={balanceHidden}
          onTogglePrivacy={handleTogglePrivacy}
        />

        {/* ── Seller earnings summary (spec 17: "Seller earnings · £X available · £Y pending") ── */}
        {sellerBalances !== null && (sellerBalances.pendingGbp > 0 || sellerBalances.availableGbp > 0 || sellerBalances.heldInReserveGbp > 0) && (
          <Pressable
            style={({ pressed }) => [
              styles.earningsSummaryRow,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && { opacity: 0.7 },
            ]}
            onPress={handleViewEarnings}
            accessibilityRole="button"
            accessibilityLabel={`Seller earnings, ${formatFromFiat(sellerBalances.availableGbp, currencyCode, { displayMode: 'fiat' })} available, ${formatFromFiat(sellerBalances.pendingGbp, currencyCode, { displayMode: 'fiat' })} pending`}
            accessibilityHint="View seller earnings and release schedule"
          >
            <View style={styles.earningsSummaryInfo}>
              <Ionicons name="pricetag-outline" size={16} color={colors.brand} />
              <Text style={[styles.earningsSummaryText, { color: colors.textPrimary }]} numberOfLines={1}>
                Seller earnings ·{' '}
                <Text style={{ fontFamily: Typography.family.semibold }}>
                  {formatFromFiat(sellerBalances.availableGbp, currencyCode, { displayMode: 'fiat' })} available
                </Text>
                {' · '}
                <Text>
                  {formatFromFiat(sellerBalances.pendingGbp, currencyCode, { displayMode: 'fiat' })} pending
                </Text>
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </Pressable>
        )}

        {/* ── Add money — primary action, dominant (spec 17 viewport 1) ── */}
        <AppButton
          title="Add money"
          icon={<Ionicons name="add-circle-outline" size={18} color={colors.background} />}
          onPress={handleAddMoney}
          variant="primary"
          size="md"
          accessibilityLabel="Add money to your wallet"
          accessibilityHint="Opens the add money flow"
          hapticFeedback="medium"
          style={styles.primaryAction}
          disabled={!isWalletOperational}
        />

        {/* ── Withdraw + Convert — secondary actions, restrained (spec 17) ── */}
        <View style={styles.secondaryActionRow}>
          <AppButton
            title="Withdraw"
            icon={<Ionicons name="arrow-down-circle-outline" size={18} color={colors.textPrimary} />}
            onPress={handleWithdraw}
            variant="secondary"
            size="md"
            accessibilityLabel="Withdraw from your wallet"
            accessibilityHint="Opens the withdraw flow"
            hapticFeedback="medium"
            style={styles.secondaryActionBtn}
            disabled={!isWalletOperational}
          />
          <AppButton
            title="Convert"
            icon={<Ionicons name="swap-horizontal-outline" size={18} color={colors.textPrimary} />}
            onPress={handleConvert}
            variant="secondary"
            size="md"
            accessibilityLabel="Convert 1ZE to fiat"
            accessibilityHint="Opens the convert screen"
            hapticFeedback="medium"
            style={styles.secondaryActionBtn}
            disabled={balance.available <= 0 || !isWalletOperational}
          />
        </View>

        {/* ── Transaction history (spec 17 viewport 2: latest activity) ── */}
        <View style={styles.txHistorySection}>
          <View style={styles.txHistoryHeader}>
            <Text style={[styles.txHistoryTitle, { color: colors.textPrimary }]}>Recent activity</Text>
            <Pressable
              onPress={handleViewActivity}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="View all activity"
            >
              <Text style={[styles.txHistorySeeAll, { color: colors.brand }]}>See all</Text>
            </Pressable>
          </View>
          <WalletTransactionHistory limit={20} />
        </View>

        {/* ── Safeguarding & 1ZE disclosure — lower down, not competing with balance (spec 17) ── */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.infoHeader}>
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.brand} />
            <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>Safeguarding & redemption</Text>
          </View>
          <Text style={[styles.infoBody, { color: colors.textMuted }]}>
            {balance.safeguarded
              ? `Customer 1ZE is safeguarded${balance.safeguardingPartner ? ` at ${balance.safeguardingPartner}` : ''}. Redemption to ${currencyCode} settlement details are confirmed at the time of each request.`
              : `Customer 1ZE safeguarding is being finalised. Redemption to ${currencyCode} will be available once safeguarding is confirmed.`}
          </Text>
          {/* WS4: substantiate the safeguarding badge with evidence/terms links. */}
          {balance.safeguarded && (balance.safeguardingEvidenceUrl || balance.safeguardingTermsUrl) ? (
            <View style={styles.safeguardingLinksRow}>
              {balance.safeguardingEvidenceUrl ? (
                <Pressable
                  onPress={() => Linking.openURL(balance.safeguardingEvidenceUrl!)}
                  style={({ pressed }) => pressed && { opacity: 0.6 }}
                  accessibilityRole="link"
                  accessibilityLabel="View safeguarding evidence"
                  accessibilityHint="Opens in external browser"
                >
                  <Text style={[styles.safeguardingLink, { color: colors.brand }]}>Evidence</Text>
                </Pressable>
              ) : null}
              {balance.safeguardingTermsUrl ? (
                <Pressable
                  onPress={() => Linking.openURL(balance.safeguardingTermsUrl!)}
                  style={({ pressed }) => pressed && { opacity: 0.6 }}
                  accessibilityRole="link"
                  accessibilityLabel="View safeguarding terms"
                  accessibilityHint="Opens in external browser"
                >
                  <Text style={[styles.safeguardingLink, { color: colors.brand }]}>Terms</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={[styles.infoDivider, { borderColor: colors.border }]} />

          <View style={styles.infoHeader}>
            <Ionicons name="information-circle-outline" size={15} color={colors.textSecondary} />
            <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>About 1ZE</Text>
          </View>
          <Text style={[styles.infoBody, { color: colors.textMuted }]}>
            1ZE is the platform's single settlement unit for Co-Own transactions. For the UK market, 1ZE is maintained at a £1.00 reference par before disclosed fees. It is the medium through which Co-Own units are priced, traded and settled.
          </Text>
        </View>

      </ScrollView>

      {/* ── Add money (extracted AddMoneySheet — spec 17 dedicated flow) ── */}
      <AddMoneySheet
        visible={addMoneyVisible}
        onDismiss={() => setAddMoneyVisible(false)}
        availableFiatBalance={availableFiatBalance}
        isWalletOperational={isWalletOperational}
        onCompleted={loadBalance}
        userId={currentUser?.id}
      />
    </SafeAreaView>
  );
}

// ── Helper sub-components ──

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  // ── Seller earnings summary row (spec 17 — compact, taps to SellerEarningsScreen) ──
  earningsSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Space.lg,
  },
  earningsSummaryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flex: 1,
  },
  earningsSummaryText: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
    flexShrink: 1,
  },
  // ── Actions — clear primary/secondary hierarchy (spec 17 viewport 1) ──
  primaryAction: {
    marginTop: Space.lg,
  },
  secondaryActionRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.sm,
  },
  secondaryActionBtn: { flex: 1 },

  // ── Transaction history ──
  txHistorySection: {
    marginTop: Space.lg,
  },
  txHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  // Section title uses subtitle for clear hierarchy — not a tiny uppercase label
  txHistoryTitle: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  txHistorySeeAll: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.captionElevated.letterSpacing,
  },

  // ── Safeguarding info ──
  infoCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.xs,
    marginTop: Space.lg,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  infoTitle: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  infoBody: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight + 2,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  safeguardingLinksRow: {
    flexDirection: 'row',
    gap: Space.md,
    marginTop: Space.sm,
  },
  safeguardingLink: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: LetterSpacing.wide,
    textTransform: 'uppercase',
  },
  infoDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginVertical: Space.sm,
  },
});
