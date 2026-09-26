'use client';

/**
 * /seller-hub/fulfilment — the dispatch queue. To post / Posted / Delivered
 * tabs over flat hairline rows; "Mark posted" is optimistic with a generated
 * tracking number, "Print label" simulates the printer handoff. Overdue
 * deadlines take the danger accent. Skeleton, per-tab empty states.
 */

import { useMemo, useState } from 'react';
import { SellerSectionNav } from '@/components/seller/SellerSectionNav';
import { FulfilmentRow } from '@/components/seller/FulfilmentRow';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useFulfilmentQueue, useMarkPosted } from '@/lib/hooks/seller-queries';

type Tab = 'to-post' | 'posted' | 'delivered';

const TABS: { value: Tab; label: string }[] = [
  { value: 'to-post', label: 'To post' },
  { value: 'posted', label: 'Posted' },
  { value: 'delivered', label: 'Delivered' },
];

const EMPTY_COPY: Record<Tab, { title: string; subtitle: string }> = {
  'to-post': {
    title: 'Nothing to post',
    subtitle: 'New sales land here with a 2-day dispatch window.',
  },
  posted: {
    title: 'Nothing in transit',
    subtitle: 'Mark an order posted and its tracking number shows here.',
  },
  delivered: {
    title: 'No deliveries yet',
    subtitle: 'Delivered orders land here once the carrier scans them through.',
  },
};

export default function FulfilmentPage() {
  const { data: jobs, isLoading, isError, refetch } = useFulfilmentQueue();
  const markPosted = useMarkPosted();
  const { show } = useToast();
  const [tab, setTab] = useState<Tab>('to-post');

  const visible = useMemo(() => (jobs ?? []).filter((j) => j.stage === tab), [jobs, tab]);
  const counts = useMemo(
    () => ({
      'to-post': (jobs ?? []).filter((j) => j.stage === 'to-post').length,
      posted: (jobs ?? []).filter((j) => j.stage === 'posted').length,
      delivered: (jobs ?? []).filter((j) => j.stage === 'delivered').length,
    }),
    [jobs],
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12">
      <h1 className="text-screen-title font-semibold text-text-primary">Fulfilment</h1>
      <SellerSectionNav />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          options={TABS}
          value={tab}
          onChange={setTab}
        />
        <p className="text-meta text-text-muted">
          {counts[tab]} order{counts[tab] === 1 ? '' : 's'}
        </p>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <ul className="divide-y divide-border-subtle border-y border-border-subtle" aria-busy aria-label="Loading dispatch queue">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3.5 py-3.5">
                <Skeleton className="h-14 w-14 rounded-md" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-1.5 h-3 w-28" />
                </div>
                <Skeleton className="hidden h-4 w-32 sm:block" />
                <Skeleton className="h-8 w-24" />
              </li>
            ))}
          </ul>
        ) : isError ? (
          <EmptyState
            icon="alert"
            title="Couldn't load the queue"
            subtitle="We couldn't reach your dispatch jobs. Try again in a moment."
            actionLabel="Retry"
            onAction={() => void refetch()}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={tab === 'to-post' ? 'box' : tab === 'posted' ? 'send' : 'check'}
            title={EMPTY_COPY[tab].title}
            subtitle={EMPTY_COPY[tab].subtitle}
          />
        ) : (
          <ul className="divide-y divide-border-subtle border-y border-border-subtle">
            {visible.map((job) => (
              <FulfilmentRow
                key={job.id}
                job={job}
                onPrintLabel={(j) => show(`Label for ${j.title} sent to your printer`, 'info')}
                onMarkPosted={(id) => markPosted.mutate(id)}
                isMarking={markPosted.isPending}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
