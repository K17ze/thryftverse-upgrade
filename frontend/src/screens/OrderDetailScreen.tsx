import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Linking,
  Pressable,
  ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { useAppTheme } from '../theme/ThemeContext';
import {
  normaliseOrderStatus,
  isKnownStatus,
  humaniseStatus,
  getStatusExplanation,
  getStatusTone,
  resolveStatusColor,
  formatTimelineDate,
  isTerminalStatus,
  getParcelEventDisplay,
  buildTimelineEntries,
  computeReviewEligibleAtMs,
  formatEtaWindowFromSnapshot,
  parseEstimatedDeliveryDate,
  isStaleTrackingEvent,
  formatPackageSummary } from '../utils/orderDetailLogic';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useOrderDetail } from '../hooks/useOrderDetail';
import { useBackendData } from '../context/BackendDataContext';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { Space, Radius, Control, Stroke, ZIndex } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { buildTrackingUrl } from '../services/shippingProviderRegistry';
import { getListingCoverUri } from '../utils/media';
import { haptics } from '../utils/haptics';
import { t } from '../i18n';
import { OfflineBanner } from '../components/OfflineBanner';
import { OrderDetailSummary } from '../components/orders/OrderDetailSummary';
import { OrderTrackingTimeline, TimelineEntry } from '../components/orders/OrderTrackingTimeline';
import { OrderActionFooter, OrderActionConfig } from '../components/orders/OrderActionFooter';
import { OrderActionsSheet, OrderActionItem } from '../components/orders/OrderActionsSheet';
import { DispatchCountdown } from '../components/orders/DispatchCountdown';
import { ReviewPromptSheet } from '../components/orders/ReviewPromptSheet';
import { InspectionBanner } from '../components/orders/InspectionBanner';
import { PackageContents } from '../components/orders/PackageContents';
import { IssueCategorySelector, type IssueCategory } from '../components/orders/IssueCategorySelector';
import { CompletedOrderSummary } from '../components/orders/CompletedOrderSummary';
import { OrderCounterpartySection, type CounterpartyInfo } from '../components/orders/OrderCounterpartySection';
import { EscrowBanner } from '../components/orders/EscrowBanner';
import { EtaBanner } from '../components/orders/EtaBanner';
import { ShipmentDetails } from '../components/orders/ShipmentDetails';
import { TransactionBreakdown } from '../components/orders/TransactionBreakdown';
import { OrderSupportSection } from '../components/orders/OrderSupportSection';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { OrderDetailSkeleton } from '../components/orders/OrderDetailSkeleton';
import {
  resolveCapabilities,
  type OrderCapability } from '../components/orders/orderCapabilities';
import { ConfirmationSheet } from '../components/ConfirmationSheet';

type RouteT = RouteProp<RootStackParamList, 'OrderDetail'>;

// --- Component ---

