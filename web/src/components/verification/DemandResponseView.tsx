'use client';

/**
 * DemandResponseView — /verification/demands/[id]. Port of the mobile
 * VerificationResponseScreen: demand context + guidance, evidence photos
 * (≥1 required, up to 6), optional notes, liability warning, submit →
 * responded. Terminal statuses render their own honest end-states —
 * receipt for responded/compliant, closed copy for failed/expired/withdrawn.
 *
 * Orchestrated with domain components (<400 LOC standard):
 *  - DemandShell
 *  - DemandResponseReceipt
 *  - DemandTerminalState
 *  - DemandContextCard
 *  - DemandEvidenceForm
 *  - useDemandResponseWorkflow
 */

import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { DemandShell } from './response/DemandResponsePrimitives';
import { useDemandResponseWorkflow } from './response/useDemandResponseWorkflow';
import { DemandResponseReceipt } from './response/DemandResponseReceipt';
import { DemandTerminalState } from './response/DemandTerminalState';
import { DemandContextCard } from './response/DemandContextCard';
import { DemandEvidenceForm } from './response/DemandEvidenceForm';

export function DemandResponseView({ demandId }: { demandId: number }) {
  const workflow = useDemandResponseWorkflow(demandId);

  const {
    router,
    isGuest,
    demand,
    isLoading,
    isError,
    refetch,
    respond,
    evidence,
    notes,
    setNotes,
    submitted,
    fileRef,
    overdue,
    canSubmit,
    attachFiles,
    removeEvidence,
    submit,
  } = workflow;

  if (isGuest) return null;

  if (isLoading) {
    return (
      <DemandShell>
        <div className="mt-4" aria-busy aria-label="Loading verification request">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="mt-6 h-4 w-40" />
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-[88px] w-[88px] rounded-md" />
            <Skeleton className="h-[88px] w-[88px] rounded-md" />
          </div>
          <Skeleton className="mt-6 h-24 w-full rounded-md" />
          <Skeleton className="mt-6 h-[52px] w-full rounded-md" />
        </div>
      </DemandShell>
    );
  }

  if (isError) {
    return (
      <DemandShell>
        <EmptyState
          icon="alert"
          title="Could not load request"
          subtitle="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void refetch()}
        />
      </DemandShell>
    );
  }

  if (!demand) {
    return (
      <DemandShell>
        <EmptyState
          icon="help"
          title="Request not found"
          subtitle="This verification request may have been withdrawn."
          actionLabel="Back to requests"
          onAction={() => router.push('/verification/demands')}
        />
      </DemandShell>
    );
  }

  // Responded / compliant — receipt
  if (submitted || demand.status === 'responded' || demand.status === 'compliant') {
    return <DemandResponseReceipt demand={demand} />;
  }

  // Terminal non-pending states — failed / expired / withdrawn
  if (demand.status !== 'pending') {
    return <DemandTerminalState demand={demand} />;
  }

  // Pending — response form
  return (
    <DemandShell>
      <div className="lg:mt-4 lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:gap-10">
        <DemandContextCard demand={demand} />
        <DemandEvidenceForm
          demand={demand}
          evidence={evidence}
          onRemoveEvidence={removeEvidence}
          fileRef={fileRef}
          onAttachFiles={attachFiles}
          notes={notes}
          onNotesChange={setNotes}
          overdue={overdue}
          canSubmit={canSubmit}
          isSubmitting={respond.isPending}
          onSubmit={submit}
        />
      </div>
    </DemandShell>
  );
}
