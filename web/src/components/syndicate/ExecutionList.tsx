'use client';

import { Icon, type AppIconName } from '@/components/ui/Icon';
import { gbp } from '@/components/coown/format';
import type { Syndicate } from '@/lib/contracts/syndicate';
import { timeAgo } from '@/lib/utils/format';

const KIND_ICON: Record<string, AppIconName> = {
  contribution: 'payout',
  purchase: 'cart',
  refund: 'refresh',
  note: 'info',
};

/** The pool's order history — contributions, executions and milestones,
 * newest first. One line per event, actors in plain text. */
export function ExecutionList({ syndicate }: { syndicate: Syndicate }) {
  const entries = [...syndicate.executions].sort((a, b) => b.at.localeCompare(a.at));

  if (entries.length === 0) {
    return <p className="py-6 text-body text-text-secondary">Nothing on the book yet.</p>;
  }

  return (
    <ul className="divide-y divide-border-subtle">
      {entries.map((e) => (
        <li key={e.id} className="flex items-start gap-3 py-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-alt text-text-muted">
            <Icon name={KIND_ICON[e.kind] ?? 'info'} size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body text-text-secondary">
              {e.kind === 'contribution' ? (
                <>
                  <span className="font-semibold text-text-primary">@{e.actorUsername}</span>
                  {' committed '}
                  <span className="font-semibold text-text-primary tnum">{gbp(e.amountGbp)}</span>
                </>
              ) : e.kind === 'purchase' ? (
                <>
                  <span className="font-semibold text-text-primary">
                    Pool buy executed{e.units != null ? ` — ${e.units} units` : ''}
                  </span>
                  {e.amountGbp != null ? (
                    <span className="tnum"> for {gbp(e.amountGbp)}</span>
                  ) : null}
                </>
              ) : e.kind === 'refund' ? (
                <>
                  <span className="font-semibold text-text-primary">
                    Refund{e.actorUsername ? ` to @${e.actorUsername}` : ''}
                  </span>
                  {e.amountGbp != null ? (
                    <span className="tnum"> {gbp(e.amountGbp)}</span>
                  ) : null}
                </>
              ) : (
                <span className="text-text-primary">{e.note}</span>
              )}
            </p>
            {e.note != null && e.kind !== 'note' ? (
              <p className="mt-0.5 text-meta text-text-secondary">{e.note}</p>
            ) : null}
            <p className="mt-0.5 text-meta text-text-muted">{timeAgo(e.at)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
