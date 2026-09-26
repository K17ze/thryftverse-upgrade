'use client';

/**
 * ReturnCaseCard — port of mobile ReturnCaseCard + ReturnCaseActions.
 * Flat status card: status line, requested amount, platform step-in,
 * return label/tracking, then the role/state-legal transitions. Every
 * action maps 1:1 to a server transition — nothing here invents a move.
 */

import { useState } from 'react';
import type { ReturnCase, ReturnRemedy } from '@/lib/contracts/domain';
import {
  getReturnCaseStatusLabel,
  getStepInState,
  type ReturnCaseTransition,
} from '@/lib/data/fixtures-commerce';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { formatPrice } from '@/lib/utils/format';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function remedyLabel(remedy: ReturnRemedy | null | undefined): string {
  switch (remedy) {
    case 'full_refund': return 'Full refund';
    case 'partial_refund': return 'Partial refund';
    case 'replacement': return 'Replacement';
    case 'repair': return 'Repair';
    case 'reject': return 'No refund offered';
    default: return 'Remedy pending';
  }
}

interface Props {
  returnCase: ReturnCase;
  isBuyer: boolean;
  isSubmitting?: boolean;
  onStepIn: () => void;
  onAction: (action: ReturnCaseTransition) => void;
}

type FormKind =
  | 'decision_approved'
  | 'decision_rejected'
  | 'shipment'
  | 'inspection'
  | 'remedy'
  | 'appeal'
  | 'remedy_reject';

const REMEDY_OPTIONS: { remedy: ReturnRemedy; label: string }[] = [
  { remedy: 'full_refund', label: 'Full refund' },
  { remedy: 'partial_refund', label: 'Partial refund' },
  { remedy: 'replacement', label: 'Replacement' },
  { remedy: 'repair', label: 'Repair' },
  { remedy: 'reject', label: 'No refund' },
];

