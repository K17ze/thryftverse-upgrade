import React, { useMemo, useState } from 'react';
import {
  View,
  Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';

import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useBiometricGate } from '../hooks/useBiometricGate';
import {
  useConvertData,
  useRateExpiry,
  useConvertQuote,
  useConvertSubmission } from '../hooks/wallet';
import { ConvertSkeleton } from '../components/wallet/ConvertSkeleton';
import { ConvertStepIndicator } from '../components/wallet/ConvertStepIndicator';
import { ConvertAmountStep } from '../components/wallet/ConvertAmountStep';
import { ConvertReviewStep } from '../components/wallet/ConvertReviewStep';
import { ConvertAuthStep } from '../components/wallet/ConvertAuthStep';
import { ConvertExecutingStep } from '../components/wallet/ConvertExecutingStep';
import { ConvertReceiptStep } from '../components/wallet/ConvertReceiptStep';
import { ConvertErrorStep } from '../components/wallet/ConvertErrorStep';
import { ConvertFooter } from '../components/wallet/ConvertFooter';
import { createConvertStyles } from '../components/wallet/convertStyles';

import { izeToUsd } from '../utils/currency';
import { CURRENCIES } from '../constants/currencies';
import { COPY } from '../constants/copy';
import { useScreenCaptureProtection } from '../platform/screenCapture';

import { IconGrammar } from '../theme/designTokens';

// WalletConvertScreen — thin orchestrator for the 1ZE → fiat convert
// surface. Balance hydration lives in hooks/wallet/useConvertData, the
// FX-rate validity countdown in useRateExpiry, the debounced backend fee
// quote in useConvertQuote, and the money-mutation state machine (steps,
// biometric gate, idempotency-keyed execution) in useConvertSubmission.
// Step rendering is delegated to components/wallet/Convert*. Mirrors the
// withdraw/checkout decomposition.

