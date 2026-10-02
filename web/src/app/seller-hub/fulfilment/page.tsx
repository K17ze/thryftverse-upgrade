'use client';

/**
 * /seller-hub/fulfilment — the dispatch queue. To post / Posted / Delivered
 * tabs over flat hairline rows; "Mark posted" is optimistic with a generated
 * tracking number, "Print label" opens the printable label sheet (fixture
 * mode mints the tracking number once and keeps it). Overdue deadlines
 * take the danger accent. Skeleton, per-tab empty states.
 */

import { useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SellerSectionNav } from '@/components/seller/SellerSectionNav';
import { FulfilmentRow } from '@/components/seller/FulfilmentRow';
import { DispatchSheet } from '@/components/orders/DispatchSheet';
import { DispatchExtensionSheet } from '@/components/seller/DispatchExtensionSheet';
import { Tabs, tabId, tabPanelId } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ApiRequestError, isRecord } from '@/lib/api/http';
import {
  useAssertHandoff,
  useFulfilmentQueue,
  useMarkPosted,
  useProposeDispatchExtension,
} from '@/lib/hooks/seller-queries';
import type { FulfilmentJob } from '@/lib/data/fixtures-seller';

type Tab = 'to-post' | 'posted' | 'delivered';

// Tab badges mirror the mobile fulfilment header counts.
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
  const router = useRouter();
  const { show } = useToast();
  const { data: jobs, isLoading, isError, refetch } = useFulfilmentQueue();
  const markPosted = useMarkPosted();
  const proposeExtension = useProposeDispatchExtension();
  const assertHandoff = useAssertHandoff();
  const [tab, setTab] = useState<Tab>('to-post');
  const tabsId = useId();
  /** The job the dispatch sheet is collecting tracking for — null closed. */
  const [dispatchJob, setDispatchJob] = useState<FulfilmentJob | null>(null);
  /** The job the extension sheet is proposing extra days for — null closed. */
  const [extensionJob, setExtensionJob] = useState<FulfilmentJob | null>(null);

  const visible = useMemo(() => (jobs ?? []).filter((j) => j.stage === tab), [jobs, tab]);
  const counts = useMemo(
    () => ({
      'to-post': (jobs ?? []).filter((j) => j.stage === 'to-post').length,
      posted: (jobs ?? []).filter((j) => j.stage === 'posted').length,
      delivered: (jobs ?? []).filter((j) => j.stage === 'delivered').length,
    }),
    [jobs],
  );

  const submitPosted = (input: {
    jobId: string;
    trackingNumber?: string;
    carrier?: string;
  }) => {
    markPosted.mutate(input, {
      onSuccess: (job) => {
        const tracking = job?.trackingNumber ?? input.trackingNumber;
        show(
          tracking ? `Marked posted — tracking ${tracking}` : 'Marked posted',
          'success',
        );
      },
      onError: (err) =>
        show(
          err instanceof Error && err.message === 'TRACKING_REQUIRED'
            ? 'Add the tracking number to mark this posted'
            : 'Could not mark posted — try again',
          'error',
        ),
    });
  };

  /**
   * Mark posted — POST /orders/:id/ship rejects a bare call
   * (TRACKING_REQUIRED), so a job with no reference anywhere opens the
   * dispatch sheet to collect one; a job the label path already stamped
   * dispatches directly with its own tracking.
   */
  const markJobPosted = (job: FulfilmentJob) => {
    if (job.trackingNumber) {
      submitPosted({
        jobId: job.id,
        trackingNumber: job.trackingNumber,
        carrier: job.service || undefined,
      });
      return;
    }
    setDispatchJob(job);
  };

  /**
   * Seller drop-off claim — POST /orders/:id/fulfilment/handoff-assertion.
   * The parcel is already with the carrier but no scan has landed, so the
   * ship write can't run; this records the claim as a parcel event and
   * the row keeps saying "waiting for the carrier scan" — it never marks
   * the job posted. Whatever tracking/carrier the job already holds
   * travels with the claim.
   */
  const submitHandoff = (input: {
    jobId: string;
    trackingNumber?: string;
    carrier?: string;
    labelUrl?: string;
  }) => {
    assertHandoff.mutate(input, {
      onSuccess: () =>
        show('Handoff recorded — waiting for the carrier scan to confirm tracking.', 'success'),
      onError: (err) =>
        show(
          err instanceof ApiRequestError &&
            isRecord(err.details) &&
            typeof err.details.error === 'string'
            ? err.details.error
            : err instanceof Error && err.message === 'HANDOFF_UNAVAILABLE'
              ? 'This order is no longer awaiting dispatch.'
              : 'Could not record the handoff — try again',
          'error',
        ),
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12 lg:max-w-[1440px]">
      <h1 className="text-screen-title text-text-primary">Fulfilment</h1>
      <SellerSectionNav toPost={counts['to-post']} posted={counts.posted} />

      <Tabs<Tab>
        className="-mx-4 mt-6 sm:-mx-6"
        railClassName="px-1 sm:px-3"
        tabs={TABS.map((t) => ({
          key: t.value,
          label: t.label,
          count: counts[t.value],
        }))}
        active={tab}
        onChange={setTab}
        ariaLabel="Fulfilment stages"
        idBase={tabsId}
      />

      <div
        className="mt-4"
        role="tabpanel"
        id={tabPanelId(tabsId, tab)}
        aria-labelledby={tabId(tabsId, tab)}
      >
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
          <>
          {/* Column header — desktop table grammar; mirrors the row
              geometry (56px thumb, flex item, w-36 service, w-24 status,
              fixed action/tracking cell). Visual signpost only. */}
          <div
            aria-hidden="true"
            className="hidden items-center gap-3.5 border-b border-border-subtle pb-2 lg:flex"
          >
            <span className="w-14 shrink-0" />
            <span className="min-w-0 flex-1 text-label text-text-muted">
              Item
            </span>
            <span className="w-36 shrink-0 text-label text-text-muted">
              {tab === 'to-post' ? 'Service · ship by' : 'Service'}
            </span>
            <span className="w-24 shrink-0 text-label text-text-muted">
              Status
            </span>
            <span className="w-[240px] shrink-0 text-right text-label text-text-muted">
              {tab === 'to-post' ? 'Actions' : 'Tracking'}
            </span>
          </div>
          <ul className="divide-y divide-border-subtle border-y border-border-subtle lg:border-t-0">
            {visible.map((job) => (
              <FulfilmentRow
                key={job.id}
                job={job}
                onPrintLabel={(j) =>
                  router.push(`/seller-hub/fulfilment/label?job=${encodeURIComponent(j.id)}`)
                }
                onMarkPosted={markJobPosted}
                onExtendDeadline={(j) => setExtensionJob(j)}
                onAssertHandoff={(j) =>
                  submitHandoff({
                    jobId: j.id,
                    trackingNumber: j.trackingNumber,
                    carrier: j.service || undefined,
                  })
                }
                isMarking={markPosted.isPending || assertHandoff.isPending}
              />
            ))}
          </ul>
          </>
        )}
      </div>

      {/* Tracking collection — the same DispatchSheet the order detail
          uses: POST /orders/:id/ship needs a real reference + carrier. */}
      <DispatchSheet
        open={dispatchJob != null}
        defaultCarrier={dispatchJob?.service || null}
        busy={markPosted.isPending || assertHandoff.isPending}
        onSubmit={({ trackingNumber, carrier }) => {
          const job = dispatchJob;
          setDispatchJob(null);
          if (job) {
            submitPosted({ jobId: job.id, trackingNumber, carrier });
          }
        }}
        /* The sheet's recovery path — seller already dropped the parcel
           off; record the claim with whatever was typed. */
        onAssertHandoff={({ trackingNumber, carrier }) => {
          const job = dispatchJob;
          setDispatchJob(null);
          if (job) {
            submitHandoff({ jobId: job.id, trackingNumber, carrier });
          }
        }}
        onClose={() => setDispatchJob(null)}
      />

      {/* Dispatch extension — the seller proposes extra days; the server
          gates on 'paid' and one pending proposal at a time, and the new
          ship-by only takes effect if the buyer accepts. Errors surface
          the server's own message (409 pending / cap / status) verbatim. */}
      <DispatchExtensionSheet
        open={extensionJob != null}
        shipBy={extensionJob?.shipBy ?? null}
        busy={proposeExtension.isPending}
        onSubmit={({ days, note }) => {
          const job = extensionJob;
          setExtensionJob(null);
          if (!job) return;
          proposeExtension.mutate(
            { jobId: job.id, days, note },
            {
              onSuccess: () =>
                show('Extension request sent to the buyer', 'success'),
              onError: (err) =>
                show(
                  err instanceof ApiRequestError &&
                    isRecord(err.details) &&
                    typeof err.details.error === 'string'
                    ? err.details.error
                    : 'Could not send the request — try again',
                  'error',
                ),
            },
          );
        }}
        onClose={() => setExtensionJob(null)}
      />
    </div>
  );
}
