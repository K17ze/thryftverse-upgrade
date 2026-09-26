'use client';

/**
 * TicketThread — the /support/[id] surface. Case identity + status badge,
 * lifecycle stepper, message thread (support left, you right, system
 * captions), optimistic reply composer, and the resolution block when the
 * status allows it: Accept resolution / Escalate, then CSAT. Skeleton,
 * not-found and empty states included.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { statusMeta } from '@/lib/contracts/support';
import { formatDate } from '@/lib/utils/format';
import { useSupportActions, useSupportTickets } from './useSupportTickets';
import { SupportMessageRow } from './SupportMessageRow';
import { TicketTimeline } from './TicketTimeline';
import { CsatPrompt } from './CsatPrompt';

function ThreadSkeleton() {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6" aria-busy aria-label="Loading case">
      <Skeleton className="h-6 w-44" />
      <Skeleton className="mt-2 h-8 w-56" />
      <div className="mt-6 flex flex-col gap-4 border-y border-border-subtle py-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-4" style={{ width: `${38 - i * 8}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-col gap-2">
        <Skeleton className="h-12 w-2/3 rounded-chat" />
        <Skeleton className="ml-auto h-12 w-1/2 rounded-chat" />
        <Skeleton className="h-10 w-3/5 rounded-chat" />
      </div>
      <Skeleton className="mt-6 h-16 w-full rounded-lg" />
    </div>
  );
}

export function TicketThread({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const { show } = useToast();
  const { data: tickets, isLoading, isError, refetch } = useSupportTickets();
  const { appendMessage, confirmMessage, acceptResolution, escalate, submitCsat } =
    useSupportActions();

  const [draft, setDraft] = useState('');
  const ticket = useMemo(
    () => (tickets ?? []).find((t) => t.id === ticketId) ?? null,
    [tickets, ticketId],
  );

  if (isLoading) return <ThreadSkeleton />;

  if (isError) {
    return (
      <EmptyState
        icon="alert"
        title="Could not load the case"
        subtitle="Check your connection and try again."
        actionLabel="Retry"
        onAction={() => void refetch()}
      />
    );
  }

  if (!ticket) {
    return (
      <EmptyState
        icon="folder"
        title="Case not found"
        subtitle="This case may have been removed, or the link is incomplete."
        actionLabel="All support cases"
        onAction={() => router.push('/support')}
      />
    );
  }

  const meta = statusMeta(ticket.status);
  const closed = ticket.status === 'closed';
  const canReply = !closed;
  const resolutionOpen = ticket.status === 'resolved' && ticket.resolution !== null;

  const send = () => {
    const body = draft.trim();
    if (!body || !canReply) return;
    const messageId = appendMessage(ticket.id, body);
    setDraft('');
    window.setTimeout(() => confirmMessage(ticket.id, messageId), 700);
  };

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6">
      {/* Case identity */}
      <div className="flex items-center gap-2">
        <IconButton name="back" aria-label="Back to support" onClick={() => router.push('/support')} className="-ml-2" />
        <p className="text-caption text-text-muted">
          Case <span className="tnum font-semibold text-text-secondary">{ticket.ref}</span>
        </p>
        <span className="ml-auto">
          <Badge variant={meta.badge} icon={meta.icon}>
            {meta.label}
          </Badge>
        </span>
      </div>
      <h1 className="mt-3 text-screen-title font-bold text-text-primary">{ticket.topicLabel}</h1>
      <p className="mt-1 text-caption text-text-secondary">
        Opened {formatDate(ticket.createdAt)}
        {ticket.orderRef ? (
          <>
            <span aria-hidden> · </span>
            <Link
              href={`/orders/${ticket.orderRef}`}
              className="pressable font-semibold text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
            >
              <span className="tnum">View order {ticket.orderRef}</span>
            </Link>
          </>
        ) : null}
      </p>

      {/* Lifecycle stepper */}
      <section className="mt-6 border-y border-border-subtle py-5" aria-label="Case progress">
        <TicketTimeline ticket={ticket} />
      </section>

      {/* Thread */}
      <section aria-label="Messages" className="mt-2">
        {ticket.messages.length === 0 ? (
          <p className="my-6 text-center text-body text-text-secondary">
            No messages yet — our team will reply here.
          </p>
        ) : (
          ticket.messages.map((message) => (
            <SupportMessageRow key={message.id} message={message} />
          ))
        )}
      </section>

      {/* Resolution — only when the case is resolved and not closed */}
      {resolutionOpen && ticket.resolution ? (
        <section aria-label="Resolution" className="mt-6 border-t border-border-subtle pt-5">
          <div className="flex items-center gap-2">
            <Icon name="shieldCheck" size={18} className="shrink-0 text-success-text" />
            <h2 className="text-body-emphasis font-semibold text-text-primary">
              Resolution proposed
            </h2>
          </div>
          <p className="mt-1 text-label font-semibold uppercase tracking-wider text-text-muted">
            {ticket.resolution.disposition}
          </p>
          <p className="mt-2 text-body leading-relaxed text-text-secondary">{ticket.resolution.note}</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              variant="primary"
              size="md"
              icon="check"
              onClick={() => {
                acceptResolution(ticket.id);
                show('Resolution accepted — case closed.', 'success');
              }}
            >
              Accept resolution
            </Button>
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                escalate(ticket.id);
                show('Case escalated — a specialist will review it.', 'info');
              }}
            >
              Escalate
            </Button>
          </div>
        </section>
      ) : null}

      {/* CSAT — after resolve */}
      {closed ? (
        <section aria-label="Feedback" className="mt-6 border-t border-border-subtle pt-5">
          <h2 className="text-body-emphasis font-semibold text-text-primary">
            {ticket.csat ? 'Your feedback' : 'How did we do?'}
          </h2>
          <div className="mt-3">
            <CsatPrompt
              submitted={ticket.csat}
              onSubmit={(rating, note) => {
                submitCsat(ticket.id, rating, note);
                show('Thanks — feedback recorded.', 'success');
              }}
            />
          </div>
        </section>
      ) : null}

      {/* Composer */}
      <section aria-label="Reply" className="sticky bottom-0 mt-6 border-t border-border-subtle bg-background py-3">
        {canReply ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder="Add information to the case…"
              aria-label="Reply to support"
              className="min-h-[52px] flex-1 resize-none rounded-chat border border-border bg-input px-3.5 py-2.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none"
            />
            <IconButton
              name="send"
              aria-label="Send reply"
              contained
              onClick={send}
              disabled={!draft.trim()}
              className="shrink-0"
            />
          </form>
        ) : (
          <p className="flex items-center gap-1.5 text-caption text-text-muted">
            <Icon name="check" size={14} className="shrink-0 text-text-muted" />
            This case is closed. Open a new case if you still need help.
          </p>
        )}
      </section>

      <p className="mt-10 flex items-center gap-1.5 text-caption text-text-muted">
        <Icon name="info" size={14} className="shrink-0" />
        Fixture mode — replies are stored for this session only.
      </p>
    </div>
  );
}
