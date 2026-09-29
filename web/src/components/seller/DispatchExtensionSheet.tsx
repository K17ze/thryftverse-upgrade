'use client';

/**
 * DispatchExtensionSheet — the seller's dispatch-extension proposal,
 * port of the mobile DispatchExtensionSection picker. Collects extra days
 * (the +Nd chip grammar, 1–7) and an optional note, then POSTs
 * /orders/:id/dispatch-extension. The new deadline is a preview computed
 * from the job's ship-by — the server derives the real proposedShipBy and
 * it only takes effect if the buyer accepts.
 */

import { useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { formatDate } from '@/lib/utils/format';

export interface ExtensionInput {
  days: number;
  note?: string;
}

interface Props {
  open: boolean;
  /** The job's current effective ship-by — the proposal re-bases on it. */
  shipBy?: string | null;
  busy?: boolean;
  onSubmit: (input: ExtensionInput) => void;
  onClose: () => void;
}

const DAY_CHOICES = [1, 2, 3, 4, 5, 6, 7];

export function DispatchExtensionSheet({ open, shipBy, busy = false, onSubmit, onClose }: Props) {
  const [days, setDays] = useState<number | null>(null);
  const [note, setNote] = useState('');

  // Fresh form every open — a proposal never carries stale picks across jobs.
  useEffect(() => {
    if (open) {
      setDays(null);
      setNote('');
    }
  }, [open]);

  // Preview only — the server computes proposedShipBy from the same base;
  // when shipBy is unparseable we show no date rather than a guessed one.
  const proposedLabel =
    days != null && shipBy && !Number.isNaN(Date.parse(shipBy))
      ? formatDate(new Date(Date.parse(shipBy) + days * 86_400_000).toISOString())
      : null;

  return (
    <Sheet open={open} onClose={onClose} title="Need more time to dispatch?" maxWidth={440}>
      <div className="px-5 pb-6">
        <p className="text-body text-text-secondary">
          Ask the buyer for extra days. The new deadline only applies if they
          accept — your original dispatch window stands if they decline.
        </p>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Extra days">
          {DAY_CHOICES.map((d) => (
            <Chip
              key={d}
              selected={days === d}
              disabled={busy}
              onClick={() => setDays(d)}
              aria-label={`Request ${d} more day${d === 1 ? '' : 's'}`}
            >
              +{d}d
            </Chip>
          ))}
        </div>

        {proposedLabel ? (
          <p className="tnum mt-3 text-caption text-text-secondary">
            New deadline if accepted: {proposedLabel}
          </p>
        ) : null}

        <label className="mt-4 block">
          <span className="text-label text-text-muted">Note for the buyer (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={2}
            aria-label="Note for the buyer"
            placeholder="e.g. waiting on a packaging restock"
            className="mt-1.5 w-full resize-none rounded-md border border-border bg-input px-3 py-2 text-body text-input-text placeholder:text-text-muted focus:border-text-muted"
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
            disabled={days == null || busy}
            onClick={() =>
              days != null &&
              onSubmit({ days, note: note.trim() ? note.trim() : undefined })
            }
          >
            {busy
              ? 'Sending…'
              : days != null
                ? `Request ${days} more day${days === 1 ? '' : 's'}`
                : 'Pick extra days'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
