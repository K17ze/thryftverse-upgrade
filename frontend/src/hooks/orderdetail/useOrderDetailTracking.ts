import { useMemo } from 'react';
import {
  formatTimelineDate,
  getParcelEventDisplay,
  buildTimelineEntries,
  formatEtaWindowFromSnapshot,
  parseEstimatedDeliveryDate,
  isStaleTrackingEvent,
  formatPackageSummary } from '../../utils/orderDetailLogic';
import { t } from '../../i18n';
import type { CommerceOrder, OrderParcelEvent } from '../../services/commerceApi';
import type { FulfilmentSnapshot } from '../../components/orders/orderCapabilities';
import type { IssueCategory } from '../../components/orders/IssueCategorySelector';
import type { TimelineEntry } from '../../components/orders/OrderTrackingTimeline';
import type { SupportTicket } from '../../store/useStore';

export interface UseOrderDetailTrackingParams {
  backendOrder: CommerceOrder | null;
  parcelEvents: OrderParcelEvent[];
  hasReview: boolean;
  normalisedStatus: string;
  isBuyer: boolean;
  openTicket: SupportTicket | undefined;
}

export interface UseOrderDetailTrackingResult {
  timelineEntries: TimelineEntry[];
  latestParcelEvent: OrderParcelEvent | null;
  shipmentLastUpdated: string | undefined;
  latestEventSummary: string | null;
  snapshot: FulfilmentSnapshot | null;
  etaWindow: string | null;
  estimatedDeliveryDate: Date | null;
  estimatedDeliveryLabel: string | null;
  isStaleTracking: boolean;
  contextualIssues: IssueCategory[];
  packageSummary: string | null;
  showShipmentDetails: boolean;
}

/**
 * Tracking/timeline derived data for OrderDetailScreen: timeline entries
 * (via buildTimelineEntries — the logic owner), latest parcel event and
 * its summary line, ETA from the immutable fulfilment snapshot, stale
 * tracking detection, contextual issue categories, and package summary.
 *
 * All logic relocated verbatim from OrderDetailScreen.
 */
