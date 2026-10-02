'use client';

/**
 * CheckoutAside — the sticky summary and final payment commitment rail:
 * pricing totals, breakdown toggle, escrow trust badge, pay action,
 * error recovery, SLA dispatch certainty, and statutory disclosures.
 */

import Link from 'next/link';
import type { Listing } from '@/lib/contracts/domain';
import type { CheckoutTotals } from '@/lib/commerce/postage';
import type { DeliverySelection } from './checkoutViewModel';
import { CHECKOUT_STAGE_LABELS, type CheckoutPayStage } from './CheckoutProgress';
import { OrderSummary } from './OrderSummary';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { DATA_MODE } from '@/lib/api/client';
import { formatIze } from '@/components/wallet/convertViewModel';
import { formatPrice } from '@/lib/utils/format';

interface CheckoutAsideProps {
  items: Listing[];
  totals: CheckoutTotals;
  bundleDiscount: number;
  effectiveDelivery: DeliverySelection;
  verification: boolean;
  autoVerified: boolean;
  canPay: boolean;
  paying: boolean;
  payStage: CheckoutPayStage | null;
  useOneze: boolean;
  onezeRequired: number;
  payableTotal: number;
  payError: string | null;
  dispatchDays: number;
  onOpenBreakdown: () => void;
  onPay: () => void;
}

export function CheckoutAside({
  items,
  totals,
  bundleDiscount,
  effectiveDelivery,
  verification,
  autoVerified,
  canPay,
  paying,
  payStage,
  useOneze,
  onezeRequired,
  payableTotal,
  payError,
  dispatchDays,
  onOpenBreakdown,
  onPay,
}: CheckoutAsideProps) {
  return (
    <aside className="lg:sticky lg:top-20 lg:self-start">
      <OrderSummary
        items={items}
        totals={totals}
        bundleDiscount={bundleDiscount}
        delivery={effectiveDelivery}
        verificationLabel={verification ? (autoVerified ? 'Included' : 'Free') : undefined}
        bundleCharged={DATA_MODE !== 'live'}
      />

      {/* Itemised ledger modal trigger */}
      <button
        type="button"
        onClick={onOpenBreakdown}
        className="pressable mt-3 flex w-full items-center justify-between rounded-md py-2 text-caption font-semibold text-text-secondary hover:text-text-primary"
        aria-label="View the full itemised breakdown"
      >
        <span className="flex items-center gap-1.5">
          <Icon name="receipt" size={15} />
          Full breakdown
        </span>
        <Icon name="forward" size={14} className="text-text-muted" />
      </button>

      {/* Escrow guarantee — quiet meta row, not a boxed pill */}
      <p className="mt-3.5 flex items-start gap-2 text-meta text-text-secondary">
        <Icon name="shieldCheck" size={15} className="mt-px shrink-0 text-commerce-trust" />
        <span>
          <span className="font-semibold text-text-primary">ThryftVerse Escrow</span> — payment
          is released to the seller only after delivery is confirmed.
        </span>
      </p>

      {/* Primary Pay Action */}
      <Button
        variant="primary"
        size="lg"
        fullWidth
        icon="lock"
        className="mt-3"
        disabled={!canPay}
        onClick={onPay}
      >
        {paying ? (
          (payStage ? CHECKOUT_STAGE_LABELS[payStage] : 'Processing…')
        ) : useOneze ? (
          <>Pay <span className="tnum">{formatIze(onezeRequired)} 1ZE</span></>
        ) : (
          <>Pay <span className="tnum">{formatPrice(payableTotal)}</span></>
        )}
      </Button>

      {/* Pay Error Recovery Alert */}
      {payError ? (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg bg-danger-subtle px-3.5 py-3"
        >
          <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-danger-text" />
          <div className="min-w-0 flex-1">
            <p className="text-caption font-medium text-danger-text">{payError}</p>
            <button
              type="button"
              onClick={onPay}
              disabled={!canPay}
              className="pressable mt-1.5 text-caption font-semibold text-danger-text underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        </div>
      ) : null}

      {/* Buyer Protection Trust Disclosure */}
      <p className="mt-4 flex items-start gap-1.5 text-caption text-text-secondary">
        <Icon name="shieldCheck" size={15} className="mt-px shrink-0 text-commerce-trust" />
        <span>
          Covered by Buyer Protection — your money is held until the item arrives as described,
          then released to the seller. Full refund if it never arrives.
        </span>
      </p>

      {/* Returns Policy Window */}
      <p className="mt-2 flex items-start gap-1.5 text-caption text-text-secondary">
        <Icon name="refresh" size={15} className="mt-px shrink-0 text-text-secondary" />
        <span>
          Buyer protection covers returns within{' '}
          <span className="tnum font-semibold text-text-primary">14</span> days of delivery.
        </span>
      </p>

      {/* Dispatch SLA Guarantee */}
      <p className="mt-2 flex items-start gap-1.5 text-caption text-text-secondary">
        <Icon name="clock" size={15} className="mt-px shrink-0 text-text-secondary" />
        <span>
          {items.length > 1 ? 'Sellers dispatch' : 'The seller dispatches'} within{' '}
          <span className="tnum font-semibold text-text-primary">{dispatchDays}</span>{' '}
          {dispatchDays === 1 ? 'day' : 'days'} of payment — tracking lands on your order.
        </span>
      </p>

      {/* Legal sale terms */}
      <p className="mt-2 text-caption text-text-muted">
        By paying, you agree to our{' '}
        <Link href="/terms" className="underline underline-offset-2 hover:text-text-secondary">
          Terms of Sale
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-text-secondary">
          Privacy Policy
        </Link>
        .
      </p>
    </aside>
  );
}
