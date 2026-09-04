import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { FlagshipScreen, FlagshipHeader, FlagshipMetricLine, FlagshipNavigationRow, FlagshipFormSection } from '../components/flagship';
import { View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useCurrencyContext } from '../context/CurrencyContext';
import { COPY } from '../constants/copy';
import { useToast } from '../context/ToastContext';
import { useA11yAudit } from '../hooks/useA11yAudit';
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
  listPayoutRequests,
  getWalletSnapshot,
  lookupPayoutByIdempotencyKey,
  PayoutAccountPayload,
  PayoutRequestPayload } from '../services/walletApi';
import { getUserCountryCapabilities, UserCountryCapabilities } from '../services/capabilitiesApi';
import { Space, Radius, Stroke, Control, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import {
  convertDisplayToGbpAmount,
  getDefaultWithdrawDisplayAmount,
  sanitizeDecimalInput } from '../utils/currencyAuthoringFlows';
import {
  formatCountryPolicyScope,
  formatPayoutPolicyHint,
  isPaymentMethodAllowed } from '../utils/capabilityPolicy';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useBiometricGate } from '../hooks/useBiometricGate';
import { BiometricGatePrompt } from '../components/security/BiometricGate';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { useHaptic } from '../hooks/useHaptic';
import { useScreenCaptureProtection } from '../platform/screenCapture';
import { createStableId } from '../utils/createStableId';
import { useUnknownOutcomeReconciliation } from '../hooks/useUnknownOutcomeReconciliation';
import { t } from '../i18n';
import { track } from '../analytics';


type WithdrawStep = 'form' | 'confirm' | 'success' | 'unknown_outcome';

interface WithdrawSuccessData {
  reference: string;
  amountGbp: number;
  payoutCurrency: string;
  createdAt: string;
}

// Honest payout status labeling. The backend distinguishes `processing`
// (Stripe Connect transfer initiated, bank payout not yet confirmed) from
// `paid` (bank terminal evidence confirmed). We must never show "Paid" until
// the bank has confirmed — see AGENTS.md §2 (fix at source of truth) and the
// honest-status upgrade spec.
type PayoutStatus = PayoutRequestPayload['status'];

interface PayoutStatusConfig {
  label: string;
  subtitle: string;
  colorKey: 'warning' | 'success' | 'danger' | 'textMuted';
}

const PAYOUT_STATUS_CONFIG: Record<PayoutStatus, PayoutStatusConfig> = {
  requested: {
    label: t('withdraw.status.pending'),
    subtitle: t('withdraw.status.awaitingReview'),
    colorKey: 'textMuted' },
  processing: {
    label: t('withdraw.status.processing'),
    subtitle: t('withdraw.status.transferInitiated'),
    colorKey: 'warning' },
  paid: {
    label: t('withdraw.status.paid'),
    subtitle: t('withdraw.status.bankConfirmed'),
    colorKey: 'success' },
  failed: {
    label: t('withdraw.status.failed'),
    subtitle: t('withdraw.status.transferCouldNotComplete'),
    colorKey: 'danger' },
  cancelled: {
    label: t('withdraw.status.cancelled'),
    subtitle: '',
    colorKey: 'textMuted' } };

function resolvePayoutStatusConfig(status: PayoutStatus): PayoutStatusConfig {
  return PAYOUT_STATUS_CONFIG[status] ?? PAYOUT_STATUS_CONFIG.requested;
}

type WithdrawalsLoadState = 'idle' | 'loading' | 'loaded' | 'error';

