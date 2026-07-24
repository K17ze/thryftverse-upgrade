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
import { ActiveTheme, Colors } from '../constants/colors';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { CURRENCIES } from '../constants/currencies';
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
import { Typography, Space, Radius, Elevation } from '../theme/designTokens';
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

export default function WithdrawScreen() {
  const navigation = useNavigation<any>();
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
  const currentUser = useStore((state) => state.currentUser);
  const currencySymbol = CURRENCIES[currencyCode].symbol;

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
      details: 'Verify your identity and bank details with Stripe',
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
      throw new Error('Please sign in to connect a payout profile.');
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
        'Payout setup is not complete yet. Finish the required Stripe steps, then refresh your payout profile.'
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
      throw new Error('Stripe has not enabled payouts for this profile yet.');
    }

    setPayoutAccount(activeAccount);
    return activeAccount;
  };

  const ensurePayoutAccount = async (): Promise<{
    account: PayoutAccountPayload;
    capabilities: UserCountryCapabilities | null;
  }> => {
    if (!currentUser?.id) {
      throw new Error('Please sign in to withdraw your balance.');
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
      show('Please sign in to withdraw your balance.', 'error');
      navigation.navigate('AuthLanding');
      return;
    }

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
      const parsed = parseApiError(error, 'Unable to submit withdrawal right now.');
      show(parsed.message, 'error');
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      <View style={styles.header}>
        <AnimatedPressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the previous screen"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Withdraw Balance</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAwareScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >

          <Reanimated.View entering={FadeInDown.duration(300).delay(30)}>
            <View style={styles.amountWrap}>
            <Text style={styles.currencySymbol}>{currencySymbol}</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={(value) => setAmount(sanitizeDecimalInput(value))}
              keyboardType="decimal-pad"
              autoFocus
              selectionColor={Colors.brand}
              accessibilityLabel="Withdrawal amount"
              accessibilityHint="Enter the amount to withdraw from your available balance"
            />
          </View>
          <Text style={styles.availableText}>Available: {formatFromFiat(availableBalance, 'GBP', { displayMode: 'fiat' })}</Text>
          {policyScopeLabel ? <Text style={styles.policyLabel}>Policy scope: {policyScopeLabel}</Text> : null}
          {payoutPolicyHint ? <Text style={styles.policyHint}>{payoutPolicyHint}</Text> : null}
          {exceedsBalance ? <Text style={styles.balanceError}>Entered amount exceeds available balance.</Text> : null}
          </Reanimated.View>

          <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
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
            accessibilityHint="Opens secure Stripe payout onboarding when verification is required"
          >
            <View style={styles.bankLeft}>
              <View style={styles.bankIcon}>
                <Ionicons name="business" size={24} color={Colors.textPrimary} />
              </View>
              <View>
                <Text style={styles.bankName}>{bankCopy.name}</Text>
                <Text style={styles.bankDetails}>{bankCopy.details}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
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
              accessibilityHint="Checks Stripe payout verification and opens any required onboarding steps"
            >
              <Ionicons
                name={payoutAccount?.status === 'active' ? 'refresh' : 'open-outline'}
                size={18}
                color={Colors.brand}
              />
              <Text style={styles.addBankText}>
                {isConnectingPayout
                  ? 'Checking payout profile…'
                  : payoutAccount?.status === 'active'
                    ? 'Refresh payout profile'
                    : 'Connect with Stripe'}
              </Text>
            </AnimatedPressable>
          ) : (
            <Text style={styles.railHintText}>Bank account setup is currently disabled for this region policy.</Text>
          )}
          </Reanimated.View>

        <View style={styles.footer}>
          <Text style={styles.feeText}>Withdrawals are processed from completed sale proceeds in 3-5 working days.</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitle: { fontSize: 17, fontFamily: Typography.family.semibold, color: Colors.textPrimary },

  content: { flex: 1, paddingHorizontal: 20 },

  amountWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 40, marginBottom: 12 },
  currencySymbol: { fontSize: 44, fontFamily: Typography.family.bold, color: Colors.textPrimary, marginRight: 8 },
  amountInput: { fontSize: 56, fontFamily: Typography.family.bold, color: Colors.textPrimary, minWidth: 150 },
  availableText: { textAlign: 'center', fontSize: 14, fontFamily: Typography.family.medium, color: Colors.textSecondary, marginBottom: 8 },
  policyLabel: { textAlign: 'center', fontSize: 12, fontFamily: Typography.family.semibold, color: Colors.textMuted, marginBottom: 4 },
  policyHint: { textAlign: 'center', fontSize: 12, fontFamily: Typography.family.medium, color: Colors.textMuted, marginBottom: 28 },
  balanceError: { textAlign: 'center', marginTop: 4, marginBottom: 20, fontSize: 12, fontFamily: Typography.family.semibold, color: Colors.danger },
  sectionTitle: { fontSize: 13, fontFamily: Typography.family.semibold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12 },

  bankCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surface, padding: 16, borderRadius: Radius.lg, marginBottom: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border, ...Elevation.subtle },
  bankLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  bankIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  bankName: { fontSize: 16, fontFamily: Typography.family.semibold, color: Colors.textPrimary, marginBottom: 4 },
  bankDetails: { fontSize: 13, fontFamily: Typography.family.regular, color: Colors.textSecondary },

  addBankBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  addBankText: { fontSize: 15, fontFamily: Typography.family.semibold, color: Colors.brand },
  railHintText: { fontSize: 12, fontFamily: Typography.family.medium, color: Colors.textMuted, paddingVertical: 12 },

  footer: { paddingVertical: 20, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.background },
  feeText: { fontSize: 12, fontFamily: Typography.family.regular, color: Colors.textMuted, textAlign: 'center', marginBottom: 16 },
  primaryBtn: { backgroundColor: Colors.textPrimary, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryText: { color: Colors.background, fontSize: 16, fontFamily: Typography.family.bold },
});
