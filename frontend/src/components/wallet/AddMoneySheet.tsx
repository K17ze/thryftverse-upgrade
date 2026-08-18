/**
 * AddMoneySheet — focused Add money flow (spec 17).
 *
 * source → amount → review → confirm → receipt
 *
 * Two real funding sources, expressed as human goals (not "Load" vs "Buy"):
 *  - "Card or Apple Pay" — external fiat → 1ZE via Stripe PaymentSheet
 *    (preserves `createIzeMintQuote` + `createStripeIntentSheet` + idempotency)
 *  - "Fiat balance" — existing fiat balance → 1ZE (preserves `buyIze`)
 *
 * All financial truth (Stripe PaymentSheet, idempotency, reconciliation guard,
 * fee maths) is lifted verbatim from the previous inline WalletScreen flow.
 */
import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Platform,
  Pressable,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  initPaymentSheet,
  PaymentSheetError,
  presentPaymentSheet,
} from '@stripe/stripe-react-native';
import { BottomSheet } from '../BottomSheet';
import { AppButton } from '../ui/AppButton';
import { CoOwnNumericText } from '../ui/CoOwnNumericText';
import { useAppTheme } from '../../theme/ThemeContext';
import { useCurrencyContext } from '../../context/CurrencyContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { useToast } from '../../context/ToastContext';
import { useConnectivity } from '../../hooks/useConnectivity';
import { Space, Radius, Type, Typography, Stroke } from '../../theme/designTokens';
import { haptics } from '../../utils/haptics';
import { formatIzeAmount } from '../../utils/currency';
import { convertDisplayToGbpAmount } from '../../utils/currencyAuthoringFlows';
import { parseApiError } from '../../lib/apiClient';
import {
  createIzeMintQuote,
  createStripeIntentSheet,
  buyIze,
} from '../../services/walletApi';
import {
  configureStripeMobile,
  getStripeReturnUrl,
} from '../../platform/payments/stripeMobile';
import {
  CO_OWN_LOAD_FEE_RATE as LOAD_IZE_FEE_RATE,
} from '../../utils/tradeFlow';

/** Funding source — human goal, not internal "Load" vs "Buy" terminology. */
type FundingSource = 'card' | 'fiatBalance';

interface AddMoneySheetProps {
  visible: boolean;
  onDismiss: () => void;
  /** Current fiat balance (GBP) for the "fiat balance" source. */
  availableFiatBalance: number;
  /** Wallet operational guard (reconciled & online). */
  isWalletOperational: boolean;
  /** Called after a successful add so the parent can refresh balances. */
  onCompleted: () => void;
  /** Current user id (passed from parent to keep this sheet stateless of store). */
  userId: string | undefined;
}

