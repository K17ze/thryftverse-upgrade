'use client';

/**
 * MyReportsSection — "Reports you've filed" read-only list on the support
 * hub. Renders the reporter-scoped GET /users/me/reports read: every
 * user/listing/conversation report joined to its safety notice and the
 * latest case decision. Live-mode + authed only — fixtures seed no report
 * history, so the section self-omits rather than showing a fake-empty.
 */

import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { DATA_MODE } from '@/lib/api/client';
import { useSession } from '@/lib/session/SessionProvider';
import { timeAgo } from '@/lib/utils/format';
import { useMyReports } from './useSupportTickets';
import type { MyReport } from '@/lib/api/services/support';

const KIND_LABEL: Record<MyReport['kind'], string> = {
  user: 'Member',
  listing: 'Listing',
  conversation: 'Conversation',
};

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  reviewing: 'Under review',
  actioned: 'Actioned',
  dismissed: 'Dismissed',
};

const OUTCOME_LABEL: Record<string, string> = {
  no_violation: 'No violation found',
  restrict: 'Content restricted',
  escalate: 'Escalated for enforcement',
  emergency_hold: 'Emergency hold applied',
};

function labelFor(reason: string): string {
  return reason
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ReportRow({ report }: { report: MyReport }) {
  // The status line shows the furthest-reaching truth: a case outcome
  // when decided, else the case/report pipeline stage. The safety caseId
  // is not a support case — it has no customer thread, so no link.
  const statusLabel =
    (report.outcome && OUTCOME_LABEL[report.outcome]) ??
    STATUS_LABEL[report.status] ??
    labelFor(report.status);

  return (
    <li className="flex items-start gap-3.5 py-4">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-text-secondary">
        <Icon name="flag" size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body text-text-primary">
          {KIND_LABEL[report.kind]} · {labelFor(report.reason)}
        </p>
        <p className="mt-0.5 text-caption text-text-muted">
          {statusLabel}
          {report.caseStatus && !report.outcome ? ` — case ${report.caseStatus.replace(/_/g, ' ')}` : ''}
          {' · '}
          {timeAgo(report.createdAt)}
        </p>
      </div>
    </li>
  );
}

export function MyReportsSection() {
  const { isGuest } = useSession();
  const live = DATA_MODE === 'live';
  const { data, isLoading, isError } = useMyReports();

  // Self-omit entirely when the read can't exist (fixture mode, guests)
  // or came back empty — an always-rendered empty block would be chrome.
  if (!live || isGuest) return null;
  if (isLoading) {
    return (
      <section aria-label="Reports you've filed" className="mt-10 border-t border-border-subtle px-4 pt-6 sm:px-6">
        <Skeleton className="h-5 w-40" />
        <div className="mt-2 divide-y divide-border-subtle">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3.5 py-4">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="mt-1.5 h-3 w-2/5" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (isError || !data || data.length === 0) return null;

  return (
    <section aria-label="Reports you've filed" className="mt-10 border-t border-border-subtle px-4 pt-6 sm:px-6">
      <h2 className="text-section-title font-semibold text-text-primary">
        Reports you&apos;ve filed
      </h2>
      <p className="mt-1 text-caption text-text-secondary">
        What happens after you flag a member, listing or conversation.
      </p>
      <ul className="divide-y divide-border-subtle">
        {data.map((r) => (
          <ReportRow key={r.reportId} report={r} />
        ))}
      </ul>
    </section>
  );
}
