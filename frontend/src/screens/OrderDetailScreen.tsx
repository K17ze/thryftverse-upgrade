import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Linking,
  Alert,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useBackendData } from '../context/BackendDataContext';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { Space, Typography } from '../theme/designTokens';
import {
  CommerceOrder,
  OrderParcelEvent,
  getOrder,
  getOrderParcelEvents,
  cancelOrder,
  shipOrder,
  deliverOrder,
} from '../services/commerceApi';
import { parseApiError } from '../lib/apiClient';
import { getListingCoverUri } from '../utils/media';
import { haptics } from '../utils/haptics';
import { CachedImage } from '../components/CachedImage';
import { OrderDetailSummary } from '../components/orders/OrderDetailSummary';
import { OrderTrackingTimeline, TimelineEntry } from '../components/orders/OrderTrackingTimeline';
import { OrderActionFooter, OrderActionConfig } from '../components/orders/OrderActionFooter';
import { OrderActionsSheet, OrderActionItem } from '../components/orders/OrderActionsSheet';
import { DispatchCountdown } from '../components/orders/DispatchCountdown';
import { OrderStatusStepper, OrderStepperStage } from '../components/orders/OrderStatusStepper';
import { ReviewPromptSheet } from '../components/orders/ReviewPromptSheet';
import { OrderDetailSkeleton } from '../components/orders/OrderDetailSkeleton';

type RouteT = RouteProp<RootStackParamList, 'OrderDetail'>;

type OrderMutation = 'cancel' | 'ship' | 'deliver' | null;

// --- Status normalisation ---

