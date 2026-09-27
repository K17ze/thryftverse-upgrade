'use client';

/**
 * PaymentMethodsView — the /settings/payments surface. Web port of the
 * mobile PaymentsScreen management slice: masked cards (last4 only — the
 * tokenised contract), set-default and remove per row, the balance-first
 * preference toggle, and add via the shared checkout card sheet.
 *
 * Fixture truth is the local overlay (useSavedPaymentMethods via
 * useManagedPaymentMethods). Live truth is the Stripe-projected
 * GET /v2/payments/methods rail — remove detaches at the provider and
 * set-default PATCHes the provider-bound route (both keyed by the pm_*
 * ref the hook resolves from a fresh read). There is no web card-add
 * rail — the legacy create route is permanently 410 — so "Add card"
 * opens the shared sheet's honest tokenisation notice instead of a
 * localStorage form. Mobile's Apple Pay / Google Pay rows and biometric
 * gate are platform-only and are honestly absent on web.
 */

import { useState } from 'react';
import { SettingsSection } from './SettingsSection';
import { Switch } from './Switch';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { useHydrated } from '@/lib/store/useStore';
import { useManagedPaymentMethods } from '@/lib/hooks/instrument-queries';
import { parseApiError } from '@/lib/api/http';
import { AddCardSheet } from '@/components/checkout/AddPaymentSheets';
import { ConfirmSheet, type ConfirmSheetState } from '@/components/orders/ConfirmSheet';
import type { PaymentMethod } from '@/lib/contracts/domain';

function methodLabel(pm: PaymentMethod): string {
  if (pm.type === 'bank_account') return pm.bankName ?? 'Bank account';
  const brand = pm.brand ? pm.brand[0].toUpperCase() + pm.brand.slice(1) : 'Card';
  return `${brand} •••• ${pm.last4}`;
}

function MethodRow({
  method,
  onSetDefault,
  onRemove,
}: {
  method: PaymentMethod;
  onSetDefault: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
      <Icon
        name={method.type === 'card' ? 'card' : 'wallet'}
        size={20}
        className="shrink-0 text-text-secondary"
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-body-emphasis font-medium text-text-primary">
          {methodLabel(method)}
          {method.isDefault ? (
            <span className="text-meta font-medium text-text-muted">Default</span>
          ) : null}
        </p>
        <p className="text-caption text-text-muted">
          {method.expiry ? (
            <span className="tnum">Expires {method.expiry}</span>
          ) : (
            'Saved payment method'
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center -my-1.5 -mr-2">
        {method.isDefault ? null : (
          <Button variant="quiet" size="sm" onClick={onSetDefault}>
            Set default
          </Button>
        )}
        <IconButton
          name="trash"
          size={18}
          aria-label={`Remove ${methodLabel(method)}`}
          onClick={onRemove}
          className="text-danger-text hover:bg-danger-subtle"
        />
      </div>
    </div>
  );
}

export function PaymentMethodsView() {
  const hydrated = useHydrated();
  const {
    mode,
    methods,
    isLoading,
    isError,
    providerUnavailable,
    refetch,
    useBalanceFirst,
    setUseBalanceFirst,
    addPaymentMethod,
    removePaymentMethod,
    setDefaultPaymentMethod,
  } = useManagedPaymentMethods();
  const { show } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmSheetState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  if (!hydrated || isLoading) {
    return (
      <div aria-busy aria-label="Loading payment methods" className="mt-2 space-y-px">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-[64px] w-full rounded-none" />
        ))}
      </div>
    );
  }

  const requestRemove = (method: PaymentMethod) =>
    setConfirm({
      title: 'Remove payment method?',
      message: `${methodLabel(method)} will be removed from your account.`,
      confirmLabel: 'Remove',
      variant: 'destructive',
      onConfirm: () => {
        // Fixture resolves on a microtask; live detaches at the provider
        // and re-reads the rail before the toast reports the outcome.
        setConfirmBusy(true);
        void removePaymentMethod(method.id)
          .then((result) => {
            setConfirm(null);
            if (result.ok) {
              show(
                result.promotedToDefault
                  ? 'Payment method removed — next card is now default'
                  : 'Payment method removed',
                'success',
              );
            } else {
              show('Could not remove this payment method', 'error');
            }
          })
          .catch(() => {
            setConfirm(null);
            show('Could not remove this payment method', 'error');
          })
          .finally(() => setConfirmBusy(false));
      },
    });

  return (
    <>
      {/* Inline trust note sits where card-security anxiety peaks — same
          placement as mobile's lock line. */}
      <p className="mb-5 flex items-start gap-1.5 px-4 text-caption text-text-secondary sm:px-5">
        <Icon name="lock" size={14} className="mt-px shrink-0 text-commerce-trust" />
        Cards are tokenised — only the last four digits are ever stored.
      </p>

      {isError ? (
        <EmptyState
          icon="card"
          title={
            providerUnavailable
              ? 'Cards are managed in the app'
              : 'Couldn’t load payment methods'
          }
          subtitle={
            providerUnavailable
              ? 'Cards are added and managed through secure tokenisation in the ThryftVerse app — saved cards still work on web checkout.'
              : 'Check your connection and try again.'
          }
          actionLabel={providerUnavailable ? undefined : 'Try again'}
          onAction={providerUnavailable ? undefined : refetch}
          compact
        />
      ) : methods.length === 0 ? (
        <EmptyState
          icon="card"
          title="No payment methods"
          subtitle={
            mode === 'live'
              ? 'Cards are added through secure tokenisation in the ThryftVerse app — anything you save appears here.'
              : 'Add a card for faster checkout.'
          }
          actionLabel="Add card"
          onAction={() => setAddOpen(true)}
          compact
        />
      ) : (
        <>
          <SettingsSection title="Cards">
            {methods.map((pm) => (
              <MethodRow
                key={pm.id}
                method={pm}
                onSetDefault={() => {
                  void setDefaultPaymentMethod(pm.id)
                    .then(() => show(`${methodLabel(pm)} is now your default`, 'success'))
                    .catch((error) =>
                      show(
                        parseApiError(error, 'Could not update the default card').message,
                        'error',
                      ),
                    );
                }}
                onRemove={() => requestRemove(pm)}
              />
            ))}
          </SettingsSection>
          <div className="px-4 pt-4 sm:px-5">
            <Button variant="secondary" size="md" icon="plus" onClick={() => setAddOpen(true)}>
              Add card
            </Button>
          </div>
        </>
      )}

      <SettingsSection title="Preferences">
        <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="text-body-emphasis text-text-primary">Use wallet balance first</p>
            <p className="text-caption text-text-muted">
              Apply your ThryftVerse balance before charging a card
            </p>
          </div>
          <Switch
            checked={useBalanceFirst}
            onChange={setUseBalanceFirst}
            aria-label="Use wallet balance first"
          />
        </div>
      </SettingsSection>

      <AddCardSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={(p) => {
          // Live never reaches here — the sheet self-gates into the
          // tokenisation notice (no web card rail). Fixture-only write.
          if (!addPaymentMethod) return;
          const created = addPaymentMethod(p);
          if (methods.length === 0) void setDefaultPaymentMethod(created.id);
          show('Card saved', 'success');
        }}
      />

      <ConfirmSheet sheet={confirm} busy={confirmBusy} onDismiss={() => setConfirm(null)} />
    </>
  );
}
