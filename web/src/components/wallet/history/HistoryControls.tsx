import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import type { WalletLedgerAssetFilter } from '@/lib/api/services/walletLedger';
import { LEDGER_FILTERS, type LedgerFilter } from '../ledgerViewModel';

export type DateRangeFilter = 'all' | 'this_month' | 'last_30' | 'last_90';

export interface DateRangeOption {
  value: DateRangeFilter;
  label: string;
}

export const ASSET_FILTERS: { value: WalletLedgerAssetFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: '1ZE', label: '1ZE' },
  { value: 'FIAT', label: 'Fiat' },
];

interface HistoryControlsProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  dateRange: DateRangeFilter;
  onDateRangeChange: (value: DateRangeFilter) => void;
  dateRangeOptions: DateRangeOption[];
  onExportCsv: () => void;
  assetFilter: WalletLedgerAssetFilter;
  onAssetFilterChange: (value: WalletLedgerAssetFilter) => void;
  categoryFilter: LedgerFilter;
  onCategoryFilterChange: (value: LedgerFilter) => void;
  visibleCount: number;
  totalCount: number;
}

export function HistoryControls({
  searchQuery,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  dateRangeOptions,
  onExportCsv,
  assetFilter,
  onAssetFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  visibleCount,
  totalCount,
}: HistoryControlsProps) {
  return (
    // Below lg: toolbar row + two horizontal chip rails in document
    // order. At lg the whole control set is the sticky left rail of the
    // ledger layout — search, range, asset, type, export, count.
    <div className="lg:sticky lg:top-24">
      {/* Controls: Search, Date Range, Export */}
      <div className="mt-6 flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:mt-0 lg:flex-col lg:items-stretch lg:justify-start lg:px-0">
        <div className="relative flex-1 lg:flex-none">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute left-3 top-3 text-text-muted"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by description, item, or ID…"
            className="h-10 w-full rounded-md border border-border bg-input pl-9 pr-3 text-caption text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 lg:flex-col lg:items-stretch">
          {/* Date range dropdown */}
          <select
            value={dateRange}
            onChange={(e) => onDateRangeChange(e.target.value as DateRangeFilter)}
            className="h-10 rounded-md border border-border bg-surface-alt px-3 text-caption font-medium text-text-primary focus:border-brand focus:outline-none"
            aria-label="Filter by date range"
          >
            {dateRangeOptions.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>

          <Button variant="secondary" size="md" icon="download" onClick={onExportCsv}>
            Export CSV
          </Button>
        </div>
      </div>

      {/* Asset rail — native WalletHistoryScreen grammar (All / 1ZE /
          Fiat); drives the server-side ledger filter in live mode. At lg
          the chips stack as a labelled rail list. */}
      <div className="lg:mt-8">
        <p className="hidden pb-1.5 text-label text-text-muted lg:block">Asset</p>
        <div
          role="group"
          aria-label="Filter by asset"
          className="no-scrollbar mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:px-6 lg:mt-0 lg:flex-col lg:items-start lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {ASSET_FILTERS.map((f) => (
            <Chip
              key={f.value}
              selected={assetFilter === f.value}
              onClick={() => onAssetFilterChange(f.value)}
              aria-label={`Show ${f.label === 'All' ? 'all activity' : `${f.label} activity`}`}
            >
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Category chips rail — same grammar, the type filter. */}
      <div className="lg:mt-6">
        <p className="hidden pb-1.5 text-label text-text-muted lg:block">Type</p>
        <div
          role="group"
          aria-label="Filter transactions"
          className="no-scrollbar mt-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:px-6 lg:mt-0 lg:flex-col lg:items-start lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {LEDGER_FILTERS.map((f) => (
            <Chip
              key={f.value}
              selected={categoryFilter === f.value}
              onClick={() => onCategoryFilterChange(f.value)}
              aria-label={`Show ${f.label.toLowerCase()}`}
            >
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Transaction Count Indicator */}
      <div className="mt-4 px-4 text-caption text-text-muted sm:px-6 lg:mt-8 lg:px-0">
        Showing <span className="tnum font-medium text-text-primary">{visibleCount}</span> of{' '}
        <span className="tnum font-medium text-text-primary">{totalCount}</span> transaction{totalCount === 1 ? '' : 's'}
      </div>
    </div>
  );
}
