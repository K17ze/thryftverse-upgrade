import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  StatusBar,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';

import { AppButton } from '../components/ui/AppButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';

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
import { getIzePosition, convertIzeToFiat } from '../services/walletApi';
import { convertGbpToDisplayAmount, sanitizeDecimalInput } from '../utils/currencyAuthoringFlows';
import { formatIzeAmount } from '../utils/currency';
import { CURRENCIES } from '../constants/currencies';
import { COPY } from '../constants/copy';

import {
  Typography,
  Space,
  Radius,
  Type,
  Stroke,
  Elevation,
  Control,
  LetterSpacing,
} from '../theme/designTokens';

// ── Platform fee rate for 1ZE → fiat conversion (2%) ──
const CONVERT_FEE_RATE = 0.02;

type ConvertStep = 'amount' | 'review' | 'authenticating' | 'executing' | 'receipt' | 'error';

interface ConversionResult {
  izeAmount: number;
  fiatAmount: number;
  fiatCurrency: string;
  timestamp: string;
}

export default function WalletConvertScreen() {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const { show } = useToast();
  const { isOffline } = useConnectivity();
  const reducedMotionEnabled = useReducedMotion();
  const currentUser = useStore((state) => state.currentUser);
  const { currencyCode, goldRates } = useCurrencyContext();
  const { formatFromFiat } = useFormattedPrice();
  const biometricGate = useBiometricGate();

  const currencySymbol = CURRENCIES[currencyCode].symbol;

  // ── State ──
  const [step, setStep] = useState<ConvertStep>('amount');
  const [amount, setAmount] = useState('');
  const [availableIze, setAvailableIze] = useState(0);
  const [isHydratingBalance, setIsHydratingBalance] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // ── Balance hydration (available 1ZE) ──
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

  // ── Derived conversion values ──
  const izeValue = Number(amount || '0');
  const grossFiat = convertGbpToDisplayAmount(izeValue, currencyCode, goldRates);
  const platformFee = grossFiat * CONVERT_FEE_RATE;
  const netFiat = Math.max(0, grossFiat - platformFee);
  const feeRateLabel = `${Math.round(CONVERT_FEE_RATE * 100)}%`;
  const exceedsBalance = izeValue > availableIze;
  const isWalletOperational = !isOffline;

  const canReview =
    Number.isFinite(izeValue) &&
    izeValue > 0 &&
    !exceedsBalance &&
    !isExecuting &&
    isWalletOperational;

  // ── Step transitions ──
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
      const response = await convertIzeToFiat({
        userId: currentUser.id,
        izeAmount: izeValue,
        fiatCurrency: currencyCode,
      });

      const conversion = response.conversion;
      const nextAvailable = Math.max(0, availableIze - conversion.izeAmount);
      setAvailableIze(nextAvailable);

      setResult({
        izeAmount: conversion.izeAmount,
        fiatAmount: conversion.fiatAmount,
        fiatCurrency: conversion.fiatCurrency,
        timestamp: new Date().toISOString(),
      });

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

  // ── Step indicator ──
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
                    borderColor: isComplete || isActive ? colors.brand : colors.border,
                  },
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
                      : Typography.family.regular,
                  },
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
                    backgroundColor: index < activeStepIndex ? colors.brand : colors.border,
                  },
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
          paddingTop: Space.xs,
        },
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

  // ── Loading skeleton ──
  if (isHydratingBalance) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar
          barStyle={!isDark ? 'dark-content' : 'light-content'}
          backgroundColor={colors.background}
        />
        <View style={styles.header}>
          <AnimatedPressable
            style={styles.backBtn}
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityHint="Returns to the previous screen"
          >
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Convert 1ZE</Text>
          <View style={{ width: 44 }} />
        </View>
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
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={!isDark ? 'dark-content' : 'light-content'}
        backgroundColor={colors.background}
      />

      {/* ── Header ── */}
      <View style={styles.header}>
        <AnimatedPressable
          style={styles.backBtn}
          onPress={handleBack}
          disabled={isExecuting}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the previous screen"
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={isExecuting ? colors.textMuted : colors.textPrimary}
          />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Convert 1ZE</Text>
        <View style={{ width: 44 }} />
      </View>

      {isOffline && step === 'amount' && (
        <View
          style={[
            styles.offlineBanner,
            { backgroundColor: `${colors.danger}14`, borderBottomColor: colors.border },
          ]}
        >
          <Ionicons name="cloud-offline-outline" size={16} color={colors.danger} />
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
        {/* ════════════════════════════════════════════════════════════════ */}
        {/* STEP 1: AMOUNT                                                    */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {step === 'amount' && (
          <>
            {/* Hero summary — available 1ZE balance */}
            <Reanimated.View
              entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}
            >
              <View
                style={[
                  styles.heroCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={styles.heroRow}>
                  <View style={[styles.heroIcon, { backgroundColor: colors.brand }]}>
                    <Ionicons name="swap-horizontal" size={18} color={colors.textInverse} />
                  </View>
                  <View style={styles.heroText}>
                    <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                      {formatIzeAmount(availableIze)}
                    </Text>
                    <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                      Available 1ZE to convert
                    </Text>
                  </View>
                </View>
              </View>
            </Reanimated.View>

            {/* Amount input */}
            <Reanimated.View
              entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(30)}
            >
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
                Available: {formatIzeAmount(availableIze)}
              </Text>
              {exceedsBalance ? (
                <Text style={styles.balanceError}>
                  Entered amount exceeds available 1ZE balance.
                </Text>
              ) : null}
            </Reanimated.View>

            {/* Live calculation summary */}
            {izeValue > 0 && !exceedsBalance && (
              <Reanimated.View
                entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(80)}
              >
                <View
                  style={[
                    styles.calcCard,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  {renderSummaryRow(
                    `Gross ${currencyCode}`,
                    formatFromFiat(grossFiat, currencyCode, { displayMode: 'fiat' })
                  )}
                  {renderSummaryRow(
                    `Platform fee (${feeRateLabel})`,
                    formatFromFiat(platformFee, currencyCode, { displayMode: 'fiat' })
                  )}
                  {renderSummaryRow(
                    'Net fiat credited',
                    formatFromFiat(netFiat, currencyCode, { displayMode: 'fiat' }),
                    { total: true }
                  )}
                </View>
              </Reanimated.View>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* STEP 2: REVIEW                                                    */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {step === 'review' && (
          <Reanimated.View
            entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}
          >
            <View
              style={[
                styles.reviewCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.reviewHeader}>
                <Ionicons name="swap-horizontal" size={20} color={colors.brand} />
                <Text style={[styles.reviewTitle, { color: colors.textPrimary }]}>
                  Conversion summary
                </Text>
              </View>

              {renderSummaryRow('Converting', formatIzeAmount(izeValue), { emphasis: true })}
              {renderSummaryRow(
                `To ${currencyCode}`,
                formatFromFiat(grossFiat, currencyCode, { displayMode: 'fiat' })
              )}
              {renderSummaryRow(
                `Platform fee (${feeRateLabel})`,
                formatFromFiat(platformFee, currencyCode, { displayMode: 'fiat' })
              )}
              {renderSummaryRow(
                'Net credit',
                formatFromFiat(netFiat, currencyCode, { displayMode: 'fiat' }),
                { total: true }
              )}

              <Text style={[styles.reviewHint, { color: colors.textMuted }]}>
                The net amount will be credited to your {currencyCode} wallet balance. 1ZE is
                burned at the prevailing reference rate at settlement time.
              </Text>
            </View>
          </Reanimated.View>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* STEP 3: AUTHENTICATING                                            */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {step === 'authenticating' && (
          <Reanimated.View
            entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}
            style={styles.centeredStep}
          >
            <View style={[styles.authIconCircle, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="lock-closed-outline" size={32} color={colors.textPrimary} />
            </View>
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
          </Reanimated.View>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* STEP 4: EXECUTING                                                 */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {step === 'executing' && (
          <Reanimated.View
            entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}
            style={styles.centeredStep}
          >
            <View style={[styles.authIconCircle, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="swap-horizontal" size={32} color={colors.brand} />
            </View>
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
          </Reanimated.View>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* STEP 5: RECEIPT                                                   */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {step === 'receipt' && result && (
          <Reanimated.View
            entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}
          >
            <View style={styles.receiptWrap}>
              <View style={[styles.successIconCircle, { backgroundColor: `${colors.success}22` }]}>
                <Ionicons name="checkmark-circle" size={40} color={colors.success} />
              </View>
              <Text style={[styles.receiptTitle, { color: colors.textPrimary }]}>
                Conversion complete
              </Text>
              <Text style={[styles.receiptSubtitle, { color: colors.textSecondary }]}>
                Converted {formatIzeAmount(result.izeAmount)} to{' '}
                {formatFromFiat(result.fiatAmount, result.fiatCurrency as any, {
                  displayMode: 'fiat',
                })}
              </Text>

              <View
                style={[
                  styles.receiptCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                {renderSummaryRow('Converted', formatIzeAmount(result.izeAmount))}
                {renderSummaryRow(
                  'Credited',
                  formatFromFiat(result.fiatAmount, result.fiatCurrency as any, {
                    displayMode: 'fiat',
                  })
                )}
                {renderSummaryRow(
                  'Currency',
                  result.fiatCurrency
                )}
                {renderSummaryRow(
                  'Timestamp',
                  new Date(result.timestamp).toLocaleString('en-GB', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                  { total: true }
                )}
              </View>
            </View>
          </Reanimated.View>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* ERROR STATE                                                       */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {step === 'error' && (
          <Reanimated.View
            entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}
            style={styles.centeredStep}
          >
            <View style={[styles.errorIconCircle, { backgroundColor: `${colors.danger}18` }]}>
              <Ionicons name="close-circle-outline" size={40} color={colors.danger} />
            </View>
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
          </Reanimated.View>
        )}
      </KeyboardAwareScrollView>

      {/* ── Footer actions per step ── */}
      {step === 'amount' && (
        <View style={styles.footer}>
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
        </View>
      )}

      {step === 'review' && (
        <View style={styles.footer}>
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
        </View>
      )}

      {step === 'receipt' && (
        <View style={styles.footer}>
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
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ──
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    skeletonContainer: {
      paddingHorizontal: Space.md + Space.xs,
      paddingTop: Space.md,
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      height: Space.xl + Space.xl + 8,
      borderBottomWidth: Stroke.standard,
      borderBottomColor: colors.border,
    },
    backBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'flex-start',
    },
    headerTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },

    offlineBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderBottomWidth: Stroke.standard,
    },
    offlineBannerText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.caption.lineHeight,
    },

    // ── Step indicator ──
    stepIndicatorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md + Space.xs,
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    stepItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    stepDot: {
      width: 22,
      height: 22,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepDotText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: LetterSpacing.wide,
    },
    stepLabel: {
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
    },
    stepConnector: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      marginHorizontal: Space.xs,
    },

    content: {
      flex: 1,
      paddingHorizontal: Space.md + Space.xs,
    },

    // ── Hero card ──
    heroCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
      marginTop: Space.md,
      marginBottom: Space.lg,
      ...Elevation.subtle,
    },
    heroRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
    heroIcon: {
      width: Space.xl + Space.sm,
      height: Space.xl + Space.sm,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroText: { flex: 1 },
    heroTitle: {
      fontSize: Type.priceLarge.size,
      lineHeight: Type.priceLarge.lineHeight,
      fontFamily: Typography.family.bold,
      letterSpacing: Type.priceLarge.letterSpacing,
      fontVariant: ['tabular-nums'],
    },
    heroSubtitle: {
      fontSize: Type.captionElevated.size,
      lineHeight: Type.captionElevated.lineHeight,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.captionElevated.letterSpacing,
      marginTop: Space.xs / 2,
    },

    // ── Amount input ──
    amountWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: Space.xl + Space.xl - 8,
      marginBottom: Space.sm + Space.xs,
    },
    amountSuffix: {
      fontSize: Type.priceLarge.size + 12,
      fontFamily: Typography.family.bold,
      color: colors.textMuted,
      marginRight: Space.sm,
      letterSpacing: LetterSpacing.wide,
    },
    amountInput: {
      fontSize: Type.priceLarge.size + 28,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      minWidth: Space.xxl * 3 + Space.xs + 2,
      fontVariant: ['tabular-nums'],
    },
    availableText: {
      textAlign: 'center',
      fontSize: Type.captionElevated.size,
      lineHeight: Type.captionElevated.lineHeight,
      fontFamily: Typography.family.medium,
      letterSpacing: Type.captionElevated.letterSpacing,
      color: colors.textSecondary,
      marginBottom: Space.sm,
      fontVariant: ['tabular-nums'],
    },
    balanceError: {
      textAlign: 'center',
      marginTop: Space.xs,
      marginBottom: Space.md + 4,
      fontSize: Type.captionElevated.size,
      lineHeight: Type.captionElevated.lineHeight,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.captionElevated.letterSpacing,
      color: colors.danger,
    },

    // ── Calculation / summary card ──
    calcCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
      marginTop: Space.sm,
    },
    reviewCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
      marginTop: Space.md,
      gap: Space.xs,
      ...Elevation.subtle,
    },
    reviewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginBottom: Space.sm,
    },
    reviewTitle: {
      fontSize: Type.bodyEmphasis.size,
      lineHeight: Type.bodyEmphasis.lineHeight,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.bodyEmphasis.letterSpacing,
    },
    reviewHint: {
      fontSize: Type.captionElevated.size,
      lineHeight: Type.captionElevated.lineHeight + 2,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.captionElevated.letterSpacing,
      marginTop: Space.sm + Space.xs,
    },

    // ── Summary rows ──
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Space.xs,
    },
    summaryLabel: {
      fontSize: Type.captionElevated.size,
      lineHeight: Type.captionElevated.lineHeight,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.captionElevated.letterSpacing,
    },
    summaryValue: {
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      fontFamily: Typography.family.medium,
      letterSpacing: Type.body.letterSpacing,
      fontVariant: ['tabular-nums'],
    },

    // ── Centered step (auth / executing / error) ──
    centeredStep: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.lg,
      paddingTop: Space.xxl,
    },
    authIconCircle: {
      width: 72,
      height: 72,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Space.md,
    },
    stepTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
      textAlign: 'center',
      letterSpacing: Type.subtitle.letterSpacing,
      lineHeight: Type.subtitle.lineHeight,
      marginBottom: Space.xs,
    },
    stepSubtitle: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      textAlign: 'center',
      letterSpacing: Type.body.letterSpacing,
      lineHeight: Type.body.lineHeight,
      marginBottom: Space.lg,
      maxWidth: 320,
    },
    authActions: {
      flexDirection: 'column',
      gap: Space.sm,
      width: 280,
      maxWidth: '100%',
    },
    authActionBtn: {
      width: '100%',
    },

    // ── Receipt ──
    receiptWrap: {
      alignItems: 'center',
      paddingTop: Space.xl,
      paddingHorizontal: Space.md,
    },
    successIconCircle: {
      width: 80,
      height: 80,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Space.md,
    },
    errorIconCircle: {
      width: 80,
      height: 80,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Space.md,
    },
    receiptTitle: {
      fontSize: Type.title.size,
      lineHeight: Type.title.lineHeight,
      fontFamily: Typography.family.bold,
      letterSpacing: Type.title.letterSpacing,
      textAlign: 'center',
      marginBottom: Space.xs,
    },
    receiptSubtitle: {
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.body.letterSpacing,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: Space.lg,
      maxWidth: 320,
    },
    receiptCard: {
      width: '100%',
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
      ...Elevation.subtle,
    },

    // ── Footer ──
    footer: {
      paddingVertical: Space.md + 4,
      paddingHorizontal: Space.md + Space.xs,
      borderTopWidth: Stroke.standard,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    primaryBtn: {
      backgroundColor: colors.textPrimary,
      height: Space.xl + Space.xl + 8,
      borderRadius: Space.lg + 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnDisabled: { opacity: 0.45 },
    primaryText: {
      color: colors.background,
      fontSize: Type.bodyLarge.size,
      fontFamily: Typography.family.bold,
      fontVariant: ['tabular-nums'],
    },
    secondaryBtn: {
      height: Space.xl + 8,
      borderRadius: Space.lg + 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
