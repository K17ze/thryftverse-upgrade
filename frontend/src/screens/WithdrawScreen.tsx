import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useConnectivity } from '../hooks/useConnectivity';
import { useCurrencyContext } from '../context/CurrencyContext';
import { COPY } from '../constants/copy';
import { useA11yAudit } from '../hooks/useA11yAudit';
import { useStore } from '../store/useStore';
import {
  convertDisplayToGbpAmount,
  getDefaultWithdrawDisplayAmount } from '../utils/currencyAuthoringFlows';
import {
  formatCountryPolicyScope,
  formatPayoutPolicyHint,
  isPaymentMethodAllowed } from '../utils/capabilityPolicy';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useBiometricGate } from '../hooks/useBiometricGate';
import { BiometricGatePrompt } from '../components/security/BiometricGate';
import { useScreenCaptureProtection } from '../platform/screenCapture';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { Space, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import {
  usePayoutAccountConnection,
  useWithdrawData,
  useWithdrawSubmission } from '../hooks/withdraw';
import { WithdrawSkeleton } from '../components/withdraw/WithdrawSkeleton';
import { WithdrawUnknownOutcome } from '../components/withdraw/WithdrawUnknownOutcome';
import { WithdrawSuccessStep } from '../components/withdraw/WithdrawSuccessStep';
import { WithdrawConfirmStep } from '../components/withdraw/WithdrawConfirmStep';
import { WithdrawAmountSection } from '../components/withdraw/WithdrawAmountSection';
import { WithdrawPayoutSection } from '../components/withdraw/WithdrawPayoutSection';
import { WithdrawHistorySection } from '../components/withdraw/WithdrawHistorySection';
import { WithdrawFormFooter } from '../components/withdraw/WithdrawFormFooter';
import {
  getWithdrawBankCopy,
  getWithdrawDestinationLabel } from '../components/withdraw/withdrawViewModels';

// WithdrawScreen — thin orchestrator for the withdraw surface.
// Data hydration lives in hooks/withdraw/useWithdrawData, the Stripe
// Connect payout-profile flow in usePayoutAccountConnection, and the
// money-mutation state machine (steps, idempotency, unknown-outcome
// reconciliation) in useWithdrawSubmission. Step + section rendering is
// delegated to components/withdraw/*. Mirrors the checkout decomposition.

export default function WithdrawScreen() {
  const a11yRef = useRef<any>(null);
  useA11yAudit(a11yRef, 'WithdrawScreen');
  useScreenCaptureProtection();
  const navigation = useNavigation<any>();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [amount, setAmount] = useState('');
  const { currencySymbol, formatFromFiat } = useFormattedPrice();
  const { currencyCode, fxRates, rateUpdatedAt } = useCurrencyContext();
  const { isOffline } = useConnectivity();
  const currentUser = useStore((state) => state.currentUser);

  // ── Biometric gate (OWASP M5) ──
  // Withdrawals move money out of the wallet. Require biometric re-authentication
  // before showing the withdrawal form. Falls through when biometric is unavailable.
  const biometricGate = useBiometricGate();

  const {
    availableBalance,
    setAvailableBalance,
    isHydratingBalance,
    countryCapabilities,
    setCountryCapabilities,
    payoutAccount,
    setPayoutAccount,
    withdrawals,
    withdrawalsLoadState,
    loadWithdrawals,
  } = useWithdrawData({ userId: currentUser?.id });

  const {
    isConnectingPayout,
    ensurePayoutAccount,
    handleConnectPayout,
  } = usePayoutAccountConnection({
    userId: currentUser?.id,
    countryCapabilities,
    setCountryCapabilities,
    payoutAccount,
    setPayoutAccount,
  });

  const numericAmountDisplay = Number(amount) || 0;
  const numericAmount = Number(convertDisplayToGbpAmount(numericAmountDisplay, currencyCode, fxRates).toFixed(2));
  const exceedsBalance = numericAmount > availableBalance;
  const allowBankAccounts = isPaymentMethodAllowed(countryCapabilities, 'bank_account');

  const {
    step,
    successData,
    isWithdrawing,
    canWithdraw,
    handleReview,
    handleBackToForm,
    handleWithdraw,
  } = useWithdrawSubmission({
    userId: currentUser?.id,
    numericAmount,
    numericAmountDisplay,
    exceedsBalance,
    isConnectingPayout,
    payoutAccount,
    currencyCode,
    fxRates,
    availableBalance,
    setAvailableBalance,
    setAmount,
    ensurePayoutAccount,
    loadWithdrawals,
  });

  useEffect(() => {
    const displayAmount = getDefaultWithdrawDisplayAmount(availableBalance, currencyCode, fxRates);
    setAmount(displayAmount.toFixed(2));
  }, [availableBalance, currencyCode, fxRates]);

  const policyScopeLabel = useMemo(
    () => formatCountryPolicyScope(countryCapabilities),
    [countryCapabilities]
  );

  const payoutPolicyHint = useMemo(
    () => formatPayoutPolicyHint(countryCapabilities),
    [countryCapabilities]
  );

  const bankCopy = useMemo(
    () => getWithdrawBankCopy({ payoutAccount, allowBankAccounts }),
    [allowBankAccounts, payoutAccount]
  );

  // Auto-prompt biometric once availability is confirmed.
  useEffect(() => {
    if (biometricGate.status === 'locked' && !biometricGate.isAuthenticating) {
      void biometricGate.authenticate('Authenticate to withdraw funds');
    }
  }, [biometricGate.status, biometricGate.isAuthenticating, biometricGate.authenticate]);

  // ── Biometric gate: block the withdrawal form until authenticated ──
  if (biometricGate.status === 'pending' || biometricGate.status === 'locked') {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Withdraw Balance"
            onBack={() => navigation.goBack()}
            backIcon="arrow-back"
          />
        }
        scrollEnabled={false}
      >
        <BiometricGatePrompt
          gate={biometricGate}
          reason="Authenticate to withdraw funds"
          onBack={() => navigation.goBack()}
        />
      </FlagshipScreen>
    );
  }

  // ── Balance hydration skeleton: shows matching layout while balance loads ──
  // Prevents layout shift and provides immediate visual feedback on first render.
  if (isHydratingBalance) {
    return <WithdrawSkeleton onBack={() => navigation.goBack()} />;
  }

  // ── Unknown outcome step ──
  // The withdrawal response was lost. We are polling the backend to
  // determine whether the payout was committed. The user must not retry
  // until the status is resolved.
  if (step === 'unknown_outcome') {
    return <WithdrawUnknownOutcome />;
  }

  // ── Success step ──
  if (step === 'success' && successData) {
    return (
      <WithdrawSuccessStep
        successData={successData}
        onClose={() => navigation.goBack()}
      />
    );
  }

  // ── Confirmation step ──
  if (step === 'confirm') {
    const amountLabel = formatFromFiat(numericAmount, 'GBP', { displayMode: 'fiat' });
    const rateTimestampLabel =
      rateUpdatedAt && currencyCode !== 'GBP'
        ? `Reference rate as of ${new Date(rateUpdatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
        : null;
    return (
      <WithdrawConfirmStep
        amountLabel={amountLabel}
        feeLabel={formatFromFiat(0, 'GBP', { displayMode: 'fiat' })}
        destinationLabel={getWithdrawDestinationLabel(payoutAccount, bankCopy.details)}
        rateTimestampLabel={rateTimestampLabel}
        isWithdrawing={isWithdrawing}
        onConfirm={handleWithdraw}
        onBack={handleBackToForm}
      />
    );
  }

  return (
    <FlagshipScreen
      ref={a11yRef}
      header={
        <FlagshipHeader
          title="Withdraw Balance"
          onBack={() => navigation.goBack()}
          backIcon="arrow-back"
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      stickyFooter={
        <WithdrawFormFooter
          amountLabel={formatFromFiat(numericAmount, 'GBP', { displayMode: 'fiat' })}
          canWithdraw={canWithdraw}
          onReview={handleReview}
        />
      }
    >
      {isOffline && (
        <View style={[styles.offlineBanner, { backgroundColor: colors.dangerSubtle, borderBottomColor: colors.border }]}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.danger} />
          <Text style={[styles.offlineBannerText, { color: colors.textPrimary }]}>
            {COPY.offline}
          </Text>
        </View>
      )}

      <KeyboardAwareScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <WithdrawAmountSection
          availableLabel={formatFromFiat(availableBalance, 'GBP', { displayMode: 'fiat' })}
          amount={amount}
          currencySymbol={currencySymbol}
          policyScopeLabel={policyScopeLabel}
          payoutPolicyHint={payoutPolicyHint}
          exceedsBalance={exceedsBalance}
          onAmountChange={setAmount}
        />

        <WithdrawPayoutSection
          bankName={bankCopy.name}
          bankDetails={bankCopy.details}
          hasActivePayoutAccount={payoutAccount?.status === 'active'}
          allowBankAccounts={allowBankAccounts}
          isConnectingPayout={isConnectingPayout}
          onConnectPayout={handleConnectPayout}
        />

        <WithdrawHistorySection
          withdrawals={withdrawals}
          loadState={withdrawalsLoadState}
          onRetry={() => currentUser?.id && loadWithdrawals(currentUser.id)}
        />
      </KeyboardAwareScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: Stroke.standard },
  offlineBannerText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight },

  content: { flex: 1 } });
}
