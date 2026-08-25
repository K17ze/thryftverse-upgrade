import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Linking,
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
import { Space, Radius, Type, Typography, DockConstants, LetterSpacing, IconGrammar } from '../theme/designTokens';
import { haptics } from '../utils/haptics';
import { convertGbpToDisplayAmount } from '../utils/currencyAuthoringFlows';
import { DEFAULT_CURRENCY_CODE } from '../constants/currencies';
import { parseApiError } from '../lib/apiClient';
import {
  getIzePosition,
  getWalletSnapshot,
  getSellerWalletBalances,
  type SellerWalletBalanceItem,
} from '../services/walletApi';
import {
  CoOwnStateCanvas,
  CoOwnOfflineBanner,
  CoOwnReconciliationBanner,
  type CoOwn1ZeBalance,
} from '../components/coown';
import { FlagshipScreen, FlagshipHeader, FlagshipNavigationRow } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { useConnectivity } from '../hooks/useConnectivity';
import { useBiometricGate } from '../hooks/useBiometricGate';
import { BiometricGatePrompt } from '../components/security/BiometricGate';
import { WalletTransactionHistory } from '../components/wallet/WalletTransactionHistory';
import { AddMoneySheet } from '../components/wallet/AddMoneySheet';
import { useScreenCaptureProtection } from '../platform/screenCapture';

type Props = NativeStackScreenProps<RootStackParamList, 'Wallet'>;