export function AddMoneySheet({
  visible,
  onDismiss,
  availableFiatBalance,
  isWalletOperational,
  onCompleted,
  userId,
}: AddMoneySheetProps) {
  const { colors } = useAppTheme();
  const { currencyCode, goldRates } = useCurrencyContext();
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const { isOffline } = useConnectivity();

  const [source, setSource] = useState<FundingSource>('card');
  const [amountInput, setAmountInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [receipt, setReceipt] = useState<{ title: string; subtitle: string } | null>(null);
  const amountRef = useRef<TextInput>(null);
  const topupIdempotencyRef = useRef<{ fingerprint: string; key: string } | null>(null);

  // Reset internal state whenever the sheet is reopened.
  React.useEffect(() => {
    if (visible) {
      setSource('card');
      setAmountInput('');
      setReceipt(null);
      setIsProcessing(false);
    }
  }, [visible]);

  const fiatValue = Number(amountInput || '0');
  const grossIze = convertDisplayToGbpAmount(fiatValue, currencyCode, goldRates);
  const feeIze = grossIze * LOAD_IZE_FEE_RATE;
  const netIze = Math.max(0, grossIze - feeIze);
  const feeRateLabel = `${Math.round(LOAD_IZE_FEE_RATE * 100)}%`;

  const izeFromFiatBalance = convertDisplayToGbpAmount(fiatValue, currencyCode, goldRates);

  const canSubmitCard =
    Number.isFinite(fiatValue) &&
    fiatValue > 0 &&
    !isProcessing &&
    isWalletOperational;
  const canSubmitFiatBalance =
    Number.isFinite(fiatValue) &&
    fiatValue > 0 &&
    fiatValue <= availableFiatBalance &&
    !isProcessing &&
    isWalletOperational;
  const canSubmit = source === 'card' ? canSubmitCard : canSubmitFiatBalance;

  const sanitize = (v: string) => v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');

  // ── Card / Apple Pay → 1ZE (Stripe PaymentSheet) ──
  const handleCardAdd = async () => {
    if (!canSubmitCard) {
      show('Enter a valid amount to add to your wallet.', 'error');
      return;
    }
    if (!userId) {
      show('Sign in to add 1ZE.', 'error');
      return;
    }

    const loadAmountGbpRaw = convertDisplayToGbpAmount(fiatValue, currencyCode, goldRates);
    const loadAmountGbp = Number(loadAmountGbpRaw.toFixed(2));
    if (!Number.isFinite(loadAmountGbp) || loadAmountGbp <= 0) {
      show('Unable to convert that amount right now.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const topupFingerprint = `${userId}:GBP:${loadAmountGbp.toFixed(2)}`;
      if (topupIdempotencyRef.current?.fingerprint !== topupFingerprint) {
        topupIdempotencyRef.current = {
          fingerprint: topupFingerprint,
          key: `wallet_topup_${userId}_${Date.now()}`,
        };
      }
      const quoteResponse = await createIzeMintQuote({
        userId,
        fiatAmount: loadAmountGbp,
        fiatCurrency: 'GBP',
        idempotencyKey: topupIdempotencyRef.current.key,
        metadata: {
          source: 'wallet_addmoney_sheet_topup_quote',
          displayCurrency: currencyCode,
          enteredDisplayAmount: fiatValue,
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
        if (intent.nextActionUrl && (await Linking.canOpenURL(intent.nextActionUrl))) {
          await Linking.openURL(intent.nextActionUrl);
          setAmountInput('');
          show('Payment is pending. 1ZE is credited only after provider confirmation.', 'info');
        } else {
          show('This payment provider cannot complete checkout on this device.', 'error');
        }
        return;
      }

      setAmountInput('');
      topupIdempotencyRef.current = null;
      setReceipt({
        title: `${formatIzeAmount(quoteResponse.operation.izeAmount)} pending confirmation`,
        subtitle: '1ZE is credited once your payment provider confirms settlement.',
      });
      onCompleted();
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to add 1ZE right now. Try again shortly.');
      show(parsed.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Fiat balance → 1ZE ──
  const handleFiatBalanceAdd = async () => {
    if (!canSubmitFiatBalance) {
      show('Enter a valid amount within your fiat balance.', 'error');
      return;
    }
    if (!userId) {
      show('Sign in to add 1ZE.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const result = await buyIze({
        userId,
        fiatAmount: fiatValue,
        fiatCurrency: currencyCode,
      });
      setAmountInput('');
      setReceipt({
        title: `${formatIzeAmount(result.purchase.izeAmount)} added to your wallet`,
        subtitle: `Bought with ${formatFromFiat(result.purchase.fiatAmount, currencyCode, { displayMode: 'fiat' })} from your fiat balance.`,
      });
      onCompleted();
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to add 1ZE right now.');
      show(parsed.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = () => {
    haptics.tap();
    if (source === 'card') {
      void handleCardAdd();
    } else {
      void handleFiatBalanceAdd();
    }
  };

  const sourceOptions: Array<{
    value: FundingSource;
    label: string;
    hint: string;
    icon: keyof typeof Ionicons.glyphMap;
    disabled?: boolean;
  }> = [
    {
      value: 'card',
      label: 'Card or Apple Pay',
      hint: 'Add 1ZE from an external payment method.',
      icon: 'card-outline',
    },
    {
      value: 'fiatBalance',
      label: 'Fiat balance',
      hint: `Available: ${formatFromFiat(availableFiatBalance, currencyCode, { displayMode: 'fiat' })}`,
      icon: 'wallet-outline',
      disabled: availableFiatBalance <= 0,
    },
  ];

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoint={0.7}>
      <View style={styles.body}>
        {receipt ? (
          <View style={styles.receiptWrap}>
            <View style={[styles.receiptIcon, { backgroundColor: colors.success + '18' }]}>
              <Ionicons name="checkmark-circle" size={28} color={colors.success} />
            </View>
            <Text style={[styles.receiptTitle, { color: colors.textPrimary }]}>
              {receipt.title}
            </Text>
            <Text style={[styles.receiptSubtitle, { color: colors.textMuted }]}>
              {receipt.subtitle}
            </Text>
            <AppButton
              title="Done"
              onPress={onDismiss}
              variant="primary"
              size="md"
              style={styles.receiptDoneBtn}
              accessibilityLabel="Close add money"
            />
          </View>
        ) : (
          <>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Add money</Text>
            <Text style={[styles.sheetHint, { color: colors.textMuted }]}>
              Choose a source, enter an amount, then confirm.
            </Text>

            {/* ── Source step ── */}
            <Text style={[styles.stepLabel, { color: colors.textSecondary }]}>Source</Text>
            <View style={styles.sourceList}>
              {sourceOptions.map((opt) => {
                const selected = source === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={({ pressed }) => [
                      styles.sourceRow,
                      { borderColor: selected ? colors.brand : colors.border },
                      selected && { backgroundColor: colors.brand + '0D' },
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => {
                      if (opt.disabled) return;
                      haptics.selection();
                      setSource(opt.value);
                    }}
                    accessibilityRole="radio"
                    accessibilityLabel={opt.label}
                    accessibilityState={{ selected, disabled: !!opt.disabled }}
                    disabled={opt.disabled}
                  >
                    <View style={[styles.sourceIcon, { backgroundColor: colors.surfaceAlt }]}>
                      <Ionicons name={opt.icon} size={18} color={colors.textPrimary} />
                    </View>
                    <View style={styles.sourceInfo}>
                      <Text
                        style={[
                          styles.sourceLabel,
                          { color: opt.disabled ? colors.textMuted : colors.textPrimary },
                          selected && { fontFamily: Typography.family.semibold },
                        ]}
                      >
                        {opt.label}
                      </Text>
                      <Text style={[styles.sourceHint, { color: colors.textMuted }]} numberOfLines={1}>
                        {opt.hint}
                      </Text>
                    </View>
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={selected ? colors.brand : colors.textMuted}
                    />
                  </Pressable>
                );
              })}
            </View>

            {/* ── Amount step ── */}
            <Text style={[styles.stepLabel, { color: colors.textSecondary }]}>
              Amount in {currencyCode}
            </Text>
            <TextInput
              ref={amountRef}
              style={[styles.amountInput, { color: colors.textPrimary, borderColor: colors.border }]}
              value={amountInput}
              onChangeText={(v) => setAmountInput(sanitize(v))}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              returnKeyType="done"
              accessibilityLabel={`Amount in ${currencyCode}`}
              accessibilityHint="Enter the amount to add to your wallet."
            />

            {/* ── Review step ── */}
            {fiatValue > 0 && (
              <View style={[styles.reviewCard, { borderColor: colors.border }]}>
                {source === 'card' ? (
                  <>
                    <ReviewRow
                      label="Gross 1ZE"
                      value={<CoOwnNumericText value={grossIze} unit="1ZE" size="priceList" align="right" />}
                      colors={colors}
                    />
                    <ReviewRow
                      label={`Platform fee (${feeRateLabel})`}
                      value={<CoOwnNumericText value={feeIze} unit="1ZE" size="priceList" align="right" />}
                      colors={colors}
                    />
                    <ReviewRow
                      label="Net 1ZE credited"
                      value={<CoOwnNumericText value={netIze} unit="1ZE" size="price" align="right" />}
                      colors={colors}
                      total
                    />
                  </>
                ) : (
                  <>
                    <ReviewRow
                      label="You'll receive"
                      value={<CoOwnNumericText value={izeFromFiatBalance} unit="1ZE" size="priceList" align="right" />}
                      colors={colors}
                    />
                    <ReviewRow
                      label="From fiat balance"
                      value={
                        <Text style={[styles.reviewFiat, { color: colors.textPrimary }]}>
                          {formatFromFiat(fiatValue, currencyCode, { displayMode: 'fiat' })}
                        </Text>
                      }
                      colors={colors}
                      total
                    />
                  </>
                )}
              </View>
            )}

            {isOffline && (
              <Text style={[styles.offlineNote, { color: colors.danger }]}>
                You appear to be offline. Add money needs a connection.
              </Text>
            )}

            {/* ── Confirm step ── */}
            <AppButton
              title={isProcessing ? 'Processing…' : source === 'card' ? 'Continue to payment' : 'Add 1ZE'}
              onPress={handleConfirm}
              variant="primary"
              size="md"
              disabled={!canSubmit}
              loading={isProcessing}
              accessibilityLabel="Confirm add money"
              accessibilityHint="Reviews the amount and confirms the add money request."
              style={styles.confirmBtn}
            />
          </>
        )}
      </View>
    </BottomSheet>
  );
}

function ReviewRow({
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
      style={[
        styles.reviewRow,
        total && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          marginTop: Space.xs,
          paddingTop: Space.xs,
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Text
        style={[
          styles.reviewLabel,
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

const styles = StyleSheet.create({
  body: {
    flex: 1,
    gap: Space.sm,
  },
  sheetTitle: {
    fontSize: Type.title.size,
    lineHeight: Type.title.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.title.letterSpacing,
  },
  sheetHint: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight + 2,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  stepLabel: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.captionElevated.letterSpacing,
    marginTop: Space.xs,
  },
  sourceList: {
    gap: Space.xs,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
  },
  sourceIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceInfo: {
    flex: 1,
    gap: 2,
  },
  sourceLabel: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
  },
  sourceHint: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  amountInput: {
    borderWidth: Stroke.standard,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Platform.OS === 'ios' ? Space.sm : Space.xs,
    fontSize: Type.priceList.size,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
  },
  reviewCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.xs,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs,
  },
  reviewLabel: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  reviewFiat: {
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceList.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  offlineNote: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  confirmBtn: {
    marginTop: Space.xs,
  },
  receiptWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.xl,
  },
  receiptIcon: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptTitle: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
    textAlign: 'center',
  },
  receiptSubtitle: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight + 2,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
    textAlign: 'center',
  },
  receiptDoneBtn: {
    marginTop: Space.md,
    alignSelf: 'stretch',
  },
});
