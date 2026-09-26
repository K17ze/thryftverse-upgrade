'use client';

/**
 * FulfilmentRow — one dispatch job. Flat hairline row: item, buyer, paid,
 * service + deadline, then the stage action. Overdue takes the danger accent.
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatPrice, timeAgo } from '@/lib/utils/format';
import type { FulfilmentJob } from '@/lib/data/fixtures-seller';

export function FulfilmentRow({
  job,
  onPrintLabel,
  onMarkPosted,
  isMarking,
}: {
  job: FulfilmentJob;
  onPrintLabel: (job: FulfilmentJob) => void;
  onMarkPosted: (jobId: string) => void;
  isMarking?: boolean;
}) {
  const overdue = job.stage === 'to-post' && Date.parse(job.shipBy) < Date.now();
  const deadline = new Date(job.shipBy).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <li className="flex items-center gap-3.5 py-3">
      <Link
        href={`/item/${job.listingId}`}
        className="pressable relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-surface-alt"
        aria-label={`View ${job.title}`}
      >
        <AppImage src={job.thumb} alt={job.title} fill sizes="56px" className="h-full w-full" />
      </Link>

      <div className="min-w-0 flex-1">
        <p className="clamp-1 text-body-emphasis font-medium text-text-primary">{job.title}</p>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-meta text-text-muted">
          <span className="truncate">{job.buyer.name}</span>
          <span aria-hidden="true">·</span>
          <span className="tnum shrink-0">Paid {formatPrice(job.paid)}</span>
        </p>
      </div>

      <div className="hidden w-36 shrink-0 sm:block">
        <p className="text-meta text-text-secondary">{job.service}</p>
        <p
          className={`tnum mt-0.5 text-meta ${
            overdue ? 'font-semibold text-danger-text' : 'text-text-muted'
          }`}
        >
          {overdue ? `Past deadline · ${deadline}` : `Ship by ${deadline}`}
        </p>
      </div>

      {overdue ? (
        <Badge variant="danger" icon="warning" className="hidden shrink-0 md:inline-flex">
          Overdue
        </Badge>
      ) : null}

      <div className="flex shrink-0 items-center justify-end gap-2">
        {job.stage === 'to-post' ? (
          <>
            <Button variant="quiet" size="sm" onClick={() => onPrintLabel(job)}>
              Print label
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onMarkPosted(job.id)}
              disabled={isMarking}
            >
              Mark posted
            </Button>
          </>
        ) : job.stage === 'posted' ? (
          <span className="tnum hidden text-meta text-text-secondary md:inline">
            {job.trackingNumber}
          </span>
        ) : null}
        {job.stage === 'posted' ? (
          <span className="text-meta text-text-muted">Posted {job.postedAt ? timeAgo(job.postedAt) : ''}</span>
        ) : null}
        {job.stage === 'delivered' ? (
          <span className="text-meta text-success-text">Delivered {job.deliveredAt ? timeAgo(job.deliveredAt) : ''}</span>
        ) : null}
      </div>
    </li>
  );
}
