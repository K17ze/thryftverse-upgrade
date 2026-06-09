import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { RootStackParamList } from '../navigation/types';
import { ActiveTheme, Colors } from '../constants/colors';
import { Typography } from '../theme/designTokens';
import { useCurrencyContext } from '../context/CurrencyContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useToast } from '../context/ToastContext';
import { formatIzeAmount, toIze } from '../utils/currency';
import { convertDisplayToGbpAmount } from '../utils/currencyAuthoringFlows';
import { OnezeCoinIcon } from '../components/icons/OnezeCoinIcon';
import { useStore } from '../store/useStore';
import { parseApiError } from '../lib/apiClient';
import { getIzePosition } from '../services/walletApi';
import { AppButton } from '../components/ui/AppButton';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { Type } from '../theme/designTokens';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { ElevatedSurface } from '../components/ui/ElevatedSurface';
import { PremiumListSection } from '../components/ui/PremiumListSection';
import {
  confirmPaymentIntent,
  createPaymentIntent,
  getIzeQuote,
  mintIze,
  buyIze,
  convertIzeToFiat,
} from '../services/walletApi';

type Props = StackScreenProps<RootStackParamList, 'Balance' | 'Wallet'>;
type TxFilter = 'all' | 'sale' | 'purchase' | 'withdrawal';

const TX_FILTERS: TxFilter[] = ['all', 'sale', 'purchase', 'withdrawal'];
const LOAD_IZE_FEE_RATE = 0.01;
const CONVERT_FEE_RATE = 0.005; // 0.5% fee for converting 1ze to fiat

const TINT_CARD_BG = Colors.surfaceAlt;
const TINT_CARD_BORDER = Colors.border;
const TINT_TEXT = Colors.brand;

