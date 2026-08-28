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
import { formatIzeAmount, usdToIze } from '../../utils/currency';
import { SupportedCurrencyCode } from '../../constants/currencies';
import { convertDisplayToUsdAmount } from '../../utils/currencyAuthoringFlows';
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

/**
 * Funding source — human goal, not internal "Load" vs "Buy" terminology.
 */
type FundingSource = 'card' | 'fiatBalance';

/**
 * The backend quote response shape returned by `createIzeMintQuote`. We hold
 * a fetched quote in state so the review step can display the authoritative
 * fee breakdown (feeAmount / feeBps / totalCost) instead of a client-side
 * estimate. The quote also carries the Stripe PaymentIntent, which we reuse
 * on confirm so we never mint a duplicate intent.
 */
type IzeMintQuoteResponse = Awaited<ReturnType<typeof createIzeMintQuote>>;

/**
 * Estimated load fee used only while a backend quote is in flight (or when the
 * card path is unavailable). The backend quote is the source of truth; this is
 * a clearly-labelled estimate so the user is never shown a fabricated exact fee.
 */
const LOAD_FEE_BPS_ESTIMATE = 200;
const LOAD_FEE_RATE_ESTIMATE = LOAD_FEE_BPS_ESTIMATE / 10_000;

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
  const { currencyCode, fxRates } = useCurrencyContext();
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const { isOffline } = useConnectivity();

  const [source, setSource] = useState<FundingSource>('card');
  const [amountInput, setAmountInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [receipt, setReceipt] = useState<{ title: string; subtitle: string } | null>(null);
  /**
   * Backend quote fetched as a live preview for the card path. Held in state so
   * the review step can render the authoritative fee breakdown, and reused on
   * confirm to avoid minting a second PaymentIntent. `null` while loading or
   * when the current amount/source is not eligible for a card quote.
   */
  const [cardQuote, setCardQuote] = useState<{
    response: IzeMintQuoteResponse;
    idempotencyKey: string;
    fingerprint: string;
    expiresAtMs: number;
  } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const amountRef = useRef<TextInput>(null);

  // Reset internal state whenever the sheet is reopened.
  React.useEffect(() => {
    if (visible) {
      setSource('card');
      setAmountInput('');
      setReceipt(null);
      setIsProcessing(false);
      setCardQuote(null);
      setQuoteLoading(false);
    }
  }, [visible]);

  const fiatValue = Number(amountInput || '0');
  // ── At-par model: 1 1ZE = $1.00 USD ──
  // The user enters an amount in their display currency. We convert to GBP
  // (the settlement currency the backend quotes), then issue 1ZE at par. The
  // fee is a transparent additive line item — the user pays principal + fee
  // and receives principal in 1ZE.
  //
  // For the card path the authoritative breakdown comes from the backend
  // quote (cardQuote). The values below are a clearly-labelled estimate used
  // only while the quote is in flight or unavailable.
  const principalUsd = convertDisplayToUsdAmount(fiatValue, currencyCode, fxRates);
  const estimatedFeeUsd = principalUsd * LOAD_FEE_RATE_ESTIMATE;
  const estimatedTotalUsd = principalUsd + estimatedFeeUsd;
  const estimatedIzeReceived = usdToIze(principalUsd);
  const estimateFeeRateLabel = `${LOAD_FEE_BPS_ESTIMATE} bps`;

  // Backend quote breakdown for the card review (source of truth when present).
  const cardOp = cardQuote?.response.operation;
  const cardPrincipal = cardOp?.principalAmount ?? cardOp?.fiatAmount ?? principalUsd;
  const cardFee = cardOp?.feeAmount ?? cardOp?.platformFeeAmount ?? estimatedFeeUsd;
  const cardFeeBps = cardOp?.feeBps;
  const cardTotal = cardOp?.totalCost ?? (cardOp ? (cardPrincipal + cardFee) : estimatedTotalUsd);
  const cardIzeReceived = cardOp?.izeAmount ?? estimatedIzeReceived;
  const cardFeeLabel = cardFeeBps
    ? `Platform fee (${cardFeeBps} bps)`
    : `Platform fee (~${estimateFeeRateLabel})`;
  const cardQuoteCurrency: SupportedCurrencyCode = (cardOp?.fiatCurrency as SupportedCurrencyCode) ?? 'USD';

  const izeFromFiatBalance = usdToIze(
    convertDisplayToUsdAmount(fiatValue, currencyCode, fxRates)
  );
  // Fiat-balance path: no quote is fetched before confirm (buyIze executes on
  // confirm), so the fee is shown as an estimate in the user's display currency.
  const fiatBalanceEstimatedFee = fiatValue * LOAD_FEE_RATE_ESTIMATE;

  // ── Card path: fetch a live backend quote so the review step shows the
  //    authoritative fee breakdown (feeAmount / feeBps / totalCost) instead
  //    of a client-side estimate. The quote carries the Stripe PaymentIntent,
  //    which we reuse on confirm — no duplicate intent is minted. Debounced so
  //    we only request a quote once the user stops typing.
  React.useEffect(() => {
    if (source !== 'card') {
      setCardQuote(null);
      setQuoteLoading(false);
      return;
    }
    if (!userId || !isWalletOperational || !Number.isFinite(fiatValue) || fiatValue <= 0) {
      setCardQuote(null);
      setQuoteLoading(false);
      return;
    }

    const loadAmountUsd = Number(convertDisplayToUsdAmount(fiatValue, currencyCode, fxRates).toFixed(2));
    if (!Number.isFinite(loadAmountUsd) || loadAmountUsd <= 0) {
      setCardQuote(null);
      setQuoteLoading(false);
      return;
    }

    let cancelled = false;
    setQuoteLoading(true);
    const handle = setTimeout(async () => {
      const fingerprint = `${userId}:USD:${loadAmountUsd.toFixed(2)}`;
      const idempotencyKey = `wallet_topup_${userId}_${Date.now()}`;
      try {
        const response = await createIzeMintQuote({
          userId,
          fiatAmount: loadAmountUsd,
          fiatCurrency: 'USD',
          idempotencyKey,
          metadata: {
            source: 'wallet_addmoney_sheet_quote_preview',
            displayCurrency: currencyCode,
            enteredDisplayAmount: fiatValue,
            enteredUsdAmount: loadAmountUsd,
          },
        });
        if (cancelled) return;
        const expiresAtMs = response.quote.expiresAt
          ? Date.parse(response.quote.expiresAt)
          : Date.now() + response.quote.validForSeconds * 1000;
        setCardQuote({ response, idempotencyKey, fingerprint, expiresAtMs });
      } catch {
        if (cancelled) return;
        setCardQuote(null);
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, userId, fiatValue, currencyCode, fxRates, isWalletOperational]);

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

    const loadAmountUsdRaw = convertDisplayToUsdAmount(fiatValue, currencyCode, fxRates);
    const loadAmountUsd = Number(loadAmountUsdRaw.toFixed(2));
    if (!Number.isFinite(loadAmountUsd) || loadAmountUsd <= 0) {
      show('Unable to convert that amount right now.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      // Reuse the live preview quote when it is still valid — this avoids
      // minting a second PaymentIntent. Otherwise fall back to a fresh quote.
      const fingerprint = `${userId}:USD:${loadAmountUsd.toFixed(2)}`;
      const hasFreshQuote =
        cardQuote &&
        cardQuote.fingerprint === fingerprint &&
        Date.now() < cardQuote.expiresAtMs;

      let quoteResponse: IzeMintQuoteResponse;
      let idempotencyKey: string;
      if (hasFreshQuote && cardQuote) {
        quoteResponse = cardQuote.response;
        idempotencyKey = cardQuote.idempotencyKey;
      } else {
        idempotencyKey = `wallet_topup_${userId}_${Date.now()}`;
        quoteResponse = await createIzeMintQuote({
          userId,
          fiatAmount: loadAmountUsd,
          fiatCurrency: 'USD',
          idempotencyKey,
          metadata: {
            source: 'wallet_addmoney_sheet_topup_quote',
            displayCurrency: currencyCode,
            enteredDisplayAmount: fiatValue,
            enteredUsdAmount: loadAmountUsd,
          },
        });
      }

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
      setCardQuote(null);
      const op = quoteResponse.operation;
      const actualFee = op.platformFeeAmount ?? op.feeAmount;
      const feeLine = actualFee
        ? ` · Fee ${formatFromFiat(actualFee, (op.fiatCurrency as SupportedCurrencyCode) ?? 'GBP', { displayMode: 'fiat' })}`
        : '';
      setReceipt({
        title: `${formatIzeAmount(op.izeAmount)} pending confirmation`,
        subtitle: `${formatFromFiat(op.fiatAmount, (op.fiatCurrency as SupportedCurrencyCode) ?? 'GBP', { displayMode: 'fiat' })} → 1ZE at par${feeLine}. Credited once your payment provider confirms settlement.`,
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
      const idempotencyKey =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `buy_${userId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const result = await buyIze({
        userId,
        fiatAmount: fiatValue,
        fiatCurrency: currencyCode,
        idempotencyKey,
      });
      const p = result.purchase;
      setAmountInput('');
      setReceipt({
        title: `${formatIzeAmount(p.izeAmount)} added to your wallet`,
        subtitle: `Paid ${formatFromFiat(p.fiatAmount, currencyCode, { displayMode: 'fiat' })} · Fee (${p.feeBps} bps) ${formatFromFiat(p.feeFiat, currencyCode, { displayMode: 'fiat' })} · 1ZE received ${formatIzeAmount(p.izeAmount)}`,
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
            <View style={[styles.receiptIcon, { backgroundColor: colors.successSubtle }]}>
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
                      selected && { backgroundColor: colors.brandSubtle },
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

            {/* ── Review step — transparent at-par breakdown ── */}
            {fiatValue > 0 && (
              <View style={[styles.reviewCard, { borderColor: colors.border }]}>
                {source === 'card' ? (
                  <>
                    <ReviewRow
                      label="You're adding"
                      value={
                        <Text style={[styles.reviewFiat, { color: colors.textPrimary }]}>
                          {formatFromFiat(cardPrincipal, cardQuoteCurrency, { displayMode: 'fiat' })}
                        </Text>
                      }
                      colors={colors}
                    />
                    <ReviewRow
                      label="FX rate"
                      value={
                        <Text style={[styles.reviewRate, { color: colors.textSecondary }]}>
                          1 1ZE = $1.00 USD · at par
                        </Text>
                      }
                      colors={colors}
                    />
                    <ReviewRow
                      label={cardQuote ? cardFeeLabel : `Platform fee (~${estimateFeeRateLabel}, estimate)`}
                      value={
                        <Text style={[styles.reviewFiat, { color: colors.textPrimary }]}>
                          {formatFromFiat(cardFee, cardQuoteCurrency, { displayMode: 'fiat' })}
                          {!cardQuote && quoteLoading ? ' …' : ''}
                        </Text>
                      }
                      colors={colors}
                    />
                    <ReviewRow
                      label="You receive"
                      value={<CoOwnNumericText value={cardIzeReceived} unit="1ZE" size="priceList" align="right" />}
                      colors={colors}
                    />
                    <ReviewRow
                      label="Total charge"
                      value={
                        <Text style={[styles.reviewFiat, { color: colors.textPrimary }]}>
                          {formatFromFiat(cardTotal, cardQuoteCurrency, { displayMode: 'fiat' })}
                        </Text>
                      }
                      colors={colors}
                      total
                    />
                    {!cardQuote && !quoteLoading && (
                      <Text style={[styles.reviewRate, { color: colors.textMuted }]}>
                        Fee shown is an estimate — the exact amount is confirmed at payment.
                      </Text>
                    )}
                  </>
                ) : (
                  <>
                    <ReviewRow
                      label="You pay"
                      value={
                        <Text style={[styles.reviewFiat, { color: colors.textPrimary }]}>
                          {formatFromFiat(fiatValue, currencyCode, { displayMode: 'fiat' })}
                        </Text>
                      }
                      colors={colors}
                    />
                    <ReviewRow
                      label={`Fee (~${estimateFeeRateLabel}, estimate)`}
                      value={
                        <Text style={[styles.reviewFiat, { color: colors.textPrimary }]}>
                          {formatFromFiat(fiatBalanceEstimatedFee, currencyCode, { displayMode: 'fiat' })}
                        </Text>
                      }
                      colors={colors}
                    />
                    <ReviewRow
                      label="1ZE received"
                      value={<CoOwnNumericText value={izeFromFiatBalance} unit="1ZE" size="priceList" align="right" />}
                      colors={colors}
                      total
                    />
                    <Text style={[styles.reviewRate, { color: colors.textMuted }]}>
                      Fee shown is an estimate — the exact amount is confirmed on execution.
                    </Text>
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
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight + 2,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  stepLabel: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.caption.letterSpacing,
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
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
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
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  reviewFiat: {
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceList.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  reviewRate: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  offlineNote: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.caption.letterSpacing,
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
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight + 2,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
    textAlign: 'center',
  },
  receiptDoneBtn: {
    marginTop: Space.md,
    alignSelf: 'stretch',
  },
});
