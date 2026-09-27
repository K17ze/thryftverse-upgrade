'use client';

/**
 * Payout methods surface — saved destinations (default marker, add,
 * remove) plus the withdrawal history.
 *
 *  - live mode: destinations are the server's payout_accounts rows and
 *    history is the server's payout_requests. Adding a method runs the
 *    real Stripe Connect sequence (PayoutSetupSheet); there is no
 *    delete/set-default endpoint, so those controls only exist in the
 *    fixture build rather than faking mutations.
 *  - fixture mode: the local overlay store — removal is honest (the last
 *    remaining account can't be deleted; removing the default hands the
 *    marker to the oldest remaining account), and the footer discloses
 *    that everything on this page lives on this device.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSession } from '@/lib/session/SessionProvider';
import { formatPrice } from '@/lib/utils/format';
import { AddBankAccountSheet } from './AddBankAccountSheet';
import { PayoutSetupSheet } from './PayoutSetupSheet';
import { usePayoutAccounts } from './usePayoutAccounts';
import {
  DESTINATION_STATUS_CONFIG,
  formatRequestDate,
  resolvePayoutStatusConfig,
} from './withdrawViewModel';

function PayoutsSkeleton() {
  return (
    <div aria-busy aria-label="Loading payout methods">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <Skeleton className="h-11 w-11 rounded-full" />
        <Skeleton className="h-7 w-44" />
      </div>
      <div className="mt-8 px-4 sm:px-6">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-3 h-[52px] w-full" />
        <Skeleton className="mt-px h-[52px] w-full" />
      </div>
      <div className="mt-10 px-4 sm:px-6">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="mt-3 h-10 w-full" />
        <Skeleton className="mt-2 h-10 w-full" />
      </div>
    </div>
  );
}

export function PayoutsView() {
  const router = useRouter();
  const { show } = useToast();
  const { isGuest, sessionLoading } = useSession();
  const {
    mode,
    destinations,
    requests,
    isLoading,
    isError,
    requestsError,
    refetch,
    fixtureAccounts,
    addAccount,
    removeAccount,
    setDefault,
  } = usePayoutAccounts();
  const isLive = mode === 'live';
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [setupSheetOpen, setSetupSheetOpen] = useState(false);

  // Bank accounts + withdrawal history are account-bound — the fixture
  // seeds belong to the demo identity, never to a guest.
  if (!sessionLoading && isGuest) {
    return (
      <div className="mx-auto w-full max-w-xl pb-16">
        <EmptyState
          icon="wallet"
          title="Sign in to manage payouts"
          subtitle="Bank accounts and withdrawal history are tied to your account."
          actionLabel="Sign in"
          onAction={() => router.push('/auth')}
        />
      </div>
    );
  }

  if (sessionLoading || isLoading) {
    return <PayoutsSkeleton />;
  }

  const openAddFlow = () => (isLive ? setSetupSheetOpen(true) : setAddSheetOpen(true));

  const remove = (id: string) => {
    const result = removeAccount(id);
    if (!result.ok) {
      show(
        result.reason === 'only_account'
          ? 'Add another bank account before removing this one'
          : result.reason === 'unsupported'
            ? 'Payout methods are managed through Stripe'
            : 'This account is no longer saved',
        'info',
      );
      return;
    }
    show(
      result.promotedToDefault
        ? 'Account removed — default moved to your remaining account'
        : 'Bank account removed',
      'success',
    );
  };

  return (
    <div className="mx-auto w-full max-w-xl pb-16">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to wallet" onClick={() => router.push('/wallet')} />
        <h1 className="text-screen-title font-semibold text-text-primary">Payout methods</h1>
      </div>
      <p className="mt-1 px-4 text-caption text-text-secondary sm:px-6">
        {isLive ? 'Payout destinations & withdrawal history' : 'Bank accounts & withdrawal history'}
      </p>

      {/* Saved payout destinations */}
      <section aria-label="Saved payout destinations" className="mt-8 px-4 sm:px-6">
        <h2 className="text-label font-semibold uppercase tracking-wider text-text-muted">
          {isLive ? 'Payout destinations' : 'Bank accounts'}
        </h2>

        {isError ? (
          <div className="mt-3 rounded-lg border border-border-subtle px-4 py-4">
            <p className="text-body text-text-secondary">
              Your payout methods couldn&rsquo;t be loaded.
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
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
                  ? 'Connect a payout account with Stripe'
                  : 'Needed before you can withdraw'}
              </span>
            </span>
            <Icon name="forward" size={16} className="text-text-muted" />
          </button>
        ) : (
          <ul className="mt-1">
            {destinations.map((d) => {
              const onlyAccount = destinations.length === 1;
              return (
                <li key={d.id} className="border-b border-border-subtle py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-9 shrink-0 items-center text-text-secondary">
                      <Icon name="store" size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="clamp-1 text-body-emphasis text-text-primary">{d.title}</p>
                      <p className="clamp-1 text-caption text-text-muted">{d.subtitle}</p>
                    </div>
                    {d.status !== 'active' ? (
                      <Badge variant={DESTINATION_STATUS_CONFIG[d.status].badge}>
                        {DESTINATION_STATUS_CONFIG[d.status].label}
                      </Badge>
                    ) : d.isDefault ? (
                      <Badge variant="neutral">Default</Badge>
                    ) : isLive ? null : (
                      <button
                        type="button"
                        onClick={() => {
                          setDefault(d.id);
                          show(`${d.title} is now your default`, 'success');
                        }}
                        className="pressable shrink-0 text-caption font-medium text-brand hover:opacity-80"
                      >
                        Make default
                      </button>
                    )}
                    {/* No payout-account delete endpoint exists — the
                        control only renders in the fixture build. */}
                    {!isLive ? (
                      <IconButton
                        name="trash"
                        size={18}
                        aria-label={`Remove ${d.title}`}
                        onClick={() => remove(d.id)}
                        disabled={onlyAccount}
                        title={
                          onlyAccount
                            ? 'Add another bank account before removing this one'
                            : undefined
                        }
                        className={onlyAccount ? 'opacity-40' : ''}
                      />
                    ) : null}
                  </div>
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

      {/* Withdrawal history */}
      <section aria-label="Withdrawal history" className="mt-10 px-4 sm:px-6">
        <h2 className="text-label font-semibold uppercase tracking-wider text-text-muted">
          Withdrawal history
        </h2>

        {requestsError ? (
          <p className="mt-3 text-body text-text-muted">
            Withdrawal history couldn&rsquo;t be loaded.{' '}
            <button
              type="button"
              onClick={() => void refetch()}
              className="pressable font-medium text-brand"
            >
              Try again
            </button>
          </p>
        ) : requests.length === 0 ? (
          <p className="mt-3 text-body text-text-muted">No withdrawals yet.</p>
        ) : (
          <ul className="mt-1 divide-y divide-border-subtle">
            {requests.map((r) => {
              const cfg = resolvePayoutStatusConfig(r.status);
              return (
                <li key={r.id} className="flex items-start justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <p className="tnum text-body-emphasis font-medium text-text-primary">
                      {formatPrice(r.amountGbp, r.currency)}
                    </p>
                    <p className="clamp-1 text-caption text-text-muted">
                      {r.destinationLabel} · {r.reference}
                    </p>
                    <p className="text-caption text-text-muted">{formatRequestDate(r.createdAt)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge variant={cfg.badge} icon={cfg.pending ? 'clock' : undefined}>
                      {cfg.label}
                    </Badge>
                    {cfg.subtitle ? (
                      <p className="mt-1 max-w-40 text-caption text-text-muted">{cfg.subtitle}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="mt-10 flex items-center gap-1.5 px-4 text-caption text-text-muted sm:px-6">
        <Icon name="info" size={14} className="shrink-0" />
        {isLive
          ? 'Payouts go to your connected Stripe account and are reviewed before they’re sent — typically 1–3 business days.'
          : 'Demo — payout methods and withdrawals on this page are stored on this device only. Only the last 4 digits of an account number are kept.'}
      </p>

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
            show(`${account.bankName} •••• ${account.last4} saved`, 'success');
          }}
        />
      )}
    </div>
  );
}