export default function WithdrawScreen() {
  const a11yRef = useRef<any>(null);
  useA11yAudit(a11yRef, 'WithdrawScreen');
  useScreenCaptureProtection();
  const navigation = useNavigation<any>();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [step, setStep] = useState<WithdrawStep>('form');
  const [amount, setAmount] = useState('');
  const [availableBalance, setAvailableBalance] = useState(0);
  const [isHydratingBalance, setIsHydratingBalance] = useState(true);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const { reconcile } = useUnknownOutcomeReconciliation();
  const [isConnectingPayout, setIsConnectingPayout] = useState(false);
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccountPayload | null>(null);
  const [countryCapabilities, setCountryCapabilities] = useState<UserCountryCapabilities | null>(null);
  const [successData, setSuccessData] = useState<WithdrawSuccessData | null>(null);
  const [withdrawals, setWithdrawals] = useState<PayoutRequestPayload[]>([]);
  const [withdrawalsLoadState, setWithdrawalsLoadState] = useState<WithdrawalsLoadState>('idle');
  const { currencySymbol, formatFromFiat } = useFormattedPrice();
  const { currencyCode, fxRates, rateUpdatedAt } = useCurrencyContext();
  const { show } = useToast();
  const { isOffline } = useConnectivity();
  const reducedMotionEnabled = useReducedMotion();
  const haptic = useHaptic();
  const currentUser = useStore((state) => state.currentUser);

  // ── Biometric gate (OWASP M5) ──
  // Withdrawals move money out of the wallet. Require biometric re-authentication
  // before showing the withdrawal form. Falls through when biometric is unavailable.
  const biometricGate = useBiometricGate();

  useEffect(() => {
    const displayAmount = getDefaultWithdrawDisplayAmount(availableBalance, currencyCode, fxRates);
    setAmount(displayAmount.toFixed(2));
  }, [availableBalance, currencyCode, fxRates]);

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

  const loadWithdrawals = useCallback(async (userId: string) => {
    setWithdrawalsLoadState('loading');
    try {
      const items = await listPayoutRequests(userId, { limit: 10 });
      // Most-recent first — backend may already order these, but enforce
      // a stable client-side order so the surface is predictable.
      const sorted = [...items].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setWithdrawals(sorted);
      setWithdrawalsLoadState('loaded');
    } catch {
      setWithdrawalsLoadState('error');
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const hydrateWithdrawals = async () => {
      if (!currentUser?.id) {
        setWithdrawals([]);
        setWithdrawalsLoadState('idle');
        return;
      }
      if (isCancelled) return;
      await loadWithdrawals(currentUser.id);
    };

    void hydrateWithdrawals();

    return () => {
      isCancelled = true;
    };
  }, [currentUser?.id, loadWithdrawals]);

  const numericAmountDisplay = Number(amount) || 0;
  const numericAmount = Number(convertDisplayToGbpAmount(numericAmountDisplay, currencyCode, fxRates).toFixed(2));
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
            ? t('withdraw.payout.connectedProfile')
            : t('withdraw.payout.verificationPending'),
        details: `${payoutAccount.gatewayId} · ${payoutAccount.currency}${payoutLocation}` };
    }

    if (!allowBankAccounts) {
      return {
        name: t('withdraw.payout.bankUnavailable'),
        details: 'Country policy will route withdrawals through supported payout rails.' };
    }

    return {
      name: t('withdraw.form.connectPayoutProfile'),
      details: 'Verify your identity and bank details to enable payouts' };
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

    const gatewayPriority = resolvedCapabilities?.payouts?.gatewayPriority ?? ['stripe_americas'];
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
        t('withdraw.error.payoutSetupIncomplete')
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
          capabilityPolicyVersion: resolvedCapabilities?.policyVersion ?? null } });
    }

    if (activeAccount.status !== 'active') {
      throw new Error(t('withdraw.error.payoutsNotEnabled'));
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
        capabilities: resolvedCapabilities };
    }

    const existingAccounts = await listPayoutAccounts(currentUser.id);
    const activeAccount =
      existingAccounts.find((account) => account.status === 'active') ?? null;

    if (activeAccount) {
      setPayoutAccount(activeAccount);
      return {
        account: activeAccount,
        capabilities: resolvedCapabilities };
    }

    const createdAccount = await connectOrSyncPayoutAccount(resolvedCapabilities);
    return {
      account: createdAccount,
      capabilities: resolvedCapabilities };
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

  const handleReview = useCallback(() => {
    if (!canWithdraw) {
      return;
    }
    haptic.patterns.save();
    setStep('confirm');
  }, [canWithdraw, haptic]);

  const handleBackToForm = useCallback(() => {
    haptic.light();
    setStep('form');
  }, [haptic]);

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
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = createStableId('payout');
    }
    const idempotencyKey = idempotencyKeyRef.current;
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
          amount: amountGbp });

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
              idempotencyKey,
              metadata: {
                source: 'withdraw_screen_request',
                enteredDisplayAmount: numericAmountDisplay,
                enteredDisplayCurrency: currencyCode,
                payoutMode: 'sale_proceeds_only' } }
          : {
              payoutAccountId: payoutProfile.id,
              amount: payoutAmount,
              amountCurrency: payoutCurrency,
              idempotencyKey,
              metadata: {
                source: 'withdraw_screen_request',
                enteredDisplayAmount: numericAmountDisplay,
                enteredDisplayCurrency: currencyCode,
                payoutMode: 'sale_proceeds_only' } };

      track('withdrawal_initiated', { amount: amountGbp, currency: payoutCurrency });

      const payoutResponse = await createPayoutRequest(currentUser.id, payoutRequestInput);

      const nextBalance = Number(Math.max(0, availableBalance - amountGbp).toFixed(2));
      setAvailableBalance(nextBalance);
      setAmount(getDefaultWithdrawDisplayAmount(nextBalance, currencyCode, fxRates).toFixed(2));

      setSuccessData({
        reference: payoutResponse.payoutRequest.providerPayoutRef ?? payoutResponse.payoutRequest.id,
        amountGbp,
        payoutCurrency,
        createdAt: payoutResponse.payoutRequest.createdAt });
      haptic.success();
      idempotencyKeyRef.current = null;
      setStep('success');
      // Refresh recent withdrawals so the new request appears with its
      // honest status (processing/pending) immediately.
      void loadWithdrawals(currentUser.id);
    } catch (error) {
      const isNetworkError = isOffline || (error instanceof Error && /network|fetch|timeout/i.test(error.message));

      if (isNetworkError && idempotencyKey) {
        // Lost response during payout submission — the server may have
        // committed. Show unknown_outcome and poll for the authoritative
        // status instead of telling the user the payout failed (which
        // invites an unsafe retry that could create a duplicate).
        setStep('unknown_outcome');
        show('We are confirming your withdrawal. Please do not submit again.');

        const result = await reconcile<PayoutRequestPayload>({
          lookup: () => lookupPayoutByIdempotencyKey(currentUser.id, idempotencyKey),
          onAcknowledged: (payoutRequest) => {
            setSuccessData({
              reference: payoutRequest.providerPayoutRef ?? payoutRequest.id,
              amountGbp: payoutRequest.amountGbp,
              payoutCurrency: payoutRequest.amountCurrency,
              createdAt: payoutRequest.createdAt });
            haptic.success();
            idempotencyKeyRef.current = null;
            setStep('success');
            void loadWithdrawals(currentUser.id);
          },
          onSafeToRetry: () => {
            idempotencyKeyRef.current = null;
            setStep('form');
            show('No withdrawal was created. Please try again.', 'info');
          },
          onUnresolved: () => {
            // Keep the idempotency key so a manual retry doesn't create
            // a duplicate. The user can check their withdrawal history.
            setStep('form');
            show('We could not confirm your withdrawal. Check your history before retrying.', 'info');
          },
          shouldContinue: () => isMountedRef.current });

        if (result.outcome === 'acknowledged' || result.outcome === 'safe_to_retry' || result.outcome === 'unresolved') {
          return;
        }
      }

      const parsed = parseApiError(error, isNetworkError ? 'You appear to be offline. Check your connection and try again.' : 'Unable to submit withdrawal right now.');
      show(parsed.message, 'error');
      setStep('form');
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

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

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
        <View style={styles.skeletonContainer}>
          <SkeletonLoader width="60%" height={32} borderRadius={Radius.md} style={{ marginBottom: Space.lg }} />
          <SkeletonLoader width="100%" height={80} borderRadius={Radius.lg} style={{ marginBottom: Space.md }} />
          <SkeletonLoader width="100%" height={56} borderRadius={Radius.md} style={{ marginBottom: Space.sm }} />
          <SkeletonLoader width="100%" height={56} borderRadius={Radius.md} />
        </View>
      </FlagshipScreen>
    );
  }

  // ── Unknown outcome step ──
  // The withdrawal response was lost. We are polling the backend to
  // determine whether the payout was committed. The user must not retry
  // until the status is resolved.
  if (step === 'unknown_outcome') {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Checking withdrawal"
            onBack={() => { /* prevent back — don't abandon reconciliation */ }}
            backIcon="arrow-back"
          />
        }
        scrollEnabled={false}
      >
        <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
          <Ionicons name="hourglass-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.unknownTitle, { color: colors.textPrimary }]}>
            Confirming your request
          </Text>
          <Text style={[styles.unknownBody, { color: colors.textSecondary }]}>
            We lost connection while submitting your withdrawal. We are
            checking whether it went through. Please do not submit again
            until we confirm.
          </Text>
        </View>
      </FlagshipScreen>
    );
  }

  // ── Success step ──
  if (step === 'success' && successData) {
    const shortRef = successData.reference.slice(0, 12).toUpperCase();
    const formattedDate = new Date(successData.createdAt).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit' });
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
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
        stickyFooter={
          <AppButton
            title="Done"
            onPress={() => navigation.goBack()}
            variant="primary"
            style={[styles.primaryBtn]}
            titleStyle={styles.primaryText}
            accessibilityLabel="Close withdrawal confirmation"
            accessibilityHint="Returns to the previous screen"
            hapticFeedback="light"
          />
        }
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingTop: Space.xxl, paddingBottom: Space.xxl }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ alignItems: 'center', paddingHorizontal: Space.md }}>
            <View style={styles.successHeaderRow}>
              <Ionicons name="checkmark-circle" size={24} color={colors.success} />
              <Text style={[styles.successTitle, { color: colors.textPrimary }]}>
                Withdrawal requested
              </Text>
            </View>
            <Text style={[styles.successSubtitle, { color: colors.textSecondary }]}>
              {formatFromFiat(successData.amountGbp, 'GBP', { displayMode: 'fiat' })} is on its way
            </Text>
          </View>

          <View>
            <FlagshipFormSection variant="flat" title="Withdrawal details">
              <FlagshipMetricLine label="Reference" value={shortRef} />
              <FlagshipMetricLine label="Amount" value={formatFromFiat(successData.amountGbp, 'GBP', { displayMode: 'fiat' })} separated />
              <FlagshipMetricLine label="Currency" value={successData.payoutCurrency} separated />
              <FlagshipMetricLine label="Requested" value={formattedDate} separated />
              <FlagshipMetricLine label="Estimated arrival" value="1–3 business days" separated />
            </FlagshipFormSection>
          </View>

          <View>
            <View style={styles.flatNote}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <Text style={[styles.flatNoteText, { color: colors.textMuted }]}>
                We'll notify you when the payout is processed. You can track the status in your wallet activity.
              </Text>
            </View>
          </View>
        </ScrollView>
      </FlagshipScreen>
    );
  }

  // ── Confirmation step ──
  if (step === 'confirm') {
    const destinationLabel = payoutAccount
      ? `${payoutAccount.gatewayId} · ${payoutAccount.currency}${payoutAccount.countryCode ? ` · ${payoutAccount.countryCode}` : ''}`
      : bankCopy.details;
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Confirm withdrawal"
            onBack={handleBackToForm}
            backIcon="arrow-back"
          />
        }
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
        stickyFooter={
          <>
            <AppButton
              title={isWithdrawing ? 'Processing...' : 'Confirm withdrawal'}
              onPress={handleWithdraw}
              disabled={isWithdrawing}
              loading={isWithdrawing}
              variant="primary"
              style={[styles.primaryBtn, isWithdrawing && styles.primaryBtnDisabled]}
              titleStyle={styles.primaryText}
              accessibilityLabel={
                isWithdrawing
                  ? 'Processing withdrawal'
                  : `Confirm withdrawal of ${formatFromFiat(numericAmount, 'GBP', { displayMode: 'fiat' })}`
              }
              accessibilityHint="Submits your withdrawal request"
            />
            <AppButton
              title="Back to edit"
              onPress={handleBackToForm}
              variant="secondary"
              style={[styles.secondaryBtn, { marginTop: Space.sm }]}
              accessibilityLabel="Back to edit amount"
              accessibilityHint="Returns to the withdrawal form"
              hapticFeedback="light"
            />
          </>
        }
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingTop: Space.lg, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          <View>
            <FlagshipFormSection variant="flat" title="Withdrawal summary">
              <FlagshipMetricLine label="Amount" value={formatFromFiat(numericAmount, 'GBP', { displayMode: 'fiat' })} />
              <FlagshipMetricLine label="Fee" value={formatFromFiat(0, 'GBP', { displayMode: 'fiat' })} separated />
              <FlagshipMetricLine label="You receive" value={formatFromFiat(numericAmount, 'GBP', { displayMode: 'fiat' })} emphasis separated />
              <FlagshipMetricLine label="Destination" value={destinationLabel} separated />
              <FlagshipMetricLine label="Estimated arrival" value="1–3 business days" separated />
            </FlagshipFormSection>
          </View>

          <View>
            <View style={styles.flatNote}>
              <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
              <Text style={[styles.flatNoteText, { color: colors.textMuted }]}>
                Withdrawals are processed from completed sale proceeds. This action cannot be undone.
              </Text>
            </View>
            {rateUpdatedAt && currencyCode !== 'GBP' && (
              <View style={styles.rateTimestampRow}>
                <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.rateTimestampText, { color: colors.textMuted }]}>
                  Reference rate as of {new Date(rateUpdatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </FlagshipScreen>
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
        <>
          {/* Estimated arrival — honest, non-decorative disclosure */}
          <View style={[styles.arrivalRow, { borderColor: colors.border }]}>
            <View style={styles.arrivalLeft}>
              <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.arrivalLabel, { color: colors.textSecondary }]}>
                Estimated arrival
              </Text>
            </View>
            <Text style={[styles.arrivalValue, { color: colors.textPrimary }]}>
              1–3 business days
            </Text>
          </View>
          <Text style={styles.feeText}>
            Transfers to your bank typically arrive in 1–3 business days. Status updates when the bank confirms.
          </Text>
          <AppButton
            title={`Review withdrawal`}
            onPress={handleReview}
            disabled={!canWithdraw}
            variant="primary"
            style={[styles.primaryBtn, !canWithdraw && styles.primaryBtnDisabled]}
            titleStyle={styles.primaryText}
            accessibilityLabel={
              `Review withdrawal of ${formatFromFiat(numericAmount, 'GBP', { displayMode: 'fiat' })}`
            }
            accessibilityHint="Proceeds to the confirmation step"
          />
        </>
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
          {/* Available balance — flat metric line, no card */}
          <View style={{ marginTop: Space.md }}>
            <FlagshipMetricLine
              label="Available to withdraw"
              value={formatFromFiat(availableBalance, 'GBP', { displayMode: 'fiat' })}
              emphasis
            />
          </View>

          <View>
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
          </View>

          <View>
            <FlagshipFormSection variant="flat" title="Transfer to">
              <FlagshipNavigationRow
                title={bankCopy.name}
                subtitle={bankCopy.details}
                icon="business"
                onPress={handleConnectPayout}
                disabled={!allowBankAccounts || isConnectingPayout}
                separator={false}
                accessibilityLabel={
                  payoutAccount?.status === 'active'
                    ? 'Refresh verified payout profile'
                    : t('withdraw.form.connectVerifiedPayoutProfile')
                }
                accessibilityHint="Opens secure payout onboarding when verification is required"
              />

              {allowBankAccounts ? (
                <AnimatedPressable
                  style={styles.addBankBtn}
                  onPress={handleConnectPayout}
                  disabled={isConnectingPayout}
                  accessibilityRole="button"
                  accessibilityLabel={
                    payoutAccount?.status === 'active'
                      ? 'Refresh payout profile'
                      : t('withdraw.form.connectPayoutProfileLabel')
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
            </FlagshipFormSection>
          </View>

          {/* Recent withdrawals — honest payout status.
              Flat list, hairline separators, colored dot + text.
              No card-on-card, no decorative pills. */}
          <View>
            <FlagshipFormSection variant="flat" title="Recent withdrawals">
              {withdrawalsLoadState === 'loading' && (
                <Text
                  style={[styles.withdrawalsStatusText, { color: colors.textMuted }]}
                  accessibilityLabel="Loading recent withdrawals"
                >
                  Loading…
                </Text>
              )}

              {withdrawalsLoadState === 'error' && (
                <AnimatedPressable
                  onPress={() => currentUser?.id && loadWithdrawals(currentUser.id)}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading recent withdrawals"
                >
                  <Text style={[styles.withdrawalsStatusText, { color: colors.textSecondary }]}>
                    Could not load withdrawals — tap to retry
                  </Text>
                </AnimatedPressable>
              )}

              {withdrawalsLoadState === 'loaded' && withdrawals.length === 0 && (
                <Text style={[styles.withdrawalsStatusText, { color: colors.textMuted }]}>
                  No withdrawals yet
                </Text>
              )}

              {withdrawalsLoadState === 'loaded' && withdrawals.length > 0 && (
                <View>
                  {withdrawals.map((item, index) => {
                    const statusConfig = resolvePayoutStatusConfig(item.status);
                    const statusColor = colors[statusConfig.colorKey];
                    const isLast = index === withdrawals.length - 1;
                    const formattedDate = new Date(item.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric' });
                    return (
                      <View
                        key={item.id}
                        style={[
                          styles.withdrawalRow,
                          !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                        ]}
                        accessibilityLabel={`Withdrawal of ${formatFromFiat(item.amountGbp, 'GBP', { displayMode: 'fiat' })}, ${statusConfig.label}, ${formattedDate}`}
                      >
                        <View style={styles.withdrawalLeft}>
                          <Text
                            style={[styles.withdrawalAmount, { color: colors.textPrimary }]}
                            numberOfLines={1}
                          >
                            {formatFromFiat(item.amountGbp, 'GBP', { displayMode: 'fiat' })}
                          </Text>
                          <Text style={[styles.withdrawalDate, { color: colors.textMuted }]}>
                            {formattedDate}
                          </Text>
                        </View>
                        <View style={styles.withdrawalRight}>
                          <View style={styles.withdrawalStatusLine}>
                            <View style={[styles.withdrawalDot, { backgroundColor: statusColor }]} />
                            <Text
                              style={[styles.withdrawalStatusLabel, { color: colors.textPrimary }]}
                              numberOfLines={1}
                            >
                              {statusConfig.label}
                            </Text>
                          </View>
                          {statusConfig.subtitle ? (
                            <Text
                              style={[styles.withdrawalStatusSubtitle, { color: colors.textMuted }]}
                              numberOfLines={2}
                            >
                              {statusConfig.subtitle}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </FlagshipFormSection>
          </View>
      </KeyboardAwareScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Space.xl, gap: Space.md },
  unknownTitle: { fontSize: TypographyV2.sectionTitle.size, fontFamily: TypographyV2.sectionTitle.fontFamily, textAlign: 'center' },
  unknownBody: { fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily, textAlign: 'center', lineHeight: TypographyV2.body.lineHeight },
  skeletonContainer: { paddingHorizontal: Space.md + Space.xs, paddingTop: Space.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Space.md, height: Space.xl + Space.xl + 8, borderBottomWidth: Stroke.standard, borderBottomColor: colors.border },
  backBtn: { width: Control.hit, height: Control.hit, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitle: { fontSize: TypographyV2.sectionTitle.size, fontFamily: TypographyV2.sectionTitle.fontFamily, color: colors.textPrimary },
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

  content: { flex: 1 },

  amountWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: Space.md, marginTop: Space.xl + Space.xl - 8, marginBottom: Space.sm + Space.xs },
  currencySymbol: { fontSize: TypographyV2.priceHero.size + 16, fontFamily: TypographyV2.priceHero.fontFamily, color: colors.textPrimary, marginRight: Space.sm },
  amountInput: { fontSize: TypographyV2.priceHero.size + 28, fontFamily: TypographyV2.priceHero.fontFamily, color: colors.textPrimary, minWidth: Space.xxl * 3 + Space.xs + 2, fontVariant: ['tabular-nums'] },
  availableText: {
    textAlign: 'center',
    paddingHorizontal: Space.md,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    color: colors.textSecondary,
    marginBottom: Space.sm,
    fontVariant: ['tabular-nums'] },
  policyLabel: {
    textAlign: 'center',
    paddingHorizontal: Space.md,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    color: colors.textMuted,
    marginBottom: Space.xs },
  policyHint: {
    textAlign: 'center',
    paddingHorizontal: Space.md,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    color: colors.textMuted,
    marginBottom: Space.lg + Space.xs },
  balanceError: {
    textAlign: 'center',
    paddingHorizontal: Space.md,
    marginTop: Space.xs,
    marginBottom: Space.md + 4,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    color: colors.danger },

  addBankBtn: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.md, paddingVertical: Space.sm + Space.xs },
  addBankText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    color: colors.brand },
  railHintText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    color: colors.textMuted,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + Space.xs },

  footer: { paddingVertical: Space.md + 4, borderTopWidth: Stroke.standard, borderTopColor: colors.border, backgroundColor: colors.background },
  // Estimated arrival row — clear disclosure per spec
  arrivalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    marginBottom: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth },
  arrivalLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2 },
  arrivalLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  arrivalValue: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'] },
  feeText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: Space.md },
  primaryBtn: { backgroundColor: colors.textPrimary, height: Space.xl + Space.xl + 8, borderRadius: Space.lg + 4, alignItems: 'center', justifyContent: 'center' },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryText: { color: colors.background, fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily, fontVariant: ['tabular-nums'] },
  secondaryBtn: {
    height: Space.xl + 8,
    borderRadius: Space.lg + 4,
    alignItems: 'center',
    justifyContent: 'center' },

  // ── Flat note (success + confirm) — no border, no radius ──
  flatNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    marginTop: Space.md },

  // ── Success step ──
  successHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.md },
  successTitle: {
    fontSize: TypographyV2.screenTitle.size,
    lineHeight: TypographyV2.screenTitle.lineHeight,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    letterSpacing: TypographyV2.screenTitle.letterSpacing,
    marginBottom: Space.xs },
  successSubtitle: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    textAlign: 'center',
    marginBottom: Space.xl },
  flatNoteText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  rateTimestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.sm },
  rateTimestampText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },

  // ── Recent withdrawals — flat list, hairline separators ──
  withdrawalsStatusText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    paddingVertical: Space.sm },
  withdrawalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2 },
  withdrawalLeft: {
    flex: 1,
    marginRight: Space.sm },
  withdrawalAmount: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    fontVariant: ['tabular-nums'],
    marginBottom: 2 },
  withdrawalDate: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  withdrawalRight: {
    alignItems: 'flex-end',
    maxWidth: '45%' },
  withdrawalStatusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: 2 },
  withdrawalDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.full },
  withdrawalStatusLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  withdrawalStatusSubtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textAlign: 'right' } });
}
