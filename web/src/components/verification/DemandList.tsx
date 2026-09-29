'use client';

/**
 * DemandList — the seller verification-demand inbox (/verification/demands).
 * Port of the mobile SellerVerificationScreen: a summary strip (pending vs
 * total), an "Action required" section of pending demands, then history.
 * Every status the wire can send has a badge; pending rows carry the
 * deadline and the respond affordance. Flat canvas + hairlines throughout.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AppImage } from '@/components/ui/AppImage';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import type { SellerVerificationDemand } from '@/lib/contracts/verification';
import { useSession } from '@/lib/session/SessionProvider';
import { useVerificationDemands } from '@/lib/hooks/verification-queries';
import {
  demandBadgeLabel,
  demandDeadlineText,
  demandStatusMeta,
  demandTypeLabel,
  isDemandOverdue,
} from './demandModel';

// ── Row ─────────────────────────────────────────────────────────────────────

function DemandRow({ demand, isLast }: { demand: SellerVerificationDemand; isLast: boolean }) {
  const overdue = isDemandOverdue(demand);
  const meta = demandStatusMeta(demand.status);
  const deadlineText = demandDeadlineText(demand);

  return (
    <li className={isLast ? '' : 'border-b border-border-subtle'}>
      <Link
        href={`/verification/demands/${demand.id}`}
        aria-label={`${demandTypeLabel(demand.demandType)} — ${demand.assetTitle}, ${
          overdue ? 'overdue' : meta.label.toLowerCase()
        }`}
        className="pressable block px-1 py-4"
      >
        <div className="flex items-center gap-3">
          <AppImage
            src={demand.assetImageUrl}
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 shrink-0 overflow-hidden rounded-md"
            fallbackIcon="image"
          />
          <div className="min-w-0 flex-1">
            <p className="clamp-1 text-body-emphasis font-medium text-text-primary">
              {demand.assetTitle}
            </p>
            <p className="mt-0.5 text-meta text-text-secondary">
              {demandTypeLabel(demand.demandType)}
            </p>
          </div>
          {/* Status + deadline become real columns at lg — inbox-table
              grammar instead of a stacked card. */}
          <span className="hidden w-40 shrink-0 lg:block">
            <Badge
              variant={overdue ? 'danger' : meta.badge}
              icon={overdue ? 'warning' : meta.icon}
            >
              {demandBadgeLabel(demand)}
            </Badge>
          </span>
          <span
            className={`tnum hidden w-40 shrink-0 text-right text-meta lg:block ${
              deadlineText &&
              (demand.status === 'failed' || overdue)
                ? 'text-danger-text'
                : 'text-text-muted'
            }`}
          >
            {deadlineText ?? ''}
          </span>
          <Icon name="forward" size={18} className="shrink-0 text-text-muted" />
        </div>

        <div className="ml-14 mt-2 flex items-center justify-between gap-3 lg:hidden">
          <Badge
            variant={overdue ? 'danger' : meta.badge}
            icon={overdue ? 'warning' : meta.icon}
          >
            {demandBadgeLabel(demand)}
          </Badge>
          {deadlineText ? (
            <span
              className={`text-meta ${
                demand.status === 'failed' || overdue
                  ? 'text-danger-text'
                  : 'text-text-muted'
              }`}
            >
              {deadlineText}
            </span>
          ) : null}
        </div>

        {demand.status === 'pending' ? (
          <div
            className={`ml-14 mt-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 ${
              overdue ? 'bg-danger-subtle' : 'bg-surface-alt'
            }`}
          >
            <Icon
              name={overdue ? 'warning' : 'forward'}
              size={15}
              className={overdue ? 'text-danger-text' : 'text-text-primary'}
            />
            <span
              className={`text-meta ${
                overdue ? 'text-danger-text' : 'text-text-primary'
              }`}
            >
              {overdue
                ? 'Deadline passed — recourse may be triggered'
                : 'Open to upload evidence and respond'}
            </span>
          </div>
        ) : null}
      </Link>
    </li>
  );
}

// ── States ──────────────────────────────────────────────────────────────────

