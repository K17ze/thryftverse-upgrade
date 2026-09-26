'use client';

/**
 * SupportMessageRow — case thread bubble, ported from the mobile
 * SupportMessageRow grammar. Customer messages sit right in brand ink;
 * agent messages sit left on surfaceAlt with an author caption; system
 * notes render as centered captions. Optimistic sends carry a clock
 * receipt until confirmed.
 */

import type { SupportTicketMessage } from '@/lib/contracts/support';
import { Icon } from '@/components/ui/Icon';

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function SupportMessageRow({ message }: { message: SupportTicketMessage }) {
  if (message.role === 'system') {
    return <p className="my-3 px-6 text-center text-meta text-text-muted">{message.body}</p>;
  }

  const mine = message.role === 'customer';
  const time = formatTime(message.createdAt);

  return (
    <div className={`mt-1.5 flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[80%] md:max-w-[65%]">
        {!mine && message.authorName ? (
          <p className="mb-1 text-meta font-semibold text-text-muted">{message.authorName}</p>
        ) : null}
        <div
          className={`rounded-chat px-3.5 py-2 ${
            mine
              ? 'rounded-br-sm bg-brand text-text-inverse'
              : 'rounded-bl-sm bg-surface-alt text-text-primary'
          }`}
        >
          <p className="whitespace-pre-wrap break-words text-body">{message.body}</p>
          <div
            className={`mt-0.5 flex items-center justify-end gap-1 ${
              mine ? 'text-text-inverse/60' : 'text-text-muted'
            }`}
          >
            {time ? <span className="text-micro">{time}</span> : null}
            {mine && message.status === 'sending' ? (
              <Icon name="clock" size={11} aria-label="Sending" />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