export function useOrderDetailTracking({
  backendOrder,
  parcelEvents,
  hasReview,
  normalisedStatus,
  isBuyer,
  openTicket }: UseOrderDetailTrackingParams): UseOrderDetailTrackingResult {
  // --- Timeline ---
  const timelineEntries = useMemo(() => {
    if (!backendOrder) return [];
    return buildTimelineEntries(normalisedStatus, backendOrder, parcelEvents, {
      hasOpenResolution: Boolean(openTicket),
      hasReview,
      deliveredAt: backendOrder.deliveredAt });
  }, [backendOrder, normalisedStatus, parcelEvents, openTicket, hasReview]);

  // --- Shipment details ---
  const latestParcelEvent = parcelEvents.length > 0
    ? [...parcelEvents].sort((a, b) => {
        const aTime = a.occurredAt ?? a.receivedAt;
        const bTime = b.occurredAt ?? b.receivedAt;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      })[0]
    : null;

  const shipmentLastUpdated = formatTimelineDate(
    latestParcelEvent?.occurredAt ?? latestParcelEvent?.receivedAt
  );

  // --- Latest parcel event summary ---
  // Per report §11.3: a single muted text line above the timeline gives the
  // buyer "where is my parcel now?" at a glance — carrier/source + freshness.
  // Format: "Latest: Out for delivery · Royal Mail · 2h ago"
  const latestEventSummary = useMemo(() => {
    if (!latestParcelEvent) return null;
    const display = getParcelEventDisplay(latestParcelEvent.eventType);
    const parts: string[] = [`Latest: ${display.label}`];
    // Carrier / source
    const carrier = latestParcelEvent.provider || backendOrder?.shippingProvider;
    if (carrier) parts.push(carrier);
    // Freshness — relative time
    const eventTime = latestParcelEvent.occurredAt ?? latestParcelEvent.receivedAt;
    const eventMs = new Date(eventTime).getTime();
    if (Number.isFinite(eventMs)) {
      const diffMs = Date.now() - eventMs;
      if (diffMs < 0) {
        // future-dated event — just show absolute
      } else if (diffMs < 60 * 1000) {
        parts.push(t('orderDetail.tracking.justNow'));
      } else if (diffMs < 60 * 60 * 1000) {
        parts.push(t('orderDetail.tracking.minutesAgo', { minutes: Math.floor(diffMs / (60 * 1000)) }));
      } else if (diffMs < 24 * 60 * 60 * 1000) {
        parts.push(t('orderDetail.tracking.hoursAgo', { hours: Math.floor(diffMs / (60 * 60 * 1000)) }));
      } else {
        const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
        parts.push(t('orderDetail.tracking.daysAgo', { days }));
      }
    }
    return parts.join(' · ');
  }, [latestParcelEvent, backendOrder?.shippingProvider]);

  // --- ETA from fulfilment snapshot ---
  const snapshot = backendOrder?.fulfilmentSnapshot ?? null;
  const etaWindow = formatEtaWindowFromSnapshot(snapshot);

  // Estimated delivery date is server-derived, not client-invented.
  // Per P0-4: "The client may format time. It must not invent a deadline
  // that changes rights, money, delivery promise or eligibility."
  // The server provides estimatedDeliveryAt; the client only formats it.
  const estimatedDeliveryDate = useMemo(() => {
    return parseEstimatedDeliveryDate(backendOrder);
  }, [backendOrder]);

  const estimatedDeliveryLabel = estimatedDeliveryDate
    ? estimatedDeliveryDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : null;

  // --- Stale event indicator ---
  // If the last parcel event is > 48 hours old and the order is still in transit,
  // show a "tracking may be delayed" warning.
  const isStaleTracking = useMemo(() => {
    return isStaleTrackingEvent(latestParcelEvent, normalisedStatus);
  }, [latestParcelEvent, normalisedStatus]);

  // --- Contextual issue categories ---
  // Per report §11.3: problem entry is contextual — the buyer sees the
  // issue type relevant to their situation, not a generic support list.
  //   before first scan  → "Seller says it was dropped off, but the carrier hasn't scanned it"
  //   in transit overdue → "Delivery is taking longer than expected"
  //   delivered          → "I can't find the parcel" / "Something is wrong with the item"
  //   return             → "Track my return"
  const contextualIssues = useMemo((): IssueCategory[] => {
    if (!isBuyer) return [];

    // Before first scan: shipped but carrier has not scanned it yet
    const isShippedState =
      normalisedStatus === 'shipped' ||
      normalisedStatus === 'in transit' ||
      normalisedStatus === 'out for delivery';
    const hasParcelEvents = parcelEvents.length > 0;
    if (isShippedState && !hasParcelEvents) {
      return [
        {
          id: 'carrier_not_scanned',
          label: t('orderDetail.issue.carrierNotScanned.label'),
          description: t('orderDetail.issue.carrierNotScanned.desc') },
      ];
    }

    // In transit overdue: stale tracking
    if (isStaleTracking) {
      return [
        {
          id: 'delivery_delayed',
          label: t('orderDetail.issue.deliveryDelayed.label'),
          description: t('orderDetail.issue.deliveryDelayed.desc') },
      ];
    }

    // Delivered: parcel or item problems
    if (normalisedStatus === 'delivered') {
      return [
        {
          id: 'parcel_not_found',
          label: t('orderDetail.issue.parcelNotFound.label'),
          description: t('orderDetail.issue.parcelNotFound.desc') },
        {
          id: 'item_problem',
          label: t('orderDetail.issue.itemProblem.label'),
          description: t('orderDetail.issue.itemProblem.desc') },
      ];
    }

    // Return flow
    if (normalisedStatus === 'returned' || normalisedStatus === 'delivery failed') {
      return [
        {
          id: 'track_return',
          label: t('orderDetail.issue.trackReturn.label'),
          description: t('orderDetail.issue.trackReturn.desc') },
      ];
    }

    return [];
  }, [isBuyer, normalisedStatus, parcelEvents.length, isStaleTracking]);

  // --- Package summary from snapshot ---
  const packageSummary = useMemo(() => {
    return formatPackageSummary(snapshot);
  }, [snapshot]);

  const showShipmentDetails = Boolean(
    backendOrder?.shippingProvider
    || backendOrder?.trackingNumber
    || backendOrder?.shippingLabelUrl
    || latestParcelEvent
  );

  return {
    timelineEntries,
    latestParcelEvent,
    shipmentLastUpdated,
    latestEventSummary,
    snapshot,
    etaWindow,
    estimatedDeliveryDate,
    estimatedDeliveryLabel,
    isStaleTracking,
    contextualIssues,
    packageSummary,
    showShipmentDetails,
  };
}
