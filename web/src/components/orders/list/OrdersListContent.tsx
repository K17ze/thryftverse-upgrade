'use client';

import { useRouter } from 'next/navigation';
import { StateGate } from '@/components/flagship/StateGate';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { OrderRow } from '@/components/orders/OrderRow';
import { RowSkeleton } from '@/components/orders/RowSkeleton';
import type { OrdersTab } from '@/components/orders/OrdersTabRail';
import type { CommerceOrder, User } from '@/lib/contracts/domain';
import type { CommerceUserOrderApi } from '@/lib/api/mappers';
import type { OrderAttention } from '@/components/orders/orderCapabilities';
import { EMPTY_COPY, type DateGroup } from './useOrdersListWorkflow';

interface OrdersListContentProps {
  user: User | null;
  sessionLoading: boolean;
  isLoading: boolean;
  isError: boolean;
  refreshFailed: boolean;
  onRetry: () => void;
  tab: OrdersTab;
  visible: CommerceOrder[];
  attentionItems: { order: CommerceOrder; attention: OrderAttention }[];
  attentionMap: Map<string, OrderAttention>;
  groups: DateGroup[];
  rowById: Map<string, CommerceUserOrderApi>;
  viewerId: string;
  query: string;
  filterActive: boolean;
  onClearQuery: () => void;
  onClearFilters: () => void;
  hasNextPage?: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
}

export function OrdersListContent({
  user,
  sessionLoading,
  isLoading,
  isError,
  refreshFailed,
  onRetry,
  tab,
  visible,
  attentionItems,
  attentionMap,
  groups,
  rowById,
  viewerId,
  query,
  filterActive,
  onClearQuery,
  onClearFilters,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
}: OrdersListContentProps) {
  const router = useRouter();

  return (
    <StateGate
      domain="orders"
      className="mt-5"
      isLoading={sessionLoading || isLoading}
      isError={!!user && isError}
      stale={refreshFailed}
      skeleton={<RowSkeleton />}
      onRetry={onRetry}
    >
      {!user ? (
        <EmptyState
          icon="profile"
          title="Sign in to view your orders"
          subtitle="Purchases and sales are tied to your account."
          actionLabel="Sign in"
          onAction={() => router.push('/auth')}
        />
      ) : visible.length === 0 && (tab !== 'all' || attentionItems.length === 0) ? (
        <EmptyState
          icon={query ? 'search' : 'bag'}
          title={query ? 'No orders match your search' : EMPTY_COPY[tab].title}
          subtitle={
            query
              ? 'Try a different item name, order number or seller.'
              : filterActive
                ? 'No orders match these filters.'
                : EMPTY_COPY[tab].subtitle
          }
          actionLabel={
            query || filterActive
              ? query
                ? 'Clear search'
                : 'Clear filters'
              : tab === 'all'
                ? 'Start shopping'
                : undefined
          }
          onAction={
            query
              ? onClearQuery
              : filterActive
                ? onClearFilters
                : tab === 'all'
                  ? () => router.push('/explore')
                  : undefined
          }
        />
      ) : (
        <>
          {/* Needs-attention lane — collapses entirely when nothing is in the viewer's court */}
          {tab === 'all' && attentionItems.length > 0 ? (
            <section>
              <h2 className="text-caption font-semibold text-text-secondary">
                Needs attention{' '}
                <span className="tnum text-text-muted">{attentionItems.length}</span>
              </h2>
              <ul className="mt-1 divide-y divide-border-subtle border-y border-border-subtle">
                {attentionItems.map(({ order, attention }) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    isBuyer={order.buyerId === viewerId}
                    attention={attention}
                    meta={rowById.get(order.id)}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {/* Chronological list grouped by month */}
          {groups.map((group, gi) => (
            <section
              key={group.key}
              className={gi > 0 || (tab === 'all' && attentionItems.length > 0) ? 'mt-5' : undefined}
            >
              <h2 className="text-caption font-semibold text-text-secondary">{group.label}</h2>
              <ul className="mt-1 divide-y divide-border-subtle border-y border-border-subtle">
                {group.data.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    isBuyer={order.buyerId === viewerId}
                    attention={tab === 'needs_action' ? attentionMap.get(order.id) : undefined}
                    meta={rowById.get(order.id)}
                  />
                ))}
              </ul>
            </section>
          ))}

          {/* Pagination controls */}
          {hasNextPage || isFetchingNextPage || isFetchNextPageError ? (
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage
                  ? 'Loading…'
                  : isFetchNextPageError
                    ? 'Couldn’t load more — try again'
                    : 'Load more'}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </StateGate>
  );
}
