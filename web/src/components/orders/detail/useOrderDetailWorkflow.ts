'use client';

import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import type { OrderActionItem } from '@/components/orders/OrderActionsSheet';
import type { ProtectionCoverage } from '@/components/orders/BuyerProtectionSheet';
import type { IssueCategory } from '@/components/orders/IssueReportSheet';
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
import { useOrderDetailActions } from '@/components/orders/useOrderDetailActions';
import type { CounterpartyView } from '@/components/orders/OrderCounterpartyCard';
import type { OrderReviewView } from '@/components/orders/OrderReviewCard';
import type { AppIconName } from '@/components/ui/Icon';
import type { User, Listing } from '@/lib/contracts/domain';
import type { SellerSummary } from '@/lib/api/services/users';

const EMPTY_IDS: string[] = [];

export const ACTION_LABEL: Record<OrderAction, string> = {
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

export const ACTION_ICON: Partial<Record<OrderAction, AppIconName>> = {
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

export function toCounterparty(
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

export function useOrderDetailWorkflow(orderId: string) {
  const router = useRouter();
  const { show } = useToast();
  const { user, sessionLoading } = useSession();
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

  const detail = order ? commerceOrderDetailFor(order) : null;
  const enrichment = order ? orderEnrichmentFor(order.id) : null;
  const trackingEvents =
    DATA_MODE === 'live' ? (parcelTrail?.events ?? []) : (enrichment?.trackingEvents ?? []);
  const returnCase =
    DATA_MODE === 'live' ? (liveReturnCase ?? null) : (enrichment?.returnCase ?? null);
  const openTicket = (tickets ?? []).find(
    (t) => t.orderId === order?.id && (t.status === 'open' || t.status === 'in_review'),
  );

  const key = order ? normaliseOrderStatus(order.status) : 'created';
  const isCompleted = key === 'completed';
  const caseOpen =
    !!openTicket ||
    (returnCase != null && returnCase.status !== 'closed' && returnCase.status !== 'refund_confirmed');
  const hasOpenResolution =
    DATA_MODE === 'live' ? (order?.hasOpenResolution === true || caseOpen) : caseOpen;
  const hasReview =
    DATA_MODE === 'live'
      ? (order?.hasReview === true || (orderReview != null && orderReview.isAuto !== true))
      : enrichment?.hasReview === true;
  const reviewIsAuto =
    DATA_MODE === 'live' ? orderReview?.isAuto === true : enrichment?.reviewIsAuto === true;

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
      : enrichment?.hasReview
        ? {
            rating: enrichment.reviewRating ?? 0,
            text: enrichment.reviewText ?? null,
            isAuto: enrichment.reviewIsAuto === true,
            sellerResponse: enrichment.reviewResponse ?? null,
          }
        : null
    : null;

  const experience = order
    ? resolveOrderExperience({
        status: order.status,
        role,
        hasOpenResolution,
        hasReview,
        reviewIsAuto,
        hasTracking: !!order.trackingNumber || trackingEvents.length > 0,
        fulfilmentSnapshot: order.fulfilmentSnapshot ?? enrichment?.fulfilmentSnapshot ?? null,
        shipByDate: order.shipByDate ?? enrichment?.shipByDate ?? null,
        dispatchExtension:
          enrichment?.dispatchExtension !== undefined
            ? enrichment.dispatchExtension
            : (order.dispatchExtension ?? null),
        inspectionDeadlineAt: order.inspectionDeadlineAt ?? enrichment?.inspectionDeadlineAt ?? null,
        estimatedDeliveryAt: order.estimatedDeliveryAt ?? enrichment?.estimatedDeliveryAt ?? null,
        estimatedReleaseAt: order.estimatedReleaseAt ?? enrichment?.estimatedReleaseAt ?? null,
      })
    : {
        stateKey: 'created',
        label: 'Created',
        tone: 'pending' as const,
        terminal: false,
        primaryAction: null,
        secondaryActions: [],
        capabilities: {
          statusLabel: 'Created',
          statusTone: 'pending' as const,
          primaryAction: null,
          secondaryActions: [],
          canCancel: false,
          canReportIssue: false,
          shouldViewResolution: false,
          canRequestReturn: false,
          canConfirmDelivery: false,
          canMarkDispatched: false,
          canProposeExtension: false,
          canRespondExtension: false,
          canLeaveReview: false,
          shouldViewReview: false,
          canViewReceipt: true,
          canTrack: false,
          canInspect: false,
          canContact: false,
          serviceName: null,
          deliveryMode: 'unknown' as const,
          shipByDate: null,
          etaWindow: null,
          nextActionHint: null,
        },
        explanation: '',
        nextActionHint: null,
        estimatedReleaseAt: null,
        inspectionDeadlineAt: null,
        inspectionWindowOpen: false,
        estimatedDeliveryAt: null,
      };

  const caps = experience.capabilities;

  const pendingExtension =
    enrichment?.dispatchExtension !== undefined
      ? enrichment.dispatchExtension
      : order?.dispatchExtension;

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
    ...(isBuyer && key !== 'created' && !isCancelledStatus(order?.status ?? '')
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
    ...(!isBuyer && order?.shippingLabelUrl
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
      onPress: () => router.push(`/item/${order?.listingId}`),
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
      : detail && order
        ? {
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
          }
        : null;

  return {
    router,
    user,
    sessionLoading,
    isLoading,
    isError,
    refetch,
    order,
    isBuyer,
    role,
    resolvedListing,
    counterparty,
    liveSellerLoading: liveSeller.isLoading,
    deliveryAddress,
    paidWith,
    detail,
    enrichment,
    trackingEvents,
    returnCase,
    openTicket,
    sellerReview,
    orderReview,
    authentication,
    isAuthenticationError: authenticationQuery.isError,
    key,
    isCompleted,
    experience,
    caps,
    pendingExtension,
    sheetActions,
    contextualIssues,
    protectionCoverage,
    protectionLoading: protectionQuery.isLoading,
    isProtectionError: DATA_MODE === 'live' && protectionQuery.isError,
    protectionOpen,
    setProtectionOpen,
    actionsOpen,
    setActionsOpen,
    issueOpen,
    setIssueOpen,
    returnOpen,
    setReturnOpen,
    dispatchOpen,
    setDispatchOpen,
    confirmSheet,
    setConfirmSheet,
    busy,
    claimBusy,
    actions,
    run,
    handleAction,
    handleIssueSelect,
    submitProtectionClaim,
    openCounterpartyThread,
    copyTracking,
    copyOrderNumber,
  };
}
