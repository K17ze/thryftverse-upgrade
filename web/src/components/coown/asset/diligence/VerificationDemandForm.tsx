'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import type { CoOwnVerificationDemandType } from '@/lib/api/services/coown';
import { useCoOwnTrustActions } from '@/lib/hooks/coown-queries';
import { FIELD_CLASS, LABEL_CLASS } from './diligenceTypes';

const DEMAND_TYPES: { value: CoOwnVerificationDemandType; label: string }[] = [
  { value: 'authenticity', label: 'Authenticity' },
  { value: 'possession', label: 'Possession' },
  { value: 'condition', label: 'Condition' },
  { value: 'inspection', label: 'Inspection' },
];

interface VerificationDemandFormProps {
  assetId: string;
}

/** Holder-only: demand the custodian prove the asset. The seller is
 *  notified and the deadline (server default 14 days) starts on post —
 *  the recourse query invalidation lands the demand on the dossier. */
export function VerificationDemandForm({ assetId }: VerificationDemandFormProps) {
  const { demandVerification } = useCoOwnTrustActions(assetId);
  const [open, setOpen] = useState(false);
  const [demandType, setDemandType] =
    useState<CoOwnVerificationDemandType>('authenticity');
  const [notes, setNotes] = useState('');
  const sent = demandVerification.isSuccess;

  const error = demandVerification.isError
    ? demandVerification.error instanceof Error
      ? demandVerification.error.message
      : 'Could not send the demand'
    : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (demandVerification.isPending) return;
    demandVerification.mutate(
      { demandType, notes: notes.trim() || undefined },
      {
        onSuccess: () => {
          setOpen(false);
          setNotes('');
        },
      },
    );
  };

  if (!open) {
    return (
      <div className="border-t border-border-subtle pb-4 pt-3">
        <Button
          size="sm"
          variant="outline"
          icon="scan"
          onClick={() => setOpen(true)}
        >
          Request verification
        </Button>
        {sent ? (
          <p className="mt-2 text-meta text-text-secondary">
            Demand sent — the deadline is on record.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      aria-label="Request verification"
      className="space-y-3 border-t border-border-subtle pb-4 pt-3"
    >
      <div>
        <span className={LABEL_CLASS}>Demand type</span>
        <div className="mt-1.5">
          <SegmentedControl
            options={DEMAND_TYPES}
            value={demandType}
            onChange={setDemandType}
            className="flex-wrap gap-y-1"
          />
        </div>
      </div>
      <div>
        <label htmlFor="demand-note" className={LABEL_CLASS}>
          Note <span className="font-normal normal-case">(optional)</span>
        </label>
        <input
          id="demand-note"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={4000}
          autoComplete="off"
          className={FIELD_CLASS}
        />
      </div>
      <p className="text-meta text-text-muted">
        The seller is notified and has 14 days to respond — an unanswered
        demand can trigger recourse.
      </p>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={demandVerification.isPending}>
          {demandVerification.isPending ? 'Sending…' : 'Send demand'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="quiet"
          onClick={() => setOpen(false)}
          disabled={demandVerification.isPending}
        >
          Cancel
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-meta text-danger-text">
          {error}
        </p>
      ) : null}
    </form>
  );
}
