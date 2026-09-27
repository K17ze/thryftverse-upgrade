import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AppButton } from '../components/ui/AppButton';
import { ConvertSkeleton } from '../components/wallet/ConvertSkeleton';
import { ConvertSummaryRow } from '../components/wallet/ConvertSummaryRow';
import { createConvertStyles } from '../components/wallet/convertStyles';
import {
  getConvertActiveStepIndex,
  type ConvertStep } from '../components/wallet/convertViewModels';

import { useAppTheme } from '../theme/ThemeContext';
import {
  IconGrammar,
  LetterSpacing,
  Radius,
  Space,
  Typography } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { useConnectivity } from '../hooks/useConnectivity';
import { useBiometricGate } from '../hooks/useBiometricGate';
import { useScreenCaptureProtection } from '../platform/screenCapture';
import { useAppTranslation } from '../i18n/useAppTranslation';
import { parseApiError } from '../lib/apiClient';
import {
  createFxQuote,
  executeFxQuote,
  formatMinorAmount,
  getCurrencyBalances,
  getFxQuote,
  majorToMinorUnits,
  type FxQuotePayload,
  type WalletCurrencyPocket } from '../services/fxApi';
import { CURRENCIES, type SupportedCurrencyCode } from '../constants/currencies';
import { sanitizeDecimalInput } from '../utils/currencyAuthoringFlows';
import { COPY } from '../constants/copy';

// WalletExchangeScreen — the fiat↔fiat converter for the multi-currency
// wallet. Mirrors the WalletConvertScreen decomposition: pocket hydration
// (GET /wallets/:id/currency-balances), a debounced live preview
// (POST /wallet/fx/quotes, fixedSide 'source'), a server-TTL countdown
// driven by quote.expiresAt, and the amount → review → authenticating →
// executing → receipt / error state machine with biometric gating and
// idempotent execution by quote id.

const SUPPORTED_CODES = Object.keys(CURRENCIES) as SupportedCurrencyCode[];

interface FxReceipt {
  txId: string;
  sentMinor: string;
  receivedMinor: string;
  feeMinor: string;
  feeCurrency: string;
  rate: string;
  sourceCurrency: string;
  targetCurrency: string;
  timestamp: string;
}

function toSupported(code: string): SupportedCurrencyCode | null {
  const upper = code.toUpperCase();
  return (SUPPORTED_CODES as string[]).includes(upper)
    ? (upper as SupportedCurrencyCode)
    : null;
}

/** Customer rate display — significant digits so tiny JPY-side rates stay legible. */
function formatRateValue(rate: string): string {
  const value = Number(rate);
  if (!Number.isFinite(value) || value <= 0) {
    return rate;
  }
  return value.toLocaleString('en-GB', { maximumSignificantDigits: 6 });
}

/**
 * Server timestamps arrive as ISO-8601; older rows may still come back as
 * PG text ('YYYY-MM-DD HH:MM:SS.ffffff+TZ'). Normalise the space separator
 * to 'T', expand a bare-hour offset ('+00' → '+00:00'), and assume UTC when
 * no zone designator is present so Hermes' ISO-only Date parser handles
 * both shapes. Returns epoch ms, or NaN for unparseable input.
 */
function parseServerTimestamp(value: string | null | undefined): number {
  if (!value) {
    return NaN;
  }
  let normalized = value.trim().replace(' ', 'T');
  if (normalized.includes('T') && /[+-]\d{2}$/.test(normalized)) {
    normalized += ':00';
  } else if (!/([zZ]|[+-]\d{2}:?\d{2})$/.test(normalized)) {
    normalized += 'Z';
  }
  return Date.parse(normalized);
}

function formatTimestamp(iso: string): string {
  const ms = parseServerTimestamp(iso);
  if (!Number.isFinite(ms)) {
    return '';
  }
  return new Date(ms).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit' });
}

