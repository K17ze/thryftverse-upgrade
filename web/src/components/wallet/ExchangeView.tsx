'use client';

/**
 * Exchange surface — fiat ↔ fiat converter for the multi-currency wallet.
 * Web port of mobile's WalletExchangeScreen, reusing ConvertView's grammar
 * (compose → review Sheet → executing → receipt / error; web has no
 * biometric step — session auth is the gate).
 *
 * Live mode wires the real contract:
 *  - GET /wallets/:id/currency-balances hydrates the pockets; the wallet's
 *    default fiat pocket is merged over the balance list.
 *  - POST /wallet/fx/quotes {sourceCurrency, targetCurrency, fixedSide:
 *    'source', amountMinor, idempotencyKey} is the debounced (400ms) live
 *    quote — one idempotency key per (amount, pair) attempt so a retried
 *    create dedupes server-side; bumping the nonce mints a fresh key.
 *  - The countdown is driven by quote.expiresAt (server TTL, never a
 *    client-synthesized window); expiry auto-refetches up to 3 times then
 *    holds an honest expired state with manual Refresh.
 *  - POST /wallet/fx/quotes/:id/execute is idempotent by quote id. On
 *    FX_QUOTE_NOT_OPEN / FX_QUOTE_EXPIRED the stored quote is resynced
 *    first — a dropped execute response can hide a committed exchange, so
 *    failure is never declared without the resync.
 *
 * Fixture mode renders the same flow against authored demo pockets and the
 * static fxRatePerUnit rates, labelled as a simulated demo — no money moves.
 *
 * Money travels as minor-unit strings end-to-end; every figure on review
 * and receipt is wire-derived.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
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
import { useOnlineStatus } from '@/lib/offline/useOnlineStatus';
import { useSession } from '@/lib/session/SessionProvider';
import { ConvertSummaryRow } from './ConvertSummaryRow';
import { FEE_BPS, RATE_AS_OF, round2 } from './convertViewModel';
import type { WalletLedgerEntry } from './ledgerViewModel';
import { walletKeys } from './walletKeys';
import type { WalletData } from './useWalletData';

type ExchangeStep = 'compose' | 'review' | 'executing' | 'receipt' | 'error';

/** Server-side auto-refetch budget for expired quotes (mirrors native). */
const MAX_AUTO_REFETCHES = 3;
/** Fixture quotes carry a demo TTL so the expiry path is exercisable. */
const FIXTURE_QUOTE_TTL_MS = 60_000;
/** Fixture pocket seed — authored demo funds, GBP legs reconcile with the
 *  wallet surface's fixture balance via the shared query cache. */
const FIXTURE_FOREIGN_POCKETS: WalletCurrencyPocket[] = [
  { currency: 'USD', balanceMinor: 24000, version: 0 },
  { currency: 'EUR', balanceMinor: 9000, version: 0 },
  { currency: 'JPY', balanceMinor: 120000, version: 0 },
];

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

/** One idempotency key per (amount, pair) attempt — a retried quote
 *  creation dedupes server-side; bumping the nonce mints a fresh key. */
