'use client';

/**
 * WithdrawView — payout orchestrator: amount composer → destination selector
 * → confirmation modal → progress tracker → success receipt.
 * Web port of the mobile WithdrawScreen state machine.
 *
 * Factored into domain components:
 *  - WithdrawSkeleton
 *  - WithdrawSuccessReceipt
 *  - WithdrawConfirmCard
 *  - WithdrawSubmitting
 *  - WithdrawDestinationsSection
 *  - WithdrawRecentRequests
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { parseApiError } from '@/lib/api/http';
import * as payoutsService from '@/lib/api/services/payouts';
import { useWithdrawData, withdrawKeys } from '@/lib/hooks/withdraw/useWithdrawData';
import { useSession } from '@/lib/session/SessionProvider';
import { formatPrice } from '@/lib/utils/format';
import type { PayoutRequest } from '@/lib/data/fixtures';
import { useWalletData, type WalletData } from '../useWalletData';
import { walletKeys } from '../walletKeys';
import type { WalletLedgerEntry } from '../ledgerViewModel';
import { round2, sanitizeAmount } from '../convertViewModel';
import { AddBankAccountSheet } from './AddBankAccountSheet';
import { PayoutSetupSheet } from './PayoutSetupSheet';
import { usePayoutAccounts } from './usePayoutAccounts';
import {
  AMOUNT_ERROR_COPY,
  canReview,
  destinationLabel,
  newPayoutReference,
  PAYOUT_GATE_COPY,
  payoutPolicyHint,
  QUICK_PERCENTAGES,
  quickAmount,
  resolvePayoutAvailability,
  withdrawError,
  WITHDRAWAL_ETA_LABEL,
  type PayoutDestination,
  type WithdrawStep,
  type WithdrawSuccessData,
} from './withdrawViewModel';

// Domain components
import { WithdrawSkeleton } from './WithdrawSkeleton';
import { WithdrawSuccessReceipt } from './WithdrawSuccessReceipt';
import { WithdrawConfirmCard } from './WithdrawConfirmCard';
import { WithdrawSubmitting } from './WithdrawSubmitting';
import { WithdrawDestinationsSection } from './WithdrawDestinationsSection';
import { WithdrawRecentRequests } from './WithdrawRecentRequests';

const FIXTURE_STAGES = [
  'Reserving funds from your demo balance',
  'Recording your payout request',
  'Finishing up',
] as const;

const LIVE_STAGES = [
  'Submitting your withdrawal request',
  'Confirming it was recorded',
] as const;

const STAGE_MS = 550;

export function WithdrawView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const { data, isLoading, isError, refetch } = useWalletData();
  const { user, isGuest, sessionLoading } = useSession();
  const payouts = usePayoutAccounts();
  const {
    mode,
    destinations,
    selectableDestinations,
    defaultDestination,
    requests,
    isLoading: payoutsLoading,
    isError: payoutsError,
    requestsError,
    refetch: refetchPayouts,
    fixtureAccounts,
    addAccount,
    recordRequest,
  } = payouts;
  const isLive = mode === 'live';
  const {
    balances,
    isHydratingBalance,
    balanceError,
    reloadBalance,
    capabilities,
    connectStatus,
  } = useWithdrawData();

  const [step, setStep] = useState<WithdrawStep>('form');
  const [amount, setAmount] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [setupSheetOpen, setSetupSheetOpen] = useState(false);
  const [stage, setStage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<WithdrawSuccessData | null>(null);

  const available = isLive ? (balances?.availableGbp ?? 0) : (data?.available ?? 0);
  const currency = data?.currency ?? 'GBP';
  const numericAmount = Number(amount) || 0;
  const hasPayoutMethod = selectableDestinations.length > 0;
  const error = withdrawError(numericAmount, available, hasPayoutMethod);
  const selected = destinations.find((a) => a.id === selectedId) ?? null;
  const reviewable = canReview(
    numericAmount,
    available,
    hasPayoutMethod && selected?.status === 'active',
    submitting,
  );

  const payoutAvailability = isLive
    ? resolvePayoutAvailability(capabilities, connectStatus)
    : 'available';
  const policyHint = isLive ? payoutPolicyHint(capabilities) : null;

  const idempotencyKeyRef = useRef<string | null>(null);
  useEffect(() => {
    idempotencyKeyRef.current = null;
  }, [numericAmount, selectedId]);

  useEffect(() => {
    if (amount === '' && available > 0 && (!isLive || balances != null)) {
      setAmount(available.toFixed(2));
    }
  }, [available, balances, isLive, amount]);

  useEffect(() => {
    if (selectableDestinations.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !selectableDestinations.some((a) => a.id === selectedId)) {
      const fallback =
        defaultDestination && selectableDestinations.some((d) => d.id === defaultDestination.id)
          ? defaultDestination
          : selectableDestinations[0];
      setSelectedId(fallback.id);
    }
  }, [selectableDestinations, defaultDestination, selectedId]);

  const commitFixture = (account: PayoutDestination, label: string) => {
    const createdAt = new Date().toISOString();
    const request: PayoutRequest = {
      id: `pw-${Date.now().toString(36)}`,
      reference: newPayoutReference(),
      accountId: account.id,
      destinationLabel: label,
      amountGbp: round2(numericAmount),
      currency,
      status: 'requested',
      createdAt,
    };

    recordRequest(request);
    queryClient.setQueryData<WalletData>(walletKeys.all(user?.id), (old) => {
      if (!old) return old;
      const entry: WalletLedgerEntry = {
        id: request.id,
        kind: 'withdrawal',
        amount: -request.amountGbp,
        status: 'pending',
        date: createdAt,
        description: `Withdrawal to ${label} (demo)`,
        balance: null,
      };
      return {
        ...old,
        available: round2(old.available - request.amountGbp),
        session: [entry, ...old.session],
      };
    });

    setResult({
      reference: request.reference,
      amountGbp: request.amountGbp,
      destinationLabel: label,
      createdAt,
    });
    setSubmitting(false);
    setStep('success');
    show('Withdrawal recorded — demo only, stored on this device', 'success');
  };

  const commitLive = async (account: PayoutDestination, label: string) => {
    if (!user?.id || account.accountId == null) {
      show('This payout method cannot receive withdrawals yet.', 'error');
      setSubmitting(false);
      setStep('form');
      return;
    }
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = payoutsService.newPayoutAttemptKey();
    }
    const idempotencyKey = idempotencyKeyRef.current;
    const amountGbp = round2(numericAmount);

    try {
      const res = await payoutsService.submitPayoutRequest(user.id, {
        payoutAccountId: account.accountId,
        amountGbp,
        idempotencyKey,
        metadata: {
          source: 'web_withdraw_screen',
          payoutMode: 'sale_proceeds_only',
        },
        onReconciling: () => setStage(1),
      });

      const debitedGbp = res.payoutRequest.amountGbp;
      const nextAvailable =
        res.sellerPayableAfterRequestGbp ?? round2(Math.max(0, available - debitedGbp));
      queryClient.setQueryData<WalletData>(walletKeys.all(user.id), (old) =>
        old ? { ...old, available: nextAvailable } : old,
      );
      queryClient.setQueryData<payoutsService.WalletBalances>(
        withdrawKeys.balances(user.id),
        (old) => (old ? { ...old, availableGbp: nextAvailable } : old),
      );
      void queryClient.invalidateQueries({ queryKey: walletKeys.root });
      void queryClient.invalidateQueries({ queryKey: withdrawKeys.balances(user.id) });
      void refetchPayouts();

      setResult({
        reference: res.payoutRequest.providerPayoutRef ?? res.payoutRequest.id,
        amountGbp: debitedGbp,
        destinationLabel: label,
        createdAt: res.payoutRequest.createdAt,
      });
      idempotencyKeyRef.current = null;
      setStep('success');
      show('Withdrawal requested — pending review', 'success');
    } catch (e) {
      const err =
        e instanceof payoutsService.PayoutRequestError
          ? e
          : new payoutsService.PayoutRequestError(
              parseApiError(e, 'Unable to submit the withdrawal right now.').message,
            );

      if (err.safeToRetry) {
        idempotencyKeyRef.current = null;
      } else if (err.outcomeUnknown) {
        show(err.message, 'info');
        setStep('form');
        return;
      } else {
        idempotencyKeyRef.current = null;
      }
      show(err.message, 'error');
      setStep('form');
    } finally {
      setSubmitting(false);
    }
  };

  const execute = () => {
    if (!reviewable || !selected) return;
    const destination = selected;
    const label = destinationLabel(destination);
    setStage(0);
    setSubmitting(true);
    setStep('submitting');

    if (isLive) {
      void commitLive(destination, label);
      return;
    }
    FIXTURE_STAGES.forEach((_, i) => {
      window.setTimeout(
        () => {
          if (i === FIXTURE_STAGES.length - 1) commitFixture(destination, label);
          else setStage(i + 1);
        },
        STAGE_MS * (i + 1),
      );
    });
  };

  if (sessionLoading || isLoading || payoutsLoading || isHydratingBalance) {
    return <WithdrawSkeleton />;
  }

  if (isGuest) {
    return (
      <EmptyState
        icon="wallet"
        title="Sign in to withdraw"
        subtitle="Payouts are tied to your account and balance."
        actionLabel="Sign in"
        onAction={() => router.push('/auth')}
      />
    );
  }

  if (isError || !data) {
    return (
      <EmptyState
        icon="wallet"
        title="Wallet unavailable"
        subtitle="We couldn't load your balance. Check your connection and try again."
        actionLabel="Retry"
        onAction={() => void refetch()}
      />
    );
  }

  if (step === 'success' && result) {
    return <WithdrawSuccessReceipt result={result} isLive={isLive} />;
  }

  if (step === 'submitting') {
    return (
      <WithdrawSubmitting
        numericAmount={numericAmount}
        selected={selected}
        stage={stage}
        stages={isLive ? LIVE_STAGES : FIXTURE_STAGES}
      />
    );
  }

  if (step === 'confirm' && selected) {
    return (
      <WithdrawConfirmCard
        numericAmount={numericAmount}
        selected={selected}
        onExecute={execute}
        onBack={() => setStep('form')}
      />
    );
  }

  const recentRequests = requests.slice(0, 3);
  const nothingAvailable = available <= 0;
  const openAddFlow = () => (isLive ? setSetupSheetOpen(true) : setAddSheetOpen(true));

  if (isLive && balanceError) {
    return (
      <div className="mx-auto w-full max-w-xl pb-10 lg:max-w-2xl">
        <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
          <IconButton
            name="back"
            aria-label="Back to wallet"
            onClick={() => router.push('/wallet')}
          />
          <h1 className="text-screen-title text-text-primary">Withdraw</h1>
        </div>
        <EmptyState
          compact
          icon="wallet"
          title={balanceError}
          subtitle="Your funds are safe — this is a read failure, not a missing balance."
          actionLabel="Try again"
          onAction={reloadBalance}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl pb-10 lg:max-w-2xl">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to wallet" onClick={() => router.push('/wallet')} />
        <h1 className="text-screen-title text-text-primary">Withdraw</h1>
      </div>

      {nothingAvailable ? (
        <EmptyState
          compact
          icon="wallet"
          title="Nothing to withdraw yet"
          subtitle="Money from your sales lands here once orders are delivered."
          actionLabel="Back to wallet"
          onAction={() => router.push('/wallet')}
        />
      ) : (
        <>
          {/* Amount composer */}
          <section aria-label="Amount" className="px-4 pt-6 sm:px-6">
            <div className="flex items-baseline justify-between">
              <p className="text-label text-text-muted">Available to withdraw</p>
              <p className="tnum text-body-emphasis font-semibold text-text-primary">
                {formatPrice(available, currency)}
              </p>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-input px-4">
              <span className="shrink-0 text-price-hero font-bold text-text-muted">£</span>
              <input
                value={amount}
                onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
                inputMode="decimal"
                placeholder="0.00"
                aria-label="Withdrawal amount in GBP"
                className="tnum h-16 min-w-0 flex-1 bg-transparent text-price-hero font-bold text-input-text placeholder:text-text-muted focus:outline-none"
              />
            </div>

            <div className="mt-3 flex gap-2" role="group" aria-label="Quick amounts">
              {QUICK_PERCENTAGES.map((pct) => (
                <Chip
                  key={pct}
                  selected={numericAmount === quickAmount(available, pct) && numericAmount > 0}
                  onClick={() => setAmount(quickAmount(available, pct).toFixed(2))}
                  aria-label={`Withdraw ${pct === 100 ? 'full balance' : `${pct}%`}`}
                >
                  {pct === 100 ? 'Max' : `${pct}%`}
                </Chip>
              ))}
            </div>

            {error && error !== 'no_method' ? (
              <p className="mt-2 text-caption text-danger-text" role="alert">
                {AMOUNT_ERROR_COPY[error]}
              </p>
            ) : null}
          </section>

          {/* Transfer to destination */}
          <WithdrawDestinationsSection
            destinations={destinations}
            selectedId={selectedId}
            policyHint={policyHint}
            payoutsError={payoutsError}
            isLive={isLive}
            payoutAvailability={payoutAvailability}
            connectStatus={connectStatus}
            onSelectDestination={setSelectedId}
            onOpenAddFlow={openAddFlow}
            onRefetchPayouts={() => void refetchPayouts()}
          />

          {/* Recent withdrawals */}
          <WithdrawRecentRequests
            recentRequests={recentRequests}
            requestsError={requestsError}
            onRefetchPayouts={() => void refetchPayouts()}
          />

          {/* Sticky footer with ETA and review CTA */}
          <div className="sticky bottom-0 mt-10 border-t border-border-subtle bg-surface px-4 py-4 sm:px-6">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <span className="flex items-center gap-1.5 text-caption text-text-secondary">
                <Icon name="clock" size={15} />
                Estimated arrival
              </span>
              <span className="tnum text-caption font-semibold text-text-primary">
                {WITHDRAWAL_ETA_LABEL}
              </span>
            </div>
            <p className="mt-3 text-center text-caption text-text-muted">
              {isLive
                ? `Transfers typically arrive in ${WITHDRAWAL_ETA_LABEL} once reviewed.`
                : `Demo — requests are recorded on this device and stay pending locally.`}
            </p>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              className="mt-3"
              disabled={!reviewable}
              onClick={() => setStep('confirm')}
            >
              Review withdrawal
            </Button>
            {error === 'no_method' && numericAmount > 0 ? (
              <p className="mt-2 text-center text-caption text-danger-text" role="alert">
                {isLive
                  ? payoutAvailability === 'country_unsupported'
                    ? PAYOUT_GATE_COPY.countryUnsupportedTitle
                    : destinations.length > 0
                      ? 'Finish payout setup — your method is still being verified.'
                      : 'Set up a payout method to withdraw.'
                  : AMOUNT_ERROR_COPY.no_method}
              </p>
            ) : null}
          </div>
        </>
      )}

      {isLive ? (
        <PayoutSetupSheet
          open={setupSheetOpen}
          onClose={() => setSetupSheetOpen(false)}
          onReady={() => show('Your payout method is ready.', 'success')}
        />
      ) : (
        <AddBankAccountSheet
          open={addSheetOpen}
          onClose={() => setAddSheetOpen(false)}
          accounts={fixtureAccounts}
          onSave={(input) => {
            const account = addAccount(input);
            setSelectedId(account.id);
            show(`${account.bankName} •••• ${account.last4} saved`, 'success');
          }}
        />
      )}
    </div>
  );
}
