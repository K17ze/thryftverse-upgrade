'use client';

/**
 * ActivityTab — the trade ledger for this asset (the public tape), its
 * distribution history and open corporate actions. Non-trade events
 * (tranche listings, vote milestones) stay as a quiet notices list.
 * Votes are session-local: one tap, then locked.
 */

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import type {
  ActivityEvent,
  CorporateAction,
  Distribution,
  TradeLedgerEntry,
} from '@/lib/contracts/coown';
import { formatDate, timeAgo } from '@/lib/utils/format';
import { gbp } from '../format';
import { TradeLedger } from './TradeLedger';

const KIND_ICON: Record<ActivityEvent['kind'], AppIconName> = {
  buy: 'arrowUp',
  sell: 'tag',
  listing: 'layers',
  distribution: 'payout',
  corporate_action: 'document',
};

const DIST_LABEL = {
  rental_income: 'Rental income',
  resale_gain: 'Resale gain',
  licensing: 'Licensing',
} as const;

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function eventTitle(e: ActivityEvent): string {
  switch (e.kind) {
    case 'buy':
    case 'sell':
      return e.actorUsername
        ? `@${e.actorUsername} ${e.kind === 'buy' ? 'bought' : 'sold'}${e.units != null ? ` ${e.units}` : ''}${e.unitPriceGbp != null ? ` @ ${gbp(e.unitPriceGbp)}` : ''}`
        : e.note ?? 'Trade';
    case 'listing':
      return e.note ?? (e.units != null ? `${e.units} units listed` : 'Tranche listed');
    case 'distribution':
      return e.note ?? 'Distribution paid';
    case 'corporate_action':
      return e.note ?? 'Corporate action';
  }
}

export function ActivityTab({
  events,
  ledger,
  distributions,
  actions,
}: {
  events: ActivityEvent[] | undefined;
  ledger: TradeLedgerEntry[] | undefined;
  distributions: Distribution[] | undefined;
  actions: CorporateAction[] | undefined;
}) {
  const [votes, setVotes] = useState<Record<string, 'for' | 'against'>>({});

  const castVote = (id: string, vote: 'for' | 'against') =>
    setVotes((prev) => (prev[id] ? prev : { ...prev, [id]: vote }));

  // Trades live in the ledger; the notices list keeps everything else.
  const notices = events?.filter((e) => e.kind !== 'buy' && e.kind !== 'sell');

  return (
    <div className="grid gap-12 lg:grid-cols-2">
      <TradeLedger entries={ledger} />

      <div className="space-y-12">
        <section aria-labelledby="distributions-heading">
          <h3 id="distributions-heading" className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
            Distributions
          </h3>
          {distributions === undefined ? (
            <div className="mt-3 space-y-1.5" aria-hidden="true">
              {[0, 1].map((i) => (
                <div key={i} className="skeleton h-9 rounded-sm" />
              ))}
            </div>
          ) : distributions.length === 0 ? (
            <p className="mt-3 text-body text-text-secondary">
              No distributions yet — income lands here when the asset pays out.
            </p>
          ) : (
            <ul className="mt-1 divide-y divide-border-subtle border-y border-border-subtle">
              {distributions.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-body text-text-primary">{DIST_LABEL[d.kind]}</p>
                    <p className="mt-0.5 text-meta text-text-muted tnum">
                      {formatDate(d.paidAt ?? d.scheduledFor)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-body-emphasis font-semibold text-text-primary tnum">
                      {gbp(d.amountPerUnitGbp)}
                      <span className="ml-1 text-meta font-normal text-text-secondary">/unit</span>
                    </p>
                    <Badge variant={d.status === 'paid' ? 'success' : 'warning'} className="mt-1">
                      {d.status === 'paid' ? 'Paid' : 'Scheduled'}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="actions-heading">
          <h3 id="actions-heading" className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
            Corporate actions
          </h3>
          {actions === undefined ? (
            <div className="mt-3 space-y-1.5" aria-hidden="true">
              {[0, 1].map((i) => (
                <div key={i} className="skeleton h-24 rounded-lg" />
              ))}
            </div>
          ) : actions.length === 0 ? (
            <p className="mt-3 text-body text-text-secondary">No open actions.</p>
          ) : (
            <ul className="mt-3 space-y-6">
              {actions.map((a) => {
                const voted = votes[a.id] ?? a.yourVote;
                const locked = voted != null;
                const forCount = a.votesFor + (voted === 'for' && a.yourVote !== 'for' ? 1 : 0);
                const againstCount =
                  a.votesAgainst + (voted === 'against' && a.yourVote !== 'against' ? 1 : 0);
                return (
                  <article key={a.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h4 className="text-body-emphasis font-semibold text-text-primary">{a.title}</h4>
                      <span className="text-meta text-text-muted tnum">
                        Closes {shortDate(a.closesAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-body text-text-secondary">{a.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant={voted === 'for' ? 'primary' : 'outline'}
                        disabled={locked}
                        aria-pressed={voted === 'for'}
                        onClick={() => castVote(a.id, 'for')}
                      >
                        For · {forCount}
                      </Button>
                      <Button
                        size="sm"
                        variant={voted === 'against' ? 'secondary' : 'outline'}
                        disabled={locked}
                        aria-pressed={voted === 'against'}
                        onClick={() => castVote(a.id, 'against')}
                      >
                        Against · {againstCount}
                      </Button>
                      {locked ? (
                        <span className="text-meta text-text-muted">
                          You voted {voted}
                        </span>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </ul>
          )}
        </section>

        {notices != null && notices.length > 0 ? (
          <section aria-labelledby="notices-heading">
            <h3 id="notices-heading" className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
              Market notices
            </h3>
            <ul className="mt-1 divide-y divide-border-subtle">
              {notices.map((e) => (
                <li key={e.id} className="flex items-start gap-3 py-3">
                  <Icon
                    name={KIND_ICON[e.kind]}
                    size={17}
                    className="mt-0.5 shrink-0 text-text-secondary"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="clamp-1 text-body text-text-primary">{eventTitle(e)}</p>
                    {e.kind === 'listing' && e.units != null && e.unitPriceGbp != null ? (
                      <p className="mt-0.5 text-meta text-text-secondary tnum">
                        {e.units} units @ {gbp(e.unitPriceGbp)}
                      </p>
                    ) : null}
                  </div>
                  <time className="shrink-0 pt-0.5 text-meta text-text-muted tnum" dateTime={e.at}>
                    {timeAgo(e.at)}
                  </time>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
