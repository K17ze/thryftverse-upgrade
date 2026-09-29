'use client';

/**
 * DispatchSheet — the manual-dispatch form the mobile seller-fulfilment
 * flow collects before POST /orders/:id/ship: a real tracking number and
 * the carrier that issued it. The backend rejects a dispatch with no
 * tracking reference (TRACKING_REQUIRED), so the sheet is the collection
 * point — a bare confirm could only ever fire a doomed request.
 *
 * The quiet secondary path mirrors mobile's recovery affordance: a seller
 * who already dropped the parcel off but whose scan hasn't landed can
 * assert the handoff (POST /orders/:id/fulfilment/handoff-assertion)
 * instead of dispatching — evidence, never a status change.
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
  /** Recovery path — the seller asserts the parcel is already with the
   *  carrier. Carries whatever tracking/carrier the seller typed (may be
   *  empty → undefined). */
  onAssertHandoff?: (input: { trackingNumber?: string; carrier?: string }) => void;
  onClose: () => void;
}

export function DispatchSheet({ open, defaultCarrier, busy = false, onSubmit, onAssertHandoff, onClose }: Props) {
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

        {/* Handoff assertion — a seller claim, not carrier evidence.
            Records the drop-off so the buyer sees it while the first
            scan is owed; never flips the order to dispatched. */}
        {onAssertHandoff ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onAssertHandoff({
                trackingNumber: trackingNumber.trim() || undefined,
                carrier: carrier.trim() || undefined,
              })
            }
            className="pressable mt-3 w-full py-1 text-center text-caption font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            Already dropped it off? Record the handoff
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}
