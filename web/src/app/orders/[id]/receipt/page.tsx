'use client';

/**
 * /orders/[id]/receipt — the standalone printable/shareable receipt.
 * Resolves the order through useOrder (GET /orders/:id) — the same truth
 * the order detail page reads, never a list-find over the paginated feed;
 * OrderReceipt owns the document itself. Guest, loading, error and
 * not-found states mirror the detail page's grammar.
 */

import { useParams, useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { OrderReceipt } from '@/components/orders/OrderReceipt';
import { useOrder } from '@/lib/hooks/order-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useSavedAddresses } from '@/lib/store/userPaymentData';
import { useOrderInstrumentFacts } from '@/lib/hooks/instrument-queries';
import { DATA_MODE } from '@/lib/api/client';
import { useListingIds, useSellerSummary } from '@/lib/hooks/listing-resolution';
import { listingById, userById } from '@/lib/data/fixtures';
import {
  commerceOrderDetailFor,
  orderEnrichmentFor,
} from '@/lib/data/fixtures-commerce';
import type { User } from '@/lib/contracts/domain';

/** Stable empty for the pre-resolution order — keeps the id-list query
 *  identity stable while the order itself is still loading. */
const EMPTY_IDS: string[] = [];

function ReceiptSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pb-16 pt-8 sm:px-6 lg:max-w-[1100px]" aria-busy aria-label="Loading receipt">
      <Skeleton className="h-5 w-24" />
      {/* Document left, action rail right — mirrors the composed layout. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-x-10">
      <div className="mt-6 min-w-0 rounded-lg border border-border-subtle p-5 sm:p-6">
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
      <div className="hidden flex-col gap-1 lg:flex">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
      </div>
    </div>
  );
}

export default function OrderReceiptPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, sessionLoading } = useSession();
  const orderId = params?.id ?? '';
  // The order itself — GET /orders/:id, same truth as the detail page.
  const {
    data: order,
    isLoading,
    isError,
    refetch,
  } = useOrder(orderId);
  // Same truth as the order page's purchase summary — fixture keeps the
  // session's resolved default; live resolves the addressId stamped on
  // this order against the real address rail (the fulfilment snapshot's
  // destinationSummary is not persisted server-side, so the order's own
  // ref is the only truthful destination).
  const { defaultAddress: fixtureDefaultAddress } = useSavedAddresses();

  const orderFacts = useOrderInstrumentFacts(
    orderId,
    !!user && !!order && order.buyerId === user.id,
    { resolvePaymentMethod: false },
  );
  const deliveryAddress =
    DATA_MODE === 'live' ? orderFacts.deliveryAddress : fixtureDefaultAddress;

  // Live resolution — the listing and counterparty come off the wire
  // (GET /listings/:id, GET /sellers/:id); fixture keeps the catalogue.
  // Hooks run before the guards; ids stay null until the order resolves.
  const liveListing = useListingIds(order ? [order.listingId] : EMPTY_IDS);
  const liveSeller = useSellerSummary(
    order && user ? (order.buyerId === user.id ? order.sellerId : order.buyerId) : null,
  );

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
  // Live: the wire rows; fixture: the catalogue. An unresolved live id
  // renders the honest placeholder — never a fixture ghost.
  const listing =
    DATA_MODE === 'live'
      ? (liveListing.byId.get(order.listingId) ?? null)
      : listingById(order.listingId);
  // OrderReceipt reads only the counterparty's @username off this row —
  // the live seller summary maps onto the User shape it takes; fixture
  // keeps the catalogue user.
  const counterparty: User | null = (() => {
    if (DATA_MODE !== 'live') return userById(isBuyer ? order.sellerId : order.buyerId) ?? null;
    const seller = liveSeller.data;
    if (!seller) return null;
    return {
      id: seller.id,
      username: seller.username,
      avatar: seller.avatar ?? '',
      rating: seller.rating ?? 0,
      reviewCount: seller.reviewCount,
      location: '',
      followers: 0,
      following: 0,
      isVerified: seller.verified,
      badges: [],
      lastSeen: '',
      listingCount: seller.activeListingCount,
    };
  })();
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
