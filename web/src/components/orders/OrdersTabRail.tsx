'use client';

/**
 * OrdersTabRail — classification tabs for the orders list, port of mobile
 * OrdersTabRail semantics with the classification vocabulary the task
 * specifies (All / Needs action / Active / Completed / Cancelled). A single
 * sliding underline; counts are real because the list is fully loaded
 * client-side.
 */

export type OrdersTab = 'all' | 'needs_action' | 'active' | 'completed' | 'cancelled';

export const ORDERS_TABS: { key: OrdersTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'needs_action', label: 'Needs action' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

interface Props {
  activeTab: OrdersTab;
  onChange: (tab: OrdersTab) => void;
  /** Real per-tab counts (client-side list — always honest). */
  counts?: Partial<Record<OrdersTab, number>>;
}

export function OrdersTabRail({ activeTab, onChange, counts }: Props) {
  return (
    <div role="tablist" className="flex gap-6 border-b border-border-subtle">
      {ORDERS_TABS.map((tab) => {
        const active = activeTab === tab.key;
        const count = counts?.[tab.key];
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={`pressable relative pb-2.5 pt-1 text-body-emphasis font-medium ${
              active ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab.label}
            {count != null && count > 0 ? (
              <span className={`tnum ml-1.5 text-caption ${active ? 'text-text-secondary' : 'text-text-muted'}`}>
                {count}
              </span>
            ) : null}
            <span
              aria-hidden
              className={`absolute inset-x-0 -bottom-px h-0.5 rounded-full transition-opacity ${
                active ? 'bg-text-primary opacity-100' : 'opacity-0'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
