'use client';

/**
 * DispatchSheet — the manual-dispatch form the mobile seller-fulfilment
 * flow collects before POST /orders/:id/ship: a real tracking number and
 * the carrier that issued it. The backend rejects a dispatch with no
 * tracking reference (TRACKING_REQUIRED), so the sheet is the collection
 * point — a bare confirm could only ever fire a doomed request.
 */

import { useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';

export interface DispatchInput {
  trackingNumber: string;
  carrier: string;
}

interface Props {
  open: boolean;
  /** Prefill — the purchased service's carrier label when the order's
   *  fulfilment snapshot carries one. */
  defaultCarrier?: string | null;
  busy?: boolean;
  onSubmit: (input: DispatchInput) => void;
  onClose: () => void;
}

export function DispatchSheet({ open, defaultCarrier, busy = false, onSubmit, onClose }: Props) {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('');

  // Re-seed the carrier each time the sheet opens for a fresh order —
  // the tracking reference is never carried across dispatches.
  useEffect(() => {
    if (open) {
      setTrackingNumber('');
      setCarrier(defaultCarrier ?? '');
    }
  }, [open, defaultCarrier]);

  const canSubmit = trackingNumber.trim().length > 0 && carrier.trim().length > 0;

  return (
    <Sheet open={open} onClose={onClose} title="Mark as dispatched" maxWidth={440}>
      <div className="px-5 pb-6">
        <p className="text-body text-text-secondary">
          Enter the tracking number from your postage receipt — the buyer
          follows this reference. Funds release once delivery is confirmed.
        </p>

        <label className="mt-4 block">
          <span className="text-label text-text-muted">Tracking number</span>
          <input
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            maxLength={128}
            autoComplete="off"
            aria-label="Tracking number"
            placeholder="e.g. AB123456789GB"
            className="mt-1.5 w-full rounded-md border border-border bg-input px-3 py-2 text-body text-input-text placeholder:text-text-muted focus:border-text-muted"
          />
        </label>
        <label className="mt-3 block">
          <span className="text-label text-text-muted">Carrier</span>
          <input
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            maxLength={64}
            autoComplete="off"
            aria-label="Carrier"
            placeholder="e.g. Royal Mail"
            className="mt-1.5 w-full rounded-md border border-border bg-input px-3 py-2 text-body text-input-text placeholder:text-text-muted focus:border-text-muted"
          />
        </label>

        <div className="mt-5 flex gap-3">
          <Button variant="outline" size="md" fullWidth onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            fullWidth
            disabled={!canSubmit || busy}
            onClick={() =>
              onSubmit({
                trackingNumber: trackingNumber.trim(),
                carrier: carrier.trim(),
              })
            }
          >
            {busy ? 'Working…' : 'Mark as dispatched'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