export default function WalletExchangeScreen() {
  useScreenCaptureProtection();
  const navigation = useNavigation<any>();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createConvertStyles(colors), [colors]);
  const haptic = useHaptic();
  const { show } = useToast();
  const { isOffline } = useConnectivity();
  const currentUser = useStore((state) => state.currentUser);
  const { t } = useAppTranslation('walletFx');
  const biometricGate = useBiometricGate();

  // ── Pocket hydration (GET /wallets/:userId/currency-balances) ──
  const [pockets, setPockets] = useState<WalletCurrencyPocket[] | null>(null);
  const [isHydratingBalance, setIsHydratingBalance] = useState(true);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceNonce, setBalanceNonce] = useState(0);
  const pairSeededRef = useRef(false);

  const [sourceCurrency, setSourceCurrency] = useState<SupportedCurrencyCode>('GBP');
  const [targetCurrency, setTargetCurrency] = useState<SupportedCurrencyCode>('USD');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    const userId = currentUser?.id;
    if (!userId) {
      setPockets([]);
      setIsHydratingBalance(false);
      return;
    }
    let cancelled = false;
    setIsHydratingBalance(true);
    setBalanceError(null);
    getCurrencyBalances(userId)
      .then((payload) => {
        if (cancelled) return;
        const merged = new Map<string, WalletCurrencyPocket>();
        payload.balances.forEach((pocket) => merged.set(pocket.currency, pocket));
        merged.set(payload.fiatCurrency, {
          currency: payload.fiatCurrency,
          balanceMinor: payload.fiatBalanceMinor,
          version: merged.get(payload.fiatCurrency)?.version ?? 0 });
        const list = Array.from(merged.values());
        setPockets(list);
        // Seed the pair once: source = the wallet's default fiat pocket,
        // target = the first other funded pocket (or a sensible default).
        if (!pairSeededRef.current) {
          pairSeededRef.current = true;
          const source = toSupported(payload.fiatCurrency) ?? 'GBP';
          const other = list.find(
            (pocket) => pocket.currency !== source && pocket.balanceMinor !== 0 && toSupported(pocket.currency)
          );
          setSourceCurrency(source);
          setTargetCurrency(
            other ? (toSupported(other.currency) as SupportedCurrencyCode) : source === 'USD' ? 'GBP' : 'USD'
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Honest failure — a fabricated 0 pocket would render a false
          // "insufficient balance" and hide real spendable funds.
          setBalanceError(t('errorBalanceLoad'));
        }
      })
      .finally(() => {
        if (!cancelled) setIsHydratingBalance(false);
      });
    return () => { cancelled = true; };
  }, [currentUser?.id, balanceNonce, t]);

  // ── Derived amount / balance values ──
  const amountMajor = Number(amount || '0');
  const amountMinorStr = useMemo(
    () => majorToMinorUnits(Number.isFinite(amountMajor) ? amountMajor : 0, sourceCurrency),
    [amountMajor, sourceCurrency]
  );
  const sourcePocket = pockets?.find(
    (pocket) => pocket.currency.toUpperCase() === sourceCurrency
  );
  const sourceBalanceMinor = sourcePocket?.balanceMinor ?? 0;
  const exceedsBalance = amountMajor > 0 && Number(amountMinorStr) > sourceBalanceMinor;

  // ── Idempotency: one key per (amount, pair, refetch) attempt ──
  // Preview fetches within the same input set share a key so a retried
  // quote creation dedupes server-side; an expiry refetch bumps the nonce
  // and mints a fresh key so the server never replays a stale quote.
  const quoteKeyRef = useRef<string | null>(null);
  const newAttemptKey = () => {
    quoteKeyRef.current =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `fx_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return quoteKeyRef.current;
  };

  // ── Debounced live quote (POST /wallet/fx/quotes, fixedSide 'source') ──
  const [quote, setQuote] = useState<FxQuotePayload | null>(null);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState(false);
  const [quoteNonce, setQuoteNonce] = useState(0);
  // Consecutive expiry-triggered auto-refetches — capped so a fast device
  // clock (every fresh quote looks dead on arrival) can't loop the fetch
  // forever. Reset by user intent: amount/pair edits or a manual retry.
  const autoRefetchesRef = useRef(0);

  useEffect(() => {
    quoteKeyRef.current = null;
  }, [amountMinorStr, sourceCurrency, targetCurrency, quoteNonce]);

  useEffect(() => {
    autoRefetchesRef.current = 0;
  }, [amountMinorStr, sourceCurrency, targetCurrency]);

  useEffect(() => {
    if (amountMajor <= 0 || exceedsBalance || sourceCurrency === targetCurrency) {
      setQuote(null);
      setQuoteError(false);
      return;
    }
    let cancelled = false;
    const debounce = setTimeout(async () => {
      setIsFetchingQuote(true);
      setQuoteError(false);
      try {
        const response = await createFxQuote({
          sourceCurrency,
          targetCurrency,
          fixedSide: 'source',
          amountMinor: amountMinorStr,
          idempotencyKey: quoteKeyRef.current ?? newAttemptKey() });
        if (!cancelled) {
          // A live quote resets the auto-refetch budget; one that arrives
          // already expired (fast device clock) keeps counting toward it.
          if (parseServerTimestamp(response.quote.expiresAt) > Date.now()) {
            autoRefetchesRef.current = 0;
          }
          setQuote(response.quote);
        }
      } catch {
        if (!cancelled) {
          setQuote(null);
          setQuoteError(true);
        }
      } finally {
        if (!cancelled) {
          setIsFetchingQuote(false);
        }
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountMinorStr, sourceCurrency, targetCurrency, exceedsBalance, quoteNonce]);

  const handleRetryQuote = useCallback(() => {
    autoRefetchesRef.current = 0; // Manual retry is user intent — restart the budget.
    setQuoteNonce((n) => n + 1);
  }, []);

  // ── Quote expiry countdown — driven by quote.expiresAt (server TTL),
  //    NOT the synthetic 30-minute client rate window ──
  const expiryMs = quote ? parseServerTimestamp(quote.expiresAt) : NaN;
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  useEffect(() => {
    if (!Number.isFinite(expiryMs)) {
      setRemainingMs(null);
      return;
    }
    const tick = () => setRemainingMs(Math.max(0, expiryMs - Date.now()));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiryMs]);

  const isQuoteExpired = remainingMs !== null && remainingMs <= 0;
  const quoteExpiryLabel = useMemo(() => {
    if (remainingMs === null || remainingMs <= 0) return '';
    const mins = Math.floor(remainingMs / 60000);
    const secs = Math.floor((remainingMs % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, [remainingMs]);
  const rateObservedLabel = useMemo(
    () => (quote ? formatTimestamp(quote.rateObservedAt) : ''),
    [quote]
  );

  // Quote-expired → auto-refetch a fresh rate while composing or reviewing.
  // Capped at 3 consecutive attempts — past that the expired state stays
  // visible with the manual Refresh CTA (FxRateTimestamp) doing the retry.
  const [step, setStep] = useState<ConvertStep>('amount');
  useEffect(() => {
    if (isQuoteExpired && (step === 'amount' || step === 'review')) {
      if (autoRefetchesRef.current >= 3) {
        return;
      }
      autoRefetchesRef.current += 1;
      setQuoteNonce((n) => n + 1);
    }
  }, [isQuoteExpired, step]);

  // ── Submission state machine ──
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<FxReceipt | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const isWalletOperational = !isOffline;
  const canReview =
    Number.isFinite(amountMajor) &&
    amountMajor > 0 &&
    !exceedsBalance &&
    quote !== null &&
    !isFetchingQuote &&
    !quoteError &&
    !isQuoteExpired &&
    !isExecuting &&
    isWalletOperational;
  const canConfirm = canReview;

  const handleReview = () => {
    if (!canReview) return;
    haptic.medium();
    setStep('review');
  };

  const handleBackToAmount = () => {
    haptic.light();
    setStep('amount');
  };

  const handleExecute = async () => {
    const activeQuote = quote;
    if (!currentUser?.id) {
      show(t('signInRequired'), 'error');
      navigation.navigate('AuthLanding');
      return;
    }
    if (!activeQuote) {
      setStep('amount');
      return;
    }

    setStep('executing');
    setIsExecuting(true);
    try {
      // Idempotent by quote id: retrying the same quote returns the stored
      // execution rather than debiting the pocket a second time.
      const response = await executeFxQuote(activeQuote.id);
      const execution = response.execution;
      setResult({
        txId: execution.txId,
        sentMinor: execution.debitedSourceMinor,
        receivedMinor: execution.creditedTargetMinor,
        feeMinor: execution.feeMinor,
        feeCurrency: activeQuote.feeCurrency,
        rate: activeQuote.customerRate,
        sourceCurrency: activeQuote.sourceCurrency,
        targetCurrency: activeQuote.targetCurrency,
        timestamp: new Date().toISOString() });
      // Refresh pockets so the wallets screen and this screen agree.
      setBalanceNonce((n) => n + 1);
      haptic.success();
      setStep('receipt');
    } catch (error) {
      const parsed = parseApiError(error, t('errorGeneric'));
      if (parsed.code === 'FX_QUOTE_NOT_OPEN' || parsed.code === 'FX_QUOTE_EXPIRED') {
        // A dropped execute response can leave the client blind to a
        // committed exchange — resync the stored quote before deciding
        // this is a real failure.
        try {
          const stored = (await getFxQuote(activeQuote.id)).quote;
          if (stored.status === 'executed') {
            const executedMs = parseServerTimestamp(stored.executedAt);
            setResult({
              txId: stored.txId ?? stored.id,
              sentMinor: stored.sourceAmountMinor,
              receivedMinor: stored.targetAmountMinor,
              feeMinor: stored.feeMinor,
              feeCurrency: stored.feeCurrency,
              rate: stored.customerRate,
              sourceCurrency: stored.sourceCurrency,
              targetCurrency: stored.targetCurrency,
              timestamp: Number.isFinite(executedMs)
                ? new Date(executedMs).toISOString()
                : new Date().toISOString() });
            setBalanceNonce((n) => n + 1);
            haptic.success();
            setStep('receipt');
            return;
          }
          if (stored.status === 'expired') {
            setQuoteNonce((n) => n + 1);
            show(t('quoteExpiredInline'), 'info');
            setStep('review');
            return;
          }
        } catch {
          // Resync failed — surface the original execute error below.
        }
      }
      if (parsed.code === 'FX_QUOTE_EXPIRED') {
        // Fetch a fresh quote and land back on review — never fabricate a
        // new rate client-side.
        setQuoteNonce((n) => n + 1);
        show(t('quoteExpiredInline'), 'info');
        setStep('review');
      } else if (parsed.code === 'WALLET_INSUFFICIENT_BALANCE') {
        // Pocket view was stale — refetch so exceedsBalance recomputes
        // against the ledger truth and the inline state shows.
        setBalanceNonce((n) => n + 1);
        show(parsed.message, 'error');
        setStep('amount');
      } else {
        const isNetworkError =
          isOffline ||
          parsed.isNetworkError ||
          (error instanceof Error && /network|fetch|timeout/i.test(error.message));
        setErrorMessage(isNetworkError ? t('errorDropped') : parsed.message);
        haptic.error();
        setStep('error');
      }
    } finally {
      if (isMountedRef.current) setIsExecuting(false);
    }
  };

  const handleConfirm = async () => {
    if (!canConfirm) return;
    haptic.medium();
    setStep('authenticating');
    const success = await biometricGate.authenticate(t('authReason'));
    if (success) {
      void handleExecute();
    }
    // On failure the authenticating step shows retry / cancel.
  };

  const handleRetryAuth = async () => {
    haptic.light();
    const success = await biometricGate.authenticate(t('authReason'));
    if (success) {
      void handleExecute();
    }
  };

  const handleCancelAuth = () => {
    haptic.light();
    setStep('review');
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
    if (isExecuting) return; // Back disabled during execution
    haptic.light();
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Wallet');
    }
  };

  // ── Currency pair handlers — selecting the other side's code swaps. ──
  const handleSelectSource = (code: SupportedCurrencyCode) => {
    if (code === targetCurrency) {
      setTargetCurrency(sourceCurrency);
    }
    setSourceCurrency(code);
  };
  const handleSelectTarget = (code: SupportedCurrencyCode) => {
    if (code === sourceCurrency) {
      setSourceCurrency(targetCurrency);
    }
    setTargetCurrency(code);
  };
  const handleSwap = () => {
    haptic.light();
    setSourceCurrency(targetCurrency);
    setTargetCurrency(sourceCurrency);
  };

  const sendValueLabel = formatMinorAmount(amountMinorStr, sourceCurrency);
  const rateValueLabel = `1 ${sourceCurrency} = ${quote ? formatRateValue(quote.customerRate) : '—'} ${targetCurrency}`;

  // ── Loading skeleton ──
  if (isHydratingBalance && pockets === null) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title={t('title')} onBack={handleBack} />}
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      >
        <ConvertSkeleton />
      </FlagshipScreen>
    );
  }

  // ── Balance load failure — never fall through to a fabricated £0 form ──
  if (balanceError && pockets === null) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title={t('title')} onBack={handleBack} />}
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      >
        <ErrorState
          title={t('errorTitle')}
          message={balanceError}
          tryAgainLabel={t('errorTryAgain')}
          cancelLabel={t('errorCancel')}
          onTryAgain={() => setBalanceNonce((n) => n + 1)}
          onCancel={handleBack}
        />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={<FlagshipHeader title={t('title')} onBack={handleBack} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      stickyFooter={
        <ExchangeFooter
          step={step}
          canReview={canReview}
          canConfirm={canConfirm}
          onReview={handleReview}
          onConfirm={handleConfirm}
          onBackToAmount={handleBackToAmount}
          onDone={handleDone}
        />
      }
    >
      {isOffline && step === 'amount' && (
        <View
          style={[
            styles.offlineBanner,
            { backgroundColor: colors.dangerSubtle, borderBottomColor: colors.border },
          ]}
        >
          <Ionicons name="cloud-offline-outline" size={IconGrammar.metadata} color={colors.dangerText} />
          <Text style={[styles.offlineBannerText, { color: colors.textPrimary }]}>
            {COPY.offline}
          </Text>
        </View>
      )}

      <ExchangeStepIndicator step={step} />

      <KeyboardAwareScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        scrollEnabled={step === 'amount'}
      >
        {/* ================================================================ */}
        {/* STEP 1: AMOUNT — pair pickers, amount input, live quote preview  */}
        {/* ================================================================ */}
        {step === 'amount' && (
          <>
            <View style={styles.balanceBlock}>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                {formatMinorAmount(sourceBalanceMinor, sourceCurrency)}
              </Text>
              <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                {t('availableBalance', { currency: sourceCurrency })}
              </Text>
            </View>

            {/* You send — source currency chips */}
            <Text style={[fxStyles.pairLabel, { color: colors.textMuted }]}>{t('youSend')}</Text>
            <CurrencyChipRow
              selected={sourceCurrency}
              onSelect={handleSelectSource}
              groupA11y={t('a11y.currencyFrom')}
              optionA11y={(code) => t('a11y.selectCurrency', { currency: code })}
            />

            {/* Amount input — major units, localized decimal entry */}
            <View>
              <View style={styles.amountWrap}>
                <Text style={styles.amountSuffix}>{sourceCurrency}</Text>
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
                  placeholder={t('amountPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel={t('a11y.amountInput', { currency: sourceCurrency })}
                />
              </View>
              <Text style={styles.availableText}>
                {t('available', { amount: formatMinorAmount(sourceBalanceMinor, sourceCurrency) })}
              </Text>
              {exceedsBalance ? (
                <Text style={styles.balanceError}>
                  {t('insufficient', { currency: sourceCurrency })}
                </Text>
              ) : null}
            </View>

            {/* Swap direction */}
            <View style={fxStyles.swapRow}>
              <View style={[fxStyles.swapLine, { backgroundColor: colors.border }]} />
              <Pressable
                onPress={handleSwap}
                hitSlop={8}
                style={fxStyles.swapBtn}
                accessibilityRole="button"
                accessibilityLabel={t('swap')}
                accessibilityHint={t('swapHint')}
              >
                <Ionicons name="swap-vertical" size={IconGrammar.standard} color={colors.textPrimary} />
              </Pressable>
              <View style={[fxStyles.swapLine, { backgroundColor: colors.border }]} />
            </View>

            {/* You receive — target currency chips */}
            <Text style={[fxStyles.pairLabel, { color: colors.textMuted }]}>{t('youReceive')}</Text>
            <CurrencyChipRow
              selected={targetCurrency}
              onSelect={handleSelectTarget}
              groupA11y={t('a11y.currencyTo')}
              optionA11y={(code) => t('a11y.selectCurrency', { currency: code })}
            />

            {/* Live preview — debounced backend quote, full disclosure */}
            {amountMajor > 0 && !exceedsBalance && (
              <View>
                <View style={styles.calcBlock}>
                  {isFetchingQuote ? (
                    <View style={styles.quoteLoadingRow}>
                      <ActivityIndicator size="small" color={colors.textMuted} />
                      <Text style={[styles.quoteStatusText, { color: colors.textMuted }]}>
                        {t('fetchingQuote')}
                      </Text>
                    </View>
                  ) : quoteError ? (
                    <View style={styles.quoteErrorRow}>
                      <Ionicons name="alert-circle-outline" size={14} color={colors.dangerText} />
                      <Text style={[styles.quoteStatusText, { color: colors.dangerText }]}>
                        {t('quoteFailed')}
                      </Text>
                      <Pressable
                        hitSlop={8}
                        onPress={handleRetryQuote}
                        accessibilityRole="button"
                        accessibilityLabel={t('a11y.retryQuote')}
                      >
                        <Text style={[styles.quoteStatusText, { color: colors.brand }]}>
                          {t('retry')}
                        </Text>
                      </Pressable>
                    </View>
                  ) : quote ? (
                    <>
                      <ConvertSummaryRow label={t('youSend')} value={sendValueLabel} />
                      <ConvertSummaryRow
                        label={t('fee', { bps: quote.spreadBps })}
                        value={`−${formatMinorAmount(quote.feeMinor, quote.feeCurrency)}`}
                      />
                      <ConvertSummaryRow label={t('rateLabel')} value={rateValueLabel} />
                      <ConvertSummaryRow
                        label={t('youReceive')}
                        value={formatMinorAmount(quote.targetAmountMinor, targetCurrency)}
                        total
                      />
                    </>
                  ) : null}
                </View>
                {quote ? (
                  <FxRateTimestamp
                    label={t('rateAsOf')}
                    observedLabel={rateObservedLabel}
                    expiryLabel={quoteExpiryLabel}
                    isExpired={isQuoteExpired}
                    onRefresh={handleRetryQuote}
                  />
                ) : null}
              </View>
            )}
          </>
        )}

        {/* ================================================================ */}
        {/* STEP 2: REVIEW — full quote disclosure before biometric confirm  */}
        {/* ================================================================ */}
        {step === 'review' && quote === null && (
          <View style={styles.reviewBlock}>
            <View style={styles.quoteErrorRow}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.dangerText} />
              <Text style={[styles.quoteStatusText, { color: colors.dangerText }]}>
                {t('quoteFailed')}
              </Text>
              <Pressable
                hitSlop={8}
                onPress={handleRetryQuote}
                accessibilityRole="button"
                accessibilityLabel={t('a11y.retryQuote')}
              >
                <Text style={[styles.quoteStatusText, { color: colors.brand }]}>
                  {t('retry')}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
        {step === 'review' && quote && (
          <View style={styles.reviewBlock}>
            <Text style={[styles.reviewTitle, { color: colors.textPrimary }]}>
              {t('reviewTitle')}
            </Text>
            <ConvertSummaryRow label={t('youSend')} value={formatMinorAmount(quote.sourceAmountMinor, quote.sourceCurrency)} emphasis />
            <ConvertSummaryRow
              label={t('fee', { bps: quote.spreadBps })}
              value={`−${formatMinorAmount(quote.feeMinor, quote.feeCurrency)}`}
            />
            <ConvertSummaryRow label={t('rateLabel')} value={rateValueLabel} />
            <ConvertSummaryRow
              label={t('youReceive')}
              value={formatMinorAmount(quote.targetAmountMinor, quote.targetCurrency)}
              total
            />
            <Text style={[styles.reviewHint, { color: colors.textMuted }]}>
              {t('reviewHint', { source: sourceCurrency, target: targetCurrency })}
            </Text>
            <FxRateTimestamp
              label={t('referenceRateAsOf')}
              observedLabel={rateObservedLabel}
              expiryLabel={quoteExpiryLabel}
              isExpired={isQuoteExpired}
              onRefresh={handleRetryQuote}
            />
          </View>
        )}

        {/* ================================================================ */}
        {/* STEP 3: AUTHENTICATING                                            */}
        {/* ================================================================ */}
        {step === 'authenticating' && (
          <AuthState
            isAuthenticating={biometricGate.isAuthenticating}
            error={biometricGate.error}
            onRetryAuth={handleRetryAuth}
            onCancelAuth={handleCancelAuth}
          />
        )}

        {/* ================================================================ */}
        {/* STEP 4: EXECUTING                                                 */}
        {/* ================================================================ */}
        {step === 'executing' && (
          <View style={styles.centeredStep}>
            <Ionicons name="swap-horizontal" size={48} color={colors.brand} style={styles.stepIcon} />
            <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>
              {t('executingTitle')}
            </Text>
            <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
              {t('executingBody', { source: sourceCurrency, target: targetCurrency })}
            </Text>
            <ActivityIndicator color={colors.brand} size="large" style={{ marginTop: Space.lg }} />
          </View>
        )}

        {/* ================================================================ */}
        {/* STEP 5: RECEIPT                                                   */}
        {/* ================================================================ */}
        {step === 'receipt' && result && (
          <View style={styles.receiptWrap}>
            <Ionicons name="checkmark-circle" size={56} color={colors.successText} style={styles.stepIcon} />
            <Text style={[styles.receiptTitle, { color: colors.textPrimary }]}>
              {t('receiptTitle')}
            </Text>
            <Text style={[styles.receiptSubtitle, { color: colors.textSecondary }]}>
              {t('receiptBody', {
                sent: formatMinorAmount(result.sentMinor, result.sourceCurrency),
                received: formatMinorAmount(result.receivedMinor, result.targetCurrency) })}
            </Text>
            <View style={styles.receiptBlock}>
              <ConvertSummaryRow
                label={t('receiptSent')}
                value={formatMinorAmount(result.sentMinor, result.sourceCurrency)}
              />
              <ConvertSummaryRow
                label={t('receiptReceived')}
                value={formatMinorAmount(result.receivedMinor, result.targetCurrency)}
              />
              <ConvertSummaryRow
                label={t('receiptRate')}
                value={`1 ${result.sourceCurrency} = ${formatRateValue(result.rate)} ${result.targetCurrency}`}
              />
              <ConvertSummaryRow
                label={t('receiptFee')}
                value={formatMinorAmount(result.feeMinor, result.feeCurrency)}
              />
              <ConvertSummaryRow label={t('receiptTx')} value={result.txId} />
              <ConvertSummaryRow
                label={t('receiptTimestamp')}
                value={new Date(result.timestamp).toLocaleString('en-GB', {
                  dateStyle: 'medium',
                  timeStyle: 'short' })}
                total
              />
            </View>
          </View>
        )}

        {/* ================================================================ */}
        {/* ERROR STATE                                                       */}
        {/* ================================================================ */}
        {step === 'error' && (
          <ErrorState
            title={t('errorTitle')}
            message={errorMessage}
            tryAgainLabel={t('errorTryAgain')}
            cancelLabel={t('errorCancel')}
            onTryAgain={handleTryAgain}
            onCancel={handleCancelError}
          />
        )}
      </KeyboardAwareScrollView>
    </FlagshipScreen>
  );
}

// ── Currency chip row — horizontal selector over the 9 supported codes ──
function CurrencyChipRow({
  selected,
  onSelect,
  groupA11y,
  optionA11y }: {
  selected: SupportedCurrencyCode;
  onSelect: (code: SupportedCurrencyCode) => void;
  groupA11y: string;
  optionA11y: (code: SupportedCurrencyCode) => string;
}) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={fxStyles.chipRow}
      accessibilityLabel={groupA11y}
    >
      {SUPPORTED_CODES.map((code) => {
        const isSelected = code === selected;
        return (
          <Pressable
            key={code}
            onPress={() => {
              haptic.selection();
              onSelect(code);
            }}
            style={[
              fxStyles.chip,
              {
                borderColor: isSelected ? colors.textPrimary : colors.border,
                backgroundColor: isSelected ? colors.textPrimary : 'transparent' },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={optionA11y(code)}
          >
            <Text
              style={[fxStyles.chipText, { color: isSelected ? colors.background : colors.textPrimary }]}
              maxFontSizeMultiplier={2}
            >
              {code}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── Step indicator — Amount → Review → Auth → Done, localized labels ──
function ExchangeStepIndicator({ step }: { step: ConvertStep }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createConvertStyles(colors), [colors]);
  const { t } = useAppTranslation('walletFx');
  const labels = [t('stepAmount'), t('stepReview'), t('stepAuth'), t('stepDone')];
  const activeStepIndex = getConvertActiveStepIndex(step);

  return (
    <View style={styles.stepIndicatorRow}>
      {labels.map((label, index) => {
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
                    borderColor: isComplete || isActive ? colors.brand : colors.border },
                ]}
              >
                {isComplete ? (
                  <Ionicons name="checkmark" size={14} color={colors.textInverse} />
                ) : (
                  <Text style={[styles.stepDotText, { color: isActive ? colors.textInverse : colors.textMuted }]}>
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  {
                    color: isActive ? colors.textPrimary : colors.textMuted,
                    fontFamily: isActive ? Typography.family.semibold : Typography.family.regular },
                ]}
              >
                {label}
              </Text>
            </View>
            {index < labels.length - 1 && (
              <View
                style={[
                  styles.stepConnector,
                  { backgroundColor: index < activeStepIndex ? colors.brand : colors.border },
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── Rate timestamp — observed-at label + server-TTL countdown ──
function FxRateTimestamp({
  label,
  observedLabel,
  expiryLabel,
  isExpired,
  onRefresh }: {
  label: string;
  observedLabel: string;
  expiryLabel: string;
  isExpired: boolean;
  onRefresh: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createConvertStyles(colors), [colors]);
  const { t } = useAppTranslation('walletFx');

  if (!observedLabel) {
    return null;
  }

  return (
    <View style={styles.rateTimestampRow}>
      <Ionicons name="time-outline" size={12} color={colors.textMuted} />
      <Text style={[styles.rateTimestampText, { color: colors.textMuted }]}>
        {label} {observedLabel}
      </Text>
      {(isExpired || expiryLabel !== '') && (
        <Text style={[styles.rateExpiryText, { color: isExpired ? colors.dangerText : colors.textMuted }]}>
          {isExpired ? ` · ${t('expired')}` : ` · ${t('valid', { time: expiryLabel })}`}
        </Text>
      )}
      {isExpired && (
        <Pressable
          hitSlop={8}
          onPress={onRefresh}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.refreshRate')}
        >
          <Text style={[styles.rateExpiryText, { color: colors.brand }]}> · {t('refresh')}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Auth step — biometric gate with retry / cancel ──
function AuthState({
  isAuthenticating,
  error,
  onRetryAuth,
  onCancelAuth }: {
  isAuthenticating: boolean;
  error: string | null;
  onRetryAuth: () => void;
  onCancelAuth: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createConvertStyles(colors), [colors]);
  const { t } = useAppTranslation('walletFx');

  return (
    <View style={styles.centeredStep}>
      <Ionicons name="lock-closed-outline" size={48} color={colors.textPrimary} style={styles.stepIcon} />
      <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>
        {t('authTitle')}
      </Text>
      <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
        {isAuthenticating ? t('authWaiting') : error ?? t('authBody')}
      </Text>
      {!isAuthenticating && (
        <View style={styles.authActions}>
          <AppButton
            title={t('authRetry')}
            onPress={onRetryAuth}
            variant="primary"
            style={styles.authActionBtn}
            accessibilityLabel={t('a11y.retryAuth')}
          />
          <AppButton
            title={t('authCancel')}
            onPress={onCancelAuth}
            variant="secondary"
            style={styles.authActionBtn}
            accessibilityLabel={t('a11y.cancelAuth')}
          />
        </View>
      )}
      {isAuthenticating && (
        <ActivityIndicator color={colors.textMuted} style={{ marginTop: Space.lg }} />
      )}
    </View>
  );
}

// ── Error step — shared by balance-load and execution failures ──
function ErrorState({
  title,
  message,
  tryAgainLabel,
  cancelLabel,
  onTryAgain,
  onCancel }: {
  title: string;
  message: string;
  tryAgainLabel: string;
  cancelLabel: string;
  onTryAgain: () => void;
  onCancel: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createConvertStyles(colors), [colors]);

  return (
    <View style={styles.centeredStep}>
      <Ionicons name="close-circle-outline" size={56} color={colors.dangerText} style={styles.stepIcon} />
      <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]} numberOfLines={4}>
        {message}
      </Text>
      <View style={styles.authActions}>
        <AppButton
          title={tryAgainLabel}
          onPress={onTryAgain}
          variant="primary"
          style={styles.authActionBtn}
        />
        <AppButton
          title={cancelLabel}
          onPress={onCancel}
          variant="secondary"
          style={styles.authActionBtn}
        />
      </View>
    </View>
  );
}

// ── Sticky footer — per-step primary/secondary actions ──
function ExchangeFooter({
  step,
  canReview,
  canConfirm,
  onReview,
  onConfirm,
  onBackToAmount,
  onDone }: {
  step: ConvertStep;
  canReview: boolean;
  canConfirm: boolean;
  onReview: () => void;
  onConfirm: () => void;
  onBackToAmount: () => void;
  onDone: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createConvertStyles(colors), [colors]);
  const { t } = useAppTranslation('walletFx');

  if (step === 'amount') {
    return (
      <AppButton
        title={t('ctaReview')}
        onPress={onReview}
        disabled={!canReview}
        variant="primary"
        style={[styles.primaryBtn, !canReview && styles.primaryBtnDisabled]}
        titleStyle={styles.primaryText}
        accessibilityLabel={t('ctaReview')}
        hapticFeedback="medium"
      />
    );
  }
  if (step === 'review') {
    return (
      <>
        <AppButton
          title={t('ctaConfirm')}
          onPress={onConfirm}
          disabled={!canConfirm}
          variant="primary"
          style={[styles.primaryBtn, !canConfirm && styles.primaryBtnDisabled]}
          titleStyle={styles.primaryText}
          accessibilityLabel={t('ctaConfirm')}
          hapticFeedback="medium"
        />
        <AppButton
          title={t('ctaBack')}
          onPress={onBackToAmount}
          variant="secondary"
          style={[styles.secondaryBtn, { marginTop: Space.sm }]}
          accessibilityLabel={t('ctaBack')}
          hapticFeedback="light"
        />
      </>
    );
  }
  if (step === 'receipt') {
    return (
      <AppButton
        title={t('ctaDone')}
        onPress={onDone}
        variant="primary"
        style={styles.primaryBtn}
        titleStyle={styles.primaryText}
        accessibilityLabel={t('ctaDone')}
        hapticFeedback="light"
      />
    );
  }
  return null;
}

// ── Local styles — one chip grammar, hairline swap divider ──
const fxStyles = StyleSheet.create({
  pairLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: LetterSpacing.wide,
    textTransform: 'uppercase',
    paddingHorizontal: Space.xs,
    marginTop: Space.xs },
  chipRow: {
    gap: Space.xs,
    paddingHorizontal: Space.xs,
    paddingVertical: Space.sm - 2 },
  chip: {
    minWidth: 52,
    height: 34,
    paddingHorizontal: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center' },
  chipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: LetterSpacing.wide },
  swapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Space.xs },
  swapLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth },
  swapBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center' },
});
