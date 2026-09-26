'use client';

/**
 * Withdraw surface — form → confirm → staged progress → success receipt.
 * Web port of the mobile WithdrawScreen state machine (fixture mode: no
 * biometric gate, payout accounts are saved bank details instead of a
 * Stripe Connect profile). Confirming writes an honest pending
 * `withdrawal` entry into the ['wallet'] session ledger and drops the
 * available balance — money is earmarked at request time, never "paid"
 * before the bank confirms.
 */

import { useEffect, useState } from 'react';
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
import { formatPrice } from '@/lib/utils/format';
import type { PayoutRequest } from '@/lib/data/fixtures';
import { useWalletData, type WalletData } from '../useWalletData';
import type { WalletLedgerEntry } from '../ledgerViewModel';
import { ConvertSummaryRow } from '../ConvertSummaryRow';
import { round2, sanitizeAmount } from '../convertViewModel';
import { AddBankAccountSheet } from './AddBankAccountSheet';
import { usePayoutAccounts } from './usePayoutAccounts';
import {
  AMOUNT_ERROR_COPY,
  canReview,
  formatRequestDate,
  formatRequestedAt,
  newPayoutReference,
  QUICK_PERCENTAGES,
  quickAmount,
  resolvePayoutStatusConfig,
  maskedAccountLabel,
  withdrawError,
  WITHDRAWAL_ETA_LABEL,
  WITHDRAWAL_FEE_GBP,
  WITHDRAWAL_REVIEW_LABEL,
  type WithdrawStep,
  type WithdrawSuccessData,
} from './withdrawViewModel';

