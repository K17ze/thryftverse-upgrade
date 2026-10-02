'use client';

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import {
  contextLinkHref,
  contextLinkLabel,
  type SupportContextKind,
} from '@/lib/contracts/support';
import { formatDate } from '@/lib/utils/format';
import { TicketTimeline } from './TicketTimeline';
import type { TicketThreadWorkflow } from './useTicketThreadWorkflow';

const CONTEXT_ICONS: Record<SupportContextKind, AppIconName> = {
  order: 'box',
  listing: 'tag',
  payout: 'payout',
};

export function TicketThreadSidebar({
  workflow,
}: {
  workflow: TicketThreadWorkflow;
}) {
  const {
    ticket,
    contextLinks,
    handoffOffered,
    owner,
    handleHandoff,
    evidence,
    activityEvents,
  } = workflow;

  if (!ticket) return null;

  return (
    <aside className="lg:order-2 lg:sticky lg:top-20 lg:self-start">
      {/* Linked context — the order/listing/payout this case is about */}
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

      {/* Bot→human handoff — offered while the assistant owns the thread */}
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
            onClick={handleHandoff}
            className="pressable -mx-2 min-h-11 shrink-0 px-2 text-caption font-semibold text-text-primary underline-offset-2 hover:underline"
          >
            Talk to a person
          </button>
        </div>
      ) : null}

      {/* Evidence — real attached media only */}
      {evidence.length > 0 ? (
        <section aria-label="Evidence" className="mt-4">
          <p className="text-label text-text-muted">
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
                  {/* AppImage routes blob:/data: evidence to a raw img and
                      remote to next/image — the "blob URL" carve-out is stale. */}
                  <AppImage
                    src={item.uri}
                    alt={`Evidence photo ${i + 1}`}
                    sizes="72px"
                    className="h-[72px] w-[72px] rounded-md"
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

      {/* Case activity — operational events (notes, evidence receipt, handoff, closure) */}
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
    </aside>
  );
}
