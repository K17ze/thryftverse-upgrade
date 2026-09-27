'use client';

/**
 * AddressesView — the /settings/addresses surface. Web port of the mobile
 * SavedAddressesScreen: one flat list (name, street, city + postcode),
 * edit/remove per row, default carried by the edit sheet's toggle.
 *
 * Fixture truth is the local overlay (useSavedAddresses via
 * useManagedAddresses); removing the default promotes the oldest remaining
 * address — the store resolves it, the toast says so.
 *
 * Live truth is the server rail (GET/POST/DELETE /users/:id/addresses via
 * useManagedAddresses). There is no address PATCH or set-default route, so
 * live rows omit Edit — the only live writes are create (whose isDefault
 * flag the server honours, auto-defaulting the first) and delete (the
 * server re-promotes a default itself). Loading and error states are real.
 */

import { useState } from 'react';
import { SettingsSection } from './SettingsSection';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { useHydrated } from '@/lib/store/useStore';
import { useManagedAddresses } from '@/lib/hooks/instrument-queries';
import { parseApiError } from '@/lib/api/http';
import { AddAddressSheet } from '@/components/checkout/AddPaymentSheets';
import { ConfirmSheet, type ConfirmSheetState } from '@/components/orders/ConfirmSheet';
import type { Address } from '@/lib/contracts/domain';

function AddressRow({
  address,
  onEdit,
  onRemove,
}: {
  address: Address;
  /** null omits the control — live mode has no address-update route. */
  onEdit: (() => void) | null;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-2 px-4 py-3.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-body-emphasis font-medium text-text-primary">
          {address.name}
          {address.isDefault ? (
            <span className="text-meta font-medium text-text-muted">Default</span>
          ) : null}
        </p>
        <p className="mt-0.5 text-body text-text-secondary">{address.street}</p>
        <p className="text-body text-text-secondary">
          {address.city} {address.postcode}
        </p>
      </div>
      <div className="flex shrink-0 items-center -my-1.5 -mr-2">
        {onEdit ? (
          <Button variant="quiet" size="sm" onClick={onEdit}>
            Edit
          </Button>
        ) : null}
        <IconButton
          name="trash"
          size={18}
          aria-label={`Remove ${address.name}`}
          onClick={onRemove}
          className="text-danger-text hover:bg-danger-subtle"
        />
      </div>
    </div>
  );
}

export function AddressesView() {
  const hydrated = useHydrated();
  const {
    mode,
    addresses,
    defaultAddress,
    isLoading,
    isError,
    refetch,
    addAddress,
    updateAddress,
    removeAddress,
    setDefaultAddress,
  } = useManagedAddresses();
  const { show } = useToast();
  const [sheet, setSheet] = useState<'closed' | 'add' | 'edit'>('closed');
  const [editing, setEditing] = useState<Address | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSheetState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  if (!hydrated || isLoading) {
    return (
      <div aria-busy aria-label="Loading addresses" className="mt-2 space-y-px">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-[88px] w-full rounded-none" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon="alert"
        title="Couldn't load addresses"
        subtitle="Check your connection and try again."
        actionLabel="Try again"
        onAction={refetch}
        compact
      />
    );
  }

  const requestRemove = (address: Address) =>
    setConfirm({
      title: 'Remove address?',
      message: `${address.name} — ${address.street}, ${address.city} ${address.postcode} will be removed from your saved addresses.`,
      confirmLabel: 'Remove',
      variant: 'destructive',
      onConfirm: () => {
        // Both modes resolve through the same async result; fixture
        // resolves on a microtask, live after the DELETE + re-read.
        setConfirmBusy(true);
        void removeAddress(address.id)
          .then((result) => {
            setConfirm(null);
            if (result.ok) {
              show(
                result.promotedToDefault
                  ? 'Address removed — next address is now default'
                  : 'Address removed',
                'success',
              );
            } else {
              show('Could not remove this address', 'error');
            }
          })
          .catch(() => {
            setConfirm(null);
            show('Could not remove this address', 'error');
          })
          .finally(() => setConfirmBusy(false));
      },
    });

  return (
    <>
      {addresses.length === 0 ? (
        <EmptyState
          icon="location"
          title="No saved addresses"
          subtitle="Add a delivery address for faster checkout. Save more than one and choose a default."
          actionLabel="Add address"
          onAction={() => setSheet('add')}
          compact
        />
      ) : (
        <>
          <p className="px-4 pb-4 text-caption text-text-muted sm:px-5">
            {addresses.length} address{addresses.length === 1 ? '' : 'es'} saved
            {defaultAddress ? ` · ${defaultAddress.name} is default` : ''}
          </p>
          <SettingsSection title="Saved addresses">
            {addresses.map((a) => (
              <AddressRow
                key={a.id}
                address={a}
                onEdit={
                  updateAddress
                    ? () => {
                        setEditing(a);
                        setSheet('edit');
                      }
                    : null
                }
                onRemove={() => requestRemove(a)}
              />
            ))}
          </SettingsSection>
          <div className="px-4 pt-4 sm:px-5">
            <Button variant="secondary" size="md" icon="plus" onClick={() => setSheet('add')}>
              Add address
            </Button>
          </div>
          <p className="px-4 pt-5 text-caption text-text-muted sm:px-5">
            Addresses are used at checkout and for delivery. The default is selected automatically.
          </p>
        </>
      )}

      <AddAddressSheet
        open={sheet !== 'closed'}
        initial={sheet === 'edit' ? editing : null}
        showDefaultToggle
        onClose={() => {
          setSheet('closed');
          setEditing(null);
        }}
        onSave={(fields, makeDefault) => {
          if (sheet === 'edit' && editing) {
            // Fixture-only path — live never opens the edit sheet (there is
            // no address-update route to write through); if it ever did,
            // bail rather than POST a duplicate.
            if (!updateAddress || !setDefaultAddress) return;
            updateAddress(editing.id, fields);
            if (makeDefault && !editing.isDefault) {
              setDefaultAddress(editing.id);
            } else if (!makeDefault && editing.isDefault) {
              // Un-defaulting hands the flag to the oldest other address —
              // a lone remaining address stays default by resolution.
              const next = addresses.find((a) => a.id !== editing.id);
              if (next) setDefaultAddress(next.id);
            }
            show('Address updated', 'success');
            return;
          }
          if (mode === 'live') {
            // Returning the promise keeps the sheet open (busy) until the
            // server row lands; a rejected save stays open with the error
            // toasted — nothing is written locally in live.
            return addAddress(fields, makeDefault)
              .then(() => {
                show('Address saved', 'success');
              })
              .catch((error) => {
                show(
                  parseApiError(
                    error,
                    'Address couldn’t be saved — check your connection and try again.',
                  ).message,
                  'error',
                );
                throw error;
              });
          }
          void addAddress(fields, makeDefault).then(() =>
            show('Address saved', 'success'),
          );
        }}
      />

      <ConfirmSheet sheet={confirm} busy={confirmBusy} onDismiss={() => setConfirm(null)} />
    </>
  );
}
