import React, { useRef, useState } from 'react';
import {
  ScrollView,
  RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { useA11yAudit } from '../hooks/useA11yAudit';
import { Space, DockConstants, IconGrammar } from '../theme/designTokens';
import { haptics } from '../utils/haptics';
import {
  CoOwnOfflineBanner,
  CoOwnReconciliationBanner } from '../components/coown';
import { FlagshipScreen, FlagshipHeader, FlagshipNavigationRow } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useConnectivity } from '../hooks/useConnectivity';
import { useBiometricGate } from '../hooks/useBiometricGate';
import { BiometricGatePrompt } from '../components/security/BiometricGate';
import { AddMoneySheet } from '../components/wallet/AddMoneySheet';
import { WalletBalanceHero } from '../components/wallet/WalletBalanceHero';
import { WalletActionRow } from '../components/wallet/WalletActionRow';
import { WalletSubBalanceSection } from '../components/wallet/WalletSubBalanceSection';
import { WalletActivitySection } from '../components/wallet/WalletActivitySection';
import { WalletDisclosureSection } from '../components/wallet/WalletDisclosureSection';
import {
  WalletLoadingScreen,
  WalletErrorScreen,
  WalletEmptyScreen } from '../components/wallet/WalletStates';
import { walletScreenStyles as styles } from '../components/wallet/walletScreenStyles';
import { formatWalletBalance } from '../components/wallet/walletViewModels';
import { useWalletData, useWalletActions, useWalletDerived } from '../hooks/wallet';
import { useScreenCaptureProtection } from '../platform/screenCapture';
import { t } from '../i18n';
import { track } from '../analytics';

type Props = NativeStackScreenProps<RootStackParamList, 'Wallet'>;

// WalletScreen — thin orchestrator for the wallet surface.
// Balance hydration + focus refetch live in hooks/wallet/useWalletData,
// navigation handlers in useWalletActions, derived balance values in
// useWalletDerived, and section rendering is delegated to
// components/wallet/*. Mirrors the portfolio/withdraw decomposition.

