'use client';

/**
 * NotificationFilterSheet — the overflow category filter behind the
 * header's funnel affordance. Web port of the mobile
 * NotificationFilterSheet: a selection list, not a settings catalogue —
 * label left, truthful count + checkmark right. Counts are the caller's
 * own dataset derivation (notificationFilterCounts), so a filter with
 * nothing behind it renders no number rather than a fabricated badge.
 */

import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import {
  NOTIFICATION_OVERFLOW_FILTERS,
  type NotificationFilter,
} from './viewModel';

interface NotificationFilterSheetProps {
  open: boolean;
  onClose: () => void;
  activeFilter: NotificationFilter;
  counts: Record<NotificationFilter, number>;
  onSelect: (filter: NotificationFilter) => void;
}

export function NotificationFilterSheet({
  open,
  onClose,
  activeFilter,
  counts,
  onSelect,
}: NotificationFilterSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Filter notifications" maxWidth={400}>
      <ul className="flex flex-col px-3 pb-5 pt-1">
        {NOTIFICATION_OVERFLOW_FILTERS.map((f) => {
          const active = activeFilter === f.key;
          const count = counts[f.key] ?? 0;
          return (
            <li key={f.key}>
              <button
                type="button"
                aria-pressed={active}
                aria-label={`Filter: ${f.label}${count > 0 ? `, ${count} items` : ''}`}
                onClick={() => onSelect(f.key)}
                className={`pressable flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2.5 text-left ${
                  active ? 'bg-surface-alt' : ''
                }`}
              >
                <span
                  className={`text-body-emphasis ${
                    active ? 'font-semibold text-brand' : 'text-text-primary'
                  }`}
                >
                  {f.label}
                </span>
                <span className="flex items-center gap-2">
                  {count > 0 ? (
                    <span className="tnum text-meta text-text-muted">{count}</span>
                  ) : null}
                  {active ? (
                    <Icon name="check" size={16} className="text-brand" />
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
