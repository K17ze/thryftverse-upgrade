'use client';

/**
 * SupportHub — the support surface: resolution centre (open cases from
 * session state), popular articles, and the contact CTA that expands into
 * the inline new-case form. Flat canvas, hairline sections, no cards.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { POPULAR_ARTICLES } from '@/lib/data/fixtures-support';
import { ArticleAccordion } from './ArticleAccordion';
import { NewTicketForm } from './NewTicketForm';
import { TicketListRow } from './TicketListRow';
import { useSupportTickets } from './useSupportTickets';

function HubSkeleton() {
  return (
    <div aria-busy aria-label="Loading support">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <Skeleton className="h-11 w-11 rounded-full" />
        <Skeleton className="h-7 w-32" />
      </div>
      <div className="mt-8 px-4 sm:px-6">
        <Skeleton className="h-4 w-44" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3.5 border-b border-border-subtle py-4">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-4 flex-1" style={{ maxWidth: `${60 - i * 8}%` }} />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
      <div className="mt-8 px-4 sm:px-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full border-b border-border-subtle" />
        ))}
      </div>
    </div>
  );
}

export function SupportHub() {
  const router = useRouter();
  const { show } = useToast();
  const { data: tickets, isLoading, isError } = useSupportTickets();
  const [contactOpen, setContactOpen] = useState(false);

  const handleCreated = (ticketId: string) => {
    show('Case opened — we reply within one working day.', 'success');
    router.push(`/support/${ticketId}`);
  };

  if (isLoading) return <HubSkeleton />;

  if (isError || !tickets) {
    return (
      <EmptyState
        icon="help"
        title="Support unavailable"
        subtitle="We couldn't load your cases. Check your connection and try again."
        actionLabel="Retry"
        onAction={() => window.location.reload()}
      />
    );
  }

  const openCount = tickets.filter((t) => t.status === 'open' || t.status === 'in_review').length;

  return (
    <div className="pb-16">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back" onClick={() => router.back()} />
        <h1 className="text-screen-title font-semibold text-text-primary">Support</h1>
      </div>
      <p className="mt-1 px-4 text-caption text-text-secondary sm:px-6">
        Cases, answers and ways to reach us.
      </p>

      {/* Resolution centre — the case list is the entry point */}
      <section aria-label="Resolution centre" className="mt-8">
        <div className="flex items-baseline justify-between px-4 sm:px-6">
          <h2 className="text-section-title font-semibold text-text-primary">Resolution centre</h2>
          <p className="tnum text-caption text-text-muted">
            {openCount} open · {tickets.length} total
          </p>
        </div>
        <p className="mt-1 px-4 text-caption text-text-secondary sm:px-6">
          Order issues, refunds and verification cases.
        </p>

        <div className="mt-3 border-t border-border-subtle">
          {tickets.length > 0 ? (
            tickets.map((ticket) => <TicketListRow key={ticket.id} ticket={ticket} />)
          ) : (
            <EmptyState
              compact
              icon="folder"
              title="No cases yet"
              subtitle="Open one below and we'll take it from there."
            />
          )}
        </div>
      </section>

      {/* Popular articles */}
      <section aria-label="Popular articles" className="mt-10 px-4 sm:px-6">
        <h2 className="text-section-title font-semibold text-text-primary">Popular articles</h2>
        <div className="mt-3">
          <ArticleAccordion articles={POPULAR_ARTICLES} />
        </div>
      </section>

      {/* Contact — CTA reveals the inline form */}
      <section aria-label="Contact support" className="mt-10 border-t border-border-subtle pt-6">
        {contactOpen ? (
          <NewTicketForm onCreated={handleCreated} onCancel={() => setContactOpen(false)} />
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-body-emphasis font-medium text-text-primary">Still need help?</p>
              <p className="mt-0.5 text-body text-text-secondary">
                Open a case — we reply within one working day.
              </p>
            </div>
            <Button variant="secondary" size="md" icon="chat" onClick={() => setContactOpen(true)}>
              Contact support
            </Button>
          </div>
        )}
      </section>

      <p className="mt-10 flex items-center gap-1.5 text-caption text-text-muted">
        <Icon name="info" size={14} className="shrink-0" />
        Fixture mode — cases are stored for this session only and reset on reload.
      </p>
    </div>
  );
}
