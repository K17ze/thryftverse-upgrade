import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Space, Radius, Type, Typography, Stroke, Control, LetterSpacing } from '../theme/designTokens';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { getOrder, shipOrder, type CommerceOrder } from '../services/commerceApi';
import { parseApiError } from '../lib/apiClient';
import { fetchJson } from '../lib/apiClient';
import { CachedImage } from '../components/CachedImage';
import {
  normaliseOrderStatus,
  humaniseStatus,
  type FulfilmentSnapshot,
} from '../components/orders/orderCapabilities';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { useReducedMotion } from '../hooks/useReducedMotion';

type SellerFulfilmentRoute = RouteProp<{ SellerFulfilment: { orderId: string } }, 'SellerFulfilment'>;

const haptics = {
  tap: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  heavyPress: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  selection: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid),
};

// Carriers offered only for MANUAL shipping (when the buyer did NOT purchase
// an integrated service). For integrated purchases, the buyer-selected
// service is shown and the picker is suppressed.
const MANUAL_CARRIERS = [
  'Royal Mail',
  'DPD',
  'Evri',
  'Yodel',
  'UPS',
  'DHL',
  'FedEx',
];

// Ship-by policy: fallback deadline when the backend hasn't provided one.
// Depop uses 2 business days; Vinted uses 3–5 calendar days. We default to
// 3 calendar days from purchase, which the backend can override via
// order.shipByDate or fulfilmentSnapshot.shipByDate.
const FALLBACK_SHIP_BY_DAYS = 3;

// Drop-off finder URLs by carrier — opens the carrier's locator page.
const DROP_OFF_URLS: Record<string, string> = {
  'royal mail': 'https://www.royalmail.com/find-a-post-office',
  'dpd': 'https://www.dpd.co.uk/pickup/',
  'evri': 'https://www.evri.com/find-a-parcelshop/',
  'hermes': 'https://www.evri.com/find-a-parcelshop/',
  'yodel': 'https://www.yodel.co.uk/parcel-shops',
  'ups': 'https://www.ups.com/dropoff/',
  'dhl': 'https://www.dhl.com/en/express/locations.html',
  'fedex': 'https://www.fedex.com/locate/',
};

function formatShipByDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function deriveShipByDate(order: CommerceOrder): string | null {
  // Priority: explicit shipByDate → snapshot shipByDate → fallback from createdAt
  if (order.shipByDate) return order.shipByDate;
  const snap = order.fulfilmentSnapshot;
  if (snap?.shipByDate) return snap.shipByDate;
  if (order.createdAt) {
    const created = new Date(order.createdAt);
    if (!Number.isNaN(created.getTime())) {
      const deadline = new Date(created.getTime() + FALLBACK_SHIP_BY_DAYS * 24 * 60 * 60 * 1000);
      return deadline.toISOString();
    }
  }
  return null;
}

