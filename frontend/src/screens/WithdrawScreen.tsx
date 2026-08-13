import React, { useEffect, useMemo, useState } from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { View,
  Text,
  StyleSheet,
  TextInput,
  StatusBar
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useCurrencyContext } from '../context/CurrencyContext';
import { CURRENCIES } from '../constants/currencies';
import { COPY } from '../constants/copy';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { parseApiError } from '../lib/apiClient';
import {
  createPayoutAccount,
  createPayoutRequest,
  createStripeConnectAccount,
  createStripeConnectOnboardingLink,
  getStripeConnectStatus,
  getIzeFxQuote,
  listPayoutAccounts,
  getWalletSnapshot,
  PayoutAccountPayload,
} from '../services/walletApi';
import { getUserCountryCapabilities, UserCountryCapabilities } from '../services/capabilitiesApi';
import { Typography, Space, Radius, Elevation, Type, Stroke, Control, LetterSpacing } from '../theme/designTokens';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import {
  convertDisplayToGbpAmount,
  getDefaultWithdrawDisplayAmount,
  sanitizeDecimalInput,
} from '../utils/currencyAuthoringFlows';
import {
  formatCountryPolicyScope,
  formatPayoutPolicyHint,
  isPaymentMethodAllowed,
} from '../utils/capabilityPolicy';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useBiometricGate } from '../hooks/useBiometricGate';
import { BiometricGatePrompt } from '../components/security/BiometricGate';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { useHaptic } from '../hooks/useHaptic';

