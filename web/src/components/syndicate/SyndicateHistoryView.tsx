'use client';

/**
 * /co-own/syndicate/history — port of the mobile order-history surface
 * (SyndicateOrderHistoryScreen) against the syndicate executions model:
 * one chronological feed of every contribution, pooled buy, refund and
 * note across the pools the viewer belongs to. Kind filters mirror the
 * mobile side/date toolbar; each row links back to its pool.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { gbp } from '@/components/coown/format';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import type { Syndicate, SyndicateExecution } from '@/lib/contracts/syndicate';
import { useCoOwnAssets } from '@/lib/hooks/coown-queries';
import { useSyndicates } from '@/lib/hooks/syndicate-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { timeAgo } from '@/lib/utils/format';

type Filter = 'all' | 'contribution' | 'purchase' | 'updates';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'contribution', label: 'Contributions' },
  { value: 'purchase', label: 'Buys' },
  { value: 'updates', label: 'Updates' },
];

const KIND_ICON: Record<string, AppIconName> = {
  contribution: 'payout',
  purchase: 'cart',
  refund: 'refresh',
  note: 'info',
};

const inFilter = (e: SyndicateExecution, f: Filter) =>
  f === 'all' ||
  e.kind === f ||
  (f === 'updates' && (e.kind === 'note' || e.kind === 'refund'));

interface FeedRow {
  execution: SyndicateExecution;
  syndicate: Syndicate;
  asset: CoOwnAsset | undefined;
}

/** One event line — the event, then pool · asset · time in meta. */
function eventText(e: SyndicateExecution): React.ReactNode {
  if (e.kind === 'contribution') {
    return (
      <>
        <span className="font-semibold text-text-primary">@{e.actorUsername}</span>
        {' committed '}
        <span className="font-semibold text-text-primary tnum">{gbp(e.amountGbp)}</span>
      </>
    );
  }
  if (e.kind === 'purchase') {
    return (
      <>
        <span className="font-semibold text-text-primary">
          Pool buy executed{e.units != null ? ` — ${e.units} units` : ''}
        </span>
        {e.amountGbp != null ? <span className="tnum"> for {gbp(e.amountGbp)}</span> : null}
      </>
    );
  }
  if (e.kind === 'refund') {
    return (
      <>
        <span className="font-semibold text-text-primary">
          Refund{e.actorUsername ? ` to @${e.actorUsername}` : ''}
        </span>
        {e.amountGbp != null ? <span className="tnum"> {gbp(e.amountGbp)}</span> : null}
      </>
    );
  }
  return <span className="text-text-primary">{e.note}</span>;
}

function HistorySkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 md:pt-10">
      <div className="skeleton h-4 w-24 rounded-sm" aria-hidden="true" />
      <div className="mt-4 skeleton h-9 w-40 rounded-sm" aria-hidden="true" />
      <div className="mt-8 flex gap-2" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-9 w-24 rounded-full" />
        ))}
      </div>
      <div className="mt-6 space-y-4" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-3 py-2">
            <div className="skeleton h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-2 pt-0.5">
              <div className="skeleton h-4 w-56 rounded-sm" />
              <div className="skeleton h-3 w-40 rounded-sm" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SyndicateHistoryView() {
  const router = useRouter();
  const { user } = useSession();
  const syndicatesQ = useSyndicates();
  const assetsQ = useCoOwnAssets();
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo<FeedRow[]>(() => {
    const assetById = new Map((assetsQ.data ?? []).map((a) => [a.id, a]));
    const out: FeedRow[] = [];
    for (const s of syndicatesQ.data ?? []) {
      if (!user || !s.members.some((m) => m.userId === user.id)) continue;
      for (const e of s.executions) {
        out.push({ execution: e, syndicate: s, asset: assetById.get(s.assetId) });
      }
    }
    out.sort((a, b) => b.execution.at.localeCompare(a.execution.at));
    return out;
  }, [syndicatesQ.data, assetsQ.data, user]);

  if (syndicatesQ.isLoading || assetsQ.isLoading) return <HistorySkeleton />;

  if (syndicatesQ.isError || assetsQ.isError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <EmptyState
          icon="receipt"
          title="Activity unavailable"
          subtitle="We couldn't verify your pool history. Try again when your connection is stable."
          actionLabel="Retry"
          onAction={() => {
            void syndicatesQ.refetch();
            void assetsQ.refetch();
          }}
        />
      </div>
    );
  }

  const visible = rows.filter((r) => inFilter(r.execution, filter));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 md:pt-10">
      <Link
        href="/co-own/syndicate"
        className="pressable inline-flex items-center gap-1.5 text-body font-medium text-text-secondary hover:text-text-primary"
      >
        <Icon name="back" size={16} />
        Syndicates
      </Link>

      <header className="mt-4">
        <h1 className="text-editorial-display text-text-primary">Activity</h1>
        <p className="mt-2 text-meta text-text-secondary">
          Orders and executions across your pools.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="mt-8 border-t border-border-subtle">
          <EmptyState
            icon="receipt"
            title="No pool activity yet"
            subtitle="Contributions, pooled buys and updates from your syndicates will appear here."
            actionLabel="Browse syndicates"
            onAction={() => router.push('/co-own/syndicate')}
          />
        </div>
      ) : (
        <>
          {/* Kind filter — same toolbar grammar as the mobile surface */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Filter activity">
              {FILTERS.map((f) => (
                <Chip key={f.value} selected={filter === f.value} onClick={() => setFilter(f.value)}>
                  {f.label}
                </Chip>
              ))}
            </div>
            <p className="text-meta text-text-muted tnum" aria-live="polite">
              {visible.length} {visible.length === 1 ? 'event' : 'events'}
            </p>
          </div>

          {visible.length === 0 ? (
            <p className="py-10 text-center text-body text-text-secondary">
              Nothing in this view.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle border-b border-border-subtle">
              {visible.map(({ execution: e, syndicate: s, asset }) => (
                <li key={`${s.id}-${e.id}`}>
                  <Link
                    href={`/co-own/syndicate/${s.id}`}
                    className="pressable flex items-start gap-3 px-1 py-3.5 transition-colors hover:bg-row"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-alt text-text-muted">
                      <Icon name={KIND_ICON[e.kind] ?? 'info'} size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-body text-text-secondary">{eventText(e)}</p>
                      {e.note != null && e.kind !== 'note' ? (
                        <p className="mt-0.5 text-meta text-text-secondary">{e.note}</p>
                      ) : null}
                      <p className="mt-1 text-meta text-text-muted">
                        <span className="font-medium text-text-secondary">{s.name}</span>
                        {asset ? ` · ${asset.title}` : ''} · {timeAgo(e.at)}
                      </p>
                    </div>
                    <Icon name="forward" size={16} className="mt-1.5 shrink-0 text-text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