/** Fixture-mode submission stages — honest labels for what actually happens. */
const SUBMIT_STAGES = [
  'Reserving funds from your balance',
  'Recording your payout request',
  'Sending for review',
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
  const { accounts, defaultAccount, requests, addAccount, recordRequest } = usePayoutAccounts();

  const [step, setStep] = useState<WithdrawStep>('form');
  const [amount, setAmount] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<WithdrawSuccessData | null>(null);

  const available = data?.available ?? 0;
  const currency = data?.currency ?? 'GBP';
  const numericAmount = Number(amount) || 0;
  const error = withdrawError(numericAmount, available, accounts.length > 0);
  const selected = accounts.find((a) => a.id === selectedId) ?? null;
  const reviewable = canReview(numericAmount, available, accounts.length > 0, step === 'submitting');

  // Mobile prefills the composer with the full available balance.
  useEffect(() => {
    if (data && amount === '' && data.available > 0) {
      setAmount(data.available.toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Keep the selection pointed at a real account — default when unset or removed.
  useEffect(() => {
    if (accounts.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !accounts.some((a) => a.id === selectedId)) {
      setSelectedId(defaultAccount?.id ?? accounts[0].id);
    }
  }, [accounts, defaultAccount, selectedId]);

  const commit = (accountId: string, destinationLabel: string) => {
    const createdAt = new Date().toISOString();
    const request: PayoutRequest = {
      id: `pw-${Date.now().toString(36)}`,
      reference: newPayoutReference(),
      accountId,
      destinationLabel,
      amountGbp: round2(numericAmount),
      currency,
      status: 'requested',
      createdAt,
    };

    recordRequest(request);
    queryClient.setQueryData<WalletData>(['wallet'], (old) => {
      if (!old) return old;
      const entry: WalletLedgerEntry = {
        id: request.id,
        kind: 'withdrawal',
        amount: -request.amountGbp,
        status: 'pending',
        date: createdAt,
        description: `Withdrawal to ${destinationLabel}`,
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
      destinationLabel,
      createdAt,
    });
    setStep('success');
    show('Withdrawal requested — we’ll notify you when it’s sent', 'success');
  };

  const execute = () => {
    if (!reviewable || !selected) return;
    const accountId = selected.id;
    const destinationLabel = maskedAccountLabel(selected);
    setStage(0);
    setStep('submitting');
    SUBMIT_STAGES.forEach((_, i) => {
      window.setTimeout(
        () => {
          if (i === SUBMIT_STAGES.length - 1) commit(accountId, destinationLabel);
          else setStage(i + 1);
        },
        STAGE_MS * (i + 1),
      );
    });
  };

  if (isLoading) return <WithdrawSkeleton />;

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
            {formatPrice(result.amountGbp, 'GBP')} requested — we’ll notify you when it’s sent
          </p>
        </div>

        <div className="mt-8 px-4 sm:px-6">
          <ConvertSummaryRow label="Reference" value={result.reference} />
          <ConvertSummaryRow label="Amount" value={formatPrice(result.amountGbp, 'GBP')} />
          <ConvertSummaryRow label="Destination" value={result.destinationLabel} />
          <ConvertSummaryRow label="Requested" value={formatRequestedAt(result.createdAt)} />
          <ConvertSummaryRow label="Status" value="Pending review" />
        </div>

        <p className="mt-6 flex items-start gap-1.5 px-4 text-caption text-text-muted sm:px-6">
          <Icon name="clock" size={14} className="mt-0.5 shrink-0" />
          Transfers typically arrive in {WITHDRAWAL_ETA_LABEL}. You can track the status in
          your payout activity.
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

  // ── Submitting — staged progress ──────────────────────────────────────
  if (step === 'submitting') {
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
            to {selected ? maskedAccountLabel(selected) : 'your bank account'}
          </p>
          <ul className="mt-10">
            {SUBMIT_STAGES.map((label, i) => (
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
          <ConvertSummaryRow label="Destination" value={maskedAccountLabel(selected)} />
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

            {accounts.length === 0 ? (
              <button
                type="button"
                onClick={() => setAddSheetOpen(true)}
                className="pressable mt-3 flex w-full items-center gap-3 rounded-lg border border-dashed border-border px-4 py-4 text-left"
              >
                <Icon name="plus" size={20} className="text-brand" />
                <span className="flex-1">
                  <span className="block text-body-emphasis font-medium text-text-primary">
                    Add a bank account
                  </span>
                  <span className="block text-caption text-text-muted">
                    Required to withdraw — sort code + account number
                  </span>
                </span>
                <Icon name="forward" size={16} className="text-text-muted" />
              </button>
            ) : (
              <ul role="radiogroup" aria-label="Payout bank account" className="mt-1">
                {accounts.map((a) => {
                  const checked = a.id === selectedId;
                  return (
                    <li key={a.id} className="border-b border-border-subtle">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        onClick={() => setSelectedId(a.id)}
                        className="pressable flex min-h-[52px] w-full items-center gap-3 py-2.5 text-left"
                      >
                        <span className="flex h-11 w-9 shrink-0 items-center text-text-secondary">
                          <Icon name="store" size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="clamp-1 block text-body-emphasis text-text-primary">
                            {a.bankName} •••• {a.last4}
                          </span>
                          <span className="clamp-1 block text-caption text-text-muted">
                            {a.holderName} · Sort code {a.sortCode}
                            {a.isDefault ? ' · Default' : ''}
                          </span>
                        </span>
                        <span
                          aria-hidden
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                            checked ? 'border-brand bg-brand' : 'border-border'
                          }`}
                        >
                          {checked ? <Icon name="check" size={12} className="text-text-inverse" /> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
                <li>
                  <button
                    type="button"
                    onClick={() => setAddSheetOpen(true)}
                    className="pressable flex min-h-[52px] w-full items-center gap-3 py-2.5 text-left"
                  >
                    <span className="flex h-11 w-9 shrink-0 items-center text-brand">
                      <Icon name="plus" size={18} />
                    </span>
                    <span className="flex-1 text-body-emphasis text-brand">Add bank account</span>
                  </button>
                </li>
              </ul>
            )}
          </section>

          {/* Recent withdrawals — honest statuses */}
          {recentRequests.length > 0 ? (
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
              Transfers to your bank typically arrive in {WITHDRAWAL_ETA_LABEL}. Status updates
              when the bank confirms.
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
                {AMOUNT_ERROR_COPY.no_method}
              </p>
            ) : null}
          </div>
        </>
      )}

      <AddBankAccountSheet
        open={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        accounts={accounts}
        onSave={(input) => {
          const account = addAccount(input);
          setSelectedId(account.id);
          show(`${account.bankName} •••• ${account.last4} saved`, 'success');
        }}
      />
    </div>
  );
}
