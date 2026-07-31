import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  RefreshControl,
  TextInput,
  LayoutAnimation,
  Platform,
  Pressable,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import {
  initPaymentSheet,
  PaymentSheetError,
  presentPaymentSheet,
} from '@stripe/stripe-react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { useToast } from '../context/ToastContext';
import { Space, Radius, Type, Typography, DockConstants } from '../theme/designTokens';
import { AppButton } from '../components/ui/AppButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { haptics } from '../utils/haptics';
import { formatIzeAmount } from '../utils/currency';
import { convertDisplayToGbpAmount, convertGbpToDisplayAmount } from '../utils/currencyAuthoringFlows';
import { parseApiError } from '../lib/apiClient';
import {
  getIzePosition,
  getWalletSnapshot,
  createIzeMintQuote,
  createStripeIntentSheet,
  buyIze,
  convertIzeToFiat,
} from '../services/walletApi';
import {
  configureStripeMobile,
  getStripeReturnUrl,
} from '../platform/payments/stripeMobile';
import {
  CoOwnMarketHeader,
  CoOwnWalletBreakdown,
  CoOwnWalletBreakdownSkeleton,
  CoOwnStateCanvas,
  CoOwnOfflineBanner,
  CoOwnReconciliationBanner,
  type CoOwn1ZeBalance,
} from '../components/coown';
import { CoOwnNumericText } from '../components/ui/CoOwnNumericText';
import { useConnectivity } from '../hooks/useConnectivity';

type Props = StackScreenProps<RootStackParamList, 'Wallet'>;

/** Add-flow mode: 'load' converts external fiat → 1ZE; 'buy' uses fiat balance → 1ZE. */
type AddMode = 'load' | 'buy';

// Fee rates sourced from the central config in tradeFlow.ts (single source of truth)
import { CO_OWN_LOAD_FEE_RATE as LOAD_IZE_FEE_RATE, CO_OWN_CONVERT_FEE_RATE as CONVERT_FEE_RATE } from '../utils/tradeFlow';

