'use client';

/**
 * ReturnRequestSheet — structured return-request form. Reason categories
 * mirror the mobile refund-request surface; amount validates against the
 * paid total through the shared refundAmount helpers (the server enforces
 * the same bound). Reason-specific evidence guidance + photo attach match
 * the mobile OrderSupportScreen evidence model. Submit creates a
 * ReturnCase with the attached evidence URLs.
 */

import { useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { RETURN_REASONS } from '@/lib/data/fixtures-commerce';
import { formatPrice } from '@/lib/utils/format';
import {
  EvidencePhotoField,
  type EvidencePhoto,
} from './EvidencePhotoField';
import {
  refundAmountErrorMessage,
  validateRequestedRefundAmount,
} from './refundAmount';

/**
 * Reason → evidence guidance. Photos matter for every fault-based return;
 * 'Other reason' keeps the field optional rather than demanding evidence
 * for a change-of-mind-adjacent request.
 */
const RETURN_EVIDENCE: Record<string, { needsPhotos: boolean; hint: string }> = {
  not_as_described: { needsPhotos: true, hint: 'Attach photos showing how the item differs from the listing.' },
  damaged: { needsPhotos: true, hint: 'Attach photos of the damage and the original packaging.' },
  wrong_item: { needsPhotos: true, hint: 'Attach a photo of the item you received.' },
  authenticity: { needsPhotos: true, hint: 'Attach photos of labels, stitching or serial marks.' },
  missing_contents: { needsPhotos: true, hint: 'Attach photos of the parcel and what arrived.' },
  changed_mind: { needsPhotos: false, hint: 'Photos are optional for this reason.' },
};

interface Props {
  open: boolean;
  orderTotalGbp: number;
  itemTitle?: string;
  onSubmit: (input: {
    reasonId: string;
    reasonLabel: string;
    note: string;
    amountGbp: number | null;
    evidenceMediaUrls: string[];
  }) => void;
  onClose: () => void;
}

export function ReturnRequestSheet({ open, orderTotalGbp, itemTitle, onSubmit, onClose }: Props) {
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [amountText, setAmountText] = useState('');
  const [partial, setPartial] = useState(false);
  const [evidence, setEvidence] = useState<EvidencePhoto[]>([]);
  const [touched, setTouched] = useState(false);

  const amountResult = useMemo(
    () => validateRequestedRefundAmount(amountText, orderTotalGbp),
    [amountText, orderTotalGbp],
  );
  const amountError =
    partial && (touched || amountText.trim())
      ? amountResult.error
          ? refundAmountErrorMessage(amountResult.error, orderTotalGbp, formatPrice)
          : null
      : null;

  const uploading = evidence.some((e) => e.state === 'uploading');
  const canSubmit =
    reasonId != null &&
    !uploading &&
    (!partial || amountResult.error == null);

  const evidenceConfig = reasonId ? RETURN_EVIDENCE[reasonId] : null;
  const showEvidence = !!reasonId;

  const reset = () => {
    for (const item of evidence) {
      if (item.uri.startsWith('blob:')) URL.revokeObjectURL(item.uri);
    }
    setReasonId(null);
    setNote('');
    setAmountText('');
    setPartial(false);
    setEvidence([]);
    setTouched(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = () => {
    if (reasonId == null || !canSubmit) return;
    const reason = RETURN_REASONS.find((r) => r.id === reasonId);
    onSubmit({
      reasonId,
      reasonLabel: reason?.label ?? 'Return requested',
      note: note.trim(),
      amountGbp: partial ? amountResult.amountGbp : null,
      evidenceMediaUrls: evidence
        .filter((e) => e.state === 'attached')
        .map((e) => e.uri),
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

        {/* Refund scope — full by default, partial with a validated amount.
            Switching to partial prefills the paid total once (the mobile
            return topic does the same) without clobbering typed edits. */}
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
                onClick={() => {
                  const next = opt.key === 'partial';
                  setPartial(next);
                  if (next && !amountText.trim()) {
                    setAmountText(orderTotalGbp.toFixed(2));
                  }
                }}
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
              onBlur={() => setTouched(true)}
              inputMode="decimal"
              aria-label={`Refund amount in pounds, maximum ${formatPrice(orderTotalGbp)}`}
              aria-invalid={amountError != null}
              placeholder={`Refund amount (max ${formatPrice(orderTotalGbp)})`}
              className="tnum mt-3 w-full rounded-md border border-border bg-input px-3 py-2 text-body text-input-text placeholder:text-text-muted focus:border-text-muted"
            />
            {amountError ? (
              <p role="alert" className="tnum mt-1 text-caption text-danger-text">{amountError}</p>
            ) : null}
          </>
        ) : null}

        {/* Reason-specific evidence — only rendered once a reason is
            picked, per the report's no-photo-theatre rule. */}
        {showEvidence && evidenceConfig ? (
          <EvidencePhotoField
            label={evidenceConfig.needsPhotos ? 'Evidence' : 'Evidence (optional)'}
            hint={evidenceConfig.hint}
            items={evidence}
            onChange={setEvidence}
          />
        ) : null}

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={1000}
          aria-label="Return details for the seller"
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
          {uploading ? 'Uploading…' : 'Submit return request'}
        </Button>
        <p className="mt-3 text-caption text-text-muted">
          The seller responds first. If they don&apos;t, you can ask Thryft to step in.
        </p>
      </div>
    </Sheet>
  );
}