export default function WalletScreen({ navigation }: Props) {
  useScreenCaptureProtection();
  const { colors } = useAppTheme();
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
  const withdrawable = balance.withdrawable ?? balance.available;
  const hasPendingAttention = balance.pendingDeposit > 0 || balance.unsettledSaleProceeds > 0;

  // ── Balance formatting (tabular-nums, 2dp) ──
  const formatBalance = (value: number) =>
    value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Pending attention summary text (spec 17 viewport 1) ──
  const pendingAttentionTitle = [
    balance.pendingDeposit > 0 ? `${formatBalance(balance.pendingDeposit)} 1ZE deposit pending` : null,
    balance.unsettledSaleProceeds > 0 ? `${formatBalance(balance.unsettledSaleProceeds)} 1ZE proceeds unsettled` : null,
  ].filter(Boolean).join(' · ');

  // ── Local-fiat indication for spendable hero ──
  const localFiatRate = convertGbpToDisplayAmount(1, currencyCode, goldRates);
  const localFiatLabel = balance.available > 0 && localFiatRate > 0
    ? `≈ ${formatFromFiat(balance.available, DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' })}`
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
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Wallet"
            onBack={handleBack}
          />
        }
        scrollEnabled={false}
      >
        <BiometricGatePrompt
          gate={biometricGate}
          reason="Authenticate to view your wallet"
          onBack={handleBack}
        />
      </FlagshipScreen>
    );
  }

  // ── Loading state — skeleton matching final layout ──
  if (isLoading) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Wallet"
            onBack={handleBack}
          />
        }
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      >
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
      </FlagshipScreen>
    );
  }

  // ── Error state ──
  if (isError) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Wallet"
            onBack={handleBack}
          />
        }
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      >
        <CoOwnStateCanvas
          variant="error"
          actionLabel="Try again"
          onAction={loadBalance}
        />
      </FlagshipScreen>
    );
  }

  // ── Empty state ──
  if (balance.available === 0 && balance.reservedForOrders === 0) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Wallet"
            onBack={handleBack}
          />
        }
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      >
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
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Wallet"
          onBack={handleBack}
          rightAction={
            <AnimatedPressable
              onPress={handleViewActivity}
              scaleValue={0.9}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Activity"
              accessibilityHint="View all wallet activity"
            >
              <Ionicons name="receipt-outline" size={IconGrammar.standard} color={colors.textPrimary} />
            </AnimatedPressable>
          }
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
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
                size={IconGrammar.standard}
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
              <Ionicons name="cash-outline" size={IconGrammar.badge} color={colors.textMuted} />
              <Text style={[styles.localFiatText, { color: colors.textMuted }]} numberOfLines={1} accessibilityLabel={`${localFiatLabel}${currencyCode ? ` · ${currencyCode}` : ''}`}>
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
            <Ionicons name="add-circle-outline" size={IconGrammar.standard} color={colors.background} />
            <Text style={[styles.actionBtnLabel, { color: colors.background }]}>Add money</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnSecondary,
              { borderColor: colors.border },
              pressed && { opacity: 0.7 },
              !isWalletOperational && { opacity: 0.5 },
            ]}
            onPress={handleWithdraw}
            disabled={!isWalletOperational}
            accessibilityRole="button"
            accessibilityLabel="Withdraw from your wallet"
            accessibilityHint="Opens the withdraw flow"
          >
            <Ionicons name="arrow-down-circle-outline" size={IconGrammar.standard} color={colors.textPrimary} />
            <Text style={[styles.actionBtnLabel, { color: colors.textPrimary }]}>Withdraw</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnSecondary,
              { borderColor: colors.border },
              pressed && { opacity: 0.7 },
              (balance.available <= 0 || !isWalletOperational) && { opacity: 0.5 },
            ]}
            onPress={handleConvert}
            disabled={balance.available <= 0 || !isWalletOperational}
            accessibilityRole="button"
            accessibilityLabel="Convert 1ZE to fiat"
            accessibilityHint="Opens the convert screen"
          >
            <Ionicons name="swap-horizontal-outline" size={IconGrammar.standard} color={colors.textPrimary} />
            <Text style={[styles.actionBtnLabel, { color: colors.textPrimary }]}>Convert</Text>
          </Pressable>
        </View>

        {/* ── Pending attention — if real (spec 17 viewport 1) ── */}
        {hasPendingAttention && !balanceHidden && (
          <FlagshipNavigationRow
            icon="time-outline"
            iconColor={colors.warning}
            title={pendingAttentionTitle}
            onPress={handleViewEarnings}
            style={{ marginTop: Space.md }}
            accessibilityLabel={`Pending attention: ${formatBalance(balance.pendingDeposit)} 1ZE deposit, ${formatBalance(balance.unsettledSaleProceeds)} 1ZE unsettled proceeds`}
            accessibilityHint="View seller earnings and release schedule"
          />
        )}

        {/* ── Seller earnings summary (spec 17: "Seller earnings · £X available · £Y pending") ── */}
        {sellerBalances !== null && (sellerBalances.pendingGbp > 0 || sellerBalances.availableGbp > 0 || sellerBalances.heldInReserveGbp > 0) && (
          <FlagshipNavigationRow
            icon="pricetag-outline"
            iconColor={colors.brand}
            title="Seller earnings"
            subtitle={`${formatFromFiat(sellerBalances.availableGbp, currencyCode, { displayMode: 'fiat' })} available · ${formatFromFiat(sellerBalances.pendingGbp, currencyCode, { displayMode: 'fiat' })} pending`}
            onPress={handleViewEarnings}
            accessibilityLabel={`Seller earnings, ${formatFromFiat(sellerBalances.availableGbp, currencyCode, { displayMode: 'fiat' })} available, ${formatFromFiat(sellerBalances.pendingGbp, currencyCode, { displayMode: 'fiat' })} pending`}
            accessibilityHint="View seller earnings and release schedule"
          />
        )}

        {/* ── Balance breakdown — flat hairline-separated rows (spec 17 viewport 2) ── */}
        {(balance.reservedForOrders > 0 || balance.redemptionInProgress > 0 || balance.otherHolds > 0 || balance.pendingDeposit > 0 || balance.unsettledSaleProceeds > 0) && (
          <View style={[styles.breakdownSection, { borderTopColor: colors.border }]}>
            {balance.reservedForOrders > 0 && (
              <SubBalanceRow label="Reserved for orders" value={balance.reservedForOrders} formatBalance={formatBalance} colors={colors} />
            )}
            {balance.redemptionInProgress > 0 && (
              <SubBalanceRow label="Redemption pending" value={balance.redemptionInProgress} formatBalance={formatBalance} colors={colors} />
            )}
            {balance.otherHolds > 0 && (
              <SubBalanceRow label="Other holds" value={balance.otherHolds} formatBalance={formatBalance} colors={colors} />
            )}
            {balance.pendingDeposit > 0 && (
              <SubBalanceRow label="Pending deposit" value={balance.pendingDeposit} formatBalance={formatBalance} colors={colors} />
            )}
            {balance.unsettledSaleProceeds > 0 && (
              <SubBalanceRow label="Unsettled sale proceeds" value={balance.unsettledSaleProceeds} formatBalance={formatBalance} colors={colors} />
            )}
            <SubBalanceRow label="Withdrawable" value={withdrawable} formatBalance={formatBalance} colors={colors} emphasize />
          </View>
        )}

        {/* ── Withdrawable-only (no other sub-balances) ── */}
        {!(balance.reservedForOrders > 0 || balance.redemptionInProgress > 0 || balance.otherHolds > 0 || balance.pendingDeposit > 0 || balance.unsettledSaleProceeds > 0) && (
          <View style={[styles.withdrawableRow, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
            <View style={styles.withdrawableLeft}>
              <Ionicons name="arrow-down-circle-outline" size={IconGrammar.metadata} color={colors.textMuted} />
              <Text style={[styles.withdrawableLabel, { color: colors.textMuted }]}>Withdrawable</Text>
            </View>
            <Text style={[styles.withdrawableValue, { color: colors.textSecondary }]}>
              {formatBalance(withdrawable)}
              <Text style={[styles.subBalanceUnit, { color: colors.textMuted }]}> 1ZE</Text>
            </Text>
          </View>
        )}

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

        {/* ── Safeguarding & 1ZE disclosure — flat canvas, hairline divider (spec 17) ── */}
        <View style={styles.disclosureSection}>
          <View style={styles.infoHeader}>
            <Ionicons name="checkmark-circle-outline" size={IconGrammar.metadata} color={colors.brand} />
            <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>
              {balance.safeguarded
                ? `Safeguarded${balance.safeguardingPartner ? ` at ${balance.safeguardingPartner}` : ''}`
                : 'Safeguarding pending'}
            </Text>
          </View>
          <Text style={[styles.infoBody, { color: colors.textMuted }]}>
            {balance.safeguarded
              ? `Customer 1ZE is held under safeguarding. Redemption to ${currencyCode} is confirmed at each request.`
              : `Customer 1ZE safeguarding is being finalised. Redemption to ${currencyCode} will be available once confirmed.`}
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

          <Text style={[styles.infoBody, { color: colors.textMuted }]}>
            1ZE is the platform's settlement unit for Co-Own, maintained at a £1.00 reference par before disclosed fees.
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
    </FlagshipScreen>
  );
}

