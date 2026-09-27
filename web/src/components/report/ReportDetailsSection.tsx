'use client';

/**
 * ReportDetailsSection — free-text details + optional evidence photos.
 * Rendered only once a reason is selected (the sheet controls visibility),
 * mirroring the mobile component. One attach control on the web — the
 * browser file dialog covers camera and gallery alike.
 */

import { useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import {
  MAX_REPORT_DETAILS,
  MAX_REPORT_EVIDENCE,
  type EvidenceItem,
} from './reportModel';
import { ReportEvidenceGrid } from './ReportEvidenceGrid';

interface ReportDetailsSectionProps {
  details: string;
  onChangeDetails: (text: string) => void;
  evidenceItems: EvidenceItem[];
  onAttachFiles: (files: File[]) => void;
  onRemoveEvidence: (id: string) => void;
}

export function ReportDetailsSection({
  details,
  onChangeDetails,
  evidenceItems,
  onAttachFiles,
  onRemoveEvidence,
}: ReportDetailsSectionProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const slotsLeft = MAX_REPORT_EVIDENCE - evidenceItems.length;

  return (
    <div className="mt-5">
      <label
        htmlFor="report-details"
        className="mb-1.5 block text-caption font-semibold text-text-primary"
      >
        Additional details (optional)
      </label>
      <textarea
        id="report-details"
        value={details}
        onChange={(e) => onChangeDetails(e.target.value)}
        maxLength={MAX_REPORT_DETAILS}
        rows={4}
        placeholder="Describe what happened"
        className="w-full resize-y rounded-md border border-border bg-input px-3 py-2.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none"
      />
      <p className="mt-1 text-right text-meta text-text-muted">
        {details.length}/{MAX_REPORT_DETAILS}
      </p>

      <p className="mb-1.5 mt-4 text-caption font-semibold text-text-primary">
        Evidence photos (optional)
      </p>
      {evidenceItems.length > 0 ? (
        <div className="mb-2">
          <ReportEvidenceGrid
            items={evidenceItems}
            mode="editable"
            onRemove={onRemoveEvidence}
          />
        </div>
      ) : null}
      {slotsLeft > 0 ? (
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
            className="pressable flex min-h-11 w-full items-center gap-2 rounded-md border border-border px-3 py-2.5 text-left hover:bg-brand-subtle"
          >
            <Icon name="camera" size={18} className="shrink-0 text-text-secondary" />
            <span className="flex-1 text-body text-text-primary">
              {evidenceItems.length > 0 ? 'Add more' : 'Add photos'}
            </span>
            <span className="text-meta text-text-muted">
              {evidenceItems.length}/{MAX_REPORT_EVIDENCE}
            </span>
          </button>
        </>
      ) : null}
      <p className="mt-2 text-meta leading-relaxed text-text-muted">
        Remove labels, addresses and faces you don’t want shared.
      </p>
    </div>
  );
}
