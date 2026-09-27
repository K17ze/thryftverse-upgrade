'use client';

/**
 * Withdraw surface — form → confirm → progress → success receipt.
 * Web port of the mobile WithdrawScreen state machine.
 *
 *  - live mode: submits POST /users/:id/payout-requests signed with an
 *    idempotency key; a lost response reconciles via the lookup endpoint
 *    before anything is claimed. The wallet cache is updated with the
 *    server-computed seller_payable balance, never an optimistic guess.
 *  - fixture mode: writes an honest `withdrawal` entry into the walletKeys
 *    session ledger and drops the available balance — the demo receipt
 *    says the request was recorded locally, never "sent for review".
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { parseApiError } from '@/lib/api/http';
import * as payoutsService from '@/lib/api/services/payouts';
import { useSession } from '@/lib/session/SessionProvider';
import { formatPrice } from '@/lib/utils/format';
import type { PayoutRequest } from '@/lib/data/fixtures';
import { useWalletData, type WalletData } from '../useWalletData';
import { walletKeys } from '../walletKeys';
import type { WalletLedgerEntry } from '../ledgerViewModel';
import { ConvertSummaryRow } from '../ConvertSummaryRow';
import { round2, sanitizeAmount } from '../convertViewModel';
import { AddBankAccountSheet } from './AddBankAccountSheet';
import { PayoutSetupSheet } from './PayoutSetupSheet';
import { usePayoutAccounts } from './usePayoutAccounts';
import {
  AMOUNT_ERROR_COPY,
  canReview,
  destinationLabel,
  formatRequestDate,
  formatRequestedAt,
  newPayoutReference,
  QUICK_PERCENTAGES,
  quickAmount,
  resolvePayoutStatusConfig,
  withdrawError,
  WITHDRAWAL_ETA_LABEL,
  WITHDRAWAL_FEE_GBP,
  WITHDRAWAL_REVIEW_LABEL,
  DESTINATION_STATUS_CONFIG,
  type PayoutDestination,
  type WithdrawStep,
  type WithdrawSuccessData,
} from './withdrawViewModel';

/** Fixture-mode demo stages — describe what actually happens locally. */
const FIXTURE_STAGES = [
  'Reserving funds from your demo balance',
  'Recording your payout request',
  'Finishing up',
] as const;

/** Live stages — driven by real progress, not a timer. */
const LIVE_STAGES = [
  'Submitting your withdrawal request',
  'Confirming it was recorded',
] as const;

const STAGE_MS = 550;

