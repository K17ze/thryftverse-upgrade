'use client';

/**
 * TicketThread — the /support/[id] surface. Case identity + status badge,
 * linked order/listing/payout context (the mobile extractContextLinks
 * set), conversation ownership + bot→human handoff, lifecycle stepper,
 * paginated message thread, attached evidence, the case activity log,
 * and the resolution block when the status allows it: Accept resolution
 * (fixture-mode only — no accept endpoint exists yet) / Contest decision
 * (real appeal endpoint in live mode), then CSAT. Skeleton, not-found and
 * empty states included.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import {
  canRequestHandoff,
  contextLinkHref,
  contextLinkLabel,
  contextLinksFor,
  ownershipLabel,
  statusMeta,
  type SupportContextKind,
} from '@/lib/contracts/support';
import { DATA_MODE } from '@/lib/api/client';
import { useSession } from '@/lib/session/SessionProvider';
import { formatDate } from '@/lib/utils/format';
import { useSupportActions, useSupportTickets } from './useSupportTickets';
import { SupportMessageRow } from './SupportMessageRow';
import { TicketTimeline } from './TicketTimeline';
import { CsatPrompt } from './CsatPrompt';

/** First render keeps the thread tail — long cases load earlier pages on
 *  demand instead of dropping the whole transcript at once. */
const PAGE_SIZE = 12;

