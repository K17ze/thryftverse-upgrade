'use client';

/**
 * AddressesView — the /settings/addresses surface. Web port of the mobile
 * SavedAddressesScreen: one flat list (name, street, city + postcode),
 * edit/remove per row, default carried by the edit sheet's toggle.
 *
 * Truth lives in useSavedAddresses (fixture seeds + session overlays).
 * Removing the default promotes the oldest remaining address — the store
 * resolves it, the toast says so.
 */

import { useState } from 'react';
import { SettingsSection } from './SettingsSection';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { useHydrated } from '@/lib/store/useStore';
import { useSavedAddresses } from '@/lib/store/userPaymentData';
import { AddAddressSheet } from '@/components/checkout/AddPaymentSheets';
import { ConfirmSheet, type ConfirmSheetState } from '@/components/orders/ConfirmSheet';
import type { Address } from '@/lib/contracts/domain';

function AddressRow({
  address,
  onEdit,
  onRemove,
}: {
  address: Address;
  onEdit: () => void;
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
        <Button variant="quiet" size="sm" onClick={onEdit}>
          Edit
        </Button>
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
  const { addresses, defaultAddress, addAddress, updateAddress, removeAddress, setDefaultAddress } =
    useSavedAddresses();
  const { show } = useToast();
  const [sheet, setSheet] = useState<'closed' | 'add' | 'edit'>('closed');
  const [editing, setEditing] = useState<Address | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSheetState | null>(null);

  if (!hydrated) {
    return (
      <div aria-busy aria-label="Loading addresses" className="mt-2 space-y-px">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-[88px] w-full rounded-none" />
        ))}
      </div>
    );
  }

  const requestRemove = (address: Address) =>
    setConfirm({
      title: 'Remove address?',
      message: `${address.name} — ${address.street}, ${address.city} ${address.postcode} will be removed from your saved addresses.`,
      confirmLabel: 'Remove',
      variant: 'destructive',
      onConfirm: () => {
        const result = removeAddress(address.id);
        setConfirm(null);
        if (result.ok) {
          show(
            result.promotedToDefault ? 'Address removed — next address is now default' : 'Address removed',
            'success',
          );
        } else {
          show('Could not remove this address', 'error');
        }
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
                onEdit={() => {
                  setEditing(a);
                  setSheet('edit');
                }}
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
          } else {
            const created = addAddress(fields);
            if (makeDefault || addresses.length === 0) setDefaultAddress(created.id);
            show('Address saved', 'success');
          }
        }}
      />

      <ConfirmSheet sheet={confirm} onDismiss={() => setConfirm(null)} />
    </>
  );
}
