import React, { useRef, useState } from 'react';
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
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { useToast } from '../context/ToastContext';
import { Space, Radius, Type, Typography, DockConstants, LetterSpacing } from '../theme/designTokens';
import { AppButton } from '../components/ui/AppButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { haptics } from '../utils/haptics';
import { formatIzeAmount } from '../utils/currency';
import { convertGbpToDisplayAmount } from '../utils/currencyAuthoringFlows';
import { parseApiError } from '../lib/apiClient';
import {
  getIzePosition,
  getWalletSnapshot,
  getSellerWalletBalances,
  convertIzeToFiat,
  type SellerWalletBalanceItem,
} from '../services/walletApi';
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
import { useBiometricGate } from '../hooks/useBiometricGate';
import { BiometricGatePrompt } from '../components/security/BiometricGate';
import { WalletTransactionHistory } from '../components/wallet/WalletTransactionHistory';
import { AddMoneySheet } from '../components/wallet/AddMoneySheet';

type Props = NativeStackScreenProps<RootStackParamList, 'Wallet'>;

// Fee rate sourced from the central config in tradeFlow.ts (single source of truth)
import { CO_OWN_CONVERT_FEE_RATE as CONVERT_FEE_RATE } from '../utils/tradeFlow';

export default function WalletScreen({ navigation }: Props) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const currentUser = useStore((state) => state.currentUser);
  const { currencyCode, goldRates } = useCurrencyContext();
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const { isOffline } = useConnectivity();

  // ── Biometric gate (OWASP M5) ──
  // Wallet balances are sensitive. Require biometric re-authentication before
  // revealing any wallet content. Falls through when biometric is unavailable.
  const biometricGate = useBiometricGate();

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
  // Seller wallet: pending vs available balance with per-order breakdown.
  const [sellerBalances, setSellerBalances] = useState<{
    availableGbp: number;
    pendingGbp: number;
    heldInReserveGbp: number;
    pendingBreakdown: SellerWalletBalanceItem[];
  } | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  // ── Inline flow state ──
  // 'none' = collapsed; 'redeem' = Redeem 1ZE (convert to fiat) expanded.
  // Add money is handled by the extracted AddMoneySheet (spec 17).
  const [activeFlow, setActiveFlow] = useState<'none' | 'redeem'>('none');
  const [convertIzeInput, setConvertIzeInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [addMoneyVisible, setAddMoneyVisible] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
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
      getSellerWalletBalances(currentUser.id).catch(() => null),
    ])
      .then(([position, fiatWallet, sellerWallet]) => {
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
        if (sellerWallet) {
          setSellerBalances({
            availableGbp: sellerWallet.balances.availableGbp,
            pendingGbp: sellerWallet.balances.pendingGbp,
            heldInReserveGbp: sellerWallet.balances.heldInReserveGbp,
            pendingBreakdown: sellerWallet.pendingBreakdown,
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err, 'Unable to load wallet');
        show(parsed.message, 'error');
        setIsError(true);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
          // Finish refresh when the request settles — no fixed timer (spec 17).
          setRefreshing(false);
        }
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
  }, [loadBalance]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('CoOwnHub');
  }, [navigation]);

  // ── Flow expansion ( Redeem / Convert 1ZE to fiat) ──
  const expandFlow = React.useCallback((flow: 'redeem') => {
    haptics.tap();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveFlow((prev) => (prev === flow ? 'none' : flow));
  }, []);

  // ── Derived values for Redeem / Convert flow ──
  const availableIze = balance.available;
  const isWalletOperational = balance.reconciliationState === 'reconciled' && !isOffline;

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

  // ── Handlers (preserved — real API calls) ──
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

  // ── Add money (extracted AddMoneySheet — spec 17 dedicated flow) ──
  const handleAddMoney = React.useCallback(() => {
    haptics.tap();
    setAddMoneyVisible(true);
  }, []);

  // ── Activity (canonical WalletActivityScreen — spec 17) ──
  const handleViewActivity = React.useCallback(() => {
    haptics.tap();
    navigation.navigate('WalletActivity');
  }, [navigation]);

  // ── Seller earnings (extracted SellerEarningsScreen — spec 17) ──
  const handleViewEarnings = React.useCallback(() => {
    haptics.tap();
    navigation.navigate('SellerEarnings');
  }, [navigation]);

  const handleWithdraw = React.useCallback(() => {
    haptics.tap();
    navigation.navigate('Withdraw');
  }, [navigation]);

  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + DockConstants.dualActionHeight;

  // Auto-prompt biometric once availability is confirmed.
  React.useEffect(() => {
    if (biometricGate.status === 'locked' && !biometricGate.isAuthenticating) {
      void biometricGate.authenticate('Authenticate to view your wallet');
    }
  }, [biometricGate.status, biometricGate.isAuthenticating, biometricGate.authenticate]);

  // ── Biometric gate: block sensitive content until authenticated ──
  if (biometricGate.status === 'pending' || biometricGate.status === 'locked') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <BiometricGatePrompt
          gate={biometricGate}
          reason="Authenticate to view your wallet"
          header={
            <CoOwnMarketHeader
              title="Wallet"
              subtitle="Your 1ZE settlement balance"
              onBack={handleBack}
            />
          }
          onBack={handleBack}
        />
      </SafeAreaView>
    );
  }

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
          subtitle="Add money to start trading Co-Own units."
          actionLabel="Add money"
          onAction={handleAddMoney}
          emptyGraphicVariant="bag"
        />
        <AddMoneySheet
          visible={addMoneyVisible}
          onDismiss={() => setAddMoneyVisible(false)}
          availableFiatBalance={availableFiatBalance}
          isWalletOperational={isWalletOperational}
          onCompleted={loadBalance}
          userId={currentUser?.id}
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

        {/* ── Seller earnings summary (spec 17: "Seller earnings · £X available · £Y pending") ── */}
        {sellerBalances !== null && (sellerBalances.pendingGbp > 0 || sellerBalances.availableGbp > 0 || sellerBalances.heldInReserveGbp > 0) && (
          <Pressable
            style={({ pressed }) => [
              styles.earningsSummaryRow,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && { opacity: 0.7 },
            ]}
            onPress={handleViewEarnings}
            accessibilityRole="button"
            accessibilityLabel={`Seller earnings, ${formatFromFiat(sellerBalances.availableGbp, currencyCode, { displayMode: 'fiat' })} available, ${formatFromFiat(sellerBalances.pendingGbp, currencyCode, { displayMode: 'fiat' })} pending`}
            accessibilityHint="View seller earnings and release schedule"
          >
            <View style={styles.earningsSummaryInfo}>
              <Ionicons name="pricetag-outline" size={16} color={colors.brand} />
              <Text style={[styles.earningsSummaryText, { color: colors.textPrimary }]} numberOfLines={1}>
                Seller earnings ·{' '}
                <Text style={{ fontFamily: Typography.family.semibold }}>
                  {formatFromFiat(sellerBalances.availableGbp, currencyCode, { displayMode: 'fiat' })} available
                </Text>
                {' · '}
                <Text>
                  {formatFromFiat(sellerBalances.pendingGbp, currencyCode, { displayMode: 'fiat' })} pending
                </Text>
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </Pressable>
        )}

        {/* ── Add money / Redeem 1ZE — primary actions (spec 17 Viewport 1) ── */}
        <View style={styles.actionRow}>
          <AppButton
            title="Add money"
            icon={<Ionicons name="add-circle-outline" size={18} color={colors.background} />}
            onPress={handleAddMoney}
            variant="primary"
            size="md"
            accessibilityLabel="Add money to your wallet"
            accessibilityHint="Opens the add money flow"
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
            accessibilityLabel="Redeem 1ZE to fiat"
            accessibilityHint={activeFlow === 'redeem' ? 'Collapses the redeem form' : 'Expands the redeem form'}
            hapticFeedback="medium"
            style={styles.actionBtn}
            disabled={balance.available <= 0 || !isWalletOperational}
          />
        </View>

        {/* ── Redeem 1ZE flow (inline, expandable — Convert 1ZE to fiat) ── */}
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
              returnKeyType="done"
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

        {/* ── Quick actions: Withdraw + Activity (spec 17 — one Activity destination) ── */}
        <View style={styles.quickActionsRow}>
          <QuickAction
            icon="library-outline"
            label="Withdraw"
            onPress={handleWithdraw}
            colors={colors}
          />
          <QuickAction
            icon="receipt-outline"
            label="Activity"
            onPress={handleViewActivity}
            colors={colors}
          />
        </View>

        {/* ── Transaction history ── */}
        <View style={styles.txHistorySection}>
          <View style={styles.txHistoryHeader}>
            <Text style={[styles.txHistoryTitle, { color: colors.textPrimary }]}>Recent activity</Text>
            <Pressable
              onPress={handleViewActivity}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="View all activity"
            >
              <Text style={[styles.txHistorySeeAll, { color: colors.brand }]}>See all</Text>
            </Pressable>
          </View>
          <WalletTransactionHistory limit={20} />
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
                <Pressable
                  onPress={() => Linking.openURL(balance.safeguardingEvidenceUrl!)}
                  style={({ pressed }) => pressed && { opacity: 0.6 }}
                  accessibilityRole="link"
                  accessibilityLabel="View safeguarding evidence"
                  accessibilityHint="Opens in external browser"
                >
                  <Text style={[styles.safeguardingLink, { color: colors.brand }]}>Evidence</Text>
                </Pressable>
              ) : null}
              {balance.safeguardingTermsUrl ? (
                <Pressable
                  onPress={() => Linking.openURL(balance.safeguardingTermsUrl!)}
                  style={({ pressed }) => pressed && { opacity: 0.6 }}
                  accessibilityRole="link"
                  accessibilityLabel="View safeguarding terms"
                  accessibilityHint="Opens in external browser"
                >
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

      {/* ── Add money (extracted AddMoneySheet — spec 17 dedicated flow) ── */}
      <AddMoneySheet
        visible={addMoneyVisible}
        onDismiss={() => setAddMoneyVisible(false)}
        availableFiatBalance={availableFiatBalance}
        isWalletOperational={isWalletOperational}
        onCompleted={loadBalance}
        userId={currentUser?.id}
      />
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
      <View style={styles.quickActionCircle}>
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
  // ── Seller earnings summary row (spec 17 — compact, taps to SellerEarningsScreen) ──
  earningsSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Space.lg,
  },
  earningsSummaryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flex: 1,
  },
  earningsSummaryText: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
    flexShrink: 1,
  },
  // 24pt section spacing between major sections per spec
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.lg,
  },
  // Sections after the main wallet breakdown use 24pt (Space.lg) spacing
  actionBtn: { flex: 1 },

  // ── Flow cards (inline Redeem / Convert) ──
  flowCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.sm,
    marginTop: Space.lg,
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
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  inputLabel: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.captionElevated.letterSpacing,
    marginTop: Space.xs,
  },
  balanceHint: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
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
    width: Space.xl + Space.sm,
    height: Space.xl + Space.sm,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.captionElevated.letterSpacing,
  },

  // ── Transaction history ──
  txHistorySection: {
    marginTop: Space.lg,
  },
  txHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  // Section title uses subtitle for clear hierarchy — not a tiny uppercase label
  txHistoryTitle: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  txHistorySeeAll: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.captionElevated.letterSpacing,
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
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  infoBody: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight + 2,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  safeguardingLinksRow: {
    flexDirection: 'row',
    gap: Space.md,
    marginTop: Space.sm,
  },
  safeguardingLink: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: LetterSpacing.wide,
    textTransform: 'uppercase',
  },
});