export default function SellerFulfilmentScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<SellerFulfilmentRoute>();
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const reducedMotionEnabled = useReducedMotion();

  const { orderId } = route.params;

  const [order, setOrder] = useState<CommerceOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);

  // Manual shipping form state
  const [trackingNumber, setTrackingNumber] = useState('');
  const [shippingProvider, setShippingProvider] = useState('');
  const [showCarrierDropdown, setShowCarrierDropdown] = useState(false);

  // Label generation state (integrated shipping)
  const [isGeneratingLabel, setIsGeneratingLabel] = useState(false);
  const [generatedLabelUrl, setGeneratedLabelUrl] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const fetchOrder = useCallback(async () => {
    try {
      const fetched = await getOrder(orderId);
      if (!isMountedRef.current) return;
      setOrder(fetched);
      setLoadError(null);

      // Pre-fill from existing order data (for resume after app kill)
      if (fetched.trackingNumber) setTrackingNumber(fetched.trackingNumber);
      if (fetched.shippingProvider) setShippingProvider(fetched.shippingProvider);
      if (fetched.shippingLabelUrl) setGeneratedLabelUrl(fetched.shippingLabelUrl);
    } catch (error) {
      if (!isMountedRef.current) return;
      setLoadError('Order could not be loaded. Check your connection and try again.');
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void fetchOrder();
  }, [fetchOrder]);

  const isSeller = currentUser?.id === order?.sellerId;
  const normalised = normaliseOrderStatus(order?.status ?? '');
  const canDispatch = isSeller && normalised === 'paid';

  // Determine shipping mode from the immutable fulfilment snapshot.
  // Integrated = buyer purchased a carrier-managed service (label/QR available).
  // Manual = buyer paid for postage but seller arranges their own tracked service.
  const snapshot: FulfilmentSnapshot | null = order?.fulfilmentSnapshot ?? null;
  const deliveryMode: 'integrated' | 'manual' | 'local' | 'unknown' =
    snapshot?.deliveryMode ?? 'unknown';
  const isIntegrated = deliveryMode === 'integrated';
  const isManualMode = deliveryMode === 'manual' || (!isIntegrated && deliveryMode === 'unknown');

  const shipByDate = order ? deriveShipByDate(order) : null;
  const shipByLabel = formatShipByDate(shipByDate);
  const shipByDaysLeft = daysUntil(shipByDate);
  const shipByUrgent = shipByDaysLeft != null && shipByDaysLeft <= 1;
  const shipByOverdue = shipByDaysLeft != null && shipByDaysLeft < 0;

  const serviceName = snapshot?.serviceName ?? snapshot?.carrierId ?? order?.shippingProvider ?? null;
  const etaWindow = snapshot?.etaMinDays != null && snapshot?.etaMaxDays != null
    ? (snapshot.etaMinDays !== snapshot.etaMaxDays
        ? `${snapshot.etaMinDays}–${snapshot.etaMaxDays} days`
        : `${snapshot.etaMinDays} day${snapshot.etaMinDays === 1 ? '' : 's'}`)
    : null;

  // --- Dispatch handlers ---

  const handleGenerateLabel = useCallback(async () => {
    if (isGeneratingLabel) return;
    setIsGeneratingLabel(true);
    setLabelError(null);
    haptics.tap();
    try {
      const carrier = (snapshot?.carrierId ?? shippingProvider) || 'Royal Mail';
      const res = await fetchJson<{ shippingLabelUrl?: string; trackingNumber?: string }>(
        `/orders/${orderId}/shipping-label`,
        { method: 'POST', body: JSON.stringify({ carrier }) }
      );
      if (!isMountedRef.current) return;
      if (res.shippingLabelUrl) {
        setGeneratedLabelUrl(res.shippingLabelUrl);
        show('Shipping label ready. Show the QR code at drop-off.', 'success');
      }
      if (res.trackingNumber && !trackingNumber) {
        setTrackingNumber(res.trackingNumber);
      }
    } catch (error) {
      if (!isMountedRef.current) return;
      // Typed error branches — not one generic catch.
      const msg = parseApiError(error).message;
      if (msg.includes('carrier') || msg.includes('provider')) {
        setLabelError('This carrier\'s label service is unavailable right now. Try again, or enter tracking manually below.');
      } else if (msg.includes('address') || msg.includes('destination')) {
        setLabelError('The buyer\'s address needs updating before a label can be generated. Message the buyer to resolve.');
      } else if (msg.includes('parcel') || msg.includes('weight') || msg.includes('size')) {
        setLabelError('The parcel details don\'t match the carrier\'s limits. Check the size/weight above.');
      } else {
        setLabelError('Label generation requires carrier integration. Enter tracking manually below to confirm dispatch.');
      }
    } finally {
      if (isMountedRef.current) setIsGeneratingLabel(false);
    }
  }, [isGeneratingLabel, orderId, snapshot, shippingProvider, trackingNumber, show]);

  const handleShowQR = useCallback(() => {
    if (!generatedLabelUrl) return;
    haptics.tap();
    navigation.navigate('ChatMediaPreview', {
      mediaUri: generatedLabelUrl,
      mediaType: 'image',
      senderLabel: 'Shipping label / QR code',
    });
  }, [generatedLabelUrl, navigation]);

  const handlePrintLabel = useCallback(async () => {
    if (!generatedLabelUrl) return;
    haptics.tap();
    try {
      const supported = await Linking.canOpenURL(generatedLabelUrl);
      if (!supported) {
        show('Unable to open label for printing', 'error');
        return;
      }
      await Linking.openURL(generatedLabelUrl);
    } catch {
      show('Unable to open label for printing', 'error');
    }
  }, [generatedLabelUrl, show]);

  const handleFindDropOff = useCallback(() => {
    const carrier = (snapshot?.carrierId ?? shippingProvider ?? '').toLowerCase();
    const url = DROP_OFF_URLS[carrier];
    if (!url) {
      show('Drop-off finder not available for this carrier. Check the carrier\'s website.', 'info');
      return;
    }
    haptics.tap();
    void Linking.openURL(url).catch(() => {
      show('Unable to open drop-off finder', 'error');
    });
  }, [snapshot, shippingProvider, show]);

  const handleMessageBuyer = useCallback(() => {
    if (!order) return;
    haptics.tap();
    navigation.navigate('Chat', {
      conversationId: `${order.buyerId}_${order.listingId}`,
      partnerUserId: order.buyerId,
      itemId: order.listingId,
    });
  }, [order, navigation]);

  // Manual dispatch: seller enters tracking and confirms.
  const handleManualDispatch = useCallback(async () => {
    if (!canDispatch || isDispatching) return;
    const tn = trackingNumber.trim();
    const carrier = shippingProvider.trim();
    if (!tn) {
      show('Enter a tracking number to confirm dispatch', 'info');
      return;
    }
    if (!carrier) {
      show('Select a carrier to confirm dispatch', 'info');
      return;
    }
    setIsDispatching(true);
    haptics.heavyPress();
    try {
      await shipOrder(orderId, {
        trackingNumber: tn,
        shippingProvider: carrier,
      });
      show('Item dispatched. The buyer will be notified.', 'success');
      navigation.goBack();
    } catch (error) {
      show(parseApiError(error).message, 'error');
    } finally {
      if (isMountedRef.current) setIsDispatching(false);
    }
  }, [canDispatch, isDispatching, orderId, trackingNumber, shippingProvider, show, navigation]);

  // Integrated dispatch: the carrier's first scan drives state, but we allow
  // the seller to confirm dispatch after generating a label (the backend
  // marks shipped and the first-scan webhook advances to in-transit).
  const handleIntegratedDispatch = useCallback(async () => {
    if (!canDispatch || isDispatching) return;
    setIsDispatching(true);
    haptics.heavyPress();
    try {
      await shipOrder(orderId, {
        trackingNumber: trackingNumber.trim() || undefined,
        shippingProvider: serviceName ?? undefined,
      });
      show('Item dispatched. The carrier scan will update tracking automatically.', 'success');
      navigation.goBack();
    } catch (error) {
      show(parseApiError(error).message, 'error');
    } finally {
      if (isMountedRef.current) setIsDispatching(false);
    }
  }, [canDispatch, isDispatching, orderId, trackingNumber, serviceName, show, navigation]);

  // --- Loading / error / permission states ---

  if (isLoading) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Dispatch" onBack={() => navigation.goBack()} />}>
        <FlagshipState variant="loading" />
      </FlagshipScreen>
    );
  }

  if (loadError || !order) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Dispatch" onBack={() => navigation.goBack()} />}>
        <FlagshipState
          variant="error"
          icon="cloud-offline-outline"
          title="Order could not be loaded"
          actionLabel="Retry"
          onAction={() => { setLoadError(null); setIsLoading(true); void fetchOrder(); }}
        />
      </FlagshipScreen>
    );
  }

  if (!isSeller) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Dispatch" onBack={() => navigation.goBack()} />}>
        <FlagshipState
          variant="empty"
          icon="lock-closed-outline"
          title="Only the seller can dispatch this order"
        />
      </FlagshipScreen>
    );
  }

  const shortOrderId = order.id.slice(0, 8).toUpperCase();
  const statusLabel = humaniseStatus(order.status);
  const itemPrice = formatFromFiat(order.totalGbp, 'GBP', { displayMode: 'fiat' });

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Dispatch item" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 + insets.bottom }]}
      >
        {/* ─── 1. Ship-by deadline headline ─── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
          <View style={[
            styles.deadlineHeader,
            shipByOverdue
              ? { backgroundColor: `${colors.danger}10`, borderColor: `${colors.danger}30` }
              : shipByUrgent
                ? { backgroundColor: `${colors.warning}10`, borderColor: `${colors.warning}30` }
                : { backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
            <View style={[
              styles.deadlineIcon,
              shipByOverdue || shipByUrgent
                ? { backgroundColor: shipByOverdue ? `${colors.danger}20` : `${colors.warning}20` }
                : { backgroundColor: `${colors.brand}15` },
            ]}>
              <Ionicons
                name={shipByOverdue ? 'alert-circle' : 'time-outline'}
                size={20}
                color={shipByOverdue ? colors.danger : shipByUrgent ? colors.warning : colors.brand}
              />
            </View>
            <View style={styles.deadlineText}>
              <Text style={styles.deadlineEyebrow}>
                {shipByOverdue ? 'OVERDUE' : 'SHIP BY'}
              </Text>
              <Text style={[
                styles.deadlineDate,
                { color: shipByOverdue ? colors.danger : colors.textPrimary },
              ]}>
                {shipByLabel ?? 'No deadline set'}
              </Text>
              {shipByDaysLeft != null && !shipByOverdue && (
                <Text style={styles.deadlineSub}>
                  {shipByDaysLeft === 0
                    ? 'Dispatch today to stay within policy'
                    : shipByDaysLeft === 1
                      ? '1 day left to dispatch'
                      : `${shipByDaysLeft} days left to dispatch`}
                </Text>
              )}
              {shipByOverdue && (
                <Text style={styles.deadlineSub}>
                  This order is past the dispatch deadline. Dispatch immediately or the buyer may cancel.
                </Text>
              )}
            </View>
          </View>
        </Reanimated.View>

        {/* ─── 2. Item summary ─── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(60)}>
          <View style={styles.itemRow}>
            {order.listingImageUrl ? (
              <CachedImage uri={order.listingImageUrl} style={styles.itemImage} contentFit="cover" />
            ) : (
              <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
                <Ionicons name="image-outline" size={24} color={colors.textMuted} />
              </View>
            )}
            <View style={styles.itemInfo}>
              <Text style={styles.itemTitle} numberOfLines={2}>{order.listingTitle || 'Ordered item'}</Text>
              <Text style={styles.itemMeta}>ORDER #{shortOrderId} · {statusLabel}</Text>
              <Text style={styles.itemPrice}>{itemPrice}</Text>
            </View>
          </View>
        </Reanimated.View>

        {/* ─── 3. Buyer-selected service (immutable snapshot) ─── */}
        {serviceName ? (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(120)}>
            <View style={styles.serviceCard}>
              <View style={styles.serviceHeader}>
                <Ionicons name="cube-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.serviceEyebrow}>BUYER-SELECTED SERVICE</Text>
              </View>
              <Text style={styles.serviceName}>{serviceName}</Text>
              <View style={styles.serviceMetaRow}>
                {etaWindow && (
                  <View style={styles.serviceMetaItem}>
                    <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                    <Text style={styles.serviceMetaText}>ETA {etaWindow}</Text>
                  </View>
                )}
                {snapshot?.trackingIncluded && (
                  <View style={styles.serviceMetaItem}>
                    <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                    <Text style={styles.serviceMetaText}>Tracked</Text>
                  </View>
                )}
                {isIntegrated && (
                  <View style={styles.serviceMetaItem}>
                    <Ionicons name="qr-code-outline" size={13} color={colors.textMuted} />
                    <Text style={styles.serviceMetaText}>Label included</Text>
                  </View>
                )}
              </View>
              {snapshot?.destinationSummary && (
                <Text style={styles.destinationText}>To: {snapshot.destinationSummary}</Text>
              )}
            </View>
          </Reanimated.View>
        ) : null}

        {/* ─── 4. Escrow narrative ─── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(150)}>
          {(() => {
            const isHeld = normalised === 'paid' || normalised === 'shipped' || normalised === 'in transit' || normalised === 'out for delivery';
            if (!isHeld) return null;
            const shippedAt = order.shippedAt ? new Date(order.shippedAt).getTime() : null;
            const autoReleaseMs = 14 * 24 * 60 * 60 * 1000;
            const releaseTime = shippedAt ? shippedAt + autoReleaseMs : null;
            const now = Date.now();
            const daysLeft = releaseTime ? Math.ceil((releaseTime - now) / (24 * 60 * 60 * 1000)) : null;
            return (
              <View style={styles.escrowBanner}>
                <Ionicons name="lock-closed" size={14} color={colors.success} />
                <View style={styles.escrowTextWrap}>
                  <Text style={styles.escrowTitle}>Funds held in escrow</Text>
                  <Text style={styles.escrowSub}>
                    {normalised === 'paid'
                      ? 'Buyer\'s payment is safely held. Dispatch your item to start the release countdown.'
                      : 'Buyer\'s payment is held until they confirm receipt.'}
                  </Text>
                  {daysLeft != null && daysLeft > 0 && (
                    <Text style={styles.escrowCountdown}>
                      Auto-releases to you in {daysLeft} day{daysLeft === 1 ? '' : 's'} if the buyer doesn't act
                    </Text>
                  )}
                </View>
              </View>
            );
          })()}
        </Reanimated.View>

        <View style={styles.sectionDivider} />

        {/* ─── 5. Integrated shipping: label / QR / drop-off ─── */}
        {isIntegrated && canDispatch && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(180)}>
            <Text style={styles.sectionLabel}>Dispatch steps</Text>

            {/* Step 1: Get label */}
            <View style={styles.stepRow}>
              <View style={[styles.stepNumber, generatedLabelUrl && styles.stepNumberDone]}>
                <Text style={[styles.stepNumberText, generatedLabelUrl && styles.stepNumberTextDone]}>
                  {generatedLabelUrl ? '✓' : '1'}
                </Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>
                  {generatedLabelUrl ? 'Shipping label ready' : 'Get your shipping label'}
                </Text>
                <Text style={styles.stepSub}>
                  {generatedLabelUrl
                    ? 'Show the QR code at drop-off or print the label.'
                    : 'Generate a pre-paid label for the buyer-selected service.'}
                </Text>
              </View>
            </View>

            {!generatedLabelUrl && (
              <Pressable
                style={[styles.primaryStepBtn, isGeneratingLabel && styles.primaryStepBtnDisabled]}
                onPress={handleGenerateLabel}
                disabled={isGeneratingLabel}
                accessibilityRole="button"
                accessibilityLabel="Generate shipping label"
              >
                {isGeneratingLabel ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <>
                    <Ionicons name="document-text-outline" size={18} color={colors.brand} />
                    <Text style={styles.primaryStepBtnText}>Get shipping label</Text>
                  </>
                )}
              </Pressable>
            )}

            {labelError && !generatedLabelUrl && (
              <View style={styles.labelErrorBanner}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
                <Text style={styles.labelErrorText}>{labelError}</Text>
              </View>
            )}

            {/* Step 2: Drop-off */}
            {generatedLabelUrl && (
              <>
                <View style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>2</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Drop off the parcel</Text>
                    <Text style={styles.stepSub}>
                      Take the parcel to a {serviceName ?? 'carrier'} drop-off point. Show the QR code or attach the printed label.
                    </Text>
                  </View>
                </View>

                <View style={styles.secondaryActions}>
                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={handleShowQR}
                    accessibilityRole="button"
                    accessibilityLabel="Show drop-off QR code"
                  >
                    <Ionicons name="qr-code-outline" size={18} color={colors.brand} />
                    <Text style={styles.secondaryBtnText}>Show QR code</Text>
                  </Pressable>

                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={handlePrintLabel}
                    accessibilityRole="button"
                    accessibilityLabel="Print shipping label"
                  >
                    <Ionicons name="print-outline" size={18} color={colors.textPrimary} />
                    <Text style={styles.secondaryBtnTextDark}>Print label</Text>
                  </Pressable>

                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={handleFindDropOff}
                    accessibilityRole="button"
                    accessibilityLabel="Find nearest drop-off point"
                  >
                    <Ionicons name="location-outline" size={18} color={colors.textPrimary} />
                    <Text style={styles.secondaryBtnTextDark}>Find drop-off</Text>
                  </Pressable>

                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={handleMessageBuyer}
                    accessibilityRole="button"
                    accessibilityLabel="Message the buyer"
                  >
                    <Ionicons name="chatbubble-outline" size={18} color={colors.textPrimary} />
                    <Text style={styles.secondaryBtnTextDark}>Message buyer</Text>
                  </Pressable>
                </View>

                <Text style={styles.autoScanHint}>
                  The carrier's first scan will automatically update the order to "in transit". You don't need to mark it shipped manually.
                </Text>
              </>
            )}
          </Reanimated.View>
        )}

        {/* ─── 6. Manual shipping: tracking input ─── */}
        {isManualMode && canDispatch && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(180)}>
            <Text style={styles.sectionLabel}>Arrange shipping</Text>
            <Text style={styles.manualIntro}>
              The buyer paid for tracked shipping. Arrange a tracked service, enter the details below, then confirm dispatch.
            </Text>

            <Text style={styles.inputLabel}>Carrier</Text>
            <Pressable
              style={styles.carrierSelector}
              onPress={() => { haptics.tap(); setShowCarrierDropdown(!showCarrierDropdown); }}
              accessibilityRole="button"
              accessibilityLabel="Select carrier"
            >
              <Text style={[styles.carrierSelectorText, !shippingProvider && styles.placeholderText]}>
                {shippingProvider || 'Select carrier'}
              </Text>
              <Ionicons name={showCarrierDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            </Pressable>

            {showCarrierDropdown && (
              <View style={styles.carrierDropdown}>
                {MANUAL_CARRIERS.map((carrier) => (
                  <Pressable
                    key={carrier}
                    style={styles.carrierOption}
                    onPress={() => {
                      haptics.selection();
                      setShippingProvider(carrier);
                      setShowCarrierDropdown(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${carrier}`}
                  >
                    <Text style={[
                      styles.carrierOptionText,
                      shippingProvider === carrier && styles.carrierOptionTextActive,
                    ]}>
                      {carrier}
                    </Text>
                    {shippingProvider === carrier && (
                      <Ionicons name="checkmark" size={16} color={colors.brand} />
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            <Text style={styles.inputLabel}>Tracking number</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Enter tracking number"
              placeholderTextColor={colors.textMuted}
              value={trackingNumber}
              onChangeText={setTrackingNumber}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Tracking number"
            />

            <Text style={styles.hintText}>
              A valid tracking number is required to confirm dispatch. The buyer will receive it automatically.
            </Text>
          </Reanimated.View>
        )}

        {/* ─── 7. Cannot dispatch ─── */}
        {!canDispatch && (
          <View style={styles.warningBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={styles.warningText}>
              This order cannot be dispatched from its current status ({statusLabel}).
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ─── Footer: confirm dispatch ─── */}
      {canDispatch && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Space.md }]}>
          {isIntegrated ? (
            <Pressable
              style={[styles.dispatchBtn, isDispatching && styles.dispatchBtnDisabled]}
              onPress={() => {
                if (!generatedLabelUrl) {
                  // No label yet — prompt to generate first
                  Alert.alert(
                    'Generate a label first',
                    'You need a shipping label before confirming dispatch. Tap "Get shipping label" above.',
                    [{ text: 'OK' }]
                  );
                  return;
                }
                Alert.alert(
                  'Confirm dispatch?',
                  'The carrier scan will update tracking automatically. The buyer will be notified that their item is on the way.',
                  [
                    { text: 'Not yet', style: 'cancel' },
                    { text: 'Confirm dispatch', style: 'default', onPress: handleIntegratedDispatch },
                  ]
                );
              }}
              disabled={isDispatching}
              accessibilityRole="button"
              accessibilityLabel="Confirm dispatch"
            >
              {isDispatching ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={styles.dispatchBtnText}>
                  {generatedLabelUrl ? 'Confirm dispatch' : 'Get label to dispatch'}
                </Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={[styles.dispatchBtn, isDispatching && styles.dispatchBtnDisabled]}
              onPress={() => {
                Alert.alert(
                  'Confirm dispatch?',
                  trackingNumber.trim()
                    ? `The order will be dispatched with ${shippingProvider} tracking number ${trackingNumber.trim()}. The buyer will be notified.`
                    : 'Enter a tracking number and carrier to confirm dispatch.',
                  [
                    { text: 'Not yet', style: 'cancel' },
                    ...(trackingNumber.trim() && shippingProvider.trim()
                      ? [{ text: 'Confirm dispatch', style: 'default' as const, onPress: handleManualDispatch }]
                      : []),
                  ]
                );
              }}
              disabled={isDispatching}
              accessibilityRole="button"
              accessibilityLabel="Add tracking and confirm dispatch"
            >
              {isDispatching ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={styles.dispatchBtnText}>Add tracking & confirm dispatch</Text>
              )}
            </Pressable>
          )}
        </View>
      )}
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
    },
    // ─── Deadline header ───
    deadlineHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
      marginBottom: Space.md,
    },
    deadlineIcon: {
      width: Space.xl + Space.sm,
      height: Space.xl + Space.sm,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deadlineText: {
      flex: 1,
      gap: 2,
    },
    deadlineEyebrow: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.textMuted,
      letterSpacing: LetterSpacing.caps,
      textTransform: 'uppercase',
    },
    deadlineDate: {
      fontSize: Type.bodyLarge.size,
      fontFamily: Typography.family.bold,
    },
    deadlineSub: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      lineHeight: Type.caption.size + 4,
    },
    // ─── Item row ───
    itemRow: {
      flexDirection: 'row',
      gap: Space.md,
      paddingVertical: Space.sm,
    },
    itemImage: {
      width: Space.xl * 2,
      height: Space.xxl + Space.xl,
      borderRadius: Radius.sm,
    },
    itemImagePlaceholder: {
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemInfo: {
      flex: 1,
      gap: Space.xs / 2,
      justifyContent: 'center',
    },
    itemTitle: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      lineHeight: Type.bodyEmphasis.size + 5,
    },
    itemMeta: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
    },
    itemPrice: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      marginTop: 2,
    },
    // ─── Service card ───
    serviceCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: Space.md,
      marginBottom: Space.sm,
    },
    serviceHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginBottom: Space.xs,
    },
    serviceEyebrow: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.textMuted,
      letterSpacing: LetterSpacing.caps,
      textTransform: 'uppercase',
    },
    serviceName: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      marginBottom: Space.xs,
    },
    serviceMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
    },
    serviceMetaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs / 2,
    },
    serviceMetaText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
    },
    destinationText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: Space.xs,
    },
    // ─── Escrow ───
    escrowBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs + 2,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      borderRadius: Radius.lg,
      backgroundColor: `${colors.success}08`,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${colors.success}25`,
      marginBottom: Space.sm,
    },
    escrowTextWrap: {
      flex: 1,
      gap: Space.xs / 2,
    },
    escrowTitle: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    escrowSub: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      lineHeight: Type.caption.size + 4,
    },
    escrowCountdown: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
      marginTop: Space.xs / 2,
    },
    // ─── Sections ───
    sectionDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: Space.sm,
    },
    sectionLabel: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.semibold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: LetterSpacing.caps,
      marginBottom: Space.sm,
    },
    // ─── Steps (integrated) ───
    stepRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      marginBottom: Space.sm,
    },
    stepNumber: {
      width: Space.lg + 4,
      height: Space.lg + 4,
      borderRadius: Radius.full,
      backgroundColor: `${colors.brand}15`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNumberDone: {
      backgroundColor: `${colors.success}20`,
    },
    stepNumberText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.bold,
      color: colors.brand,
    },
    stepNumberTextDone: {
      color: colors.success,
    },
    stepContent: {
      flex: 1,
      gap: 2,
    },
    stepTitle: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    stepSub: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      lineHeight: Type.caption.size + 4,
    },
    primaryStepBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm + 2,
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
      borderColor: colors.brand,
      backgroundColor: `${colors.brand}08`,
      marginBottom: Space.sm,
    },
    primaryStepBtnDisabled: {
      opacity: 0.6,
    },
    primaryStepBtnText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.brand,
    },
    labelErrorBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs,
      padding: Space.sm,
      borderRadius: Radius.md,
      backgroundColor: `${colors.danger}08`,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${colors.danger}20`,
      marginBottom: Space.sm,
    },
    labelErrorText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.danger,
      lineHeight: Type.caption.size + 4,
    },
    secondaryActions: {
      gap: Space.xs,
      marginBottom: Space.sm,
    },
    secondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      borderRadius: Radius.lg,
      backgroundColor: colors.surface,
      minHeight: Control.hit,
    },
    secondaryBtnText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.brand,
    },
    secondaryBtnTextDark: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    autoScanHint: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      lineHeight: Type.caption.size + 4,
      marginTop: Space.xs,
    },
    // ─── Manual shipping ───
    manualIntro: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      lineHeight: Type.caption.size + 4,
      marginBottom: Space.sm,
    },
    inputLabel: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
      marginBottom: Space.xs + 2,
      marginTop: Space.sm,
    },
    carrierSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      height: Space.xl + Space.xl - 4,
      borderRadius: Radius.lg,
      backgroundColor: colors.surface,
      minHeight: Space.xl + Space.xl - 4,
    },
    carrierSelectorText: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.regular,
      color: colors.textPrimary,
    },
    placeholderText: {
      color: colors.textMuted,
    },
    carrierDropdown: {
      marginTop: Space.xs,
      borderRadius: Radius.lg,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    carrierOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      minHeight: Control.hit,
    },
    carrierOptionText: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
    },
    carrierOptionTextActive: {
      color: colors.textPrimary,
      fontFamily: Typography.family.semibold,
    },
    textInput: {
      paddingHorizontal: Space.md,
      height: Space.xl + Space.xl - 4,
      borderRadius: Radius.lg,
      backgroundColor: colors.surface,
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.regular,
      color: colors.textPrimary,
      minHeight: Space.xl + Space.xl - 4,
    },
    hintText: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: Space.xs,
      lineHeight: Type.captionElevated.size + 5,
    },
    // ─── Warning ───
    warningBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
      marginTop: Space.md,
      padding: Space.sm,
      borderRadius: Radius.md,
      backgroundColor: colors.surface,
    },
    warningText: {
      flex: 1,
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.regular,
      color: colors.danger,
    },
    // ─── Footer ───
    footer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: Space.md,
      paddingTop: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    dispatchBtn: {
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      backgroundColor: colors.brand,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: Control.hit + Space.sm,
    },
    dispatchBtnDisabled: {
      opacity: 0.6,
    },
    dispatchBtnText: {
      fontSize: Type.bodyLarge.size,
      fontFamily: Typography.family.bold,
      color: colors.textInverse,
    },
  });
}
