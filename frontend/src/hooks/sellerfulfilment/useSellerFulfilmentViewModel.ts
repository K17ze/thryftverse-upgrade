import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import {
  normaliseOrderStatus,
  humaniseStatus,
  resolveCapabilities,
  type OrderCapability,
  type DispatchExtension,
  type FulfilmentSnapshot } from '../../components/orders/orderCapabilities';
import type { CommerceOrder } from '../../services/commerceApi';
import type { ShippingProviderErrorCode } from '../../services/shippingProviderRegistry';
import {
  getShipByDate,
  formatShipByDate,
  daysUntil,
  formatEtaWindow,
  formatShipByLine,
  getPendingExtension,
  buildEscrowFootnote } from '../../components/sellerfulfilment/fulfilmentViewModels';

export interface UseSellerFulfilmentViewModelParams {
  order: CommerceOrder | null;
  hasReview: boolean;
  labelErrorCode: ShippingProviderErrorCode | null;
  generatedLabelUrl: string | null;
}

export interface UseSellerFulfilmentViewModelResult {
  isSeller: boolean;
  /** Canonical capability resolution — the single source of truth for
   *  dispatch eligibility. Never recompute from a local status check. */
  capabilities: OrderCapability | null;
  canDispatch: boolean;
  canProposeExtension: boolean;
  pendingExtension: DispatchExtension | null;
  snapshot: FulfilmentSnapshot | null;
  deliveryMode: 'integrated' | 'manual' | 'local' | 'unknown';
  isIntegrated: boolean;
  labelGenerationUnavailable: boolean;
  shipByLabel: string | null;
  shipByDaysLeft: number | null;
  shipByUrgent: boolean;
  shipByOverdue: boolean;
  /** Precomposed ship-by line text (urgency copy included). */
  shipByText: string;
  serviceName: string | null;
  etaWindow: string | null;
  escrowFootnote: string | null;
  statusLabel: string;
  shortOrderId: string;
}

/**
 * Derived view-model for SellerFulfilmentScreen: seller-role gating,
 * canonical capabilities, fulfilment-snapshot delivery mode, ship-by
 * deadline urgency, service/ETA display strings, pending dispatch
 * extension, and the escrow footnote.
 *
 * All logic relocated verbatim from SellerFulfilmentScreen.
 */
export function useSellerFulfilmentViewModel({
  order,
  hasReview,
  labelErrorCode,
  generatedLabelUrl }: UseSellerFulfilmentViewModelParams): UseSellerFulfilmentViewModelResult {
  const currentUser = useStore((state) => state.currentUser);

  const isSeller = currentUser?.id === order?.sellerId;
  const normalised = normaliseOrderStatus(order?.status ?? '');

  // Dispatch eligibility comes from the canonical capability resolver,
  // never from a local `status === 'paid'` check.
  const capabilities = useMemo(() => {
    if (!order) return null;
    return resolveCapabilities({
      status: order.status,
      role: isSeller ? 'seller' : 'buyer',
      hasOpenResolution: false,
      hasReview,
      hasTracking: Boolean(order.trackingNumber),
      fulfilmentSnapshot: order.fulfilmentSnapshot ?? null,
      shipByDate: order.shipByDate ?? null,
      dispatchExtension: order.dispatchExtension ?? null });
  }, [order, isSeller, hasReview]);
  const canDispatch = capabilities?.canDispatch ?? false;
  const canProposeExtension = capabilities?.canProposeExtension ?? false;

  // The order payload only surfaces the latest PENDING extension.
  const pendingExtension = getPendingExtension(order);

  // Determine shipping mode from the immutable fulfilment snapshot.
  // Integrated = buyer purchased a carrier-managed service (label/QR available).
  // Manual = buyer paid for postage but seller arranges their own tracked service.
  const snapshot: FulfilmentSnapshot | null = order?.fulfilmentSnapshot ?? null;
  const deliveryMode: 'integrated' | 'manual' | 'local' | 'unknown' =
    snapshot?.deliveryMode ?? 'unknown';
  const isIntegrated = deliveryMode === 'integrated';
  const labelGenerationUnavailable =
    isIntegrated && labelErrorCode === 'LABEL_GENERATION_UNAVAILABLE' && !generatedLabelUrl;

  const shipByDate = order ? getShipByDate(order) : null;
  const shipByLabel = formatShipByDate(shipByDate);
  const shipByDaysLeft = daysUntil(shipByDate);
  const shipByUrgent = shipByDaysLeft != null && shipByDaysLeft <= 1;
  const shipByOverdue = shipByDaysLeft != null && shipByDaysLeft < 0;
  const shipByText = formatShipByLine(shipByLabel, shipByDaysLeft, shipByOverdue);

  const serviceName = snapshot?.serviceName ?? snapshot?.carrierId ?? order?.shippingProvider ?? null;
  const etaWindow = formatEtaWindow(snapshot);

  const escrowFootnote = order ? buildEscrowFootnote(normalised, order) : null;

  const shortOrderId = order ? order.id.slice(0, 8).toUpperCase() : '';
  const statusLabel = order ? humaniseStatus(order.status) : '';

  return {
    isSeller,
    capabilities,
    canDispatch,
    canProposeExtension,
    pendingExtension,
    snapshot,
    deliveryMode,
    isIntegrated,
    labelGenerationUnavailable,
    shipByLabel,
    shipByDaysLeft,
    shipByUrgent,
    shipByOverdue,
    shipByText,
    serviceName,
    etaWindow,
    escrowFootnote,
    statusLabel,
    shortOrderId,
  };
}
