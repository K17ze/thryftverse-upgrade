import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { useToast } from '../context/ToastContext';
import { useA11yAudit } from '../hooks/useA11yAudit';
import { Space, Radius, Typography, DockConstants, LetterSpacing, IconGrammar } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { haptics } from '../utils/haptics';
import { izeToUsd, formatUsd } from '../utils/currency';
import { parseApiError } from '../lib/apiClient';
import {
  getIzePosition,
  getWalletSnapshot,
  getSellerWalletBalances,
  type SellerWalletBalanceItem } from '../services/walletApi';
import {
  CoOwnStateCanvas,
  CoOwnOfflineBanner,
  CoOwnReconciliationBanner,
  type CoOwn1ZeBalance } from '../components/coown';
import { FlagshipScreen, FlagshipHeader, FlagshipNavigationRow } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { useConnectivity } from '../hooks/useConnectivity';
import { useBiometricGate } from '../hooks/useBiometricGate';
import { BiometricGatePrompt } from '../components/security/BiometricGate';
import { WalletTransactionHistory } from '../components/wallet/WalletTransactionHistory';
import { AddMoneySheet } from '../components/wallet/AddMoneySheet';
import { useScreenCaptureProtection } from '../platform/screenCapture';
import { t } from '../i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'Wallet'>;