export function ReturnCaseCard({ returnCase, isBuyer, isSubmitting = false, onStepIn, onAction }: Props) {
  const [form, setForm] = useState<FormKind | null>(null);
  const [reason, setReason] = useState('');
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [condition, setCondition] = useState('');
  const [notes, setNotes] = useState('');
  const [remedy, setRemedy] = useState<ReturnRemedy>('full_refund');
  const [remedyAmount, setRemedyAmount] = useState('');

  const stepIn = getStepInState(returnCase);
  const status = returnCase.status;
  const isTerminal = status === 'closed' || status === 'refund_confirmed';

  const statusIcon: AppIconName = isTerminal
    ? 'check'
    : status === 'rejected'
      ? 'closeCircle'
      : status === 'appealed'
        ? 'shield'
        : 'clock';
  const statusColor = isTerminal
    ? 'text-success-text'
    : status === 'rejected'
      ? 'text-danger-text'
      : status === 'appealed'
        ? 'text-warning-text'
        : 'text-commerce-trust';

  const openForm = (kind: FormKind, preset = '') => {
    setReason(preset);
    setForm(kind);
  };

  const submit = (action: ReturnCaseTransition) => {
    onAction(action);
    setForm(null);
  };

  const ActionRow = ({
    label, icon, danger, onPress,
  }: { label: string; icon: AppIconName; danger?: boolean; onPress: () => void }) => (
    <button
      type="button"
      onClick={onPress}
      disabled={isSubmitting}
      className={`pressable flex min-h-11 items-center gap-2.5 py-1.5 text-body-emphasis font-medium ${
        danger ? 'text-danger-text' : 'text-commerce-trust'
      } disabled:opacity-50`}
    >
      <Icon name={icon} size={18} />
      {label}
    </button>
  );

  const FormShell = ({
    children, submitLabel, submitDisabled, onSubmit,
  }: {
    children: React.ReactNode;
    submitLabel: string;
    submitDisabled?: boolean;
    onSubmit: () => void;
  }) => (
    <div className="flex flex-col gap-2 pt-2">
      {children}
      <div className="flex items-center justify-end gap-3">
        <Button variant="quiet" size="sm" onClick={() => setForm(null)} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onSubmit}
          disabled={isSubmitting || submitDisabled}
        >
          {isSubmitting ? 'Submitting…' : submitLabel}
        </Button>
      </div>
    </div>
  );

  const inputCls =
    'w-full rounded-md border border-border bg-input px-3 py-2 text-body text-input-text placeholder:text-text-muted focus:border-text-muted';

  return (
    <div className="flex flex-col gap-2.5" id="resolution">
      {/* Status line */}
      <div className="flex items-center gap-3">
        <Icon name={statusIcon} size={20} className={statusColor} />
        <div className="min-w-0 flex-1">
          <p className="text-body-emphasis font-medium text-text-primary">
            {getReturnCaseStatusLabel(returnCase)}
          </p>
          <p className="text-caption text-text-muted">
            {returnCase.requestedAmountGbp != null
              ? `Requested refund: ${formatPrice(returnCase.requestedAmountGbp)}`
              : 'Full refund requested'}
            {' · '}
            {returnCase.reasonLabel}
          </p>
          {status === 'appealed' && returnCase.appealedAt ? (
            <p className="text-caption text-text-muted">
              Escalated {formatDateTime(returnCase.appealedAt)}
            </p>
          ) : null}
        </div>
      </div>

      {/* Platform step-in — buyer only, while the case waits on the seller */}
      {isBuyer && stepIn.state === 'pending' && stepIn.eligibleAt ? (
        <p className="text-caption text-text-secondary">
          If the seller hasn&apos;t responded by {formatDateTime(stepIn.eligibleAt)}, you can ask
          Thryft to step in.
        </p>
      ) : null}
      {isBuyer && stepIn.state === 'eligible' ? (
        <button
          type="button"
          onClick={onStepIn}
          disabled={isSubmitting}
          className="pressable flex min-h-11 items-center gap-2.5 py-1.5 text-body-emphasis font-medium text-commerce-trust disabled:opacity-50"
        >
          <Icon name="shield" size={18} />
          {isSubmitting ? 'Requesting…' : 'Ask Thryft to step in'}
        </button>
      ) : null}
      {isBuyer && stepIn.state === 'escalated' ? (
        <p className="text-caption text-text-secondary">
          Thryft is reviewing this case and will decide the outcome.
        </p>
      ) : null}

      {/* Return label + reverse tracking — only when provided */}
      {returnCase.returnLabelUrl ? (
        <a
          href={returnCase.returnLabelUrl}
          target="_blank"
          rel="noreferrer"
          className="pressable flex min-h-11 items-center gap-2.5 py-1.5 text-body-emphasis font-medium text-commerce-trust"
        >
          <Icon name="pricetag" size={16} />
          <span className="flex-1">Return shipping label</span>
          <Icon name="forward" size={14} className="text-text-muted" />
        </a>
      ) : null}
      {returnCase.returnTrackingNumber ? (
        <p className="tnum clamp-1 text-caption text-text-secondary">
          {returnCase.returnCarrier ? `${returnCase.returnCarrier} · ` : ''}
          {returnCase.returnTrackingNumber}
        </p>
      ) : null}

      {/* Legal transitions — seller side */}
      {!isBuyer ? (
        <>
          {(status === 'requested' || status === 'evidence_review') && (
            <>
              <ActionRow
                label="Approve return"
                icon="check"
                onPress={() => openForm('decision_approved', 'Return approved')}
              />
              <ActionRow
                label="Decline return"
                icon="closeCircle"
                danger
                onPress={() => openForm('decision_rejected')}
              />
            </>
          )}
          {status === 'approved' && (
            <ActionRow label="Add return tracking" icon="box" onPress={() => openForm('shipment')} />
          )}
          {status === 'reverse_shipped' && (
            <ActionRow
              label="Item received"
              icon="bag"
              onPress={() => submit({ type: 'receipt' })}
            />
          )}
          {status === 'received' && (
            <ActionRow label="Record inspection" icon="search" onPress={() => openForm('inspection')} />
          )}
          {status === 'inspected' && (
            <ActionRow label="Propose remedy" icon="payout" onPress={() => openForm('remedy')} />
          )}

          {form === 'decision_approved' || form === 'decision_rejected' ? (
            <FormShell
              submitLabel={form === 'decision_approved' ? 'Approve' : 'Decline'}
              submitDisabled={!reason.trim()}
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
              onSubmit={() =>
                submit({
                  type: 'reverse_shipment',
                  carrier: carrier.trim(),
                  trackingNumber: tracking.trim(),
                })
              }
            >
              <input className={inputCls} placeholder="Carrier (e.g. Royal Mail)" value={carrier} onChange={(e) => setCarrier(e.target.value)} maxLength={100} />
              <input className={`${inputCls} tnum`} placeholder="Tracking number" value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={200} />
            </FormShell>
          ) : null}

          {form === 'inspection' ? (
            <FormShell
              submitLabel="Record inspection"
              submitDisabled={!condition.trim() || !notes.trim()}
              onSubmit={() =>
                submit({ type: 'inspection', condition: condition.trim(), notes: notes.trim() })
              }
            >
              <input className={inputCls} placeholder="Condition (e.g. as described, damaged)" value={condition} onChange={(e) => setCondition(e.target.value)} maxLength={100} />
              <textarea className={inputCls} rows={3} placeholder="Inspection notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
            </FormShell>
          ) : null}

          {form === 'remedy' ? (
            <FormShell
              submitLabel="Propose remedy"
              submitDisabled={
                remedy === 'partial_refund' &&
                (!remedyAmount.trim() || !Number.isFinite(Number(remedyAmount)) || Number(remedyAmount) <= 0)
              }
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
                  placeholder="Refund amount (£)"
                  inputMode="decimal"
                  value={remedyAmount}
                  onChange={(e) => setRemedyAmount(e.target.value)}
                />
              ) : null}
              <textarea className={inputCls} rows={2} placeholder="Notes for the buyer (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
            </FormShell>
          ) : null}
        </>
      ) : (
        /* Buyer side */
        <>
          {status === 'remedy_proposed' ? (
            <>
              <p className="text-body-emphasis font-medium text-text-primary">
                {remedyLabel(returnCase.proposedRemedy)}
                {returnCase.remedyAmountGbp != null ? ` · ${formatPrice(returnCase.remedyAmountGbp)}` : ''}
              </p>
              <ActionRow
                label="Accept remedy"
                icon="check"
                onPress={() => submit({ type: 'remedy_accept' })}
              />
              <ActionRow
                label="Decline — ask Thryft to review"
                icon="shield"
                onPress={() => openForm('remedy_reject')}
              />
            </>
          ) : null}
          {status === 'rejected' ? (
            <ActionRow
              label="Appeal this decision"
              icon="shield"
              onPress={() => openForm('appeal')}
            />
          ) : null}

          {form === 'appeal' || form === 'remedy_reject' ? (
            <FormShell
              submitLabel={form === 'appeal' ? 'Submit appeal' : 'Decline remedy'}
              submitDisabled={!reason.trim()}
              onSubmit={() =>
                submit(
                  form === 'appeal'
                    ? { type: 'appeal', reason: reason.trim() }
                    : { type: 'remedy_reject', reason: reason.trim() },
                )
              }
            >
              <textarea
                className={inputCls}
                rows={3}
                placeholder={form === 'appeal' ? 'Why are you appealing?' : 'Why is this remedy not acceptable?'}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
              />
            </FormShell>
          ) : null}
        </>
      )}
    </div>
  );
}
