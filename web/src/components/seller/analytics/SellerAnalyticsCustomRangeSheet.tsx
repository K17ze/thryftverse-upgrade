import React from 'react';
import type { SellerAnalyticsRange } from '@/lib/hooks/seller-queries';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { DATA_MODE } from '@/lib/api/client';

export function SellerAnalyticsCustomRangeSheet({
  open,
  onClose,
  customDraft,
  onChangeDraft,
  error,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  customDraft: SellerAnalyticsRange;
  onChangeDraft: (updater: (prev: SellerAnalyticsRange) => SellerAnalyticsRange) => void;
  error: string | null;
  onApply: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Custom range"
      maxWidth={420}
    >
      <div className="px-5 pb-6 pt-1">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-caption font-medium text-text-secondary">
              From
            </span>
            <input
              type="date"
              value={customDraft.from}
              max={customDraft.to || undefined}
              onChange={(e) => {
                onChangeDraft((d) => ({ ...d, from: e.target.value }));
              }}
              className="tnum h-11 w-full rounded-md border border-border bg-surface px-3 text-body text-text-primary focus:border-text-muted focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-caption font-medium text-text-secondary">
              To
            </span>
            <input
              type="date"
              value={customDraft.to}
              min={customDraft.from || undefined}
              onChange={(e) => {
                onChangeDraft((d) => ({ ...d, to: e.target.value }));
              }}
              className="tnum h-11 w-full rounded-md border border-border bg-surface px-3 text-body text-text-primary focus:border-text-muted focus:outline-none"
            />
          </label>
        </div>
        {error ? (
          <p className="mt-3 text-caption font-medium text-danger-text" role="alert">
            {error}
          </p>
        ) : null}
        <p className="mt-3 text-meta text-text-muted">
          {DATA_MODE === 'live'
            ? 'Ranges are read from the 90-day analytics window — earlier dates clamp.'
            : 'Fixture history covers the last 90 days — earlier dates clamp.'}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="quiet" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={onApply}>
            Apply range
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
