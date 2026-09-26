'use client';

/**
 * EtaBanner — port of mobile EtaBanner. Shown to buyers when the order is
 * in transit with a real ETA. The caller hides it when the estimate is
 * stale so buyers never see a false delivery promise.
 */

import { Icon } from '@/components/ui/Icon';

interface Props {
  /** Human ETA window, e.g. "2–3 days" — used when no date is set. */
  etaWindow: string | null;
  /** "By …" label derived from the server ETA, e.g. "27 September". */
  estimatedDeliveryLabel: string | null;
  serviceName: string | null;
}

export function EtaBanner({ etaWindow, estimatedDeliveryLabel, serviceName }: Props) {
  const value = estimatedDeliveryLabel ? `By ${estimatedDeliveryLabel}` : etaWindow;
  if (!value) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-commerce-trust-border bg-commerce-trust-subtle px-4 py-3">
      <Icon name="box" size={16} className="mt-0.5 shrink-0 text-commerce-trust" />
      <div className="min-w-0 flex-1">
        <p className="text-label font-medium uppercase tracking-wide text-text-muted">
          Estimated delivery
        </p>
        <p className="mt-0.5 text-body font-medium text-text-primary">{value}</p>
        {serviceName ? (
          <p className="mt-0.5 text-caption text-text-secondary">{serviceName}</p>
        ) : null}
      </div>
    </div>
  );
}
