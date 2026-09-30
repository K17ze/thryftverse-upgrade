'use client';

/**
 * /orders/[id] — order detail surface orchestrator.
 * Follows FAANG / eBay / Vinted quality standards:
 *  - Header: Status badge, explanation, and next-action hint
 *  - Left rail: Operational banners, eBay-style purchase summary card,
 *    counterparty trust card, escrow protection strip, dispatch extension,
 *    inspection window, tracking trail, and 4-milestone timeline.
 *  - Right rail: Sticky delivery & payment facts, support entries,
 *    and capability-driven CTA buttons.
 *
 * Factored into domain components (<400 LOC standard):
 *  - OrderPurchaseSummaryCard
 *  - OrderInstrumentFactsRail
 *  - OrderCounterpartyCard
 *  - OrderBannersRail
 *  - OrderMiddleSections
 *  - OrderSheetsGroup
 *  - useOrderDetailActions
 */

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { OrderStatusBadge } from '@/components/orders/OrderRow';
import { OrderDetailSkeleton } from '@/components/orders/OrderDetailSkeleton';
import { OrderSupportSection } from '@/components/orders/OrderSupportSection';
import type { OrderActionItem } from '@/components/orders/OrderActionsSheet';
import type { IssueCategory } from '@/components/orders/IssueReportSheet';
import type { ProtectionCoverage } from '@/components/orders/BuyerProtectionSheet';
import {
  isCancelledStatus,
  normaliseOrderStatus,
  resolveOrderExperience,
  type OrderAction,
  type OrderRole,
} from '@/components/orders/orderCapabilities';
import {
  useCreateConversation,
  useOrderActions,
  useOrderReturnCase,
} from '@/lib/hooks/queries';
import { useOrder, useOrderAuthentication } from '@/lib/hooks/order-queries';
import { DATA_MODE } from '@/lib/api/client';
import * as commerceService from '@/lib/api/services/commerce';
import { useSession } from '@/lib/session/SessionProvider';
import { useSavedAddresses, useSavedPaymentMethods } from '@/lib/store/userPaymentData';
import { useOrderInstrumentFacts } from '@/lib/hooks/instrument-queries';
import { useSupportActions, useSupportTickets } from '@/components/support/useSupportTickets';
import { useListingIds, useSellerSummary } from '@/lib/hooks/listing-resolution';
import { listingById, userById } from '@/lib/data/fixtures';
import {
  commerceOrderDetailFor,
  orderEnrichmentFor,
} from '@/lib/data/fixtures-commerce';
import { formatDate } from '@/lib/utils/format';
import { OrderPurchaseSummaryCard } from '@/components/orders/OrderPurchaseSummaryCard';
import { OrderInstrumentFactsRail } from '@/components/orders/OrderInstrumentFactsRail';
import { OrderCounterpartyCard, type CounterpartyView } from '@/components/orders/OrderCounterpartyCard';
import { OrderBannersRail } from '@/components/orders/OrderBannersRail';
import { OrderMiddleSections } from '@/components/orders/OrderMiddleSections';
import { OrderSheetsGroup } from '@/components/orders/OrderSheetsGroup';
import { useOrderDetailActions } from '@/components/orders/useOrderDetailActions';
import type { OrderReviewView } from '@/components/orders/OrderReviewCard';
import type { AppIconName } from '@/components/ui/Icon';
import type { User, Listing } from '@/lib/contracts/domain';
import type { SellerSummary } from '@/lib/api/services/users';

const EMPTY_IDS: string[] = [];

const ACTION_LABEL: Record<OrderAction, string> = {
  pay: 'Pay now',
  dispatch: 'Mark as dispatched',
  propose_extension: 'Propose dispatch extension',
  respond_extension: 'Respond to extension',
  confirm_delivery: 'Confirm receipt',
  cancel: 'Cancel order',
  report_issue: 'Report a problem',
  view_resolution: 'View return request',
  leave_review: 'Leave a review',
  view_review: 'Reviewed — thanks',
  view_receipt: 'View receipt',
  track_order: 'Track parcel',
  inspect: 'Check your item',
  contact: 'Message',
};

