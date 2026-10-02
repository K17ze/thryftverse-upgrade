'use client';

/**
 * /orders — purchases and sales in one list surface.
 *
 * Orchestrated with domain components (<400 LOC standard):
 *  - OrdersSearchBar
 *  - OrdersTabRail
 *  - OrdersListContent
 *  - OrdersFilterSheet
 *  - useOrdersListWorkflow
 */

import { Suspense, useEffect, useId } from 'react';
import { useSearchParams } from 'next/navigation';
import { IconButton } from '@/components/ui/IconButton';
import { OrdersTabRail, ORDERS_TABS, type OrdersTab } from '@/components/orders/OrdersTabRail';
import { tabId, tabPanelId } from '@/components/ui/Tabs';
import { OrdersFilterSheet, EMPTY_ORDERS_FILTER } from '@/components/orders/OrdersFilterSheet';
import { useOrdersListWorkflow } from '@/components/orders/list/useOrdersListWorkflow';
import { OrdersSearchBar } from '@/components/orders/list/OrdersSearchBar';
import { OrdersListContent } from '@/components/orders/list/OrdersListContent';

function isOrdersTab(value: string | null): value is OrdersTab {
  return !!value && ORDERS_TABS.some((t) => t.key === value);
}

/**
 * Deep link — /orders?tab=needs_action|active|completed|cancelled lands
 * on the matching segment. Isolated under Suspense so the search-param read never
 * deopts the page.
 */
function TabFromUrl({ onTab }: { onTab: (tab: OrdersTab) => void }) {
  const searchParams = useSearchParams();
  const param = searchParams.get('tab');
  useEffect(() => {
    if (isOrdersTab(param)) onTab(param);
  }, [param, onTab]);
  return null;
}

export default function OrdersPage() {
  const workflow = useOrdersListWorkflow();
  const tabsId = useId();

  const {
    user,
    sessionLoading,
    viewerId,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    rowById,
    tab,
    setTab,
    filter,
    setFilter,
    filterOpen,
    setFilterOpen,
    query,
    setQuery,
    refreshing,
    refreshFailed,
    counts,
    attentionItems,
    attentionMap,
    groups,
    visible,
    handleRefresh,
    statusOptions,
    availableYears,
    filterActive,
  } = workflow;

  return (
    <div className="mx-auto max-w-[820px] px-4 py-8 sm:px-6 lg:max-w-[1280px]">
      <Suspense fallback={null}>
        <TabFromUrl onTab={setTab} />
      </Suspense>

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-screen-title text-text-primary">Orders</h1>
        <div className="flex items-center gap-1">
          <IconButton
            name="refresh"
            aria-label="Refresh orders"
            onClick={handleRefresh}
            disabled={refreshing || isLoading}
            className={refreshing ? 'animate-spin' : undefined}
          />
          <IconButton
            name="filter"
            aria-label="Filter orders"
            onClick={() => setFilterOpen(true)}
            contained={filterActive}
          />
        </div>
      </div>

      <OrdersSearchBar
        query={query}
        onChange={setQuery}
        onClear={() => setQuery('')}
      />

      <div className="mt-4">
        <OrdersTabRail
          activeTab={tab}
          onChange={setTab}
          counts={counts}
          idBase={tabsId}
        />
      </div>

      {/* The rail's tabpanel — the whole list region swaps per tab. */}
      <div
        role="tabpanel"
        id={tabPanelId(tabsId, tab)}
        aria-labelledby={tabId(tabsId, tab)}
      >
      <OrdersListContent
        user={user}
        sessionLoading={sessionLoading}
        isLoading={isLoading}
        isError={isError}
        refreshFailed={refreshFailed}
        onRetry={handleRefresh}
        tab={tab}
        visible={visible}
        attentionItems={attentionItems}
        attentionMap={attentionMap}
        groups={groups}
        rowById={rowById}
        viewerId={viewerId}
        query={query}
        filterActive={filterActive}
        onClearQuery={() => setQuery('')}
        onClearFilters={() => setFilter(EMPTY_ORDERS_FILTER)}
        hasNextPage={hasNextPage}
        fetchNextPage={fetchNextPage}
        isFetchingNextPage={isFetchingNextPage}
        isFetchNextPageError={isFetchNextPageError}
      />
      </div>

      <OrdersFilterSheet
        open={filterOpen}
        currentFilter={filter}
        statusOptions={statusOptions}
        availableYears={availableYears}
        onApply={setFilter}
        onClose={() => setFilterOpen(false)}
      />
    </div>
  );
}