// ── Helper sub-components ──

/** Flat sub-balance row — muted label left, tabular-nums value right. */
function SubBalanceRow({
  label,
  value,
  formatBalance,
  colors,
  emphasize = false,
}: {
  label: string;
  value: number;
  formatBalance: (v: number) => string;
  colors: ReturnType<typeof useAppTheme>['colors'];
  emphasize?: boolean;
}) {
  return (
    <View
      style={[styles.subBalanceRow, { borderBottomColor: colors.border }]}
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${formatBalance(value)} 1ZE`}
    >
      <Text
        style={[styles.subBalanceLabel, { color: emphasize ? colors.textSecondary : colors.textMuted }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={[styles.subBalanceValue, { color: emphasize ? colors.textPrimary : colors.textSecondary }]}
      >
        {formatBalance(value)}
        <Text style={[styles.subBalanceUnit, { color: colors.textMuted }]}> 1ZE</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
    letterSpacing: Type.label.letterSpacing,
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
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
  },

  // ── Pending attention row (now FlagshipNavigationRow) ──

  // ── Seller earnings summary row (now FlagshipNavigationRow) ──

  // ── Sub-balance flat rows (restrained — muted, smaller) ──
  subBalanceSection: {
    marginTop: Space.lg,
  },
  subBalanceSectionLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.label.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.xs + 2,
  },
  breakdownSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 0,
    paddingTop: Space.sm,
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
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
    fontVariant: ['tabular-nums'],
    letterSpacing: Type.body.letterSpacing,
  },
  subBalanceUnit: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },

  // ── Withdrawable (restrained — muted) ──
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
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
  withdrawableValue: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
    fontVariant: ['tabular-nums'],
    letterSpacing: Type.body.letterSpacing,
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
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
  },

  // ── Skeleton ──
  skeletonSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm + 2,
  },

  // ── Safeguarding info (flat canvas, hairline divider — no card) ──
  infoContent: {
    padding: Space.md,
    gap: Space.xs,
  },
  disclosureSection: {
    paddingHorizontal: 0,
    paddingVertical: Space.md,
    gap: Space.xs,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  infoTitle: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
  },
  infoBody: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight + 2,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
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
