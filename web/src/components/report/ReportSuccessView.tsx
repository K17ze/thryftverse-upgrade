'use client';

/**
 * ReportSuccessView — post-submission receipt: case reference, honest
 * review-window copy, submitted evidence strip, Done. Port of the mobile
 * ReportSuccessView minus the user-report block action (blocking lives in
 * the account controls, not the report receipt).
 */

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { EvidenceItem } from './reportModel';
import { ReportEvidenceGrid } from './ReportEvidenceGrid';

interface ReportSuccessViewProps {
  reportId: string | null;
  submittedAt: string | null;
  evidenceItems: EvidenceItem[];
  /** 'dsa' adjusts the receipt copy for Art. 16 illegal-content notices. */
  kind?: 'report' | 'dsa';
  /** Deep link to the real case thread when submission created one. */
  caseHref?: string;
  onDone: () => void;
}

export function ReportSuccessView({
  reportId,
  submittedAt,
  evidenceItems,
  kind = 'report',
  caseHref,
  onDone,
}: ReportSuccessViewProps) {
  const isDsa = kind === 'dsa';
  return (
    <div className="flex flex-col items-center px-6 pb-8 pt-10 text-center">
      <Icon name="check" filled size={30} className="text-success-text" />
      <h3 className="mt-4 text-section-title font-semibold text-text-primary">
        {isDsa ? 'Notice received' : 'Report received'}
      </h3>
      {reportId ? (
        <p className="tnum mt-1.5 text-body-emphasis font-bold text-brand">
          {isDsa ? 'Notice' : 'Report'} #{reportId}
        </p>
      ) : null}
      <p className="mt-1.5 max-w-[330px] text-body leading-relaxed text-text-secondary">
        {isDsa
          ? 'We assess every notice under the Digital Services Act and confirm receipt by email. Updates appear on your case.'
          : 'We review every report — replies and updates appear on your case.'}
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
      {caseHref ? (
        <Link
          href={caseHref}
          className="pressable mt-4 text-body font-medium text-brand underline-offset-4 hover:underline"
        >
          View your case
        </Link>
      ) : null}
      <Button
        variant="primary"
        size="md"
        className="mt-4 min-w-[150px]"
        onClick={onDone}
      >
        Done
      </Button>
    </div>
  );
}
