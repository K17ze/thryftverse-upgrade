'use client';

/**
 * CarrierFailureBanner — the carrier reported a failed delivery or is
 * returning the parcel. Money is still in flight, so the banner carries a
 * danger tone and a pointer to the resolution path, mirroring the mobile
 * handling of 'delivery failed' / 'returned'.
 */

import { Icon } from '@/components/ui/Icon';
import { normaliseOrderStatus } from './orderCapabilities';

interface Props {
  status: string;
  isBuyer: boolean;
}

export function CarrierFailureBanner({ status, isBuyer }: Props) {
  const key = normaliseOrderStatus(status);

  const title = key === 'returned' ? 'Parcel returned' : 'Delivery failed';
  const body =
    key === 'returned'
      ? isBuyer
        ? 'The carrier returned your parcel to the seller. Report it if you still want the item or a refund.'
        : 'The parcel is on its way back to you.'
      : isBuyer
        ? 'The carrier could not deliver your parcel. Your money is still held — report the issue and we will help.'
        : 'The carrier reported a failed delivery. The tracking trail below is the evidence the dispute needs.';

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-danger-border bg-danger-subtle px-4 py-3">
      <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-danger-text" />
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-text-primary">{title}</p>
        <p className="mt-0.5 text-caption text-text-secondary">{body}</p>
      </div>
    </div>
  );
}
