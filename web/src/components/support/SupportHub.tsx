'use client';

/**
 * SupportHub — the support surface: resolution centre (open cases from
 * session state), popular articles, and the contact CTA that expands into
 * the inline new-case form. Flat canvas, hairline sections, no cards.
 */

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, tabId, tabPanelId } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { POPULAR_ARTICLES } from '@/lib/data/fixtures-support';
import { SUPPORT_TOPICS, type SupportTopicId } from '@/lib/contracts/support';
import { DATA_MODE } from '@/lib/api/client';
import { useSession } from '@/lib/session/SessionProvider';
import { ArticleAccordion } from './ArticleAccordion';
import { MyReportsSection } from './MyReportsSection';
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
  const { isGuest, sessionLoading } = useSession();
  const { data: tickets, isLoading, isError } = useSupportTickets();
  const [contactOpen, setContactOpen] = useState(false);
  const [contactTopic, setContactTopic] = useState<SupportTopicId | undefined>(undefined);
  /** Resolution-centre filter — mirrors the mobile Open/All chips. */
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const tabsId = useId();

  const handleCreated = (ticketId: string) => {
    show('Case opened — we reply within one working day.', 'success');
    router.push(`/support/${ticketId}`);
  };

  if (sessionLoading || (!isGuest && isLoading)) return <HubSkeleton />;

  // Guests never run the list query (enabled: !!user) — `tickets` stays
  // undefined for them, so the error guard must not read that as a
  // failed fetch; the sign-in wall below is their state.
  if (!isGuest && (isError || !tickets)) {
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

  const list = tickets ?? [];

  const isOpen = (s: (typeof list)[number]['status']) =>
    s === 'open' || s === 'in_review';
  const openCount = list.filter((t) => isOpen(t.status)).length;
  const visible = filter === 'open' ? list.filter((t) => isOpen(t.status)) : list;

  return (
    <div className="pb-16">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back" onClick={() => router.back()} />
        <h1 className="text-screen-title text-text-primary">Support</h1>
      </div>
      <p className="mt-1 px-4 text-caption text-text-secondary sm:px-6">
        Cases, answers and ways to reach us.
      </p>

      {/* Desktop split — the resolution centre is the primary column;
          articles + contact ride a sticky right rail so the case list
          stays beside them (Linear/Vinted grammar). Mobile keeps the
          authored vertical order unchanged. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-x-8 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-x-12">
      {/* Resolution centre — the case list is the entry point */}
      <section aria-label="Resolution centre" className="mt-8">
        <div className="flex items-baseline justify-between px-4 sm:px-6">
          <h2 className="text-section-title font-semibold text-text-primary">Resolution centre</h2>
          <p className="tnum text-caption text-text-muted">
            {openCount} open · {list.length} total
          </p>
        </div>
        <p className="mt-1 px-4 text-caption text-text-secondary sm:px-6">
          Order issues, refunds and verification cases.
        </p>

        {/* Open/All scope filter — the app Tabs grammar (APG roving
            tabindex + arrows), counts as quiet tab meta. Its hairline
            doubles as the list's top rule. */}
        <Tabs
          className="mt-3"
          railClassName="px-1 sm:px-3"
          tabs={[
            { key: 'open' as const, label: 'Open', count: openCount },
            { key: 'all' as const, label: 'All', count: list.length },
          ]}
          active={filter}
          onChange={setFilter}
          ariaLabel="Filter cases"
          idBase={tabsId}
        />

        <div
          role="tabpanel"
          id={tabPanelId(tabsId, filter)}
          aria-labelledby={tabId(tabsId, filter)}
        >
          {isGuest ? (
            // Fixture seeds belong to the demo identity — guests get a
            // sign-in prompt, never 'me' data.
            <EmptyState
              compact
              icon="folder"
              title="Sign in to see your cases"
              subtitle="Order issues, refunds and verification cases are tied to your account."
              actionLabel="Sign in"
              onAction={() => router.push('/auth')}
            />
          ) : visible.length > 0 ? (
            visible.map((ticket) => <TicketListRow key={ticket.id} ticket={ticket} />)
          ) : list.length > 0 ? (
            <EmptyState
              compact
              icon="folder"
              title="No open cases"
              subtitle="Everything is resolved — switch to All to see closed cases."
            />
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

      {/* Reports the viewer has filed — self-omits for guests, fixture
          mode, and empty histories. Lives in the main column under the
          resolution centre; the safety cases it references have no
          customer thread, so rows are read-only. */}
      <MyReportsSection />

      {/* Right rail on desktop — articles and contact compose beside
          the case list; on mobile the aside is a plain block so the
          sections keep their authored order. */}
      <aside className="lg:sticky lg:top-20 lg:self-start">

      {/* Popular articles */}
      <section aria-label="Popular articles" className="mt-10 px-4 sm:px-6 lg:mt-8">
        <h2 className="text-section-title font-semibold text-text-primary">Popular articles</h2>
        <div className="mt-3">
          <ArticleAccordion articles={POPULAR_ARTICLES} />
        </div>
      </section>

      {/* Contact — CTA reveals the inline form. Cases are account-bound,
          so guests sign in rather than open a case they can't track. */}
      {isGuest ? null : (
      <section
        aria-label="Contact support"
        className="mt-10 border-t border-border-subtle px-4 pt-6 sm:px-6"
      >
        {contactOpen ? (
          <NewTicketForm
            key={contactTopic ?? 'blank'}
            initialTopic={contactTopic}
            onCreated={handleCreated}
            onCancel={() => {
              setContactOpen(false);
              setContactTopic(undefined);
            }}
          />
        ) : (
          <div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-body-emphasis font-medium text-text-primary">Still need help?</p>
                <p className="mt-0.5 text-body text-text-secondary">
                  Open a case — we reply within one working day.
                </p>
              </div>
              <Button
                variant="secondary"
                size="md"
                icon="chat"
                onClick={() => {
                  setContactTopic(undefined);
                  setContactOpen(true);
                }}
              >
                Contact support
              </Button>
            </div>
            {/* Topic shortcuts — mirrors the mobile help categories; each
                opens the form with the topic preselected. */}
            <div className="mt-3 flex flex-wrap">
              {SUPPORT_TOPICS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setContactTopic(t.id);
                    setContactOpen(true);
                  }}
                  className="pressable inline-flex min-h-11 items-center pr-4 text-body text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
      )}

      {DATA_MODE !== 'live' ? (
        <p className="mt-10 flex items-center gap-1.5 px-4 text-caption text-text-muted sm:px-6">
          <Icon name="info" size={14} className="shrink-0" />
          Fixture mode — cases are stored for this session only and reset on reload.
        </p>
      ) : null}
      </aside>
      </div>
    </div>
  );
}
