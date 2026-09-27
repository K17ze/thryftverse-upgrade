'use client';

/**
 * /orders/[id]/receipt — the standalone printable/shareable receipt.
 * Resolves the same useCommerceOrders session store as the order detail
 * page so fixture and live mode share one truth; OrderReceipt owns the
 * document itself. Guest, loading, error and not-found states mirror the
 * detail page's grammar.
 */

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { OrderReceipt } from '@/components/orders/OrderReceipt';
import { useCommerceOrders } from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useSavedAddresses } from '@/lib/store/userPaymentData';
import { useOrderInstrumentFacts } from '@/lib/hooks/instrument-queries';
import { DATA_MODE } from '@/lib/api/client';
import { listingById, userById } from '@/lib/data/fixtures';
import {
  commerceOrderDetailFor,
  orderEnrichmentFor,
} from '@/lib/data/fixtures-commerce';

function ReceiptSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pb-16 pt-8 sm:px-6" aria-busy aria-label="Loading receipt">
      <Skeleton className="h-5 w-24" />
      <div className="mt-6 rounded-lg border border-border-subtle p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="mt-4 flex flex-col gap-2.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="mt-5 h-px w-full" />
        <div className="mt-5 flex items-center gap-3">
          <Skeleton className="h-16 w-14 rounded-md" />
          <Skeleton className="h-4 flex-1" />
        </div>
        <div className="mt-5 flex flex-col gap-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function OrderReceiptPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, sessionLoading } = useSession();
  const { data: orders, isLoading, isError, refetch } = useCommerceOrders();
  // Same truth as the order page's purchase summary — fixture keeps the
  // session's resolved default; live resolves the addressId stamped on
  // this order against the real address rail (the fulfilment snapshot's
  // destinationSummary is not persisted server-side, so the order's own
  // ref is the only truthful destination).
  const { defaultAddress: fixtureDefaultAddress } = useSavedAddresses();

  const orderId = params?.id ?? '';
  const order = useMemo(
    () => (orders ?? []).find((o) => o.id === orderId) ?? null,
    [orders, orderId],
  );
  const orderFacts = useOrderInstrumentFacts(
    orderId,
    !!user && !!order && order.buyerId === user.id,
    { resolvePaymentMethod: false },
  );
  const deliveryAddress =
    DATA_MODE === 'live' ? orderFacts.deliveryAddress : fixtureDefaultAddress;

  if (sessionLoading || isLoading) return <ReceiptSkeleton />;

  if (!user) {
    return (
      <EmptyState
        icon="profile"
        title="Sign in to view this receipt"
        subtitle="Receipts are tied to the account that owns the order."
        actionLabel="Sign in"
        onAction={() => router.push('/auth')}
      />
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon="alert"
        title="Couldn't load this receipt"
        subtitle="Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void refetch()}
      />
    );
  }

  if (!order) {
    return (
      <EmptyState
        icon="receipt"
        title="Order not found"
        subtitle="This order may have been removed, or the link is incomplete."
        actionLabel="View all orders"
        onAction={() => router.push('/orders')}
      />
    );
  }

  const isBuyer = order.buyerId === user.id;
  const listing = listingById(order.listingId);
  const counterparty = userById(isBuyer ? order.sellerId : order.buyerId);
  const detail = commerceOrderDetailFor(order);

  return (
    <OrderReceipt
      order={order}
      detail={detail}
      listing={listing ?? null}
      counterparty={counterparty ?? null}
      isBuyer={isBuyer}
      fulfilment={order.fulfilmentSnapshot ?? orderEnrichmentFor(order.id).fulfilmentSnapshot ?? null}
      deliveryAddress={deliveryAddress}
    />
  );
}
