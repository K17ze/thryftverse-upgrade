import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Platform,
  Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { AppButton } from '../components/ui/AppButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';

import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useBiometricGate } from '../hooks/useBiometricGate';

import { parseApiError } from '../lib/apiClient';
import {
  getIzePosition,
  convertIzeToFiat,
  getConvertQuote,
  type ConvertQuotePayload } from '../services/walletApi';
import { sanitizeDecimalInput } from '../utils/currencyAuthoringFlows';
import { formatIzeAmount, izeToUsd, formatUsd } from '../utils/currency';
import { CURRENCIES } from '../constants/currencies';
import { COPY } from '../constants/copy';
import { useScreenCaptureProtection } from '../platform/screenCapture';

import {

  Typography,
  Space,
  Radius,
  Stroke,
  Control,
  LetterSpacing,
  IconGrammar } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { t } from '../i18n';

type ConvertStep = 'amount' | 'review' | 'authenticating' | 'executing' | 'receipt' | 'error';

interface ConversionResult {
  izeAmount: number;
  fiatAmount: number;
  fiatCurrency: string;
  feeAmount: number;
  feeBps: number;
  principalAmount: number;
  netRedemption: number;
  rateUsed: number;
  timestamp: string;
}

export default function WalletConvertScreen() {
  useScreenCaptureProtection();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  const [step, setStep] = useState<ConvertStep>('amount');
  const [amount, setAmount] = useState('');
  const [availableIze, setAvailableIze] = useState(0);
  const [isHydratingBalance, setIsHydratingBalance] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // -- Fee quote from backend (transparent, not hardcoded) --
  // The full principal/fee/net breakdown comes from the backend preview
  // quote. The client never assumes a fee rate -- it discloses what the
  // backend returns (MiCA EMT transparent-fee requirement).
  const [quote, setQuote] = useState<ConvertQuotePayload | null>(null);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState(false);
  const [quoteNonce, setQuoteNonce] = useState(0);

  // -- Balance hydration (available 1ZE) --
  useEffect(() => {
    let isCancelled = false;

    const hydrateBalance = async () => {
      if (!currentUser?.id) {
        setIsHydratingBalance(false);
        return;
      }
      setIsHydratingBalance(true);
      try {
        const position = await getIzePosition(currentUser.id, currencyCode);
        if (!isCancelled) {
          setAvailableIze(position.balances.availableIze);
        }
      } catch {
        if (!isCancelled) {
          setAvailableIze(0);
        }
      } finally {
        if (!isCancelled) {
          setIsHydratingBalance(false);
        }
      }
    };

    void hydrateBalance();

    return () => {
      isCancelled = true;
    };
  }, [currentUser?.id, currencyCode]);

  // -- Derived conversion values (at-par model) --
  // All financial truth comes from the backend quote: principalAmount,
  // feeAmount, feeBps, netFiatAmount and rateUsed. The client only
  // displays these -- it never computes a fee locally.
  const izeValue = Number(amount || '0');
  const usdEquivalent = izeToUsd(izeValue);
  const exceedsBalance = izeValue > availableIze;
  const isWalletOperational = !isOffline;

  // -- Rate timestamp (when the rate was captured) --
  const rateTimestampLabel = React.useMemo(() => {
    if (!rateUpdatedAt) return null;
    const date = new Date(rateUpdatedAt);
    if (!Number.isFinite(date.getTime())) return null;
    return date.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit' });
  }, [rateUpdatedAt]);

  // -- Rate expiry: rates are valid for 30 minutes from the timestamp --
  const RATE_VALIDITY_MINUTES = 30;
  const [rateExpiryMs, setRateExpiryMs] = useState<number | null>(null);

  useEffect(() => {
    if (!rateUpdatedAt) {
      setRateExpiryMs(null);
      return;
    }
    const expiry = new Date(rateUpdatedAt).getTime() + RATE_VALIDITY_MINUTES * 60 * 1000;
    setRateExpiryMs(expiry);
  }, [rateUpdatedAt]);

  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (rateExpiryMs === null) return;
    const interval = setInterval(() => {
      const remaining = rateExpiryMs - Date.now();
      setRemainingMs(Math.max(0, remaining));
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [rateExpiryMs]);

  const rateExpiryLabel = React.useMemo(() => {
    if (remainingMs <= 0) return 'expired';
    const mins = Math.floor(remainingMs / 60000);
    const secs = Math.floor((remainingMs % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, [remainingMs]);

  const isRateExpired = remainingMs <= 0 && rateExpiryMs !== null;

  // -- Fetch fee quote from backend (debounced) --
  // The fee is transparent -- fetched from the backend, never hardcoded.
  // We call the same convert endpoint with a preview flag so the breakdown
  // matches exactly what execution will return.
  useEffect(() => {
    if (izeValue <= 0 || exceedsBalance || !currentUser?.id) {
      setQuote(null);
      setQuoteError(false);
      return;
    }
    let isCancelled = false;
    const debounce = setTimeout(async () => {
      setIsFetchingQuote(true);
      setQuoteError(false);
      try {
        const response = await getConvertQuote({
          userId: currentUser.id,
          izeAmount: izeValue,
          fiatCurrency: currencyCode });
        if (!isCancelled) {
          setQuote(response.conversion);
        }
      } catch {
        if (!isCancelled) {
          setQuote(null);
          setQuoteError(true);
        }
      } finally {
        if (!isCancelled) {
          setIsFetchingQuote(false);
        }
      }
    }, 400);
    return () => {
      isCancelled = true;
      clearTimeout(debounce);
    };
  }, [izeValue, currencyCode, exceedsBalance, currentUser?.id, quoteNonce]);

  const handleRetryQuote = () => {
    setQuoteNonce((n) => n + 1);
  };

  const canReview =
    Number.isFinite(izeValue) &&
    izeValue > 0 &&
    !exceedsBalance &&
    !isExecuting &&
    isWalletOperational &&
    quote !== null &&
    !isFetchingQuote &&
    !quoteError;

  // -- Step transitions --
  const handleReview = () => {
    if (!canReview) {
      return;
    }
    haptic.medium();
    setStep('review');
  };

  const handleBackToAmount = () => {
    haptic.light();
    setStep('amount');
  };

  const handleConfirm = async () => {
    haptic.medium();
    // Trigger biometric authentication before execution.
    setStep('authenticating');
    const success = await biometricGate.authenticate('Authenticate to convert 1ZE');
    if (success) {
      void handleExecute();
    }
    // On failure, the authenticating step UI shows retry / cancel.
  };

  const handleRetryAuth = async () => {
    haptic.light();
    const success = await biometricGate.authenticate('Authenticate to convert 1ZE');
    if (success) {
      void handleExecute();
    }
  };

  const handleCancelAuth = () => {
    haptic.light();
    setStep('review');
  };

  const handleExecute = async () => {
    if (!currentUser?.id) {
      show('Sign in to convert your 1ZE balance.', 'error');
      navigation.navigate('AuthLanding');
      return;
    }

    setStep('executing');
    setIsExecuting(true);
    try {
      const idempotencyKey =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `convert_${currentUser.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      const response = await convertIzeToFiat({
        userId: currentUser.id,
        izeAmount: izeValue,
        fiatCurrency: currencyCode,
        idempotencyKey });

      const conversion = response.conversion;
      const nextAvailable = Math.max(0, availableIze - conversion.izeAmount);
      setAvailableIze(nextAvailable);

      setResult({
        izeAmount: conversion.izeAmount,
        fiatAmount: conversion.netFiatAmount,
        fiatCurrency: conversion.fiatCurrency,
        feeAmount: conversion.feeAmount,
        feeBps: conversion.feeBps,
        principalAmount: conversion.principalAmount,
        netRedemption: conversion.netFiatAmount,
        rateUsed: conversion.rateUsed,
        timestamp: new Date().toISOString() });

      haptic.success();
      setStep('receipt');
    } catch (error) {
      const isNetworkError =
        isOffline ||
        (error instanceof Error && /network|fetch|timeout/i.test(error.message));
      const parsed = parseApiError(
        error,
        isNetworkError
          ? 'You appear to be offline. Check your connection and try again.'
          : 'Unable to convert 1ZE right now.'
      );
      setErrorMessage(parsed.message);
      haptic.error();
      setStep('error');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleTryAgain = () => {
    haptic.light();
    setErrorMessage('');
    setStep('review');
  };

  const handleCancelError = () => {
    haptic.light();
    setErrorMessage('');
    setStep('amount');
  };

  const handleDone = () => {
    haptic.light();
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Wallet');
    }
  };

  const handleBack = () => {
    if (isExecuting) {
      return; // Back disabled during execution
    }
    haptic.light();
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Wallet');
    }
  };

  // -- Step indicator --
  const stepLabels = ['Amount', 'Review', 'Auth', 'Done'];
  const activeStepIndex =
    step === 'amount'
      ? 0
      : step === 'review'
        ? 1
        : step === 'authenticating' || step === 'executing'
          ? 2
          : step === 'receipt' || step === 'error'
            ? 3
            : 0;

  const renderStepIndicator = () => (
    <View style={styles.stepIndicatorRow}>
      {stepLabels.map((label, index) => {
        const isComplete = index < activeStepIndex;
        const isActive = index === activeStepIndex;
        return (
          <React.Fragment key={label}>
            <View style={styles.stepItem}>
              <View
                style={[
                  styles.stepDot,
                  {
                    backgroundColor: isComplete || isActive ? colors.brand : colors.surfaceAlt,
                    borderColor: isComplete || isActive ? colors.brand : colors.border },
                ]}
              >
                {isComplete ? (
                  <Ionicons name="checkmark" size={14} color={colors.textInverse} />
                ) : (
                  <Text
                    style={[
                      styles.stepDotText,
                      { color: isActive ? colors.textInverse : colors.textMuted },
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  {
                    color: isActive ? colors.textPrimary : colors.textMuted,
                    fontFamily: isActive
                      ? Typography.family.semibold
                      : Typography.family.regular },
                ]}
              >
                {label}
              </Text>
            </View>
            {index < stepLabels.length - 1 && (
              <View
                style={[
                  styles.stepConnector,
                  {
                    backgroundColor: index < activeStepIndex ? colors.brand : colors.border },
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );

  const renderSummaryRow = (
    label: string,
    value: string,
    opts: { total?: boolean; emphasis?: boolean } = {}
  ) => (
    <View
      style={[
        styles.summaryRow,
        opts.total && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          marginTop: Space.xs,
          paddingTop: Space.xs },
      ]}
      accessibilityRole="text"
      accessibilityLabel={`${label} ${value}`}
    >
      <Text
        style={[
          styles.summaryLabel,
          { color: opts.total ? colors.textPrimary : colors.textSecondary },
          opts.total && { fontFamily: Typography.family.semibold },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.summaryValue,
          { color: opts.total ? colors.textPrimary : colors.textPrimary },
          opts.emphasis && { fontFamily: Typography.family.bold },
          opts.total && { fontFamily: Typography.family.semibold },
        ]}
      >
        {value}
      </Text>
    </View>
  );

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
        <View style={styles.skeletonContainer}>
          <SkeletonLoader
            width="60%"
            height={32}
            borderRadius={Radius.md}
            style={{ marginBottom: Space.lg }}
          />
          <SkeletonLoader
            width="100%"
            height={80}
            borderRadius={Radius.lg}
            style={{ marginBottom: Space.md }}
          />
          <SkeletonLoader
            width="100%"
            height={56}
            borderRadius={Radius.md}
            style={{ marginBottom: Space.sm }}
          />
          <SkeletonLoader width="100%" height={56} borderRadius={Radius.md} />
        </View>
      </FlagshipScreen>
    );
  }

  // -- Footer actions per step --
  const renderFooter = () => {
    if (step === 'amount') {
      return (
        <AppButton
          title="Review conversion"
          onPress={handleReview}
          disabled={!canReview}
          variant="primary"
          style={[styles.primaryBtn, !canReview && styles.primaryBtnDisabled]}
          titleStyle={styles.primaryText}
          accessibilityLabel="Review conversion"
          accessibilityHint="Proceeds to the conversion review step"
          hapticFeedback="medium"
        />
      );
    }
    if (step === 'review') {
      return (
        <>
          <AppButton
            title="Confirm"
            onPress={handleConfirm}
            variant="primary"
            style={styles.primaryBtn}
            titleStyle={styles.primaryText}
            accessibilityLabel="Confirm conversion"
            accessibilityHint="Triggers biometric authentication then executes the conversion"
            hapticFeedback="medium"
          />
          <AppButton
            title="Back to edit"
            onPress={handleBackToAmount}
            variant="secondary"
            style={[styles.secondaryBtn, { marginTop: Space.sm }]}
            accessibilityLabel="Back to edit amount"
            accessibilityHint="Returns to the amount input step"
            hapticFeedback="light"
          />
        </>
      );
    }
    if (step === 'receipt') {
      return (
        <AppButton
          title="Done"
          onPress={handleDone}
          variant="primary"
          style={styles.primaryBtn}
          titleStyle={styles.primaryText}
          accessibilityLabel="Done"
          accessibilityHint="Returns to the wallet screen"
          hapticFeedback="light"
        />
      );
    }
    return null;
  };

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
      stickyFooter={renderFooter()}
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

      {renderStepIndicator()}

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
          <>
            {/* Available 1ZE balance — flat, no card or decorative icon circle */}
            <View style={styles.balanceBlock}>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                {formatIzeAmount(availableIze, 2)}
              </Text>
              <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                Available 1ZE · {formatUsd(izeToUsd(availableIze))} at par
              </Text>
            </View>

            {/* Amount input */}
            <View>
              <View style={styles.amountWrap}>
                <Text style={styles.amountSuffix}>1ZE</Text>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={(value) => {
                    haptic.selection();
                    setAmount(sanitizeDecimalInput(value));
                  }}
                  onFocus={() => haptic.light()}
                  keyboardType="decimal-pad"
                  autoFocus
                  selectionColor={colors.brand}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Amount in 1ZE"
                  accessibilityHint="Enter the 1ZE amount to convert to fiat"
                />
              </View>
              <Text style={styles.availableText}>
                Available: {formatIzeAmount(availableIze, 2)} · {formatUsd(izeToUsd(availableIze))}
              </Text>
              {exceedsBalance ? (
                <Text style={styles.balanceError}>
                  Entered amount exceeds available 1ZE balance.
                </Text>
              ) : null}
            </View>

            {/* Live calculation summary -- transparent at-par breakdown */}
            {izeValue > 0 && !exceedsBalance && (
              <View>
                <View style={styles.calcBlock}>
                  {isFetchingQuote ? (
                    <View style={styles.quoteLoadingRow}>
                      <ActivityIndicator size="small" color={colors.textMuted} />
                      <Text style={[styles.quoteStatusText, { color: colors.textMuted }]}>
                        Fetching live quote…
                      </Text>
                    </View>
                  ) : quoteError ? (
                    <View style={styles.quoteErrorRow}>
                      <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
                      <Text style={[styles.quoteStatusText, { color: colors.danger }]}>
                        Couldn't fetch quote.
                      </Text>
                      <Pressable
                        hitSlop={8}
                        onPress={handleRetryQuote}
                        accessibilityRole="button"
                        accessibilityLabel="Retry quote fetch"
                      >
                        <Text style={[styles.quoteStatusText, { color: colors.brand }]}>
                          Retry
                        </Text>
                      </Pressable>
                    </View>
                  ) : quote ? (
                    <>
                      {renderSummaryRow(
                        'You convert',
                        `${formatIzeAmount(izeValue, 2)} · ${formatUsd(usdEquivalent)}`
                      )}
                      {renderSummaryRow(
                        'Principal',
                        formatFromFiat(quote.principalAmount, 'GBP', { displayMode: 'fiat' })
                      )}
                      {renderSummaryRow(
                        `Platform fee (${quote.feeBps} bps)`,
                        `−${formatFromFiat(quote.feeAmount, 'GBP', { displayMode: 'fiat' })}`
                      )}
                      {renderSummaryRow(
                        'You receive',
                        formatFromFiat(quote.netFiatAmount, 'GBP', { displayMode: 'fiat' }),
                        { total: true }
                      )}
                    </>
                  ) : null}
                </View>
                {rateTimestampLabel ? (
                  <View style={styles.rateTimestampRow}>
                    <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                    <Text style={[styles.rateTimestampText, { color: colors.textMuted }]}>
                      Rate as of {rateTimestampLabel}
                    </Text>
                    {rateExpiryMs !== null && (
                      <Text style={[styles.rateExpiryText, { color: isRateExpired ? colors.danger : colors.textMuted }]}>
                        {isRateExpired ? ' · Expired' : ` · Valid ${rateExpiryLabel}`}
                      </Text>
                    )}
                    {isRateExpired && (
                      <Pressable
                        hitSlop={8}
                        onPress={() => void refreshRates()}
                        accessibilityRole="button"
                        accessibilityLabel="Refresh exchange rate"
                      >
                        <Text style={[styles.rateExpiryText, { color: colors.brand }]}> · Refresh</Text>
                      </Pressable>
                    )}
                  </View>
                ) : null}
              </View>
            )}
          </>
        )}

        {/* ================================================================ */}
        {/* STEP 2: REVIEW                                                    */}
        {/* ================================================================ */}
        {step === 'review' && quote && (
          <View style={styles.reviewBlock}>
              <Text style={[styles.reviewTitle, { color: colors.textPrimary }]}>
                Conversion summary
              </Text>

              {renderSummaryRow('You convert', `${formatIzeAmount(izeValue, 2)} · ${formatUsd(usdEquivalent)}`, { emphasis: true })}
              {renderSummaryRow(
                'Principal',
                formatFromFiat(quote.principalAmount, 'GBP', { displayMode: 'fiat' })
              )}
              {renderSummaryRow(
                `Platform fee (${quote.feeBps} bps)`,
                `−${formatFromFiat(quote.feeAmount, 'GBP', { displayMode: 'fiat' })}`
              )}
              {renderSummaryRow(
                'You receive',
                formatFromFiat(quote.netFiatAmount, 'GBP', { displayMode: 'fiat' }),
                { total: true }
              )}

              <Text style={[styles.reviewHint, { color: colors.textMuted }]}>
                1ZE is burned at par (1 1ZE = $1.00 USD) and converted to {currencyCode} at the
                prevailing rate. The fee is a transparent line item — you see exactly what you pay.
              </Text>
              {rateTimestampLabel ? (
                <View style={styles.rateTimestampRow}>
                  <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                  <Text style={[styles.rateTimestampText, { color: colors.textMuted }]}>
                    Reference rate as of {rateTimestampLabel}
                  </Text>
                  {rateExpiryMs !== null && (
                    <Text style={[styles.rateExpiryText, { color: isRateExpired ? colors.danger : colors.textMuted }]}>
                      {isRateExpired ? ' · Expired' : ` · Valid ${rateExpiryLabel}`}
                    </Text>
                  )}
                  {isRateExpired && (
                    <Pressable
                      hitSlop={8}
                      onPress={() => void refreshRates()}
                      accessibilityRole="button"
                      accessibilityLabel="Refresh exchange rate"
                    >
                      <Text style={[styles.rateExpiryText, { color: colors.brand }]}> · Refresh</Text>
                    </Pressable>
                  )}
                </View>
              ) : null}
            </View>
        )}

        {/* ================================================================ */}
        {/* STEP 3: AUTHENTICATING                                            */}
        {/* ================================================================ */}
        {step === 'authenticating' && (
          <View
            style={styles.centeredStep}
          >
            <Ionicons name="lock-closed-outline" size={48} color={colors.textPrimary} style={styles.stepIcon} />
            <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>
              Authenticate to continue
            </Text>
            <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
              {biometricGate.isAuthenticating
                ? 'Waiting for biometric verification…'
                : biometricGate.error
                  ? biometricGate.error
                  : 'Verify with Face ID, Touch ID, or fingerprint to authorise this conversion.'}
            </Text>
            {!biometricGate.isAuthenticating && (
              <View style={styles.authActions}>
                <AppButton
                  title="Authenticate"
                  onPress={handleRetryAuth}
                  variant="primary"
                  style={styles.authActionBtn}
                  accessibilityLabel="Retry biometric authentication"
                  accessibilityHint="Triggers the biometric prompt again"
                />
                <AppButton
                  title="Cancel"
                  onPress={handleCancelAuth}
                  variant="secondary"
                  style={styles.authActionBtn}
                  accessibilityLabel="Cancel authentication"
                  accessibilityHint="Returns to the review step"
                />
              </View>
            )}
            {biometricGate.isAuthenticating && (
              <ActivityIndicator
                color={colors.textMuted}
                style={{ marginTop: Space.lg }}
              />
            )}
          </View>
        )}

        {/* ================================================================ */}
        {/* STEP 4: EXECUTING                                                 */}
        {/* ================================================================ */}
        {step === 'executing' && (
          <View
            style={styles.centeredStep}
          >
            <Ionicons name="swap-horizontal" size={48} color={colors.brand} style={styles.stepIcon} />
            <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>
              Converting 1ZE…
            </Text>
            <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
              Burning {formatIzeAmount(izeValue)} and crediting your {currencyCode} balance.
            </Text>
            <ActivityIndicator
              color={colors.brand}
              size="large"
              style={{ marginTop: Space.lg }}
            />
          </View>
        )}

        {/* ================================================================ */}
        {/* STEP 5: RECEIPT                                                   */}
        {/* ================================================================ */}
        {step === 'receipt' && result && (
          <View>
            <View style={styles.receiptWrap}>
              <Ionicons name="checkmark-circle" size={56} color={colors.success} style={styles.stepIcon} />
              <Text style={[styles.receiptTitle, { color: colors.textPrimary }]}>
                Conversion complete
              </Text>
              <Text style={[styles.receiptSubtitle, { color: colors.textSecondary }]}>
                Converted {formatIzeAmount(result.izeAmount, 2)} to{' '}
                {formatFromFiat(result.netRedemption, result.fiatCurrency as any, {
                  displayMode: 'fiat' })}
              </Text>

              <View style={styles.receiptBlock}>
                {renderSummaryRow('Converted', `${formatIzeAmount(result.izeAmount, 2)} · ${formatUsd(izeToUsd(result.izeAmount))}`)}
                {renderSummaryRow(
                  'Principal',
                  formatFromFiat(result.principalAmount, result.fiatCurrency as any, {
                    displayMode: 'fiat' })
                )}
                {renderSummaryRow(
                  `Platform fee (${result.feeBps} bps)`,
                  `−${formatFromFiat(result.feeAmount, result.fiatCurrency as any, {
                    displayMode: 'fiat' })}`
                )}
                {renderSummaryRow(
                  'You received',
                  formatFromFiat(result.netRedemption, result.fiatCurrency as any, {
                    displayMode: 'fiat' })
                )}
                {renderSummaryRow(
                  'Currency',
                  result.fiatCurrency
                )}
                {renderSummaryRow(
                  'Timestamp',
                  new Date(result.timestamp).toLocaleString('en-GB', {
                    dateStyle: 'medium',
                    timeStyle: 'short' }),
                  { total: true }
                )}
              </View>
            </View>
          </View>
        )}

        {/* ================================================================ */}
        {/* ERROR STATE                                                       */}
        {/* ================================================================ */}
        {step === 'error' && (
          <View
            style={styles.centeredStep}
          >
            <Ionicons name="close-circle-outline" size={56} color={colors.danger} style={styles.stepIcon} />
            <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>
              Conversion failed
            </Text>
            <Text
              style={[styles.stepSubtitle, { color: colors.textSecondary }]}
              numberOfLines={4}
            >
              {errorMessage}
            </Text>
            <View style={styles.authActions}>
              <AppButton
                title="Try again"
                onPress={handleTryAgain}
                variant="primary"
                style={styles.authActionBtn}
                accessibilityLabel="Try the conversion again"
                accessibilityHint="Returns to the review step"
              />
              <AppButton
                title="Cancel"
                onPress={handleCancelError}
                variant="secondary"
                style={styles.authActionBtn}
                accessibilityLabel="Cancel and go back"
                accessibilityHint="Returns to the amount step"
              />
            </View>
          </View>
        )}
      </KeyboardAwareScrollView>
    </FlagshipScreen>
  );
}

// -- Styles --
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    skeletonContainer: {
      paddingHorizontal: Space.md + Space.xs,
      paddingTop: Space.md },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      height: Space.xl + Space.xl + 8,
      borderBottomWidth: Stroke.standard,
      borderBottomColor: colors.border },
    backBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'flex-start' },
    headerTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      color: colors.textPrimary },

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

    // -- Step indicator --
    stepIndicatorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md + Space.xs,
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    stepItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs },
    stepDot: {
      width: 22,
      height: 22,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      alignItems: 'center',
      justifyContent: 'center' },
    stepDotText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: LetterSpacing.wide },
    stepLabel: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    stepConnector: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      marginHorizontal: Space.xs },

    content: {
      flex: 1,
      paddingHorizontal: Space.md + Space.xs },

    // -- Hero balance (flat, no card or decorative icon circle) --
    balanceBlock: {
      marginTop: Space.md,
      marginBottom: Space.lg,
      paddingHorizontal: Space.xs },
    heroTitle: {
      fontSize: TypographyV2.priceHero.size,
      lineHeight: TypographyV2.priceHero.lineHeight,
      fontFamily: TypographyV2.priceHero.fontFamily,
      letterSpacing: TypographyV2.priceHero.letterSpacing,
      fontVariant: ['tabular-nums'] },
    heroSubtitle: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      marginTop: Space.xs / 2 },

    // -- Amount input --
    amountWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: Space.xl + Space.xl - 8,
      marginBottom: Space.sm + Space.xs },
    amountSuffix: {
      fontSize: TypographyV2.priceHero.size + 12,
      fontFamily: TypographyV2.priceHero.fontFamily,
      color: colors.textMuted,
      marginRight: Space.sm,
      letterSpacing: LetterSpacing.wide },
    amountInput: {
      fontSize: TypographyV2.priceHero.size + 28,
      fontFamily: TypographyV2.priceHero.fontFamily,
      color: colors.textPrimary,
      minWidth: Space.xxl * 3 + Space.xs + 2,
      fontVariant: ['tabular-nums'] },
    availableText: {
      textAlign: 'center',
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textSecondary,
      marginBottom: Space.sm,
      fontVariant: ['tabular-nums'] },
    balanceError: {
      textAlign: 'center',
      marginTop: Space.xs,
      marginBottom: Space.md + 4,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.danger },

    // -- Calculation / summary (flat, no card wrapper) --
    calcBlock: {
      marginTop: Space.sm,
      paddingHorizontal: Space.xs },
    quoteLoadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs },
    quoteErrorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs },
    quoteStatusText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    reviewBlock: {
      marginTop: Space.md,
      gap: Space.xs,
      paddingHorizontal: Space.xs },
    reviewTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing },
    reviewHint: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight + 2,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      marginTop: Space.sm + Space.xs },
    rateTimestampRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginTop: Space.sm },
    rateTimestampText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    rateExpiryText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      fontVariant: ['tabular-nums'] },

    // -- Summary rows --
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Space.xs },
    summaryLabel: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    summaryValue: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      fontVariant: ['tabular-nums'] },

    // -- Centered step (auth / executing / error) --
    centeredStep: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.lg,
      paddingTop: Space.xxl },
    stepIcon: {
      marginBottom: Space.md },
    stepTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      textAlign: 'center',
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      marginBottom: Space.xs },
    stepSubtitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      textAlign: 'center',
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight,
      marginBottom: Space.lg,
      maxWidth: 320 },
    authActions: {
      flexDirection: 'column',
      gap: Space.sm,
      width: 280,
      maxWidth: '100%' },
    authActionBtn: {
      width: '100%' },

    // -- Receipt --
    receiptWrap: {
      alignItems: 'center',
      paddingTop: Space.xl,
      paddingHorizontal: Space.md },
    receiptBlock: {
      width: '100%',
      paddingHorizontal: Space.xs },
    receiptTitle: {
      fontSize: TypographyV2.screenTitle.size,
      lineHeight: TypographyV2.screenTitle.lineHeight,
      fontFamily: TypographyV2.screenTitle.fontFamily,
      letterSpacing: TypographyV2.screenTitle.letterSpacing,
      textAlign: 'center',
      marginBottom: Space.xs },
    receiptSubtitle: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: Space.lg,
      maxWidth: 320 },
    footer: {
      paddingVertical: Space.md + 4,
      paddingHorizontal: Space.md + Space.xs,
      borderTopWidth: Stroke.standard,
      borderTopColor: colors.border,
      backgroundColor: colors.background },
    primaryBtn: {
      backgroundColor: colors.textPrimary,
      height: Space.xl + Space.xl + 8,
      borderRadius: Space.lg + 4,
      alignItems: 'center',
      justifyContent: 'center' },
    primaryBtnDisabled: { opacity: 0.45 },
    primaryText: {
      color: colors.background,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      fontVariant: ['tabular-nums'] },
    secondaryBtn: {
      height: Space.xl + 8,
      borderRadius: Space.lg + 4,
      alignItems: 'center',
      justifyContent: 'center' } });
}