export default function WalletScreen({ navigation }: Props) {
  const a11yRef = useRef<any>(null);
  useA11yAudit(a11yRef, 'WalletScreen');
  useScreenCaptureProtection();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const currentUser = useStore((state) => state.currentUser);
  const { currencyCode } = useCurrencyContext();
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
    reconciliationState: 'reconciled' });
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
          reconciliationState: position.balances.reconciliationState });
        setAvailableFiatBalance(fiatWallet?.snapshot.availableGbp ?? 0);
        if (sellerWallet) {
          setSellerBalances({
            availableGbp: sellerWallet.balances.availableGbp,
            pendingGbp: sellerWallet.balances.pendingGbp,
            heldInReserveGbp: sellerWallet.balances.heldInReserveGbp,
            pendingBreakdown: sellerWallet.pendingBreakdown });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err, t('commerce.wallet.error.unableToLoad'));
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
    balance.pendingDeposit > 0 ? t('commerce.wallet.depositPending', { amount: formatBalance(balance.pendingDeposit) }) : null,
    balance.unsettledSaleProceeds > 0 ? t('commerce.wallet.proceedsUnsettled', { amount: formatBalance(balance.unsettledSaleProceeds) }) : null,
  ].filter(Boolean).join(' · ');

  // ── At-par USD equivalent for spendable hero ──
  // 1 1ZE = $1.00 USD — always, at par. Shown as the honest USD value.
  const usdEquivalent = izeToUsd(balance.available);
  const usdLabel = balance.available > 0
    ? formatUsd(usdEquivalent)
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

  // ── Activity (canonical WalletHistoryScreen — spec 17) ──
  const handleViewActivity = React.useCallback(() => {
    haptics.tap();
    navigation.navigate('WalletHistory');
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
      void biometricGate.authenticate(t('commerce.wallet.authenticateToView'));
    }
  }, [biometricGate.status, biometricGate.isAuthenticating, biometricGate.authenticate]);

  // ── Biometric gate: block sensitive content until authenticated ──
  if (biometricGate.status === 'pending' || biometricGate.status === 'locked') {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title={t('commerce.wallet.title')}
            onBack={handleBack}
          />
        }
        scrollEnabled={false}
      >
        <BiometricGatePrompt
          gate={biometricGate}
          reason={t('commerce.wallet.authenticateToView')}
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
            title={t('commerce.wallet.title')}
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
            title={t('commerce.wallet.title')}
            onBack={handleBack}
          />
        }
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      >
        <CoOwnStateCanvas
          variant="error"
          actionLabel={t('commerce.wallet.action.tryAgain')}
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
            title={t('commerce.wallet.title')}
            onBack={handleBack}
          />
        }
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      >
        <CoOwnStateCanvas
          variant="empty"
          title={t('commerce.wallet.noBalanceYet')}
          subtitle={t('commerce.wallet.addMoneyToStart')}
          actionLabel={t('commerce.wallet.addMoney')}
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
      ref={a11yRef}
      header={
        <FlagshipHeader
          title={t('commerce.wallet.title')}
          onBack={handleBack}
          rightAction={
            <AnimatedPressable
              onPress={handleViewActivity}
              scaleValue={0.9}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={t('commerce.wallet.activity')}
              accessibilityHint={t('commerce.wallet.a11y.viewAllWalletActivity')}
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
            <Text style={[styles.balanceLabel, { color: colors.textMuted }]}>{t('commerce.wallet.spendableNow')}</Text>
            <Pressable
              onPress={() => { haptics.tap(); handleTogglePrivacy(); }}
              style={styles.eyeToggle}
              accessibilityRole="button"
              accessibilityLabel={balanceHidden ? t('commerce.wallet.showBalance') : t('commerce.wallet.hideBalance')}
              accessibilityHint={t('commerce.wallet.a11y.togglesPrivacy')}
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
              accessibilityLabel={t('commerce.wallet.balanceHidden')}
              accessibilityHint={t('commerce.wallet.a11y.activateEyeToReveal')}
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
          {usdLabel && !balanceHidden && (
            <View style={styles.localFiatRow}>
              <Ionicons name="cash-outline" size={IconGrammar.badge} color={colors.textMuted} />
              <Text style={[styles.localFiatText, { color: colors.textMuted }]} numberOfLines={1} accessibilityLabel={`${usdLabel} USD at par`}>
                {usdLabel}
                <Text style={styles.localFiatSuffix}> USD · at par</Text>
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
            accessibilityLabel={t('commerce.wallet.a11y.addMoneyToWallet')}
            accessibilityHint={t('commerce.wallet.a11y.opensAddMoneyFlow')}
          >
            <Ionicons name="add-circle-outline" size={IconGrammar.standard} color={colors.background} />
            <Text style={[styles.actionBtnLabel, { color: colors.background }]}>{t('commerce.wallet.addMoney')}</Text>
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
            accessibilityLabel={t('commerce.wallet.a11y.withdrawFromWallet')}
            accessibilityHint={t('commerce.wallet.a11y.opensWithdrawFlow')}
          >
            <Ionicons name="arrow-down-circle-outline" size={IconGrammar.standard} color={colors.textPrimary} />
            <Text style={[styles.actionBtnLabel, { color: colors.textPrimary }]}>{t('commerce.wallet.withdraw')}</Text>
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
            accessibilityLabel={t('commerce.wallet.a11y.convert1zeToFiat')}
            accessibilityHint={t('commerce.wallet.a11y.opensConvertScreen')}
          >
            <Ionicons name="swap-horizontal-outline" size={IconGrammar.standard} color={colors.textPrimary} />
            <Text style={[styles.actionBtnLabel, { color: colors.textPrimary }]}>{t('commerce.wallet.convert')}</Text>
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
            accessibilityLabel={t('commerce.wallet.a11y.pendingAttention', { deposit: `${formatBalance(balance.pendingDeposit)} 1ZE`, unsettled: `${formatBalance(balance.unsettledSaleProceeds)} 1ZE` })}
            accessibilityHint={t('commerce.wallet.a11y.viewSellerEarnings')}
          />
        )}

        {/* ── Seller earnings summary (spec 17: "Seller earnings · {currencySymbol}X available · {currencySymbol}Y pending") ── */}
        {sellerBalances !== null && (sellerBalances.pendingGbp > 0 || sellerBalances.availableGbp > 0 || sellerBalances.heldInReserveGbp > 0) && (
          <FlagshipNavigationRow
            icon="pricetag-outline"
            iconColor={colors.brand}
            title={t('commerce.wallet.sellerEarnings')}
            subtitle={t('commerce.wallet.sellerEarningsSubtitle', { available: formatFromFiat(sellerBalances.availableGbp, currencyCode, { displayMode: 'fiat' }), pending: formatFromFiat(sellerBalances.pendingGbp, currencyCode, { displayMode: 'fiat' }) })}
            onPress={handleViewEarnings}
            accessibilityLabel={t('commerce.wallet.a11y.sellerEarnings', { available: formatFromFiat(sellerBalances.availableGbp, currencyCode, { displayMode: 'fiat' }), pending: formatFromFiat(sellerBalances.pendingGbp, currencyCode, { displayMode: 'fiat' }) })}
            accessibilityHint={t('commerce.wallet.a11y.viewSellerEarnings')}
          />
        )}

        {/* ── Balance breakdown — flat hairline-separated rows (spec 17 viewport 2) ── */}
        {(balance.reservedForOrders > 0 || balance.redemptionInProgress > 0 || balance.otherHolds > 0 || balance.pendingDeposit > 0 || balance.unsettledSaleProceeds > 0) && (
          <View style={[styles.breakdownSection, { borderTopColor: colors.border }]}>
            {balance.reservedForOrders > 0 && (
              <SubBalanceRow label={t('commerce.wallet.reservedForOrders')} value={balance.reservedForOrders} formatBalance={formatBalance} colors={colors} />
            )}
            {balance.redemptionInProgress > 0 && (
              <SubBalanceRow label={t('commerce.wallet.redemptionPending')} value={balance.redemptionInProgress} formatBalance={formatBalance} colors={colors} />
            )}
            {balance.otherHolds > 0 && (
              <SubBalanceRow label={t('commerce.wallet.otherHolds')} value={balance.otherHolds} formatBalance={formatBalance} colors={colors} />
            )}
            {balance.pendingDeposit > 0 && (
              <SubBalanceRow label={t('commerce.wallet.pendingDeposit')} value={balance.pendingDeposit} formatBalance={formatBalance} colors={colors} />
            )}
            {balance.unsettledSaleProceeds > 0 && (
              <SubBalanceRow label={t('commerce.wallet.unsettledSaleProceeds')} value={balance.unsettledSaleProceeds} formatBalance={formatBalance} colors={colors} />
            )}
            <SubBalanceRow label={t('commerce.wallet.withdrawable')} value={withdrawable} formatBalance={formatBalance} colors={colors} emphasize />
          </View>
        )}

        {/* ── Withdrawable-only (no other sub-balances) ── */}
        {!(balance.reservedForOrders > 0 || balance.redemptionInProgress > 0 || balance.otherHolds > 0 || balance.pendingDeposit > 0 || balance.unsettledSaleProceeds > 0) && (
          <View style={[styles.withdrawableRow, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
            <View style={styles.withdrawableLeft}>
              <Ionicons name="arrow-down-circle-outline" size={IconGrammar.metadata} color={colors.textMuted} />
              <Text style={[styles.withdrawableLabel, { color: colors.textMuted }]}>{t('commerce.wallet.withdrawable')}</Text>
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
            <Text style={[styles.txHistoryTitle, { color: colors.textPrimary }]}>{t('commerce.wallet.recentActivity')}</Text>
            <Pressable
              onPress={handleViewActivity}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('commerce.wallet.a11y.viewAllActivity')}
            >
              <Text style={[styles.txHistorySeeAll, { color: colors.brand }]}>{t('commerce.wallet.seeAll')}</Text>
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
                ? balance.safeguardingPartner
                  ? t('commerce.wallet.safeguardedAt', { partner: balance.safeguardingPartner })
                  : t('commerce.wallet.safeguarded')
                : t('commerce.wallet.safeguardingPending')}
            </Text>
          </View>
          <Text style={[styles.infoBody, { color: colors.textMuted }]}>
            {balance.safeguarded
              ? t('commerce.wallet.safeguardedBody', { currency: currencyCode })
              : t('commerce.wallet.safeguardingPendingBody', { currency: currencyCode })}
          </Text>
          {/* WS4: substantiate the safeguarding badge with evidence/terms links. */}
          {balance.safeguarded && (balance.safeguardingEvidenceUrl || balance.safeguardingTermsUrl) ? (
            <View style={styles.safeguardingLinksRow}>
              {balance.safeguardingEvidenceUrl ? (
                <Pressable
                  onPress={() => Linking.openURL(balance.safeguardingEvidenceUrl!)}
                  style={({ pressed }) => pressed && { opacity: 0.6 }}
                  accessibilityRole="link"
                  accessibilityLabel={t('commerce.wallet.a11y.viewSafeguardingEvidence')}
                  accessibilityHint={t('commerce.wallet.a11y.opensExternalBrowser')}
                >
                  <Text style={[styles.safeguardingLink, { color: colors.brand }]}>{t('commerce.wallet.evidence')}</Text>
                </Pressable>
              ) : null}
              {balance.safeguardingTermsUrl ? (
                <Pressable
                  onPress={() => Linking.openURL(balance.safeguardingTermsUrl!)}
                  style={({ pressed }) => pressed && { opacity: 0.6 }}
                  accessibilityRole="link"
                  accessibilityLabel={t('commerce.wallet.a11y.viewSafeguardingTerms')}
                  accessibilityHint={t('commerce.wallet.a11y.opensExternalBrowser')}
                >
                  <Text style={[styles.safeguardingLink, { color: colors.brand }]}>{t('commerce.wallet.terms')}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={[styles.infoDivider, { borderColor: colors.border }]} />

          <Text style={[styles.infoBody, { color: colors.textMuted }]}>
            {t('commerce.wallet.1zeDisclosure')}
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
  emphasize = false }: {
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
    paddingTop: Space.md },

  // ── Balance hero — flat, no card (spec 17 viewport 1) ──
  balanceHero: {
    paddingVertical: Space.sm },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between' },
  balanceLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase' },
  // 44pt transparent hit area — visible eye glyph is 20pt
  eyeToggle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -Space.xs },
  balanceMasked: {
    fontSize: 40,
    lineHeight: 44,
    fontFamily: Typography.family.bold,
    letterSpacing: 2,
    marginTop: Space.xs },
  // Largest text on screen — tabular-nums, bold
  balanceValue: {
    fontSize: 40,
    lineHeight: 44,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
    marginTop: Space.xs },
  balanceUnit: {
    fontSize: 20,
    lineHeight: 44,
    fontFamily: Typography.family.semibold },
  localFiatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs + 2 },
  localFiatText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'] },
  localFiatSuffix: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },

  // ── Primary actions — 3 equal-width buttons in a row ──
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.md },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs - 1,
    paddingVertical: Space.sm },
  actionBtnPrimary: {
    borderWidth: 0 },
  actionBtnSecondary: {
    borderWidth: StyleSheet.hairlineWidth },
  actionBtnLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },

  // ── Pending attention row (now FlagshipNavigationRow) ──

  // ── Seller earnings summary row (now FlagshipNavigationRow) ──

  // ── Sub-balance flat rows (restrained — muted, smaller) ──
  subBalanceSection: {
    marginTop: Space.lg },
  subBalanceSectionLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.xs + 2 },
  breakdownSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 0,
    paddingTop: Space.sm },
  subBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.sm + 2,
    gap: Space.md },
  subBalanceLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  subBalanceValue: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    fontVariant: ['tabular-nums'],
    letterSpacing: TypographyV2.body.letterSpacing },
  subBalanceUnit: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },

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
    marginTop: Space.lg },
  withdrawableLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  withdrawableLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  withdrawableValue: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    fontVariant: ['tabular-nums'],
    letterSpacing: TypographyV2.body.letterSpacing },

  // ── Transaction history ──
  txHistorySection: {
    marginTop: Space.lg },
  txHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm },
  txHistoryTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  txHistorySeeAll: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },

  // ── Skeleton ──
  skeletonSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm + 2 },

  // ── Safeguarding info (flat canvas, hairline divider — no card) ──
  infoContent: {
    padding: Space.md,
    gap: Space.xs },
  disclosureSection: {
    paddingHorizontal: 0,
    paddingVertical: Space.md,
    gap: Space.xs },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  infoTitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  infoBody: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  safeguardingLinksRow: {
    flexDirection: 'row',
    gap: Space.md,
    marginTop: Space.sm },
  safeguardingLink: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: LetterSpacing.wide,
    textTransform: 'uppercase' },
  infoDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginVertical: Space.sm } });