export default function WalletConvertScreen() {
  useScreenCaptureProtection();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createConvertStyles(colors), [colors]);
  const haptic = useHaptic();
  const { show } = useToast();
  const { isOffline } = useConnectivity();
  const reducedMotionEnabled = useReducedMotion();
  const currentUser = useStore((state) => state.currentUser);
  const { currencyCode, rateUpdatedAt, refreshRates } = useCurrencyContext();
  const { formatFromFiat } = useFormattedPrice();
  const biometricGate = useBiometricGate();

  const currencySymbol = CURRENCIES[currencyCode].symbol;

  // -- State --
  const [amount, setAmount] = useState('');

  const {
    availableIze,
    setAvailableIze,
    isHydratingBalance,
  } = useConvertData({
    userId: currentUser?.id,
    currencyCode });

  // -- Derived conversion values (at-par model) --
  // All financial truth comes from the backend quote: principalAmount,
  // feeAmount, feeBps, netFiatAmount and rateUsed. The client only
  // displays these -- it never computes a fee locally.
  const izeValue = Number(amount || '0');
  const usdEquivalent = izeToUsd(izeValue);
  const exceedsBalance = izeValue > availableIze;
  const isWalletOperational = !isOffline;

  const {
    rateTimestampLabel,
    rateExpiryMs,
    rateExpiryLabel,
    isRateExpired,
  } = useRateExpiry(rateUpdatedAt);

  const {
    quote,
    isFetchingQuote,
    quoteError,
    handleRetryQuote,
  } = useConvertQuote({
    userId: currentUser?.id,
    izeValue,
    currencyCode,
    exceedsBalance });

  const {
    step,
    result,
    errorMessage,
    canReview,
    handleReview,
    handleBackToAmount,
    handleConfirm,
    handleRetryAuth,
    handleCancelAuth,
    handleTryAgain,
    handleCancelError,
    handleDone,
    handleBack,
  } = useConvertSubmission({
    userId: currentUser?.id,
    izeValue,
    currencyCode,
    availableIze,
    setAvailableIze,
    exceedsBalance,
    isWalletOperational,
    quote,
    isFetchingQuote,
    quoteError,
    biometricGate });

  // -- Loading skeleton --
  if (isHydratingBalance) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Convert 1ZE"
            onBack={handleBack}
          />
        }
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      >
        <ConvertSkeleton />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Convert 1ZE"
          onBack={handleBack}
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      stickyFooter={
        <ConvertFooter
          step={step}
          canReview={canReview}
          onReview={handleReview}
          onConfirm={handleConfirm}
          onBackToAmount={handleBackToAmount}
          onDone={handleDone}
        />
      }
    >
      {isOffline && step === 'amount' && (
        <View
          style={[
            styles.offlineBanner,
            { backgroundColor: colors.dangerSubtle, borderBottomColor: colors.border },
          ]}
        >
          <Ionicons name="cloud-offline-outline" size={IconGrammar.metadata} color={colors.danger} />
          <Text style={[styles.offlineBannerText, { color: colors.textPrimary }]}>
            {COPY.offline}
          </Text>
        </View>
      )}

      <ConvertStepIndicator step={step} />

      <KeyboardAwareScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        scrollEnabled={step === 'amount'}
      >
        {/* ================================================================ */}
        {/* STEP 1: AMOUNT                                                    */}
        {/* ================================================================ */}
        {step === 'amount' && (
          <ConvertAmountStep
            availableIze={availableIze}
            amount={amount}
            onAmountChange={setAmount}
            izeValue={izeValue}
            usdEquivalent={usdEquivalent}
            exceedsBalance={exceedsBalance}
            isFetchingQuote={isFetchingQuote}
            quoteError={quoteError}
            quote={quote}
            onRetryQuote={handleRetryQuote}
            rateTimestampLabel={rateTimestampLabel}
            rateExpiryMs={rateExpiryMs}
            isRateExpired={isRateExpired}
            rateExpiryLabel={rateExpiryLabel}
            onRefreshRates={() => void refreshRates()}
          />
        )}

        {/* ================================================================ */}
        {/* STEP 2: REVIEW                                                    */}
        {/* ================================================================ */}
        {step === 'review' && quote && (
          <ConvertReviewStep
            quote={quote}
            izeValue={izeValue}
            usdEquivalent={usdEquivalent}
            currencyCode={currencyCode}
            rateTimestampLabel={rateTimestampLabel}
            rateExpiryMs={rateExpiryMs}
            isRateExpired={isRateExpired}
            rateExpiryLabel={rateExpiryLabel}
            onRefreshRates={() => void refreshRates()}
          />
        )}

        {/* ================================================================ */}
        {/* STEP 3: AUTHENTICATING                                            */}
        {/* ================================================================ */}
        {step === 'authenticating' && (
          <ConvertAuthStep
            isAuthenticating={biometricGate.isAuthenticating}
            error={biometricGate.error}
            onRetryAuth={handleRetryAuth}
            onCancelAuth={handleCancelAuth}
          />
        )}

        {/* ================================================================ */}
        {/* STEP 4: EXECUTING                                                 */}
        {/* ================================================================ */}
        {step === 'executing' && (
          <ConvertExecutingStep
            izeValue={izeValue}
            currencyCode={currencyCode}
          />
        )}

        {/* ================================================================ */}
        {/* STEP 5: RECEIPT                                                   */}
        {/* ================================================================ */}
        {step === 'receipt' && result && (
          <ConvertReceiptStep result={result} />
        )}

        {/* ================================================================ */}
        {/* ERROR STATE                                                       */}
        {/* ================================================================ */}
        {step === 'error' && (
          <ConvertErrorStep
            errorMessage={errorMessage}
            onTryAgain={handleTryAgain}
            onCancel={handleCancelError}
          />
        )}
      </KeyboardAwareScrollView>
    </FlagshipScreen>
  );
}
