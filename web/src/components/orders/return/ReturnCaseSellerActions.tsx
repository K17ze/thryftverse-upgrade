'use client';

import { useState } from 'react';
import type { ReturnCase, ReturnRemedy } from '@/lib/contracts/domain';
import type { ReturnCaseTransition } from '@/lib/data/fixtures-commerce';
import {
  ActionRow,
  FormShell,
  inputCls,
  REMEDY_OPTIONS,
  type FormKind,
} from './ReturnCasePrimitives';

interface Props {
  returnCase: ReturnCase;
  isSubmitting?: boolean;
  onAction: (action: ReturnCaseTransition) => void;
}

export function ReturnCaseSellerActions({
  returnCase,
  isSubmitting = false,
  onAction,
}: Props) {
  const [form, setForm] = useState<FormKind | null>(null);
  const [reason, setReason] = useState('');
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [condition, setCondition] = useState('');
  const [notes, setNotes] = useState('');
  const [remedy, setRemedy] = useState<ReturnRemedy>('full_refund');
  const [remedyAmount, setRemedyAmount] = useState('');

  const status = returnCase.status;

  const openForm = (kind: FormKind, preset = '') => {
    setReason(preset);
    setForm(kind);
  };

  const submit = (action: ReturnCaseTransition) => {
    onAction(action);
    setForm(null);
  };

  return (
    <>
      {(status === 'requested' || status === 'evidence_review') && (
        <>
          <ActionRow
            label="Approve return"
            icon="check"
            disabled={isSubmitting}
            onPress={() => openForm('decision_approved', 'Return approved')}
          />
          <ActionRow
            label="Decline return"
            icon="closeCircle"
            danger
            disabled={isSubmitting}
            onPress={() => openForm('decision_rejected')}
          />
        </>
      )}
      {status === 'approved' && (
        <ActionRow
          label="Add return tracking"
          icon="box"
          disabled={isSubmitting}
          onPress={() => openForm('shipment')}
        />
      )}
      {status === 'reverse_shipped' && (
        <ActionRow
          label="Item received"
          icon="bag"
          disabled={isSubmitting}
          onPress={() => submit({ type: 'receipt' })}
        />
      )}
      {status === 'received' && (
        <ActionRow
          label="Record inspection"
          icon="search"
          disabled={isSubmitting}
          onPress={() => openForm('inspection')}
        />
      )}
      {status === 'inspected' && (
        <ActionRow
          label="Propose remedy"
          icon="payout"
          disabled={isSubmitting}
          onPress={() => openForm('remedy')}
        />
      )}

      {form === 'decision_approved' || form === 'decision_rejected' ? (
        <FormShell
          submitLabel={form === 'decision_approved' ? 'Approve' : 'Decline'}
          submitDisabled={!reason.trim()}
          isSubmitting={isSubmitting}
          onCancel={() => setForm(null)}
          onSubmit={() =>
            submit({
              type: 'decision',
              decision: form === 'decision_approved' ? 'approved' : 'rejected',
              reason: reason.trim(),
            })
          }
        >
          <textarea
            className={inputCls}
            rows={3}
            aria-label={form === 'decision_approved' ? 'Note for the buyer' : 'Reason for declining'}
            placeholder={form === 'decision_approved' ? 'Note for the buyer' : 'Reason for declining'}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
          />
        </FormShell>
      ) : null}

      {form === 'shipment' ? (
        <FormShell
          submitLabel="Save tracking"
          submitDisabled={!carrier.trim() || !tracking.trim()}
          isSubmitting={isSubmitting}
          onCancel={() => setForm(null)}
          onSubmit={() =>
            submit({
              type: 'reverse_shipment',
              carrier: carrier.trim(),
              trackingNumber: tracking.trim(),
            })
          }
        >
          <input
            className={inputCls}
            aria-label="Return carrier"
            placeholder="Carrier (e.g. Royal Mail)"
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            maxLength={100}
          />
          <input
            className={`${inputCls} tnum`}
            aria-label="Return tracking number"
            placeholder="Tracking number"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            maxLength={200}
          />
        </FormShell>
      ) : null}

      {form === 'inspection' ? (
        <FormShell
          submitLabel="Record inspection"
          submitDisabled={!condition.trim() || !notes.trim()}
          isSubmitting={isSubmitting}
          onCancel={() => setForm(null)}
          onSubmit={() =>
            submit({ type: 'inspection', condition: condition.trim(), notes: notes.trim() })
          }
        >
          <input
            className={inputCls}
            aria-label="Returned item condition"
            placeholder="Condition (e.g. as described, damaged)"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            maxLength={100}
          />
          <textarea
            className={inputCls}
            rows={3}
            aria-label="Inspection notes"
            placeholder="Inspection notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
          />
        </FormShell>
      ) : null}

      {form === 'remedy' ? (
        <FormShell
          submitLabel="Propose remedy"
          submitDisabled={
            remedy === 'partial_refund' &&
            (!remedyAmount.trim() || !Number.isFinite(Number(remedyAmount)) || Number(remedyAmount) <= 0)
          }
          isSubmitting={isSubmitting}
          onCancel={() => setForm(null)}
          onSubmit={() =>
            submit({
              type: 'remedy',
              remedy,
              amountGbp: remedy === 'partial_refund' ? Number(remedyAmount) : undefined,
              notes: notes.trim() || undefined,
            })
          }
        >
          <div className="flex flex-wrap gap-2">
            {REMEDY_OPTIONS.map((opt) => {
              const selected = remedy === opt.remedy;
              return (
                <button
                  key={opt.remedy}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setRemedy(opt.remedy)}
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
          {remedy === 'partial_refund' ? (
            <input
              className={`${inputCls} tnum`}
              aria-label="Refund amount in pounds"
              placeholder="Refund amount (£)"
              inputMode="decimal"
              value={remedyAmount}
              onChange={(e) => setRemedyAmount(e.target.value)}
            />
          ) : null}
          <textarea
            className={inputCls}
            rows={2}
            aria-label="Notes for the buyer"
            placeholder="Notes for the buyer (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
          />
        </FormShell>
      ) : null}
    </>
  );
}
