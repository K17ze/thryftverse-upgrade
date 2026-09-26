'use client';

/**
 * EscrowBanner — port of mobile EscrowBanner. Shown to buyers while funds
 * are held (paid → in transit, not yet delivered/confirmed). The release
 * countdown is server-derived via estimatedReleaseAt — the client never
 * invents a fallback window.
 */

import { useMemo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { normaliseOrderStatus } from './orderCapabilities';

interface Props {
  /** Normalised workflow status. */
  status: string;
  /** Server-provided escrow release estimate (ISO), if any. */
  estimatedReleaseAt?: string | null;
}

export function EscrowBanner({ status, estimatedReleaseAt }: Props) {
  const key = normaliseOrderStatus(status);

  const releaseLine = useMemo(() => {
    if (!estimatedReleaseAt) return null;
    const at = new Date(estimatedReleaseAt).getTime();
    if (Number.isNaN(at) || Date.now() >= at) return null;
    const days = Math.ceil((at - Date.now()) / 86_400_000);
    return `Auto-releases to the seller in ${days} day${days === 1 ? '' : 's'} if not confirmed`;
  }, [estimatedReleaseAt]);

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-success-border bg-success-subtle px-4 py-3">
      <Icon name="lock" size={16} className="mt-0.5 shrink-0 text-success-text" />
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-text-primary">Money held safely</p>
        <p className="mt-0.5 text-caption text-text-secondary">
          {key === 'paid'
            ? 'Payment confirmed. The money is held safely until you confirm receipt.'
            : 'Your payment is held safely until you confirm receipt.'}
        </p>
        {releaseLine ? (
          <p className="tnum mt-1 text-caption text-text-muted">{releaseLine}</p>
        ) : null}
      </div>
    </div>
  );
}
