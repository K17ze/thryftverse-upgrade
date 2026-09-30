'use client';

/**
 * TicketThread — the /support/[id] surface orchestrator.
 * Factored into domain-isolated modules:
 * - useTicketThreadWorkflow: state, data fetch, optimistic append, contest appeal, CSAT
 * - TicketThreadGates: loading skeleton, live guest wall, error, and 404 not found
 * - TicketThreadSidebar: context links, bot→human handoff, evidence, lifecycle, activity
 * - TicketThreadMessagePane: message rows, resolution block, feedback, and reply composer
 */

import { Badge } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/IconButton';
import { formatDate } from '@/lib/utils/format';
import { useTicketThreadWorkflow } from './useTicketThreadWorkflow';
import { TicketThreadGates } from './TicketThreadGates';
import { TicketThreadSidebar } from './TicketThreadSidebar';
import { TicketThreadMessagePane } from './TicketThreadMessagePane';

export function TicketThread({ ticketId }: { ticketId: string }) {
  const workflow = useTicketThreadWorkflow(ticketId);
  const { ticket, meta, stateLabel, owner, caseRef, router } = workflow;

  // Render gates (skeleton, guest-wall, error, not-found)
  if (!ticket || workflow.sessionLoading || workflow.isLoading || workflow.detail.isLoading) {
    return <TicketThreadGates workflow={workflow} />;
  }

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6 lg:max-w-[1440px]">
      {/* Case identity header */}
      <div className="flex items-center gap-2">
        <IconButton
          name="back"
          aria-label="Back to support"
          onClick={() => router.push('/support')}
          className="-ml-2"
        />
        <p className="text-caption text-text-muted">
          Case <span className="tnum font-semibold text-text-secondary">{caseRef}</span>
        </p>
        {meta ? (
          <span className="ml-auto">
            <Badge variant={meta.badge} icon={meta.icon}>
              {stateLabel}
            </Badge>
          </span>
        ) : null}
      </div>

      <h1 className="mt-3 text-screen-title text-text-primary">{ticket.topicLabel}</h1>
      <p className="mt-1 text-caption text-text-secondary">
        Opened {formatDate(ticket.createdAt)}
        {owner ? (
          <>
            <span aria-hidden> · </span>
            {owner}
          </>
        ) : null}
      </p>

      {/* Desktop split: metadata right rail, conversation main column */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-x-10 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-x-14">
        <TicketThreadSidebar workflow={workflow} />
        <TicketThreadMessagePane workflow={workflow} />
      </div>
    </div>
  );
}
