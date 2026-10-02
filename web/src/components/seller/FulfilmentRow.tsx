'use client';

/**
 * FulfilmentRow — one dispatch job. Flat hairline row: item, buyer, paid,
 * service + deadline, then the stage action. Overdue takes the danger
 * accent. Posted/delivered rows keep the tracking number visible at every
 * width (it's the job's proof) with a copy affordance for the carrier app.
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatPrice, timeAgo } from '@/lib/utils/format';
import type { FulfilmentJob } from '@/lib/data/fixtures-seller';

export function FulfilmentRow({
  job,
  onPrintLabel,
  onMarkPosted,
  onExtendDeadline,
  onAssertHandoff,
  isMarking,
}: {
  job: FulfilmentJob;
  onPrintLabel: (job: FulfilmentJob) => void;
  /** The job travels with the action — the queue decides whether the row
   *  already carries tracking or must collect it first. */
  onMarkPosted: (job: FulfilmentJob) => void;
  /** Opens the extension sheet — only reachable while 'to-post' (the
   *  server's 'paid' gate) and absent once a proposal is pending. */
  onExtendDeadline?: (job: FulfilmentJob) => void;
  /** Seller drop-off claim — POST handoff-assertion. Reachable while
   *  'to-post' and not yet asserted; records evidence, never a status. */
  onAssertHandoff?: (job: FulfilmentJob) => void;
  isMarking?: boolean;
}) {
  const { show } = useToast();
  const overdue = job.stage === 'to-post' && Date.parse(job.shipBy) < Date.now();
  const deadline = new Date(job.shipBy).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const pending = job.pendingExtension ?? null;
  const pendingDeadline = pending?.proposedShipBy
    ? new Date(pending.proposedShipBy).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : null;

  const copyTracking = async () => {
    if (!job.trackingNumber) return;
    try {
      await navigator.clipboard.writeText(job.trackingNumber);
      show('Tracking number copied', 'success');
    } catch {
      show('Copy failed — select the number instead', 'error');
    }
  };

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
        {/* Deadline folds into meta below sm where the column collapses. */}
        {job.stage === 'to-post' ? (
          <p
            className={`tnum mt-0.5 text-meta sm:hidden ${
              overdue ? 'font-semibold text-danger-text' : 'text-text-muted'
            }`}
          >
            {overdue ? `Past deadline · ${deadline}` : `Ship by ${deadline}`}
          </p>
        ) : null}
      </div>

      <div className="hidden w-36 shrink-0 sm:block">
        <p className="text-meta text-text-secondary">{job.service}</p>
        {job.stage === 'to-post' ? (
          <p
            className={`tnum mt-0.5 text-meta ${
              overdue ? 'font-semibold text-danger-text' : 'text-text-muted'
            }`}
          >
            {overdue ? `Past deadline · ${deadline}` : `Ship by ${deadline}`}
          </p>
        ) : null}
      </div>

      {overdue ? (
        <Badge variant="danger" icon="warning" className="shrink-0 max-md:hidden lg:hidden">
          Overdue
        </Badge>
      ) : null}
      {/* Status slot — fixed-width column at lg so the action cell doesn't
          drift between overdue and on-time rows. */}
      <span className="hidden w-24 shrink-0 lg:block">
        {overdue ? (
          <Badge variant="danger" icon="warning">
            Overdue
          </Badge>
        ) : null}
      </span>

      <div className="flex shrink-0 items-center justify-end gap-2 lg:w-[240px]">
        {job.stage === 'to-post' ? (
          <span className="flex flex-col items-end gap-1.5">
            <span className="flex items-center gap-2">
              <Button variant="quiet" size="sm" onClick={() => onPrintLabel(job)}>
                Print label
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onMarkPosted(job)}
                disabled={isMarking}
              >
                Mark posted
              </Button>
            </span>
            {/* Extension affordance mirrors the native quiet toggle — while
                a proposal awaits the buyer the row states it instead of
                offering a second one. */}
            {pending ? (
              <span className="text-right text-meta text-text-muted">
                {pendingDeadline
                  ? `Extension requested · dispatch by ${pendingDeadline} · awaiting buyer`
                  : 'Extension requested · awaiting buyer'}
              </span>
            ) : onExtendDeadline ? (
              <button
                type="button"
                onClick={() => onExtendDeadline(job)}
                className="pressable -mb-0.5 rounded-md px-1.5 py-0.5 text-meta font-semibold text-text-secondary hover:text-text-primary"
              >
                Need more time?
              </button>
            ) : null}
            {/* Handoff claim — recorded? the row states the waiting-on-
                scan truth; not recorded? the recovery affordance opens
                the dispatch sheet's quiet path (the claim never moves
                the order to dispatched). */}
            {job.handoffAssertedAt ? (
              <span className="text-right text-meta text-text-muted">
                Dropped off — waiting for the carrier scan
              </span>
            ) : onAssertHandoff ? (
              <button
                type="button"
                onClick={() => onAssertHandoff(job)}
                disabled={isMarking}
                className="pressable -mb-0.5 rounded-md px-1.5 py-0.5 text-meta font-semibold text-text-secondary hover:text-text-primary disabled:opacity-50"
              >
                Already dropped off?
              </button>
            ) : null}
          </span>
        ) : (
          <span className="flex min-w-0 flex-col items-end">
            {job.trackingNumber ? (
              <button
                type="button"
                onClick={copyTracking}
                className="pressable tnum -my-1 rounded-md px-1.5 py-1 text-right text-meta text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
                aria-label={`Copy tracking number ${job.trackingNumber}`}
                title="Copy tracking number"
              >
                {job.trackingNumber}
              </button>
            ) : null}
            <span
              className={`tnum mt-0.5 text-meta ${
                job.stage === 'delivered' ? 'text-success-text' : 'text-text-muted'
              }`}
            >
              {job.stage === 'delivered'
                ? `Delivered ${job.deliveredAt ? timeAgo(job.deliveredAt) : ''}`
                : `Posted ${job.postedAt ? timeAgo(job.postedAt) : ''}`}
            </span>
          </span>
        )}
      </div>
    </li>
  );
}
