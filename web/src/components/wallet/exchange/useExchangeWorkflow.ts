import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import { parseApiError } from '@/lib/api/http';
import {
  createFxQuote,
  currencyMinorExponent,
  executeFxQuote,
  formatMinorAmount,
  formatRateValue,
  getCurrencyBalances,
  getFxQuote,
  majorToMinorUnits,
  minorUnitsToMajor,
  parseServerTimestamp,
  type FxQuotePayload,
  type WalletCurrencyPocket,
} from '@/lib/api/services/fx';
import {
  CURRENCIES,
  SUPPORTED_CURRENCY_CODES,
  toSupportedCurrency,
  type SupportedCurrencyCode,
} from '@/lib/constants/currencies';
import { WALLET_BALANCE } from '@/lib/data/fixtures';
import type { User } from '@/lib/contracts/domain';
import { FEE_BPS, RATE_AS_OF, round2 } from '../convertViewModel';
import type { WalletLedgerEntry } from '../ledgerViewModel';
import { walletKeys } from '../walletKeys';
import type { WalletData } from '../useWalletData';
import type { FxReceipt } from './ExchangeReceipt';

export type ExchangeStep = 'compose' | 'review' | 'executing' | 'receipt' | 'error';

/** Server-side auto-refetch budget for expired quotes (mirrors native). */
const MAX_AUTO_REFETCHES = 3;
/** Fixture quotes carry a demo TTL so the expiry path is exercisable. */
const FIXTURE_QUOTE_TTL_MS = 60_000;
/** Fixture pocket seed — authored demo funds, GBP reconciles with shared cache. */
const FIXTURE_FOREIGN_POCKETS: WalletCurrencyPocket[] = [
  { currency: 'USD', balanceMinor: 24000, version: 0 },
  { currency: 'EUR', balanceMinor: 9000, version: 0 },
  { currency: 'JPY', balanceMinor: 120000, version: 0 },
];

