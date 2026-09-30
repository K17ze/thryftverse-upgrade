'use client';

/**
 * FxRateTimestamp — observed-at timestamp + server-TTL countdown indicator
 * + manual refresh action when the quote expires.
 */

import { Icon } from '@/components/ui/Icon';

interface FxRateTimestampProps {
  label: string;
  observedLabel: string;
  expiryLabel: string;
  isExpired: boolean;
  onRefresh: () => void;
}

export function FxRateTimestamp({
  label,
  observedLabel,
  expiryLabel,
  isExpired,
  onRefresh,
}: FxRateTimestampProps) {
  if (!observedLabel) return null;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-meta text-text-muted">
      <Icon name="clock" size={12} className="shrink-0" />
      <span>
        {label} {observedLabel}
      </span>
      {isExpired || expiryLabel !== '' ? (
        <span className={isExpired ? 'text-danger-text' : undefined}>
          {isExpired ? '· Expired' : `· Valid for ${expiryLabel}`}
        </span>
      ) : null}
      {isExpired ? (
        <button
          type="button"
          onClick={onRefresh}
          className="pressable font-semibold text-brand hover:text-text-primary"
        >
          Refresh
        </button>
      ) : null}
    </p>
  );
}
