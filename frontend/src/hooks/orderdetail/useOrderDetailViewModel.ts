import { useMemo } from 'react';
import {
  normaliseOrderStatus,
  isKnownStatus,
  humaniseStatus,
  getStatusExplanation,
  getStatusTone,
  resolveStatusColor,
  resolveStatusSubtleColor,
  isTerminalStatus } from '../../utils/orderDetailLogic';
import { useAppTheme } from '../../theme/ThemeContext';
import { useBackendData } from '../../context/BackendDataContext';
import { useStore } from '../../store/useStore';
import { getListingCoverUri } from '../../utils/media';
import { buildTrackingUrl } from '../../services/shippingProviderRegistry';
import { t } from '../../i18n';
import type { CommerceOrder, OrderParcelEvent } from '../../services/commerceApi';
import type { OrderMutation } from '../useOrderDetail';
import {
  resolveCapabilities,
  type OrderCapability,
  type DispatchExtension } from '../../components/orders/orderCapabilities';
import type { CounterpartyInfo } from '../../components/orders/OrderCounterpartySection';
import type { SupportTicket } from '../../store/useStore';

export interface UseOrderDetailViewModelParams {
  orderId: string;
  backendOrder: CommerceOrder | null;
  parcelEvents: OrderParcelEvent[];
  hasReview: boolean;
  orderMutation: OrderMutation;
}

export interface UseOrderDetailViewModelResult {
  currentUser: ReturnType<typeof useStore.getState>['currentUser'];
  openTicket: SupportTicket | undefined;
  normalisedStatus: string;
  isKnown: boolean;
  statusLabel: string;
  statusExplanation: string;
  isTerminal: boolean;
  isCompleted: boolean;
  isBuyer: boolean;
  isSeller: boolean;
  statusColor: string;
  statusSubtleColor: string;
  listingId: string | undefined;
  listingExists: boolean;
  orderTitle: string;
  orderImage: string;
  orderSubtotal: number | undefined;
  orderSubtitle: string | undefined;
  counterparty: CounterpartyInfo | null;
  subtotal: number;
  platformCharge: number;
  buyerProtectionFee: number | undefined;
  postageFee: number | undefined;
  totalPaid: number;
  capabilities: OrderCapability | null;
  mutationLocked: boolean;
  pendingExtension: DispatchExtension | null;
  proposedShipByLabel: string | null;
  shortOrderId: string;
  carrierTrackingUrl: string | null;
}

/**
 * Derived view-model for OrderDetailScreen: status normalisation, buyer/
 * seller role gating, historical listing snapshot, counterparty,
 * transaction figures, support tickets, canonical action capabilities
 * (via resolveCapabilities — the single source of truth), pending
 * dispatch extension, and the carrier tracking URL.
 *
 * All logic relocated verbatim from OrderDetailScreen.
 */
