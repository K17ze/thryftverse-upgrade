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
  CoOwnStateCanvas,
  CoOwnOfflineBanner,
  CoOwnReconciliationBanner,
  type CoOwn1ZeBalance,
} from '../components/coown';
import { SkeletonLoader } from '../components/SkeletonLoader';
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

  // ── Derived sub-balance values (preserving reconciliation truth) ──
  const settledClaim =
    balance.settledCustomerClaim ??
    (balance.available + balance.reservedForOrders + balance.redemptionInProgress + balance.otherHolds);
  const withdrawable = balance.withdrawable ?? balance.available;
  const hasPendingAttention = balance.pendingDeposit > 0 || balance.unsettledSaleProceeds > 0;

  // ── Balance formatting (tabular-nums, 2dp) ──
  const formatBalance = (value: number) =>
    value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

  // ── Loading state — skeleton matching final layout ──
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <CoOwnMarketHeader
          title="Wallet"
          onBack={handleBack}
        />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Balance hero skeleton */}
          <SkeletonLoader width="35%" height={13} borderRadius={Radius.sm} />
          <View style={{ height: Space.sm }} />
          <SkeletonLoader width="60%" height={40} borderRadius={Radius.sm} />
          <View style={{ height: Space.xs }} />
          <SkeletonLoader width="40%" height={14} borderRadius={Radius.sm} />
          {/* Action buttons skeleton */}
          <View style={{ height: Space.lg }} />
          <View style={styles.actionRow}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.actionBtn}>
                <SkeletonLoader width="100%" height={44} borderRadius={Radius.md} />
              </View>
            ))}
          </View>
          {/* Sub-balance rows skeleton */}
          <View style={{ height: Space.lg }} />
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.skeletonSubRow}>
              <SkeletonLoader width="35%" height={14} borderRadius={Radius.sm} />
              <View style={{ flex: 1 }} />
              <SkeletonLoader width={70} height={16} borderRadius={Radius.sm} />
            </View>
          ))}
        </ScrollView>
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
        {/* ── Balance hero — flat, largest text on screen (spec 17 viewport 1) ── */}
        <View style={styles.balanceHero}>
          <View style={styles.balanceHeader}>
            <Text style={[styles.balanceLabel, { color: colors.textMuted }]}>Spendable now</Text>
            <Pressable
              onPress={() => { haptics.tap(); handleTogglePrivacy(); }}
              style={styles.eyeToggle}
              accessibilityRole="button"
              accessibilityLabel={balanceHidden ? 'Show balance' : 'Hide balance'}
              accessibilityHint="Toggles privacy for your wallet balance"
            >
              <Ionicons
                name={balanceHidden ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>
          {balanceHidden ? (
            <Text
              style={[styles.balanceMasked, { color: colors.textMuted }]}
              accessibilityLabel="Balance hidden"
              accessibilityHint="Activate the eye control to reveal your spendable balance"
            >
              ••••••
            </Text>
          ) : (
            <Text
              style={[styles.balanceValue, { color: colors.textPrimary }]}
              accessibilityLabel={`${formatBalance(balance.available)} 1ZE`}
            >
              {formatBalance(balance.available)}
              <Text style={[styles.balanceUnit, { color: colors.textSecondary }]}> 1ZE</Text>
            </Text>
          )}
          {localFiatLabel && !balanceHidden && (
            <View style={styles.localFiatRow}>
              <Ionicons name="cash-outline" size={12} color={colors.textMuted} />
              <Text style={[styles.localFiatText, { color: colors.textMuted }]} numberOfLines={1}>
                {localFiatLabel}
                {currencyCode ? ` · ${currencyCode}` : ''}
              </Text>
            </View>
          )}
        </View>

        {/* ── Primary actions — 3 equal-width buttons in a row (spec 17 viewport 1) ── */}
        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnPrimary,
              { backgroundColor: colors.brand },
              pressed && { opacity: 0.85 },
              !isWalletOperational && { opacity: 0.5 },
            ]}
            onPress={handleAddMoney}
            disabled={!isWalletOperational}
            accessibilityRole="button"
            accessibilityLabel="Add money to your wallet"
            accessibilityHint="Opens the add money flow"
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.background} />
            <Text style={[styles.actionBtnLabel, { color: colors.background }]}>Add money</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnSecondary,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && { opacity: 0.7 },
              !isWalletOperational && { opacity: 0.5 },
            ]}
            onPress={handleWithdraw}
            disabled={!isWalletOperational}
            accessibilityRole="button"
            accessibilityLabel="Withdraw from your wallet"
            accessibilityHint="Opens the withdraw flow"
          >
            <Ionicons name="arrow-down-circle-outline" size={20} color={colors.textPrimary} />
            <Text style={[styles.actionBtnLabel, { color: colors.textPrimary }]}>Withdraw</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnSecondary,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && { opacity: 0.7 },
              (balance.available <= 0 || !isWalletOperational) && { opacity: 0.5 },
            ]}
            onPress={handleConvert}
            disabled={balance.available <= 0 || !isWalletOperational}
            accessibilityRole="button"
            accessibilityLabel="Convert 1ZE to fiat"
            accessibilityHint="Opens the convert screen"
          >
            <Ionicons name="swap-horizontal-outline" size={20} color={colors.textPrimary} />
            <Text style={[styles.actionBtnLabel, { color: colors.textPrimary }]}>Convert</Text>
          </Pressable>
        </View>

        {/* ── Pending attention — if real (spec 17 viewport 1) ── */}
        {hasPendingAttention && !balanceHidden && (
          <Pressable
            style={({ pressed }) => [
              styles.pendingRow,
              { borderBottomColor: colors.border },
              pressed && { opacity: 0.7 },
            ]}
            onPress={handleViewEarnings}
            accessibilityRole="button"
            accessibilityLabel={`Pending attention: ${formatBalance(balance.pendingDeposit)} 1ZE deposit, ${formatBalance(balance.unsettledSaleProceeds)} 1ZE unsettled proceeds`}
            accessibilityHint="View seller earnings and release schedule"
          >
            <Ionicons name="time-outline" size={16} color={colors.warning} />
            <Text style={[styles.pendingText, { color: colors.textPrimary }]} numberOfLines={1}>
              {balance.pendingDeposit > 0 && `${formatBalance(balance.pendingDeposit)} 1ZE deposit pending`}
              {balance.pendingDeposit > 0 && balance.unsettledSaleProceeds > 0 && ' · '}
              {balance.unsettledSaleProceeds > 0 && `${formatBalance(balance.unsettledSaleProceeds)} 1ZE proceeds unsettled`}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
          </Pressable>
        )}

        {/* ── Seller earnings summary (spec 17: "Seller earnings · £X available · £Y pending") ── */}
        {sellerBalances !== null && (sellerBalances.pendingGbp > 0 || sellerBalances.availableGbp > 0 || sellerBalances.heldInReserveGbp > 0) && (
          <Pressable
            style={({ pressed }) => [
              styles.earningsSummaryRow,
              { borderBottomColor: colors.border },
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

        {/* ── Sub-balances — flat rows, below the fold (spec 17 viewport 2) ── */}
        <View style={styles.subBalanceSection}>
          <Text style={[styles.subBalanceSectionLabel, { color: colors.textMuted }]}>Settled claim</Text>
          {settledClaim === 0 ? (
            <Text style={[styles.subBalanceEmpty, { color: colors.textMuted }]}>
              No settled 1ZE yet.
            </Text>
          ) : (
            <>
              <SubBalanceRow label="Available" value={balance.available} formatBalance={formatBalance} colors={colors} emphasis />
              {balance.reservedForOrders > 0 && (
                <SubBalanceRow label="Reserved for orders" value={balance.reservedForOrders} formatBalance={formatBalance} colors={colors} />
              )}
              {balance.redemptionInProgress > 0 && (
                <SubBalanceRow label="Redemption pending" value={balance.redemptionInProgress} formatBalance={formatBalance} colors={colors} />
              )}
              {balance.otherHolds > 0 && (
                <SubBalanceRow label="Other holds" value={balance.otherHolds} formatBalance={formatBalance} colors={colors} />
              )}
              <View style={[styles.subBalanceTotalRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.subBalanceTotalLabel, { color: colors.textPrimary }]}>Settled claim</Text>
                <Text style={[styles.subBalanceTotalValue, { color: colors.textPrimary }]}>
                  {formatBalance(settledClaim)}
                  <Text style={[styles.subBalanceUnit, { color: colors.textSecondary }]}> 1ZE</Text>
                </Text>
              </View>
            </>
          )}
        </View>

        {/* ── Pending section (not yet settled) ── */}
        {(balance.pendingDeposit > 0 || balance.unsettledSaleProceeds > 0) && (
          <View style={styles.subBalanceSection}>
            <Text style={[styles.subBalanceSectionLabel, { color: colors.textMuted }]}>Pending</Text>
            <SubBalanceRow label="Pending deposit" value={balance.pendingDeposit} formatBalance={formatBalance} colors={colors} />
            <SubBalanceRow label="Unsettled sale proceeds" value={balance.unsettledSaleProceeds} formatBalance={formatBalance} colors={colors} />
          </View>
        )}

        {/* ── Withdrawable ── */}
        <View style={[styles.withdrawableRow, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
          <View style={styles.withdrawableLeft}>
            <Ionicons name="arrow-down-circle-outline" size={15} color={colors.textSecondary} />
            <Text style={[styles.withdrawableLabel, { color: colors.textSecondary }]}>Withdrawable</Text>
          </View>
          <Text style={[styles.withdrawableValue, { color: colors.textPrimary }]}>
            {formatBalance(withdrawable)}
            <Text style={[styles.subBalanceUnit, { color: colors.textSecondary }]}> 1ZE</Text>
          </Text>
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

/** Flat sub-balance row — label left, tabular-nums value right. */
function SubBalanceRow({
  label,
  value,
  formatBalance,
  colors,
  emphasis,
}: {
  label: string;
  value: number;
  formatBalance: (v: number) => string;
  colors: ReturnType<typeof useAppTheme>['colors'];
  emphasis?: boolean;
}) {
  return (
    <View
      style={styles.subBalanceRow}
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${formatBalance(value)} 1ZE`}
    >
      <Text
        style={[
          styles.subBalanceLabel,
          { color: emphasis ? colors.textPrimary : colors.textSecondary },
          emphasis && { fontFamily: Typography.family.semibold },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.subBalanceValue,
          { color: colors.textPrimary },
          emphasis && { fontFamily: Typography.family.semibold },
        ]}
      >
        {formatBalance(value)}
        <Text style={[styles.subBalanceUnit, { color: colors.textSecondary }]}> 1ZE</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },

  // ── Balance hero — flat, no card (spec 17 viewport 1) ──
  balanceHero: {
    paddingVertical: Space.sm,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  // 44pt transparent hit area — visible eye glyph is 20pt
  eyeToggle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -Space.xs,
  },
  balanceMasked: {
    fontSize: 40,
    lineHeight: 44,
    fontFamily: Typography.family.bold,
    letterSpacing: 2,
    marginTop: Space.xs,
  },
  // Largest text on screen — tabular-nums, bold
  balanceValue: {
    fontSize: 40,
    lineHeight: 44,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
    marginTop: Space.xs,
  },
  balanceUnit: {
    fontSize: 20,
    lineHeight: 44,
    fontFamily: Typography.family.semibold,
  },
  localFiatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs + 2,
  },
  localFiatText: {
    flex: 1,
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },

  // ── Primary actions — 3 equal-width buttons in a row ──
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.md,
  },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs - 1,
    paddingVertical: Space.sm,
  },
  actionBtnPrimary: {
    borderWidth: 0,
  },
  actionBtnSecondary: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionBtnLabel: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.captionElevated.letterSpacing,
  },

  // ── Pending attention row ──
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: Space.md,
  },
  pendingText: {
    flex: 1,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },

  // ── Seller earnings summary row (flat, not carded) ──
  earningsSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
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

  // ── Sub-balance flat rows ──
  subBalanceSection: {
    marginTop: Space.lg,
  },
  subBalanceSectionLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.xs + 2,
  },
  subBalanceEmpty: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    paddingVertical: Space.sm,
  },
  subBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.sm + 2,
    gap: Space.md,
  },
  subBalanceLabel: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
  subBalanceValue: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  subBalanceUnit: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  subBalanceTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Space.sm + 2,
    marginTop: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Space.md,
  },
  subBalanceTotalLabel: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  subBalanceTotalValue: {
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: Type.priceList.letterSpacing,
  },

  // ── Withdrawable ──
  withdrawableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingVertical: Space.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Space.md,
    marginTop: Space.lg,
  },
  withdrawableLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  withdrawableLabel: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
  },
  withdrawableValue: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },

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

  // ── Skeleton ──
  skeletonSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm + 2,
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
