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
import { useAppTheme, ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useBackendData } from '../context/BackendDataContext';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { Space, Typography, Radius, Type, Stroke, Control } from '../theme/designTokens';
import {
  CommerceOrder,
  OrderParcelEvent,
  getOrder,
  getOrderParcelEvents,
  cancelOrder,
  shipOrder,
  deliverOrder,
  refundOrder,
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
import {
  resolveCapabilities,
  type OrderCapability,
} from '../components/orders/orderCapabilities';

type RouteT = RouteProp<RootStackParamList, 'OrderDetail'>;

type OrderMutation = 'cancel' | 'ship' | 'deliver' | 'refund' | null;

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

function resolveStatusColor(tone: StatusTone, colors: ThemeColors): string {
  switch (tone) {
    case 'success': return colors.success;
    case 'active': return colors.brand;
    case 'danger': return colors.danger;
    case 'pending': return colors.warning;
    default: return colors.textMuted;
  }
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
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const { formatFromFiat } = useFormattedPrice();
  const { listings } = useBackendData();
  const { orderId } = route.params;
  const { show } = useToast();
  const { colors, isDark } = useAppTheme();

  // Theme-aware color overrides for the static styles. The static
  // StyleSheet contains only non-color properties; colors are applied
  // via this themed proxy so the screen is fully dark-mode compatible.
  const t = useMemo(() => ({
    container: { backgroundColor: colors.background },
    header: { borderBottomColor: colors.border },
    headerTitle: { color: colors.textPrimary },
    loadingText: { color: colors.textMuted },
    errorTitle: { color: colors.textPrimary },
    errorBody: { color: colors.textMuted },
    retryBtn: { backgroundColor: colors.brand },
    retryBtnText: { color: colors.textInverse },
    orderNumber: { color: colors.textMuted },
    statusLabel: { color: colors.textPrimary },
    statusExplanation: { color: colors.textSecondary },
    lastUpdated: { color: colors.textMuted },
    refreshErrorText: { color: colors.textMuted },
    retryLink: { color: colors.brand },
    sectionDivider: { backgroundColor: colors.border },
    sectionLabel: { color: colors.textMuted },
    counterpartyName: { color: colors.textPrimary },
    counterpartyBtn: { borderColor: colors.border },
    counterpartyBtnText: { color: colors.brand },
    escrowBanner: { backgroundColor: `${colors.success}08`, borderColor: `${colors.success}25` },
    escrowTitle: { color: colors.textPrimary },
    escrowSub: { color: colors.textSecondary },
    escrowCountdown: { color: colors.textMuted },
    detailLabel: { color: colors.textSecondary },
    detailValue: { color: colors.textPrimary },
    detailValueLink: { color: colors.brand },
    shippingLabelBtnText: { color: colors.brand },
    txDivider: { backgroundColor: colors.border },
    supportLabel: { color: colors.textPrimary },
    supportSub: { color: colors.textMuted },
  }), [colors]);

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
  const scrollViewRef = useRef<ScrollView | null>(null);
  const timelineYRef = useRef(0);

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
  const statusColor = resolveStatusColor(statusTone, colors);

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

  const handleRefund = useCallback(async (reason: string) => {
    if (orderMutation) return;
    setOrderMutation('refund');
    try {
      await refundOrder(orderId, reason);
      show('Refund requested. Funds will be returned from escrow.', 'success');
      await refreshOrder(false);
    } catch (error) {
      show(parseApiError(error).message, 'error');
    } finally {
      if (isMountedRef.current) setOrderMutation(null);
    }
  }, [orderMutation, orderId, show, refreshOrder]);

  // --- Track on carrier site (declared early so footer can reference) ---
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
      hasReview: false, // review state surfaced separately via reviewPrompt
      hasTracking: Boolean(backendOrder.trackingNumber || parcelEvents.length > 0),
      fulfilmentSnapshot: backendOrder.fulfilmentSnapshot ?? null,
      isSubmitting: orderMutation !== null,
    });
  }, [backendOrder, isKnown, isBuyer, openTicket, parcelEvents.length, orderMutation]);

  const mutationLocked = orderMutation !== null;

  // --- Build action footer from canonical capabilities ---
  const footerActions = useMemo((): { primary?: OrderActionConfig; secondary?: OrderActionConfig } => {
    if (!backendOrder || !isKnown || !capabilities) return {};

    const primary = capabilities.primaryAction;
    const secondary = capabilities.secondaryActions[0] ?? null;

    const buildAction = (action: typeof primary): OrderActionConfig | undefined => {
      if (!action) return undefined;
      switch (action) {
        case 'pay':
          return {
            label: 'Complete payment',
            onPress: () => { haptics.heavyPress(); navigation.navigate('Checkout', { orderId }); },
            variant: 'primary',
            accessibilityLabel: 'Complete payment for this order',
          };
        case 'dispatch':
          // Seller paid → guided fulfilment. NEVER a direct generic mark-shipped.
          return {
            label: 'Ship item',
            onPress: () => { haptics.heavyPress(); navigation.navigate('SellerFulfilment', { orderId }); },
            variant: 'primary',
            accessibilityLabel: 'Start guided dispatch for this order',
          };
        case 'track_order':
          return {
            label: 'Track parcel',
            onPress: () => {
              haptics.tap();
              if (carrierTrackingUrl) {
                handleTrackOnCarrierSite();
              } else {
                // Scroll to timeline — the tracking section is below.
                scrollViewRef.current?.scrollTo({ y: timelineYRef.current, animated: true });
              }
            },
            variant: 'primary',
            accessibilityLabel: 'Track your parcel',
          };
        case 'inspect':
          // Buyer delivered → check your item before confirming/reviewing.
          return {
            label: 'Check your item',
            onPress: () => { haptics.tap(); setReviewPromptVisible(true); },
            variant: 'primary',
            accessibilityLabel: 'Inspect your item and confirm everything is OK',
          };
        case 'leave_review':
          return {
            label: 'Leave a review',
            onPress: () => { haptics.tap(); setReviewPromptVisible(true); },
            variant: 'primary',
            accessibilityLabel: 'Write a review for this order',
          };
        case 'view_review':
          return {
            label: 'View your review',
            onPress: () => { haptics.tap(); navigation.navigate('OrderReceipt', { orderId }); },
            variant: 'secondary',
            accessibilityLabel: 'View your submitted review',
          };
        case 'confirm_delivery':
          // Demoted secondary — releases escrowed funds (high-consequence).
          return {
            label: 'Confirm receipt',
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
            variant: 'secondary',
            loading: orderMutation === 'deliver',
            disabled: mutationLocked && orderMutation !== 'deliver',
            accessibilityLabel: 'Confirm delivery — releases funds to seller',
          };
        case 'cancel':
          return {
            label: 'Cancel order',
            onPress: () => {
              haptics.heavyPress();
              Alert.alert(
                'Cancel this order?',
                isBuyer
                  ? 'This will cancel the order and notify the seller. This action cannot be undone.'
                  : 'This will cancel the order and notify the buyer. This action cannot be undone.',
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
          };
        case 'report_issue':
          return {
            label: 'Report an issue',
            onPress: () => { haptics.tap(); navigation.navigate('OrderSupport', { orderId }); },
            variant: 'secondary',
            accessibilityLabel: 'Report an issue with this order',
          };
        case 'view_resolution':
          return {
            label: 'View open request',
            onPress: () => { haptics.tap(); navigation.navigate('SupportTicketDetail', { ticketId: openTicket?.id ?? '' }); },
            variant: 'secondary',
            accessibilityLabel: 'View open support request',
          };
        case 'contact':
          if (!counterparty) return undefined;
          return {
            label: `Message ${counterparty.role.toLowerCase()}`,
            onPress: () => {
              haptics.tap();
              navigation.navigate('Chat', {
                conversationId: `${counterparty.id}_${backendOrder.listingId}`,
                focusQuery: counterparty.username,
                partnerUserId: counterparty.id,
                itemId: backendOrder.listingId,
              });
            },
            variant: 'secondary',
            accessibilityLabel: `Message ${counterparty.role.toLowerCase()}`,
          };
        case 'view_receipt':
          return {
            label: 'View receipt',
            onPress: () => { haptics.tap(); navigation.navigate('OrderReceipt', { orderId }); },
            variant: 'secondary',
            accessibilityLabel: 'View order receipt',
          };
        default:
          return undefined;
      }
    };

    return {
      primary: buildAction(primary),
      secondary: buildAction(secondary) ?? undefined,
    };
  }, [backendOrder, isKnown, capabilities, carrierTrackingUrl, handleTrackOnCarrierSite, handleDeliver, handleCancel, handleShip, navigation, orderId, isBuyer, counterparty, openTicket, orderMutation, mutationLocked]);

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
  // (Moved above action-availability so the footer "Track parcel" action
  //  can reference these without a use-before-declaration error.)

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

    // Guided dispatch is now the primary footer action when the seller can
    // ship — do not duplicate it in overflow (audit finding #1/#9).

    if (counterparty) {
      actions.push({
        key: 'contact',
        label: `Message ${counterparty.role.toLowerCase()}`,
        icon: 'chatbubble-outline',
        onPress: () => navigation.navigate('Chat', {
          conversationId: `${counterparty.id}_${backendOrder?.listingId}`,
          focusQuery: counterparty.username,
          partnerUserId: counterparty.id,
          itemId: backendOrder?.listingId,
        }),
      });
    }

    actions.push({
      key: 'support',
      label: 'Get help with this order',
      icon: 'help-circle-outline',
      onPress: () => navigation.navigate('OrderSupport', { orderId }),
    });

    if (isBuyer) {
      actions.push({
        key: 'buyer_protection',
        label: 'Buyer protection',
        icon: 'shield-checkmark-outline',
        onPress: () => navigation.navigate('BuyerProtection', { orderId }),
      });
    }

    if (isBuyer && (normalisedStatus === 'delivered' || normalisedStatus === 'completed')) {
      actions.push({
        key: 'refund',
        label: 'Request refund',
        icon: 'return-down-back-outline',
        onPress: () => {
          haptics.heavyPress();
          Alert.alert(
            'Request a refund?',
            'This will request a refund from the escrow-held funds. The seller will be notified and our team will review the request.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Request refund',
                style: 'destructive',
                onPress: () => handleRefund('buyer_requested_refund'),
              },
            ]
          );
        },
        variant: 'destructive',
      });
    }

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
  }, [navigation, orderId, counterparty, backendOrder, openTicket, isBuyer, normalisedStatus, handleRefund]);

  // --- Render ---

  if (isInitialLoading) {
    return (
      <SafeAreaView style={[styles.container, t.container]} edges={['top']}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <View style={[styles.header, t.header, { paddingTop: insets.top }]}>
          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, t.headerTitle]}>Order</Text>
          <View style={styles.headerSpacer} />
        </View>
        <OrderDetailSkeleton />
      </SafeAreaView>
    );
  }

  if (!backendOrder && loadError) {
    return (
      <SafeAreaView style={[styles.container, t.container]} edges={['top']}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <View style={[styles.header, t.header, { paddingTop: insets.top }]}>
          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, t.headerTitle]}>Order</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={36} color={colors.textMuted} />
          <Text style={[styles.errorTitle, t.errorTitle]}>Order could not be loaded</Text>
          <Text style={[styles.errorBody, t.errorBody]}>Check your connection and try again.</Text>
          <Pressable
            style={({ pressed }) => [styles.retryBtn, t.retryBtn, pressed && styles.retryBtnPressed]}
            onPress={() => { haptics.tap(); void refreshOrder(false); }}
            accessibilityRole="button"
            accessibilityLabel="Retry loading order"
          >
            <Text style={[styles.retryBtnText, t.retryBtnText]}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!backendOrder) {
    return (
      <SafeAreaView style={[styles.container, t.container]} edges={['top']}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <View style={[styles.header, t.header, { paddingTop: insets.top }]}>
          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, t.headerTitle]}>Order</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="document-outline" size={36} color={colors.textMuted} />
          <Text style={[styles.errorTitle, t.errorTitle]}>Order not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const fiatOpts = { displayMode: 'fiat' as const };

  return (
    <SafeAreaView style={[styles.container, t.container]} edges={['top']}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      {/* 1. Compact navigation header */}
      <View style={[styles.header, t.header, { paddingTop: insets.top }]}>
        <Pressable
          style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, t.headerTitle]}>Order</Text>
        <View style={styles.headerRight}>
          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
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
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
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
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: footerActions.primary || footerActions.secondary ? 100 + insets.bottom : 40 + insets.bottom }]}
      >
        {/* 2. Current order status and order number */}
        <View style={styles.statusHeader}>
          <Text style={[styles.orderNumber, t.orderNumber]}>ORDER #{shortOrderId}</Text>
          <View style={styles.statusBadgeRow}>
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}15` }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
          </View>
          <Text style={[styles.statusExplanation, t.statusExplanation]}>{statusExplanation}</Text>
          {backendOrder.updatedAt ? (
            <Text style={[styles.lastUpdated, t.lastUpdated]}>
              Last updated {formatTimelineDate(backendOrder.updatedAt)}
            </Text>
          ) : null}

          {/* Dispatch countdown for seller when order needs shipping */}
          {capabilities?.canDispatch && backendOrder.createdAt && (
            <DispatchCountdown
              createdAt={backendOrder.createdAt}
              shipped={!!backendOrder.shippedAt}
            />
          )}
        </View>

        {loadError && backendOrder ? (
          <View style={styles.refreshErrorRow}>
            <Ionicons name="alert-circle-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.refreshErrorText, t.refreshErrorText]}>{loadError}</Text>
            <Pressable
              onPress={() => { haptics.tap(); void refreshOrder(false); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Retry refresh"
            >
              <Text style={[styles.retryLink, t.retryLink]}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.sectionDivider, t.sectionDivider]} />

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

        <View style={[styles.sectionDivider, t.sectionDivider]} />

        {/* 4. Role-aware counterparty */}
        {counterparty ? (
          <View style={styles.counterpartySection}>
            <Text style={[styles.sectionLabel, t.sectionLabel]}>{counterparty.role}</Text>
            <View style={styles.counterpartyRow}>
              <Pressable
                style={styles.counterpartyIdentity}
                onPress={() => { haptics.tap(); openProfile(navigation, counterparty.id, currentUser?.id); }}
                accessibilityRole="button"
                accessibilityLabel={`View ${counterparty.role} profile: ${counterparty.username}`}
              >
                <CachedImage
                  uri={counterparty.avatar ?? ''}
                  style={styles.counterpartyAvatar}
                  contentFit="cover"
                />
                <Text style={[styles.counterpartyName, t.counterpartyName]} numberOfLines={1}>
                  @{counterparty.username}
                </Text>
              </Pressable>
              <View style={styles.counterpartyActions}>
                <Pressable
                  style={({ pressed }) => [styles.counterpartyBtn, t.counterpartyBtn, pressed && styles.counterpartyBtnPressed]}
                  onPress={() => {
                    haptics.tap();
                    navigation.navigate('Chat', {
                      conversationId: `${counterparty.id}_${backendOrder.listingId}`,
                      focusQuery: counterparty.username,
                      partnerUserId: counterparty.id,
                      itemId: backendOrder.listingId,
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Message ${counterparty.role.toLowerCase()}`}
                >
                  <Text style={[styles.counterpartyBtnText, t.counterpartyBtnText]}>Message</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.counterpartyBtn, t.counterpartyBtn, pressed && styles.counterpartyBtnPressed]}
                  onPress={() => { haptics.tap(); openProfile(navigation, counterparty.id, currentUser?.id); }}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${counterparty.role.toLowerCase()} profile`}
                >
                  <Text style={[styles.counterpartyBtnText, t.counterpartyBtnText]}>View profile</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        <View style={[styles.sectionDivider, t.sectionDivider]} />

        {/* 4b. Visual status stepper */}
        <View style={styles.timelineSection}>
          <Text style={[styles.sectionLabel, t.sectionLabel]}>Progress</Text>
          <OrderStatusStepper
            currentStage={stepperStage}
            isFailure={stepperIsFailure}
            failureLabel={stepperFailureLabel}
            stageTimestamps={stepperTimestamps}
          />
        </View>

        {/* 4c. Escrow status indicator — shows when funds are held */}
        {isBuyer && (normalisedStatus === 'paid' || normalisedStatus === 'shipped' || normalisedStatus === 'in transit' || normalisedStatus === 'out for delivery') ? (
          <View style={[styles.escrowBanner, t.escrowBanner]}>
            <Ionicons name="lock-closed" size={16} color={colors.success} />
            <View style={styles.escrowTextWrap}>
              <Text style={[styles.escrowTitle, t.escrowTitle]}>Funds held in escrow</Text>
              <Text style={[styles.escrowSub, t.escrowSub]}>
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
                  <Text style={[styles.escrowCountdown, t.escrowCountdown]}>
                    Auto-releases to seller in {daysLeft} day{daysLeft === 1 ? '' : 's'} if not confirmed
                  </Text>
                );
              })()}
            </View>
          </View>
        ) : null}

        <View style={[styles.sectionDivider, t.sectionDivider]} />

        {/* 5. Tracking or order timeline */}
        <View
          style={styles.timelineSection}
          onLayout={(e) => { timelineYRef.current = e.nativeEvent.layout.y; }}
        >
          <Text style={[styles.sectionLabel, t.sectionLabel]}>Timeline</Text>
          <OrderTrackingTimeline
            entries={timelineEntries}
            warningText={parcelError ?? undefined}
          />
        </View>

        {/* 6. Shipment details */}
        {showShipmentDetails ? (
          <>
            <View style={[styles.sectionDivider, t.sectionDivider]} />
            <View style={styles.shipmentSection}>
              <Text style={[styles.sectionLabel, t.sectionLabel]}>Shipment details</Text>
              {backendOrder.shippingProvider ? (
                <DetailRow label="Carrier" value={backendOrder.shippingProvider} />
              ) : null}
              {backendOrder.trackingNumber ? (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, t.detailLabel]}>Tracking number</Text>
                  <Pressable
                    onPress={() => handleCopyTracking(backendOrder.trackingNumber!)}
                    style={styles.copyRow}
                    accessibilityRole="button"
                    accessibilityLabel={`Copy tracking number ${backendOrder.trackingNumber}`}
                  >
                    <Text style={[styles.detailValueLink, t.detailValueLink]}>{backendOrder.trackingNumber}</Text>
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
                  <Text style={[styles.shippingLabelBtnText, t.shippingLabelBtnText]}>Track on carrier site</Text>
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
                  <Text style={[styles.shippingLabelBtnText, t.shippingLabelBtnText]}>Open shipping label</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : null}

        <View style={[styles.sectionDivider, t.sectionDivider]} />

        {/* 7. Transaction breakdown */}
        <View style={styles.transactionSection}>
          <Text style={[styles.sectionLabel, t.sectionLabel]}>Transaction</Text>
          <TxRow label="Item" value={formatFromFiat(subtotal, 'GBP', fiatOpts)} />
          <TxRow label="Platform charge" value={formatFromFiat(platformCharge, 'GBP', fiatOpts)} />
          {buyerProtectionFee != null && buyerProtectionFee !== 0 && buyerProtectionFee !== platformCharge ? (
            <TxRow label="Buyer protection fee" value={formatFromFiat(buyerProtectionFee, 'GBP', fiatOpts)} />
          ) : null}
          <TxRow
            label="Delivery"
            value={postageFee != null ? formatFromFiat(postageFee, 'GBP', fiatOpts) : 'Not recorded'}
          />
          <View style={[styles.txDivider, t.txDivider]} />
          <TxRow label="Total" value={formatFromFiat(totalPaid, 'GBP', fiatOpts)} bold />
        </View>

        <View style={[styles.sectionDivider, t.sectionDivider]} />

        {/* 8. Support state */}
        <View style={styles.supportSection}>
          {openTicket ? (
            <Pressable
              style={({ pressed }) => [styles.supportRow, pressed && styles.supportRowPressed]}
              onPress={() => { haptics.tap(); navigation.navigate('SupportTicketDetail', { ticketId: openTicket.id }); }}
              accessibilityRole="button"
              accessibilityLabel={`Open support request: ${openTicket.topicLabel}`}
            >
              <Ionicons name="help-circle-outline" size={20} color={colors.brand} />
              <View style={styles.supportInfo}>
                <Text style={[styles.supportLabel, t.supportLabel]}>Support request open</Text>
                <Text style={[styles.supportSub, t.supportSub]}>{openTicket.topicLabel}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.supportRow, pressed && styles.supportRowPressed]}
              onPress={() => { haptics.tap(); navigation.navigate('OrderSupport', { orderId }); }}
              accessibilityRole="button"
              accessibilityLabel="Get support for this order"
            >
              <Ionicons name="help-circle-outline" size={20} color={colors.brand} />
              <View style={styles.supportInfo}>
                <Text style={[styles.supportLabel, t.supportLabel]}>Get support</Text>
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
  const txThemed = useMemo(() => ({
    label: { color: colors.textSecondary },
    labelBold: { color: colors.textPrimary },
    value: { color: colors.textPrimary },
    valueBold: { color: colors.textPrimary },
  }), [colors]);
  return (
    <View style={txStyles.row}>
      <Text style={[txStyles.label, txThemed.label, bold && txStyles.labelBold, bold && txThemed.labelBold]}>{label}</Text>
      <Text style={[txStyles.value, txThemed.value, bold && txStyles.valueBold, bold && txThemed.valueBold]}>{value}</Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  const detailThemed = useMemo(() => ({
    label: { color: colors.textSecondary },
    value: { color: colors.textPrimary },
  }), [colors]);
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, detailThemed.label]}>{label}</Text>
      <Text style={[styles.detailValue, detailThemed.value]}>{value}</Text>
    </View>
  );
}

const txStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs + 2,
  },
  label: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  labelBold: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  // Transaction values use tabular-nums per spec — all monetary values aligned
  value: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.captionElevated.letterSpacing,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  // Total uses priceList per spec — hero financial value
  valueBold: {
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceList.letterSpacing,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
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
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnPressed: {
    opacity: 0.5,
  },
  retryBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  counterpartyBtnPressed: {
    opacity: 0.7,
  },
  supportRowPressed: {
    opacity: 0.7,
  },
  headerTitle: {
    fontSize: Type.title.size,
    lineHeight: Type.title.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.title.letterSpacing,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  headerSpacer: {
    width: Control.hit,
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
    fontSize: Type.body.size,
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
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.semibold,
    textAlign: 'center',
  },
  errorBody: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    lineHeight: Type.body.lineHeight,
  },
  retryBtn: {
    paddingVertical: Space.md - 2,
    paddingHorizontal: Space.xl,
    borderRadius: Radius.lg,
    minHeight: Space.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.semibold,
  },
  statusHeader: {
    paddingVertical: Space.md,
    gap: Space.xs + 2,
  },
  // Order number — clear reference, captionElevated with tabular-nums
  orderNumber: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.captionElevated.letterSpacing,
    textTransform: 'uppercase',
    fontVariant: ['tabular-nums'],
  },
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Space.xs / 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 1,
    borderRadius: Radius.full,
  },
  statusDot: {
    width: Space.sm - 1,
    height: Space.sm - 1,
    borderRadius: Radius.full,
  },
  statusBadgeText: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  statusLabel: {
    fontSize: Type.priceLarge.size,
    lineHeight: Type.priceLarge.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceLarge.letterSpacing,
  },
  statusExplanation: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  lastUpdated: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
    marginTop: Space.xs / 2,
  },
  refreshErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.xs,
  },
  refreshErrorText: {
    flex: 1,
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  retryLink: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.lg,
  },
  sectionLabel: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.captionElevated.letterSpacing,
    textTransform: 'uppercase',
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
    width: Space.xxl,
    height: Space.xxl,
    borderRadius: Radius.full,
  },
  counterpartyName: {
    flex: 1,
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  counterpartyActions: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  counterpartyBtn: {
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterpartyBtnText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  timelineSection: {
    paddingVertical: Space.sm,
  },
  escrowBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  escrowTextWrap: {
    flex: 1,
    gap: Space.xs / 2,
  },
  escrowTitle: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  escrowSub: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  escrowCountdown: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.captionElevated.letterSpacing,
    marginTop: Space.xs / 2,
    fontVariant: ['tabular-nums'],
  },
  shipmentSection: {
    paddingVertical: Space.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.sm,
    gap: Space.md,
  },
  detailLabel: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  detailValue: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.captionElevated.letterSpacing,
    textAlign: 'right',
    flex: 1,
  },
  detailValueLink: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.captionElevated.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
  },
  shippingLabelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.sm + 2,
    marginTop: Space.xs,
    minHeight: Control.hit,
  },
  shippingLabelBtnText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.captionElevated.letterSpacing,
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
    minHeight: Control.hit,
  },
  supportInfo: {
    flex: 1,
  },
  supportLabel: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  supportSub: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
    marginTop: Space.xs / 2,
  },
});
