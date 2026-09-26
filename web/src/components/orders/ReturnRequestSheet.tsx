'use client';

/**
 * ReturnRequestSheet — structured return-request form. Reason categories
 * mirror the mobile refund-request surface; amount validates against the
 * paid total (server enforces the same bound). Submit creates a ReturnCase.
 */

import { useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { RETURN_REASONS } from '@/lib/data/fixtures-commerce';
import { formatPrice } from '@/lib/utils/format';

interface Props {
  open: boolean;
  orderTotalGbp: number;
  itemTitle?: string;
  onSubmit: (input: {
    reasonId: string;
    reasonLabel: string;
    note: string;
    amountGbp: number | null;
  }) => void;
  onClose: () => void;
}

function parseAmount(raw: string): number | null {
  const normalised = raw.trim().replace(/[£$\s,]/g, '');
  if (!normalised) return null;
  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

export function ReturnRequestSheet({ open, orderTotalGbp, itemTitle, onSubmit, onClose }: Props) {
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [amountText, setAmountText] = useState('');
  const [partial, setPartial] = useState(false);

  const parsed = useMemo(() => parseAmount(amountText), [amountText]);
  const amountError =
    partial && amountText.trim()
      ? parsed == null || parsed <= 0
        ? 'Enter a valid amount'
        : parsed > orderTotalGbp
          ? `Can't exceed the order total (${formatPrice(orderTotalGbp)})`
          : null
      : null;

  const canSubmit = reasonId != null && (!partial || (parsed != null && !amountError));

  const reset = () => {
    setReasonId(null);
    setNote('');
    setAmountText('');
    setPartial(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = () => {
    if (reasonId == null) return;
    const reason = RETURN_REASONS.find((r) => r.id === reasonId);
    onSubmit({
      reasonId,
      reasonLabel: reason?.label ?? 'Return requested',
      note: note.trim(),
      amountGbp: partial ? parsed : null,
    });
    reset();
  };

  return (
    <Sheet open={open} onClose={handleClose} title="Request a return" maxWidth={480}>
      <div className="px-5 pb-6">
        {itemTitle ? (
          <p className="mb-3 text-body text-text-secondary">
            {itemTitle} — tell the seller what happened.
          </p>
        ) : null}

        <ul className="flex flex-col">
          {RETURN_REASONS.map((reason) => {
            const selected = reasonId === reason.id;
            return (
              <li key={reason.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setReasonId(reason.id)}
                  className="pressable flex min-h-11 w-full items-center gap-3 border-b border-border-subtle py-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-emphasis font-medium text-text-primary">
                      {reason.label}
                    </span>
                    <span className="mt-0.5 block text-caption text-text-muted">
                      {reason.description}
                    </span>
                  </span>
                  <Icon
                    name={selected ? 'check' : 'forward'}
                    size={16}
                    className={selected ? 'text-text-primary' : 'text-text-muted'}
                  />
                </button>
              </li>
            );
          })}
        </ul>

        {/* Refund scope — full by default, partial with a validated amount */}
        <div className="mt-4 flex gap-2">
          {[
            { key: 'full', label: 'Full refund' },
            { key: 'partial', label: 'Partial refund' },
          ].map((opt) => {
            const selected = (opt.key === 'partial') === partial;
            return (
              <button
                key={opt.key}
                type="button"
                aria-pressed={selected}
                onClick={() => setPartial(opt.key === 'partial')}
                className={`pressable rounded-full border px-3.5 py-1.5 text-caption font-medium ${
                  selected
                    ? 'border-brand bg-brand text-text-inverse'
                    : 'border-border text-text-secondary hover:border-text-muted'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {partial ? (
          <>
            <input
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              inputMode="decimal"
              placeholder={`Refund amount (max ${formatPrice(orderTotalGbp)})`}
              className="tnum mt-3 w-full rounded-md border border-border bg-input px-3 py-2 text-body text-input-text placeholder:text-text-muted focus:border-text-muted"
            />
            {amountError ? (
              <p className="mt-1 text-caption text-danger-text">{amountError}</p>
            ) : null}
          </>
        ) : null}

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Tell the seller what happened (optional)"
          className="mt-3 w-full rounded-md border border-border bg-input px-3 py-2 text-body text-input-text placeholder:text-text-muted focus:border-text-muted"
        />

        <Button
          variant="primary"
          size="md"
          fullWidth
          className="mt-4"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          Submit return request
        </Button>
        <p className="mt-3 text-caption text-text-muted">
          The seller responds first. If they don&apos;t, you can ask Thryft to step in.
        </p>
      </div>
    </Sheet>
  );
}