export default function WithdrawScreen() {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [amount, setAmount] = useState('');
  const [availableBalance, setAvailableBalance] = useState(0);
  const [isHydratingBalance, setIsHydratingBalance] = useState(true);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isConnectingPayout, setIsConnectingPayout] = useState(false);
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccountPayload | null>(null);
  const [countryCapabilities, setCountryCapabilities] = useState<UserCountryCapabilities | null>(null);
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, goldRates } = useCurrencyContext();
  const { show } = useToast();
  const { isOffline } = useConnectivity();
  const reducedMotionEnabled = useReducedMotion();
  const haptic = useHaptic();
  const currentUser = useStore((state) => state.currentUser);
  const currencySymbol = CURRENCIES[currencyCode].symbol;

  // ── Biometric gate (OWASP M5) ──
  // Withdrawals move money out of the wallet. Require biometric re-authentication
  // before showing the withdrawal form. Falls through when biometric is unavailable.
  const biometricGate = useBiometricGate();

  useEffect(() => {
    const displayAmount = getDefaultWithdrawDisplayAmount(availableBalance, currencyCode, goldRates);
    setAmount(displayAmount.toFixed(2));
  }, [availableBalance, currencyCode, goldRates]);

  useEffect(() => {
    let isCancelled = false;

    const hydrateBalance = async () => {
      if (!currentUser?.id) {
        setIsHydratingBalance(false);
        return;
      }
      setIsHydratingBalance(true);
      try {
        const snapshot = await getWalletSnapshot(currentUser.id);
        if (!isCancelled) {
          setAvailableBalance(snapshot.snapshot.availableGbp);
        }
      } catch {
        if (!isCancelled) {
          setAvailableBalance(0);
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
  }, [currentUser?.id]);

  useEffect(() => {
    let isCancelled = false;

    const hydrateCapabilities = async () => {
      if (!currentUser?.id) {
        setCountryCapabilities(null);
        return;
      }

      try {
        const capabilities = await getUserCountryCapabilities(currentUser.id);
        if (!isCancelled) {
          setCountryCapabilities(capabilities);
        }
      } catch {
        if (!isCancelled) {
          setCountryCapabilities(null);
        }
      }
    };

    void hydrateCapabilities();

    return () => {
      isCancelled = true;
    };
  }, [currentUser?.id]);

  useEffect(() => {
    let isCancelled = false;

    const hydratePayoutAccount = async () => {
      if (!currentUser?.id) {
        setPayoutAccount(null);
        return;
      }

      try {
        const accounts = await listPayoutAccounts(currentUser.id);
        if (isCancelled) {
          return;
        }

        const activeAccount = accounts.find((account) => account.status === 'active') ?? accounts[0] ?? null;
        setPayoutAccount(activeAccount);
      } catch {
        if (!isCancelled) {
          setPayoutAccount(null);
        }
      }
    };

    void hydratePayoutAccount();

    return () => {
      isCancelled = true;
    };
  }, [currentUser?.id]);

  const numericAmountDisplay = Number(amount) || 0;
  const numericAmount = Number(convertDisplayToGbpAmount(numericAmountDisplay, currencyCode, goldRates).toFixed(2));
  const exceedsBalance = numericAmount > availableBalance;
  const canWithdraw =
    numericAmount > 0
    && !exceedsBalance
    && !isWithdrawing
    && !isConnectingPayout
    && payoutAccount?.status === 'active';
  const allowBankAccounts = isPaymentMethodAllowed(countryCapabilities, 'bank_account');

  const policyScopeLabel = useMemo(
    () => formatCountryPolicyScope(countryCapabilities),
    [countryCapabilities]
  );

  const payoutPolicyHint = useMemo(
    () => formatPayoutPolicyHint(countryCapabilities),
    [countryCapabilities]
  );

  const bankCopy = useMemo(() => {
    if (payoutAccount) {
      const payoutLocation = payoutAccount.countryCode ? ` · ${payoutAccount.countryCode}` : '';
      return {
        name:
          payoutAccount.status === 'active'
            ? 'Connected payout profile'
            : 'Payout verification pending',
        details: `${payoutAccount.gatewayId} · ${payoutAccount.currency}${payoutLocation}`,
      };
    }

    if (!allowBankAccounts) {
      return {
        name: 'Bank payouts unavailable in your region',
        details: 'Country policy will route withdrawals through supported payout rails.',
      };
    }

    return {
      name: 'Connect a payout profile',
      details: 'Verify your identity and bank details to enable payouts',
    };
  }, [allowBankAccounts, payoutAccount]);

  const ensureCapabilities = async (): Promise<UserCountryCapabilities | null> => {
    if (!currentUser?.id) {
      return null;
    }

    if (countryCapabilities) {
      return countryCapabilities;
    }

    try {
      const fetchedCapabilities = await getUserCountryCapabilities(currentUser.id);
      setCountryCapabilities(fetchedCapabilities);
      return fetchedCapabilities;
    } catch {
      return null;
    }
  };

  const connectOrSyncPayoutAccount = async (
    resolvedCapabilities: UserCountryCapabilities | null
  ): Promise<PayoutAccountPayload> => {
    if (!currentUser?.id) {
      throw new Error('Sign in to connect a payout profile.');
    }

    const gatewayPriority = resolvedCapabilities?.payouts.gatewayPriority ?? ['stripe_americas'];
    if (!gatewayPriority.includes('stripe_americas')) {
      throw new Error('A verified payout provider is not available for your country policy right now.');
    }

    let connectStatus = await getStripeConnectStatus(currentUser.id);
    if (!connectStatus.hasConnectAccount) {
      await createStripeConnectAccount(currentUser.id);
      connectStatus = await getStripeConnectStatus(currentUser.id);
    }

    if (!connectStatus.payoutsEnabled) {
      const { onboardingUrl } = await createStripeConnectOnboardingLink(currentUser.id);
      await WebBrowser.openBrowserAsync(onboardingUrl);
      connectStatus = await getStripeConnectStatus(currentUser.id);
    }

    if (!connectStatus.payoutsEnabled) {
      throw new Error(
        'Payout setup is not complete yet. Finish the required verification steps, then refresh your payout profile.'
      );
    }

    const accounts = await listPayoutAccounts(currentUser.id);
    let activeAccount =
      accounts.find(
        (account) =>
          account.gatewayId === 'stripe_americas'
          && account.status === 'active'
      ) ?? null;

    if (!activeAccount) {
      activeAccount = await createPayoutAccount(currentUser.id, {
        gatewayId: 'stripe_americas',
        currency: 'GBP',
        countryCode:
          resolvedCapabilities?.effectiveCountryCode
          ?? resolvedCapabilities?.countryCode
          ?? 'GB',
        metadata: {
          source: 'withdraw_screen_stripe_connect_sync',
          capabilityPolicyVersion: resolvedCapabilities?.policyVersion ?? null,
        },
      });
    }

    if (activeAccount.status !== 'active') {
      throw new Error('Payouts are not enabled for this profile yet.');
    }

    setPayoutAccount(activeAccount);
    return activeAccount;
  };

  const ensurePayoutAccount = async (): Promise<{
    account: PayoutAccountPayload;
    capabilities: UserCountryCapabilities | null;
  }> => {
    if (!currentUser?.id) {
      throw new Error('Sign in to withdraw your balance.');
    }

    const resolvedCapabilities = await ensureCapabilities();

    if (payoutAccount && payoutAccount.status === 'active') {
      return {
        account: payoutAccount,
        capabilities: resolvedCapabilities,
      };
    }

    const existingAccounts = await listPayoutAccounts(currentUser.id);
    const activeAccount =
      existingAccounts.find((account) => account.status === 'active') ?? null;

    if (activeAccount) {
      setPayoutAccount(activeAccount);
      return {
        account: activeAccount,
        capabilities: resolvedCapabilities,
      };
    }

    const createdAccount = await connectOrSyncPayoutAccount(resolvedCapabilities);
    return {
      account: createdAccount,
      capabilities: resolvedCapabilities,
    };
  };

  const handleConnectPayout = async () => {
    if (!currentUser?.id || isConnectingPayout) {
      return;
    }

    setIsConnectingPayout(true);
    try {
      const capabilities = await ensureCapabilities();
      await connectOrSyncPayoutAccount(capabilities);
      show('Your verified payout profile is ready.', 'success');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to connect your payout profile right now.');
      show(parsed.message, 'error');
    } finally {
      setIsConnectingPayout(false);
    }
  };

  const handleWithdraw = async () => {
    if (!canWithdraw) {
      return;
    }

    if (!currentUser?.id) {
      show('Sign in to withdraw your balance.', 'error');
      navigation.navigate('AuthLanding');
      return;
    }

    haptic.patterns.save();
    setIsWithdrawing(true);
    try {
      const { account: payoutProfile, capabilities: activeCapabilities } = await ensurePayoutAccount();
      const amountGbp = Number(numericAmount.toFixed(2));

      if (!Number.isFinite(amountGbp) || amountGbp <= 0) {
        throw new Error('Enter a valid withdrawal amount.');
      }

      const payoutCurrency = payoutProfile.currency.toUpperCase();

      if (
        activeCapabilities
        && !activeCapabilities.payouts.supportedCurrencies?.includes(payoutCurrency)
      ) {
        throw new Error(
          `Payout currency ${payoutCurrency} is unavailable for your country policy. Update your payout account.`
        );
      }

      let payoutAmount = amountGbp;

      if (payoutCurrency !== 'GBP') {
        const fxQuote = await getIzeFxQuote({
          fromCurrency: 'GBP',
          toCurrency: payoutCurrency,
          amount: amountGbp,
        });

        payoutAmount = Number(fxQuote.quote.convertedAmount.toFixed(2));
      }

      if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
        throw new Error('Unable to resolve payout conversion right now.');
      }

      const payoutRequestInput =
        payoutCurrency === 'GBP'
          ? {
              payoutAccountId: payoutProfile.id,
              amountGbp,
              amountCurrency: 'GBP',
              idempotencyKey: `payout_${currentUser.id}_${Date.now()}`,
              metadata: {
                source: 'withdraw_screen_request',
                enteredDisplayAmount: numericAmountDisplay,
                enteredDisplayCurrency: currencyCode,
                payoutMode: 'sale_proceeds_only',
              },
            }
          : {
              payoutAccountId: payoutProfile.id,
              amount: payoutAmount,
              amountCurrency: payoutCurrency,
              idempotencyKey: `payout_${currentUser.id}_${Date.now()}`,
              metadata: {
                source: 'withdraw_screen_request',
                enteredDisplayAmount: numericAmountDisplay,
                enteredDisplayCurrency: currencyCode,
                payoutMode: 'sale_proceeds_only',
              },
            };

      await createPayoutRequest(currentUser.id, payoutRequestInput);

      const nextBalance = Number(Math.max(0, availableBalance - amountGbp).toFixed(2));
      setAvailableBalance(nextBalance);
      setAmount(getDefaultWithdrawDisplayAmount(nextBalance, currencyCode, goldRates).toFixed(2));

      show(
        `Withdrawal requested: ${formatFromFiat(amountGbp, 'GBP', { displayMode: 'fiat' })} from your available sale proceeds.`,
        'success'
      );
      navigation.goBack();
    } catch (error) {
      const isNetworkError = isOffline || (error instanceof Error && /network|fetch|timeout/i.test(error.message));
      const parsed = parseApiError(error, isNetworkError ? 'You appear to be offline. Check your connection and try again.' : 'Unable to submit withdrawal right now.');
      show(parsed.message, 'error');
    } finally {
      setIsWithdrawing(false);
    }
  };

  // Auto-prompt biometric once availability is confirmed.
  useEffect(() => {
    if (biometricGate.status === 'locked' && !biometricGate.isAuthenticating) {
      void biometricGate.authenticate('Authenticate to withdraw funds');
    }
  }, [biometricGate.status, biometricGate.isAuthenticating, biometricGate.authenticate]);

  // ── Biometric gate: block the withdrawal form until authenticated ──
  if (biometricGate.status === 'pending' || biometricGate.status === 'locked') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <View style={styles.header}>
          <AnimatedPressable
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityHint="Returns to the previous screen"
          >
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Withdraw Balance</Text>
          <View style={{ width: 44 }} />
        </View>
        <BiometricGatePrompt
          gate={biometricGate}
          reason="Authenticate to withdraw funds"
          onBack={() => navigation.goBack()}
        />
      </SafeAreaView>
    );
  }

  // ── Balance hydration skeleton: shows matching layout while balance loads ──
  // Prevents layout shift and provides immediate visual feedback on first render.
  if (isHydratingBalance) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <View style={styles.header}>
          <AnimatedPressable
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityHint="Returns to the previous screen"
          >
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Withdraw Balance</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.skeletonContainer}>
          <SkeletonLoader width="60%" height={32} borderRadius={Radius.md} style={{ marginBottom: Space.lg }} />
          <SkeletonLoader width="100%" height={80} borderRadius={Radius.lg} style={{ marginBottom: Space.md }} />
          <SkeletonLoader width="100%" height={56} borderRadius={Radius.md} style={{ marginBottom: Space.sm }} />
          <SkeletonLoader width="100%" height={56} borderRadius={Radius.md} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      <View style={styles.header}>
        <AnimatedPressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the previous screen"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Withdraw Balance</Text>
        <View style={{ width: 44 }} />
      </View>

      {isOffline && (
        <View style={[styles.offlineBanner, { backgroundColor: `${colors.danger}14`, borderBottomColor: colors.border }]}>
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
          {/* Hero summary — available balance */}
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
            <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.heroRow}>
                <View style={[styles.heroIcon, { backgroundColor: colors.brand }]}>
                  <Ionicons name="wallet" size={18} color={colors.textInverse} />
                </View>
                <View style={styles.heroText}>
                  <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                    {formatFromFiat(availableBalance, 'GBP', { displayMode: 'fiat' })}
                  </Text>
                  <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                    Available to withdraw
                  </Text>
                </View>
              </View>
            </View>
          </Reanimated.View>

          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(30)}>
            <View style={styles.amountWrap}>
            <Text style={styles.currencySymbol}>{currencySymbol}</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={(value) => { haptic.selection(); setAmount(sanitizeDecimalInput(value)); }}
              onFocus={() => haptic.light()}
              keyboardType="decimal-pad"
              autoFocus
              selectionColor={colors.brand}
              accessibilityLabel="Withdrawal amount"
              accessibilityHint="Enter the amount to withdraw from your available balance"
            />
          </View>
          <Text style={styles.availableText}>Available: {formatFromFiat(availableBalance, 'GBP', { displayMode: 'fiat' })}</Text>
          {policyScopeLabel ? <Text style={styles.policyLabel}>Policy scope: {policyScopeLabel}</Text> : null}
          {payoutPolicyHint ? <Text style={styles.policyHint}>{payoutPolicyHint}</Text> : null}
          {exceedsBalance ? <Text style={styles.balanceError}>Entered amount exceeds available balance.</Text> : null}
          </Reanimated.View>

          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(80)}>
            <Text style={styles.sectionTitle}>Transfer to</Text>
            <AnimatedPressable
              style={styles.bankCard}
              activeOpacity={0.8}
              onPress={handleConnectPayout}
              disabled={!allowBankAccounts || isConnectingPayout}
            accessibilityRole="button"
            accessibilityLabel={
              payoutAccount?.status === 'active'
                ? 'Refresh verified payout profile'
                : 'Connect verified payout profile'
            }
            accessibilityHint="Opens secure payout onboarding when verification is required"
          >
            <View style={styles.bankLeft}>
              <View style={styles.bankIcon}>
                <Ionicons name="business" size={24} color={colors.textPrimary} />
              </View>
              <View>
                <Text style={styles.bankName}>{bankCopy.name}</Text>
                <Text style={styles.bankDetails}>{bankCopy.details}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </AnimatedPressable>

          {allowBankAccounts ? (
            <AnimatedPressable
              style={styles.addBankBtn}
              onPress={handleConnectPayout}
              disabled={isConnectingPayout}
              accessibilityRole="button"
              accessibilityLabel={
                payoutAccount?.status === 'active'
                  ? 'Refresh payout profile'
                  : 'Connect payout profile'
              }
              accessibilityHint="Checks payout verification and opens any required onboarding steps"
            >
              <Ionicons
                name={payoutAccount?.status === 'active' ? 'refresh' : 'open-outline'}
                size={18}
                color={colors.brand}
              />
              <Text style={styles.addBankText}>
                {isConnectingPayout
                  ? 'Checking payout profile…'
                  : payoutAccount?.status === 'active'
                    ? 'Refresh payout profile'
                    : 'Set up payouts'}
              </Text>
            </AnimatedPressable>
          ) : (
            <Text style={styles.railHintText}>Bank account setup is currently disabled for this region policy.</Text>
          )}
          </Reanimated.View>

        <View style={styles.footer}>
          {/* Estimated arrival — clear, prominent disclosure per spec */}
          <View style={[styles.arrivalRow, { borderColor: colors.border }]}>
            <View style={styles.arrivalLeft}>
              <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.arrivalLabel, { color: colors.textSecondary }]}>
                Estimated arrival
              </Text>
            </View>
            <Text style={[styles.arrivalValue, { color: colors.textPrimary }]}>
              3–5 working days
            </Text>
          </View>
          <Text style={styles.feeText}>Withdrawals are processed from completed sale proceeds.</Text>
          <AppButton
            title={
              isWithdrawing
                ? 'Processing...'
                : `Withdraw ${formatFromFiat(numericAmount, 'GBP', { displayMode: 'fiat' })}`
            }
            onPress={handleWithdraw}
            disabled={!canWithdraw}
            variant="primary"
            style={[styles.primaryBtn, !canWithdraw && styles.primaryBtnDisabled]}
            titleStyle={styles.primaryText}
            accessibilityLabel={
              isWithdrawing
                ? 'Processing withdrawal'
                : `Withdraw ${formatFromFiat(numericAmount, 'GBP', { displayMode: 'fiat' })}`
            }
            accessibilityHint="Submits your withdrawal request"
          />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  skeletonContainer: { paddingHorizontal: Space.md + Space.xs, paddingTop: Space.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Space.md, height: Space.xl + Space.xl + 8, borderBottomWidth: Stroke.standard, borderBottomColor: colors.border },
  backBtn: { width: Control.hit, height: Control.hit, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitle: { fontSize: Type.subtitle.size, fontFamily: Typography.family.semibold, color: colors.textPrimary },
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

  heroCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    marginTop: Space.md,
    marginBottom: Space.lg,
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

  content: { flex: 1, paddingHorizontal: Space.md + Space.xs },

  amountWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: Space.xl + Space.xl - 8, marginBottom: Space.sm + Space.xs },
  currencySymbol: { fontSize: Type.priceLarge.size + 16, fontFamily: Typography.family.bold, color: colors.textPrimary, marginRight: Space.sm },
  amountInput: { fontSize: Type.priceLarge.size + 28, fontFamily: Typography.family.bold, color: colors.textPrimary, minWidth: Space.xxl * 3 + Space.xs + 2, fontVariant: ['tabular-nums'] },
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
  policyLabel: {
    textAlign: 'center',
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.captionElevated.letterSpacing,
    color: colors.textMuted,
    marginBottom: Space.xs,
  },
  policyHint: {
    textAlign: 'center',
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.captionElevated.letterSpacing,
    color: colors.textMuted,
    marginBottom: Space.lg + Space.xs,
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
  sectionTitle: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.captionElevated.letterSpacing,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: Space.sm + Space.xs,
  },

  bankCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, padding: Space.md, borderRadius: Radius.lg, marginBottom: Space.smMd, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...Elevation.subtle },
  bankLeft: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  bankIcon: { width: Space.xl + Space.xl - 4, height: Space.xl + Space.xl - 4, borderRadius: Radius.xxl, alignItems: 'center', justifyContent: 'center' },
  bankName: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
    color: colors.textPrimary,
    marginBottom: Space.xs,
  },
  bankDetails: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
    color: colors.textSecondary,
  },

  addBankBtn: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: Space.sm + Space.xs },
  addBankText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.captionElevated.letterSpacing,
    color: colors.brand,
  },
  railHintText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.captionElevated.letterSpacing,
    color: colors.textMuted,
    paddingVertical: Space.sm + Space.xs,
  },

  footer: { paddingVertical: Space.md + 4, borderTopWidth: Stroke.standard, borderTopColor: colors.border, backgroundColor: colors.background },
  // Estimated arrival row — clear disclosure per spec
  arrivalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    marginBottom: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  arrivalLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
  },
  arrivalLabel: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  arrivalValue: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.captionElevated.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  feeText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: Space.md,
  },
  primaryBtn: { backgroundColor: colors.textPrimary, height: Space.xl + Space.xl + 8, borderRadius: Space.lg + 4, alignItems: 'center', justifyContent: 'center' },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryText: { color: colors.background, fontSize: Type.bodyLarge.size, fontFamily: Typography.family.bold, fontVariant: ['tabular-nums'] },
  });
}