export default function OrderDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const { formatFromFiat, currencyCode } = useFormattedPrice();
  const { listings } = useBackendData();
  const { orderId } = route.params;
  const { show } = useToast();
  const { colors, isDark } = useAppTheme();

  // Theme-aware color overrides for the static styles. The static
  // StyleSheet contains only non-color properties; colors are applied
  // via this themed proxy so the screen is fully dark-mode compatible.
  const themed = useMemo(() => ({
    container: { backgroundColor: colors.background },
    errorTitle: { color: colors.textPrimary },
    errorBody: { color: colors.textMuted },
    retryBtn: { backgroundColor: colors.brand },
    retryBtnText: { color: colors.textInverse },
    orderNumber: { color: colors.textMuted },
    statusExplanation: { color: colors.textSecondary },
    lastUpdated: { color: colors.textMuted },
    refreshErrorText: { color: colors.textMuted },
    retryLink: { color: colors.brand },
    sectionDivider: { backgroundColor: colors.border },
    staleBanner: { backgroundColor: colors.warningSubtle, borderColor: colors.warningBorder },
    staleText: { color: colors.warning },
    detailLabel: { color: colors.textSecondary } }), [colors]);

  const currentUser = useStore((state) => state.currentUser);
  const getSupportTicketsForOrder = useStore((state) => state.getSupportTicketsForOrder);

  const {
    backendOrder,
    parcelEvents,
    hasReview,
    isInitialLoading,
    isRefreshing,
    loadError,
    parcelError,
    orderMutation,
    isMountedRef,
    refreshOrder,
    handleCancel,
    handleDeliver } = useOrderDetail(orderId);

  const [actionsSheetVisible, setActionsSheetVisible] = useState(false);
  const [reviewPromptVisible, setReviewPromptVisible] = useState(false);
  const [reviewPromptShown, setReviewPromptShown] = useState(false);
  const [issueSelectorVisible, setIssueSelectorVisible] = useState(false);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    variant: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', onConfirm: () => {}, variant: 'default' });

  const scrollViewRef = useRef<ScrollView | null>(null);
  const timelineYRef = useRef(0);

  // --- Support tickets ---
  const supportTickets = getSupportTicketsForOrder(orderId);
  const openTicket = supportTickets.find((t) => t.status === 'open');

  // --- Auto-surface review prompt after delivery ---
  // Per research: the prompt should fire no earlier than 72h after delivery
  // (or a server-derived reviewEligibleAt), not immediately on delivery.
  // "Maybe later" defers by 48h with a re-prompt. This aligns with the 3–5
  // day research consensus for physical goods.
  const REVIEW_DEFER_HOURS = 48;
  const REVIEW_ELIGIBLE_HOURS = 72;

  const reviewEligibleAtMs = useMemo(() => {
    return computeReviewEligibleAtMs(backendOrder, REVIEW_ELIGIBLE_HOURS);
  }, [backendOrder]);

  const [reviewDeferredUntil, setReviewDeferredUntil] = useState<number | null>(null);

  useEffect(() => {
    if (!backendOrder || reviewPromptShown) return;
    const normalised = normaliseOrderStatus(backendOrder.status);
    const isDelivered = normalised === 'delivered' || normalised === 'completed';
    const buyerId = backendOrder.buyerId;
    if (!isDelivered || currentUser?.id !== buyerId) return;

    const now = Date.now();
    const eligibleMs = reviewEligibleAtMs ?? now;
    const effectiveMs = reviewDeferredUntil ?? eligibleMs;

    // If not yet eligible, schedule for the eligibility time
    if (now < effectiveMs) {
      const delay = effectiveMs - now;
      const timer = setTimeout(() => {
        if (isMountedRef.current && !reviewPromptShown) {
          setReviewPromptVisible(true);
          setReviewPromptShown(true);
        }
      }, Math.min(delay, 2_147_483_000)); // clamp to max setTimeout delay
      return () => clearTimeout(timer);
    }

    // Already eligible — surface after a short delay for natural feel
    const timer = setTimeout(() => {
      if (isMountedRef.current && !reviewPromptShown) {
        setReviewPromptVisible(true);
        setReviewPromptShown(true);
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [backendOrder, reviewPromptShown, currentUser?.id, reviewEligibleAtMs, reviewDeferredUntil]);

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
  const counterparty = useMemo(() => {
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

  // --- Order short ID ---
  const shortOrderId = backendOrder?.id ? backendOrder.id.slice(0, 8).toUpperCase() : '';

  // --- Track on carrier site (declared early so footer can reference) ---
  const carrierTrackingUrl = useMemo(() => {
    // Carrier tracking URLs come from the provider registry, not screen-local
    // string matching. Per HC-P0-01 §9: "move tracking/drop-off URLs into
    // provider registry".
    return buildTrackingUrl(backendOrder?.shippingProvider, backendOrder?.trackingNumber);
  }, [backendOrder?.trackingNumber, backendOrder?.shippingProvider]);

  const handleTrackOnCarrierSite = useCallback(async () => {
    if (!carrierTrackingUrl) return;
    haptics.tap();
    try {
      const supported = await Linking.canOpenURL(carrierTrackingUrl);
      if (!supported) {
        show(t('orderDetail.toast.unableOpenCarrier'), 'error');
        return;
      }
      await Linking.openURL(carrierTrackingUrl);
    } catch {
      show(t('orderDetail.toast.unableOpenCarrier'), 'error');
    }
  }, [carrierTrackingUrl, show]);

  // --- Issue category selection ---
  // Opens an in-screen category selector so the buyer picks a specific
  // issue type before navigating to support. The selected category is
  // passed as an extra navigation param for the support screen to consume.
  const handleIssueCategorySelect = useCallback((category: IssueCategory) => {
    setIssueSelectorVisible(false);
    haptics.tap();
    navigation.navigate('OrderSupport', {
      orderId,
      categoryId: category.id,
      categoryLabel: category.label });
  }, [navigation, orderId]);

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
      isSubmitting: orderMutation !== null });
  }, [backendOrder, isKnown, isBuyer, openTicket, parcelEvents.length, orderMutation, hasReview]);

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
            label: t('orderDetail.action.completePayment'),
            onPress: () => { haptics.heavyPress(); navigation.navigate('Checkout', { orderId }); },
            variant: 'primary',
            accessibilityLabel: t('orderDetail.action.completePaymentA11y') };
        case 'dispatch':
          // Seller paid → guided fulfilment. NEVER a direct generic mark-shipped.
          return {
            label: t('orderDetail.action.shipItem'),
            onPress: () => { haptics.heavyPress(); navigation.navigate('SellerFulfilment', { orderId }); },
            variant: 'primary',
            accessibilityLabel: t('orderDetail.action.shipItemA11y') };
        case 'track_order':
          return {
            label: t('orderDetail.action.trackParcel'),
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
            accessibilityLabel: t('orderDetail.action.trackParcelA11y') };
        case 'inspect':
          // Buyer delivered → check your item before confirming/reviewing.
          return {
            label: t('orderDetail.action.checkItem'),
            onPress: () => { haptics.tap(); setReviewPromptVisible(true); },
            variant: 'primary',
            accessibilityLabel: t('orderDetail.action.checkItemA11y') };
        case 'leave_review':
          return {
            label: t('orderDetail.action.leaveReview'),
            onPress: () => { haptics.tap(); setReviewPromptVisible(true); },
            variant: 'primary',
            accessibilityLabel: t('orderDetail.action.leaveReviewA11y') };
        case 'view_review':
          return {
            label: t('orderDetail.action.viewReview'),
            onPress: () => { haptics.tap(); navigation.navigate('OrderReceipt', { orderId }); },
            variant: 'secondary',
            accessibilityLabel: t('orderDetail.action.viewReviewA11y') };
        case 'confirm_delivery':
          // Demoted secondary — releases escrowed funds (high-consequence).
          return {
            label: t('orderDetail.action.confirmReceipt'),
            onPress: () => {
              haptics.heavyPress();
              setConfirmSheet({
                visible: true,
                title: t('orderDetail.action.confirmReceiptTitle'),
                message: t('orderDetail.action.confirmReceiptBody'),
                confirmLabel: t('orderDetail.action.confirmReceipt'),
                cancelLabel: t('orderDetail.action.notYet'),
                onConfirm: handleDeliver,
                variant: 'default' });
            },
            variant: 'secondary',
            loading: orderMutation === 'deliver',
            disabled: mutationLocked && orderMutation !== 'deliver',
            accessibilityLabel: 'Confirm delivery — releases funds to seller' };
        case 'cancel':
          return {
            label: t('orderDetail.action.cancelOrder'),
            onPress: () => {
              haptics.heavyPress();
              setConfirmSheet({
                visible: true,
                title: t('orderDetail.action.cancelOrderTitle'),
                message: isBuyer
                  ? t('orderDetail.action.cancelOrderBodyBuyer')
                  : t('orderDetail.action.cancelOrderBodySeller'),
                confirmLabel: t('orderDetail.action.cancelOrder'),
                cancelLabel: t('orderDetail.action.keepOrder'),
                onConfirm: handleCancel,
                variant: 'danger' });
            },
            variant: 'destructive',
            loading: orderMutation === 'cancel',
            disabled: mutationLocked && orderMutation !== 'cancel',
            accessibilityLabel: t('orderDetail.action.cancelOrder') };
        case 'report_issue':
          return {
            label: t('orderDetail.action.reportIssue'),
            onPress: () => { haptics.tap(); setIssueSelectorVisible(true); },
            variant: 'secondary',
            accessibilityLabel: t('orderDetail.action.reportIssueA11y') };
        case 'view_resolution':
          return {
            label: t('orderDetail.action.viewResolution'),
            onPress: () => { haptics.tap(); navigation.navigate('SupportTicketDetail', { ticketId: openTicket?.id ?? '' }); },
            variant: 'secondary',
            accessibilityLabel: t('orderDetail.action.viewResolutionA11y') };
        case 'contact':
          if (!counterparty) return undefined;
          return {
            label: t('orderDetail.action.messageRole', { role: counterparty.role.toLowerCase() }),
            onPress: () => {
              haptics.tap();
              navigation.navigate('Chat', {
                conversationId: `${counterparty.id}_${backendOrder.listingId}`,
                focusQuery: counterparty.username,
                partnerUserId: counterparty.id,
                itemId: backendOrder.listingId });
            },
            variant: 'secondary',
            accessibilityLabel: t('orderDetail.action.messageRole', { role: counterparty.role.toLowerCase() }) };
        case 'view_receipt':
          return {
            label: t('orderDetail.action.viewReceipt'),
            onPress: () => { haptics.tap(); navigation.navigate('OrderReceipt', { orderId }); },
            variant: 'secondary',
            accessibilityLabel: t('orderDetail.action.viewReceiptA11y') };
        default:
          return undefined;
      }
    };

    return {
      primary: buildAction(primary),
      secondary: buildAction(secondary) ?? undefined };
  }, [backendOrder, isKnown, capabilities, carrierTrackingUrl, handleTrackOnCarrierSite, handleDeliver, handleCancel, navigation, orderId, isBuyer, counterparty, openTicket, orderMutation, mutationLocked]);

  // --- Copy tracking number ---
  const handleCopyTracking = useCallback(async (trackingNumber: string) => {
    haptics.tap();
    try {
      await Clipboard.setStringAsync(trackingNumber);
      show(t('orderDetail.toast.trackingCopied'), 'success');
    } catch {
      show(t('orderDetail.toast.trackingCopyFailed'), 'error');
    }
  }, [show]);

  // --- Open shipping label ---
  const handleOpenShippingLabel = useCallback(async (url: string) => {
    haptics.tap();
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        show(t('orderDetail.toast.unableOpenShippingLabelUrl'), 'error');
        return;
      }
      await Linking.openURL(url);
    } catch {
      show(t('orderDetail.toast.unableOpenShippingLabel'), 'error');
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
      label: t('orderDetail.action.viewReceipt'),
      icon: 'receipt-outline',
      onPress: () => navigation.navigate('OrderReceipt', { orderId }) });

    // Guided dispatch is now the primary footer action when the seller can
    // ship — do not duplicate it in overflow (audit finding #1/#9).

    if (counterparty) {
      actions.push({
        key: 'contact',
        label: t('orderDetail.action.messageRole', { role: counterparty.role.toLowerCase() }),
        icon: 'chatbubble-outline',
        onPress: () => navigation.navigate('Chat', {
          conversationId: `${counterparty.id}_${backendOrder?.listingId}`,
          focusQuery: counterparty.username,
          partnerUserId: counterparty.id,
          itemId: backendOrder?.listingId }) });
    }

    actions.push({
      key: 'support',
      label: t('orderDetail.overflow.getHelp'),
      icon: 'help-circle-outline',
      onPress: () => navigation.navigate('OrderSupport', { orderId }) });

    if (isBuyer) {
      actions.push({
        key: 'buyer_protection',
        label: t('orderDetail.overflow.buyerProtection'),
        icon: 'checkmark-circle-outline',
        onPress: () => navigation.navigate('BuyerProtection', { orderId }) });
    }


    if (openTicket) {
      actions.push({
        key: 'view_resolution',
        label: t('orderDetail.action.viewResolution'),
        icon: 'folder-open-outline',
        onPress: () => navigation.navigate('SupportTicketDetail', { ticketId: openTicket.id }),
        variant: 'primary' });
    }

    if (isBuyer && (normalisedStatus === 'delivered' || normalisedStatus === 'completed')) {
      actions.push({
        key: 'review',
        label: t('orderDetail.overflow.writeReview'),
        icon: 'star-outline',
        onPress: () => { haptics.tap(); setReviewPromptVisible(true); },
        variant: 'primary' });
    }

    return actions;
  }, [navigation, orderId, counterparty, backendOrder, openTicket, isBuyer, normalisedStatus]);

  // --- Render ---

  if (isInitialLoading) {
    return (
      <SafeAreaView style={[styles.container, themed.container]} edges={['top']}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <ScreenHeader
          title="Order"
          variant="large"
          onBack={() => navigation.goBack()}
          style={{
            paddingTop: insets.top,
            paddingBottom: Space.sm,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border }}
        />
        <OrderDetailSkeleton />
      </SafeAreaView>
    );
  }

  if (!backendOrder && loadError) {
    return (
      <SafeAreaView style={[styles.container, themed.container]} edges={['top']}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <ScreenHeader
          title="Order"
          variant="large"
          onBack={() => navigation.goBack()}
          style={{
            paddingTop: insets.top,
            paddingBottom: Space.sm,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border }}
        />
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={28} color={colors.textMuted} aria-hidden={true} />
          <Text style={[styles.errorTitle, themed.errorTitle]}>Order could not be loaded</Text>
          <Text style={[styles.errorBody, themed.errorBody]}>Check your connection and try again.</Text>
          <Pressable
            style={({ pressed }) => [styles.retryBtn, themed.retryBtn, pressed && styles.retryBtnPressed]}
            onPress={() => { haptics.tap(); void refreshOrder(false); }}
            accessibilityRole="button"
            accessibilityLabel="Retry loading order"
          >
            <Text style={[styles.retryBtnText, themed.retryBtnText]}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!backendOrder) {
    return (
      <SafeAreaView style={[styles.container, themed.container]} edges={['top']}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <ScreenHeader
          title="Order"
          variant="large"
          onBack={() => navigation.goBack()}
          style={{
            paddingTop: insets.top,
            paddingBottom: Space.sm,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border }}
        />
        <View style={styles.errorContainer}>
          <Ionicons name="document-outline" size={28} color={colors.textMuted} aria-hidden={true} />
          <Text style={[styles.errorTitle, themed.errorTitle]}>Order not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const fiatOpts = { displayMode: 'fiat' as const };

  return (
    <SafeAreaView style={[styles.container, themed.container]} edges={['top']}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      {/* 1. Compact navigation header */}
      <ScreenHeader
        title="Order"
        variant="large"
        onBack={() => navigation.goBack()}
        style={{
          paddingTop: insets.top,
          paddingBottom: Space.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border }}
        rightAction={
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
                <Ionicons name="refresh-outline" size={22} color={colors.textPrimary} aria-hidden={true} />
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
              onPress={() => { haptics.tap(); setActionsSheetVisible(true); }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="More options"
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.textPrimary} aria-hidden={true} />
            </Pressable>
          </View>
        }
      />

      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: footerActions.primary || footerActions.secondary ? 100 + insets.bottom : 40 + insets.bottom }]}
      >
        {/* Offline banner */}
        <OfflineBanner onRetry={() => { haptics.tap(); void refreshOrder(false); }} />

        {/* 2. Current order status and order number */}
        <View style={styles.statusHeader}>
          <Text style={[styles.orderNumber, themed.orderNumber]}>ORDER #{shortOrderId}</Text>
          <View style={styles.statusBadgeRow}>
            {/* TODO: replace `${statusColor}15` with statusColorSubtle token when available */}
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}15` }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
          </View>
          <Text style={[styles.statusExplanation, themed.statusExplanation]}>{statusExplanation}</Text>
          {backendOrder.updatedAt ? (
            <Text style={[styles.lastUpdated, themed.lastUpdated]}>
              Last updated {formatTimelineDate(backendOrder.updatedAt)}
            </Text>
          ) : null}

          {/* Dispatch countdown for seller when order needs shipping */}
          {capabilities?.canDispatch && backendOrder.createdAt && (
            <DispatchCountdown
              createdAt={backendOrder.createdAt}
              shipByDate={capabilities.shipByDate}
              shipped={!!backendOrder.shippedAt}
            />
          )}
        </View>

        {loadError && backendOrder ? (
          <View style={styles.refreshErrorRow}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.textMuted} aria-hidden={true} />
            <Text style={[styles.refreshErrorText, themed.refreshErrorText]}>{loadError}</Text>
            <Pressable
              onPress={() => { haptics.tap(); void refreshOrder(false); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Retry refresh"
            >
              <Text style={[styles.retryLink, themed.retryLink]}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.sectionDivider, themed.sectionDivider]} />

        {/* 3. Historical item summary */}
        <OrderDetailSummary
          title={orderTitle}
          imageUrl={orderImage}
          subtitle={orderSubtitle}
          priceLabel={formatFromFiat(orderSubtotal ?? 0, currencyCode, fiatOpts)}
          listingAvailable={listingExists}
          onPress={listingExists && listingId ? () => {
            haptics.tap();
            navigation.navigate('ItemDetail', { itemId: listingId });
          } : undefined}
        />

        <View style={[styles.sectionDivider, themed.sectionDivider]} />

        {/* 4. Role-aware counterparty */}
        {counterparty ? (
          <OrderCounterpartySection
            counterparty={counterparty}
            listingId={backendOrder.listingId}
            currentUserId={currentUser?.id}
            navigation={navigation}
            onMessage={(cp, listingId) => {
              haptics.tap();
              navigation.navigate('Chat', {
                conversationId: `${cp.id}_${listingId}`,
                focusQuery: cp.username,
                partnerUserId: cp.id,
                itemId: listingId });
            }}
          />
        ) : null}

        <View style={[styles.sectionDivider, themed.sectionDivider]} />

        {/* 4c. Escrow status indicator — shows when funds are held */}
        {!isCompleted && isBuyer && (normalisedStatus === 'paid' || normalisedStatus === 'shipped' || normalisedStatus === 'in transit' || normalisedStatus === 'out for delivery') ? (
          <EscrowBanner order={backendOrder} normalisedStatus={normalisedStatus} />
        ) : null}

        {/* 4d. Buyer inspection window — shown when delivered but not yet completed */}
        {!isCompleted && isBuyer && normalisedStatus === 'delivered' ? (
          <InspectionBanner
            inspectionDeadlineAt={(backendOrder as any)?.inspectionDeadlineAt ?? null}
            onConfirmReceipt={() => {
              haptics.heavyPress();
              setConfirmSheet({
                visible: true,
                title: 'Everything is OK?',
                message: 'By confirming, you confirm the item matches the listing. This releases the held funds to the seller. This action cannot be undone.',
                confirmLabel: 'Confirm receipt',
                cancelLabel: 'Not yet',
                onConfirm: handleDeliver,
                variant: 'default' });
            }}
            onReportIssue={() => {
              haptics.tap();
              setIssueSelectorVisible(true);
            }}
          />
        ) : null}

        {/* 4e. Completed order — quiet completion state, operational chrome collapsed */}
        {isCompleted ? (
          <CompletedOrderSummary
            hasReview={hasReview}
            onLeaveReview={() => { haptics.tap(); setReviewPromptVisible(true); }}
            onBuyAgain={() => {
              haptics.tap();
              if (counterparty) {
                openProfile(navigation, counterparty.id, currentUser?.id);
              } else if (backendOrder?.sellerId) {
                openProfile(navigation, backendOrder.sellerId, currentUser?.id);
              }
            }}
            onViewReceipt={() => { haptics.tap(); navigation.navigate('OrderReceipt', { orderId }); }}
            onViewSupportHistory={() => { haptics.tap(); navigation.navigate('OrderSupport', { orderId }); }}
          />
        ) : null}

        {!isCompleted ? (
          <View style={[styles.sectionDivider, themed.sectionDivider]} />
        ) : null}

        {/* 5. Tracking or order timeline — hidden when completed */}
        {!isCompleted ? (
          <View
            style={styles.timelineSection}
            onLayout={(e) => { timelineYRef.current = e.nativeEvent.layout.y; }}
          >
          {/* Package contents — compact row so buyer can see WHAT is in the parcel */}
          <View style={styles.packageContentsWrap}>
            <Text style={[styles.packageContentsLabel, themed.detailLabel]}>Package contents</Text>
            <PackageContents
              title={orderTitle}
              imageUrl={orderImage}
              subtitle={orderSubtitle}
              onPress={listingExists && listingId ? () => {
                haptics.tap();
                navigation.navigate('ItemDetail', { itemId: listingId });
              } : undefined}
            />
          </View>

          {/* ETA banner — shown when in transit with an ETA window.
              Per report §11.3: ETA disappears when stale (past) so the
              buyer is never shown a false delivery promise. The stale
              tracking warning below covers the overdue case. */}
          {isBuyer && etaWindow && (normalisedStatus === 'shipped' || normalisedStatus === 'in transit' || normalisedStatus === 'out for delivery') && (!estimatedDeliveryDate || estimatedDeliveryDate.getTime() >= Date.now()) ? (
            <EtaBanner
              etaWindow={etaWindow}
              estimatedDeliveryLabel={estimatedDeliveryLabel}
              serviceName={snapshot?.serviceName ?? null}
            />
          ) : null}

          {/* Stale tracking warning — last event > 48h old while in transit */}
          {isStaleTracking ? (
            <View style={[styles.staleBanner, themed.staleBanner]}>
              <Ionicons name="time-outline" size={16} color={colors.warning} aria-hidden={true} />
              <Text style={[styles.staleText, themed.staleText]}>
                Tracking has not updated in over 48 hours. The carrier may be delayed. Check the carrier site for the latest status.
              </Text>
            </View>
          ) : null}

          {/* Latest parcel event — single muted text line above the timeline.
              Per report §11.3: gives the buyer "where is my parcel now?" at a
              glance. One text line, not a card. Only when there are parcel
              events and the order is not completed. */}
          {latestEventSummary ? (
            <Text style={[styles.latestEventLine, themed.lastUpdated]} numberOfLines={1}>
              {latestEventSummary}
            </Text>
          ) : null}

          <OrderTrackingTimeline
            entries={timelineEntries}
            warningText={parcelError ?? undefined}
          />
        </View>
        ) : null}

        {/* 6. Shipment details — hidden when completed */}
        {!isCompleted && showShipmentDetails ? (
          <>
            <View style={[styles.sectionDivider, themed.sectionDivider]} />
            <ShipmentDetails
              order={backendOrder}
              carrierTrackingUrl={carrierTrackingUrl}
              shipmentLastUpdated={shipmentLastUpdated}
              packageSummary={packageSummary}
              destinationSummary={snapshot?.destinationSummary}
              onCopyTracking={handleCopyTracking}
              onTrackOnCarrierSite={handleTrackOnCarrierSite}
              onOpenShippingLabel={handleOpenShippingLabel}
            />
          </>
        ) : null}

        <View style={[styles.sectionDivider, themed.sectionDivider]} />

        {/* 7. Transaction breakdown */}
        <TransactionBreakdown
          subtotal={subtotal}
          platformCharge={platformCharge}
          buyerProtectionFee={buyerProtectionFee}
          postageFee={postageFee}
          totalPaid={totalPaid}
          formatFromFiat={formatFromFiat}
          currencyCode={currencyCode}
          fiatOpts={fiatOpts}
        />

        <View style={[styles.sectionDivider, themed.sectionDivider]} />

        {/* 8. Support state */}
        <OrderSupportSection
          openTicket={openTicket}
          onPressOpenTicket={(ticketId) => navigation.navigate('SupportTicketDetail', { ticketId })}
          onPressGetSupport={() => navigation.navigate('OrderSupport', { orderId })}
        />
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
        onDefer={() => {
          setReviewPromptVisible(false);
          setReviewPromptShown(false);
          setReviewDeferredUntil(Date.now() + REVIEW_DEFER_HOURS * 60 * 60 * 1000);
        }}
        onWriteReview={(rating) => {
          setReviewPromptVisible(false);
          navigation.navigate('WriteReview', { orderId, initialRating: rating });
        }}
      />

      {/* Issue category selector — buyer picks specific issue type before support */}
      {issueSelectorVisible ? (
        <IssueCategorySelector
          onSelect={handleIssueCategorySelect}
          onClose={() => setIssueSelectorVisible(false)}
          contextualIssues={contextualIssues}
        />
      ) : null}

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((prev) => ({ ...prev, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel}
        cancelLabel={confirmSheet.cancelLabel}
        onConfirm={confirmSheet.onConfirm}
        variant={confirmSheet.variant}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1 },
  headerBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  headerBtnPressed: {
    opacity: 0.5 },
  retryBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }] },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.md },
  errorTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    textAlign: 'center' },
  errorBody: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    textAlign: 'center',
    lineHeight: TypographyV2.body.lineHeight },
  retryBtn: {
    paddingVertical: Space.md - 2,
    paddingHorizontal: Space.xl,
    borderRadius: Radius.lg,
    minHeight: Space.xxl,
    alignItems: 'center',
    justifyContent: 'center' },
  retryBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  statusHeader: {
    paddingVertical: Space.md,
    gap: Space.xs + 2 },
  // Order number — clear reference, captionElevated with tabular-nums
  orderNumber: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textTransform: 'uppercase',
    fontVariant: ['tabular-nums'] },
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Space.xs / 2 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 1,
    borderRadius: Radius.full },
  statusDot: {
    width: Space.sm - 1,
    height: Space.sm - 1,
    borderRadius: Radius.full },
  statusBadgeText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  statusExplanation: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  lastUpdated: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.xs / 2 },
  refreshErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.xs },
  refreshErrorText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  retryLink: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.lg },
  timelineSection: {
    paddingVertical: Space.sm },
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    borderRadius: Radius.md },
  staleText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    opacity: 0.7 },
  // ─── Latest event summary — one muted text line, not a card ───
  latestEventLine: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginBottom: Space.sm },
  // ─── Package contents ───
  packageContentsWrap: {
    marginBottom: Space.sm },
  packageContentsLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginBottom: Space.xs } });