export default function WalletScreen({ navigation }: Props) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const currentUser = useStore((state) => state.currentUser);
  const { currencyCode, goldRates } = useCurrencyContext();
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const { isOffline } = useConnectivity();

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
    reconciliationState: 'reconciled',
  });
  // Fiat balance kept in parallel for the "Buy 1ZE with fiat balance" flow.
  const [availableFiatBalance, setAvailableFiatBalance] = useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  // ── Inline flow state ──
  // 'none' = both collapsed; 'add' = Add 1ZE expanded; 'redeem' = Redeem 1ZE expanded.
  // The two flows are never combined — expanding one collapses the other (spec §2.1).
  const [activeFlow, setActiveFlow] = useState<'none' | 'add' | 'redeem'>('none');
  const [addMode, setAddMode] = useState<AddMode>('load');
  const [loadFiatInput, setLoadFiatInput] = useState('');
  const [buyFiatInput, setBuyFiatInput] = useState('');
  const [convertIzeInput, setConvertIzeInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const topupIdempotencyRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const loadInputRef = useRef<TextInput>(null);
  const buyInputRef = useRef<TextInput>(null);
  const convertInputRef = useRef<TextInput>(null);

  // ── Balance hydration ──
  const loadBalance = React.useCallback(() => {
    if (!currentUser?.id) { setIsLoading(false); return; }
    let cancelled = false;
    setIsLoading(true);
    setIsError(false);

    Promise.all([
      getIzePosition(currentUser.id, currencyCode),
      getWalletSnapshot(currentUser.id).catch(() => null),
    ])
      .then(([position, fiatWallet]) => {
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
          reconciliationState: position.balances.reconciliationState,
        });
        setAvailableFiatBalance(fiatWallet?.snapshot.availableGbp ?? 0);
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err, 'Unable to load wallet');
        show(parsed.message, 'error');
        setIsError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
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
    setTimeout(() => setRefreshing(false), 800);
  }, [loadBalance]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('CoOwnHub');
  }, [navigation]);

  // ── Flow expansion (separate flows, never combined) ──
  const expandFlow = React.useCallback((flow: 'add' | 'redeem') => {
    haptics.tap();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveFlow((prev) => (prev === flow ? 'none' : flow));
  }, []);

  // ── Derived values for Add / Redeem flows ──
  const availableIze = balance.available;
  const isWalletOperational = balance.reconciliationState === 'reconciled' && !isOffline;

  const loadFiatValue = Number(loadFiatInput || '0');
  const loadGrossIze = convertDisplayToGbpAmount(loadFiatValue, currencyCode, goldRates);
  const loadFeeIze = loadGrossIze * LOAD_IZE_FEE_RATE;
  const loadNetIze = Math.max(0, loadGrossIze - loadFeeIze);
  const loadFeeFiat = loadFiatValue * LOAD_IZE_FEE_RATE;
  const canLoadIze = Number.isFinite(loadFiatValue) && loadFiatValue > 0 && !isProcessing && isWalletOperational;
  const loadFeeRateLabel = `${Math.round(LOAD_IZE_FEE_RATE * 100)}%`;

  const buyFiatValue = Number(buyFiatInput || '0');
  const buyIzeAmount = convertDisplayToGbpAmount(buyFiatValue, currencyCode, goldRates);
  const canBuyIze = Number.isFinite(buyFiatValue) && buyFiatValue > 0 && buyFiatValue <= availableFiatBalance && !isProcessing && isWalletOperational;

  const convertIzeValue = Number(convertIzeInput || '0');
  const convertFiatValue = convertGbpToDisplayAmount(convertIzeValue, currencyCode, goldRates);
  const convertFee = convertFiatValue * CONVERT_FEE_RATE;
  const convertNetFiat = Math.max(0, convertFiatValue - convertFee);
  const canConvertIze = Number.isFinite(convertIzeValue) && convertIzeValue > 0 && convertIzeValue <= availableIze && !isProcessing && isWalletOperational;
  const convertFeeRateLabel = `${Math.round(CONVERT_FEE_RATE * 100)}%`;

  // ── Local-fiat indication for spendable hero ──
  const localFiatRate = convertGbpToDisplayAmount(1, currencyCode, goldRates);
  const localFiatLabel = balance.available > 0 && localFiatRate > 0
    ? `≈ ${formatFromFiat(balance.available, 'GBP', { displayMode: 'fiat' })}`
    : undefined;

  // ── Handlers (preserved from BalanceScreen — real API calls) ──
  const handleLoadIze = async () => {
    if (!canLoadIze) {
      show('Enter a valid amount to convert into 1ZE.', 'error');
      return;
    }
    if (!currentUser?.id) {
      show('Please sign in to load 1ZE.', 'error');
      navigation.navigate('AuthLanding');
      return;
    }

    const loadAmountGbpRaw = convertDisplayToGbpAmount(loadFiatValue, currencyCode, goldRates);
    const loadAmountGbp = Number(loadAmountGbpRaw.toFixed(2));
    if (!Number.isFinite(loadAmountGbp) || loadAmountGbp <= 0) {
      show('Unable to convert that amount right now.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const topupFingerprint = `${currentUser.id}:GBP:${loadAmountGbp.toFixed(2)}`;
      if (topupIdempotencyRef.current?.fingerprint !== topupFingerprint) {
        topupIdempotencyRef.current = {
          fingerprint: topupFingerprint,
          key: `wallet_topup_${currentUser.id}_${Date.now()}`,
        };
      }
      const quoteResponse = await createIzeMintQuote({
        userId: currentUser.id,
        fiatAmount: loadAmountGbp,
        fiatCurrency: 'GBP',
        idempotencyKey: topupIdempotencyRef.current.key,
        metadata: {
          source: 'wallet_screen_topup_quote',
          displayCurrency: currencyCode,
          enteredDisplayAmount: loadFiatValue,
          enteredGbpAmount: loadAmountGbp,
        },
      });

      const intent = quoteResponse.intent;
      if (intent.clientSecret && intent.gatewayId === 'stripe_americas') {
        const sheet = await createStripeIntentSheet(intent.id);
        await configureStripeMobile(sheet.publishableKey);
        const { error: initializationError } = await initPaymentSheet({
          merchantDisplayName: sheet.merchantDisplayName,
          customerId: sheet.customerId,
          customerSessionClientSecret: sheet.customerSessionClientSecret,
          paymentIntentClientSecret: sheet.paymentIntentClientSecret,
          returnURL: getStripeReturnUrl(),
          allowsDelayedPaymentMethods: false,
          applePay:
            sheet.applePayEnabled && Platform.OS === 'ios'
              ? { merchantCountryCode: sheet.merchantCountryCode }
              : undefined,
          googlePay:
            sheet.googlePayEnabled && Platform.OS === 'android'
              ? {
                  merchantCountryCode: sheet.merchantCountryCode,
                  currencyCode: sheet.currency,
                  testEnv: sheet.publishableKey.startsWith('pk_test_'),
                }
              : undefined,
        });
        if (initializationError) {
          throw new Error(initializationError.message);
        }

        const { error: presentationError } = await presentPaymentSheet();
        if (presentationError?.code === PaymentSheetError.Canceled) {
          show('Top-up cancelled. No funds were added.', 'info');
          return;
        }
        if (presentationError) {
          throw new Error(presentationError.message);
        }
      } else if (intent.status !== 'succeeded') {
        if (intent.nextActionUrl && await Linking.canOpenURL(intent.nextActionUrl)) {
          await Linking.openURL(intent.nextActionUrl);
          setLoadFiatInput('');
          show('Payment is pending. 1ZE is credited only after provider confirmation.', 'info');
        } else {
          show('This payment provider cannot complete checkout on this device.', 'error');
        }
        return;
      }

      setLoadFiatInput('');
      topupIdempotencyRef.current = null;
      show(
        `${formatIzeAmount(quoteResponse.operation.izeAmount)} is pending provider confirmation.`,
        'success'
      );
      loadBalance();
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to load 1ZE right now. Please try again shortly.');
      show(parsed.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBuyIze = async () => {
    if (!canBuyIze || !currentUser?.id) {
      show('Enter a valid amount within your fiat balance.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const result = await buyIze({
        userId: currentUser.id,
        fiatAmount: buyFiatValue,
        fiatCurrency: currencyCode,
      });
      setAvailableFiatBalance(result.wallet.fiatBalance);
      setBuyFiatInput('');
      show(
        `Bought ${formatIzeAmount(result.purchase.izeAmount)} with ${formatFromFiat(result.purchase.fiatAmount, currencyCode, { displayMode: 'fiat' })}`,
        'success',
      );
      loadBalance();
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to buy 1ZE right now.');
      show(parsed.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConvertIzeToFiat = async () => {
    if (!canConvertIze || !currentUser?.id) {
      show('Enter a valid amount within your 1ZE balance.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const result = await convertIzeToFiat({
        userId: currentUser.id,
        izeAmount: convertIzeValue,
        fiatCurrency: currencyCode,
      });
      setAvailableFiatBalance(result.wallet.fiatBalance);
      setConvertIzeInput('');
      show(
        `Converted ${formatIzeAmount(result.conversion.izeAmount)} to ${formatFromFiat(result.conversion.fiatAmount, currencyCode, { displayMode: 'fiat' })}`,
        'success',
      );
      loadBalance();
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to convert 1ZE right now.');
      show(parsed.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleViewActivity = React.useCallback(() => {
    haptics.tap();
    navigation.navigate('CoOwnOrderHistory');
  }, [navigation]);

  const handleWithdraw = React.useCallback(() => {
    haptics.tap();
    navigation.navigate('Withdraw');
  }, [navigation]);

  const handleBalanceHistory = React.useCallback(() => {
    haptics.tap();
    navigation.navigate('BalanceHistory');
  }, [navigation]);

  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + DockConstants.dualActionHeight;

  // ── Loading state ──
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <CoOwnMarketHeader
          title="Wallet"
          subtitle="Your 1ZE settlement balance"
          onBack={handleBack}
        />
        <CoOwnWalletBreakdownSkeleton />
      </SafeAreaView>
    );
  }

  // ── Error state ──
  if (isError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <CoOwnMarketHeader
          title="Wallet"
          subtitle="Your 1ZE settlement balance"
          onBack={handleBack}
        />
        <CoOwnStateCanvas
          variant="error"
          actionLabel="Try again"
          onAction={loadBalance}
        />
      </SafeAreaView>
    );
  }

  // ── Empty state ──
  if (balance.available === 0 && balance.reservedForOrders === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <CoOwnMarketHeader
          title="Wallet"
          subtitle="Your 1ZE settlement balance"
          onBack={handleBack}
        />
        <CoOwnStateCanvas
          variant="empty"
          title="No 1ZE yet"
          subtitle="Add 1ZE to start trading Co-Own units."
          actionLabel="Add 1ZE"
          onAction={() => expandFlow('add')}
          emptyGraphicVariant="bag"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <CoOwnMarketHeader
        title="Wallet"
        subtitle="Your 1ZE settlement balance"
        onBack={handleBack}
        actions={[
          { icon: 'receipt-outline', label: 'Activity', onPress: handleViewActivity },
        ]}
      />

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
        {/* ── Wallet breakdown — spendable hero + sub-balances + safeguarding ── */}
        <CoOwnWalletBreakdown
          balance={balance}
          localFiatLabel={localFiatLabel}
          localFiatSource={currencyCode}
        />

        {/* ── Add 1ZE / Redeem 1ZE — separate flows, never combined ── */}
        <View style={styles.actionRow}>
          <AppButton
            title="Add 1ZE"
            icon={<Ionicons name="add-circle-outline" size={18} color={colors.background} />}
            onPress={() => expandFlow('add')}
            variant={activeFlow === 'add' ? 'secondary' : 'primary'}
            size="md"
            accessibilityLabel="Add 1ZE to your wallet"
            accessibilityHint={activeFlow === 'add' ? 'Collapses the add 1ZE form' : 'Expands the add 1ZE form'}
            hapticFeedback="medium"
            style={styles.actionBtn}
            disabled={!isWalletOperational}
          />
          <AppButton
            title="Redeem 1ZE"
            icon={<Ionicons name="arrow-down-circle-outline" size={18} color={colors.textPrimary} />}
            onPress={() => expandFlow('redeem')}
            variant={activeFlow === 'redeem' ? 'primary' : 'secondary'}
            size="md"
            accessibilityLabel="Redeem 1ZE to your bank"
            accessibilityHint={activeFlow === 'redeem' ? 'Collapses the redeem 1ZE form' : 'Expands the redeem 1ZE form'}
            hapticFeedback="medium"
            style={styles.actionBtn}
            disabled={balance.available <= 0 || !isWalletOperational}
          />
        </View>

        {/* ── Add 1ZE flow (inline, expandable) ── */}
        {activeFlow === 'add' && (
          <View style={[styles.flowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.flowHeader}>
              <Ionicons name="add-circle" size={16} color={colors.brand} />
              <Text style={[styles.flowTitle, { color: colors.textPrimary }]}>Add 1ZE</Text>
            </View>
            <Text style={[styles.flowHint, { color: colors.textMuted }]}>
              Convert external currency into 1ZE, or buy 1ZE using your fiat balance.
            </Text>

            {/* Sub-mode tabs: Load (external) vs Buy (from fiat balance) */}
            <View style={styles.tabRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.tab,
                  addMode === 'load' && { backgroundColor: colors.brand + '14', borderColor: colors.brand },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => { haptics.tap(); setAddMode('load'); }}
                accessibilityRole="tab"
                accessibilityLabel="Load 1ZE from external payment"
                accessibilityState={{ selected: addMode === 'load' }}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: addMode === 'load' ? colors.brand : colors.textSecondary },
                    addMode === 'load' && { fontFamily: Typography.family.semibold },
                  ]}
                >
                  Load
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.tab,
                  addMode === 'buy' && { backgroundColor: colors.brand + '14', borderColor: colors.brand },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => { haptics.tap(); setAddMode('buy'); }}
                accessibilityRole="tab"
                accessibilityLabel="Buy 1ZE from fiat balance"
                accessibilityState={{ selected: addMode === 'buy' }}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: addMode === 'buy' ? colors.brand : colors.textSecondary },
                    addMode === 'buy' && { fontFamily: Typography.family.semibold },
                  ]}
                >
                  Buy
                </Text>
              </Pressable>
            </View>

            {addMode === 'load' && (
              <>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                  Amount in {currencyCode}
                </Text>
                <TextInput
                  ref={loadInputRef}
                  style={[styles.amountInput, { color: colors.textPrimary, borderColor: colors.border }]}
                  value={loadFiatInput}
                  onChangeText={(v) => setLoadFiatInput(v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  accessibilityLabel={`Amount in ${currencyCode}`}
                  accessibilityHint="Enter the amount to convert into 1ZE."
                />
                <SummaryRow
                  label="Gross 1ZE"
                  value={<CoOwnNumericText value={loadGrossIze} unit="1ZE" size="priceList" align="right" />}
                  colors={colors}
                />
                <SummaryRow
                  label={`Platform fee (${loadFeeRateLabel})`}
                  value={<CoOwnNumericText value={loadFeeIze} unit="1ZE" size="priceList" align="right" />}
                  colors={colors}
                />
                <SummaryRow
                  label="Net 1ZE credited"
                  value={<CoOwnNumericText value={loadNetIze} unit="1ZE" size="price" align="right" />}
                  colors={colors}
                  total
                />
                <AppButton
                  title={isProcessing ? 'Processing…' : 'Load 1ZE'}
                  onPress={handleLoadIze}
                  variant="primary"
                  size="md"
                  disabled={!canLoadIze}
                  accessibilityLabel="Load 1ZE"
                  accessibilityHint="Converts the entered amount into 1ZE and credits your wallet."
                  style={styles.flowSubmitBtn}
                />
              </>
            )}

            {addMode === 'buy' && (
              <>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                  Amount in {currencyCode}
                </Text>
                <Text style={[styles.balanceHint, { color: colors.textMuted }]}>
                  Fiat balance available: {formatFromFiat(availableFiatBalance, currencyCode, { displayMode: 'fiat' })}
                </Text>
                <TextInput
                  ref={buyInputRef}
                  style={[styles.amountInput, { color: colors.textPrimary, borderColor: colors.border }]}
                  value={buyFiatInput}
                  onChangeText={(v) => setBuyFiatInput(v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  accessibilityLabel={`Amount in ${currencyCode}`}
                  accessibilityHint="Enter the fiat amount to buy 1ZE."
                />
                <SummaryRow
                  label="You will receive"
                  value={<CoOwnNumericText value={buyIzeAmount} unit="1ZE" size="priceList" align="right" />}
                  colors={colors}
                />
                <SummaryRow
                  label="Rate"
                  value={<CoOwnNumericText value={localFiatRate} unit={currencyCode} size="priceList" align="right" showUnit={false} />}
                  colors={colors}
                  total
                />
                <AppButton
                  title={isProcessing ? 'Processing…' : 'Buy 1ZE'}
                  onPress={handleBuyIze}
                  variant="primary"
                  size="md"
                  disabled={!canBuyIze}
                  accessibilityLabel="Buy 1ZE"
                  accessibilityHint="Buys 1ZE using your fiat balance."
                  style={styles.flowSubmitBtn}
                />
              </>
            )}
          </View>
        )}

        {/* ── Redeem 1ZE flow (inline, expandable) ── */}
        {activeFlow === 'redeem' && (
          <View style={[styles.flowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.flowHeader}>
              <Ionicons name="arrow-down-circle" size={16} color={colors.textSecondary} />
              <Text style={[styles.flowTitle, { color: colors.textPrimary }]}>Redeem 1ZE</Text>
            </View>
            <Text style={[styles.flowHint, { color: colors.textMuted }]}>
              Convert your 1ZE to {currencyCode} for withdrawal. Settlement details are confirmed at the time of each request.
            </Text>

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Amount in 1ZE</Text>
            <Text style={[styles.balanceHint, { color: colors.textMuted }]}>
              1ZE available: {formatIzeAmount(availableIze)}
            </Text>
            <TextInput
              ref={convertInputRef}
              style={[styles.amountInput, { color: colors.textPrimary, borderColor: colors.border }]}
              value={convertIzeInput}
              onChangeText={(v) => setConvertIzeInput(v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              accessibilityLabel="Amount in 1ZE"
              accessibilityHint="Enter the 1ZE amount to convert to fiat."
            />
            <SummaryRow label={`Gross ${currencyCode}`} value={<CoOwnNumericText value={convertFiatValue} size="priceList" align="right" showUnit={false} />} colors={colors} />
            <SummaryRow label={`Platform fee (${convertFeeRateLabel})`} value={<CoOwnNumericText value={convertFee} size="priceList" align="right" showUnit={false} />} colors={colors} />
            <SummaryRow label="Net fiat credited" value={<CoOwnNumericText value={convertNetFiat} size="price" align="right" showUnit={false} />} colors={colors} total />
            <AppButton
              title={isProcessing ? 'Processing…' : 'Convert to Fiat'}
              onPress={handleConvertIzeToFiat}
              variant="primary"
              size="md"
              disabled={!canConvertIze}
              accessibilityLabel="Convert 1ZE to fiat"
              accessibilityHint="Converts 1ZE to fiat and credits your wallet."
              style={styles.flowSubmitBtn}
            />
          </View>
        )}

        {/* ── Quick actions row ── */}
        <View style={styles.quickActionsRow}>
          <QuickAction
            icon="library-outline"
            label="Withdraw"
            onPress={handleWithdraw}
            colors={colors}
          />
          <QuickAction
            icon="time-outline"
            label="History"
            onPress={handleBalanceHistory}
            colors={colors}
          />
          <QuickAction
            icon="receipt-outline"
            label="Activity"
            onPress={handleViewActivity}
            colors={colors}
          />
        </View>

        {/* ── Safeguarding & redemption info ── */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.infoHeader}>
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.brand} />
            <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>Safeguarding & redemption</Text>
          </View>
          <Text style={[styles.infoBody, { color: colors.textMuted }]}>
            {balance.safeguarded
              ? `Customer 1ZE is safeguarded${balance.safeguardingPartner ? ` at ${balance.safeguardingPartner}` : ''}. Redemption to ${currencyCode} settlement details are confirmed at the time of each request.`
              : `Customer 1ZE safeguarding is being finalised. Redemption to ${currencyCode} will be available once safeguarding is confirmed.`}
          </Text>
          {/* WS4: substantiate the safeguarding badge with evidence/terms links. */}
          {balance.safeguarded && (balance.safeguardingEvidenceUrl || balance.safeguardingTermsUrl) ? (
            <View style={styles.safeguardingLinksRow}>
              {balance.safeguardingEvidenceUrl ? (
                <Pressable onPress={() => Linking.openURL(balance.safeguardingEvidenceUrl!)}>
                  <Text style={[styles.safeguardingLink, { color: colors.brand }]}>Evidence</Text>
                </Pressable>
              ) : null}
              {balance.safeguardingTermsUrl ? (
                <Pressable onPress={() => Linking.openURL(balance.safeguardingTermsUrl!)}>
                  <Text style={[styles.safeguardingLink, { color: colors.brand }]}>Terms</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* ── 1ZE disclosure — what 1ZE is, per research doc §1.1 ── */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.infoHeader}>
            <Ionicons name="information-circle-outline" size={15} color={colors.textSecondary} />
            <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>About 1ZE</Text>
          </View>
          <Text style={[styles.infoBody, { color: colors.textMuted }]}>
            1ZE is the platform's single settlement unit for Co-Own transactions. For the UK market, 1ZE is maintained at a £1.00 reference par before disclosed fees. It is the medium through which Co-Own units are priced, traded and settled.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Helper sub-components ──

function SummaryRow({
  label,
  value,
  colors,
  total,
}: {
  label: string;
  value: React.ReactNode;
  colors: ReturnType<typeof useAppTheme>['colors'];
  total?: boolean;
}) {
  return (
    <View
      style={[styles.summaryRow, total && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: Space.xs, paddingTop: Space.xs }]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Text
        style={[
          styles.summaryLabel,
          { color: total ? colors.textPrimary : colors.textSecondary },
          total && { fontFamily: Typography.family.semibold },
        ]}
      >
        {label}
      </Text>
      {value}
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  return (
    <AnimatedPressable
      style={[styles.quickAction, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      scaleValue={0.97}
      hapticFeedback="light"
    >
      <View style={[styles.quickActionCircle, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name={icon} size={20} color={colors.textPrimary} />
      </View>
      <Text style={[styles.quickActionLabel, { color: colors.textSecondary }]}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.lg,
  },
  actionBtn: { flex: 1 },

  // ── Flow cards (inline Add / Redeem) ──
  flowCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.sm,
    marginTop: Space.md,
  },
  flowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  flowTitle: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  flowHint: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  tabRow: {
    flexDirection: 'row',
    gap: Space.xs,
    marginTop: Space.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  tabText: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
  },
  inputLabel: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.caption.letterSpacing,
    marginTop: Space.xs,
  },
  balanceHint: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  amountInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Platform.OS === 'ios' ? Space.sm : Space.xs,
    fontSize: Type.priceList.size,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs,
  },
  summaryLabel: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
  summaryValue: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  flowSubmitBtn: {
    marginTop: Space.sm,
  },

  // ── Quick actions ──
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: Space.lg,
    gap: Space.sm,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickActionCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.caption.letterSpacing,
  },

  // ── Safeguarding info ──
  infoCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.xs,
    marginTop: Space.lg,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  infoTitle: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  infoBody: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight + 2,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  safeguardingLinksRow: {
    flexDirection: 'row',
    gap: Space.md,
    marginTop: Space.sm,
  },
  safeguardingLink: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
});
