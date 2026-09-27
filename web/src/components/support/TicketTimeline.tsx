'use client';

/**
 * TicketTimeline — opened → in review → resolved vertical stepper, ported
 * from OrderTimeline's node grammar. Completed steps get a filled check
 * node and a filled connector; the pending tail stays muted with an
 honest wait hint. Closed cases show all steps done.
 */

import type { SupportTicket } from '@/lib/contracts/support';
import { TIMELINE_STEPS } from '@/lib/contracts/support';
import { Icon } from '@/components/ui/Icon';
import { formatDate } from '@/lib/utils/format';

const REACHED: Record<SupportTicket['status'], number> = {
  open: 0,
  in_review: 1,
  resolved: 2,
  closed: 2,
};

export function TicketTimeline({ ticket }: { ticket: SupportTicket }) {
  const reached = REACHED[ticket.status];

  return (
    <ol className="flex flex-col">
      {TIMELINE_STEPS.map((step, i) => {
        const event = ticket.events.find((e) => e.kind === step.kind);
        const done = i <= reached;
        const isLast = i === TIMELINE_STEPS.length - 1;
        return (
          <li key={step.kind} className="flex gap-3">
            <div className="flex w-5 flex-col items-center">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  done ? 'bg-success-subtle text-success-text' : 'bg-surface-alt text-text-muted'
                }`}
              >
                {done ? (
                  <Icon name="check" size={12} />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              {!isLast ? (
                <span className={`w-px flex-1 ${i < reached ? 'bg-success' : 'bg-border'}`} aria-hidden />
              ) : null}
            </div>
            <div className={isLast ? '' : 'pb-6'}>
              <p className={`text-body font-medium ${done ? 'text-text-primary' : 'text-text-muted'}`}>
                {step.label}
              </p>
              {event?.at ? (
                <p className="text-caption text-text-secondary">{formatDate(event.at)}</p>
              ) : !done ? (
                <p className="text-caption text-text-muted">{step.pending}</p>
              ) : null}
              {event?.detail && done ? (
                <p className="text-caption text-text-muted">{event.detail}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
