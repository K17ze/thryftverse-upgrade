import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import { parseApiError } from '@/lib/api/http';
import {
  executeFxQuote,
  formatMinorAmount,
  getFxQuote,
  majorToMinorUnits,
  minorUnitsToMajor,
  parseServerTimestamp,
} from '@/lib/api/services/fx';
import type { SupportedCurrencyCode } from '@/lib/constants/currencies';
import type { User } from '@/lib/contracts/domain';
import { round2 } from '../convertViewModel';
import type { WalletLedgerEntry } from '../ledgerViewModel';
import { walletKeys } from '../walletKeys';
import type { WalletData } from '../useWalletData';
import type { FxReceipt } from './ExchangeReceipt';
import type { ExchangeStep } from './exchangeModel';
import { useExchangePockets } from './useExchangePockets';
import { useExchangeQuote } from './useExchangeQuote';

export { sanitizeAmountInput, formatTimestamp, type ExchangeStep } from './exchangeModel';

interface UseExchangeWorkflowOptions {
  user: User | null;
  isLive: boolean;
  isOffline: boolean;
}

export function useExchangeWorkflow({ user, isLive, isOffline }: UseExchangeWorkflowOptions) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { show } = useToast();

  const {
    pockets,
    setPockets,
    isHydrating,
    balanceError,
    balanceNonce,
    setBalanceNonce,
    sourceCurrency,
    setSourceCurrency,
    targetCurrency,
    setTargetCurrency,
    sourceBalanceMinor,
    sourceCodes,
  } = useExchangePockets({ user, isLive, queryClient });

  const [amount, setAmount] = useState('');
  const amountMajor = Number(amount || '0');
  const amountMinorStr = useMemo(
    () => majorToMinorUnits(Number.isFinite(amountMajor) ? amountMajor : 0, sourceCurrency),
    [amountMajor, sourceCurrency],
  );
  const exceedsBalance = amountMajor > 0 && Number(amountMinorStr) > sourceBalanceMinor;

  const [step, setStep] = useState<ExchangeStep>('compose');
  const [result, setResult] = useState<FxReceipt | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const {
    quote,
    isFetchingQuote,
    quoteError,
    quoteNonce,
    handleRetryQuote,
    isQuoteExpired,
    quoteExpiryLabel,
    rateObservedLabel,
    rateValueLabel,
  } = useExchangeQuote({
    user,
    isLive,
    amountMajor,
    amountMinorStr,
    sourceCurrency,
    targetCurrency,
    exceedsBalance,
    step,
  });

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
            handleRetryQuote();
            show('Rate expired — we pulled a fresh quote.', 'info');
            setStep('review');
            return;
          }
        } catch {
          // Fall through
        }
      }
      if (parsed.code === 'FX_QUOTE_EXPIRED') {
        handleRetryQuote();
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