function newAttemptKey(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `fx_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Currency-aware decimal input — 0-dp currencies (JPY…) take no dot. */
function sanitizeAmountInput(raw: string, currency: string): string {
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

/** Server timestamps arrive as ISO-8601 or PG text — normalise via
 *  parseServerTimestamp before formatting (mirrors native). */
function formatTimestamp(iso: string): string {
  const ms = parseServerTimestamp(iso);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Simulated quote for fixture mode — static fxRatePerUnit rates with the
 *  same fixed-side-source semantics as POST /wallet/fx/quotes: the fee
 *  comes off the destination side, and the whole payload is minor-unit
 *  strings so the render path is identical to live. */
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

function ExchangeSkeleton() {
  return (
    <div aria-busy aria-label="Loading exchange" className="mx-auto w-full max-w-xl lg:max-w-2xl">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <Skeleton className="h-11 w-11 rounded-full" />
        <Skeleton className="h-7 w-32" />
      </div>
      <div className="px-4 pt-8 sm:px-6">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="mt-3 h-12 w-52" />
        <div className="mt-6 flex gap-2">
          <Skeleton className="h-9 w-16 rounded-md" />
          <Skeleton className="h-9 w-16 rounded-md" />
          <Skeleton className="h-9 w-16 rounded-md" />
        </div>
        <Skeleton className="mt-6 h-24 w-full rounded-lg" />
        <Skeleton className="mt-8 h-[52px] w-full rounded-md" />
      </div>
    </div>
  );
}

/** Currency chip row — real buttons, funded pockets first for the source
 *  side (native: horizontal selector over the 9 supported codes). */
function CurrencyChipRow({
  selected,
  codes,
  onSelect,
  ariaLabel,
}: {
  selected: SupportedCurrencyCode;
  codes: SupportedCurrencyCode[];
  onSelect: (code: SupportedCurrencyCode) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="mt-2 flex flex-wrap gap-2">
      {codes.map((code) => {
        const isSelected = code === selected;
        return (
          <button
            key={code}
            type="button"
            onClick={() => onSelect(code)}
            aria-pressed={isSelected}
            aria-label={`Select ${code}`}
            className={`pressable h-9 min-w-[52px] rounded-md border px-3 text-caption font-semibold tracking-wide transition-colors ${
              isSelected
                ? 'border-text-primary bg-text-primary text-surface'
                : 'border-border bg-transparent text-text-primary hover:border-text-muted'
            }`}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}

/** Rate timestamp — observed-at label + server-TTL countdown + manual
 *  refresh once the quote has actually expired (mirrors FxRateTimestamp). */
function FxRateTimestamp({
  label,
  observedLabel,
  expiryLabel,
  isExpired,
  onRefresh,
}: {
  label: string;
  observedLabel: string;
  expiryLabel: string;
  isExpired: boolean;
  onRefresh: () => void;
}) {
  if (!observedLabel) return null;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-meta text-text-muted">
      <Icon name="clock" size={12} className="shrink-0" />
      <span>
        {label} {observedLabel}
      </span>
      {isExpired || expiryLabel !== '' ? (
        <span className={isExpired ? 'text-danger-text' : undefined}>
          {isExpired ? '· Expired' : `· Valid for ${expiryLabel}`}
        </span>
      ) : null}
      {isExpired ? (
        <button
          type="button"
          onClick={onRefresh}
          className="pressable font-semibold text-brand hover:text-text-primary"
        >
          Refresh
        </button>
      ) : null}
    </p>
  );
}

export function ExchangeView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const { user, isGuest, sessionLoading } = useSession();
  const { isOffline } = useOnlineStatus();
  const isLive = DATA_MODE === 'live';

  // ── Pocket hydration ────────────────────────────────────────────────
  // Live: GET /wallets/:id/currency-balances with the default fiat pocket
  // merged over the balance list. Fixture: authored demo pockets — GBP
  // seeded from the shared wallet cache when present so both surfaces
  // agree on the same demo funds.
  const [pockets, setPockets] = useState<WalletCurrencyPocket[] | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const [balanceError, setBalanceError] = useState(false);
  const [balanceNonce, setBalanceNonce] = useState(0);
  const pairSeededRef = useRef(false);

  const [sourceCurrency, setSourceCurrency] = useState<SupportedCurrencyCode>('GBP');
  const [targetCurrency, setTargetCurrency] = useState<SupportedCurrencyCode>('USD');
  const [amount, setAmount] = useState('');

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
        // Seed the pair once: source = the wallet's default fiat pocket,
        // target = the first other funded pocket (or a sensible default).
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
        // Honest failure — a fabricated 0 pocket would render a false
        // "insufficient balance" and hide real spendable funds.
        if (!cancelled) setBalanceError(true);
      })
      .finally(() => {
        if (!cancelled) setIsHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLive, user?.id, balanceNonce, queryClient]);

  // ── Derived amount / balance values ──
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

  // Source picker: funded pockets first, then the rest of the registry.
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

  // ── Debounced live quote (POST /wallet/fx/quotes, fixedSide 'source') ──
  const [quote, setQuote] = useState<FxQuotePayload | null>(null);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState(false);
  const [quoteNonce, setQuoteNonce] = useState(0);

  // ── Quote idempotency — one key per (amount, pair, refetch) attempt.
  // Preview fetches within the same input set share a key so a retried
  // quote creation dedupes server-side; an expiry refetch bumps the nonce
  // and mints a fresh key so the server never replays a stale quote. ──
  const quoteKeyRef = useRef<string | null>(null);
  useEffect(() => {
    quoteKeyRef.current = null;
  }, [amountMinorStr, sourceCurrency, targetCurrency, quoteNonce]);
  // Consecutive expiry-triggered auto-refetches — capped so a fast client
  // clock can't loop the fetch forever. Reset by user intent: amount/pair
  // edits or a manual retry.
  const autoRefetchesRef = useRef(0);

  useEffect(() => {
    autoRefetchesRef.current = 0;
  }, [amountMinorStr, sourceCurrency, targetCurrency]);

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
          // A live quote resets the auto-refetch budget; one that arrives
          // already expired (fast client clock) keeps counting toward it.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, amountMinorStr, sourceCurrency, targetCurrency, exceedsBalance, user?.id, quoteNonce]);

  const handleRetryQuote = useCallback(() => {
    autoRefetchesRef.current = 0; // Manual retry is user intent — restart the budget.
    setQuoteNonce((n) => n + 1);
  }, []);

  // ── Quote expiry countdown — driven by quote.expiresAt (server TTL),
  //    never a client-synthesized window ──
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

  // ── Submission state machine — compose → review (Sheet) → executing →
  //    receipt / error. No biometric step on web: session auth is the gate.
  const [step, setStep] = useState<ExchangeStep>('compose');
  const [result, setResult] = useState<FxReceipt | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Quote expired while composing or reviewing → auto-refetch a fresh rate,
  // capped at MAX_AUTO_REFETCHES consecutive attempts; past that the expired
  // state stays visible with the manual Refresh CTA doing the retry.
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

  /** Fixture ledger sync — a GBP leg of a simulated exchange moves the
   *  shared fiat pocket so the wallet surface agrees; foreign legs live in
   *  the local demo pockets only. */
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
      // Fixture execution — simulated settlement against demo pockets.
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
          // A pocket the demo wallet didn't hold yet opens with the
          // credited amount — the same truth a live re-hydration shows.
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
        timestamp: new Date().toISOString(),
      });
      // Refresh pockets so the wallet and this surface agree.
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
                : new Date().toISOString(),
            });
            setBalanceNonce((n) => n + 1);
            void queryClient.invalidateQueries({ queryKey: walletKeys.root });
            setStep('receipt');
            return;
          }
          if (stored.status === 'expired') {
            // Fetch a fresh quote and land back on review — never
            // fabricate a new rate client-side.
            setQuoteNonce((n) => n + 1);
            show('Rate expired — we pulled a fresh quote.', 'info');
            setStep('review');
            return;
          }
        } catch {
          // Resync failed — surface the original execute error below.
        }
      }
      if (parsed.code === 'FX_QUOTE_EXPIRED') {
        setQuoteNonce((n) => n + 1);
        show('Rate expired — we pulled a fresh quote.', 'info');
        setStep('review');
      } else if (parsed.code === 'WALLET_INSUFFICIENT_BALANCE') {
        // Pocket view was stale — refetch so exceedsBalance recomputes
        // against the ledger truth and the inline state shows.
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
    if (step === 'executing') return; // Back disabled during execution
    router.push('/wallet');
  };

  // ── Currency pair handlers — selecting the other side's code swaps. ──
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

  // ── Loading skeleton ──
  if (sessionLoading || (isHydrating && pockets === null)) {
    return <ExchangeSkeleton />;
  }

  if (isGuest) {
    return (
      <EmptyState
        icon="wallet"
        title="Sign in to exchange"
        subtitle="Currency exchange moves between your own funded pockets."
        actionLabel="Sign in"
        onAction={() => router.push('/auth')}
      />
    );
  }

  // ── Balance load failure — never fall through to a fabricated £0 form ──
  if (balanceError && pockets === null) {
    return (
      <EmptyState
        icon="wallet"
        title="Balances unavailable"
        subtitle="We couldn't load your currency pockets. Check your connection and try again."
        actionLabel="Retry"
        onAction={() => setBalanceNonce((n) => n + 1)}
      />
    );
  }

  // ── Receipt step ──
  if (step === 'receipt' && result) {
    const sentLabel = formatMinorAmount(result.sentMinor, result.sourceCurrency);
    const receivedLabel = formatMinorAmount(result.receivedMinor, result.targetCurrency);
    return (
      <div className="mx-auto w-full max-w-xl pb-16 lg:max-w-2xl">
        <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
          <IconButton name="back" aria-label="Back to wallet" onClick={() => router.push('/wallet')} />
          <h1 className="text-screen-title text-text-primary">Exchange Receipt</h1>
        </div>

        <div className="flex flex-col items-center px-4 pt-10 text-center sm:px-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-subtle text-success-text">
            <Icon name="check" size={32} />
          </div>
          <h2 className="mt-4 text-screen-title text-text-primary">Exchange complete</h2>
          <p className="mt-1 text-body text-text-secondary">
            Exchanged {sentLabel} for {receivedLabel}
          </p>
        </div>

        <div className="mt-8 px-4 sm:px-6">
          <ConvertSummaryRow label="You sent" value={sentLabel} />
          <ConvertSummaryRow label="You received" value={receivedLabel} />
          <ConvertSummaryRow
            label="Rate applied"
            value={`1 ${result.sourceCurrency} = ${formatRateValue(result.rate)} ${result.targetCurrency}`}
          />
          <ConvertSummaryRow
            label="Fee"
            value={formatMinorAmount(result.feeMinor, result.feeCurrency)}
            negative
          />
          <ConvertSummaryRow label="Reference" value={result.txId} />
          <ConvertSummaryRow
            label="Timestamp"
            value={new Date(result.timestamp).toLocaleString('en-GB', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
            total
          />
        </div>

        <div className="mt-8 flex flex-col gap-2.5 px-4 sm:px-6">
          <Button variant="primary" size="lg" fullWidth onClick={() => router.push('/wallet')}>
            Done
          </Button>
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={() => {
              setResult(null);
              setAmount('');
              setStep('compose');
            }}
          >
            Exchange again
          </Button>
        </div>
        {isLive ? null : (
          <p className="mt-8 flex items-center gap-1.5 px-4 text-caption text-text-muted sm:px-6">
            <Icon name="info" size={14} className="shrink-0" />
            Fixture mode — this exchange was simulated for design review. No money moved.
          </p>
        )}
      </div>
    );
  }

  // ── Executing step ──
  if (step === 'executing') {
    return (
      <div className="mx-auto w-full max-w-xl pb-16 lg:max-w-2xl">
        <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
          <IconButton name="back" aria-label="Back to wallet" onClick={handleBack} />
          <h1 className="text-screen-title text-text-primary">Exchange</h1>
        </div>
        <div className="flex flex-col items-center px-6 pt-24 text-center">
          <Icon name="sort" size={48} className="text-brand" />
          <h2 className="mt-4 text-section-title font-semibold text-text-primary">
            Exchanging your money
          </h2>
          <p className="mt-1.5 text-body text-text-secondary">
            Debiting {sourceCurrency} and crediting {targetCurrency} at the quoted rate.
          </p>
          <span className="mt-6 h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand" />
        </div>
      </div>
    );
  }

  // ── Compose + review (Sheet) + error ──
  return (
    <div className="mx-auto w-full max-w-xl pb-16 lg:max-w-2xl">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to wallet" onClick={handleBack} />
        <div>
          <h1 className="text-screen-title text-text-primary">Exchange</h1>
          <p className="text-caption text-text-secondary">Move between your currency pockets</p>
        </div>
      </div>

      {isOffline ? (
        <p className="mx-4 mt-4 flex items-center gap-2 border-b border-border-subtle bg-danger-subtle px-4 py-3 text-caption text-text-primary sm:mx-6">
          <Icon name="warning" size={15} className="shrink-0 text-danger-text" />
          You&apos;re offline — exchange is unavailable until you reconnect.
        </p>
      ) : null}

      {/* Available balance header */}
      <section aria-label="Available balance" className="px-4 pt-6 sm:px-6">
        <p className="text-label text-text-muted">Available in {sourceCurrency}</p>
        <p className="tnum mt-2 text-display-large font-bold tracking-tight text-text-primary">
          {formatMinorAmount(sourceBalanceMinor, sourceCurrency)}
        </p>
      </section>

      {/* Pair + amount form */}
      <section aria-label="Exchange form" className="mt-6 px-4 sm:px-6">
        {/* You send — funded pockets first */}
        <p className="text-meta uppercase tracking-[0.08em] text-text-muted">You send</p>
        <CurrencyChipRow
          selected={sourceCurrency}
          codes={sourceCodes}
          onSelect={handleSelectSource}
          ariaLabel="Source currency"
        />

        {/* Amount input — major units, currency-aware decimal entry */}
        <div className="mt-4 rounded-lg border border-border bg-input p-4">
          <div className="flex items-center justify-between text-meta text-text-muted">
            <span>Amount</span>
            <span className="tnum">
              Available: {formatMinorAmount(sourceBalanceMinor, sourceCurrency)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <input
              id="exchange-amount"
              value={amount}
              onChange={(e) => setAmount(sanitizeAmountInput(e.target.value, sourceCurrency))}
              inputMode="decimal"
              placeholder="0"
              aria-label={`Amount in ${sourceCurrency}`}
              className="tnum h-12 min-w-0 flex-1 bg-transparent text-price-hero font-bold text-input-text placeholder:text-text-muted focus:outline-none"
            />
            <span className="shrink-0 text-body-emphasis font-bold text-text-primary">
              {sourceCurrency}
            </span>
          </div>
        </div>
        {exceedsBalance ? (
          <p className="mt-2 text-caption text-danger-text">
            Amount exceeds your {sourceCurrency} balance.
          </p>
        ) : null}

        {/* Swap direction */}
        <div className="my-4 flex items-center justify-center">
          <span className="h-px flex-1 bg-border-subtle" aria-hidden="true" />
          <button
            type="button"
            onClick={handleSwap}
            aria-label="Swap currencies"
            className="pressable -my-2 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-raised text-text-secondary transition-colors hover:border-brand hover:text-text-primary"
          >
            <Icon name="sort" size={18} />
          </button>
          <span className="h-px flex-1 bg-border-subtle" aria-hidden="true" />
        </div>

        {/* You receive — all supported codes */}
        <p className="text-meta uppercase tracking-[0.08em] text-text-muted">You receive</p>
        <CurrencyChipRow
          selected={targetCurrency}
          codes={SUPPORTED_CURRENCY_CODES}
          onSelect={handleSelectTarget}
          ariaLabel="Target currency"
        />

        {/* Live preview — debounced backend quote, full disclosure */}
        {amountMajor > 0 && !exceedsBalance && sourceCurrency !== targetCurrency ? (
          <div className="mt-5">
            <div className="rounded-lg border border-border-subtle bg-surface-alt p-4">
              {isFetchingQuote ? (
                <div className="flex items-center gap-2 py-1.5">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-text-primary" />
                  <span className="text-body text-text-muted">
                    {isLive ? 'Fetching live quote…' : 'Fetching demo quote…'}
                  </span>
                </div>
              ) : quoteError ? (
                <div className="flex items-center gap-2 py-1.5">
                  <Icon name="alert" size={14} className="shrink-0 text-danger-text" />
                  <span className="text-body text-danger-text">Quote unavailable</span>
                  <button
                    type="button"
                    onClick={handleRetryQuote}
                    className="pressable text-body font-semibold text-brand hover:text-text-primary"
                  >
                    Retry
                  </button>
                </div>
              ) : quote ? (
                <>
                  <ConvertSummaryRow
                    label="You send"
                    value={formatMinorAmount(amountMinorStr, sourceCurrency)}
                  />
                  <ConvertSummaryRow
                    label={`Fee (${quote.spreadBps} bps)`}
                    value={`−${formatMinorAmount(quote.feeMinor, quote.feeCurrency)}`}
                    negative
                  />
                  <ConvertSummaryRow label="Rate" value={rateValueLabel} />
                  <ConvertSummaryRow
                    label="You receive"
                    value={formatMinorAmount(quote.targetAmountMinor, targetCurrency)}
                    total
                  />
                </>
              ) : null}
            </div>
            {quote ? (
              <FxRateTimestamp
                label={isLive ? 'Rate as of' : 'Demo rate as of'}
                observedLabel={rateObservedLabel}
                expiryLabel={quoteExpiryLabel}
                isExpired={isQuoteExpired}
                onRefresh={handleRetryQuote}
              />
            ) : null}
          </div>
        ) : null}

        {step === 'error' ? (
          <div
            role="alert"
            className="mt-4 rounded-md border border-danger-border bg-danger-subtle px-4 py-3"
          >
            <p className="text-caption text-danger-text">{errorMessage}</p>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setStep('review')}>
                Try again
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setStep('compose')}>
                Edit amount
              </Button>
            </div>
          </div>
        ) : null}

        <Button
          variant="primary"
          size="lg"
          fullWidth
          className="mt-6"
          onClick={() => setStep('review')}
          disabled={!canReview}
        >
          {isFetchingQuote
            ? 'Fetching quote…'
            : isQuoteExpired && quote
              ? 'Refreshing rate…'
              : quote
                ? 'Review exchange'
                : amountMajor > 0
                  ? 'Enter a valid amount'
                  : 'Enter an amount'}
        </Button>
      </section>

      {/* Review sheet — the full quote disclosure before execution */}
      <Sheet
        open={step === 'review'}
        onClose={() => setStep('compose')}
        title="Review exchange"
      >
        {quote === null ? (
          <div className="px-5 pb-6">
            <div className="flex items-center gap-2 py-1.5">
              <Icon name="alert" size={14} className="shrink-0 text-danger-text" />
              <span className="text-body text-danger-text">Quote unavailable</span>
              <button
                type="button"
                onClick={handleRetryQuote}
                className="pressable text-body font-semibold text-brand hover:text-text-primary"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <div className="px-5 pb-6">
            <div className="mt-2">
              <ConvertSummaryRow
                label="You send"
                value={formatMinorAmount(quote.sourceAmountMinor, quote.sourceCurrency)}
              />
              <ConvertSummaryRow label="Exchange rate" value={rateValueLabel} />
              <ConvertSummaryRow
                label={`Fee (${quote.spreadBps} bps)`}
                value={`−${formatMinorAmount(quote.feeMinor, quote.feeCurrency)}`}
                negative
              />
              <ConvertSummaryRow
                label="You receive"
                value={formatMinorAmount(quote.targetAmountMinor, quote.targetCurrency)}
                total
              />
            </div>
            <FxRateTimestamp
              label={isLive ? 'Reference rate as of' : 'Demo rate as of'}
              observedLabel={rateObservedLabel}
              expiryLabel={quoteExpiryLabel}
              isExpired={isQuoteExpired}
              onRefresh={handleRetryQuote}
            />
            <p className="mt-4 flex items-start gap-1.5 text-caption text-text-muted">
              <Icon name="info" size={13} className="mt-px shrink-0" />
              {isLive
                ? `This debits your ${sourceCurrency} pocket and credits the quoted ${targetCurrency} amount at the rate above.`
                : 'Fixture mode — this exchange is simulated for design review. No money moves.'}
            </p>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              className="mt-5"
              onClick={() => void handleExecute()}
              disabled={isQuoteExpired || isFetchingQuote}
            >
              {isQuoteExpired ? 'Rate expired — refresh above' : 'Confirm exchange'}
            </Button>
          </div>
        )}
      </Sheet>

      {isLive ? null : (
        <p className="mt-10 flex items-center gap-1.5 px-4 text-caption text-text-muted sm:px-6">
          <Icon name="info" size={14} className="shrink-0" />
          Fixture mode — exchanges are simulated against demo pockets and static demo rates. No
          money moves.
        </p>
      )}
    </div>
  );
}
