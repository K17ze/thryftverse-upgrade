'use client';

/**
 * ReportSuccessView — post-submission receipt: case reference, honest
 * review-window copy, submitted evidence strip, Done. Port of the mobile
 * ReportSuccessView minus the user-report block action (blocking lives in
 * the account controls, not the report receipt).
 */

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { EvidenceItem } from './reportModel';
import { ReportEvidenceGrid } from './ReportEvidenceGrid';

interface ReportSuccessViewProps {
  reportId: string | null;
  submittedAt: string | null;
  evidenceItems: EvidenceItem[];
  onDone: () => void;
}

export function ReportSuccessView({
  reportId,
  submittedAt,
  evidenceItems,
  onDone,
}: ReportSuccessViewProps) {
  return (
    <div className="flex flex-col items-center px-6 pb-8 pt-10 text-center">
      <Icon name="check" filled size={30} className="text-success-text" />
      <h3 className="mt-4 text-section-title font-semibold text-text-primary">
        Report received
      </h3>
      {reportId ? (
        <p className="tnum mt-1.5 text-body-emphasis font-bold text-brand">
          Report #{reportId}
        </p>
      ) : null}
      <p className="mt-1.5 max-w-[330px] text-body leading-relaxed text-text-secondary">
        We review every report — most within 24 hours — and we’ll let you
        know the outcome.
      </p>
      {submittedAt ? (
        <p className="mt-1.5 text-meta text-text-muted">Received at {submittedAt}</p>
      ) : null}
      {evidenceItems.length > 0 ? (
        <div className="mt-4">
          <ReportEvidenceGrid items={evidenceItems} mode="submitted" />
        </div>
      ) : null}
      {reportId ? (
        <p className="mt-1.5 max-w-[300px] text-meta leading-relaxed text-text-muted">
          Reference this number if you contact support.
        </p>
      ) : null}
      <Button
        variant="primary"
        size="md"
        className="mt-6 min-w-[150px]"
        onClick={onDone}
      >
        Done
      </Button>
    </div>
  );
}