const CONTEXT_ICONS: Record<SupportContextKind, AppIconName> = {
  order: 'box',
  listing: 'tag',
  payout: 'payout',
};

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
  const { isGuest, sessionLoading } = useSession();
  const { data: tickets, isLoading, isError, refetch } = useSupportTickets();
  const {
    appendMessage,
    retryMessage,
    acceptResolution,
    requestHandoff,
    contestResolution,
    submitCsat,
  } = useSupportActions();

  const [draft, setDraft] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [contesting, setContesting] = useState(false);
  const [contestReason, setContestReason] = useState('');
  const [contestBusy, setContestBusy] = useState(false);
  const ticket = useMemo(
    () => (tickets ?? []).find((t) => t.id === ticketId) ?? null,
    [tickets, ticketId],
  );

  if (sessionLoading || isLoading) return <ThreadSkeleton />;

  // Live mode: a guest can't have fetched this case — sign-in wall rather
  // than a misleading "not found".
  if (isGuest && DATA_MODE === 'live') {
    return (
      <EmptyState
        icon="folder"
        title="Sign in to view this case"
        subtitle="Support cases are tied to your account."
        actionLabel="Sign in"
        onAction={() => router.push('/auth')}
      />
    );
  }

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
  const owner = ownershipLabel(ticket);
  const handoffOffered = canRequestHandoff(ticket);
  const contextLinks = contextLinksFor(ticket);
  const evidence = ticket.evidence ?? [];
  const activityEvents = ticket.events.filter(
    (e) => e.kind === 'note' || e.kind === 'evidence' || e.kind === 'handoff' || e.kind === 'closed',
  );

  const hiddenCount = Math.max(0, ticket.messages.length - shown);
  const visibleMessages = ticket.messages.slice(-shown);

  const send = () => {
    const body = draft.trim();
    if (!body || !canReply) return;
    // Optimistic append — the hook resolves it to sent/failed (live POST)
    // or settles on the fixture tick; no self-confirming timer here.
    appendMessage(ticket.id, body);
    setDraft('');
  };

  const submitContest = async () => {
    setContestBusy(true);
    const ok = await contestResolution(ticket.id, contestReason);
    setContestBusy(false);
    if (ok) {
      setContesting(false);
      setContestReason('');
      show('A specialist will review the decision.', 'success');
    } else {
      show('Could not send the appeal — try again.', 'error');
    }
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
        {owner ? (
          <>
            <span aria-hidden> · </span>
            {owner}
          </>
        ) : null}
      </p>

      {/* Linked context — the order/listing/payout this case is about,
          1:1 with mobile's contextLinksFor extraction. */}
      {contextLinks.length > 0 ? (
        <ul
          aria-label="Linked to this case"
          className="mt-3 divide-y divide-border-subtle border-y border-border-subtle"
        >
          {contextLinks.map((link) => {
            const href = contextLinkHref(link);
            const inner = (
              <>
                <Icon
                  name={CONTEXT_ICONS[link.kind]}
                  size={18}
                  className="shrink-0 text-text-muted"
                />
                <span className="min-w-0 flex-1 text-body text-text-primary">
                  {contextLinkLabel(link.kind)}{' '}
                  <span className="tnum text-text-muted">{link.id}</span>
                </span>
                {href ? (
                  <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
                ) : null}
              </>
            );
            return (
              <li key={`${link.kind}:${link.id}`}>
                {href ? (
                  <Link
                    href={href}
                    className="pressable -mx-2 flex min-h-11 items-center gap-2.5 px-2 py-2.5"
                  >
                    {inner}
                  </Link>
                ) : (
                  <p className="flex min-h-11 items-center gap-2.5 py-2.5">{inner}</p>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* Bot→human handoff — offered while the assistant owns the thread.
          No dedicated case-handoff route exists, so the request lands as a
          real message on the case (delivered by the same send path). */}
      {handoffOffered ? (
        <div className="mt-3 flex items-center gap-2">
          <Icon name="people" size={18} className="shrink-0 text-text-muted" />
          <p className="text-caption text-text-secondary">
            {owner === 'AI assistant'
              ? 'The assistant is handling this case.'
              : 'This case is with the support team.'}
          </p>
          <button
            type="button"
            onClick={() => {
              requestHandoff(ticket.id);
              show('Specialist requested — they reply in this thread.', 'success');
            }}
            className="pressable -mx-2 min-h-11 shrink-0 px-2 text-caption font-semibold text-text-primary underline-offset-2 hover:underline"
          >
            Talk to a person
          </button>
        </div>
      ) : null}

      {/* Evidence — real attached media only; the 'Evidence received'
          stamp lives in the activity log, not here. */}
      {evidence.length > 0 ? (
        <section aria-label="Evidence" className="mt-4">
          <p className="text-label font-medium uppercase tracking-wide text-text-muted">
            Evidence · {evidence.length}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {evidence.map((item, i) => (
              <li key={item.id}>
                <a
                  href={item.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open evidence photo ${i + 1}`}
                  className="pressable block"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- evidence can be a session-local blob URL */}
                  <img
                    src={item.uri}
                    alt={`Evidence photo ${i + 1}`}
                    className="h-[72px] w-[72px] rounded-md object-cover"
                  />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Lifecycle stepper */}
      <section className="mt-6 border-y border-border-subtle py-5" aria-label="Case progress">
        <TicketTimeline ticket={ticket} />
      </section>

      {/* Case activity — operational events the lifecycle stepper doesn't
          carry (notes, evidence receipt, handoff, closure). */}
      {activityEvents.length > 0 ? (
        <section aria-label="Case activity" className="mt-4">
          <ul className="flex flex-col gap-2">
            {activityEvents.map((event, i) => (
              <li key={`${event.kind}-${i}`} className="flex items-baseline gap-2 text-caption">
                <span className="tnum shrink-0 text-text-muted">{formatDate(event.at)}</span>
                <span className="text-text-secondary">
                  {event.label}
                  {event.detail ? (
                    <span className="text-text-muted"> — {event.detail}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Thread — paginated: the tail renders first, earlier pages load
          on demand so long cases stay responsive. */}
      <section aria-label="Messages" className="mt-2">
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE_SIZE)}
            className="pressable my-3 flex min-h-11 w-full items-center justify-center gap-1.5 text-caption font-semibold text-text-secondary"
          >
            <Icon name="chevronUp" size={16} className="shrink-0" />
            Show {Math.min(hiddenCount, PAGE_SIZE)} earlier message
            {Math.min(hiddenCount, PAGE_SIZE) === 1 ? '' : 's'} ({hiddenCount} hidden)
          </button>
        ) : null}
        {visibleMessages.length === 0 ? (
          <p className="my-6 text-center text-body text-text-secondary">
            No messages yet — our team will reply here.
          </p>
        ) : (
          visibleMessages.map((message) => (
            <SupportMessageRow
              key={message.id}
              message={message}
              onRetry={
                message.status === 'failed'
                  ? () => retryMessage(ticket.id, message.id)
                  : undefined
              }
            />
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

          {/* Honest gating: contesting posts to the real case-appeal
              endpoint, so it works in both modes. Accepting has no case
              endpoint yet — fixture mode applies it to this session's
              data; live mode says so instead of faking a write. */}
          {contesting ? (
            <div className="mt-4">
              <textarea
                value={contestReason}
                onChange={(e) => setContestReason(e.target.value)}
                rows={3}
                maxLength={1000}
                autoFocus
                aria-label="Why you're contesting the resolution"
                placeholder="Why is this decision wrong? (optional)"
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-body text-input-text placeholder:text-text-muted focus:border-text-muted"
              />
              <div className="mt-2 flex gap-2">
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => void submitContest()}
                  disabled={contestBusy}
                >
                  {contestBusy ? 'Sending…' : 'Send appeal'}
                </Button>
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => setContesting(false)}
                  disabled={contestBusy}
                >
                  Keep resolution
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              {DATA_MODE !== 'live' ? (
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
              ) : null}
              <Button
                variant={DATA_MODE === 'live' ? 'primary' : 'outline'}
                size="md"
                onClick={() => setContesting(true)}
              >
                Contest decision
              </Button>
            </div>
          )}
          {DATA_MODE === 'live' && !contesting ? (
            <p className="mt-3 text-caption text-text-muted">
              Accepting a resolution isn&apos;t available on web yet — contest it here or accept it
              in the ThryftVerse app.
            </p>
          ) : null}
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
                void submitCsat(ticket.id, rating, note).then((ok) =>
                  show(
                    ok
                      ? 'Thanks — feedback recorded.'
                      : 'Could not send feedback — try again.',
                    ok ? 'success' : 'error',
                  ),
                );
              }}
            />
          </div>
        </section>
      ) : null}

      {/* Composer — pinned above the mobile tab bar (68px + safe-area
          insets sit inside the fixed bar); flat to the viewport bottom
          from md up, where the tab bar unmounts. */}
      <section
        aria-label="Reply"
        className="sticky bottom-[calc(68px+env(safe-area-inset-bottom))] mt-6 border-t border-border-subtle bg-background py-3 md:bottom-0"
      >
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

      {DATA_MODE !== 'live' ? (
        <p className="mt-10 flex items-center gap-1.5 text-caption text-text-muted">
          <Icon name="info" size={14} className="shrink-0" />
          Fixture mode — replies are stored for this session only.
        </p>
      ) : null}
    </div>
  );
}
