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
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useAppTheme } from '../theme/ThemeContext';
import { useCurrencyContext } from '../context/CurrencyContext';
import { CURRENCIES } from '../constants/currencies';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { parseApiError } from '../lib/apiClient';
import {
  createPayoutAccount,
  createPayoutRequest,
  getIzeFxQuote,
  listPayoutAccounts,
  getWalletSnapshot,
  PayoutAccountPayload,
} from '../services/walletApi';
import { getUserCountryCapabilities, UserCountryCapabilities } from '../services/capabilitiesApi';
import { Typography, Space, Radius, Elevation } from '../theme/designTokens';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { useReducedMotion } from '../hooks/useReducedMotion';
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
  const reducedMotionEnabled = useReducedMotion();
  const { colors, isDark } = useAppTheme();
  const [amount, setAmount] = useState('');
  const [availableBalance, setAvailableBalance] = useState(0);
  const [isHydratingBalance, setIsHydratingBalance] = useState(true);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccountPayload | null>(null);
  const [countryCapabilities, setCountryCapabilities] = useState<UserCountryCapabilities | null>(null);
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, goldRates } = useCurrencyContext();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);
  const savedPaymentMethod = useStore((state) => state.savedPaymentMethod);
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
  const canWithdraw = numericAmount > 0 && !exceedsBalance && !isWithdrawing;
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
    if (savedPaymentMethod?.type === 'bank_account') {
      return {
        name: savedPaymentMethod.label,
        details: savedPaymentMethod.details ?? 'bank account',
      };
    }

    if (payoutAccount) {
      const payoutLocation = payoutAccount.countryCode ? ` · ${payoutAccount.countryCode}` : '';
      return {
        name: 'Connected payout profile',
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
      name: 'No bank account linked',
      details: 'Add a bank account to enable withdrawals',
    };
  }, [allowBankAccounts, savedPaymentMethod, payoutAccount]);

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
      existingAccounts.find((account) => account.status === 'active') ?? existingAccounts[0] ?? null;

    if (activeAccount) {
      setPayoutAccount(activeAccount);
      return {
        account: activeAccount,
        capabilities: resolvedCapabilities,
      };
    }

    if (resolvedCapabilities && resolvedCapabilities.payouts.gatewayPriority.length === 0) {
      throw new Error('No payout gateway is available for your country policy right now.');
    }

    const preferredGateway = resolvedCapabilities?.payouts.gatewayPriority[0] ?? 'stripe_americas';
    const defaultPayoutCurrency =
      resolvedCapabilities?.payouts.defaultCurrency
      ?? resolvedCapabilities?.currency.defaultCurrency
      ?? 'GBP';
    const defaultPayoutCountry =
      resolvedCapabilities?.effectiveCountryCode
      ?? resolvedCapabilities?.countryCode
      ?? 'GB';

    const createdAccount = await createPayoutAccount(currentUser.id, {
      gatewayId: preferredGateway,
      currency: defaultPayoutCurrency,
      countryCode: defaultPayoutCountry,
      metadata: {
        source: 'withdraw_screen_auto_create',
        linkedPaymentMethodLabel: savedPaymentMethod?.label ?? null,
        linkedPaymentMethodDetails: savedPaymentMethod?.details ?? null,
        countryCluster: resolvedCapabilities?.countryCluster ?? null,
        capabilityPolicyVersion: resolvedCapabilities?.policyVersion ?? null,
      },
    });

    setPayoutAccount(createdAccount);
    return {
      account: createdAccount,
      capabilities: resolvedCapabilities,
    };
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <AnimatedPressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the previous screen"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </AnimatedPressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Withdraw Balance</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAwareScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >

          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(30)}>
            <View style={styles.amountWrap}>
            <Text style={[styles.currencySymbol, { color: colors.textPrimary }]}>{currencySymbol}</Text>
            <TextInput
              style={[styles.amountInput, { color: colors.textPrimary }]}
              value={amount}
              onChangeText={(value) => setAmount(sanitizeDecimalInput(value))}
              keyboardType="decimal-pad"
              autoFocus
              selectionColor={colors.brand}
              accessibilityLabel="Withdrawal amount"
              accessibilityHint="Enter the amount to withdraw from your available balance"
            />
          </View>
          <Text style={[styles.availableText, { color: colors.textSecondary }]}>Available: {formatFromFiat(availableBalance, 'GBP', { displayMode: 'fiat' })}</Text>
          {policyScopeLabel ? <Text style={[styles.policyLabel, { color: colors.textMuted }]}>Policy scope: {policyScopeLabel}</Text> : null}
          {payoutPolicyHint ? <Text style={[styles.policyHint, { color: colors.textMuted }]}>{payoutPolicyHint}</Text> : null}
          {exceedsBalance ? <Text style={[styles.balanceError, { color: colors.danger }]}>Entered amount exceeds available balance.</Text> : null}
          </Reanimated.View>

          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(80)}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Transfer to</Text>
            <AnimatedPressable
              style={[styles.bankCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              activeOpacity={0.8}
              onPress={() => {
              if (!allowBankAccounts) {
                show('Bank account setup is unavailable in your country policy.', 'error');
                navigation.navigate('Payments');
                return;
              }

              navigation.navigate('AddBankAccount');
            }}
            accessibilityRole="button"
            accessibilityLabel="Transfer destination"
            accessibilityHint="Opens bank account options for withdrawals"
          >
            <View style={styles.bankLeft}>
              <View style={[styles.bankIcon, { backgroundColor: colors.surface }]}>
                <Ionicons name="business" size={24} color={colors.textPrimary} />
              </View>
              <View>
                <Text style={[styles.bankName, { color: colors.textPrimary }]}>{bankCopy.name}</Text>
                <Text style={[styles.bankDetails, { color: colors.textSecondary }]}>{bankCopy.details}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </AnimatedPressable>

          {allowBankAccounts ? (
            <AnimatedPressable
              style={styles.addBankBtn}
              onPress={() => navigation.navigate('AddBankAccount')}
              accessibilityRole="button"
              accessibilityLabel="Add a new bank account"
              accessibilityHint="Opens the bank account setup form"
            >
              <Ionicons name="add" size={18} color={colors.brand} />
              <Text style={[styles.addBankText, { color: colors.brand }]}>Add a new bank account</Text>
            </AnimatedPressable>
          ) : (
            <Text style={[styles.railHintText, { color: colors.textMuted }]}>Bank account setup is currently disabled for this region policy.</Text>
          )}
          </Reanimated.View>

        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <Text style={[styles.feeText, { color: colors.textMuted }]}>Withdrawals are processed from completed sale proceeds in 3-5 working days.</Text>
          <AppButton
            title={
              isWithdrawing
                ? 'Processing...'
                : `Withdraw ${formatFromFiat(numericAmount, 'GBP', { displayMode: 'fiat' })}`
            }
            onPress={handleWithdraw}
            disabled={!canWithdraw}
            variant="primary"
            style={[styles.primaryBtn, { backgroundColor: colors.textPrimary }, !canWithdraw && styles.primaryBtnDisabled]}
            titleStyle={[styles.primaryText, { color: colors.background }]}
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
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56, borderBottomWidth: 1 },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitle: { fontSize: 17, fontFamily: Typography.family.semibold },

  content: { flex: 1, paddingHorizontal: 20 },

  amountWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 40, marginBottom: 12 },
  currencySymbol: { fontSize: 44, fontFamily: Typography.family.bold, marginRight: 8 },
  amountInput: { fontSize: 56, fontFamily: Typography.family.bold, minWidth: 150 },
  availableText: { textAlign: 'center', fontSize: 14, fontFamily: Typography.family.medium, marginBottom: 8 },
  policyLabel: { textAlign: 'center', fontSize: 12, fontFamily: Typography.family.semibold, marginBottom: 4 },
  policyHint: { textAlign: 'center', fontSize: 12, fontFamily: Typography.family.medium, marginBottom: 28 },
  balanceError: { textAlign: 'center', marginTop: 4, marginBottom: 20, fontSize: 12, fontFamily: Typography.family.semibold },
  sectionTitle: { fontSize: 13, fontFamily: Typography.family.semibold, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12 },

  bankCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: Radius.lg, marginBottom: 12, borderWidth: StyleSheet.hairlineWidth, ...Elevation.subtle },
  bankLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  bankIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  bankName: { fontSize: 16, fontFamily: Typography.family.semibold, marginBottom: 4 },
  bankDetails: { fontSize: 13, fontFamily: Typography.family.regular },

  addBankBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  addBankText: { fontSize: 15, fontFamily: Typography.family.semibold },
  railHintText: { fontSize: 12, fontFamily: Typography.family.medium, paddingVertical: 12 },

  footer: { paddingVertical: 20, borderTopWidth: 1 },
  feeText: { fontSize: 12, fontFamily: Typography.family.regular, textAlign: 'center', marginBottom: 16 },
  primaryBtn: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryText: { fontSize: 16, fontFamily: Typography.family.bold },
});