export default function WalletScreen({ navigation }: Props) {
  const a11yRef = useRef<any>(null);
  useA11yAudit(a11yRef, 'WalletScreen');
  useScreenCaptureProtection();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const currentUser = useStore((state) => state.currentUser);
  const { currencyCode } = useCurrencyContext();
  const { formatFromFiat } = useFormattedPrice();
  const { isOffline } = useConnectivity();

  // ── Biometric gate (OWASP M5) ──
  // Wallet balances are sensitive. Require biometric re-authentication before
  // revealing any wallet content. Falls through when biometric is unavailable.
  const biometricGate = useBiometricGate();

  const {
    balance,
    availableFiatBalance,
    sellerBalances,
    isLoading,
    isError,
    refreshing,
    loadBalance,
    handleRefresh,
  } = useWalletData();

  const {
    handleBack,
    handleConvert,
    handleViewActivity,
    handleViewEarnings,
    handleWithdraw,
  } = useWalletActions();

  // ── Derived values ──
  const {
    isWalletOperational,
    withdrawable,
    hasPendingAttention,
    pendingAttentionTitle,
    usdLabel,
  } = useWalletDerived(balance, isOffline);

  // ── Inline flow state ──
  // Add money is handled by the extracted AddMoneySheet (spec 17).
  // Convert is handled by the dedicated WalletConvertScreen (Phase 3.1).
  const [addMoneyVisible, setAddMoneyVisible] = useState(false);
  // ── Privacy eye (spec 17 viewport 1) ──
  const [balanceHidden, setBalanceHidden] = useState(false);

  React.useEffect(() => { track('wallet_viewed'); }, []);

  // ── Add money (extracted AddMoneySheet — spec 17 dedicated flow) ──
  const handleAddMoney = React.useCallback(() => {
    haptics.tap();
    setAddMoneyVisible(true);
  }, []);

  // ── Privacy eye toggle (spec 17 viewport 1) ──
  const handleTogglePrivacy = React.useCallback(() => {
    setBalanceHidden((prev) => !prev);
  }, []);

  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + DockConstants.dualActionHeight;

  // Auto-prompt biometric once availability is confirmed.
  React.useEffect(() => {
    if (biometricGate.status === 'locked' && !biometricGate.isAuthenticating) {
      void biometricGate.authenticate(t('commerce.wallet.authenticateToView'));
    }
  }, [biometricGate.status, biometricGate.isAuthenticating, biometricGate.authenticate]);

  // ── Add money (extracted AddMoneySheet — spec 17 dedicated flow) ──
  const addMoneySheet = (
    <AddMoneySheet
      visible={addMoneyVisible}
      onDismiss={() => setAddMoneyVisible(false)}
      availableFiatBalance={availableFiatBalance}
      isWalletOperational={isWalletOperational}
      // Silent reload — the sheet already confirmed success; a non-silent
      // load would unmount the ScrollView and flash the skeleton.
      onCompleted={() => loadBalance(true)}
      userId={currentUser?.id}
    />
  );

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
    return <WalletLoadingScreen onBack={handleBack} />;
  }

  // ── Error state ──
  if (isError) {
    return (
      <WalletErrorScreen
        onBack={handleBack}
        onRetry={loadBalance}
      />
    );
  }

  // ── Empty state ──
  if (balance.available === 0 && balance.reservedForOrders === 0) {
    return (
      <WalletEmptyScreen onBack={handleBack} onAddMoney={handleAddMoney}>
        {addMoneySheet}
      </WalletEmptyScreen>
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
        <WalletBalanceHero
          available={balance.available}
          balanceHidden={balanceHidden}
          usdLabel={usdLabel}
          onTogglePrivacy={handleTogglePrivacy}
        />

        {/* ── Primary actions — 3 equal-width buttons in a row (spec 17 viewport 1) ── */}
        <WalletActionRow
          isWalletOperational={isWalletOperational}
          available={balance.available}
          onAddMoney={handleAddMoney}
          onWithdraw={handleWithdraw}
          onConvert={handleConvert}
        />

        {/* ── Pending attention — if real (spec 17 viewport 1) ── */}
        {hasPendingAttention && !balanceHidden && (
          <FlagshipNavigationRow
            icon="time-outline"
            iconColor={colors.warning}
            title={pendingAttentionTitle}
            onPress={handleViewEarnings}
            style={{ marginTop: Space.md }}
            accessibilityLabel={t('commerce.wallet.a11y.pendingAttention', { deposit: `${formatWalletBalance(balance.pendingDeposit)} 1ZE`, unsettled: `${formatWalletBalance(balance.unsettledSaleProceeds)} 1ZE` })}
            accessibilityHint={t('commerce.wallet.a11y.viewSellerEarnings')}
          />
        )}

        {/* ── Seller earnings summary (spec 17: "Seller earnings · {currencySymbol}X available · {currencySymbol}Y pending") ── */}
        {sellerBalances !== null && (sellerBalances.pendingGbp > 0 || sellerBalances.availableGbp > 0 || sellerBalances.heldInReserveGbp > 0) && (
          <FlagshipNavigationRow
            icon="cash-outline"
            iconColor={colors.brand}
            title={t('commerce.wallet.sellerEarnings')}
            subtitle={t('commerce.wallet.sellerEarningsSubtitle', { available: formatFromFiat(sellerBalances.availableGbp, 'GBP', { displayMode: 'fiat' }), pending: formatFromFiat(sellerBalances.pendingGbp, 'GBP', { displayMode: 'fiat' }) })}
            onPress={handleViewEarnings}
            accessibilityLabel={t('commerce.wallet.a11y.sellerEarnings', { available: formatFromFiat(sellerBalances.availableGbp, 'GBP', { displayMode: 'fiat' }), pending: formatFromFiat(sellerBalances.pendingGbp, 'GBP', { displayMode: 'fiat' }) })}
            accessibilityHint={t('commerce.wallet.a11y.viewSellerEarnings')}
          />
        )}

        {/* ── Balance breakdown — flat hairline-separated rows (spec 17 viewport 2),
               or the withdrawable-only row when no sub-balances exist ── */}
        <WalletSubBalanceSection balance={balance} withdrawable={withdrawable} />

        {/* ── Transaction history (spec 17 viewport 2: latest activity) ── */}
        <WalletActivitySection onViewActivity={handleViewActivity} />

        {/* ── Safeguarding & 1ZE disclosure — flat canvas, hairline divider (spec 17) ── */}
        <WalletDisclosureSection balance={balance} currencyCode={currencyCode} />

      </ScrollView>

      {/* ── Add money (extracted AddMoneySheet — spec 17 dedicated flow) ── */}
      {addMoneySheet}
    </FlagshipScreen>
  );
}
