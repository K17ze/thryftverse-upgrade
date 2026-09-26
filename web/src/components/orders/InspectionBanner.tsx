'use client';

/**
 * InspectionBanner — port of mobile InspectionBanner. Shown to buyers when
 * status = 'delivered' and the inspection window is open. Two honest paths:
 * "Everything is OK" (releases escrow — high consequence, confirmed via
 * sheet upstream) or "Report an issue". The deadline is server-derived —
 * the client never invents a window.
 */

import { useMemo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';

interface Props {
  inspectionDeadlineAt: string | null;
  onConfirmReceipt: () => void;
  onReportIssue: () => void;
}

export function InspectionBanner({ inspectionDeadlineAt, onConfirmReceipt, onReportIssue }: Props) {
  const daysLeft = useMemo(() => {
    if (!inspectionDeadlineAt) return null;
    const deadline = new Date(inspectionDeadlineAt).getTime();
    if (Number.isNaN(deadline)) return null;
    return Math.ceil((deadline - Date.now()) / 86_400_000);
  }, [inspectionDeadlineAt]);

  const expired = daysLeft != null && daysLeft <= 0;

  const sub = expired
    ? 'The confirmation window has ended.'
    : daysLeft == null
      ? 'Confirm everything is as described.'
      : daysLeft === 0
        ? 'Last day to confirm everything is OK.'
        : daysLeft === 1
          ? '1 day left to confirm everything is OK.'
          : `${daysLeft} days left to confirm everything is OK.`;

  return (
    <div className="rounded-lg border border-brand-border bg-brand-subtle p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-subtle">
          <Icon name="check" size={16} className="text-text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body-emphasis font-semibold text-text-primary">Check your item</p>
          <p className="mt-0.5 text-caption text-text-secondary">{sub}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <Button variant="primary" size="md" fullWidth icon="check" onClick={onConfirmReceipt}>
          Everything is OK
        </Button>
        <Button variant="outline" size="md" fullWidth icon="alert" onClick={onReportIssue}>
          Report an issue
        </Button>
      </div>

      <p className="mt-3 text-caption text-text-muted">
        Confirming releases your payment to the seller. Once released, this cannot be undone.
      </p>
    </div>
  );
}