export function useOrderDetailViewModel({
  orderId,
  backendOrder,
  parcelEvents,
  hasReview,
  orderMutation }: UseOrderDetailViewModelParams): UseOrderDetailViewModelResult {
  const { colors } = useAppTheme();
  const { listings } = useBackendData();
  const currentUser = useStore((state) => state.currentUser);
  const getSupportTicketsForOrder = useStore((state) => state.getSupportTicketsForOrder);

  // --- Support tickets ---
  const supportTickets = getSupportTicketsForOrder(orderId);
  const openTicket = supportTickets.find((ticket) => ticket.status === 'open');

  // --- Derived data ---
  const normalisedStatus = backendOrder ? normaliseOrderStatus(backendOrder.status) : '';
  const isKnown = isKnownStatus(normalisedStatus);
  const statusLabel = humaniseStatus(normalisedStatus);
  const statusExplanation = getStatusExplanation(normalisedStatus);
  const isTerminal = isTerminalStatus(normalisedStatus);
  const isCompleted = normalisedStatus === 'completed';

  const isBuyer = currentUser?.id === backendOrder?.buyerId;
  const isSeller = currentUser?.id === backendOrder?.sellerId;
  const statusTone = getStatusTone(normalisedStatus);
  const statusColor = resolveStatusColor(statusTone, colors);
  const statusSubtleColor = resolveStatusSubtleColor(statusTone, colors);

  const listingId = backendOrder?.listingId;
  const existingListing = listingId ? listings.find((item) => item.id === listingId) : undefined;
  const listingExists = Boolean(existingListing);

  // Historical snapshot authority
  const orderTitle =
    backendOrder?.listingTitle
    || existingListing?.title
    || t('orderDetail.orderedItem');

  const orderImage =
    backendOrder?.listingImageUrl
    || getListingCoverUri(existingListing?.images ?? [], '');

  const orderSubtotal = backendOrder?.subtotalGbp;

  const orderSubtitle = [
    existingListing?.size,
    existingListing?.condition,
  ].filter(Boolean).join(' - ') || undefined;

  // --- Counterparty ---
  const counterparty = useMemo<CounterpartyInfo | null>(() => {
    if (!backendOrder) return null;

    if (isBuyer) {
      // Buyer sees seller
      const seller = backendOrder.seller ?? (existingListing?.seller ? {
        id: existingListing.seller.id,
        username: existingListing.seller.username,
        avatar: existingListing.seller.avatar } : null);

      if (!seller) return null;

      return {
        role: 'Seller' as const,
        id: seller.id,
        username: seller.username ?? t('orderDetail.role.sellerFallback', { id: seller.id.slice(0, 8) }),
        avatar: seller.avatar };
    }

    if (isSeller) {
      // Seller sees buyer
      const buyer = backendOrder.buyer;
      if (!buyer) return null;

      return {
        role: 'Buyer' as const,
        id: buyer.id,
        username: buyer.username ?? t('orderDetail.role.buyerFallback', { id: buyer.id.slice(0, 8) }),
        avatar: buyer.avatar };
    }

    return null;
  }, [backendOrder, isBuyer, isSeller, existingListing]);

  // --- Transaction breakdown ---
  const subtotal = backendOrder?.subtotalGbp ?? 0;
  const platformCharge = backendOrder?.platformChargeGbp ?? 0;
  const buyerProtectionFee = backendOrder?.buyerProtectionFeeGbp;
  const postageFee = backendOrder?.postageFeeGbp;
  const totalPaid = backendOrder?.totalGbp ?? 0;

  // --- Order short ID ---
  const shortOrderId = backendOrder?.id ? backendOrder.id.slice(0, 8).toUpperCase() : '';

  // --- Track on carrier site (declared early so footer can reference) ---
  const carrierTrackingUrl = useMemo(() => {
    // Carrier tracking URLs come from the provider registry, not screen-local
    // string matching. Per HC-P0-01 §9: "move tracking/drop-off URLs into
    // provider registry".
    return buildTrackingUrl(backendOrder?.shippingProvider, backendOrder?.trackingNumber);
  }, [backendOrder?.trackingNumber, backendOrder?.shippingProvider]);

  // --- Action availability (canonical resolver) ---
  //
  // This screen MUST NOT independently recompute canShip/canDeliver/canCancel.
  // The single source of truth is resolveCapabilities() from orderCapabilities.
  // See audit finding #3 and AGENTS.md §2 (fix at the source-of-truth).
  const capabilities = useMemo<OrderCapability | null>(() => {
    if (!backendOrder || !isKnown) return null;
    return resolveCapabilities({
      status: backendOrder.status,
      role: isBuyer ? 'buyer' : 'seller',
      hasOpenResolution: Boolean(openTicket),
      hasReview,
      hasTracking: Boolean(backendOrder.trackingNumber || parcelEvents.length > 0),
      fulfilmentSnapshot: backendOrder.fulfilmentSnapshot ?? null,
      shipByDate: backendOrder.shipByDate ?? null,
      dispatchExtension: backendOrder.dispatchExtension ?? null,
      isSubmitting: orderMutation !== null });
  }, [backendOrder, isKnown, isBuyer, openTicket, parcelEvents.length, orderMutation, hasReview]);

  const mutationLocked = orderMutation !== null;

  // --- Pending dispatch extension ---
  // The order payload surfaces only the latest PENDING extension; only
  // sellers can propose, so a pending extension is always seller-proposed.
  const pendingExtension = backendOrder?.dispatchExtension?.status === 'pending'
    ? backendOrder.dispatchExtension
    : null;

  const proposedShipByLabel = useMemo(() => {
    if (!pendingExtension?.proposedShipBy) return null;
    const d = new Date(pendingExtension.proposedShipBy);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }, [pendingExtension]);

  return {
    currentUser,
    openTicket,
    normalisedStatus,
    isKnown,
    statusLabel,
    statusExplanation,
    isTerminal,
    isCompleted,
    isBuyer,
    isSeller,
    statusColor,
    statusSubtleColor,
    listingId,
    listingExists,
    orderTitle,
    orderImage,
    orderSubtotal,
    orderSubtitle,
    counterparty,
    subtotal,
    platformCharge,
    buyerProtectionFee,
    postageFee,
    totalPaid,
    capabilities,
    mutationLocked,
    pendingExtension,
    proposedShipByLabel,
    shortOrderId,
    carrierTrackingUrl,
  };
}
