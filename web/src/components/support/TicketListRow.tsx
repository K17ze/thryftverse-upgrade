'use client';

/**
 * TicketListRow — one resolution-centre row: status icon, topic, case ref
 * and updated stamp, quiet status badge on the right. Hairline rhythm, no
 * cards. Mirrors the mobile ResolutionCentreScreen row grammar.
 */

import Link from 'next/link';
import type { SupportTicket } from '@/lib/contracts/support';
import { statusMeta } from '@/lib/contracts/support';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function TicketListRow({ ticket }: { ticket: SupportTicket }) {
  const meta = statusMeta(ticket.status);
  return (
    <Link
      href={`/support/${ticket.id}`}
      className="pressable flex min-h-[64px] items-center gap-3.5 px-4 py-3.5 sm:px-6"
      aria-label={`${ticket.topicLabel} case ${meta.label}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center">
        <Icon
          name={meta.icon}
          size={19}
          className={
            ticket.status === 'resolved'
              ? 'text-success-text'
              : ticket.status === 'closed'
                ? 'text-text-muted'
                : 'text-text-secondary'
          }
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="clamp-1 block text-body-emphasis font-medium text-text-primary">
          {ticket.topicLabel}
        </span>
        <span className="mt-0.5 block text-caption text-text-secondary">
          <span className="tnum">{ticket.ref}</span>
          {ticket.orderRef ? (
            <>
              <span aria-hidden> · </span>
              <span className="tnum">Order {ticket.orderRef}</span>
            </>
          ) : null}
          <span aria-hidden> · </span>
          Updated {shortDate(ticket.updatedAt)}
        </span>
      </span>
      <Badge variant={meta.badge}>{meta.label}</Badge>
    </Link>
  );
}
