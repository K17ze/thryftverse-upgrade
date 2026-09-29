'use client';

/**
 * Transactions — flat list grouped by date, hairline separators.
 * One icon per type (sale accent in coown-up), signed tabular amounts,
 * pending as a quiet chip. No cards. Header carries the "View all"
 * affordance into /wallet/history.
 */

import Link from 'next/link';
import type { Transaction } from '@/lib/contracts/domain';
import { Badge } from '@/components/ui/Badge';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { formatPrice, formatDate } from '@/lib/utils/format';

const TYPE_META: Record<
  Transaction['type'],
  { icon: AppIconName; iconClass: string }
> = {
  sale: { icon: 'arrowUp', iconClass: 'text-coown-up' },
  purchase: { icon: 'bag', iconClass: 'text-text-secondary' },
  withdrawal: { icon: 'payout', iconClass: 'text-text-secondary' },
  refund: { icon: 'repeat', iconClass: 'text-text-secondary' },
};

function groupByDate(transactions: Transaction[]): [string, Transaction[]][] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const key = t.date.slice(0, 10);
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }
  return Array.from(groups.entries());
}

interface TransactionListProps {
  transactions: Transaction[];
  currency: string;
}

export function TransactionList({ transactions, currency }: TransactionListProps) {
  const groups = groupByDate(transactions);

  return (
    <section aria-label="Transactions" className="mt-10">
      <div className="flex items-baseline justify-between px-4 sm:px-6">
        <h2 className="text-section-title font-semibold text-text-primary">Transactions</h2>
        <Link
          href="/wallet/history"
          className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
        >
          View all
        </Link>
      </div>

      <div className="mt-2">
        {groups.map(([day, items]) => (
          <div key={day}>
            <h3 className="px-4 pb-1 pt-5 text-label font-semibold uppercase tracking-wider text-text-muted sm:px-6">
              {formatDate(day)}
            </h3>
            <ul className="divide-y divide-border-subtle">
              {items.map((t) => {
                const meta = TYPE_META[t.type];
                const positive = t.amount > 0;
                return (
                  <li
                    key={t.id}
                    className="flex items-center gap-3.5 px-4 py-3.5 sm:px-6"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center">
                      <Icon name={meta.icon} size={19} className={meta.iconClass} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="clamp-1 text-body text-text-primary">{t.description}</p>
                      {t.status === 'pending' ? (
                        <Badge variant="warning" icon="clock" className="mt-1.5">
                          Pending
                        </Badge>
                      ) : null}
                    </div>
                    <span
                      className={`tnum shrink-0 text-body-emphasis font-semibold ${
                        positive ? 'text-coown-up' : 'text-text-primary'
                      }`}
                    >
                      {positive ? '+' : ''}
                      {formatPrice(t.amount, currency)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
