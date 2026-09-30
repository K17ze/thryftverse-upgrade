'use client';

import Link from 'next/link';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { LedgerRow } from '../LedgerList';
import type { WalletLedgerEntry, LedgerFilter } from '../ledgerViewModel';

const ACTIVITY_QUICK_FILTERS: { value: LedgerFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'sale', label: 'Sales' },
  { value: 'purchase', label: 'Purchases' },
  { value: 'topup', label: 'Deposits' },
  { value: 'withdrawal', label: 'Payouts' },
];

const PREVIEW_ROWS = 4;

interface WalletActivityHubProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activityFilter: LedgerFilter;
  onFilterChange: (f: LedgerFilter) => void;
  previewEntries: WalletLedgerEntry[];
  onSelectEntry: (entry: WalletLedgerEntry) => void;
}

export function WalletActivityHub({
  searchQuery,
  onSearchChange,
  activityFilter,
  onFilterChange,
  previewEntries,
  onSelectEntry,
}: WalletActivityHubProps) {
  return (
    <section aria-label="Activity hub" className="mt-10 lg:mt-10">
      <div className="flex items-baseline justify-between px-4 sm:px-6">
        <div>
          <h2 className="text-section-title font-semibold text-text-primary">
            Recent activity
          </h2>
          <p className="text-caption text-text-muted">
            Search and inspect transaction receipts
          </p>
        </div>
        <Link
          href="/wallet/history"
          className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
        >
          View full ledger →
        </Link>
      </div>

      {/* Search & Category Filter Controls */}
      <div className="mt-4 px-4 sm:px-6">
        <div className="relative flex items-center">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute left-3 text-text-muted"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search transactions by item or keyword…"
            className="h-10 w-full rounded-md border border-border bg-input pl-9 pr-3 text-caption text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="pressable absolute right-3 text-text-muted hover:text-text-primary"
            >
              <Icon name="close" size={14} />
            </button>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter activity">
          {ACTIVITY_QUICK_FILTERS.map((f) => (
            <Chip
              key={f.value}
              selected={activityFilter === f.value}
              onClick={() => onFilterChange(f.value)}
            >
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Interactive Ledger Rows with Click-to-Inspect */}
      {previewEntries.length > 0 ? (
        <ul className="mt-4 divide-y divide-border-subtle border-t border-border-subtle">
          {previewEntries.map((entry, i) => (
            <LedgerRow
              key={entry.id}
              entry={entry}
              desktopOnly={i >= PREVIEW_ROWS}
              onSelect={onSelectEntry}
            />
          ))}
        </ul>
      ) : (
        <div className="mt-8 px-4 py-8 text-center text-caption text-text-muted sm:px-6">
          <Icon name="search" size={24} className="mx-auto text-text-muted mb-2" />
          No transactions match &quot;{searchQuery}&quot;.
        </div>
      )}

      {/* Footer link to history for more */}
      <div className="mt-6 border-t border-border-subtle px-4 pt-4 sm:px-6">
        <Link
          href="/wallet/history"
          className="pressable inline-flex items-center gap-1.5 text-body-emphasis font-medium text-text-secondary hover:text-text-primary"
        >
          <span>Download official CSV &amp; statements</span>
          <Icon name="forward" size={15} />
        </Link>
      </div>
    </section>
  );
}