function newAttemptKey(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `fx_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function sanitizeAmountInput(raw: string, currency: string): string {
  const exponent = currencyMinorExponent(currency);
  const dot = raw.indexOf('.');
  const head = (dot === -1 ? raw : raw.slice(0, dot)).replace(/\D/g, '').slice(0, 9);
  if (dot === -1 || exponent === 0) return head;
  const tail = raw
    .slice(dot + 1)
    .replace(/\D/g, '')
    .slice(0, exponent);
  return `${head}.${tail}`;
}

export function formatTimestamp(iso: string): string {
  const ms = parseServerTimestamp(iso);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildFixtureQuote(
  source: SupportedCurrencyCode,
  target: SupportedCurrencyCode,
  amountMinorStr: string,
  attemptKey: string,
): FxQuotePayload {
  const rate = CURRENCIES[target].fxRatePerUnit / CURRENCIES[source].fxRatePerUnit;
  const exponentDelta = currencyMinorExponent(target) - currencyMinorExponent(source);
  const grossMinor = Math.round(Number(amountMinorStr) * rate * Math.pow(10, exponentDelta));
  const feeMinor = Math.round((grossMinor * FEE_BPS) / 10_000);
  const now = Date.now();
  return {
    id: `fxq-demo-${attemptKey.slice(0, 8)}`,
    sourceCurrency: source,
    targetCurrency: target,
    fixedSide: 'source',
    sourceAmountMinor: amountMinorStr,
    targetAmountMinor: String(Math.max(0, grossMinor - feeMinor)),
    midRate: String(rate),
    customerRate: String(rate),
    spreadBps: FEE_BPS,
    feeMinor: String(feeMinor),
    feeCurrency: target,
    rateSource: 'fixture',
    rateObservedAt: RATE_AS_OF,
    expiresAt: new Date(now + FIXTURE_QUOTE_TTL_MS).toISOString(),
    status: 'open',
    txId: null,
    executedAt: null,
  };
}

interface UseExchangeWorkflowOptions {
  user: User | null;
  isLive: boolean;
  isOffline: boolean;
}

export function useExchangeWorkflow({ user, isLive, isOffline }: UseExchangeWorkflowOptions) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { show } = useToast();

  const [pockets, setPockets] = useState<WalletCurrencyPocket[] | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const [balanceError, setBalanceError] = useState(false);
  const [balanceNonce, setBalanceNonce] = useState(0);
  const pairSeededRef = useRef(false);

  const [sourceCurrency, setSourceCurrency] = useState<SupportedCurrencyCode>('GBP');
  const [targetCurrency, setTargetCurrency] = useState<SupportedCurrencyCode>('USD');
  const [amount, setAmount] = useState('');

  // ── Pocket hydration ──
  useEffect(() => {
    if (!user?.id) {
      setPockets(null);
      setIsHydrating(false);
      return;
    }
    let cancelled = false;
    setIsHydrating(true);
    setBalanceError(false);

    const hydrate: Promise<{ list: WalletCurrencyPocket[]; fiatCurrency: string }> = isLive
      ? getCurrencyBalances(user.id).then((payload) => {
          const merged = new Map<string, WalletCurrencyPocket>();
          payload.balances.forEach((pocket) => merged.set(pocket.currency, pocket));
          merged.set(payload.fiatCurrency, {
            currency: payload.fiatCurrency,
            balanceMinor: payload.fiatBalanceMinor,
            version: merged.get(payload.fiatCurrency)?.version ?? 0,
          });
          return { list: Array.from(merged.values()), fiatCurrency: payload.fiatCurrency };
        })
      : new Promise((resolve) =>
          window.setTimeout(() => {
            const cached = queryClient.getQueryData<WalletData>(walletKeys.all(user.id));
            const gbpMajor = cached?.available ?? WALLET_BALANCE.available;
            resolve({
              list: [
                { currency: 'GBP', balanceMinor: Math.round(gbpMajor * 100), version: 0 },
                ...FIXTURE_FOREIGN_POCKETS,
              ],
              fiatCurrency: 'GBP',
            });
          }, 320),
        );

    hydrate
      .then(({ list, fiatCurrency }) => {
        if (cancelled) return;
        setPockets(list);
        if (!pairSeededRef.current) {
          pairSeededRef.current = true;
          const source = toSupportedCurrency(fiatCurrency) ?? 'GBP';
          const other = list.find(
            (pocket) =>
              pocket.currency !== source &&
              pocket.balanceMinor !== 0 &&
              toSupportedCurrency(pocket.currency) !== null,
          );
          setSourceCurrency(source);
          setTargetCurrency(
            other
              ? (toSupportedCurrency(other.currency) as SupportedCurrencyCode)
              : source === 'USD'
                ? 'GBP'
                : 'USD',
          );
        }
      })
      .catch(() => {
        if (!cancelled) setBalanceError(true);
      })
      .finally(() => {
        if (!cancelled) setIsHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLive, user?.id, balanceNonce, queryClient]);

  const amountMajor = Number(amount || '0');
  const amountMinorStr = useMemo(
    () => majorToMinorUnits(Number.isFinite(amountMajor) ? amountMajor : 0, sourceCurrency),
    [amountMajor, sourceCurrency],
  );
  const sourcePocket = pockets?.find(
    (pocket) => pocket.currency.toUpperCase() === sourceCurrency,
  );
  const sourceBalanceMinor = sourcePocket?.balanceMinor ?? 0;
  const exceedsBalance = amountMajor > 0 && Number(amountMinorStr) > sourceBalanceMinor;

  const sourceCodes = useMemo(() => {
    const funded = new Set(
      (pockets ?? [])
        .filter((pocket) => pocket.balanceMinor > 0)
        .map((pocket) => pocket.currency.toUpperCase()),
    );
    return [
      ...SUPPORTED_CURRENCY_CODES.filter((code) => funded.has(code)),
      ...SUPPORTED_CURRENCY_CODES.filter((code) => !funded.has(code)),
    ];
  }, [pockets]);

  const [quote, setQuote] = useState<FxQuotePayload | null>(null);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState(false);
  const [quoteNonce, setQuoteNonce] = useState(0);

  const quoteKeyRef = useRef<string | null>(null);
  useEffect(() => {
    quoteKeyRef.current = null;
  }, [amountMinorStr, sourceCurrency, targetCurrency, quoteNonce]);

  const autoRefetchesRef = useRef(0);
  useEffect(() => {
    autoRefetchesRef.current = 0;
  }, [amountMinorStr, sourceCurrency, targetCurrency]);

  // Debounced quote fetch (400ms)
  useEffect(() => {
    if (
      amountMajor <= 0 ||
      exceedsBalance ||
      sourceCurrency === targetCurrency ||
      !user?.id
    ) {
      setQuote(null);
      setQuoteError(false);
      setIsFetchingQuote(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const debounce = window.setTimeout(() => {
      setIsFetchingQuote(true);
      setQuoteError(false);
      if (!quoteKeyRef.current) quoteKeyRef.current = newAttemptKey();
      const attemptKey = quoteKeyRef.current;
      const fetchQuote: Promise<FxQuotePayload> = isLive
        ? createFxQuote(
            {
              sourceCurrency,
              targetCurrency,
              fixedSide: 'source',
              amountMinor: amountMinorStr,
              idempotencyKey: attemptKey,
            },
            controller.signal,
          ).then((res) => res.quote)
        : new Promise((resolve) =>
            window.setTimeout(
              () => resolve(buildFixtureQuote(sourceCurrency, targetCurrency, amountMinorStr, attemptKey)),
              300,
            ),
          );
      fetchQuote
        .then((nextQuote) => {
          if (cancelled) return;
          if (parseServerTimestamp(nextQuote.expiresAt) > Date.now()) {
            autoRefetchesRef.current = 0;
          }
          setQuote(nextQuote);
        })
        .catch(() => {
          if (!cancelled) {
            setQuote(null);
            setQuoteError(true);
          }
        })
        .finally(() => {
          if (!cancelled) setIsFetchingQuote(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(debounce);
    };
  }, [isLive, amountMinorStr, sourceCurrency, targetCurrency, exceedsBalance, user?.id, quoteNonce, amountMajor]);

  const handleRetryQuote = useCallback(() => {
    autoRefetchesRef.current = 0;
    setQuoteNonce((n) => n + 1);
  }, []);

  const expiryMs = quote ? parseServerTimestamp(quote.expiresAt) : NaN;
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  useEffect(() => {
    if (!Number.isFinite(expiryMs)) {
      setRemainingMs(null);
      return;
    }
    const tick = () => setRemainingMs(Math.max(0, expiryMs - Date.now()));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [expiryMs]);

  const isQuoteExpired = remainingMs !== null && remainingMs <= 0;
  const quoteExpiryLabel = useMemo(() => {
    if (remainingMs === null || remainingMs <= 0) return '';
    const mins = Math.floor(remainingMs / 60000);
    const secs = Math.floor((remainingMs % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, [remainingMs]);
  const rateObservedLabel = quote ? formatTimestamp(quote.rateObservedAt) : '';

  const [step, setStep] = useState<ExchangeStep>('compose');
  const [result, setResult] = useState<FxReceipt | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (isQuoteExpired && (step === 'compose' || step === 'review')) {
      if (autoRefetchesRef.current >= MAX_AUTO_REFETCHES) return;
      autoRefetchesRef.current += 1;
      setQuoteNonce((n) => n + 1);
    }
  }, [isQuoteExpired, step]);

  const canReview =
    Number.isFinite(amountMajor) &&
    amountMajor > 0 &&
    !exceedsBalance &&
    sourceCurrency !== targetCurrency &&
    quote !== null &&
    !isFetchingQuote &&
    !quoteError &&
    !isQuoteExpired &&
    step === 'compose' &&
    !isOffline;

  const rateValueLabel = `1 ${sourceCurrency} = ${quote ? formatRateValue(quote.customerRate) : '—'} ${targetCurrency}`;

  const applyFixtureExchange = useCallback(
    (receipt: FxReceipt) => {
      const gbpDelta =
        receipt.sourceCurrency === 'GBP'
          ? -minorUnitsToMajor(receipt.sentMinor, 'GBP')
          : receipt.targetCurrency === 'GBP'
            ? minorUnitsToMajor(receipt.receivedMinor, 'GBP')
            : 0;
      if (gbpDelta === 0) return;
      queryClient.setQueryData<WalletData>(walletKeys.all(user?.id), (old) => {
        if (!old) return old;
        const entry: WalletLedgerEntry = {
          id: receipt.txId,
          kind: 'conversion',
          amount: gbpDelta,
          status: 'completed',
          date: receipt.timestamp,
          description: `FX exchange — ${formatMinorAmount(receipt.sentMinor, receipt.sourceCurrency)} to ${formatMinorAmount(receipt.receivedMinor, receipt.targetCurrency)}`,
          balance: null,
        };
        return {
          ...old,
          available: round2(old.available + gbpDelta),
          session: [entry, ...old.session],
        };
      });
    },
    [queryClient, user?.id],
  );

  const handleExecute = async () => {
    const activeQuote = quote;
    if (!user?.id) {
      show('Sign in to exchange currency.', 'error');
      router.push('/auth');
      return;
    }
    if (!activeQuote) {
      setStep('compose');
      return;
    }

    setStep('executing');
    if (!isLive) {
      window.setTimeout(() => {
        const receipt: FxReceipt = {
          txId: `fx-demo-${Date.now().toString(36)}`,
          sentMinor: activeQuote.sourceAmountMinor,
          receivedMinor: activeQuote.targetAmountMinor,
          feeMinor: activeQuote.feeMinor,
          feeCurrency: activeQuote.feeCurrency,
          rate: activeQuote.customerRate,
          sourceCurrency: activeQuote.sourceCurrency,
          targetCurrency: activeQuote.targetCurrency,
          timestamp: new Date().toISOString(),
        };
        setPockets((prev) => {
          const list = (prev ?? []).map((pocket) => {
            if (pocket.currency === receipt.sourceCurrency) {
              return { ...pocket, balanceMinor: pocket.balanceMinor - Number(receipt.sentMinor) };
            }
            if (pocket.currency === receipt.targetCurrency) {
              return {
                ...pocket,
                balanceMinor: pocket.balanceMinor + Number(receipt.receivedMinor),
              };
            }
            return pocket;
          });
          if (!list.some((pocket) => pocket.currency === receipt.targetCurrency)) {
            list.push({
              currency: receipt.targetCurrency,
              balanceMinor: Number(receipt.receivedMinor),
              version: 0,
            });
          }
          return list;
        });
        applyFixtureExchange(receipt);
        setResult(receipt);
        setStep('receipt');
        show(
          `Exchanged ${formatMinorAmount(receipt.sentMinor, receipt.sourceCurrency)} for ${formatMinorAmount(receipt.receivedMinor, receipt.targetCurrency)}`,
          'success',
        );
      }, 900);
      return;
    }

    try {
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
        timestamp: new Date().toISOString(),
      });
      setBalanceNonce((n) => n + 1);
      void queryClient.invalidateQueries({ queryKey: walletKeys.root });
      setStep('receipt');
      show(
        `Exchanged ${formatMinorAmount(execution.debitedSourceMinor, activeQuote.sourceCurrency)} for ${formatMinorAmount(execution.creditedTargetMinor, activeQuote.targetCurrency)}`,
        'success',
      );
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to complete the exchange right now.');
      if (parsed.code === 'FX_QUOTE_NOT_OPEN' || parsed.code === 'FX_QUOTE_EXPIRED') {
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
                : new Date().toISOString(),
            });
            setBalanceNonce((n) => n + 1);
            void queryClient.invalidateQueries({ queryKey: walletKeys.root });
            setStep('receipt');
            return;
          }
          if (stored.status === 'expired') {
            setQuoteNonce((n) => n + 1);
            show('Rate expired — we pulled a fresh quote.', 'info');
            setStep('review');
            return;
          }
        } catch {
          // Fall through
        }
      }
      if (parsed.code === 'FX_QUOTE_EXPIRED') {
        setQuoteNonce((n) => n + 1);
        show('Rate expired — we pulled a fresh quote.', 'info');
        setStep('review');
      } else if (parsed.code === 'WALLET_INSUFFICIENT_BALANCE') {
        setBalanceNonce((n) => n + 1);
        show(parsed.message, 'error');
        setStep('compose');
      } else {
        const isNetworkError =
          isOffline ||
          parsed.isNetworkError ||
          (error instanceof Error && /network|fetch|timeout/i.test(error.message));
        setErrorMessage(
          isNetworkError
            ? 'The connection dropped while confirming — check your wallet before trying again.'
            : parsed.message,
        );
        setStep('error');
      }
    }
  };

  const handleBack = () => {
    if (step === 'executing') return;
    router.push('/wallet');
  };

  const handleSelectSource = (code: SupportedCurrencyCode) => {
    if (code === targetCurrency) setTargetCurrency(sourceCurrency);
    setSourceCurrency(code);
  };
  const handleSelectTarget = (code: SupportedCurrencyCode) => {
    if (code === sourceCurrency) setSourceCurrency(targetCurrency);
    setTargetCurrency(code);
  };
  const handleSwap = () => {
    setSourceCurrency(targetCurrency);
    setTargetCurrency(sourceCurrency);
  };

  const resetFlow = () => {
    setResult(null);
    setAmount('');
    setStep('compose');
  };

  return {
    pockets,
    isHydrating,
    balanceError,
    balanceNonce,
    setBalanceNonce,
    sourceCurrency,
    targetCurrency,
    amount,
    setAmount,
    amountMajor,
    amountMinorStr,
    sourceBalanceMinor,
    exceedsBalance,
    sourceCodes,
    quote,
    isFetchingQuote,
    quoteError,
    quoteNonce,
    handleRetryQuote,
    isQuoteExpired,
    quoteExpiryLabel,
    rateObservedLabel,
    rateValueLabel,
    step,
    setStep,
    result,
    errorMessage,
    canReview,
    handleExecute,
    handleBack,
    handleSelectSource,
    handleSelectTarget,
    handleSwap,
    resetFlow,
  };
}
