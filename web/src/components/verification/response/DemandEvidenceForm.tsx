'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { SellerVerificationDemand } from '@/lib/contracts/verification';
import {
  MAX_EVIDENCE_NOTES,
  MAX_EVIDENCE_PHOTOS,
  type DemandEvidence,
} from '../demandModel';
import { EvidenceGrid } from './DemandResponsePrimitives';

interface DemandEvidenceFormProps {
  demand: SellerVerificationDemand;
  evidence: DemandEvidence[];
  onRemoveEvidence: (id: string) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onAttachFiles: (files: File[]) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  overdue: boolean;
  canSubmit: boolean;
  isSubmitting: boolean;
  onSubmit: () => void;
}

export function DemandEvidenceForm({
  demand,
  evidence,
  onRemoveEvidence,
  fileRef,
  onAttachFiles,
  notes,
  onNotesChange,
  overdue,
  canSubmit,
  isSubmitting,
  onSubmit,
}: DemandEvidenceFormProps) {
  return (
    <div className="min-w-0">
      {/* Evidence photos */}
      <div className="mt-7 lg:mt-0">
        <h2 className="text-label text-text-muted">Evidence photos</h2>
        <p className="mt-1.5 text-caption leading-relaxed text-text-secondary">
          Upload photos proving{' '}
          {demand.demandType === 'authenticity'
            ? 'authenticity'
            : demand.demandType === 'possession'
              ? 'possession'
              : "the item's condition"}
          . At least 1 required.
        </p>

        {evidence.length > 0 ? (
          <div className="mt-3">
            <EvidenceGrid items={evidence} onRemove={onRemoveEvidence} />
          </div>
        ) : null}

        {evidence.length < MAX_EVIDENCE_PHOTOS ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                onAttachFiles(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="pressable mt-3 flex min-h-11 w-full items-center gap-2 rounded-md border border-border px-3 py-2.5 text-left hover:bg-brand-subtle"
            >
              <Icon name="camera" size={18} className="shrink-0 text-text-secondary" />
              <span className="flex-1 text-body text-text-primary">
                {evidence.length > 0 ? 'Add more' : 'Add photos'}
              </span>
              <span className="text-meta text-text-muted">
                {evidence.length}/{MAX_EVIDENCE_PHOTOS}
              </span>
            </button>
          </>
        ) : null}
      </div>

      {/* Notes */}
      <div className="mt-7">
        <label htmlFor="evidence-notes" className="text-label text-text-muted">
          Notes (optional)
        </label>
        <div className="mt-1.5 rounded-md border border-border-subtle bg-surface p-3">
          <textarea
            id="evidence-notes"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            maxLength={MAX_EVIDENCE_NOTES}
            rows={4}
            placeholder="Add context about your evidence — serial numbers, certificates, dates, etc."
            className="w-full resize-y bg-transparent text-body text-input-text placeholder:text-text-muted focus:outline-none"
          />
          <p className="text-right text-meta text-text-muted">
            {notes.length}/{MAX_EVIDENCE_NOTES}
          </p>
        </div>
      </div>

      {/* Liability warning — the recourse posture */}
      <div className="mt-7 flex items-start gap-3 rounded-lg border border-warning-border bg-warning-subtle px-4 py-3.5">
        <Icon name="lock" size={18} className="mt-0.5 shrink-0 text-warning-text" />
        <p className="text-caption leading-relaxed text-text-secondary">
          Your personal liability guarantee is active. Failure to provide satisfactory
          evidence may trigger recourse proceedings.
        </p>
      </div>

      <div className="mt-6">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!canSubmit}
          onClick={onSubmit}
          aria-label="Submit evidence to buyer"
        >
          {isSubmitting ? 'Submitting…' : overdue ? 'Submit evidence now' : 'Submit evidence'}
        </Button>
      </div>
    </div>
  );
}