const ACTION_ICON: Partial<Record<OrderAction, AppIconName>> = {
  confirm_delivery: 'check',
  cancel: 'closeCircle',
  report_issue: 'flag',
  view_resolution: 'shield',
  leave_review: 'star',
  view_review: 'star',
  view_receipt: 'receipt',
  track_order: 'box',
  contact: 'chat',
  pay: 'card',
  dispatch: 'send',
};

function toCounterparty(
  source: User | SellerSummary | null | undefined,
): CounterpartyView | null {
  if (!source) return null;
  if ('isVerified' in source) {
    return {
      id: source.id,
      username: source.username,
      avatar: source.avatar,
      isVerified: source.isVerified,
      rating: source.rating,
    };
  }
  return {
    id: source.id,
    username: source.username,
    avatar: source.avatar,
    isVerified: source.verified,
    rating: source.rating,
  };
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { show } = useToast();
  const { user, sessionLoading } = useSession();
  const orderId = params?.id ?? '';
  const queryClient = useQueryClient();

  const {
    data: order,
    isLoading,
    isError,
    refetch,
  } = useOrder(orderId);
  const actions = useOrderActions(orderId);
  const createConversation = useCreateConversation();
  const { data: tickets } = useSupportTickets();
  const { createTicket } = useSupportActions();
  const { data: liveReturnCase } = useOrderReturnCase(orderId);
  const authenticationQuery = useOrderAuthentication(orderId);
  const authentication = authenticationQuery.data ?? null;

  const liveListing = useListingIds(order ? [order.listingId] : EMPTY_IDS);
  const liveSeller = useSellerSummary(
    order && user ? (order.buyerId === user.id ? order.sellerId : order.buyerId) : null,
  );

  const { defaultAddress: fixtureDefaultAddress } = useSavedAddresses();
  const { defaultMethod: fixtureDefaultMethod } = useSavedPaymentMethods();
  const orderFacts = useOrderInstrumentFacts(
    orderId,
    !!user && !!order && order.buyerId === user.id,
  );
  const deliveryAddress =
    DATA_MODE === 'live' ? orderFacts.deliveryAddress : fixtureDefaultAddress;
  const paidWith =
    DATA_MODE === 'live' ? orderFacts.paymentMethod : fixtureDefaultMethod;

  const { data: parcelTrail } = useQuery({
    queryKey: ['order', orderId, 'parcel-events'],
    queryFn: ({ signal }) => commerceService.fetchParcelEvents(orderId, signal),
    enabled: DATA_MODE === 'live' && !!orderId,
  });

  const { data: orderReview } = useQuery({
    queryKey: ['order', orderId, 'review'],
    queryFn: ({ signal }) => commerceService.fetchOrderReview(orderId, signal),
    enabled: DATA_MODE === 'live' && !!orderId,
    staleTime: 60_000,
  });

  const isBuyer = !!order && !!user && order.buyerId === user.id;
  const role: OrderRole = isBuyer ? 'buyer' : 'seller';
  const resolvedListing: Listing | null = order
    ? DATA_MODE === 'live'
      ? (liveListing.byId.get(order.listingId) ?? null)
      : (listingById(order.listingId) ?? null)
    : null;
  const counterparty = toCounterparty(
    DATA_MODE === 'live'
      ? (liveSeller.data ?? null)
      : (order ? userById(isBuyer ? order.sellerId : order.buyerId) : null),
  );

  const {
    actionsOpen,
    setActionsOpen,
    issueOpen,
    setIssueOpen,
    returnOpen,
    setReturnOpen,
    dispatchOpen,
    setDispatchOpen,
    protectionOpen,
    setProtectionOpen,
    confirmSheet,
    setConfirmSheet,
    busy,
    claimBusy,
    run,
    handleAction,
    handleIssueSelect,
    submitProtectionClaim,
    openCounterpartyThread,
    copyTracking,
    copyOrderNumber,
  } = useOrderDetailActions({
    order: order!,
    counterparty,
    actions,
    createConversation,
    createTicket,
    show,
    router,
    queryClient,
  });

  const protectionQuery = useQuery({
    queryKey: ['order', orderId, 'protection'],
    queryFn: ({ signal }) => commerceService.fetchOrderProtection(orderId, signal),
    enabled: DATA_MODE === 'live' && protectionOpen && !!order && isBuyer,
  });

  if (sessionLoading || isLoading) {
    return <OrderDetailSkeleton />;
  }

  if (!user) {
    return (
      <EmptyState
        icon="profile"
        title="Sign in to view this order"
        subtitle="Purchases and sales are tied to your account."
        actionLabel="Sign in"
        onAction={() => router.push('/auth')}
      />
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon="alert"
        title="Couldn't load this order"
        subtitle="Check your connection and try again — the order is safe."
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

  const detail = commerceOrderDetailFor(order);
  const enrichment = orderEnrichmentFor(order.id);
  const trackingEvents =
    DATA_MODE === 'live' ? (parcelTrail?.events ?? []) : (enrichment.trackingEvents ?? []);
  const returnCase =
    DATA_MODE === 'live' ? (liveReturnCase ?? null) : (enrichment.returnCase ?? null);
  const openTicket = (tickets ?? []).find(
    (t) => t.orderId === order.id && (t.status === 'open' || t.status === 'in_review'),
  );

  const key = normaliseOrderStatus(order.status);
  const isCompleted = key === 'completed';
  const caseOpen =
    !!openTicket ||
    (returnCase != null && returnCase.status !== 'closed' && returnCase.status !== 'refund_confirmed');
  const hasOpenResolution =
    DATA_MODE === 'live' ? order.hasOpenResolution === true || caseOpen : caseOpen;
  const hasReview =
    DATA_MODE === 'live'
      ? (order.hasReview === true || (orderReview != null && orderReview.isAuto !== true))
      : enrichment.hasReview === true;
  const reviewIsAuto =
    DATA_MODE === 'live' ? orderReview?.isAuto === true : enrichment.reviewIsAuto === true;

  const sellerReview: OrderReviewView | null = !isBuyer
    ? DATA_MODE === 'live'
      ? orderReview
        ? {
            rating: orderReview.rating,
            text: orderReview.comment,
            isAuto: orderReview.isAuto,
            createdAt: orderReview.createdAt,
            sellerResponse: orderReview.sellerResponse ?? null,
          }
        : null
      : enrichment.hasReview
        ? {
            rating: enrichment.reviewRating ?? 0,
            text: enrichment.reviewText ?? null,
            isAuto: enrichment.reviewIsAuto === true,
            sellerResponse: enrichment.reviewResponse ?? null,
          }
        : null
    : null;

  const experience = resolveOrderExperience({
    status: order.status,
    role,
    hasOpenResolution,
    hasReview,
    reviewIsAuto,
    hasTracking: !!order.trackingNumber || trackingEvents.length > 0,
    fulfilmentSnapshot: order.fulfilmentSnapshot ?? enrichment.fulfilmentSnapshot ?? null,
    shipByDate: order.shipByDate ?? enrichment.shipByDate ?? null,
    dispatchExtension:
      enrichment.dispatchExtension !== undefined
        ? enrichment.dispatchExtension
        : (order.dispatchExtension ?? null),
    inspectionDeadlineAt: order.inspectionDeadlineAt ?? enrichment.inspectionDeadlineAt ?? null,
    estimatedDeliveryAt: order.estimatedDeliveryAt ?? enrichment.estimatedDeliveryAt ?? null,
    estimatedReleaseAt: order.estimatedReleaseAt ?? enrichment.estimatedReleaseAt ?? null,
  });
  const caps = experience.capabilities;

  const pendingExtension =
    enrichment.dispatchExtension !== undefined
      ? enrichment.dispatchExtension
      : order.dispatchExtension;

  const contextualIssues: IssueCategory[] =
    key === 'delivery failed'
      ? [{ id: 'delivery_failed', label: 'Delivery failed', description: 'The carrier could not deliver your parcel' }]
      : key === 'returned'
        ? [{ id: 'returned', label: 'Parcel returned', description: 'Your parcel was sent back to the seller' }]
        : [];

  const sheetActions: OrderActionItem[] = [
    ...caps.secondaryActions.map((a) => ({
      key: a,
      label:
        a === 'contact'
          ? isBuyer
            ? 'Message seller'
            : 'Message buyer'
          : ACTION_LABEL[a],
      icon: ACTION_ICON[a] ?? 'forward',
      variant: (a === 'cancel' ? 'destructive' : a === 'confirm_delivery' ? 'primary' : 'default') as
        | 'default'
        | 'primary'
        | 'destructive',
      onPress: () => handleAction(a),
    })),
    ...(isBuyer && (key === 'delivered' || key === 'completed') && !returnCase
      ? [
          {
            key: 'request_return',
            label: 'Request a return',
            icon: 'repeat' as const,
            variant: 'default' as const,
            onPress: () => setReturnOpen(true),
          },
        ]
      : []),
    ...(isBuyer && key !== 'created' && !isCancelledStatus(order.status)
      ? [
          {
            key: 'buyer_protection',
            label: 'Buyer protection',
            icon: 'shield' as const,
            variant: 'default' as const,
            onPress: () => setProtectionOpen(true),
          },
        ]
      : []),
    ...(!isBuyer && order.shippingLabelUrl
      ? [
          {
            key: 'shipping_label',
            label: 'Shipping label',
            icon: 'document' as const,
            variant: 'default' as const,
            onPress: () =>
              window.open(order.shippingLabelUrl!, '_blank', 'noopener,noreferrer'),
          },
        ]
      : []),
    {
      key: 'view_listing',
      label: 'View listing',
      icon: 'tag',
      variant: 'default',
      onPress: () => router.push(`/item/${order.listingId}`),
    },
  ];

  const protectionCoverage: ProtectionCoverage | null =
    DATA_MODE === 'live'
      ? protectionQuery.data
        ? {
            covered: protectionQuery.data.status === 'covered',
            feeGbp: protectionQuery.data.feeGbpMinor / 100,
            coverageCapGbp: protectionQuery.data.coverageAmountGbpMinor / 100,
            eligibleUntil: protectionQuery.data.eligibleUntil,
            claims: protectionQuery.data.claims.map((c) => ({
              ticketId: c.ticketId,
              label: c.topicLabel,
              status: c.status,
              createdAt: c.createdAt,
            })),
          }
        : null
      : {
          covered: detail.protectionFee > 0,
          feeGbp: detail.protectionFee,
          coverageCapGbp: Math.min(order.totalPrice, 500),
          eligibleUntil: order.deliveredAt
            ? new Date(Date.parse(order.deliveredAt) + 30 * 86_400_000).toISOString()
            : new Date(Date.parse(order.createdAt) + 60 * 86_400_000).toISOString(),
          claims: (tickets ?? [])
            .filter(
              (t) =>
                t.orderId === order.id &&
                (t.topicId === 'order_issue' || t.topicId === 'refund'),
            )
            .map((t) => ({
              ticketId: t.id,
              label: t.topicLabel,
              status: t.status,
              createdAt: t.createdAt,
            })),
        };

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6 lg:max-w-[1100px]">
      <div className="flex items-center gap-2">
        <IconButton name="back" aria-label="Back to orders" onClick={() => router.push('/orders')} className="-ml-2" />
        <p className="text-caption text-text-muted">
          Order <span className="tnum font-semibold text-text-secondary">{order.id}</span>
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-screen-title text-text-primary">
          {isBuyer ? 'Your purchase' : 'Your sale'}
        </h1>
        <OrderStatusBadge status={order.status} />
      </div>
      <p className="mt-1 text-caption text-text-secondary">
        Placed {formatDate(order.createdAt)}
      </p>
      {experience.explanation ? (
        <p className="mt-2 text-body text-text-secondary">{experience.explanation}</p>
      ) : null}
      {experience.nextActionHint && !isCompleted && !isCancelledStatus(order.status) ? (
        <p className="mt-1 flex items-center gap-1.5 text-caption font-medium text-warning-text">
          <Icon name="alert" size={14} />
          {experience.nextActionHint}
        </p>
      ) : null}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-10">
        <div className="min-w-0">
          <OrderBannersRail
            order={order}
            isBuyer={isBuyer}
            role={role}
            shipByDate={caps.shipByDate}
            statusKey={key}
          />

          <OrderPurchaseSummaryCard
            order={order}
            listing={resolvedListing}
            detail={detail}
            enrichment={enrichment}
            isBuyer={isBuyer}
            deliveryAddress={deliveryAddress}
            paidWith={paidWith}
            onCopyOrderNumber={copyOrderNumber}
          />

          <OrderCounterpartyCard
            counterparty={counterparty}
            isLoading={liveSeller.isLoading}
            isBuyer={isBuyer}
            onMessage={openCounterpartyThread}
          />

          <OrderMiddleSections
            order={order}
            detail={detail}
            isBuyer={isBuyer}
            statusKey={key}
            estimatedReleaseAt={experience.estimatedReleaseAt}
            inspectionDeadlineAt={experience.inspectionDeadlineAt}
            inspectionWindowOpen={experience.inspectionWindowOpen}
            estimatedDeliveryAt={experience.estimatedDeliveryAt}
            etaWindow={caps.etaWindow}
            serviceName={caps.serviceName}
            pendingExtension={pendingExtension}
            canRespondExtension={caps.canRespondExtension}
            trackingEvents={trackingEvents}
            authentication={authentication}
            isAuthenticationError={authenticationQuery.isError}
            returnCase={returnCase}
            sellerReview={sellerReview}
            orderReviewId={orderReview?.id}
            busy={busy}
            actions={actions}
            run={run}
            setConfirmSheet={setConfirmSheet}
            onConfirmReceipt={() => handleAction('confirm_delivery')}
            onReportIssue={() => setIssueOpen(true)}
            onCopyTracking={copyTracking}
          />
        </div>

        <aside className="lg:sticky lg:top-20 lg:flex lg:flex-col lg:self-start">
          <OrderInstrumentFactsRail
            order={order}
            isBuyer={isBuyer}
            paidWith={paidWith}
            deliveryAddress={deliveryAddress}
            enrichment={enrichment}
            onCopyOrderNumber={copyOrderNumber}
          />

          <section className="border-b border-border-subtle py-4 lg:order-3">
            <OrderSupportSection
              openTicket={openTicket ? { id: openTicket.id, topicLabel: openTicket.topicLabel } : null}
              onPressOpenTicket={(ticketId) => router.push(`/support/${ticketId}`)}
              contactLabel={isBuyer ? 'Contact seller' : 'Contact buyer'}
              onContact={openCounterpartyThread}
              onPressGetSupport={() => setIssueOpen(true)}
            />
          </section>

          <section className="flex flex-col gap-2 pt-5 lg:order-1 lg:pt-0">
            {DATA_MODE === 'live' && experience.primaryAction === 'pay' ? (
              <p className="text-center text-caption text-text-secondary">
                Payment isn’t confirmed yet — pay now, or the order can be cancelled below.
              </p>
            ) : null}
            {experience.primaryAction ? (
              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled={busy}
                onClick={() => handleAction(experience.primaryAction!)}
              >
                {ACTION_LABEL[experience.primaryAction]}
              </Button>
            ) : !experience.primaryAction && resolvedListing && !resolvedListing.isSold ? (
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={() => router.push(`/item/${order.listingId}`)}
              >
                Buy again
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="md"
              fullWidth
              icon="more"
              onClick={() => setActionsOpen(true)}
            >
              More actions
            </Button>
          </section>
        </aside>
      </div>

      <OrderSheetsGroup
        order={order}
        role={role}
        actionsOpen={actionsOpen}
        setActionsOpen={setActionsOpen}
        sheetActions={sheetActions}
        issueOpen={issueOpen}
        setIssueOpen={setIssueOpen}
        contextualIssues={contextualIssues}
        onSelectIssue={handleIssueSelect}
        returnOpen={returnOpen}
        setReturnOpen={setReturnOpen}
        itemTitle={resolvedListing?.title}
        dispatchOpen={dispatchOpen}
        setDispatchOpen={setDispatchOpen}
        serviceName={caps.serviceName}
        protectionOpen={protectionOpen}
        setProtectionOpen={setProtectionOpen}
        protectionCoverage={protectionCoverage}
        isProtectionLoading={DATA_MODE === 'live' && protectionQuery.isLoading}
        isProtectionError={DATA_MODE === 'live' && protectionQuery.isError}
        isBuyer={isBuyer}
        claimBusy={claimBusy}
        onFileClaim={submitProtectionClaim}
        confirmSheet={confirmSheet}
        setConfirmSheet={setConfirmSheet}
        busy={busy}
        actions={actions}
        run={run}
      />
    </div>
  );
}
