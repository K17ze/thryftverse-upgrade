'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useCoOwnTrustActions } from '@/lib/hooks/coown-queries';
import { FIELD_CLASS, LABEL_CLASS } from './diligenceTypes';

interface RefreshAppraisalFormProps {
  assetId: string;
  currentValuer: string | null;
}

/** Issuer-only: file a fresh third-party appraisal — the response
 *  replaces the dossier figures on the invalidated asset/diligence reads
 *  and writes a public audit event. */
export function RefreshAppraisalForm({
  assetId,
  currentValuer,
}: RefreshAppraisalFormProps) {
  const { refreshAppraisal } = useCoOwnTrustActions(assetId);
  const [open, setOpen] = useState(false);
  const [valuer, setValuer] = useState('');
  const [valueText, setValueText] = useState('');
  const [notes, setNotes] = useState('');

  const value = Number(valueText);
  const canSubmit =
    valuer.trim().length >= 2 &&
    valueText !== '' &&
    Number.isFinite(value) &&
    value >= 0 &&
    !refreshAppraisal.isPending;
  const error = refreshAppraisal.isError
    ? refreshAppraisal.error instanceof Error
      ? refreshAppraisal.error.message
      : 'Could not record the appraisal'
    : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    refreshAppraisal.mutate(
      {
        appraisalValueGbp: Math.round(value * 100) / 100,
        appraisalValuer: valuer.trim(),
        appraisalNotes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setValueText('');
          setNotes('');
        },
      },
    );
  };

  if (!open) {
    return (
      <div className="pb-4">
        <Button
          size="sm"
          variant="outline"
          icon="refresh"
          onClick={() => setOpen(true)}
        >
          Refresh appraisal
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      aria-label="Refresh appraisal"
      className="space-y-3 border-t border-border-subtle pb-4 pt-3"
    >
      <div>
        <label htmlFor="appraisal-valuer" className={LABEL_CLASS}>
          Valuer
        </label>
        <input
          id="appraisal-valuer"
          value={valuer}
          onChange={(e) => setValuer(e.target.value)}
          placeholder={currentValuer ?? 'Appraisal firm or valuer'}
          maxLength={180}
          autoComplete="off"
          className={FIELD_CLASS}
        />
      </div>
      <div>
        <label htmlFor="appraisal-value" className={LABEL_CLASS}>
          Appraised value · GBP
        </label>
        <input
          id="appraisal-value"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={valueText}
          onChange={(e) => setValueText(e.target.value)}
          className={`${FIELD_CLASS} tnum`}
        />
      </div>
      <div>
        <label htmlFor="appraisal-note" className={LABEL_CLASS}>
          Note <span className="font-normal normal-case">(optional)</span>
        </label>
        <input
          id="appraisal-note"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={4000}
          autoComplete="off"
          className={FIELD_CLASS}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {refreshAppraisal.isPending ? 'Recording…' : 'Record appraisal'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="quiet"
          onClick={() => setOpen(false)}
          disabled={refreshAppraisal.isPending}
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
