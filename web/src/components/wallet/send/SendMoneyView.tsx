'use client';

/**
 * SendMoneyView — the live "Send money" surface (/wallet/send).
 *
 * Flow: pick a recipient → pick a funded source pocket → amount →
 * (cross-currency only) a debounced POST /wallet/fx/quotes preview
 * (fixedSide 'source'; see useSendQuote) → review Sheet → POST /transfers
 * with a stable idempotency key → honest receipt.
 *
 * Honesty rules, mirroring ExchangeView and the wire contract:
 *  - Same-currency sends POST {beneficiaryId, sourceCurrency,
 *    sourceAmountMinor}; cross-currency sends POST {beneficiaryId,
 *    quoteId} — the embedded conversion executes inside the transfer
 *    transaction.
 *  - A transfer lands in state PROCESSING (funded internally; no
 *    external payout rail exists yet). The receipt renders the wire
 *    state verbatim — never "delivered"/"paid out".
 *  - The transfer idempotency key persists across retries of the same
 *    logical send so a dropped response replays rather than double-
 *    debits; a payload change mints a fresh key.
 *  - Fixture mode renders an honest unavailable notice — recipients and
 *    transfers are real ledger entities, never demo-authored.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import {
  createTransfer,
  getBeneficiaries,
  getCurrencyBalances,
  getTransfers,
  majorToMinorUnits,
  type FxQuotePayload,
  type TransferPayload,
  type WalletCurrencyPocket,
} from '@/lib/api/services/fx';
import { SUPPORTED_CURRENCY_CODES } from '@/lib/constants/currencies';
import { useOnlineStatus } from '@/lib/offline/useOnlineStatus';
import { useSession } from '@/lib/session/SessionProvider';
import { walletKeys } from '../walletKeys';
import { BeneficiariesSection } from './BeneficiariesSection';
import { SendComposer } from './SendComposer';
import { SendReceipt, SendSkeleton, SendingScreen } from './SendScreens';
import { TransfersSection } from './TransfersSection';
import { newAttemptKey } from './sendModel';
import { useSendQuote } from './useSendQuote';

type SendStep = 'compose' | 'review' | 'sending' | 'receipt' | 'error';

interface MergedPockets {
  fiatCurrency: string;
  pockets: WalletCurrencyPocket[];
}

export function SendMoneyView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const { user, isGuest, sessionLoading } = useSession();
  const { isOffline } = useOnlineStatus();
  const isLive = DATA_MODE === 'live';
  const userId = user?.id;

  // ── Data — pockets share walletKeys.currencyBalances + the same merge
  //    as WalletCurrencyPockets, so the wallet surface and this composer
  //    read one cached truth; recipients and the transfer feed nest under
  //    the wallet root so send/cancel writes refresh everything. ──
  const balancesQuery = useQuery({
    queryKey: walletKeys.currencyBalances(userId),
    queryFn: async ({ signal }): Promise<MergedPockets> => {
      const payload = await getCurrencyBalances(userId as string, signal);
      const merged = new Map<string, WalletCurrencyPocket>();
      payload.balances.forEach((pocket) => merged.set(pocket.currency, pocket));
      merged.set(payload.fiatCurrency, {
        currency: payload.fiatCurrency,
        balanceMinor: payload.fiatBalanceMinor,
        version: merged.get(payload.fiatCurrency)?.version ?? 0,
      });
      return { fiatCurrency: payload.fiatCurrency, pockets: Array.from(merged.values()) };
    },
    enabled: isLive && !!userId,
  });

  const beneficiariesQuery = useQuery({
    queryKey: walletKeys.beneficiaries(userId),
    queryFn: async ({ signal }) => (await getBeneficiaries(userId as string, signal)).beneficiaries,
    enabled: isLive && !!userId,
  });

  const transfersQuery = useQuery({
    queryKey: walletKeys.transfers(userId),
    queryFn: async ({ signal }) => (await getTransfers(50, signal)).transfers,
    enabled: isLive && !!userId,
  });

  const pockets = balancesQuery.data?.pockets ?? null;
  const beneficiaries = useMemo(() => beneficiariesQuery.data ?? [], [beneficiariesQuery.data]);

  // ── Composer state ──
  const [step, setStep] = useState<SendStep>('compose');
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState<string | null>(null);
  const [sourceCurrency, setSourceCurrency] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState<TransferPayload | null>(null);
  const [resultName, setResultName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Seed once: default source = the wallet's fiat pocket; recipient = the
  // most recently added beneficiary. Neither is ever fabricated.
  useEffect(() => {
    if (sourceCurrency === null && balancesQuery.data) {
      setSourceCurrency(balancesQuery.data.fiatCurrency);
    }
  }, [balancesQuery.data, sourceCurrency]);
  useEffect(() => {
    if (beneficiaries.length === 0) return;
    // Reselect the newest recipient whenever the current pick is absent —
    // covers first load and a just-deleted selection alike.
    if (!beneficiaries.some((b) => b.id === selectedBeneficiaryId)) {
      setSelectedBeneficiaryId(beneficiaries[0].id);
    }
  }, [beneficiaries, selectedBeneficiaryId]);

  const beneficiary = beneficiaries.find((b) => b.id === selectedBeneficiaryId) ?? null;
  const targetCurrency = beneficiary?.currency ?? null;
  const sameCurrency =
    !!targetCurrency && !!sourceCurrency && targetCurrency === sourceCurrency;
  const needsQuote = !!targetCurrency && !sameCurrency;

  const amountMajor = Number(amount || '0');
  const amountMinorStr = useMemo(
    () =>
      majorToMinorUnits(Number.isFinite(amountMajor) ? amountMajor : 0, sourceCurrency ?? 'GBP'),
    [amountMajor, sourceCurrency],
  );
  const sourcePocket = pockets?.find(
    (pocket) => pocket.currency.toUpperCase() === sourceCurrency,
  );
  const sourceBalanceMinor = sourcePocket?.balanceMinor ?? 0;
  const exceedsBalance = amountMajor > 0 && Number(amountMinorStr) > sourceBalanceMinor;

  // Source picker = funded pockets only — you can't send from a pocket
  // the ledger says is empty.
  const fundedCodes = useMemo(
    () =>
      SUPPORTED_CURRENCY_CODES.filter((code) =>
        (pockets ?? []).some(
          (pocket) => pocket.currency.toUpperCase() === code && pocket.balanceMinor > 0,
        ),
      ),
    [pockets],
  );

  const {
    quote,
    isFetchingQuote,
    quoteError,
    isQuoteExpired,
    quoteExpiryLabel,
    retry: retryQuote,
    refresh: refreshQuote,
  } = useSendQuote({
    userId,
    sourceCurrency,
    targetCurrency,
    needsQuote,
    amountMinorStr,
    amountMajor,
    exceedsBalance,
    allowAutoRefetch: step === 'compose' || step === 'review',
  });

  // One idempotency key per logical send — persists across retries of an
  // unchanged payload so the server replays the commit; a payload change
  // mints a fresh key.
  const transferKeyRef = useRef<string | null>(null);
  useEffect(() => {
    transferKeyRef.current = null;
  }, [amountMinorStr, sourceCurrency, selectedBeneficiaryId, quote?.id]);

  const canReview =
    beneficiary !== null &&
    Number.isFinite(amountMajor) &&
    amountMajor > 0 &&
    !exceedsBalance &&
    (sameCurrency || (quote !== null && !isFetchingQuote && !quoteError && !isQuoteExpired)) &&
    step === 'compose' &&
    !isOffline;

  const handleSend = async () => {
    const activeBeneficiary = beneficiary;
    if (!userId || !activeBeneficiary) return;
    if (!sameCurrency && !quote) {
      setStep('compose');
      return;
    }
    if (!transferKeyRef.current) transferKeyRef.current = newAttemptKey();
    const idempotencyKey = transferKeyRef.current;

    setStep('sending');
    try {
      const response = await createTransfer(
        sameCurrency
          ? {
              beneficiaryId: activeBeneficiary.id,
              sourceCurrency: sourceCurrency as string,
              sourceAmountMinor: amountMinorStr,
              idempotencyKey,
            }
          : {
              beneficiaryId: activeBeneficiary.id,
              quoteId: (quote as FxQuotePayload).id,
              idempotencyKey,
            },
      );
      setResult(response.transfer);
      setResultName(activeBeneficiary.displayName);
      // Money moved — the wallet root invalidation refreshes pockets,
      // recipients and the transfer feed together.
      void queryClient.invalidateQueries({ queryKey: walletKeys.root });
      setStep('receipt');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to send this transfer right now.');
      if (parsed.code === 'FX_QUOTE_NOT_OPEN' || parsed.code === 'FX_QUOTE_EXPIRED') {
        // The quote was consumed or lapsed — pull a fresh rate and land
        // back on review rather than declaring failure on stale input.
        refreshQuote();
        show('Rate expired — we pulled a fresh quote.', 'info');
        setStep('review');
        return;
      }
      if (parsed.code === 'WALLET_INSUFFICIENT_BALANCE') {
        // Pocket view was stale — refetch so exceedsBalance recomputes
        // against the ledger truth.
        void queryClient.invalidateQueries({ queryKey: walletKeys.currencyBalances(userId) });
        show(parsed.message, 'error');
        setStep('compose');
        return;
      }
      const isNetworkError =
        isOffline ||
        parsed.isNetworkError ||
        (error instanceof Error && /network|fetch|timeout/i.test(error.message));
      setErrorMessage(
        isNetworkError
          ? 'The connection dropped while confirming — check Recent transfers before trying again; retrying with unchanged details replays the same transfer safely.'
          : parsed.message,
      );
      setStep('error');
    }
  };

  const handleBack = () => {
    if (step === 'sending') return;
    router.push('/wallet');
  };

  // ── Gates ──
  if (sessionLoading) return <SendSkeleton />;

  if (isGuest) {
    return (
      <EmptyState
        icon="wallet"
        title="Sign in to send money"
        subtitle="Transfers move real funds from your wallet pockets."
        actionLabel="Sign in"
        onAction={() => router.push('/auth')}
      />
    );
  }

  // Fixture mode: recipients and transfers are ledger entities — there is
  // no honest demo version of them, so the surface is absent, not faked.
  if (!isLive) {
    return (
      <EmptyState
        icon="send"
        title="Send money isn’t in the design preview"
        subtitle="This surface moves real funds between your pockets and external accounts, so it only runs against the live API."
        actionLabel="Back to wallet"
        onAction={() => router.push('/wallet')}
      />
    );
  }

  if (step === 'sending') {
    return (
      <SendingScreen
        sourceCurrency={sourceCurrency}
        targetCurrency={targetCurrency}
        sameCurrency={sameCurrency}
      />
    );
  }

  if (step === 'receipt' && result) {
    return (
      <SendReceipt
        transfer={result}
        beneficiaryName={resultName}
        onDone={() => router.push('/wallet')}
        onSendAgain={() => {
          setResult(null);
          setAmount('');
          setStep('compose');
        }}
      />
    );
  }

  // ── Compose + review + error ──
  return (
    <div className="mx-auto w-full max-w-xl pb-16 lg:max-w-2xl">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to wallet" onClick={handleBack} />
        <div>
          <h1 className="text-screen-title text-text-primary">Send money</h1>
          <p className="text-caption text-text-secondary">
            From your pockets to an external account
          </p>
        </div>
      </div>

      {isOffline ? (
        <p className="mx-4 mt-4 flex items-center gap-2 border-b border-border-subtle bg-danger-subtle px-4 py-3 text-caption text-text-primary sm:mx-6">
          <Icon name="warning" size={15} className="shrink-0 text-danger-text" />
          You&apos;re offline — sending is unavailable until you reconnect.
        </p>
      ) : null}

      <div className="mt-6">
        <BeneficiariesSection
          beneficiaries={beneficiaries}
          isLoading={beneficiariesQuery.isLoading}
          isError={beneficiariesQuery.isError}
          onRetry={() => void beneficiariesQuery.refetch()}
          selectedId={selectedBeneficiaryId}
          onSelect={(id) => setSelectedBeneficiaryId(id || null)}
          userId={userId as string}
          disabled={isOffline}
        />
      </div>

      <SendComposer
        beneficiary={beneficiary}
        sourceCurrency={sourceCurrency}
        onSelectSource={setSourceCurrency}
        fundedCodes={fundedCodes}
        pocketsLoading={balancesQuery.isLoading}
        amount={amount}
        onAmountChange={setAmount}
        amountMinorStr={amountMinorStr}
        amountMajor={amountMajor}
        sourceBalanceMinor={sourceBalanceMinor}
        exceedsBalance={exceedsBalance}
        sameCurrency={sameCurrency}
        needsQuote={needsQuote}
        quote={quote}
        isFetchingQuote={isFetchingQuote}
        quoteError={quoteError}
        isQuoteExpired={isQuoteExpired}
        quoteExpiryLabel={quoteExpiryLabel}
        onRetryQuote={retryQuote}
        canReview={canReview}
        reviewOpen={step === 'review'}
        onReview={() => setStep('review')}
        onDismissReview={() => setStep('compose')}
        onConfirm={() => void handleSend()}
        showError={step === 'error'}
        errorMessage={errorMessage}
        onRetrySend={() => setStep('review')}
        onEditTransfer={() => setStep('compose')}
      />

      <TransfersSection
        transfers={transfersQuery.data ?? []}
        beneficiaries={beneficiaries}
        isLoading={transfersQuery.isLoading}
        isError={transfersQuery.isError}
        onRetry={() => void transfersQuery.refetch()}
      />
    </div>
  );
}
