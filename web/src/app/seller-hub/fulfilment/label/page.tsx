'use client';

/**
 * /seller-hub/fulfilment/label?job=<id> — the printable shipping label.
 * Fixture mode mints the job's tracking number once on read (the same
 * reference "Mark posted" keeps), so the label, the queue and the posted
 * row stay one truth. Live mode never mints — it asks the server for the
 * order's real label artifact (POST /orders/:id/shipping-label) and
 * renders only what the carrier produced. window.print() does the real
 * handoff; a hosted label URL surfaces as a direct link.
 *
 * Print grammar: the page mounts a scoped stylesheet that strips the app
 * chrome (global header/footer/tab bar live outside this tree) and forces
 * the sheet monochrome, so a dark theme never prints light-on-white.
 * "Mark posted" completes the loop here so the seller doesn't have to
 * round-trip through the queue.
 */

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import * as commerceService from '@/lib/api/services/commerce';
import { shippingLabelFor, type ShippingLabel } from '@/lib/data/fixtures-seller';
import { useFulfilmentQueue, useMarkPosted } from '@/lib/hooks/seller-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { formatPrice } from '@/lib/utils/format';

function LabelSheet() {
  const router = useRouter();
  const { show } = useToast();
  const { user } = useSession();
  const params = useSearchParams();
  const jobId = params.get('job');
  // The job's live stage — the label page offers "Mark posted" only while
  // the job is still in the to-post lane.
  const { data: jobs, isLoading: jobsLoading } = useFulfilmentQueue();
  const job = (jobs ?? []).find((j) => j.id === jobId);
  const markPosted = useMarkPosted();

  // Live labels are server artifacts — POST /orders/:id/shipping-label is
  // idempotent and returns the real tracking number + hosted label URL.
  // Fixture mode mints the job's tracking number once on read (the same
  // reference "Mark posted" keeps). Never call the fixture mint live.
  const liveLabel = useQuery({
    queryKey: ['shipping-label', jobId],
    queryFn: () => commerceService.generateShippingLabel(jobId!),
    enabled: DATA_MODE === 'live' && !!jobId && !!job,
    retry: 1,
  });

  const labelUrl = DATA_MODE === 'live' ? (liveLabel.data?.shippingLabelUrl ?? null) : null;

  const label = useMemo<ShippingLabel | null>(() => {
    if (!jobId) return null;
    if (DATA_MODE === 'live') {
      if (!job || !liveLabel.data) return null;
      return {
        jobId,
        orderRef: jobId.toUpperCase(),
        service: job.service || 'Tracked delivery',
        trackingNumber: liveLabel.data.trackingNumber ?? job.trackingNumber ?? '',
        itemTitle: job.title,
        paid: job.paid,
        buyerName: job.buyer.name,
        sellerName: user?.username ?? 'you',
        shipBy: job.shipBy,
      };
    }
    return shippingLabelFor(jobId);
  }, [jobId, job, liveLabel.data, user?.username]);

  const loading =
    jobsLoading ||
    (DATA_MODE === 'live' && !!jobId && (job != null ? liveLabel.isLoading : false));

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-16 sm:px-6" aria-busy aria-label="Loading label">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-6 h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (!label) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-16 sm:px-6">
        <EmptyState
          icon="box"
          title="No label for this order"
          subtitle="Labels are generated for orders in your dispatch queue. This one may have been completed already."
          actionLabel="Back to fulfilment"
          onAction={() => router.push('/seller-hub/fulfilment')}
        />
      </div>
    );
  }

  const shipBy = new Date(label.shipBy).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const stillToPost = job?.stage === 'to-post';
  const markThisPosted = () => {
    if (!jobId) return;
    // The label IS the tracking artifact — post with the reference it
    // minted (live: the server label; fixture: the same number the queue
    // keeps) so shipOrder never fires bare and 422s.
    markPosted.mutate(
      {
        jobId,
        trackingNumber: label.trackingNumber || undefined,
        carrier: job?.service || label.service,
      },
      {
        onSuccess: (posted) =>
          show(
            posted?.trackingNumber
              ? `Marked posted — tracking ${posted.trackingNumber}`
              : 'Marked posted',
            'success',
          ),
        onError: () => show('Could not mark posted — try again', 'error'),
      },
    );
  };

  const rows: [string, string][] = [
    ['To', `@${label.buyerName}`],
    ['From', `@${label.sellerName} · ThryftVerse seller`],
    ['Item', `${label.itemTitle} — ${formatPrice(label.paid)}`],
    ['Order', label.orderRef],
  ];

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-8 sm:px-6">
      {/* Scoped print sheet — mounted only on this route. Hides the global
          chrome and flattens the label to ink-on-paper. */}
      <style>{`
        @media print {
          header, footer, nav { display: none !important; }
          body { background: #fff !important; }
          [data-print-label] { border-color: #999 !important; }
          [data-print-label] * {
            color: #111 !important;
            border-color: #ccc !important;
            background: transparent !important;
          }
        }
      `}</style>

      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href="/seller-hub/fulfilment"
          className="pressable inline-flex h-9 items-center gap-1.5 text-body font-medium text-text-secondary hover:text-text-primary"
        >
          <Icon name="back" size={16} />
          Fulfilment
        </Link>
        <div className="flex items-center gap-2">
          {stillToPost ? (
            <Button
              variant="secondary"
              size="md"
              onClick={markThisPosted}
              disabled={markPosted.isPending}
            >
              {markPosted.isPending ? 'Marking…' : 'Mark posted'}
            </Button>
          ) : null}
          <Button variant="primary" size="md" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      {/* The label — one flat sheet, readable at arm's length. */}
      <div data-print-label className="mt-6 rounded-lg border border-border p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-label text-text-muted">
              Shipping label
            </p>
            <p className="mt-1 text-item-title font-semibold text-text-primary">
              {label.service}
            </p>
          </div>
          <Icon name="box" size={28} className="shrink-0 text-text-muted" aria-hidden />
        </div>

        <div className="mt-6 border-y border-border-subtle py-5">
          <p className="text-label text-text-muted">
            Tracking number
          </p>
          <p className="tnum mt-1.5 text-display font-bold tracking-wide text-text-primary">
            {label.trackingNumber}
          </p>
          <p className="tnum mt-1.5 text-caption text-text-secondary">Ship by {shipBy}</p>
        </div>

        <dl className="mt-5">
          {rows.map(([k, v]) => (
            <div
              key={k}
              className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2.5 last:border-0"
            >
              <dt className="shrink-0 text-caption text-text-muted">{k}</dt>
              <dd className="clamp-1 text-right text-body font-medium text-text-primary">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {job?.stage === 'posted' ? (
        <p className="mt-4 flex items-center gap-1.5 text-caption text-success-text print:hidden">
          <Icon name="check" size={14} />
          Marked posted — this order is in the Posted lane.
        </p>
      ) : null}

      {labelUrl ? (
        <a
          href={labelUrl}
          target="_blank"
          rel="noreferrer"
          className="pressable mt-4 inline-flex items-center gap-1.5 text-caption font-semibold text-text-secondary underline underline-offset-2 hover:text-text-primary print:hidden"
        >
          <Icon name="document" size={14} />
          Open the carrier label (PDF)
        </a>
      ) : null}

      {DATA_MODE !== 'live' ? (
        <p className="mt-4 text-caption text-text-muted print:hidden">
          Demo mode — the label is generated locally; no carrier is charged. The tracking
          number is the same one recorded when you mark the order posted.
        </p>
      ) : null}
    </div>
  );
}

export default function ShippingLabelPage() {
  return (
    // Reads ?job=<id> via useSearchParams — boundary required for prerendering.
    <Suspense fallback={null}>
      <LabelSheet />
    </Suspense>
  );
}
