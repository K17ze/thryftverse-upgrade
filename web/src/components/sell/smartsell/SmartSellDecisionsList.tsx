'use client';

import { formatPrice, timeAgo } from '@/lib/utils/format';
import type { SmartSellDecisionRecord } from '@/lib/api/services/smartSell';

const DECISION_DOT: Record<SmartSellDecisionRecord['decision'], string> = {
  accept: 'bg-success-text',
  counter: 'bg-brand',
  escalate: 'bg-warning-text',
  decline: 'bg-text-muted',
};

function decisionLabel(d: SmartSellDecisionRecord): string {
  switch (d.decision) {
    case 'accept':
      return 'Accepted';
    case 'counter':
      return `Countered at ${d.counterPriceGbp != null ? formatPrice(d.counterPriceGbp) : '—'}`;
    case 'escalate':
      return 'Escalated to you';
    case 'decline':
      return 'Declined';
  }
}

export function SmartSellDecisionsList({
  decisions,
}: {
  decisions: SmartSellDecisionRecord[];
}) {
  if (decisions.length === 0) return null;

  return (
    <div className="mt-5">
      <h3 className="text-meta uppercase tracking-wide text-text-secondary">
        Recent decisions
      </h3>
      <ul className="mt-1 divide-y divide-border-subtle">
        {decisions.slice(0, 5).map((d) => (
          <li key={d.id} className="flex items-start justify-between gap-3 py-2.5">
            <span className="flex min-w-0 flex-1 items-start gap-2.5">
              <span
                aria-hidden
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DECISION_DOT[d.decision]}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-body tnum text-text-primary">
                  {decisionLabel(d)}
                  <span className="text-meta text-text-muted">
                    {' '}
                    · {timeAgo(d.createdAt)}
                  </span>
                </span>
                <span className="mt-0.5 block text-meta text-text-muted">
                  {d.reason}
                </span>
              </span>
            </span>
            <span className="tnum shrink-0 text-meta text-text-secondary">
              {formatPrice(d.netProceedsGbp)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
