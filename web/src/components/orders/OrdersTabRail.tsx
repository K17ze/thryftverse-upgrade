'use client';

/**
 * OrdersTabRail — classification tabs for the orders list, port of mobile
 * OrdersTabRail semantics with the classification vocabulary the task
 * specifies (All / Needs action / Active / Completed / Cancelled). Renders
 * through the shared ui/Tabs primitive — hairline baseline, 2px ink
 * indicator, roving-tabindex keyboard. Counts are real because the list
 * is fully loaded client-side.
 */

import { Tabs } from '@/components/ui/Tabs';

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
  /** Tab↔tabpanel pairing base — the caller's useId() (see ui/Tabs). */
  idBase?: string;
}

export function OrdersTabRail({ activeTab, onChange, counts, idBase }: Props) {
  return (
    <Tabs
      tabs={ORDERS_TABS.map((t) => ({ ...t, count: counts?.[t.key] }))}
      active={activeTab}
      onChange={onChange}
      ariaLabel="Order categories"
      idBase={idBase}
      // Page container is px-4 sm:px-6 — bleed the hairline to the
      // screen edge while keeping the first label flush with content.
      className="-mx-4 sm:-mx-6"
      railClassName="px-1 sm:px-3"
    />
  );
}
