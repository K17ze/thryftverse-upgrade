'use client';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { DATA_MODE } from '@/lib/api/client';
import { SupportMessageRow } from './SupportMessageRow';
import { CsatPrompt } from './CsatPrompt';
import type { TicketThreadWorkflow } from './useTicketThreadWorkflow';

export function TicketThreadMessagePane({
  workflow,
}: {
  workflow: TicketThreadWorkflow;
}) {
  const {
    ticket,
    hiddenCount,
    loadEarlier,
    visibleMessages,
    handleRetry,
    resolutionOpen,
    contesting,
    setContesting,
    contestReason,
    setContestReason,
    contestBusy,
    submitContest,
    handleAccept,
    closed,
    csatAvailable,
    handleCsat,
    canReply,
    draft,
    setDraft,
    send,
  } = workflow;

  if (!ticket) return null;

  return (
    <div className="min-w-0 lg:order-1">
      {/* Thread — paginated: the tail renders first, earlier pages load on demand */}
      <section aria-label="Messages" className="mt-2">
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={loadEarlier}
            className="pressable my-3 flex min-h-11 w-full items-center justify-center gap-1.5 text-caption font-semibold text-text-secondary"
          >
            <Icon name="chevronUp" size={16} className="shrink-0" />
            Show {Math.min(hiddenCount, 12)} earlier message
            {Math.min(hiddenCount, 12) === 1 ? '' : 's'} ({hiddenCount} hidden)
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
                  ? () => handleRetry(message.id)
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
          <p className="mt-1 text-label text-text-muted">
            {ticket.resolution.disposition}
          </p>
          <p className="mt-2 text-body leading-relaxed text-text-secondary">{ticket.resolution.note}</p>

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
                  onClick={handleAccept}
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

      {/* CSAT — after resolve; only where a conversation exists to take feedback */}
      {closed && csatAvailable ? (
        <section aria-label="Feedback" className="mt-6 border-t border-border-subtle pt-5">
          <h2 className="text-body-emphasis font-semibold text-text-primary">
            {ticket.csat ? 'Your feedback' : 'How did we do?'}
          </h2>
          <div className="mt-3">
            <CsatPrompt
              submitted={ticket.csat}
              onSubmit={(rating, note) => {
                void handleCsat(rating, note);
              }}
            />
          </div>
        </section>
      ) : null}

      {/* Composer — pinned above the mobile tab bar; flat to the viewport bottom from md up */}
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
            {closed
              ? 'This case is closed. Open a new case if you still need help.'
              : 'Replies aren’t available on this request yet — our team will update you here.'}
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
