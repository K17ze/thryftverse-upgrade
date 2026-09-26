'use client';

/**
 * Payout methods surface — saved bank accounts (default marker, add,
 * remove) plus the withdrawal history. Removal is honest: the last
 * remaining account can't be deleted while it's the only destination, and
 * removing the default hands the marker to the oldest remaining account.
 * Pending rows carry the same clock-badge grammar as the wallet ledger.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { formatPrice } from '@/lib/utils/format';
import { AddBankAccountSheet } from './AddBankAccountSheet';
import { usePayoutAccounts } from './usePayoutAccounts';
import {
  formatRequestDate,
  resolvePayoutStatusConfig,
} from './withdrawViewModel';

export function PayoutsView() {
  const router = useRouter();
  const { show } = useToast();
  const { accounts, requests, addAccount, removeAccount, setDefault } = usePayoutAccounts();
  const [addSheetOpen, setAddSheetOpen] = useState(false);

  const remove = (id: string) => {
    const result = removeAccount(id);
    if (!result.ok) {
      show(
        result.reason === 'only_account'
          ? 'Add another bank account before removing this one'
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
        Bank accounts &amp; withdrawal history
      </p>

      {/* Saved bank accounts */}
      <section aria-label="Saved bank accounts" className="mt-8 px-4 sm:px-6">
        <h2 className="text-label font-semibold uppercase tracking-wider text-text-muted">
          Bank accounts
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
                Needed before you can withdraw
              </span>
            </span>
            <Icon name="forward" size={16} className="text-text-muted" />
          </button>
        ) : (
          <ul className="mt-1">
            {accounts.map((a) => {
              const onlyAccount = accounts.length === 1;
              return (
                <li key={a.id} className="border-b border-border-subtle py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-9 shrink-0 items-center text-text-secondary">
                      <Icon name="store" size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="clamp-1 text-body-emphasis text-text-primary">
                        {a.bankName} •••• {a.last4}
                      </p>
                      <p className="clamp-1 text-caption text-text-muted">
                        {a.holderName} · Sort code {a.sortCode}
                      </p>
                    </div>
                    {a.isDefault ? (
                      <Badge variant="neutral">Default</Badge>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setDefault(a.id);
                          show(`${a.bankName} •••• ${a.last4} is now your default`, 'success');
                        }}
                        className="pressable shrink-0 text-caption font-medium text-brand hover:opacity-80"
                      >
                        Make default
                      </button>
                    )}
                    <IconButton
                      name="trash"
                      size={18}
                      aria-label={`Remove ${a.bankName} account ending ${a.last4}`}
                      onClick={() => remove(a.id)}
                      disabled={onlyAccount}
                      title={
                        onlyAccount
                          ? 'Add another bank account before removing this one'
                          : undefined
                      }
                      className={onlyAccount ? 'opacity-40' : ''}
                    />
                  </div>
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

      {/* Withdrawal history */}
      <section aria-label="Withdrawal history" className="mt-10 px-4 sm:px-6">
        <h2 className="text-label font-semibold uppercase tracking-wider text-text-muted">
          Withdrawal history
        </h2>

        {requests.length === 0 ? (
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
        Only the last 4 digits of each account are stored. Withdrawals typically take 1–3
        business days once reviewed.
      </p>

      <AddBankAccountSheet
        open={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        accounts={accounts}
        onSave={(input) => {
          const account = addAccount(input);
          show(`${account.bankName} •••• ${account.last4} saved`, 'success');
        }}
      />
    </div>
  );
}
