'use client';

/**
 * OrderBannersRail — renders contextual top alert banners for the order:
 * dispatch countdown, listing reservation hold, SLA breach notice, and carrier failures.
 */

import type { CommerceOrder } from '@/lib/contracts/domain';
import { DispatchCountdown } from './DispatchCountdown';
import { ReservationCountdown } from './ReservationCountdown';
import { CarrierFailureBanner } from './CarrierFailureBanner';
import { isCarrierFailureStatus } from './orderCapabilities';
import { Icon } from '@/components/ui/Icon';

interface OrderBannersRailProps {
  order: CommerceOrder;
  isBuyer: boolean;
  role: 'buyer' | 'seller';
  shipByDate?: string | null;
  statusKey: string;
}

export function OrderBannersRail({
  order,
  isBuyer,
  role,
  shipByDate,
  statusKey,
}: OrderBannersRailProps) {
  const showCountdown = role === 'seller' && statusKey === 'paid';
  const showReservationHold = statusKey === 'created' && !!order.checkoutExpiresAt;

  return (
    <>
      {showCountdown ? (
        <div className="mt-4">
          <DispatchCountdown shipByDate={shipByDate ?? null} shipped={false} />
        </div>
      ) : null}

      {showReservationHold ? (
        <div className="mt-4">
          <ReservationCountdown expiresAt={order.checkoutExpiresAt} />
        </div>
      ) : null}

      {!isBuyer && order.slaBreach ? (
        <p className="mt-4 flex items-center gap-1.5 rounded-lg border border-danger-border bg-danger-subtle px-4 py-2.5 text-caption font-medium text-danger-text">
          <Icon name="alert" size={14} />
          Dispatch deadline missed — recorded on this order.
        </p>
      ) : null}

      {isCarrierFailureStatus(order.status) ? (
        <div className="mt-4">
          <CarrierFailureBanner status={order.status} isBuyer={isBuyer} />
        </div>
      ) : null}
    </>
  );
}