export default function BalanceScreen({ navigation }: Props) {
  const [activeTxFilter, setActiveTxFilter] = useState<TxFilter>('all');
  const [loadFiatInput, setLoadFiatInput] = useState('');
  const [isLoadingIze, setIsLoadingIze] = useState(false);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [availableIzeBalance, setAvailableIzeBalance] = useState(0);
  const [isHydratingBalance, setIsHydratingBalance] = useState(true);
  const [convertTab, setConvertTab] = useState<'load' | 'buy' | 'convert'>('load');
  const [buyFiatInput, setBuyFiatInput] = useState('');
  const [convertIzeInput, setConvertIzeInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const loadInputRef = useRef<TextInput>(null);
  const buyInputRef = useRef<TextInput>(null);
  const convertInputRef = useRef<TextInput>(null);

  const { currencyCode, goldRates } = useCurrencyContext();
  const { formatFromFiat, formatFromIze } = useFormattedPrice();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);

  const pendingBalance = 0;

  const availableIze = availableIzeBalance / 1000; // Convert mg to 1ze units
  const pendingIze = toIze(pendingBalance, 'GBP', goldRates);

  const loadFiatValue = Number(loadFiatInput || '0');
  const loadGrossIze = toIze(loadFiatValue, currencyCode, goldRates);
  const loadFeeIze = loadGrossIze * LOAD_IZE_FEE_RATE;
  const loadNetIze = Math.max(0, loadGrossIze - loadFeeIze);
  const loadFeeFiat = loadFiatValue * LOAD_IZE_FEE_RATE;
  const canLoadIze = Number.isFinite(loadFiatValue) && loadFiatValue > 0 && !isLoadingIze;
  const loadFeeRateLabel = `${Math.round(LOAD_IZE_FEE_RATE * 100)}%`;

  // Buy 1ze with Fiat calculations
  const buyFiatValue = Number(buyFiatInput || '0');
  const buyIzeAmount = toIze(buyFiatValue, currencyCode, goldRates);
  const canBuyIze = Number.isFinite(buyFiatValue) && buyFiatValue > 0 && buyFiatValue <= availableBalance && !isProcessing;

  // Convert 1ze to Fiat calculations
  const convertIzeValue = Number(convertIzeInput || '0');
  const convertFiatValue = convertIzeValue * (1 / toIze(1, currencyCode, goldRates)); // Reverse calculation
  const convertFee = convertFiatValue * CONVERT_FEE_RATE;
  const convertNetFiat = Math.max(0, convertFiatValue - convertFee);
  const canConvertIze = Number.isFinite(convertIzeValue) && convertIzeValue > 0 && convertIzeValue <= availableIze && !isProcessing;

  const filteredTransactions: { id: string; type: string; amount: number; title: string; date: string; status: string }[] = [];
  const txFilterOptions = useMemo(
    () =>
      TX_FILTERS.map((filter) => ({
        value: filter,
        label: filter.toUpperCase(),
        accessibilityLabel: filter === 'all' ? 'Show all transactions' : `Show ${filter} transactions`,
      })),
    []
  );

  React.useEffect(() => {
    let cancelled = false;
    const hydrateBalance = async () => {
      if (!currentUser?.id) {
        setIsHydratingBalance(false);
        return;
      }
      setIsHydratingBalance(true);
      try {
        const position = await getIzePosition(currentUser.id, currencyCode);
        if (cancelled) return;
        setAvailableIzeBalance(position.balances.userIze);
        setAvailableBalance(position.balances.userFiatValue);
      } catch {
        if (!cancelled) {
          setAvailableIzeBalance(0);
          setAvailableBalance(0);
        }
      } finally {
        if (!cancelled) {
          setIsHydratingBalance(false);
        }
      }
    };
    void hydrateBalance();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, currencyCode]);

  const handleConvertPress = () => {
    scrollRef.current?.scrollTo({ y: 460, animated: true });
    setTimeout(() => loadInputRef.current?.focus(), 220);
    show('Enter an amount to convert into 1ze.', 'info');
  };

  const handleLoadIze = async () => {
    if (!canLoadIze) {
      show('Enter a valid amount to convert into 1ze.', 'error');
      return;
    }

    if (!currentUser?.id) {
      show('Please sign in to load 1ze.', 'error');
      navigation.navigate('AuthLanding');
      return;
    }

    const loadAmountGbpRaw = convertDisplayToGbpAmount(loadFiatValue, currencyCode, goldRates);
    const loadAmountGbp = Number(loadAmountGbpRaw.toFixed(2));
    if (!Number.isFinite(loadAmountGbp) || loadAmountGbp <= 0) {
      show('Unable to convert that amount right now.', 'error');
      return;
    }

    setIsLoadingIze(true);
    try {
      const quote = await getIzeQuote({
        fiatCurrency: 'GBP',
        fiatAmount: loadAmountGbp,
      });
      const quoteFeeRate = quote.quote.platformFeeRate ?? LOAD_IZE_FEE_RATE;
      const quoteFeeAmount =
        quote.quote.platformFeeAmount ?? Number((quote.quote.fiatAmount * quoteFeeRate).toFixed(2));
      const quoteNetFiatAmount =
        quote.quote.netFiatAmount ?? Number((quote.quote.fiatAmount - quoteFeeAmount).toFixed(2));

      const intentResponse = await createPaymentIntent({
        userId: currentUser.id,
        channel: 'wallet_topup',
        amountGbp: quote.quote.fiatAmount,
        amountCurrency: 'GBP',
        idempotencyKey: `wallet_topup_${currentUser.id}_${Date.now()}`,
        metadata: {
          source: 'balance_screen_topup_intent',
          displayCurrency: currencyCode,
          enteredDisplayAmount: loadFiatValue,
          enteredGbpAmount: loadAmountGbp,
          platformFeeRate: quoteFeeRate,
          platformFeeAmount: quoteFeeAmount,
          netCreditedAmountGbp: quoteNetFiatAmount,
        },
      });

      let settledIntent = intentResponse.intent;
      if (settledIntent.status !== 'succeeded') {
        const confirmation = await confirmPaymentIntent(settledIntent.id, {
          simulateStatus: 'succeeded',
          payload: {
            source: 'balance_screen_manual_confirm',
          },
        });

        settledIntent = confirmation.intent;
      }

      if (settledIntent.status !== 'succeeded') {
        throw new Error('Payment intent could not be settled. Please try again.');
      }

      const mintResult = await mintIze({
        userId: currentUser.id,
        fiatAmount: quote.quote.fiatAmount,
        fiatCurrency: 'GBP',
        paymentIntentId: settledIntent.id,
        metadata: {
          source: 'balance_screen_load',
          displayCurrency: currencyCode,
          enteredDisplayAmount: loadFiatValue,
          enteredGbpAmount: loadAmountGbp,
          platformFeeRate: quoteFeeRate,
          platformFeeAmount: quoteFeeAmount,
          netCreditedAmountGbp: quoteNetFiatAmount,
          paymentIntentId: settledIntent.id,
        },
      });

      const netCreditedFiatGbp = mintResult.operation.netFiatAmount ?? mintResult.operation.fiatAmount;
      setAvailableBalance((prev) =>
        Number((prev + Number(netCreditedFiatGbp.toFixed(2))).toFixed(2))
      );
      setLoadFiatInput('');
      show(`Loaded ${formatIzeAmount(mintResult.operation.izeAmount)} into your wallet.`, 'success');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to load 1ze right now. Please try again shortly.');
      show(parsed.message, 'error');
    } finally {
      setIsLoadingIze(false);
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

      // Update balances
      setAvailableBalance(result.wallet.fiatBalance);
      setAvailableIzeBalance(result.wallet.onezeBalanceMg);
      setBuyFiatInput('');
      show(`Bought ${formatIzeAmount(result.purchase.izeAmount)} with ${formatFromFiat(result.purchase.fiatAmount, currencyCode, { displayMode: 'fiat' })}`, 'success');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to buy 1ze right now.');
      show(parsed.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConvertIzeToFiat = async () => {
    if (!canConvertIze || !currentUser?.id) {
      show('Enter a valid amount within your 1ze balance.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const result = await convertIzeToFiat({
        userId: currentUser.id,
        izeAmount: convertIzeValue,
        fiatCurrency: currencyCode,
      });

      // Update balances
      setAvailableBalance(result.wallet.fiatBalance);
      setAvailableIzeBalance(result.wallet.onezeBalanceMg);
      setConvertIzeInput('');
      show(`Converted ${formatIzeAmount(result.conversion.izeAmount)} to ${formatFromFiat(result.conversion.fiatAmount, currencyCode, { displayMode: 'fiat' })}`, 'success');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to convert 1ze right now.');
      show(parsed.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      <ScreenHeader
        title="1ze wallet"
        onBack={() => navigation.goBack()}
        variant="large"
      />

      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.pegInfoCard}>
          <OnezeCoinIcon size={18} />
          <Text style={styles.pegInfoText}>
            1ze is a closed-loop settlement credit. Live local reference value: {formatFromIze(1, { displayMode: 'fiat' })} per 1ze.
          </Text>
        </View>

        <View style={styles.heroGroup}>
          <ElevatedSurface variant="elevated" style={styles.balanceHero} contentStyle={{ alignItems: 'center' }}>
            <Text style={styles.balanceAmount}>{formatFromFiat(availableBalance, 'GBP', { displayMode: 'fiat' })}</Text>
            <Text style={styles.balanceIze}>{formatIzeAmount(availableIze)}</Text>
            <Text style={styles.balanceLabel}>available balance</Text>
            {isHydratingBalance && (
              <Text style={{ fontSize: 12, fontFamily: Typography.family.regular, color: Colors.textMuted, marginTop: 4 }}>
                Syncing balance...
              </Text>
            )}

            <View style={styles.balanceActions}>
              <AnimatedPressable
                style={styles.actionBtn}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('Withdraw')}
                accessibilityLabel="Withdraw funds"
                accessibilityHint="Opens withdrawal options for your wallet balance."
              >
                <View style={styles.actionCircle}>
                  <Ionicons name="library-outline" size={22} color={Colors.textPrimary} />
                </View>
                <Text style={styles.actionText}>withdraw</Text>
              </AnimatedPressable>

              <AnimatedPressable
                style={styles.actionBtn}
                activeOpacity={0.85}
                onPress={handleConvertPress}
                accessibilityLabel="Convert local currency to 1ze"
                accessibilityHint="Focuses the load input to start conversion."
              >
                <View style={styles.actionCircle}>
                  <Ionicons name="swap-horizontal-outline" size={22} color={Colors.textPrimary} />
                </View>
                <Text style={styles.actionText}>convert</Text>
              </AnimatedPressable>

              <AnimatedPressable
                style={styles.actionBtn}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('MainTabs')}
                accessibilityLabel="Go to marketplace"
                accessibilityHint="Navigates to main shopping tabs."
              >
                <View style={styles.actionCircle}>
                  <Ionicons name="cart-outline" size={22} color={Colors.textPrimary} />
                </View>
                <Text style={styles.actionText}>shop</Text>
              </AnimatedPressable>
            </View>
          </ElevatedSurface>

          <ElevatedSurface variant="subtle" style={styles.pendingCard} contentStyle={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={styles.pendingTitle}>pending balance</Text>
            </View>
            <View style={styles.pendingAmountCol}>
              <Text style={styles.pendingAmount}>{formatFromFiat(pendingBalance, 'GBP', { displayMode: 'fiat' })}</Text>
            </View>
          </ElevatedSurface>
        </View>

        <ElevatedSurface variant="surface" style={styles.loadCard}>
          {/* Tab Navigation */}
          <View style={styles.tabContainer}>
            <AnimatedPressable
              style={[styles.tab, convertTab === 'load' && styles.tabActive]}
              onPress={() => setConvertTab('load')}
            >
              <Text style={[styles.tabText, convertTab === 'load' && styles.tabTextActive]}>Load</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.tab, convertTab === 'buy' && styles.tabActive]}
              onPress={() => setConvertTab('buy')}
            >
              <Text style={[styles.tabText, convertTab === 'buy' && styles.tabTextActive]}>Buy</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.tab, convertTab === 'convert' && styles.tabActive]}
              onPress={() => setConvertTab('convert')}
            >
              <Text style={[styles.tabText, convertTab === 'convert' && styles.tabTextActive]}>Convert</Text>
            </AnimatedPressable>
          </View>

          {/* Load Tab - External Payment */}
          {convertTab === 'load' && (
            <>
              <Text style={styles.loadHint}>Convert your local currency into 1ze with a low {loadFeeRateLabel} platform spread.</Text>
              <Text style={styles.loadInputLabel}>Amount in {currencyCode}</Text>
              <TextInput
                ref={loadInputRef}
                style={styles.loadInput}
                value={loadFiatInput}
                onChangeText={(value) => setLoadFiatInput(value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                accessibilityLabel={`Amount in ${currencyCode}`}
                accessibilityHint="Enter the amount you want to convert into 1ze credits."
              />
              <View style={styles.loadSummaryRow}>
                <Text style={styles.loadSummaryLabel}>Gross 1ze</Text>
                <Text style={styles.loadSummaryValue}>{formatIzeAmount(loadGrossIze)}</Text>
              </View>
              <View style={styles.loadSummaryRow}>
                <Text style={styles.loadSummaryLabel}>Platform fee ({loadFeeRateLabel})</Text>
                <Text style={styles.loadSummaryValue}>{formatIzeAmount(loadFeeIze)} | {formatFromFiat(loadFeeFiat, currencyCode, { displayMode: 'fiat' })}</Text>
              </View>
              <View style={[styles.loadSummaryRow, styles.loadSummaryRowTotal]}>
                <Text style={styles.loadSummaryTotalLabel}>Net 1ze credited</Text>
                <Text style={styles.loadSummaryTotalValue}>{formatIzeAmount(loadNetIze)} | {formatFromIze(loadNetIze, { displayMode: 'fiat' })}</Text>
              </View>
              <AppButton
                title={isLoadingIze ? 'Loading...' : 'Load 1ze'}
                style={[styles.loadBtn, !canLoadIze && styles.loadBtnDisabled]}
                titleStyle={styles.loadBtnText}
                variant="primary"
                size="sm"
                onPress={handleLoadIze}
                disabled={!canLoadIze}
                accessibilityLabel="Load 1ze"
                accessibilityHint="Converts the entered amount into 1ze and credits your wallet."
              />
            </>
          )}

          {/* Buy Tab - Use Fiat Balance */}
          {convertTab === 'buy' && (
            <>
              <Text style={styles.loadHint}>Buy 1ze using your fiat balance. Available: {formatFromFiat(availableBalance, currencyCode, { displayMode: 'fiat' })}</Text>
              <Text style={styles.loadInputLabel}>Amount in {currencyCode}</Text>
              <TextInput
                ref={buyInputRef}
                style={styles.loadInput}
                value={buyFiatInput}
                onChangeText={(value) => setBuyFiatInput(value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                accessibilityLabel={`Amount in ${currencyCode}`}
                accessibilityHint="Enter the fiat amount to buy 1ze."
              />
              <View style={styles.loadSummaryRow}>
                <Text style={styles.loadSummaryLabel}>You will receive</Text>
                <Text style={styles.loadSummaryValue}>{formatIzeAmount(buyIzeAmount)}</Text>
              </View>
              <View style={[styles.loadSummaryRow, styles.loadSummaryRowTotal]}>
                <Text style={styles.loadSummaryTotalLabel}>Rate</Text>
                <Text style={styles.loadSummaryTotalValue}>1 1ze = {formatFromIze(1, { displayMode: 'fiat' })}</Text>
              </View>
              <AppButton
                title={isProcessing ? 'Processing...' : 'Buy 1ze'}
                style={[styles.loadBtn, !canBuyIze && styles.loadBtnDisabled]}
                titleStyle={styles.loadBtnText}
                variant="primary"
                size="sm"
                onPress={handleBuyIze}
                disabled={!canBuyIze}
                accessibilityLabel="Buy 1ze"
                accessibilityHint="Buys 1ze using your fiat balance."
              />
            </>
          )}

          {/* Convert Tab - 1ze to Fiat */}
          {convertTab === 'convert' && (
            <>
              <Text style={styles.loadHint}>Convert your 1ze to fiat for withdrawal. Available: {formatIzeAmount(availableIze)}</Text>
              <Text style={styles.loadInputLabel}>Amount in 1ze</Text>
              <TextInput
                ref={convertInputRef}
                style={styles.loadInput}
                value={convertIzeInput}
                onChangeText={(value) => setConvertIzeInput(value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                accessibilityLabel="Amount in 1ze"
                accessibilityHint="Enter the 1ze amount to convert to fiat."
              />
              <View style={styles.loadSummaryRow}>
                <Text style={styles.loadSummaryLabel}>Gross {currencyCode}</Text>
                <Text style={styles.loadSummaryValue}>{formatFromFiat(convertFiatValue, currencyCode, { displayMode: 'fiat' })}</Text>
              </View>
              <View style={styles.loadSummaryRow}>
                <Text style={styles.loadSummaryLabel}>Platform fee ({Math.round(CONVERT_FEE_RATE * 100)}%)</Text>
                <Text style={styles.loadSummaryValue}>{formatFromFiat(convertFee, currencyCode, { displayMode: 'fiat' })}</Text>
              </View>
              <View style={[styles.loadSummaryRow, styles.loadSummaryRowTotal]}>
                <Text style={styles.loadSummaryTotalLabel}>Net fiat credited</Text>
                <Text style={styles.loadSummaryTotalValue}>{formatFromFiat(convertNetFiat, currencyCode, { displayMode: 'fiat' })}</Text>
              </View>
              <AppButton
                title={isProcessing ? 'Processing...' : 'Convert to Fiat'}
                style={[styles.loadBtn, !canConvertIze && styles.loadBtnDisabled]}
                titleStyle={styles.loadBtnText}
                variant="primary"
                size="sm"
                onPress={handleConvertIzeToFiat}
                disabled={!canConvertIze}
                accessibilityLabel="Convert 1ze to fiat"
                accessibilityHint="Converts 1ze to fiat and credits your wallet."
              />
            </>
          )}
        </ElevatedSurface>

        <ElevatedSurface variant="surface" style={styles.historyCard}>
          <View style={styles.historyRow}>
            <View>
              <Text style={styles.historyTitle}>Balance history</Text>
            </View>
          </View>
          <AppButton
            title="History"
            trailingIcon={<Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />}
            style={styles.historyLinkRow}
            titleStyle={styles.historyTitle}
            trailingIconContainerStyle={styles.historyChevronWrap}
            variant="secondary"
            size="sm"
            align="start"
            onPress={() => navigation.navigate('BalanceHistory')}
            accessibilityLabel="Open balance history"
            accessibilityHint="Shows all wallet transactions and balance activity."
          />
        </ElevatedSurface>

        <PremiumListSection title="Recent Transactions">

        <AppSegmentControl
          style={styles.filterRow}
          options={txFilterOptions}
          value={activeTxFilter}
          onChange={setActiveTxFilter}
          optionStyle={styles.filterChip}
          optionActiveStyle={styles.filterChipActive}
          optionTextStyle={styles.filterChipText}
          optionTextActiveStyle={styles.filterChipTextActive}
        />

        {filteredTransactions.length === 0 && (
          <View style={[{ paddingVertical: 24, alignItems: 'center' }]}>
            <Ionicons name="receipt-outline" size={32} color={Colors.textMuted} style={{ marginBottom: 8 }} />
            <Text style={{ fontSize: 14, fontFamily: Typography.family.medium, color: Colors.textSecondary }}>
              No recent transactions
            </Text>
          </View>
        )}
        </PremiumListSection>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 20, paddingBottom: 34 },

  pegInfoCard: {
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TINT_CARD_BORDER,
    backgroundColor: TINT_CARD_BG,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pegInfoText: {
    flex: 1,
    color: TINT_TEXT,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Typography.family.semibold,
  },

  heroGroup: { marginBottom: 22, gap: 12 },
  balanceHero: { backgroundColor: Colors.surfaceAlt, borderRadius: 28, borderWidth: 0.5, borderColor: Colors.border, paddingTop: 22, paddingBottom: 18, alignItems: 'center' },
  balanceLabel: { fontSize: 10, fontFamily: Typography.family.regular, color: Colors.textMuted, letterSpacing: 0.92, marginBottom: 12, textTransform: 'uppercase' },
  balanceAmount: {
    fontSize: 96,
    lineHeight: 98,
    fontFamily: Typography.family.regular,
    color: Colors.brand,
    letterSpacing: -3.4,
    fontVariant: ['tabular-nums'],
  },
  balanceIze: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
    marginTop: 6,
    marginBottom: 8,
    fontVariant: ['tabular-nums'],
  },
  balanceActions: { flexDirection: 'row', gap: 14, marginTop: 4 },
  actionBtn: { alignItems: 'center', gap: 8 },
  actionCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.surfaceAlt, borderWidth: 0.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 11, fontFamily: Typography.family.medium, color: Colors.textSecondary },

  pendingCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surfaceAlt, borderRadius: 20, borderWidth: 0.5, borderColor: Colors.border, padding: 18 },
  pendingTitle: { fontSize: 14, fontFamily: Typography.family.semibold, color: Colors.textSecondary },
  pendingAmount: { fontSize: 24, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  pendingAmountCol: { alignItems: 'flex-end' },
  pendingIze: { fontSize: 12, fontFamily: Typography.family.medium, color: Colors.textSecondary, marginTop: 3 },

  loadCard: { backgroundColor: Colors.surfaceAlt, borderRadius: 20, borderWidth: 0.5, borderColor: Colors.border, padding: 18, marginBottom: 22 },
  loadTitle: { color: Colors.textPrimary, fontSize: 18, fontFamily: Typography.family.bold },
  loadHint: { marginTop: 4, color: Colors.textSecondary, fontSize: 13, fontFamily: Typography.family.medium, marginBottom: 12, lineHeight: 18 },
  loadInputLabel: { color: Colors.textMuted, fontSize: 11, fontFamily: Typography.family.bold, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  loadInput: {
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    color: Colors.textPrimary,
    fontSize: 18,
    fontFamily: Typography.family.bold,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  loadSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, gap: 10 },
  loadSummaryLabel: { color: Colors.textMuted, fontSize: 13, fontFamily: Typography.family.medium },
  loadSummaryValue: { color: Colors.textPrimary, fontSize: 13, fontFamily: Typography.family.bold, textAlign: 'right', maxWidth: '70%' },
  loadSummaryRowTotal: { marginTop: 4, borderTopWidth: 0.5, borderTopColor: Colors.border, paddingTop: 9 },
  loadSummaryTotalLabel: { color: Colors.textPrimary, fontSize: 14, fontFamily: Typography.family.bold },
  loadSummaryTotalValue: { color: Colors.textPrimary, fontSize: 13, fontFamily: Typography.family.bold, textAlign: 'right', maxWidth: '70%' },
  loadBtn: {
    marginTop: 12,
    borderRadius: 999,
    backgroundColor: Colors.brand,
    minHeight: 44,
    borderWidth: 0,
  },
  loadBtnDisabled: { opacity: 0.55 },
  loadBtnText: { color: Colors.background, fontSize: 13, fontFamily: Typography.family.bold },

  // Tab styles
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    padding: 4,
    gap: 4,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: Colors.brand,
  },
  tabText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.background,
  },

  historyCard: { backgroundColor: Colors.surfaceAlt, borderRadius: 20, borderWidth: 0.5, borderColor: Colors.border, padding: 18, marginBottom: 22 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, marginBottom: 12 },
  historyTitle: { fontSize: 16, fontFamily: Typography.family.semibold, color: Colors.textPrimary, marginBottom: 4 },
  historyDate: { fontSize: 13, fontFamily: Typography.family.regular, color: Colors.textSecondary },
  historyLinkRow: {
    borderRadius: 14,
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    minHeight: 36,
  },
  historyChevronWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },

  sectionTitle: { fontSize: 13, fontFamily: Typography.family.semibold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2, marginLeft: 6, marginBottom: 12 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 10, paddingHorizontal: 6 },
  filterChip: { borderRadius: 999, borderWidth: 0.5, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt, paddingHorizontal: 10, paddingVertical: 6 },
  filterChipActive: { borderColor: Colors.brand, backgroundColor: Colors.brand },
  filterChipText: { color: Colors.textSecondary, fontSize: 11, fontFamily: Typography.family.bold, letterSpacing: 0.4 },
  filterChipTextActive: { color: Colors.background },

  cardGroup: { backgroundColor: Colors.surfaceAlt, borderRadius: 20, borderWidth: 0.5, borderColor: Colors.border, paddingVertical: 12, paddingHorizontal: 16 },
  transactionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  txLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 16 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surfaceAlt, borderWidth: 0.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  txTitle: { fontSize: 14, fontFamily: Typography.family.semibold, color: Colors.textPrimary, marginBottom: 4, lineHeight: 18 },
  txDate: { fontSize: 12, color: Colors.textSecondary, fontFamily: Typography.family.regular, textTransform: 'capitalize', lineHeight: 16 },
  txStatusPending: { color: Colors.brand },
  txStatusCompleted: { color: Colors.textSecondary },
  txAmount: { fontSize: 15, fontFamily: Typography.family.bold, color: Colors.textPrimary },
});