function WithdrawSkeleton() {
  return (
    <div aria-busy aria-label="Loading withdraw">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <Skeleton className="h-11 w-11 rounded-full" />
        <Skeleton className="h-7 w-40" />
      </div>
      <div className="px-4 pt-8 sm:px-6">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-4 h-16 w-full rounded-lg" />
        <Skeleton className="mt-4 h-9 w-48 rounded-full" />
      </div>
      <div className="mt-10 px-4 sm:px-6">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-3 h-[52px] w-full" />
        <Skeleton className="mt-px h-[52px] w-full" />
      </div>
    </div>
  );
}

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

  const [step, setStep] = useState<WithdrawStep>('form');
  const [amount, setAmount] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [setupSheetOpen, setSetupSheetOpen] = useState(false);
  const [stage, setStage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<WithdrawSuccessData | null>(null);

  const available = data?.available ?? 0;
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

  // One idempotency key per (amount, destination) attempt — retries of the
  // same attempt reuse it so the backend dedupe replays instead of
  // double-paying. Edited inputs mint a fresh key.
  const idempotencyKeyRef = useRef<string | null>(null);
  useEffect(() => {
    idempotencyKeyRef.current = null;
  }, [numericAmount, selectedId]);

  // Mobile prefills the composer with the full available balance.
  useEffect(() => {
    if (data && amount === '' && data.available > 0) {
      setAmount(data.available.toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Keep the selection pointed at a real, usable account — the default
  // when unset or removed.
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

  /** Fixture-mode commit — records the request in the session store and
   *  earmarks the demo balance. The receipt discloses it never left the
   *  device. */
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

  /** Live commit — the real POST. Success state only on a real 2xx (or a
   *  reconciled acknowledged write); a lost response polls the lookup
   *  endpoint before any verdict. */
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

      // Ledger truth: prefer the server-computed post-request balance; the
      // debited amount is what the server recorded, not the form draft.
      const debitedGbp = res.payoutRequest.amountGbp;
      const nextAvailable =
        res.sellerPayableAfterRequestGbp ?? round2(Math.max(0, available - debitedGbp));
      queryClient.setQueryData<WalletData>(walletKeys.all(user.id), (old) =>
        old ? { ...old, available: nextAvailable } : old,
      );
      // Re-read the wallet + rail so the ledger and history reflect the
      // recorded request.
      void queryClient.invalidateQueries({ queryKey: walletKeys.root });
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
        // The lookup proved nothing was recorded — the key is spent; a
        // retry mints a fresh one.
        idempotencyKeyRef.current = null;
      } else if (err.outcomeUnknown) {
        // Keep the key — a manual retry replays the same attempt instead
        // of risking a duplicate payout.
        show(err.message, 'info');
        setStep('form');
        return;
      } else {
        // Deterministic rejection — the key is spent server-side.
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

  if (sessionLoading || isLoading || payoutsLoading) return <WithdrawSkeleton />;

  // Withdrawals are account-bound — guests never see fixture funds.
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

  // ── Success receipt ───────────────────────────────────────────────────
  if (step === 'success' && result) {
    return (
      <div className="mx-auto w-full max-w-xl pb-16">
        <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
          <IconButton name="back" aria-label="Back to wallet" onClick={() => router.push('/wallet')} />
          <h1 className="text-screen-title font-semibold text-text-primary">Withdraw</h1>
        </div>

        <div className="flex flex-col items-center px-4 pt-10 text-center sm:px-6">
          <Icon name="check" filled size={56} className="text-success-text" />
          <h2 className="mt-4 text-screen-title font-semibold text-text-primary">
            Withdrawal requested
          </h2>
          <p className="mt-1 text-body text-text-secondary">
            {isLive
              ? `${formatPrice(result.amountGbp, 'GBP')} requested — pending review`
              : `${formatPrice(result.amountGbp, 'GBP')} recorded on this device`}
          </p>
        </div>

        <div className="mt-8 px-4 sm:px-6">
          <ConvertSummaryRow label="Reference" value={result.reference} />
          <ConvertSummaryRow label="Amount" value={formatPrice(result.amountGbp, 'GBP')} />
          <ConvertSummaryRow label="Destination" value={result.destinationLabel} />
          <ConvertSummaryRow label="Requested" value={formatRequestedAt(result.createdAt)} />
          <ConvertSummaryRow
            label="Status"
            value={isLive ? 'Pending review' : 'Recorded locally (demo)'}
          />
        </div>

        <p className="mt-6 flex items-start gap-1.5 px-4 text-caption text-text-muted sm:px-6">
          <Icon name={isLive ? 'clock' : 'info'} size={14} className="mt-0.5 shrink-0" />
          {isLive
            ? 'Pending review — track it in payout activity.'
            : 'Demo mode — this request exists only on this device and nothing was sent.'}
        </p>

        <div className="mt-8 flex flex-col gap-2 px-4 sm:px-6">
          <Button variant="primary" size="lg" fullWidth onClick={() => router.push('/wallet')}>
            Done
          </Button>
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={() => router.push('/wallet/payouts')}
          >
            View payout activity
          </Button>
        </div>
      </div>
    );
  }

  // ── Submitting — real progress (live) / demo staging (fixture) ───────
  if (step === 'submitting') {
    const stages = isLive ? LIVE_STAGES : FIXTURE_STAGES;
    return (
      <div className="mx-auto w-full max-w-xl pb-16" aria-busy aria-live="polite">
        <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
          <span className="h-11 w-11" aria-hidden />
          <h1 className="text-screen-title font-semibold text-text-primary">Withdraw</h1>
        </div>
        <div className="px-4 pt-16 sm:px-6">
          <p className="tnum text-display-large font-bold tracking-tight text-text-primary">
            {formatPrice(numericAmount, 'GBP')}
          </p>
          <p className="mt-1 text-body text-text-secondary">
            to {selected ? destinationLabel(selected) : 'your payout account'}
          </p>
          <ul className="mt-10">
            {stages.map((label, i) => (
              <li
                key={label}
                className="flex items-center gap-3 border-t border-border-subtle py-4"
              >
                {i < stage ? (
                  <Icon name="check" filled size={20} className="text-success-text" />
                ) : i === stage ? (
                  <span
                    className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-text-primary"
                    aria-hidden
                  />
                ) : (
                  <span className="h-5 w-5 rounded-full border border-border" aria-hidden />
                )}
                <span
                  className={`text-body ${
                    i <= stage ? 'text-text-primary' : 'text-text-muted'
                  }`}
                >
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // ── Confirm ───────────────────────────────────────────────────────────
  if (step === 'confirm' && selected) {
    const amountLabel = formatPrice(numericAmount, 'GBP');
    return (
      <div className="mx-auto w-full max-w-xl pb-16">
        <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
          <IconButton name="back" aria-label="Back to edit" onClick={() => setStep('form')} />
          <h1 className="text-screen-title font-semibold text-text-primary">Confirm withdrawal</h1>
        </div>

        <section aria-label="Withdrawal summary" className="mt-8 px-4 sm:px-6">
          <ConvertSummaryRow label="Amount" value={amountLabel} />
          <ConvertSummaryRow label="Fee" value={formatPrice(WITHDRAWAL_FEE_GBP, 'GBP')} />
          <ConvertSummaryRow label="You receive" value={amountLabel} total />
          <ConvertSummaryRow label="Destination" value={destinationLabel(selected)} />
          <ConvertSummaryRow label="Payout review" value={WITHDRAWAL_REVIEW_LABEL} />
        </section>

        <p className="mt-6 flex items-start gap-1.5 px-4 text-caption text-text-muted sm:px-6">
          <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
          Withdrawals are processed from completed sale proceeds. This action cannot be undone.
        </p>

        <div className="mt-8 flex flex-col gap-2 px-4 sm:px-6">
          <Button variant="primary" size="lg" fullWidth onClick={execute}>
            Confirm withdrawal
          </Button>
          <Button variant="secondary" size="md" fullWidth onClick={() => setStep('form')}>
            Back to edit
          </Button>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────
  const recentRequests = requests.slice(0, 3);
  const nothingAvailable = available <= 0;
  const openAddFlow = () => (isLive ? setSetupSheetOpen(true) : setAddSheetOpen(true));

  return (
    <div className="mx-auto w-full max-w-xl pb-10">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to wallet" onClick={() => router.push('/wallet')} />
        <h1 className="text-screen-title font-semibold text-text-primary">Withdraw</h1>
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
              <p className="text-label font-semibold uppercase tracking-wider text-text-muted">
                Available to withdraw
              </p>
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

          {/* Transfer to */}
          <section aria-label="Payout destination" className="mt-10 px-4 sm:px-6">
            <h2 className="text-label font-semibold uppercase tracking-wider text-text-muted">
              Transfer to
            </h2>

            {payoutsError ? (
              <div className="mt-3 rounded-lg border border-border-subtle px-4 py-4">
                <p className="text-body text-text-secondary">
                  Your payout methods couldn&rsquo;t be loaded.
                </p>
                <button
                  type="button"
                  onClick={() => void refetchPayouts()}
                  className="pressable mt-2 text-body-emphasis font-medium text-brand"
                >
                  Try again
                </button>
              </div>
            ) : destinations.length === 0 ? (
              <button
                type="button"
                onClick={openAddFlow}
                className="pressable mt-3 flex w-full items-center gap-3 rounded-lg border border-dashed border-border px-4 py-4 text-left"
              >
                <Icon name="plus" size={20} className="text-brand" />
                <span className="flex-1">
                  <span className="block text-body-emphasis font-medium text-text-primary">
                    {isLive ? 'Set up payouts' : 'Add a bank account'}
                  </span>
                  <span className="block text-caption text-text-muted">
                    {isLive
                      ? 'Required to withdraw — verify with Stripe'
                      : 'Required to withdraw — sort code + account number'}
                  </span>
                </span>
                <Icon name="forward" size={16} className="text-text-muted" />
              </button>
            ) : (
              <ul role="radiogroup" aria-label="Payout destination" className="mt-1">
                {destinations.map((d) => {
                  const selectable = d.status === 'active';
                  const checked = d.id === selectedId;
                  return (
                    <li key={d.id} className="border-b border-border-subtle">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        disabled={!selectable}
                        onClick={() => selectable && setSelectedId(d.id)}
                        className={`pressable flex min-h-[52px] w-full items-center gap-3 py-2.5 text-left ${
                          selectable ? '' : 'opacity-60'
                        }`}
                      >
                        <span className="flex h-11 w-9 shrink-0 items-center text-text-secondary">
                          <Icon name="store" size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="clamp-1 block text-body-emphasis text-text-primary">
                            {d.title}
                          </span>
                          <span className="clamp-1 block text-caption text-text-muted">
                            {d.subtitle}
                            {d.isDefault ? ' · Default' : ''}
                          </span>
                        </span>
                        {selectable ? (
                          <span
                            aria-hidden
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                              checked ? 'border-brand bg-brand' : 'border-border'
                            }`}
                          >
                            {checked ? (
                              <Icon name="check" size={12} className="text-text-inverse" />
                            ) : null}
                          </span>
                        ) : (
                          <Badge variant={DESTINATION_STATUS_CONFIG[d.status].badge}>
                            {DESTINATION_STATUS_CONFIG[d.status].label}
                          </Badge>
                        )}
                      </button>
                    </li>
                  );
                })}
                <li>
                  <button
                    type="button"
                    onClick={openAddFlow}
                    className="pressable flex min-h-[52px] w-full items-center gap-3 py-2.5 text-left"
                  >
                    <span className="flex h-11 w-9 shrink-0 items-center text-brand">
                      <Icon name="plus" size={18} />
                    </span>
                    <span className="flex-1 text-body-emphasis text-brand">
                      {isLive ? 'Set up another payout method' : 'Add bank account'}
                    </span>
                  </button>
                </li>
              </ul>
            )}
          </section>

          {/* Recent withdrawals — honest statuses */}
          {requestsError ? (
            <section aria-label="Recent withdrawals" className="mt-10 px-4 sm:px-6">
              <h2 className="text-label font-semibold uppercase tracking-wider text-text-muted">
                Recent withdrawals
              </h2>
              <p className="mt-3 text-body text-text-muted">
                Withdrawal history couldn&rsquo;t be loaded.{' '}
                <button
                  type="button"
                  onClick={() => void refetchPayouts()}
                  className="pressable font-medium text-brand"
                >
                  Try again
                </button>
              </p>
            </section>
          ) : recentRequests.length > 0 ? (
            <section aria-label="Recent withdrawals" className="mt-10 px-4 sm:px-6">
              <h2 className="text-label font-semibold uppercase tracking-wider text-text-muted">
                Recent withdrawals
              </h2>
              <ul className="mt-1 divide-y divide-border-subtle">
                {recentRequests.map((r) => {
                  const cfg = resolvePayoutStatusConfig(r.status);
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="tnum text-body-emphasis font-medium text-text-primary">
                          {formatPrice(r.amountGbp, r.currency)}
                        </p>
                        <p className="clamp-1 text-caption text-text-muted">
                          {r.destinationLabel} · {formatRequestDate(r.createdAt)}
                        </p>
                      </div>
                      <Badge variant={cfg.badge} icon={cfg.pending ? 'clock' : undefined}>
                        {cfg.label}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* Sticky footer — honest ETA + review CTA */}
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
                  ? destinations.length > 0
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