function normaliseOrderStatus(status?: string): string {
  return (status ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

const KNOWN_STATUSES = new Set([
  'created',
  'paid',
  'processing',
  'preparing',
  'shipped',
  'in transit',
  'out for delivery',
  'delivered',
  'completed',
  'cancelled',
  'refunded',
  'delivery failed',
  'returned',
]);

function isKnownStatus(normalised: string): boolean {
  return KNOWN_STATUSES.has(normalised);
}

function humaniseStatus(normalised: string): string {
  if (!normalised) {
    return 'Status unavailable';
  }

  const map: Record<string, string> = {
    'created': 'Awaiting payment',
    'paid': 'Paid',
    'processing': 'Processing',
    'preparing': 'Preparing',
    'shipped': 'Shipped',
    'in transit': 'In transit',
    'out for delivery': 'Out for delivery',
    'delivered': 'Delivered',
    'completed': 'Completed',
    'cancelled': 'Cancelled',
    'refunded': 'Refunded',
    'delivery failed': 'Delivery failed',
    'returned': 'Returned',
  };

  if (map[normalised]) {
    return map[normalised];
  }

  // Unknown: capitalise words, don't guess
  return normalised
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getStatusExplanation(normalised: string): string {
  if (!normalised) {
    return 'The current status of this order is unavailable.';
  }

  const map: Record<string, string> = {
    'created': 'Payment has not been confirmed yet.',
    'paid': 'Payment has been confirmed. The seller has been notified.',
    'processing': 'The order is being processed.',
    'preparing': 'The seller is preparing the item.',
    'shipped': 'The parcel has been dispatched.',
    'in transit': 'The carrier has your parcel.',
    'out for delivery': 'The parcel is out for delivery today.',
    'delivered': 'Delivery has been confirmed.',
    'completed': 'This order is complete.',
    'cancelled': 'This order was cancelled.',
    'refunded': 'This order was refunded.',
    'delivery failed': 'The carrier could not complete delivery.',
    'returned': 'The parcel was returned to the sender.',
  };

  if (map[normalised]) {
    return map[normalised];
  }

  return 'The current status of this order is not fully recognised.';
}

type StatusTone = 'pending' | 'active' | 'success' | 'danger' | 'muted';

function getStatusTone(normalised: string): StatusTone {
  if (normalised === 'created') return 'pending';
  if (normalised === 'paid' || normalised === 'processing' || normalised === 'preparing') return 'active';
  if (normalised === 'shipped' || normalised === 'in transit' || normalised === 'out for delivery') return 'active';
  if (normalised === 'delivered' || normalised === 'completed') return 'success';
  if (normalised === 'cancelled' || normalised === 'refunded' || normalised === 'delivery failed' || normalised === 'returned') return 'danger';
  return 'muted';
}

// --- Date formatting ---

function formatTimelineDate(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// --- Terminal status check ---

const TERMINAL_STATUSES = new Set([
  'delivered',
  'completed',
  'cancelled',
  'refunded',
  'returned',
]);

function isTerminalStatus(normalised: string): boolean {
  return TERMINAL_STATUSES.has(normalised);
}

// --- Parcel event display ---

function getParcelEventDisplay(
  eventType: OrderParcelEvent['eventType']
): { label: string; subtitle: string } {
  switch (eventType) {
    case 'picked_up':
      return { label: 'Picked up', subtitle: 'Carrier collected the parcel from the seller.' };
    case 'in_transit':
      return { label: 'In transit', subtitle: 'Parcel is moving through the carrier network.' };
    case 'out_for_delivery':
      return { label: 'Out for delivery', subtitle: 'Parcel is out for delivery today.' };
    case 'delivered':
      return { label: 'Delivered', subtitle: 'Delivery confirmed.' };
    case 'collection_confirmed':
      return { label: 'Collection confirmed', subtitle: 'Collection has been confirmed.' };
    case 'delivery_failed':
      return { label: 'Delivery failed', subtitle: 'Carrier attempted delivery but could not complete it.' };
    case 'returned':
      return { label: 'Returned', subtitle: 'Parcel is being returned to the sender.' };
    default:
      return { label: 'Carrier update', subtitle: 'Carrier event received.' };
  }
}

// --- Timeline semantic keys ---

type TimelineSemanticKey =
  | 'created'
  | 'paid'
  | 'shipped'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'collection_confirmed'
  | 'delivery_failed'
  | 'returned'
  | 'cancelled'
  | 'refunded'
  | 'completed'
  | 'processing'
  | 'preparing'
  | 'unknown';

const PARCEL_EVENT_SEMANTIC_KEY: Record<OrderParcelEvent['eventType'], TimelineSemanticKey> = {
  picked_up: 'picked_up',
  in_transit: 'in_transit',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  collection_confirmed: 'collection_confirmed',
  delivery_failed: 'delivery_failed',
  returned: 'returned',
};

function getStatusSemanticKey(normalisedStatus: string): TimelineSemanticKey {
  const map: Record<string, TimelineSemanticKey> = {
    'created': 'created',
    'paid': 'paid',
    'processing': 'processing',
    'preparing': 'preparing',
    'shipped': 'shipped',
    'in transit': 'in_transit',
    'out for delivery': 'out_for_delivery',
    'delivered': 'delivered',
    'completed': 'completed',
    'cancelled': 'cancelled',
    'refunded': 'refunded',
    'delivery failed': 'delivery_failed',
    'returned': 'returned',
  };

  return map[normalisedStatus] ?? 'unknown';
}

// --- Parcel event timestamp ---

function parcelEventTimestamp(event: OrderParcelEvent): number {
  const value = event.occurredAt ?? event.receivedAt;
  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp)
    ? timestamp
    : Number.MAX_SAFE_INTEGER;
}

// --- Timeline builder ---

function buildTimelineEntries(
  normalisedStatus: string,
  order: CommerceOrder | null,
  parcelEvents: OrderParcelEvent[]
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const represented = new Set<TimelineSemanticKey>();

  // 1. Order created — always
  entries.push({
    id: 'created',
    label: 'Order created',
    subtitle: 'The order was placed.',
    date: formatTimelineDate(order?.createdAt),
    state: 'completed',
  });
  represented.add('created');

  // 2. Payment confirmed — when status proves payment occurred
  const paymentProvenStatuses: TimelineSemanticKey[] = [
    'paid', 'processing', 'preparing', 'shipped', 'in_transit',
    'out_for_delivery', 'delivered', 'completed', 'refunded',
    'returned', 'delivery_failed',
  ];
  const currentSemanticKey = getStatusSemanticKey(normalisedStatus);

  if (paymentProvenStatuses.includes(currentSemanticKey)) {
    entries.push({
      id: 'paid',
      label: 'Payment confirmed',
      subtitle: 'Payment has been confirmed.',
      state: 'completed',
    });
    represented.add('paid');
  }

  // 3. Shipped — when shippedAt exists and no equivalent carrier event
  const hasShippedParcelEvent = parcelEvents.some(
    (e) => e.eventType === 'picked_up' || e.eventType === 'in_transit'
  );
  if (order?.shippedAt && !hasShippedParcelEvent) {
    entries.push({
      id: 'shipped',
      label: 'Shipped',
      subtitle: 'The parcel has been dispatched.',
      date: formatTimelineDate(order.shippedAt),
      state: 'completed',
    });
    represented.add('shipped');
  }

  // 4. Parcel events — sorted chronologically
  const sortedEvents = [...parcelEvents].sort(
    (a, b) => parcelEventTimestamp(a) - parcelEventTimestamp(b)
  );

  for (const event of sortedEvents) {
    const display = getParcelEventDisplay(event.eventType);
    const isFailure = event.eventType === 'delivery_failed' || event.eventType === 'returned';
    const semanticKey = PARCEL_EVENT_SEMANTIC_KEY[event.eventType];
    entries.push({
      id: `parcel_${event.id}`,
      label: display.label,
      subtitle: display.subtitle,
      date: formatTimelineDate(event.occurredAt ?? event.receivedAt),
      state: isFailure ? 'failure' : 'completed',
    });
    represented.add(semanticKey);
  }

  // 5. Delivered — when deliveredAt exists and no equivalent carrier event
  const hasDeliveredParcelEvent = parcelEvents.some(
    (e) => e.eventType === 'delivered' || e.eventType === 'collection_confirmed'
  );
  if (order?.deliveredAt && !hasDeliveredParcelEvent) {
    entries.push({
      id: 'delivered',
      label: 'Delivered',
      subtitle: 'Delivery has been confirmed.',
      date: formatTimelineDate(order.deliveredAt),
      state: 'completed',
    });
    represented.add('delivered');
  }

  // 6. Current status entry — only when not already represented
  if (normalisedStatus !== 'created' && !represented.has(currentSemanticKey)) {
    const isFailure =
      currentSemanticKey === 'delivery_failed' ||
      currentSemanticKey === 'returned' ||
      currentSemanticKey === 'cancelled' ||
      currentSemanticKey === 'refunded';
    const isTerminal = isTerminalStatus(normalisedStatus);
    entries.push({
      id: 'current_status',
      label: humaniseStatus(normalisedStatus),
      subtitle: getStatusExplanation(normalisedStatus),
      state: isFailure ? 'failure' : isTerminal ? 'completed' : 'active',
    });
    represented.add(currentSemanticKey);
  }

  return entries;
}

// --- Component ---

export default function OrderDetailScreen() {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const { formatFromFiat } = useFormattedPrice();
  const { listings } = useBackendData();
  const { orderId } = route.params;
  const { show } = useToast();

  const currentUser = useStore((state) => state.currentUser);
  const loadSupportTicketsForOrderFromApi = useStore((state) => state.loadSupportTicketsForOrderFromApi);
  const getSupportTicketsForOrder = useStore((state) => state.getSupportTicketsForOrder);

  const [backendOrder, setBackendOrder] = useState<CommerceOrder | null>(null);
  const [parcelEvents, setParcelEvents] = useState<OrderParcelEvent[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [parcelError, setParcelError] = useState<string | null>(null);
  const [orderMutation, setOrderMutation] = useState<OrderMutation>(null);
  const [actionsSheetVisible, setActionsSheetVisible] = useState(false);
  const [reviewPromptVisible, setReviewPromptVisible] = useState(false);
  const [reviewPromptShown, setReviewPromptShown] = useState(false);

  const isMountedRef = useRef(true);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  // --- Fetch order ---
  const fetchOrder = useCallback(async () => {
    try {
      const order = await getOrder(orderId);
      if (!isMountedRef.current) return;
      setBackendOrder(order);
      setLoadError(null);
      return order;
    } catch (error) {
      if (!isMountedRef.current) return;
      if (!backendOrder) {
        setLoadError('Order could not be loaded. Check your connection and try again.');
      } else {
        setLoadError('Order could not be refreshed. Showing the last loaded state.');
      }
      return null;
    }
  }, [orderId, backendOrder]);

  // --- Fetch parcel events ---
  const fetchParcelEvents = useCallback(async () => {
    try {
      const events = await getOrderParcelEvents(orderId);
      if (!isMountedRef.current) return;
      setParcelEvents(events);
      setParcelError(null);
    } catch {
      if (!isMountedRef.current) return;
      setParcelError('Carrier tracking events are unavailable right now.');
    }
  }, [orderId]);

  // --- Full refresh ---
  const refreshOrder = useCallback(async (isManual: boolean = false) => {
    if (isManual) {
      setIsRefreshing(true);
    }

    const [orderResult] = await Promise.all([
      fetchOrder(),
      fetchParcelEvents(),
    ]);

    if (!isMountedRef.current) return;

    if (isManual) {
      setIsRefreshing(false);
    } else {
      setIsInitialLoading(false);
    }

    return orderResult;
  }, [fetchOrder, fetchParcelEvents]);

  // --- Focus-aware refresh ---
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        await refreshOrder(false);
        void loadSupportTicketsForOrderFromApi(orderId);
      })();

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
      };
    }, [refreshOrder, orderId, loadSupportTicketsForOrderFromApi])
  );

  // --- Polling interval based on order status ---
  useEffect(() => {
    if (!backendOrder) return;

    const normalisedStatus = normaliseOrderStatus(backendOrder.status);
    const isTerminal = isTerminalStatus(normalisedStatus);
    const intervalMs = isTerminal ? 300_000 : 30_000;

    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }

    refreshIntervalRef.current = setInterval(() => {
      void refreshOrder(false);
    }, intervalMs);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [backendOrder?.status, refreshOrder]);

  // --- Support tickets ---
  const supportTickets = getSupportTicketsForOrder(orderId);
  const openTicket = supportTickets.find((t) => t.status === 'open');

  // --- Auto-surface review prompt once after delivery ---
  useEffect(() => {
    if (!backendOrder || reviewPromptShown) return;
    const normalised = normaliseOrderStatus(backendOrder.status);
    const isDelivered = normalised === 'delivered' || normalised === 'completed';
    const buyerId = backendOrder.buyerId;
    if (isDelivered && currentUser?.id === buyerId) {
      const timer = setTimeout(() => {
        if (isMountedRef.current && !reviewPromptShown) {
          setReviewPromptVisible(true);
          setReviewPromptShown(true);
        }
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [backendOrder, reviewPromptShown, currentUser?.id]);

  // --- Derived data ---
  const normalisedStatus = backendOrder ? normaliseOrderStatus(backendOrder.status) : '';
  const isKnown = isKnownStatus(normalisedStatus);
  const statusLabel = humaniseStatus(normalisedStatus);
  const statusExplanation = getStatusExplanation(normalisedStatus);
  const isTerminal = isTerminalStatus(normalisedStatus);

  const isBuyer = currentUser?.id === backendOrder?.buyerId;
  const isSeller = currentUser?.id === backendOrder?.sellerId;
  const statusTone = getStatusTone(normalisedStatus);
  const statusColor = (() => {
    switch (statusTone) {
      case 'success': return colors.success;
      case 'active': return colors.brand;
      case 'danger': return colors.danger;
      case 'pending': return colors.warning;
      default: return colors.textMuted;
    }
  })();

  const listingId = backendOrder?.listingId;
  const existingListing = listingId ? listings.find((item) => item.id === listingId) : undefined;
  const listingExists = Boolean(existingListing);

  // Historical snapshot authority
  const orderTitle =
    backendOrder?.listingTitle
    || existingListing?.title
    || 'Ordered item';

  const orderImage =
    backendOrder?.listingImageUrl
    || getListingCoverUri(existingListing?.images ?? [], '');

  const orderSubtotal = backendOrder?.subtotalGbp;

  const orderSubtitle = [
    existingListing?.size,
    existingListing?.condition,
  ].filter(Boolean).join(' - ') || undefined;

  // --- Counterparty ---
  const counterparty = useMemo(() => {
    if (!backendOrder) return null;

    if (isBuyer) {
      // Buyer sees seller
      const seller = backendOrder.seller ?? (existingListing?.seller ? {
        id: existingListing.seller.id,
        username: existingListing.seller.username,
        avatar: existingListing.seller.avatar,
      } : null);

      if (!seller) return null;

      return {
        role: 'Seller' as const,
        id: seller.id,
        username: seller.username ?? `Seller ${seller.id.slice(0, 8)}`,
        avatar: seller.avatar,
      };
    }

    if (isSeller) {
      // Seller sees buyer
      const buyer = backendOrder.buyer;
      if (!buyer) return null;

      return {
        role: 'Buyer' as const,
        id: buyer.id,
        username: buyer.username ?? `Buyer ${buyer.id.slice(0, 8)}`,
        avatar: buyer.avatar,
      };
    }

    return null;
  }, [backendOrder, isBuyer, isSeller, existingListing]);

  // --- Transaction breakdown ---
  const subtotal = backendOrder?.subtotalGbp ?? 0;
  const platformCharge = backendOrder?.platformChargeGbp ?? 0;
  const buyerProtectionFee = backendOrder?.buyerProtectionFeeGbp;
  const postageFee = backendOrder?.postageFeeGbp;
  const totalPaid = backendOrder?.totalGbp ?? 0;

  // --- Timeline ---
  const timelineEntries = useMemo(() => {
    if (!backendOrder) return [];
    return buildTimelineEntries(normalisedStatus, backendOrder, parcelEvents);
  }, [backendOrder, normalisedStatus, parcelEvents]);

  // --- Stepper stage ---
  const stepperStage = useMemo<OrderStepperStage>(() => {
    const key = getStatusSemanticKey(normalisedStatus);
    switch (key) {
      case 'created':
        return 'placed';
      case 'paid':
      case 'processing':
      case 'preparing':
        return 'paid';
      case 'shipped':
      case 'picked_up':
        return 'shipped';
      case 'in_transit':
      case 'out_for_delivery':
        return 'in_transit';
      case 'delivered':
      case 'completed':
      case 'collection_confirmed':
        return 'delivered';
      default:
        // For cancelled/refunded/returned/delivery_failed, show as paid (the furthest confirmed stage)
        return 'paid';
    }
  }, [normalisedStatus]);

  const stepperIsFailure = useMemo(() => {
    const key = getStatusSemanticKey(normalisedStatus);
    return key === 'cancelled' || key === 'refunded' || key === 'returned' || key === 'delivery_failed';
  }, [normalisedStatus]);

  const stepperFailureLabel = useMemo(() => {
    const key = getStatusSemanticKey(normalisedStatus);
    if (key === 'cancelled') return 'Order cancelled';
    if (key === 'refunded') return 'Refunded';
    if (key === 'returned') return 'Returned to sender';
    if (key === 'delivery_failed') return 'Delivery failed';
    return 'Cancelled';
  }, [normalisedStatus]);

  const stepperTimestamps = useMemo(() => {
    if (!backendOrder) return undefined;
    const ts: Partial<Record<OrderStepperStage, string>> = {};
    if (backendOrder.createdAt) ts.placed = backendOrder.createdAt;
    // Paid timestamp — use createdAt as proxy if no separate paidAt
    if (backendOrder.shippedAt) {
      ts.shipped = backendOrder.shippedAt;
    }
    if (backendOrder.deliveredAt) {
      ts.delivered = backendOrder.deliveredAt;
    }
    // In-transit timestamp from first in_transit parcel event
    const inTransitEvent = parcelEvents.find((e) => e.eventType === 'in_transit' || e.eventType === 'picked_up');
    if (inTransitEvent) {
      ts.in_transit = inTransitEvent.occurredAt ?? inTransitEvent.receivedAt;
    }
    return ts;
  }, [backendOrder, parcelEvents]);

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

  const showShipmentDetails = Boolean(
    backendOrder?.shippingProvider
    || backendOrder?.trackingNumber
    || backendOrder?.shippingLabelUrl
    || latestParcelEvent
  );

  // --- Order short ID ---
  const shortOrderId = backendOrder?.id ? backendOrder.id.slice(0, 8).toUpperCase() : '';

  // --- Mutation handlers ---

  const handleCancel = useCallback(async () => {
    if (orderMutation) return;
    setOrderMutation('cancel');
    try {
      await cancelOrder(orderId);
      show('Order cancelled', 'info');
      await refreshOrder(false);
    } catch (error) {
      show(parseApiError(error).message, 'error');
    } finally {
      if (isMountedRef.current) setOrderMutation(null);
    }
  }, [orderMutation, orderId, show, refreshOrder]);

  const handleShip = useCallback(async () => {
    if (orderMutation) return;
    setOrderMutation('ship');
    try {
      await shipOrder(orderId);
      show('Order marked as shipped', 'success');
      await refreshOrder(false);
    } catch (error) {
      show(parseApiError(error).message, 'error');
    } finally {
      if (isMountedRef.current) setOrderMutation(null);
    }
  }, [orderMutation, orderId, show, refreshOrder]);

  const handleDeliver = useCallback(async () => {
    if (orderMutation) return;
    setOrderMutation('deliver');
    try {
      await deliverOrder(orderId);
      show('Delivery confirmed', 'success');
      await refreshOrder(false);
    } catch (error) {
      show(parseApiError(error).message, 'error');
    } finally {
      if (isMountedRef.current) setOrderMutation(null);
    }
  }, [orderMutation, orderId, show, refreshOrder]);

  // --- Action availability ---

  const canCancel = isBuyer && (normalisedStatus === 'created' || normalisedStatus === 'paid');
  const canShip = isSeller && (normalisedStatus === 'paid' || normalisedStatus === 'processing' || normalisedStatus === 'preparing');
  const canDeliver = isBuyer && (normalisedStatus === 'shipped' || normalisedStatus === 'in transit' || normalisedStatus === 'out for delivery');
  const canReportIssue = !isTerminal && normalisedStatus !== 'created' && normalisedStatus !== 'cancelled' && normalisedStatus !== 'refunded';

  const mutationLocked = orderMutation !== null;

  // --- Build action footer ---
  const footerActions = useMemo((): { primary?: OrderActionConfig; secondary?: OrderActionConfig } => {
    if (!backendOrder || !isKnown) return {};

    if (canShip && canCancel) {
      return {
        primary: {
          label: 'Mark shipped',
          onPress: () => { haptics.heavyPress(); handleShip(); },
          variant: 'primary',
          loading: orderMutation === 'ship',
          disabled: mutationLocked && orderMutation !== 'ship',
          accessibilityLabel: 'Mark order as shipped',
        },
        secondary: {
          label: 'Cancel order',
          onPress: () => {
            haptics.heavyPress();
            Alert.alert(
              'Cancel this order?',
              'This will cancel the order and notify the buyer. This action cannot be undone.',
              [
                { text: 'Keep order', style: 'cancel' },
                { text: 'Cancel order', style: 'destructive', onPress: handleCancel },
              ]
            );
          },
          variant: 'destructive',
          loading: orderMutation === 'cancel',
          disabled: mutationLocked && orderMutation !== 'cancel',
          accessibilityLabel: 'Cancel order',
        },
      };
    }

    if (canShip) {
      return {
        primary: {
          label: 'Mark shipped',
          onPress: () => {
            haptics.heavyPress();
            Alert.alert(
              'Mark as shipped?',
              'The order will be marked as shipped without tracking details. You can add tracking information later.',
              [
                { text: 'Not yet', style: 'cancel' },
                { text: 'Mark shipped', style: 'destructive', onPress: handleShip },
              ]
            );
          },
          variant: 'primary',
          loading: orderMutation === 'ship',
          disabled: mutationLocked && orderMutation !== 'ship',
          accessibilityLabel: 'Mark order as shipped',
        },
      };
    }

    if (canDeliver) {
      return {
        primary: {
          label: 'Confirm delivery',
          onPress: () => {
            haptics.heavyPress();
            Alert.alert(
              'Confirm receipt?',
              'By confirming, you confirm the item matches the listing. This releases the held funds to the seller. If something is wrong, report an issue instead.',
              [
                { text: 'Not yet', style: 'cancel' },
                { text: 'Confirm receipt', style: 'default', onPress: handleDeliver },
              ]
            );
          },
          variant: 'primary',
          loading: orderMutation === 'deliver',
          disabled: mutationLocked && orderMutation !== 'deliver',
          accessibilityLabel: 'Confirm delivery — releases funds to seller',
        },
      };
    }

    if (canCancel) {
      return {
        primary: {
          label: 'Cancel order',
          onPress: () => {
            haptics.heavyPress();
            Alert.alert(
              'Cancel this order?',
              'This will cancel the order and notify the seller. This action cannot be undone.',
              [
                { text: 'Keep order', style: 'cancel' },
                { text: 'Cancel order', style: 'destructive', onPress: handleCancel },
              ]
            );
          },
          variant: 'destructive',
          loading: orderMutation === 'cancel',
          disabled: mutationLocked && orderMutation !== 'cancel',
          accessibilityLabel: 'Cancel order',
        },
      };
    }

    if (canReportIssue) {
      return {
        primary: {
          label: 'Report an issue',
          onPress: () => { haptics.tap(); navigation.navigate('OrderSupport', { orderId }); },
          variant: 'secondary',
          accessibilityLabel: 'Report an issue with this order',
        },
      };
    }

    if (isBuyer && (normalisedStatus === 'delivered' || normalisedStatus === 'completed')) {
      return {
        primary: {
          label: 'Leave a review',
          onPress: () => { haptics.tap(); setReviewPromptVisible(true); },
          variant: 'primary',
          accessibilityLabel: 'Write a review for this order',
        },
      };
    }

    return {};
  }, [backendOrder, isKnown, canShip, canCancel, canDeliver, canReportIssue, orderMutation, mutationLocked, handleShip, handleCancel, handleDeliver, navigation, orderId, isBuyer, normalisedStatus]);

  // --- Copy tracking number ---
  const handleCopyTracking = useCallback(async (trackingNumber: string) => {
    haptics.tap();
    try {
      await Clipboard.setStringAsync(trackingNumber);
      show('Tracking number copied', 'success');
    } catch {
      show('Could not copy tracking number', 'error');
    }
  }, [show]);

  // --- Open shipping label ---
  const handleOpenShippingLabel = useCallback(async (url: string) => {
    haptics.tap();
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        show('Unable to open shipping label URL', 'error');
        return;
      }
      await Linking.openURL(url);
    } catch {
      show('Unable to open shipping label', 'error');
    }
  }, [show]);

  // --- Track on carrier site ---
  const carrierTrackingUrl = useMemo(() => {
    if (!backendOrder?.trackingNumber || !backendOrder?.shippingProvider) return null;
    const tn = backendOrder.trackingNumber;
    const carrier = backendOrder.shippingProvider.toLowerCase();
    // Map common carriers to their public tracking pages
    if (carrier.includes('royal mail')) return `https://www.royalmail.com/track-your-item/?trackNumber=${encodeURIComponent(tn)}`;
    if (carrier.includes('dpd')) return `https://www.dpd.co.uk/tracking?trackingRef=${encodeURIComponent(tn)}`;
    if (carrier.includes('evri') || carrier.includes('hermes')) return `https://www.evri.com/track-a-parcel/${encodeURIComponent(tn)}`;
    if (carrier.includes('yodel')) return `https://www.yodel.co.uk/track?trackingReference=${encodeURIComponent(tn)}`;
    if (carrier.includes('ups')) return `https://www.ups.com/track?tracknum=${encodeURIComponent(tn)}`;
    if (carrier.includes('dhl')) return `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(tn)}`;
    if (carrier.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tn)}`;
    return null;
  }, [backendOrder?.trackingNumber, backendOrder?.shippingProvider]);

  const handleTrackOnCarrierSite = useCallback(async () => {
    if (!carrierTrackingUrl) return;
    haptics.tap();
    try {
      const supported = await Linking.canOpenURL(carrierTrackingUrl);
      if (!supported) {
        show('Unable to open carrier tracking page', 'error');
        return;
      }
      await Linking.openURL(carrierTrackingUrl);
    } catch {
      show('Unable to open carrier tracking page', 'error');
    }
  }, [carrierTrackingUrl, show]);

  // --- Manual refresh ---
  const handleManualRefresh = useCallback(() => {
    haptics.tap();
    void refreshOrder(true);
  }, [refreshOrder]);

  // --- Build overflow actions ---
  const overflowActions = useMemo((): OrderActionItem[] => {
    const actions: OrderActionItem[] = [];

    actions.push({
      key: 'receipt',
      label: 'View receipt',
      icon: 'receipt-outline',
      onPress: () => navigation.navigate('OrderReceipt', { orderId }),
    });

    if (canShip) {
      actions.push({
        key: 'dispatch',
        label: 'Dispatch item',
        icon: 'cube-outline',
        onPress: () => navigation.navigate('SellerFulfilment', { orderId }),
        variant: 'primary',
      });
    }

    if (counterparty) {
      actions.push({
        key: 'contact',
        label: `Message ${counterparty.role.toLowerCase()}`,
        icon: 'chatbubble-outline',
        onPress: () => navigation.navigate('Chat', {
          conversationId: `${counterparty.id}_${backendOrder?.listingId}`,
          focusQuery: counterparty.username,
          partnerUserId: counterparty.id,
        }),
      });
    }

    actions.push({
      key: 'support',
      label: 'Get help with this order',
      icon: 'help-circle-outline',
      onPress: () => navigation.navigate('OrderSupport', { orderId }),
    });

    if (openTicket) {
      actions.push({
        key: 'view_resolution',
        label: 'View open request',
        icon: 'folder-open-outline',
        onPress: () => navigation.navigate('SupportTicketDetail', { ticketId: openTicket.id }),
        variant: 'primary',
      });
    }

    if (isBuyer && (normalisedStatus === 'delivered' || normalisedStatus === 'completed')) {
      actions.push({
        key: 'review',
        label: 'Write a review',
        icon: 'star-outline',
        onPress: () => { haptics.tap(); setReviewPromptVisible(true); },
        variant: 'primary',
      });
    }

    return actions;
  }, [navigation, orderId, canShip, counterparty, backendOrder, openTicket, isBuyer, normalisedStatus]);

  // --- Render ---

  if (isInitialLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: colors.border }]}>
          <Pressable
            style={styles.headerBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Order</Text>
          <View style={styles.headerSpacer} />
        </View>
        <OrderDetailSkeleton />
      </SafeAreaView>
    );
  }

  if (!backendOrder && loadError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: colors.border }]}>
          <Pressable
            style={styles.headerBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Order</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={36} color={colors.textMuted} />
          <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>Order could not be loaded</Text>
          <Text style={[styles.errorBody, { color: colors.textMuted }]}>Check your connection and try again.</Text>
          <Pressable
            style={[styles.retryBtn, { backgroundColor: colors.brand }]}
            onPress={() => { haptics.tap(); void refreshOrder(false); }}
            accessibilityRole="button"
            accessibilityLabel="Retry loading order"
          >
            <Text style={[styles.retryBtnText, { color: colors.textInverse }]}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!backendOrder) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: colors.border }]}>
          <Pressable
            style={styles.headerBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Order</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="document-outline" size={36} color={colors.textMuted} />
          <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>Order not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const fiatOpts = { displayMode: 'fiat' as const };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* 1. Compact navigation header */}
      <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: colors.border }]}>
        <Pressable
          style={styles.headerBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Order</Text>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.headerBtn}
            onPress={handleManualRefresh}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Refresh order"
            accessibilityState={{ busy: isRefreshing }}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <Ionicons name="refresh-outline" size={22} color={colors.textPrimary} />
            )}
          </Pressable>
          <Pressable
            style={styles.headerBtn}
            onPress={() => { haptics.tap(); setActionsSheetVisible(true); }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: footerActions.primary || footerActions.secondary ? 100 + insets.bottom : 40 + insets.bottom }]}
      >
        {/* 2. Current order status and order number */}
        <View style={styles.statusHeader}>
          <Text style={[styles.orderNumber, { color: colors.textMuted }]}>ORDER #{shortOrderId}</Text>
          <View style={styles.statusBadgeRow}>
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}15` }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
          </View>
          <Text style={[styles.statusExplanation, { color: colors.textSecondary }]}>{statusExplanation}</Text>
          {backendOrder.updatedAt ? (
            <Text style={[styles.lastUpdated, { color: colors.textMuted }]}>
              Last updated {formatTimelineDate(backendOrder.updatedAt)}
            </Text>
          ) : null}

          {/* Dispatch countdown for seller when order needs shipping */}
          {canShip && backendOrder.createdAt && (
            <DispatchCountdown
              createdAt={backendOrder.createdAt}
              shipped={!!backendOrder.shippedAt}
            />
          )}
        </View>

        {loadError && backendOrder ? (
          <View style={styles.refreshErrorRow}>
            <Ionicons name="alert-circle-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.refreshErrorText, { color: colors.textMuted }]}>{loadError}</Text>
            <Pressable
              onPress={() => { haptics.tap(); void refreshOrder(false); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Retry refresh"
            >
              <Text style={[styles.retryLink, { color: colors.brand }]}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

        {/* 3. Historical item summary */}
        <OrderDetailSummary
          title={orderTitle}
          imageUrl={orderImage}
          subtitle={orderSubtitle}
          priceLabel={formatFromFiat(orderSubtotal ?? 0, 'GBP', fiatOpts)}
          listingAvailable={listingExists}
          onPress={listingExists && listingId ? () => {
            haptics.tap();
            navigation.navigate('ItemDetail', { itemId: listingId });
          } : undefined}
        />

        <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

        {/* 4. Role-aware counterparty */}
        {counterparty ? (
          <View style={styles.counterpartySection}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{counterparty.role}</Text>
            <View style={styles.counterpartyRow}>
              <Pressable
                style={styles.counterpartyIdentity}
                onPress={() => { haptics.tap(); navigation.navigate('UserProfile', { userId: counterparty.id }); }}
                accessibilityRole="button"
                accessibilityLabel={`View ${counterparty.role} profile: ${counterparty.username}`}
              >
                <CachedImage
                  uri={counterparty.avatar ?? ''}
                  style={styles.counterpartyAvatar}
                  contentFit="cover"
                />
                <Text style={[styles.counterpartyName, { color: colors.textPrimary }]} numberOfLines={1}>
                  @{counterparty.username}
                </Text>
              </Pressable>
              <View style={styles.counterpartyActions}>
                <Pressable
                  style={[styles.counterpartyBtn, { borderColor: colors.border }]}
                  onPress={() => {
                    haptics.tap();
                    navigation.navigate('Chat', {
                      conversationId: `${counterparty.id}_${backendOrder.listingId}`,
                      focusQuery: counterparty.username,
                      partnerUserId: counterparty.id,
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Message ${counterparty.role.toLowerCase()}`}
                >
                  <Text style={[styles.counterpartyBtnText, { color: colors.brand }]}>Message</Text>
                </Pressable>
                <Pressable
                  style={[styles.counterpartyBtn, { borderColor: colors.border }]}
                  onPress={() => { haptics.tap(); navigation.navigate('UserProfile', { userId: counterparty.id }); }}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${counterparty.role.toLowerCase()} profile`}
                >
                  <Text style={[styles.counterpartyBtnText, { color: colors.brand }]}>View profile</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

        {/* 4b. Visual status stepper */}
        <View style={styles.timelineSection}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Progress</Text>
          <OrderStatusStepper
            currentStage={stepperStage}
            isFailure={stepperIsFailure}
            failureLabel={stepperFailureLabel}
            stageTimestamps={stepperTimestamps}
          />
        </View>

        {/* 4c. Escrow status indicator — shows when funds are held */}
        {isBuyer && (normalisedStatus === 'paid' || normalisedStatus === 'shipped' || normalisedStatus === 'in transit' || normalisedStatus === 'out for delivery') ? (
          <View style={[styles.escrowBanner, { backgroundColor: `${colors.success}08`, borderColor: `${colors.success}25` }]}>
            <View style={[styles.escrowIconWrap, { backgroundColor: `${colors.success}15` }]}>
              <Ionicons name="lock-closed" size={14} color={colors.success} />
            </View>
            <View style={styles.escrowTextWrap}>
              <Text style={[styles.escrowTitle, { color: colors.textPrimary }]}>Funds held in escrow</Text>
              <Text style={[styles.escrowSub, { color: colors.textSecondary }]}>
                {normalisedStatus === 'paid'
                  ? 'Your payment is safely held until the seller dispatches your item.'
                  : 'Your payment is safely held. Confirm receipt to release funds to the seller.'}
              </Text>
              {(() => {
                if (!backendOrder?.shippedAt) return null;
                const shippedTime = new Date(backendOrder.shippedAt).getTime();
                const autoReleaseMs = 14 * 24 * 60 * 60 * 1000; // 14 days
                const releaseTime = shippedTime + autoReleaseMs;
                const now = Date.now();
                if (now >= releaseTime) return null;
                const daysLeft = Math.ceil((releaseTime - now) / (24 * 60 * 60 * 1000));
                return (
                  <Text style={[styles.escrowCountdown, { color: colors.textMuted }]}>
                    Auto-releases to seller in {daysLeft} day{daysLeft === 1 ? '' : 's'} if not confirmed
                  </Text>
                );
              })()}
            </View>
          </View>
        ) : null}

        <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

        {/* 5. Tracking or order timeline */}
        <View style={styles.timelineSection}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Timeline</Text>
          <OrderTrackingTimeline
            entries={timelineEntries}
            warningText={parcelError ?? undefined}
          />
        </View>

        {/* 6. Shipment details */}
        {showShipmentDetails ? (
          <>
            <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />
            <View style={styles.shipmentSection}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Shipment details</Text>
              {backendOrder.shippingProvider ? (
                <DetailRow label="Carrier" value={backendOrder.shippingProvider} />
              ) : null}
              {backendOrder.trackingNumber ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Tracking number</Text>
                  <Pressable
                    onPress={() => handleCopyTracking(backendOrder.trackingNumber!)}
                    style={styles.copyRow}
                    accessibilityRole="button"
                    accessibilityLabel={`Copy tracking number ${backendOrder.trackingNumber}`}
                  >
                    <Text style={[styles.detailValueLink, { color: colors.brand }]}>{backendOrder.trackingNumber}</Text>
                    <Ionicons name="copy-outline" size={16} color={colors.brand} />
                  </Pressable>
                </View>
              ) : null}
              {carrierTrackingUrl ? (
                <Pressable
                  style={styles.shippingLabelBtn}
                  onPress={handleTrackOnCarrierSite}
                  accessibilityRole="button"
                  accessibilityLabel="Track on carrier website"
                >
                  <Ionicons name="navigate-outline" size={16} color={colors.brand} />
                  <Text style={[styles.shippingLabelBtnText, { color: colors.brand }]}>Track on carrier site</Text>
                </Pressable>
              ) : null}
              {shipmentLastUpdated ? (
                <DetailRow label="Last carrier update" value={shipmentLastUpdated} />
              ) : null}
              {backendOrder.shippingLabelUrl ? (
                <Pressable
                  style={styles.shippingLabelBtn}
                  onPress={() => handleOpenShippingLabel(backendOrder.shippingLabelUrl!)}
                  accessibilityRole="button"
                  accessibilityLabel="Open shipping label"
                >
                  <Ionicons name="open-outline" size={16} color={colors.brand} />
                  <Text style={[styles.shippingLabelBtnText, { color: colors.brand }]}>Open shipping label</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : null}

        <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

        {/* 7. Transaction breakdown */}
        <View style={styles.transactionSection}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Transaction</Text>
          <TxRow label="Item" value={formatFromFiat(subtotal, 'GBP', fiatOpts)} />
          <TxRow label="Platform charge" value={formatFromFiat(platformCharge, 'GBP', fiatOpts)} />
          {buyerProtectionFee != null && buyerProtectionFee !== 0 && buyerProtectionFee !== platformCharge ? (
            <TxRow label="Buyer protection fee" value={formatFromFiat(buyerProtectionFee, 'GBP', fiatOpts)} />
          ) : null}
          <TxRow
            label="Delivery"
            value={postageFee != null ? formatFromFiat(postageFee, 'GBP', fiatOpts) : 'Not recorded'}
          />
          <View style={[styles.txDivider, { backgroundColor: colors.border }]} />
          <TxRow label="Total" value={formatFromFiat(totalPaid, 'GBP', fiatOpts)} bold />
        </View>

        <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

        {/* 8. Support state */}
        <View style={styles.supportSection}>
          {openTicket ? (
            <Pressable
              style={styles.supportRow}
              onPress={() => { haptics.tap(); navigation.navigate('SupportTicketDetail', { ticketId: openTicket.id }); }}
              accessibilityRole="button"
              accessibilityLabel={`Open support request: ${openTicket.topicLabel}`}
            >
              <Ionicons name="help-circle-outline" size={20} color={colors.brand} />
              <View style={styles.supportInfo}>
                <Text style={[styles.supportLabel, { color: colors.textPrimary }]}>Support request open</Text>
                <Text style={[styles.supportSub, { color: colors.textMuted }]}>{openTicket.topicLabel}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ) : (
            <Pressable
              style={styles.supportRow}
              onPress={() => { haptics.tap(); navigation.navigate('OrderSupport', { orderId }); }}
              accessibilityRole="button"
              accessibilityLabel="Get support for this order"
            >
              <Ionicons name="help-circle-outline" size={20} color={colors.brand} />
              <View style={styles.supportInfo}>
                <Text style={[styles.supportLabel, { color: colors.textPrimary }]}>Need help with this order?</Text>
                <Text style={[styles.supportSub, { color: colors.textMuted }]}>Get support</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* 9. Sticky role/status action footer */}
      <OrderActionFooter
        primaryAction={footerActions.primary}
        secondaryAction={footerActions.secondary}
        bottomInset={insets.bottom}
      />

      {/* 10. Overflow actions sheet */}
      <OrderActionsSheet
        visible={actionsSheetVisible}
        orderStatus={normalisedStatus}
        role={isBuyer ? 'buyer' : 'seller'}
        orderId={orderId}
        listingAvailable={listingExists}
        actions={overflowActions}
        onClose={() => setActionsSheetVisible(false)}
      />

      {/* Review prompt — appears for delivered orders without a review */}
      <ReviewPromptSheet
        visible={reviewPromptVisible}
        itemTitle={backendOrder?.listingTitle}
        itemImage={backendOrder?.listingImageUrl ?? null}
        sellerName={counterparty?.username}
        onClose={() => setReviewPromptVisible(false)}
        onWriteReview={(_rating) => {
          setReviewPromptVisible(false);
          navigation.navigate('WriteReview', { orderId });
        }}
      />
    </SafeAreaView>
  );
}

// --- Helper components ---

function TxRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View style={txStyles.row}>
      <Text style={[txStyles.label, bold && txStyles.labelBold, { color: bold ? colors.textPrimary : colors.textSecondary }]}>{label}</Text>
      <Text style={[txStyles.value, bold && txStyles.valueBold, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

const txStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  label: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
  },
  labelBold: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
  },
  value: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
  },
  valueBold: {
    fontSize: 18,
    fontFamily: Typography.family.bold,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: Typography.family.semibold,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerSpacer: {
    width: 44,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.md,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.md,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: Typography.family.semibold,
    textAlign: 'center',
  },
  errorBody: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    paddingVertical: 14,
    paddingHorizontal: Space.xl,
    borderRadius: 10,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
  },
  statusHeader: {
    paddingVertical: Space.sm,
    gap: 4,
  },
  orderNumber: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.1,
  },
  statusLabel: {
    fontSize: 22,
    fontFamily: Typography.family.bold,
  },
  statusExplanation: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    lineHeight: 20,
  },
  lastUpdated: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    marginTop: 2,
  },
  refreshErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Space.xs,
  },
  refreshErrorText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.regular,
  },
  retryLink: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.sm,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: Space.sm,
  },
  counterpartySection: {
    paddingVertical: Space.sm,
  },
  counterpartyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  counterpartyIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  counterpartyAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  counterpartyName: {
    flex: 1,
    fontSize: 15,
    fontFamily: Typography.family.semibold,
  },
  counterpartyActions: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  counterpartyBtn: {
    paddingVertical: 8,
    paddingHorizontal: Space.md,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterpartyBtnText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
  },
  timelineSection: {
    paddingVertical: Space.sm,
  },
  escrowBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  escrowIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  escrowTextWrap: {
    flex: 1,
    gap: 2,
  },
  escrowTitle: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
  },
  escrowSub: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    lineHeight: 16,
  },
  escrowCountdown: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    marginTop: 2,
  },
  shipmentSection: {
    paddingVertical: Space.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  detailLabel: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
  },
  detailValue: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    textAlign: 'right',
    flex: 1,
  },
  detailValueLink: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shippingLabelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
    minHeight: 44,
  },
  shippingLabelBtnText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
  },
  transactionSection: {
    paddingVertical: Space.sm,
  },
  txDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.sm,
  },
  supportSection: {
    paddingVertical: Space.sm,
  },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    minHeight: 44,
  },
  supportInfo: {
    flex: 1,
  },
  supportLabel: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
  },
  supportSub: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    marginTop: 2,
  },
});
