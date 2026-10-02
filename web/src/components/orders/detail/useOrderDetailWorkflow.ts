'use client';

import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import {
  normaliseOrderStatus,
  resolveOrderExperience,
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
import type { OrderReviewView } from '@/components/orders/OrderReviewCard';
import type { Listing } from '@/lib/contracts/domain';
import {
  ACTION_LABEL,
  ACTION_ICON,
  buildContextualIssues,
  buildOrderSheetActions,
  toCounterparty,
} from './orderDetailModel';
import { useOrderDetailProtection } from './useOrderDetailProtection';

export { ACTION_LABEL, ACTION_ICON, toCounterparty };

const EMPTY_IDS: string[] = [];

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

  const detail = order ? commerceOrderDetailFor(order) : null;
  const enrichment = order ? orderEnrichmentFor(order.id) : null;
  const trackingEvents =
    DATA_MODE === 'live' ? (parcelTrail?.events ?? []) : (enrichment?.trackingEvents ?? []);
  const returnCase =
    DATA_MODE === 'live' ? (liveReturnCase ?? null) : (enrichment?.returnCase ?? null);
  const openTicket = (tickets ?? []).find(
    (t) => t.orderId === order?.id && (t.status === 'open' || t.status === 'in_review'),
  );

  const {
    protectionCoverage,
    protectionLoading,
    isProtectionError,
  } = useOrderDetailProtection({
    orderId,
    order,
    isBuyer,
    protectionOpen,
    detail,
    tickets,
  });

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

  const experience = resolveOrderExperience({
    status: order?.status ?? 'created',
    role,
    hasOpenResolution,
    hasReview,
    reviewIsAuto,
    hasTracking: !!order?.trackingNumber || trackingEvents.length > 0,
    fulfilmentSnapshot: order?.fulfilmentSnapshot ?? enrichment?.fulfilmentSnapshot ?? null,
    shipByDate: order?.shipByDate ?? enrichment?.shipByDate ?? null,
    dispatchExtension:
      enrichment?.dispatchExtension !== undefined
        ? enrichment.dispatchExtension
        : (order?.dispatchExtension ?? null),
    inspectionDeadlineAt: order?.inspectionDeadlineAt ?? enrichment?.inspectionDeadlineAt ?? null,
    estimatedDeliveryAt: order?.estimatedDeliveryAt ?? enrichment?.estimatedDeliveryAt ?? null,
    estimatedReleaseAt: order?.estimatedReleaseAt ?? enrichment?.estimatedReleaseAt ?? null,
  });

  const caps = experience.capabilities;

  const pendingExtension =
    enrichment?.dispatchExtension !== undefined
      ? enrichment.dispatchExtension
      : order?.dispatchExtension;

  const contextualIssues = buildContextualIssues(key);

  const sheetActions = buildOrderSheetActions({
    caps,
    isBuyer,
    key,
    order,
    returnCase,
    handleAction,
    setReturnOpen,
    setProtectionOpen,
    navigateToItem: (listingId) => router.push(`/item/${listingId}`),
  });

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
    protectionLoading,
    isProtectionError,
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
