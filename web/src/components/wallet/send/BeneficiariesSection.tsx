'use client';

/**
 * BeneficiariesSection — the recipient picker on the Send money surface.
 *
 * Rows render serializeBeneficiary truth: display name, masked account
 * tail (last-4 only, from `fields`), currency chip and country. A row
 * press selects it for the composer; the trailing bin arms an inline
 * Keep/Remove confirm (soft-delete via DELETE /users/:id/beneficiaries/:id).
 * "New recipient" opens the account-type-aware create form (see
 * BeneficiaryForm.tsx).
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { parseApiError } from '@/lib/api/http';
import {
  deleteBeneficiary,
  type BeneficiaryPayload,
} from '@/lib/api/services/fx';
import { walletKeys } from '../walletKeys';
import { BeneficiaryForm } from './BeneficiaryForm';
import {
  accountTypeLabel,
  countryName,
  maskedAccountTail,
} from './sendModel';

interface BeneficiariesSectionProps {
  beneficiaries: BeneficiaryPayload[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (beneficiaryId: string) => void;
  userId: string;
  disabled?: boolean;
}

export function BeneficiariesSection({
  beneficiaries,
  isLoading,
  isError,
  onRetry,
  selectedId,
  onSelect,
  userId,
  disabled = false,
}: BeneficiariesSectionProps) {
  const queryClient = useQueryClient();
  const { show } = useToast();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const handleDelete = async (beneficiary: BeneficiaryPayload) => {
    setBusyId(beneficiary.id);
    setDeleteError('');
    try {
      await deleteBeneficiary(userId, beneficiary.id);
      // The server confirmed the soft-delete — drop the row from the
      // cached list immediately so a stale selection can't point at a
      // disabled recipient while the refetch lands.
      queryClient.setQueryData<BeneficiaryPayload[]>(
        walletKeys.beneficiaries(userId),
        (old) => (old ?? []).filter((b) => b.id !== beneficiary.id),
      );
      void queryClient.invalidateQueries({ queryKey: walletKeys.beneficiaries(userId) });
      setConfirmingId(null);
      show(`${beneficiary.displayName} removed`, 'info');
    } catch (error) {
      setDeleteError(parseApiError(error, 'Couldn’t remove this recipient.').message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-label="Recipients" className="px-4 sm:px-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          To
        </h2>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          disabled={disabled}
          className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          New recipient
        </button>
      </div>

      {isLoading ? (
        <div aria-busy className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-baseline justify-between py-3">
              <Skeleton className="h-4 w-[40%]" />
              <Skeleton className="h-4 w-[25%]" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="mt-2 flex items-baseline justify-between border-y border-border-subtle py-3">
          <span className="text-body text-danger-text">Couldn&apos;t load recipients.</span>
          <button
            type="button"
            onClick={onRetry}
            className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
          >
            Try again
          </button>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
          {beneficiaries.map((beneficiary) => {
            const selected = beneficiary.id === selectedId;
            const confirming = confirmingId === beneficiary.id;
            const tail = maskedAccountTail(beneficiary);
            return (
              <li key={beneficiary.id}>
                {confirming ? (
                  <div className="flex items-center justify-between gap-4 border-l-2 border-danger-border py-3 pl-3">
                    <p className="text-body text-text-secondary">
                      Remove {beneficiary.displayName}? This can&apos;t be undone.
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        variant="quiet"
                        onClick={() => setConfirmingId(null)}
                        disabled={busyId === beneficiary.id}
                      >
                        Keep
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => void handleDelete(beneficiary)}
                        disabled={busyId === beneficiary.id}
                      >
                        {busyId === beneficiary.id ? 'Removing…' : 'Remove'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onSelect(beneficiary.id)}
                      aria-pressed={selected}
                      className="pressable flex min-w-0 flex-1 items-baseline justify-between gap-4 py-3 text-left"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="clamp-1 text-body font-medium text-text-primary">
                            {beneficiary.displayName}
                          </span>
                          {selected ? (
                            <Icon name="check" size={15} className="shrink-0 text-brand" filled />
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-meta text-text-muted">
                          {accountTypeLabel(beneficiary.accountType)}
                          {tail ? ` · ${tail}` : ''}
                          {' · '}
                          {countryName(beneficiary.countryCode)}
                        </span>
                      </span>
                      <span className="tnum shrink-0 text-body font-medium text-text-secondary">
                        {beneficiary.currency}
                      </span>
                    </button>
                    <IconButton
                      name="trash"
                      size={16}
                      aria-label={`Remove ${beneficiary.displayName}`}
                      onClick={() => setConfirmingId(beneficiary.id)}
                      className="-mr-2 shrink-0"
                    />
                  </div>
                )}
              </li>
            );
          })}
          {beneficiaries.length === 0 ? (
            <li className="py-4 text-body text-text-muted">
              No recipients yet — add one to send money.
            </li>
          ) : null}
        </ul>
      )}
      {deleteError ? (
        <p role="alert" className="mt-2 text-caption text-danger-text">
          {deleteError}
        </p>
      ) : null}

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="New recipient">
        <BeneficiaryForm
          userId={userId}
          onCreated={(beneficiaryId) => {
            setSheetOpen(false);
            onSelect(beneficiaryId);
          }}
        />
      </Sheet>
    </section>
  );
}
