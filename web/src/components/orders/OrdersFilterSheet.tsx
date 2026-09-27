'use client';

/**
 * OrdersFilterSheet — port of mobile OrdersFilterSheet. Facets: role
 * (Buying / Selling), status (the concrete workflow states present in the
 * list) and year. Local draft state, Apply/Clear footer.
 */

import { useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';

export type OrderRoleFilter = 'all' | 'buying' | 'selling';

export interface OrdersFilterState {
  role: OrderRoleFilter;
  /** Normalised status keys — empty = no status restriction. */
  statuses: string[];
  year: number | null;
}

export const EMPTY_ORDERS_FILTER: OrdersFilterState = {
  role: 'all',
  statuses: [],
  year: null,
};

const ROLE_OPTIONS: { key: OrderRoleFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'buying', label: 'Buying' },
  { key: 'selling', label: 'Selling' },
];

interface Props {
  open: boolean;
  currentFilter: OrdersFilterState;
  /** Status options — normalised key + display label, derived from data. */
  statusOptions: { key: string; label: string }[];
  availableYears: number[];
  onApply: (filter: OrdersFilterState) => void;
  onClose: () => void;
}

export function OrdersFilterSheet({
  open,
  currentFilter,
  statusOptions,
  availableYears,
  onApply,
  onClose,
}: Props) {
  const [role, setRole] = useState<OrderRoleFilter>(currentFilter.role);
  const [statuses, setStatuses] = useState<string[]>(currentFilter.statuses);
  const [year, setYear] = useState<number | null>(currentFilter.year);

  useEffect(() => {
    if (open) {
      setRole(currentFilter.role);
      setStatuses(currentFilter.statuses);
      setYear(currentFilter.year);
    }
  }, [open, currentFilter]);

  const toggleStatus = (key: string) =>
    setStatuses((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key],
    );

  const handleApply = () => {
    onApply({ role, statuses, year });
    onClose();
  };

  const handleClear = () => {
    setRole('all');
    setStatuses([]);
    setYear(null);
  };

  const OptionRow = ({
    label, selected, onPress,
  }: { label: string; selected: boolean; onPress: () => void }) => (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPress}
      className="pressable flex min-h-11 w-full items-center justify-between py-3 text-left"
    >
      <span
        className={`text-body-emphasis ${
          selected ? 'font-semibold text-text-primary' : 'text-text-secondary'
        }`}
      >
        {label}
      </span>
      {selected ? <Icon name="check" size={18} className="text-text-primary" /> : null}
    </button>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Filter orders">
      <div className="px-5 pb-5">
        <p className="text-label font-medium uppercase tracking-wide text-text-muted">Role</p>
        <div className="flex flex-col">
          {ROLE_OPTIONS.map((opt) => (
            <OptionRow
              key={opt.key}
              label={opt.label}
              selected={role === opt.key}
              onPress={() => setRole(opt.key)}
            />
          ))}
        </div>

        {statusOptions.length > 0 ? (
          <>
            <p className="mt-4 text-label font-medium uppercase tracking-wide text-text-muted">
              Status
            </p>
            <div className="flex flex-col">
              {statusOptions.map((opt) => (
                <OptionRow
                  key={opt.key}
                  label={opt.label}
                  selected={statuses.includes(opt.key)}
                  onPress={() => toggleStatus(opt.key)}
                />
              ))}
            </div>
          </>
        ) : null}

        {availableYears.length > 0 ? (
          <>
            <p className="mt-4 text-label font-medium uppercase tracking-wide text-text-muted">
              Year
            </p>
            <div className="flex flex-col">
              <OptionRow label="All years" selected={year === null} onPress={() => setYear(null)} />
              {availableYears.map((y) => (
                <OptionRow
                  key={y}
                  label={String(y)}
                  selected={year === y}
                  onPress={() => setYear(y)}
                />
              ))}
            </div>
          </>
        ) : null}

        <div className="mt-5 flex gap-3 border-t border-border-subtle pt-4">
          <Button variant="outline" size="md" fullWidth onClick={handleClear}>
            Clear
          </Button>
          <Button variant="primary" size="md" fullWidth onClick={handleApply}>
            Apply
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