function DemandListSkeleton() {
  return (
    <div aria-busy aria-label="Loading verification requests">
      <div className="flex items-center justify-center gap-10 py-5">
        <Skeleton className="h-12 w-24 rounded-md" />
        <Skeleton className="h-12 w-24 rounded-md" />
      </div>
      <div className="border-t border-border-subtle">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-border-subtle py-4">
            <Skeleton className="h-11 w-11 rounded-md" />
            <div className="flex-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-2 h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── View ────────────────────────────────────────────────────────────────────

export function DemandList() {
  const router = useRouter();
  const { isGuest } = useSession();
  const { data: demands, isLoading, isError, refetch } = useVerificationDemands();

  useEffect(() => {
    if (isGuest) router.replace('/auth');
  }, [isGuest, router]);

  if (isGuest) return null;

  const all = demands ?? [];
  const pending = all.filter((d) => d.status === 'pending');
  const history = all.filter((d) => d.status !== 'pending');

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-16 sm:px-6 lg:max-w-[1024px]">
      <div className="flex items-center pt-2 md:pt-6">
        <IconButton
          name="back"
          aria-label="Back to verification"
          onClick={() => router.push('/verification')}
          className="-ml-2"
        />
        <h1 className="ml-1 text-screen-title text-text-primary">
          Verification requests
        </h1>
      </div>

      {isLoading ? (
        <DemandListSkeleton />
      ) : isError ? (
        <EmptyState
          icon="alert"
          title="Could not load requests"
          subtitle="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void refetch()}
        />
      ) : all.length === 0 ? (
        <EmptyState
          icon="shieldCheck"
          title="No verification requests"
          subtitle="Requests for proof on your Co-Own assets will appear here."
        />
      ) : (
        <>
          {/* Summary strip — pending count dominates, like the mobile banner. */}
          <div className="mt-4 flex items-center justify-center gap-10 py-4">
            <div className="text-center">
              <p
                className={`tnum text-price-hero font-bold ${
                  pending.length > 0 ? 'text-warning-text' : 'text-text-primary'
                }`}
              >
                {pending.length}
              </p>
              <p className="mt-1 text-meta tracking-wide text-text-muted">
                {pending.length === 1 ? 'pending request' : 'pending requests'}
              </p>
            </div>
            <span className="h-8 w-px bg-border-subtle" aria-hidden />
            <div className="text-center">
              <p className="tnum text-price-hero font-bold text-text-primary">{all.length}</p>
              <p className="mt-1 text-meta tracking-wide text-text-muted">total</p>
            </div>
          </div>

          {pending.length > 0 ? (
            <section aria-label="Action required" className="mt-4">
              <h2 className="text-label text-text-secondary">Action required</h2>
              <ul className="mt-1 border-y border-border-subtle">
                {pending.map((d, i) => (
                  <DemandRow key={d.id} demand={d} isLast={i === pending.length - 1} />
                ))}
              </ul>
            </section>
          ) : null}

          {history.length > 0 ? (
            <section aria-label="History" className="mt-6">
              <h2 className="text-label text-text-secondary">History</h2>
              <ul className="mt-1 border-y border-border-subtle">
                {history.map((d, i) => (
                  <DemandRow key={d.id} demand={d} isLast={i === history.length - 1} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

// ── Entry row — rendered on /verification when demands exist ────────────────

/**
 * The status-surface entry point. Renders nothing when the seller has no
 * demands; otherwise a flat row with the pending count as a warning badge.
 */
export function DemandsEntryRow() {
  const { data: demands, isLoading } = useVerificationDemands();
  if (isLoading || !demands || demands.length === 0) return null;
  const pending = demands.filter((d) => d.status === 'pending').length;

  return (
    <div className="mt-8 border-t border-border-subtle pt-6">
      <Link
        href="/verification/demands"
        className="pressable -mx-1 flex min-h-12 items-center gap-3.5 rounded-md px-1 py-3"
      >
        <Icon name="document" size={20} className="shrink-0 text-text-secondary" />
        <span className="min-w-0 flex-1">
          <span className="block text-body-emphasis font-medium text-text-primary">
            Verification requests
          </span>
          <span className="block text-caption text-text-muted">
            {pending > 0
              ? `${pending} waiting on your evidence`
              : 'Proof requests on your Co-Own assets'}
          </span>
        </span>
        {pending > 0 ? (
          <Badge variant="warning" icon="clock">
            {pending}
          </Badge>
        ) : null}
        <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
      </Link>
    </div>
  );
}
