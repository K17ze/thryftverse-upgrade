'use client';

/**
 * CheckoutFormRail — the primary selection rail for the checkout flow:
 * delivery address, per-parcel delivery quotes, payment tenders, and
 * item authenticity verification add-on.
 */

import type { Address, PaymentMethod } from '@/lib/contracts/domain';
import type { CheckoutDeliveryQuote } from '@/lib/data/fixtures-checkout';
import { AUTHENTICATION_THRESHOLD_GBP } from '@/lib/data/fixtures-commerce';
import { DATA_MODE } from '@/lib/api/client';
import { Icon } from '@/components/ui/Icon';
import { AddressPicker, PaymentPicker } from './SelectionList';
import { DeliveryPicker, type ParcelDeliveryVm } from './DeliveryPicker';
import { VerificationSection } from './VerificationSection';

interface CheckoutFormRailProps {
  addresses: Address[];
  addressId: string | null;
  onSelectAddress: (id: string | null) => void;
  onAddAddress: () => void;
  addressesError: boolean;
  refetchInstruments: () => void;
  addressSaveError: string | null;
  parcels: ParcelDeliveryVm[];
  onSelectDelivery: (sellerId: string, quote: CheckoutDeliveryQuote) => void;
  selectedAddress: Address | null;
  onRetryQuotes: () => void;
  paymentMethods: PaymentMethod[];
  paymentId: string | null;
  useOneze: boolean;
  onSelectPayment: (id: string | null) => void;
  onAddCard: () => void;
  walletOption?: {
    available: number;
    needed: number;
    selected: boolean;
    onSelect: () => void;
  };
  paymentMethodsError: boolean;
  verificationRequested: boolean;
  onToggleVerification: () => void;
  autoVerified: boolean;
}

export function CheckoutFormRail({
  addresses,
  addressId,
  onSelectAddress,
  onAddAddress,
  addressesError,
  refetchInstruments,
  addressSaveError,
  parcels,
  onSelectDelivery,
  selectedAddress,
  onRetryQuotes,
  paymentMethods,
  paymentId,
  useOneze,
  onSelectPayment,
  onAddCard,
  walletOption,
  paymentMethodsError,
  verificationRequested,
  onToggleVerification,
  autoVerified,
}: CheckoutFormRailProps) {
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <AddressPicker
        addresses={addresses}
        selectedId={addressId}
        onSelect={onSelectAddress}
        onAdd={onAddAddress}
      />
      {addressesError ? (
        <p className="-mt-4 flex items-center gap-1.5 text-caption text-warning-text">
          <Icon name="alert" size={14} className="shrink-0" />
          Saved addresses couldn’t be loaded.{' '}
          <button
            type="button"
            onClick={refetchInstruments}
            className="pressable font-semibold underline underline-offset-2"
          >
            Try again
          </button>
        </p>
      ) : null}
      {addressSaveError ? (
        <p
          className="-mt-4 flex items-center gap-1.5 text-caption text-danger-text"
          role="alert"
        >
          <Icon name="alert" size={14} className="shrink-0" />
          {addressSaveError}
        </p>
      ) : null}

      <div className="border-t border-border-subtle" />

      <DeliveryPicker
        parcels={parcels}
        onSelect={onSelectDelivery}
      />
      {DATA_MODE === 'live' &&
      !!selectedAddress &&
      parcels.some((p) => !p.sellerCovered && !p.selected?.live) ? (
        <p className="-mt-4 flex items-center gap-1.5 text-caption text-warning-text">
          <Icon name="alert" size={14} className="shrink-0" />
          Live delivery quotes are unavailable — payment stays off until a quote resolves.{' '}
          <button
            type="button"
            onClick={onRetryQuotes}
            className="pressable font-semibold underline underline-offset-2"
          >
            Retry
          </button>
        </p>
      ) : null}

      <div className="border-t border-border-subtle" />

      <PaymentPicker
        methods={paymentMethods}
        selectedId={useOneze ? null : paymentId}
        onSelect={onSelectPayment}
        onAdd={onAddCard}
        walletOption={walletOption}
        cardTenderReason={
          DATA_MODE === 'live' ? 'Card payments finish in the app for now' : undefined
        }
      />
      {paymentMethodsError ? (
        <p className="-mt-4 flex items-center gap-1.5 text-caption text-warning-text">
          <Icon name="alert" size={14} className="shrink-0" />
          Payment methods couldn’t be loaded.{' '}
          <button
            type="button"
            onClick={refetchInstruments}
            className="pressable font-semibold underline underline-offset-2"
          >
            Try again
          </button>
        </p>
      ) : null}

      <div className="border-t border-border-subtle" />

      <VerificationSection
        enabled={verificationRequested}
        onToggle={onToggleVerification}
        autoIncluded={autoVerified}
        thresholdGbp={AUTHENTICATION_THRESHOLD_GBP}
      />
    </div>
  );
}
